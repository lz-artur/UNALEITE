import { BadRequestException } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { FinanceService } from './finance.service';
import { SupabaseService } from '../supabase/supabase.service';

describe('FinanceService listEntries', () => {
  let service: FinanceService;
  let rows: Record<string, any>[];
  let rowLimit: number;
  let includeCount: boolean;
  let fetchMock: jest.Mock;

  const entry = (id: string, overrides: Record<string, unknown> = {}) => ({
    id, entry_type: 'Receber', category: 'Vendas', description: 'Venda',
    amount: 100, status: 'Aberto', due_date: '2026-09-30T00:00:00.000Z',
    financial_entry_receipts: [], financial_entry_items: [], ...overrides,
  });

  beforeEach(() => {
    rows = [];
    rowLimit = 1000;
    includeCount = true;
    // Exercise the actual Supabase client against a capped, read-only HTTP
    // response, including database filtering before offset/limit are applied.
    fetchMock = jest.fn(async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      let matching = rows.filter((row) => {
        for (const [column, filter] of url.searchParams) {
          if (['select', 'order', 'offset', 'limit'].includes(column)) continue;
          const [operator, ...parts] = filter.split('.');
          const value = parts.join('.');
          if (operator === 'eq' && String(row[column]) !== value) return false;
          if (operator === 'gte' && new Date(row[column]) < new Date(value)) return false;
          if (operator === 'lte' && new Date(row[column]) > new Date(value)) return false;
        }
        return true;
      });
      const order = (url.searchParams.get('order') ?? '').split(',').filter(Boolean);
      matching = [...matching].sort((a, b) => {
        for (const rule of order) {
          const [column, direction] = rule.split('.');
          const comparison = String(a[column]).localeCompare(String(b[column]));
          if (comparison) return direction === 'desc' ? -comparison : comparison;
        }
        return 0;
      });
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Math.min(Number(url.searchParams.get('limit') ?? rowLimit), rowLimit);
      const page = matching.slice(offset, offset + limit);
      return new Response(JSON.stringify(page), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Range': `${page.length ? `${offset}-${offset + page.length - 1}` : '*'}/${includeCount ? matching.length : '*'}`,
        },
      });
    });
    const admin = createClient('https://finance-test.supabase.co', 'test-key', {
      global: { fetch: fetchMock },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    service = new FinanceService({ admin } as SupabaseService);
  });

  it('returns all 1054 entries, including a sale beyond the first 1000 rows', async () => {
    rows = Array.from({ length: 1054 }, (_, index) => entry(String(index).padStart(4, '0')));
    rows[1053].description = 'Venda VEN-2026-1790679817842 - DUDE';
    rows[1053].amount = 5759.05;

    const result = await service.listEntries();

    expect(result).toHaveLength(1054);
    expect(new Set(result.map((row) => row.id)).size).toBe(1054);
    expect(result).toContainEqual(expect.objectContaining({
      description: 'Venda VEN-2026-1790679817842 - DUDE', amount: 5759.05,
    }));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const firstUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(firstUrl.searchParams.get('order')).toBe('category.asc,description.asc,id.asc');
  });

  it('filters in the database so unrelated entries cannot hide September receivables', async () => {
    rows = Array.from({ length: 1054 }, (_, index) => entry(`expense-${index}`, {
      entry_type: 'Pagar', category: 'Despesas',
    }));
    rows.push(
      entry('target', { description: 'Venda VEN-2026-1790679817842 - DUDE', producer_id: 'producer-1' }),
      entry('last-day', { due_date: '2026-09-30T23:59:59.999Z', producer_id: 'producer-1' }),
      entry('previous-month', { due_date: '2026-08-31T23:59:59.999Z', producer_id: 'producer-1' }),
      entry('next-month', { due_date: '2026-10-01T00:00:00.000Z', producer_id: 'producer-1' }),
      entry('other-category', { category: 'Outras receitas', producer_id: 'producer-1' }),
      entry('other-producer', { producer_id: 'producer-2' }),
    );

    const result = await service.listEntries({
      type: 'Receber', startDate: '2026-09-01', endDate: '2026-09-30',
      category: 'Vendas', producerId: 'producer-1',
    });

    expect(result.map((row) => row.id)).toEqual(['last-day', 'target']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('continues when the configured API cap returns less than a requested page', async () => {
    rowLimit = 100;
    rows = Array.from({ length: 120 }, (_, index) => entry(String(index).padStart(4, '0')));

    const result = await service.listEntries();

    expect(result).toHaveLength(120);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get('offset')).toBe('100');
  });

  it('continues until an empty page when no total count is returned', async () => {
    includeCount = false;
    rowLimit = 100;
    rows = Array.from({ length: 120 }, (_, index) => entry(String(index).padStart(4, '0')));

    expect(await service.listEntries()).toHaveLength(120);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('filters the calculated status after loading receipts', async () => {
    rows = [
      entry('paid', { financial_entry_receipts: [{ amount: 100, payment_date: '2026-09-30' }] }),
      entry('partial', { financial_entry_receipts: [{ amount: 40, payment_date: '2026-09-30' }] }),
      entry('overdue', { due_date: '2020-01-01' }),
    ];

    expect(await service.listEntries({ status: 'Pago' })).toEqual([
      expect.objectContaining({ id: 'paid', received_amount: 100, outstanding_amount: 0 }),
    ]);
    expect(await service.listEntries({ status: 'Vencido' })).toEqual([
      expect.objectContaining({ id: 'overdue', outstanding_amount: 100 }),
    ]);
    for (const [input] of fetchMock.mock.calls) {
      expect(new URL(String(input)).searchParams.has('status')).toBe(false);
    }
  });

  it('rejects a later-page failure instead of returning an incomplete list', async () => {
    rows = Array.from({ length: 501 }, (_, index) => entry(String(index)));
    fetchMock.mockImplementationOnce(fetchMock.getMockImplementation()!).mockImplementationOnce(async () => (
      new Response(JSON.stringify({ message: 'Falha ao consultar a segunda página' }), { status: 400 })
    ));

    await expect(service.listEntries()).rejects.toThrow('Falha ao consultar a segunda página');
  });

  it('returns an empty list when no entries match', async () => {
    expect(await service.listEntries({ type: 'Receber' })).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid filter dates before making a request', async () => {
    await expect(service.listEntries({ startDate: 'not-a-date' })).rejects.toThrow(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
