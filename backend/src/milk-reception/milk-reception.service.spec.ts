import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MilkReceptionService } from './milk-reception.service';
import { SupabaseService } from '../supabase/supabase.service';

describe('MilkReceptionService', () => {
  let service: MilkReceptionService;
  let supabaseServiceMock: any;

  beforeEach(() => {
    supabaseServiceMock = {
      admin: {
        from: jest.fn(),
      },
    };

    service = new MilkReceptionService(supabaseServiceMock as SupabaseService);
  });

  describe('deleteReception', () => {
    let selectMock: jest.Mock;
    let eqMock: jest.Mock;
    let maybeSingleMock: jest.Mock;
    let deleteMock: jest.Mock;

    beforeEach(() => {
      maybeSingleMock = jest.fn();
      eqMock = jest.fn().mockReturnValue({ maybeSingle: maybeSingleMock, delete: jest.fn() });
      selectMock = jest.fn().mockReturnValue({ eq: eqMock });
      deleteMock = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });

      supabaseServiceMock.admin.from.mockImplementation((table: string) => {
        const queryBuilder = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn(),
          delete: jest.fn().mockReturnThis(),
        };

        if (table === 'milk_lots') {
          queryBuilder.select = selectMock;
          queryBuilder.delete = deleteMock;
        } else if (table === 'milk_lot_analyses') {
          queryBuilder.select = jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ count: 0, error: null }),
          });
        } else if (table === 'production_orders') {
          queryBuilder.select = jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ count: 0, error: null }),
          });
        } else if (table === 'lot_block_events') {
          queryBuilder.delete = deleteMock;
        } else if (table === 'milk_receptions') {
          queryBuilder.delete = deleteMock;
        }

        return queryBuilder;
      });
    });

    it('should delete a reception successfully', async () => {
      maybeSingleMock.mockResolvedValue({
        data: {
          id: 'lot-1',
          milk_reception_id: 'rec-1',
          volume_liters: 1000,
          available_volume_liters: 1000,
        },
        error: null,
      });

      const result = await service.deleteReception('lot-1');
      expect(result).toEqual({ success: true });
      expect(deleteMock).toHaveBeenCalledTimes(3); // lot_block_events, milk_lots, milk_receptions
    });

    it('should throw NotFoundException if lot does not exist', async () => {
      maybeSingleMock.mockResolvedValue({ data: null, error: null });

      await expect(service.deleteReception('lot-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if lot is partially consumed', async () => {
      maybeSingleMock.mockResolvedValue({
        data: {
          id: 'lot-1',
          milk_reception_id: 'rec-1',
          volume_liters: 1000,
          available_volume_liters: 500, // partially consumed
        },
        error: null,
      });

      await expect(service.deleteReception('lot-1')).rejects.toThrow(
        'Não é possível excluir o lote pois ele já foi parcialmente ou totalmente consumido na produção.',
      );
    });

    it('should throw BadRequestException if there are analyses linked', async () => {
      maybeSingleMock.mockResolvedValue({
        data: {
          id: 'lot-1',
          milk_reception_id: 'rec-1',
          volume_liters: 1000,
          available_volume_liters: 1000,
        },
        error: null,
      });

      supabaseServiceMock.admin.from.mockImplementation((table: string) => {
        if (table === 'milk_lot_analyses') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ count: 1, error: null }),
            }),
          };
        }
        if (table === 'production_orders') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ count: 0, error: null }),
            }),
          };
        }
        if (table === 'milk_lots') {
           return { select: selectMock };
        }
        return { delete: deleteMock };
      });

      await expect(service.deleteReception('lot-1')).rejects.toThrow(
        'Não é possível excluir o lote pois existem análises de qualidade vinculadas a ele.',
      );
    });

    it('should throw BadRequestException if there are production orders linked', async () => {
      maybeSingleMock.mockResolvedValue({
        data: {
          id: 'lot-1',
          milk_reception_id: 'rec-1',
          volume_liters: 1000,
          available_volume_liters: 1000,
        },
        error: null,
      });

      supabaseServiceMock.admin.from.mockImplementation((table: string) => {
        if (table === 'production_orders') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ count: 1, error: null }),
            }),
          };
        }
        if (table === 'milk_lot_analyses') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ count: 0, error: null }),
            }),
          };
        }
        if (table === 'milk_lots') {
           return { select: selectMock };
        }
        return { delete: deleteMock };
      });

      await expect(service.deleteReception('lot-1')).rejects.toThrow(
        'Não é possível excluir o lote pois ele está vinculado a uma ordem de produção.',
      );
    });
  });
});
