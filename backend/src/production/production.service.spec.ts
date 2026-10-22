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

  describe('editing supply consumptions', () => {
    let existing: any[];
    let available: Record<string, any[]>;

    beforeEach(() => {
      existing = [{
        id: 'consumption-1', supply_lot_id: 'old-lot', quantity_consumed: 10,
        supply_lots: { supply_item_id: 'old-item' },
      }];
      available = { 'old-item': [], 'qa-100': [{ id: 'qa-lot', available_quantity: 725 }] };
      supabaseServiceMock.admin.rpc = jest.fn().mockResolvedValue({ error: null });
      supabaseServiceMock.admin.from.mockImplementation((table: string) => {
        let itemId: string;
        const chain: any = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockImplementation((field: string, value: string) => {
            if (field === 'supply_item_id') itemId = value;
            return chain;
          }),
          in: jest.fn().mockReturnThis(),
          gt: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          then: (resolve: any) => resolve({
            data: table === 'production_order_supply_consumptions' ? existing : (available[itemId] ?? []),
            error: null,
          }),
        };
        return chain;
      });
      jest.spyOn(service as any, 'getById').mockImplementation(async (...args: unknown[]) => ({
        id: args[1], available_quantity: args[1] === 'old-lot' ? 0 : 725, internal_lot_code: args[1],
      }));
    });

    const update = (rows: any[]) => (service as any).updateSupplyConsumptions('order-1', rows);
    const targets = () => supabaseServiceMock.admin.rpc.mock.calls[0][1].p_consumptions;

    it('adds QA 100 without allocating the exhausted existing insumo again', async () => {
      await update([{ supplyItemId: 'old-item', quantity: 10 }, { supplyItemId: 'qa-100', quantity: 247 }]);
      expect(targets()).toEqual([
        { supplyLotId: 'old-lot', quantity: 10 }, { supplyLotId: 'qa-lot', quantity: 247 },
      ]);
      expect(supabaseServiceMock.admin.rpc).toHaveBeenCalledWith(
        'update_production_order_supply_consumptions', expect.objectContaining({
          p_expected_consumptions: [{ supplyLotId: 'old-lot', quantity: 10 }],
        }),
      );
      expect((service as any).getById).not.toHaveBeenCalledWith('supply_lots', 'old-lot');
    });

    it('does not write or create movements when quantities are unchanged', async () => {
      await update([{ supplyItemId: 'old-item', quantity: 10 }]);
      expect(supabaseServiceMock.admin.rpc).not.toHaveBeenCalled();
      expect((service as any).getById).not.toHaveBeenCalled();
    });

    it('retains the historical lots even when FIFO now has an older available lot', async () => {
      available['old-item'] = [{ id: 'other-lot', available_quantity: 8 }];
      await update([{ supplyItemId: 'old-item', quantity: 13 }]);
      expect(targets()).toEqual([
        { supplyLotId: 'old-lot', quantity: 10 }, { supplyLotId: 'other-lot', quantity: 3 },
      ]);
    });

    it('reduces or removes existing consumption without requiring available stock', async () => {
      await update([{ supplyItemId: 'old-item', quantity: 4 }]);
      expect(targets()).toEqual([{ supplyLotId: 'old-lot', quantity: 4 }]);
      supabaseServiceMock.admin.rpc.mockClear();
      await update([]);
      expect(targets()).toEqual([]);
    });

    it('validates only the incremental quantity when increasing an existing insumo', async () => {
      available['old-item'] = [{ id: 'old-lot', available_quantity: 3 }];
      (service as any).getById.mockResolvedValue({ available_quantity: 3 });
      await update([{ supplyItemId: 'old-item', quantity: 13 }]);
      expect(targets()).toEqual([{ supplyLotId: 'old-lot', quantity: 13 }]);
    });

    it('rejects an insufficient addition before writing any stock or consumption', async () => {
      await expect(update([
        { supplyItemId: 'old-item', quantity: 10 }, { supplyItemId: 'qa-100', quantity: 726 },
      ])).rejects.toThrow('saldo disponível suficiente');
      expect(supabaseServiceMock.admin.rpc).not.toHaveBeenCalled();
    });

    it('aggregates repeated item rows rather than allocating the same stock twice', async () => {
      await expect(update([
        { supplyItemId: 'qa-100', quantity: 400 }, { supplyItemId: 'qa-100', quantity: 400 },
      ])).rejects.toThrow('saldo disponível suficiente');
      expect(supabaseServiceMock.admin.rpc).not.toHaveBeenCalled();
    });

    it('normalizes decimal totals when the same lot has multiple historical records', async () => {
      existing = [
        { supply_lot_id: 'old-lot', quantity_consumed: '0.1', supply_lots: { supply_item_id: 'old-item' } },
        { supply_lot_id: 'old-lot', quantity_consumed: '0.2', supply_lots: { supply_item_id: 'old-item' } },
      ];
      await update([{ supplyItemId: 'old-item', quantity: 0.3 }, { supplyItemId: 'qa-100', quantity: 247 }]);
      expect(supabaseServiceMock.admin.rpc.mock.calls[0][1].p_expected_consumptions)
        .toEqual([{ supplyLotId: 'old-lot', quantity: 0.3 }]);
      expect(targets()).toContainEqual({ supplyLotId: 'old-lot', quantity: 0.3 });
    });

    it('supports explicitly selected exhausted lots without consuming them twice', async () => {
      await update([{ supplyLotId: 'old-lot', quantity: 10 }]);
      expect(supabaseServiceMock.admin.rpc).not.toHaveBeenCalled();
    });

    it('propagates a transactional failure, including concurrent changes', async () => {
      supabaseServiceMock.admin.rpc.mockResolvedValue({ error: { message: 'Os insumos desta OP foram alterados.' } });
      await expect(update([{ supplyItemId: 'qa-100', quantity: 247 }])).rejects.toThrow('foram alterados');
    });

    it('preserves unchanged finished-product quantities, sources and pieces on update', async () => {
      (service as any).getById.mockResolvedValue({
        id: 'order-1', status: 'Finalizada', milk_lot_id: 'milk-1', liters_planned: 100,
      });
      const unchangedFP = [{
        finished_product_lot_id: 'returned-lot', quantity_consumed: 71,
        pieces_consumed: 18, consumption_source: 'Devolucao',
      }];
      supabaseServiceMock.admin.from.mockImplementation((table: string) => {
        const chain: any = {
          select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
          update: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: { id: 'order-1' }, error: null }),
          then: (resolve: any) => resolve({ data: unchangedFP, error: null }),
        };
        return chain;
      });
      const resolver = jest.spyOn(service as any, 'resolveFinishedProductConsumptions');
      await service.updateOrder('order-1', { finishedProductConsumptions: [{
        finishedProductLotId: 'returned-lot', source: 'Devolucao', quantity: 71, pieces: 18,
      }] });
      expect(resolver).not.toHaveBeenCalled();
      expect(supabaseServiceMock.admin.from.mock.calls.map(([table]: any[]) => table))
        .toEqual(['production_order_finished_product_consumptions', 'production_orders']);
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

  describe('secondary production orders (sem leite)', () => {
    it('creates a secondary OP without milk reservation when product is Secundario', async () => {
      jest.spyOn(service as any, 'getById').mockImplementation(async (...args: unknown[]) => {
        const [table, id] = args as [string, string];
        if (table === 'finished_products') {
          return {
            id: 'manteiga-id',
            name: 'Manteiga Pote 200g',
            active: true,
            production_type: 'Secundario',
            commercial_presentation: 'Pote 200g',
            package_size: 0.2,
          };
        }
        if (table === 'finished_product_lots') {
          return {
            id: 'creme-lot-1',
            product_id: 'creme-id',
            available_quantity: 100,
            lot_code: 'CP-2026-1',
          };
        }
        return { id, active: true };
      });

      const orderInsertMock = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: 'sec-order-1', order_number: 'OP-2026-999', status: 'Em Andamento', production_type: 'Secundario' },
            error: null,
          }),
        }),
      });

      supabaseServiceMock.admin.from = jest.fn().mockImplementation((table: string) => {
        if (table === 'production_orders') return { insert: orderInsertMock };
        return {
          insert: jest.fn().mockResolvedValue({ error: null }),
          update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
        };
      });
      supabaseServiceMock.admin.rpc = jest.fn();

      const result = await service.createOrder({
        productId: 'manteiga-id',
        productionType: 'Secundario',
        finishedProductConsumptions: [
          { finishedProductLotId: 'creme-lot-1', quantity: 50 },
        ],
      }, { id: 'user-1', email: 'operador@una.com', claims: {} });

      expect(result.order.id).toBe('sec-order-1');
      expect(supabaseServiceMock.admin.rpc).not.toHaveBeenCalled();
      expect(orderInsertMock).toHaveBeenCalledWith(expect.objectContaining({
        product_id: 'manteiga-id',
        milk_lot_id: null,
        liters_planned: 0,
        production_type: 'Secundario',
      }));
    });

    it('rejects creating a secondary OP without any consumed materials', async () => {
      jest.spyOn(service as any, 'getById').mockResolvedValueOnce({
        id: 'manteiga-id',
        name: 'Manteiga',
        active: true,
        production_type: 'Secundario',
      });

      await expect(service.createOrder({
        productId: 'manteiga-id',
        productionType: 'Secundario',
      })).rejects.toThrow('Para produção secundária, informe ao menos uma matéria-prima ou coproduto a ser consumido.');
    });

    it('rejects creating a primary OP when milkLotId is not provided', async () => {
      jest.spyOn(service as any, 'getById').mockResolvedValueOnce({
        id: 'queijo-id',
        name: 'Queijo Mussarela',
        active: true,
        production_type: 'Primario',
      });

      await expect(service.createOrder({
        productId: 'queijo-id',
        litersToUse: 100,
      })).rejects.toThrow('Informe o lote de leite para produtos primários.');
    });
  });
});
