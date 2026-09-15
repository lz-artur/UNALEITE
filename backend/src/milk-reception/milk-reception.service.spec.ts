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

  describe('createReception', () => {
    it('should create a payable entry with the milk type financial defaults', async () => {
      const insertFinancialEntry = jest.fn().mockResolvedValue({ error: null });
      const activeRecord = { data: { id: 'active-id', active: true }, error: null };

      supabaseServiceMock.admin.from.mockImplementation((table: string) => {
        if (['producers', 'routes', 'transporters'].includes(table)) {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue(activeRecord) }),
            }),
          };
        }

        if (table === 'milk_receptions') {
          return {
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({ data: { id: 'reception-1' }, error: null }),
              }),
            }),
          };
        }

        if (table === 'milk_lots') {
          return {
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: {
                    id: 'lot-1', code: 'LT-2026-1', producer_id: 'producer-1',
                    milk_type_id: 'milk-type-1', total_value: 450, received_at: '2026-09-15T12:00:00.000Z',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === 'milk_types') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: {
                    accounting_category_id: 'category-1', accounting_subcategory_id: 'subcategory-1',
                    cost_center_id: 'cost-center-1', accounting_categories: { name: 'Matéria Prima' },
                  },
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === 'financial_entries') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) }),
              }),
            }),
            insert: insertFinancialEntry,
          };
        }

        throw new Error(`Unexpected table ${table}`);
      });

      await service.createReception({
        producerId: 'producer-1', routeId: 'route-1', transporterId: 'transporter-1',
        milkTypeId: 'milk-type-1', volumeLiters: 150, temperatura: 4,
        pricePerLiter: 3, receivedAt: '2026-09-15T12:00:00.000Z',
      });

      expect(insertFinancialEntry).toHaveBeenCalledWith(expect.objectContaining({
        entry_type: 'Pagar', amount: 450, producer_id: 'producer-1',
        category: 'Matéria Prima', accounting_category_id: 'category-1',
        accounting_subcategory_id: 'subcategory-1', cost_center_id: 'cost-center-1',
        reference_table: 'milk_lots', reference_id: 'lot-1',
      }));
    });
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
      expect(deleteMock).toHaveBeenCalledTimes(3); // block events, lot, reception
      expect(supabaseServiceMock.admin.from).toHaveBeenCalledWith('financial_entries');
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
