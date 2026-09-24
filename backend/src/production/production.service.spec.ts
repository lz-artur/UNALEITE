import { ProductionService } from './production.service';
import { SupabaseService } from '../supabase/supabase.service';
import { DomainRulesService } from '../common/services/domain-rules.service';

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

  describe('milk reservations', () => {
    beforeEach(() => {
      supabaseServiceMock.admin.rpc = jest.fn();
    });

    it('creates the OP through the atomic milk-reservation RPC', async () => {
      jest.spyOn(service as any, 'getById')
        .mockResolvedValueOnce({
          id: 'milk-1', status: 'Aprovado', available_volume_liters: 1000,
          cost_per_liter: 2.5, latest_analysis_id: null,
        })
        .mockResolvedValueOnce({ id: 'product-1', active: true, theoretical_yield: 8 });
      jest.spyOn(service as any, 'getActiveProductSpec').mockResolvedValue(null);
      domainRulesServiceMock.calculateExpectedYield.mockReturnValue(125);
      domainRulesServiceMock.calculateFatAdjustment.mockReturnValue(0);
      supabaseServiceMock.admin.rpc.mockResolvedValue({
        data: { order: { id: 'order-1', status: 'Em Andamento' } },
        error: null,
      });

      const result = await service.createOrder({
        milkLotId: 'milk-1', productId: 'product-1', litersToUse: 100,
      }, { id: 'user-1', email: 'operador@una.com', claims: {} });

      expect(result.order).toEqual({ id: 'order-1', status: 'Em Andamento' });
      expect(supabaseServiceMock.admin.rpc).toHaveBeenCalledWith(
        'create_production_order_with_milk_reservation',
        expect.objectContaining({
          p_milk_lot_id: 'milk-1', p_product_id: 'product-1', p_liters: 100,
          p_unit_cost: 2.5, p_actor_id: 'user-1', p_actor_name: 'operador@una.com',
        }),
      );
    });

    it('updates an in-progress OP reservation through the atomic RPC', async () => {
      jest.spyOn(service as any, 'getById')
        .mockResolvedValueOnce({
          id: 'order-1', status: 'Em Andamento', milk_lot_id: 'milk-1',
          liters_planned: 100, product_id: 'product-1',
        })
        .mockResolvedValueOnce({ id: 'product-1', theoretical_yield: 8 });
      domainRulesServiceMock.calculateExpectedYield.mockReturnValue(150);
      supabaseServiceMock.admin.rpc.mockResolvedValue({ data: { order: { id: 'order-1' } }, error: null });
      supabaseServiceMock.admin.from.mockImplementation(() => ({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: { id: 'order-1' }, error: null }) }),
          }),
        }),
      }));

      await service.updateOrder('order-1', { litersToUse: 120 }, { id: 'user-1', email: 'operador@una.com', claims: {} });

      expect(supabaseServiceMock.admin.rpc).toHaveBeenCalledWith(
        'update_production_order_milk_reservation',
        expect.objectContaining({ p_order_id: 'order-1', p_new_milk_lot_id: 'milk-1', p_new_liters: 120 }),
      );
    });

    it('cancels through the reservation RPC instead of deleting the OP', async () => {
      supabaseServiceMock.admin.rpc.mockResolvedValue({
        data: { order: { id: 'order-1', status: 'Cancelada' } }, error: null,
      });

      const result = await service.cancelOrder('order-1', 'Produção interrompida', {
        id: 'user-1', email: 'operador@una.com', claims: {},
      });

      expect(result).toEqual({ success: true, order: { id: 'order-1', status: 'Cancelada' } });
      expect(supabaseServiceMock.admin.rpc).toHaveBeenCalledWith(
        'cancel_production_order_with_reservations',
        expect.objectContaining({ p_order_id: 'order-1', p_reason: 'Produção interrompida' }),
      );
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

    it('uses only the returned balance when the source is Devolucao', async () => {
      let chain: any;
      const order = jest.fn()
        .mockImplementationOnce(() => chain)
        .mockImplementationOnce(() => chain)
        .mockResolvedValueOnce({
          data: [
            { id: 'returned-oldest', available_quantity: 500, returned_quantity: 12 },
            { id: 'returned-next', available_quantity: 300, returned_quantity: 20 },
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
        { finishedProductId: 'cream', source: 'Devolucao', quantity: 25 },
      ]);

      expect(chain.gt).toHaveBeenCalledWith('returned_quantity', 0);
      expect(consumptions).toEqual([
        { finishedProductLotId: 'returned-oldest', source: 'Devolucao', quantity: 12 },
        { finishedProductLotId: 'returned-next', source: 'Devolucao', quantity: 13 },
      ]);
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
