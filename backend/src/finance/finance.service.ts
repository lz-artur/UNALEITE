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

  async updateEntry(id: string, payload: Record<string, any>, user?: AuthenticatedUser) {
    const { data, error } = await this.supabaseService.admin
      .from('financial_entries')
      .update({
        ...payload,
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
