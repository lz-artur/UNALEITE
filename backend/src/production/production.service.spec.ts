import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProductionService } from './production.service';
import { SupabaseService } from '../supabase/supabase.service';
import { DomainRulesService } from '../common/services/domain-rules.service';
import { MILK_LOT_STATUS, SUPPLY_LOT_STATUS } from '../common/constants/domain';

describe('ProductionService', () => {
  let service: ProductionService;
  let supabaseServiceMock: any;
  let domainRulesServiceMock: any;

  beforeEach(() => {
    supabaseServiceMock = {
      admin: {
        from: jest.fn(),
      },
    };
    domainRulesServiceMock = {
      calculateExpectedYield: jest.fn(),
      calculateFatAdjustment: jest.fn(),
    };

    service = new ProductionService(
      supabaseServiceMock as SupabaseService,
      domainRulesServiceMock as DomainRulesService,
    );
  });

  describe('deleteOrder', () => {
    let selectMock: jest.Mock;
    let updateMock: jest.Mock;
    let deleteMock: jest.Mock;

    beforeEach(() => {
      selectMock = jest.fn();
      updateMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });
      const eqMock2 = jest.fn().mockResolvedValue({ error: null });
      const eqMock1 = jest.fn().mockReturnValue(Object.assign(Promise.resolve({ error: null }), {
        eq: eqMock2
      }));
      deleteMock = jest.fn().mockReturnValue({
        eq: eqMock1
      });

      supabaseServiceMock.admin.from.mockImplementation((table: string) => {
        return {
          select: selectMock,
          delete: deleteMock,
          update: updateMock,
          insert: jest.fn(),
        };
      });
    });

    it('should delete order and restore lots successfully', async () => {
      selectMock
        .mockReturnValueOnce({ // getById production_orders
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'order-1' }, error: null }),
          }),
        })
        .mockReturnValueOnce({ // finished_product_lots
          eq: jest.fn().mockResolvedValue({
            data: [{ id: 'fp-1', quantity_produced: 100, available_quantity: 100 }],
            error: null,
          }),
        })
        .mockReturnValueOnce({ // production_order_milk_consumptions
          eq: jest.fn().mockResolvedValue({
            data: [{ milk_lot_id: 'ml-1', liters_consumed: 1000 }],
            error: null,
          }),
        })
        .mockReturnValueOnce({ // milk_lots select
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { available_volume_liters: 0, volume_liters: 1000 },
              error: null,
            }),
          }),
        })
        .mockReturnValueOnce({ // production_order_supply_consumptions
          eq: jest.fn().mockResolvedValue({
            data: [{ supply_lot_id: 'sl-1', quantity_consumed: 50 }],
            error: null,
          }),
        })
        .mockReturnValueOnce({ // supply_lots select
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { available_quantity: 0, received_quantity: 50, supply_item_id: 'si-1' },
              error: null,
            }),
          }),
        })
        .mockReturnValueOnce({ // supply_items select
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { current_stock: 0 },
              error: null,
            }),
          }),
        });

      const result = await service.deleteOrder('order-1');
      expect(result).toEqual({ success: true });
      expect(deleteMock).toHaveBeenCalled();
      expect(updateMock).toHaveBeenCalled();
    });

    it('should throw BadRequestException if finished product lot was partially sold', async () => {
      selectMock
        .mockReturnValueOnce({ // getById production_orders
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'order-1' }, error: null }),
          }),
        })
        .mockReturnValueOnce({ // finished_product_lots
          eq: jest.fn().mockResolvedValue({
            data: [{ id: 'fp-1', quantity_produced: 100, available_quantity: 50 }],
            error: null,
          }),
        });

      await expect(service.deleteOrder('order-1')).rejects.toThrow(
        'Não é possível excluir a OP pois os produtos gerados já foram parcialmente ou totalmente vendidos.',
      );
    });
  });
});
