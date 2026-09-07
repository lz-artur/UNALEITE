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
        const chain = {
          select: selectMock,
          delete: deleteMock,
          update: updateMock,
          insert: jest.fn(),
          eq: jest.fn().mockReturnThis(),
          in: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockReturnThis(),
        };
        selectMock.mockReturnValue(chain);
        return chain;
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

  describe('FIFO supply consumption', () => {
    it('splits an aggregated insumo quantity across its oldest lots first', async () => {
      let chain: any;
      const order = jest.fn()
        .mockImplementationOnce(() => chain)
        .mockImplementationOnce(() => chain)
        .mockResolvedValueOnce({
          data: [
            { id: 'lot-oldest', available_quantity: 20.1 },
            { id: 'lot-next', available_quantity: 10 },
          ],
          error: null,
        });
      chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        order,
      };
      supabaseServiceMock.admin.from.mockReturnValue(chain);

      const consumptions = await (service as any).resolveSupplyConsumptions([
        { supplyItemId: 'mix-75', quantity: 25 },
      ]);

      expect(consumptions).toEqual([
        { supplyLotId: 'lot-oldest', quantity: 20.1 },
        { supplyLotId: 'lot-next', quantity: 4.9 },
      ]);
      expect(order).toHaveBeenNthCalledWith(1, 'entry_date', { ascending: true });
    });
  });

  describe('FIFO finished-product consumption', () => {
    it('splits an aggregated finished-product quantity across its oldest produced lots first', async () => {
      let chain: any;
      const order = jest.fn()
        .mockImplementationOnce(() => chain)
        .mockImplementationOnce(() => chain)
        .mockResolvedValueOnce({
          data: [
            { id: 'cream-oldest', available_quantity: 10.3 },
            { id: 'cream-next', available_quantity: 76.6 },
          ],
          error: null,
        });
      chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        order,
      };
      supabaseServiceMock.admin.from.mockReturnValue(chain);

      const consumptions = await (service as any).resolveFinishedProductConsumptions([
        { finishedProductId: 'cream', quantity: 40 },
      ]);

      expect(consumptions).toEqual([
        { finishedProductLotId: 'cream-oldest', quantity: 10.3 },
        { finishedProductLotId: 'cream-next', quantity: 29.7 },
      ]);
      expect(order).toHaveBeenNthCalledWith(1, 'produced_at', { ascending: true });
    });
  });

  describe('adjustOrder', () => {
    let selectMock: jest.Mock;
    let updateMock: jest.Mock;
    let insertMock: jest.Mock;

    beforeEach(() => {
      selectMock = jest.fn();
      updateMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });
      insertMock = jest.fn().mockResolvedValue({ error: null });

      supabaseServiceMock.admin.from.mockImplementation((table: string) => {
        const chain = {
          select: selectMock,
          update: updateMock,
          insert: insertMock,
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockReturnThis(),
        };
        selectMock.mockReturnValue(chain);
        return chain;
      });
    });

    it('should throw if order is not FINISHED', async () => {
      selectMock.mockReturnValueOnce({
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'order-1', status: 'Em Andamento' }, error: null }),
      });

      await expect(service.adjustOrder('order-1', { adjustments: [], reason: 'Maturação', notes: 'Teste' }))
        .rejects.toThrow('Somente Ordens de Produção finalizadas podem ser ajustadas.');
    });

    it('should throw if available quantity becomes negative', async () => {
      selectMock
        .mockReturnValueOnce({
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'order-1', status: 'Finalizada' }, error: null }),
        })
        .mockReturnValueOnce({
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: { id: 'fp-1', quantity_produced: 100, available_quantity: 0 }, error: null }),
        }); // Emulating that everything was already sold

      await expect(service.adjustOrder('order-1', {
        adjustments: [{ finishedProductLotId: 'fp-1', newQuantity: 50 }],
        reason: 'Maturação',
        notes: 'Teste',
      })).rejects.toThrow('A nova quantidade produzida não suporta as movimentações já realizadas no lote. Estoque ficaria negativo.');
    });

    it('should adjust successfully and create stock movement', async () => {
      // Mock getById production_orders
      const orderMock = { id: 'order-1', status: 'Finalizada', product_id: 'prod-1', liters_planned: 1000 };
      // Mock finished_product_lots select
      const fpLotMock = { id: 'fp-1', quantity_produced: 100, available_quantity: 100, product_id: 'prod-1' };
      // Mock adjustment record
      const adjRecordMock = { id: 'adj-1' };

      supabaseServiceMock.admin.from.mockImplementation((table: string) => {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: orderMock, error: null }),
          single: jest.fn().mockImplementation(() => {
            if (table === 'finished_product_lots') return Promise.resolve({ data: fpLotMock, error: null });
            if (table === 'production_order_adjustments') return Promise.resolve({ data: adjRecordMock, error: null });
            return Promise.resolve({ data: null, error: null });
          }),
          update: updateMock,
          insert: insertMock,
        };
      });

      const payload = {
        adjustments: [{ finishedProductLotId: 'fp-1', newQuantity: 80 }],
        reason: 'Maturação',
        notes: 'Secagem do queijo',
      };

      const result = await service.adjustOrder('order-1', payload);
      expect(result).toEqual({ success: true });

      // Verify finished_product_lots update
      expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
        quantity_produced: 80,
        available_quantity: 80,
      }));

      // Verify production_orders update (actual_quantity_produced & yield)
      expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
        actual_quantity_produced: 80,
        actual_yield: Number((1000 / 80).toFixed(3)),
      }));

      // Verify production_order_adjustments insert
      expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
        production_order_id: 'order-1',
        finished_product_lot_id: 'fp-1',
        old_quantity: 100,
        new_quantity: 80,
        reason: 'Maturação',
        notes: 'Secagem do queijo',
      }));

      // Verify stock_movements insert
      expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
        movement_type: 'saida', // 80 - 100 = -20
        lot_type: 'Produto Acabado',
        lot_id: 'fp-1',
        quantity: 20,
        reference_table: 'production_order_adjustments',
        reference_id: 'adj-1',
      }));
    });
  });
});
