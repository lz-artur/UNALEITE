import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { SupabaseService } from '../supabase/supabase.service';
import { ListFinancialEntriesDto } from './dto/list-financial-entries.dto';
import { SettleFinancialEntryDto } from './dto/settle-financial-entry.dto';
import { CreateFinancialReceiptDto } from './dto/create-financial-receipt.dto';

@Injectable()
export class FinanceService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async listEntries(filters: ListFinancialEntriesDto = {}) {
    const { data, error } = await this.supabaseService.admin
      .from('financial_entries')
      .select('*, financial_entry_receipts(*)')
      .order('due_date', { ascending: false });

    if (error) {
      throw new BadRequestException(error.message);
    }

    const normalized = (data ?? []).map(
      (entry) => this.normalizeEntry(entry) as Record<string, unknown>,
    );

    return normalized.filter((entry) => {
      if (filters.type && String(entry.entry_type) !== filters.type) {
        return false;
      }

      if (filters.status && String(entry.computed_status) !== filters.status) {
        return false;
      }

      if (filters.category && String(entry.category) !== filters.category) {
        return false;
      }

      if (filters.producerId && String(entry.producer_id) !== filters.producerId) {
        return false;
      }

      if (filters.startDate && !this.isOnOrAfter(entry.due_date, filters.startDate)) {
        return false;
      }

      if (filters.endDate && !this.isOnOrBefore(entry.due_date, filters.endDate)) {
        return false;
      }

      return true;
    });
  }

  async settleEntry(
    id: string,
    payload: SettleFinancialEntryDto,
    user?: AuthenticatedUser,
  ) {
    const { data: currentEntry, error: currentError } = await this.supabaseService.admin
      .from('financial_entries')
      .select('*, financial_entry_receipts(*)')
      .eq('id', id)
      .maybeSingle();

    if (currentError) {
      throw new BadRequestException(currentError.message);
    }

    if (!currentEntry) {
      throw new NotFoundException('Financial entry not found');
    }

    const currentReceipts = Array.isArray(currentEntry.financial_entry_receipts)
      ? currentEntry.financial_entry_receipts
      : [];
    const receivedAmount = currentReceipts.reduce(
      (sum: number, receipt: Record<string, unknown>) => sum + Number(receipt.amount || 0),
      0,
    );
    const remainingAmount = Number(currentEntry.amount) - receivedAmount;

    if (remainingAmount <= 0) {
      throw new BadRequestException('Este lançamento já está totalmente liquidado.');
    }

    return this.createReceipt(
      id,
      {
        amount: payload.amount ?? remainingAmount,
        paymentDate: payload.paymentDate,
        paymentMethod: payload.paymentMethod || currentEntry.payment_method || 'Não informado',
        bankAccountId: payload.bankAccountId,
        attachmentUrl: payload.attachmentUrl,
        notes: payload.notes,
      },
      user,
    );
  }

  async createReceipt(
    id: string,
    payload: CreateFinancialReceiptDto,
    user?: AuthenticatedUser,
  ) {
    const paymentDate = payload.paymentDate
      ? new Date(payload.paymentDate)
      : new Date();

    if (Number.isNaN(paymentDate.getTime())) {
      throw new BadRequestException('Data de recebimento inválida.');
    }

    const { error } = await this.supabaseService.admin.rpc(
      'register_financial_receipt',
      {
        p_entry_id: id,
        p_amount: payload.amount,
        p_payment_date: paymentDate.toISOString(),
        p_payment_method: payload.paymentMethod,
        p_bank_account_id: payload.bankAccountId ?? null,
        p_attachment_url: payload.attachmentUrl ?? null,
        p_notes: payload.notes ?? null,
        p_created_by: user?.id ?? null,
      },
    );

    if (error) {
      throw new BadRequestException(error.message);
    }

    return this.getEntryWithReceipts(id);
  }

  async deleteReceipt(
    id: string,
    receiptId: string,
    user?: AuthenticatedUser,
  ) {
    const { error } = await this.supabaseService.admin.rpc(
      'delete_financial_receipt',
      {
        p_entry_id: id,
        p_receipt_id: receiptId,
        p_updated_by: user?.id ?? null,
      },
    );

    if (error) {
      throw new BadRequestException(error.message);
    }

    return this.getEntryWithReceipts(id);
  }

  async unsettleEntry(
    id: string,
    user?: AuthenticatedUser,
  ) {
    const { data: currentEntry, error: currentError } = await this.supabaseService.admin
      .from('financial_entries')
      .select('*, financial_entry_receipts(*)')
      .eq('id', id)
      .maybeSingle();

    if (currentError) {
      throw new BadRequestException(currentError.message);
    }

    if (!currentEntry) {
      throw new NotFoundException('Financial entry not found');
    }

    const receipts = Array.isArray(currentEntry.financial_entry_receipts)
      ? currentEntry.financial_entry_receipts
      : [];

    if (receipts.length > 0) {
      for (const receipt of receipts) {
        const { error } = await this.supabaseService.admin.rpc(
          'delete_financial_receipt',
          {
            p_entry_id: id,
            p_receipt_id: receipt.id,
            p_updated_by: user?.id ?? null,
          },
        );
        if (error) {
          throw new BadRequestException(error.message);
        }
      }
      return this.getEntryWithReceipts(id);
    }

    const { data, error } = await this.supabaseService.admin
      .from('financial_entries')
      .update({
        payment_date: null,
        status: 'Aberto',
        updated_by: user?.id ?? null,
      })
      .eq('id', id)
      .select('*, financial_entry_receipts(*)')
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return this.normalizeEntry(data);
  }

  async createEntry(payload: Record<string, any>, user?: AuthenticatedUser) {
    const shouldSettle = payload.status === 'Pago';
    const { data, error } = await this.supabaseService.admin
      .from('financial_entries')
      .insert({
        ...payload,
        status: shouldSettle ? 'Aberto' : payload.status,
        payment_date: shouldSettle ? null : payload.payment_date,
        created_by: user?.id ?? null,
      })
      .select('*')
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (shouldSettle) {
      return this.createReceipt(
        data.id,
        {
          amount: Number(data.amount),
          paymentDate: payload.payment_date,
          paymentMethod: payload.payment_method || 'Não informado',
          bankAccountId: payload.bank_account_id,
          attachmentUrl: payload.attachment_url || payload.attachment_urls?.[0],
        },
        user,
      );
    }

    return this.normalizeEntry(data);
  }

  async createBatchEntries(payloads: Record<string, any>[], user?: AuthenticatedUser) {
    if (!payloads || payloads.length === 0) return [];
    
    const entries = payloads.map((payload) => ({
      ...payload,
      status: payload.status === 'Pago' ? 'Aberto' : payload.status,
      payment_date: payload.status === 'Pago' ? null : payload.payment_date,
      created_by: user?.id ?? null,
    }));

    const { data, error } = await this.supabaseService.admin
      .from('financial_entries')
      .insert(entries)
      .select('*');

    if (error) {
      throw new BadRequestException(error.message);
    }

    return Promise.all((data ?? []).map((entry, index) => {
      const originalPayload = payloads[index];
      if (originalPayload.status !== 'Pago') {
        return this.normalizeEntry(entry);
      }
      return this.createReceipt(
        entry.id,
        {
          amount: Number(entry.amount),
          paymentDate: originalPayload.payment_date,
          paymentMethod: originalPayload.payment_method || 'Não informado',
          bankAccountId: originalPayload.bank_account_id,
          attachmentUrl: originalPayload.attachment_url || originalPayload.attachment_urls?.[0],
        },
        user,
      );
    }));
  }

  async updateEntry(id: string, payload: Record<string, any>, user?: AuthenticatedUser) {
    // Explicitly pick only known database columns and filter out undefined values
    const updateFields: Record<string, any> = {};
    const fieldMap: Record<string, string> = {
      entry_type: 'entry_type',
      description: 'description',
      amount: 'amount',
      due_date: 'due_date',
      payment_date: 'payment_date',
      status: 'status',
      category: 'category',
      supplier_id: 'supplier_id',
      client_id: 'client_id',
      producer_id: 'producer_id',
      cost_center: 'cost_center',
      cost_center_id: 'cost_center_id',
      accounting_category_id: 'accounting_category_id',
      accounting_subcategory: 'accounting_subcategory',
      accounting_subcategory_id: 'accounting_subcategory_id',
      payment_method: 'payment_method',
      payment_type: 'payment_type',
      attachment_url: 'attachment_url',
      attachment_urls: 'attachment_urls',
      installment_group_id: 'installment_group_id',
      installment_number: 'installment_number',
      cost_type: 'cost_type',
    };

    for (const [key, dbColumn] of Object.entries(fieldMap)) {
      if (payload[key] !== undefined) {
        updateFields[dbColumn] = payload[key];
      }
    }

    updateFields.updated_by = user?.id ?? null;

    const { data, error } = await this.supabaseService.admin
      .from('financial_entries')
      .update(updateFields)
      .eq('id', id)
      .select('*, financial_entry_receipts(*)')
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    const normalized = this.normalizeEntry(data);
    if (payload.status === 'Pago' && Number(normalized.outstanding_amount) > 0) {
      return this.createReceipt(
        id,
        {
          amount: Number(normalized.outstanding_amount),
          paymentDate: payload.payment_date,
          paymentMethod: payload.payment_method || data.payment_method || 'Não informado',
          bankAccountId: payload.bank_account_id || data.bank_account_id,
          attachmentUrl: payload.attachment_url || payload.attachment_urls?.[0] || data.attachment_url,
        },
        user,
      );
    }

    return normalized;
  }

  async deleteEntry(id: string) {
    const { data: entry, error: fetchError } = await this.supabaseService.admin
      .from('financial_entries')
      .select('status, financial_entry_receipts(id)')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      throw new BadRequestException(fetchError.message);
    }

    if (!entry) {
      throw new NotFoundException('Lançamento financeiro não encontrado');
    }

    const hasReceipts = Array.isArray(entry.financial_entry_receipts)
      && entry.financial_entry_receipts.length > 0;
    if (entry.status === 'Pago') {
      throw new BadRequestException('Não é possível excluir um lançamento financeiro que já foi pago/liquidado.');
    }
    if (entry.status === 'Parcial' || hasReceipts) {
      throw new BadRequestException('Não é possível excluir um lançamento financeiro que possui recebimentos/pagamentos.');
    }

    const { error } = await this.supabaseService.admin
      .from('financial_entries')
      .delete()
      .eq('id', id);

    if (error) {
      throw new BadRequestException(error.message);
    }

    return { success: true };
  }

  private normalizeEntry(entry: Record<string, unknown>) {
    const dueDate = String(entry.due_date);
    const originalStatus = String(entry.status);
    const receipts: Array<Record<string, unknown> & { amount: number }> = (Array.isArray(entry.financial_entry_receipts)
      ? entry.financial_entry_receipts
      : [])
      .map((receipt: Record<string, unknown>): Record<string, unknown> & { amount: number } => ({
        ...receipt,
        amount: Number(receipt.amount || 0),
      }))
      .sort((a, b) => new Date(String(a.payment_date)).getTime() - new Date(String(b.payment_date)).getTime());
    const receivedAmount = receipts.reduce((sum, receipt) => sum + receipt.amount, 0);
    const totalAmount = Number(entry.amount || 0);
    const outstandingAmount = Math.max(0, totalAmount - receivedAmount);
    const effectiveStatus = receivedAmount >= totalAmount && totalAmount > 0
      ? 'Pago'
      : receivedAmount > 0
        ? 'Parcial'
        : originalStatus === 'Pago'
          ? 'Pago'
          : originalStatus;
    const computedStatus =
      effectiveStatus === 'Aberto' && new Date(dueDate) < new Date()
        ? 'Vencido'
        : effectiveStatus;
    const lastReceipt = receipts[receipts.length - 1];

    return {
      ...entry,
      status: effectiveStatus,
      computed_status: computedStatus,
      financial_entry_receipts: receipts,
      received_amount: receivedAmount,
      outstanding_amount: outstandingAmount,
      last_payment_date: lastReceipt?.payment_date ?? entry.payment_date ?? null,
    };
  }

  private async getEntryWithReceipts(id: string) {
    const { data, error } = await this.supabaseService.admin
      .from('financial_entries')
      .select('*, financial_entry_receipts(*)')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }
    if (!data) {
      throw new NotFoundException('Lançamento financeiro não encontrado');
    }
    return this.normalizeEntry(data);
  }

  private isOnOrAfter(dateValue: unknown, filterValue: string) {
    const date = new Date(String(dateValue));
    const filter = new Date(filterValue);
    return date >= filter;
  }

  private isOnOrBefore(dateValue: unknown, filterValue: string) {
    const date = new Date(String(dateValue));
    const filter = new Date(filterValue);
    filter.setHours(23, 59, 59, 999);
    return date <= filter;
  }
}
