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
    const { data: accounts, error } = await this.supabaseService.admin
      .from('bank_accounts')
      .select('*')
      .order('name');

    if (error) {
      throw new BadRequestException(error.message);
    }

    const movements = await this.getActualMovements();
    const balances = this.sumBalances(movements);

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
    const movements = await this.getActualMovements(id);
    const start = filters.startDate ? new Date(filters.startDate) : null;
    const end = filters.endDate ? new Date(filters.endDate) : null;
    if (end) end.setHours(23, 59, 59, 999);

    return movements
      .filter((movement) => (!start || new Date(movement.effective_date) >= start)
        && (!end || new Date(movement.effective_date) <= end))
      .sort((a, b) => new Date(b.effective_date).getTime() - new Date(a.effective_date).getTime());
  }

  async getFinancialPosition() {
    const { data: accounts, error: accountsError } = await this.supabaseService.admin
      .from('bank_accounts')
      .select('*')
      .order('name');
    if (accountsError) throw new BadRequestException(accountsError.message);

    const movements = await this.getActualMovements();
    const balances = this.sumBalances(movements);
    const { data: entries, error: entriesError } = await this.supabaseService.admin
      .from('financial_entries')
      .select('id, bank_account_id, entry_type, description, amount, due_date, status, financial_entry_receipts(amount)')
      .not('bank_account_id', 'is', null)
      .neq('status', 'Cancelado');
    if (entriesError) throw new BadRequestException(entriesError.message);

    const projected = new Map<string, { inflows: any[]; outflows: any[] }>();
    for (const entry of entries ?? []) {
      // Já liquidado significa movimento do extrato, nunca previsão.
      if (entry.status === 'Pago') continue;
      const receipts = Array.isArray(entry.financial_entry_receipts) ? entry.financial_entry_receipts : [];
      const received = receipts.reduce((total: number, receipt: any) => total + Number(receipt.amount || 0), 0);
      const outstanding = Math.max(0, Number(entry.amount || 0) - received);
      if (outstanding === 0 || !entry.bank_account_id) continue;
      const bucket = projected.get(entry.bank_account_id) ?? { inflows: [], outflows: [] };
      const forecast = {
        financial_entry_id: entry.id,
        description: entry.description,
        due_date: entry.due_date,
        amount: outstanding,
        entry_type: entry.entry_type,
        status: entry.status,
      };
      if (this.isCredit(entry.entry_type)) bucket.inflows.push(forecast);
      else bucket.outflows.push(forecast);
      projected.set(entry.bank_account_id, bucket);
    }

    return (accounts ?? []).map((account) => {
      const forecast = projected.get(account.id) ?? { inflows: [], outflows: [] };
      const expected_inflows = forecast.inflows.reduce((total, entry) => total + entry.amount, 0);
      const expected_outflows = forecast.outflows.reduce((total, entry) => total + entry.amount, 0);
      const current_balance = balances[account.id] || 0;
      return {
        account: { ...account, current_balance },
        current_balance,
        expected_inflows,
        expected_outflows,
        projected_balance: current_balance + expected_inflows - expected_outflows,
        details: { current: movements.filter((movement) => movement.bank_account_id === account.id), inflows: forecast.inflows, outflows: forecast.outflows },
      };
    });
  }

  async createBalanceAdjustment(id: string, payload: Record<string, any>, user?: AuthenticatedUser) {
    const targetBalance = Number(payload.targetBalance);
    const justification = String(payload.justification || '').trim();
    const managerApproval = String(payload.managerApproval || '').trim();
    const effectiveDate = payload.effectiveDate ? new Date(payload.effectiveDate) : new Date();
    if (!Number.isFinite(targetBalance)) throw new BadRequestException('Informe o saldo conferido da conta.');
    if (!justification) throw new BadRequestException('A justificativa do ajuste é obrigatória.');
    if (!managerApproval) throw new BadRequestException('Informe a autorização do gestor responsável.');
    if (Number.isNaN(effectiveDate.getTime())) throw new BadRequestException('Data do ajuste inválida.');

    const account = await this.getAccount(id);
    const actualMovements = await this.getActualMovements(id);
    const balanceBefore = this.sumBalances(actualMovements)[id] || 0;
    const adjustmentAmount = targetBalance - balanceBefore;
    if (Math.abs(adjustmentAmount) < 0.0001) {
      throw new BadRequestException('O saldo informado já corresponde ao saldo contabilizado.');
    }

    const { data: entry, error: entryError } = await this.supabaseService.admin
      .from('financial_entries')
      .insert({
        bank_account_id: id,
        entry_type: adjustmentAmount > 0 ? 'Receber' : 'Pagar',
        description: `Ajuste de saldo — ${justification}`,
        amount: Math.abs(adjustmentAmount),
        due_date: effectiveDate.toISOString(),
        payment_date: effectiveDate.toISOString(),
        payment_method: 'Ajuste de saldo',
        status: 'Pago',
        category: 'Ajuste de Saldo',
        created_by: user?.id ?? null,
      })
      .select('*')
      .single();
    if (entryError) throw new BadRequestException(entryError.message);

    const { error: adjustmentError } = await this.supabaseService.admin
      .from('bank_account_balance_adjustments')
      .insert({
        bank_account_id: id,
        financial_entry_id: entry.id,
        balance_before: balanceBefore,
        target_balance: targetBalance,
        adjustment_amount: adjustmentAmount,
        justification,
        manager_approval: managerApproval,
        effective_date: effectiveDate.toISOString(),
        created_by: user?.id ?? null,
      });
    if (adjustmentError) throw new BadRequestException(adjustmentError.message);

    return { account, entry, balance_before: balanceBefore, current_balance: targetBalance };
  }

  /**
   * Extrato e saldo usam somente eventos efetivados. Um lançamento previsto
   * jamais entra aqui: ele fica exclusivamente na posição financeira.
   */
  private async getActualMovements(bankAccountId?: string) {
    let entriesQuery = this.supabaseService.admin
      .from('financial_entries')
      .select('id, bank_account_id, entry_type, description, amount, due_date, payment_date, status, category, attachment_url, accounting_categories(name), financial_entry_receipts(id)')
      .eq('status', 'Pago')
      .not('bank_account_id', 'is', null);
    if (bankAccountId) entriesQuery = entriesQuery.eq('bank_account_id', bankAccountId);
    const { data: paidEntries, error: entriesError } = await entriesQuery;
    if (entriesError) throw new BadRequestException(entriesError.message);

    let receiptsQuery = this.supabaseService.admin
      .from('financial_entry_receipts')
      .select('id, financial_entry_id, bank_account_id, amount, payment_date, attachment_url, notes, financial_entries(entry_type, description, category, due_date, status, accounting_categories(name))')
      .not('bank_account_id', 'is', null);
    if (bankAccountId) receiptsQuery = receiptsQuery.eq('bank_account_id', bankAccountId);
    const { data: receipts, error: receiptsError } = await receiptsQuery;
    if (receiptsError) throw new BadRequestException(receiptsError.message);

    // Lançamentos criados antes do histórico de baixas (inclui transferências,
    // saldo inicial e ajustes) permanecem como movimentos diretos. Os que já
    // possuem recibo são representados apenas pelos recibos, sem duplicidade.
    const directMovements = (paidEntries ?? [])
      .filter((entry: any) => !Array.isArray(entry.financial_entry_receipts) || entry.financial_entry_receipts.length === 0)
      .map((entry: any) => ({
        id: `entry:${entry.id}`,
        financial_entry_id: entry.id,
        receipt_id: null,
        bank_account_id: entry.bank_account_id,
        entry_type: entry.entry_type,
        description: entry.description,
        amount: Number(entry.amount),
        effective_date: entry.payment_date || entry.due_date,
        category: entry.accounting_categories?.name || entry.category,
        attachment_url: entry.attachment_url,
        status: 'Pago',
        source: 'direct_entry',
      }));
    const receiptMovements = (receipts ?? []).map((receipt: any) => ({
      id: `receipt:${receipt.id}`,
      financial_entry_id: receipt.financial_entry_id,
      receipt_id: receipt.id,
      bank_account_id: receipt.bank_account_id,
      entry_type: receipt.financial_entries?.entry_type,
      description: receipt.financial_entries?.description || 'Baixa financeira',
      amount: Number(receipt.amount),
      effective_date: receipt.payment_date,
      category: receipt.financial_entries?.accounting_categories?.name || receipt.financial_entries?.category,
      attachment_url: receipt.attachment_url,
      notes: receipt.notes,
      status: 'Pago',
      source: 'receipt',
    }));
    return [...directMovements, ...receiptMovements];
  }

  private sumBalances(movements: Array<{ bank_account_id: string; entry_type: string; amount: number }>) {
    return movements.reduce((balances: Record<string, number>, movement) => {
      const accountId = movement.bank_account_id;
      balances[accountId] = balances[accountId] || 0;
      balances[accountId] += this.isCredit(movement.entry_type)
        ? Number(movement.amount)
        : -Number(movement.amount);
      return balances;
    }, {});
  }

  private isCredit(entryType: string) {
    return entryType === 'Receber' || entryType === 'Entrada';
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
