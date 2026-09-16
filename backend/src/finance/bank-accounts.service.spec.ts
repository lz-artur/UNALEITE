import { BankAccountsService } from './bank-accounts.service';
import { SupabaseService } from '../supabase/supabase.service';

describe('BankAccountsService', () => {
  it('shows a legacy receipt in the entry bank account statement', async () => {
    const supabaseServiceMock: any = {
      admin: {
        from: jest.fn((table: string) => {
          if (table === 'financial_entries') {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  not: jest.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            };
          }
          return {
            select: jest.fn().mockResolvedValue({
              data: [
                {
                  id: 'receipt-1',
                  financial_entry_id: 'entry-1',
                  bank_account_id: null,
                  amount: 125,
                  payment_date: '2029-01-10T12:00:00.000Z',
                  financial_entries: {
                    entry_type: 'Receber',
                    description: 'Venda',
                    category: 'Vendas',
                    bank_account_id: 'account-1',
                    accounting_categories: { name: 'Vendas' },
                  },
                },
              ],
              error: null,
            }),
          };
        }),
      },
    };
    const service = new BankAccountsService(supabaseServiceMock as SupabaseService);

    const movements = await (service as any).getActualMovements();

    expect(movements).toEqual([
      expect.objectContaining({
        receipt_id: 'receipt-1',
        bank_account_id: 'account-1',
        amount: 125,
      }),
    ]);
  });
});
