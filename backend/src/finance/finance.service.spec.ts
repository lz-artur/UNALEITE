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

  describe('unsettleEntry', () => {
    let updateMock: jest.Mock;
    let selectMock: jest.Mock;

    beforeEach(() => {
      selectMock = jest.fn();
      updateMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: 'entry-1', status: 'Aberto', payment_date: null, due_date: '2023-01-01' },
              error: null,
            }),
          }),
        }),
      });

      supabaseServiceMock.admin.from.mockImplementation((table: string) => {
        if (table === 'financial_entries') {
          return {
            select: selectMock,
            update: updateMock,
          };
        }
        return {};
      });
    });

    it('should unsettle a financial entry successfully', async () => {
      selectMock.mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({
            data: { id: 'entry-1', status: 'Pago' },
            error: null,
          }),
        }),
      });

      const result = await service.unsettleEntry('entry-1');
      expect((result as any).status).toBe('Aberto');
      expect((result as any).computed_status).toBe('Vencido'); // past date
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'Aberto', payment_date: null }),
      );
    });

    it('should throw NotFoundException if entry does not exist during unsettle', async () => {
      selectMock.mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        }),
      });

      await expect(service.unsettleEntry('entry-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createBatchEntries', () => {
    let insertMock: jest.Mock;

    beforeEach(() => {
      insertMock = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({
          data: [
            { id: '1', due_date: '2029-01-01', status: 'Aberto' },
            { id: '2', due_date: '2029-02-01', status: 'Aberto' },
          ],
          error: null,
        }),
      });

      supabaseServiceMock.admin.from.mockImplementation(() => ({
        insert: insertMock,
      }));
    });

    it('should insert multiple entries successfully', async () => {
      const payloads = [{ valor: 100 }, { valor: 200 }];
      const result = await service.createBatchEntries(payloads);
      
      expect(result).toHaveLength(2);
      expect(insertMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ valor: 100, created_by: null }),
          expect.objectContaining({ valor: 200, created_by: null }),
        ]),
      );
    });

    it('should return empty array if payloads are empty', async () => {
      const result = await service.createBatchEntries([]);
      expect(result).toEqual([]);
      expect(insertMock).not.toHaveBeenCalled();
    });
  });
});
