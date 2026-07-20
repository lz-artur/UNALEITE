import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { SupabaseService } from '../supabase/supabase.service';

describe('FinanceService', () => {
  let service: FinanceService;
  let supabaseServiceMock: any;

  beforeEach(() => {
    supabaseServiceMock = {
      admin: {
        from: jest.fn(),
      },
    };

    service = new FinanceService(supabaseServiceMock as SupabaseService);
  });

  describe('deleteEntry', () => {
    let selectMock: jest.Mock;
    let deleteMock: jest.Mock;

    beforeEach(() => {
      selectMock = jest.fn();
      deleteMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      supabaseServiceMock.admin.from.mockImplementation((table: string) => {
        if (table === 'financial_entries') {
          return {
            select: selectMock,
            delete: deleteMock,
          };
        }
        return {};
      });
    });

    it('should delete a financial entry successfully', async () => {
      selectMock.mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({
            data: { id: 'entry-1', status: 'Aberto' },
            error: null,
          }),
        }),
      });

      const result = await service.deleteEntry('entry-1');
      expect(result).toEqual({ success: true });
      expect(deleteMock).toHaveBeenCalled();
    });

    it('should throw NotFoundException if entry does not exist', async () => {
      selectMock.mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        }),
      });

      await expect(service.deleteEntry('entry-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if entry is paid', async () => {
      selectMock.mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({
            data: { id: 'entry-1', status: 'Pago' },
            error: null,
          }),
        }),
      });

      await expect(service.deleteEntry('entry-1')).rejects.toThrow(
        'Não é possível excluir um lançamento financeiro que já foi pago/liquidado.',
      );
    });
  });
});
