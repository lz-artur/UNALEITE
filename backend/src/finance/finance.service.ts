import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { SupabaseService } from '../supabase/supabase.service';
import { ListFinancialEntriesDto } from './dto/list-financial-entries.dto';
import { SettleFinancialEntryDto } from './dto/settle-financial-entry.dto';

@Injectable()
export class FinanceService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async listEntries(filters: ListFinancialEntriesDto = {}) {
    const { data, error } = await this.supabaseService.admin
      .from('financial_entries')
      .select('*')
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
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (currentError) {
      throw new BadRequestException(currentError.message);
    }

    if (!currentEntry) {
      throw new NotFoundException('Financial entry not found');
    }

    const paymentDate = payload.paymentDate
      ? new Date(payload.paymentDate).toISOString()
      : new Date().toISOString();

    const { data, error } = await this.supabaseService.admin
      .from('financial_entries')
      .update({
        payment_date: paymentDate,
        status: 'Pago',
        attachment_url: payload.attachmentUrl ?? currentEntry.attachment_url,
        updated_by: user?.id ?? null,
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return this.normalizeEntry(data);
  }

  async unsettleEntry(
    id: string,
    user?: AuthenticatedUser,
  ) {
    const { data: currentEntry, error: currentError } = await this.supabaseService.admin
      .from('financial_entries')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (currentError) {
      throw new BadRequestException(currentError.message);
    }

    if (!currentEntry) {
      throw new NotFoundException('Financial entry not found');
    }

    const { data, error } = await this.supabaseService.admin
      .from('financial_entries')
      .update({
        payment_date: null,
        status: 'Aberto',
        updated_by: user?.id ?? null,
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return this.normalizeEntry(data);
  }

  async createEntry(payload: Record<string, any>, user?: AuthenticatedUser) {
    const { data, error } = await this.supabaseService.admin
      .from('financial_entries')
      .insert({
        ...payload,
        created_by: user?.id ?? null,
      })
      .select('*')
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return this.normalizeEntry(data);
  }

  async createBatchEntries(payloads: Record<string, any>[], user?: AuthenticatedUser) {
    if (!payloads || payloads.length === 0) return [];
    
    const entries = payloads.map((payload) => ({
      ...payload,
      created_by: user?.id ?? null,
    }));

    const { data, error } = await this.supabaseService.admin
      .from('financial_entries')
      .insert(entries)
      .select('*');

    if (error) {
      throw new BadRequestException(error.message);
    }

    return (data ?? []).map(entry => this.normalizeEntry(entry));
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
      .select('*')
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return this.normalizeEntry(data);
  }

  async deleteEntry(id: string) {
    const { data: entry, error: fetchError } = await this.supabaseService.admin
      .from('financial_entries')
      .select('status')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      throw new BadRequestException(fetchError.message);
    }

    if (!entry) {
      throw new NotFoundException('Lançamento financeiro não encontrado');
    }

    if (entry.status === 'Pago') {
      throw new BadRequestException('Não é possível excluir um lançamento financeiro que já foi pago/liquidado.');
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
    const computedStatus =
      originalStatus === 'Aberto' && new Date(dueDate) < new Date()
        ? 'Vencido'
        : originalStatus;

    return {
      ...entry,
      computed_status: computedStatus,
    };
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
