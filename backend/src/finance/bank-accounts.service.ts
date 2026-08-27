import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class BankAccountsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async listAccounts() {
    // Busca todas as contas
    const { data: accounts, error } = await this.supabaseService.admin
      .from('bank_accounts')
      .select('*')
      .order('name');

    if (error) {
      throw new BadRequestException(error.message);
    }

    // Calcula saldo usando financial_entries da conta
    // Somar Entradas (status='Pago') e subtrair Saidas (status='Pago')
    const { data: entries, error: entriesError } = await this.supabaseService.admin
      .from('financial_entries')
      .select('bank_account_id, entry_type, amount')
      .eq('status', 'Pago')
      .not('bank_account_id', 'is', null);

    if (entriesError) {
      throw new BadRequestException(entriesError.message);
    }

    const balances = entries?.reduce((acc: Record<string, number>, entry: any) => {
      const { bank_account_id, entry_type, amount } = entry;
      if (!acc[bank_account_id]) acc[bank_account_id] = 0;
      
      const value = Number(amount);
      if (entry_type === 'Receber' || entry_type === 'Entrada') {
        acc[bank_account_id] += value;
      } else if (entry_type === 'Pagar' || entry_type === 'Saída') {
        acc[bank_account_id] -= value;
      }
      return acc;
    }, {});

    return (accounts || []).map((acc) => ({
      ...acc,
      current_balance: balances?.[acc.id] || 0,
    }));
  }

  async getAccount(id: string) {
    const { data, error } = await this.supabaseService.admin
      .from('bank_accounts')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }
    if (!data) {
      throw new NotFoundException('Conta bancária não encontrada');
    }
    return data;
  }

  async createAccount(payload: Record<string, any>, user?: AuthenticatedUser) {
    const { initial_balance, ...accountData } = payload;
    
    // Insere a conta
    const { data, error } = await this.supabaseService.admin
      .from('bank_accounts')
      .insert({
        ...accountData,
        created_by: user?.id ?? null,
      })
      .select('*')
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    // Se tiver saldo inicial, insere uma movimentação de Saldo Inicial
    if (initial_balance && Number(initial_balance) !== 0) {
      const amount = Math.abs(Number(initial_balance));
      const entryType = Number(initial_balance) > 0 ? 'Receber' : 'Pagar';

      const { data: categoryData } = await this.supabaseService.admin
        .from('accounting_categories')
        .select('id')
        .eq('name', 'Saldo Inicial')
        .maybeSingle();

      if (categoryData) {
        await this.supabaseService.admin.from('financial_entries').insert({
          bank_account_id: data.id,
          entry_type: entryType,
          description: 'Saldo Inicial',
          amount: amount,
          due_date: new Date().toISOString(),
          payment_date: new Date().toISOString(),
          status: 'Pago',
          category: 'Saldo Inicial',
          accounting_category_id: categoryData.id,
          created_by: user?.id ?? null,
        });
      }
    }

    return data;
  }

  async updateAccount(id: string, payload: Record<string, any>, user?: AuthenticatedUser) {
    const updateFields: Record<string, any> = { ...payload, updated_by: user?.id ?? null };
    delete updateFields.initial_balance; // não atualizamos saldo inicial via update
    delete updateFields.current_balance;

    const { data, error } = await this.supabaseService.admin
      .from('bank_accounts')
      .update(updateFields)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }
    return data;
  }

  async getAccountStatement(id: string, filters: { startDate?: string; endDate?: string } = {}) {
    let query = this.supabaseService.admin
      .from('financial_entries')
      .select('*, accounting_categories(name)')
      .eq('bank_account_id', id)
      .order('due_date', { ascending: false });

    if (filters.startDate) {
      query = query.gte('due_date', new Date(filters.startDate).toISOString());
    }
    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      endDate.setHours(23, 59, 59, 999);
      query = query.lte('due_date', endDate.toISOString());
    }

    const { data, error } = await query;
    if (error) {
      throw new BadRequestException(error.message);
    }
    return data || [];
  }

  async transferFunds(payload: any, user?: AuthenticatedUser) {
    const { sourceAccountId, destinationAccountId, amount, date, description, attachmentUrl } = payload;
    
    if (sourceAccountId === destinationAccountId) {
      throw new BadRequestException('A conta de origem não pode ser igual a conta de destino.');
    }
    if (!amount || amount <= 0) {
      throw new BadRequestException('O valor da transferência deve ser maior que zero.');
    }

    // Pega a categoria "Transferência entre Contas"
    const { data: categoryData } = await this.supabaseService.admin
      .from('accounting_categories')
      .select('id')
      .eq('name', 'Transferência entre Contas')
      .maybeSingle();

    const categoryId = categoryData?.id;
    const transferDate = date ? new Date(date).toISOString() : new Date().toISOString();

    const debitId = crypto.randomUUID();
    const creditId = crypto.randomUUID();

    const debitEntry = {
      id: debitId,
      bank_account_id: sourceAccountId,
      entry_type: 'Pagar',
      description: description || 'Transferência enviada',
      amount: amount,
      due_date: transferDate,
      payment_date: transferDate,
      status: 'Pago',
      category: 'Transferência entre Contas',
      accounting_category_id: categoryId,
      attachment_url: attachmentUrl,
      created_by: user?.id ?? null,
      reference_table: 'financial_entries',
      reference_id: creditId,
    };

    const creditEntry = {
      id: creditId,
      bank_account_id: destinationAccountId,
      entry_type: 'Receber',
      description: description || 'Transferência recebida',
      amount: amount,
      due_date: transferDate,
      payment_date: transferDate,
      status: 'Pago',
      category: 'Transferência entre Contas',
      accounting_category_id: categoryId,
      attachment_url: attachmentUrl,
      created_by: user?.id ?? null,
      reference_table: 'financial_entries',
      reference_id: debitId,
    };

    // Array insert performs a single transaction in Supabase PostgREST
    const { data, error } = await this.supabaseService.admin
      .from('financial_entries')
      .insert([debitEntry, creditEntry])
      .select('*');

    if (error) {
      throw new BadRequestException('Falha ao realizar transferência: ' + error.message);
    }

    return { success: true, entries: data };
  }
}
