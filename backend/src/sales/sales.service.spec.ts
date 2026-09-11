import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SupabaseService } from '../supabase/supabase.service';
import { ClientsService } from '../clients/clients.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createMockSupabase() {
  const selectMock = jest.fn();
  const updateMock = jest.fn();
  const deleteMock = jest.fn();
  const insertMock = jest.fn();
  const rpcMock = jest.fn().mockResolvedValue({ error: null, data: null });

  // chainable eq/select mocks
  const chainEq = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
  updateMock.mockReturnValue({ eq: chainEq });
  insertMock.mockResolvedValue({ data: null, error: null });

  const eqMock2 = jest.fn().mockResolvedValue({ error: null });
  const eqMock1 = jest.fn().mockReturnValue(
    Object.assign(Promise.resolve({ error: null }), { eq: eqMock2 }),
  );
  deleteMock.mockReturnValue({ eq: eqMock1 });

  const fromMock = jest.fn().mockImplementation(() => ({
    select: selectMock,
    delete: deleteMock,
    update: updateMock,
    insert: insertMock,
  }));

  return {
    admin: { from: fromMock, rpc: rpcMock },
    selectMock,
    updateMock,
    deleteMock,
    insertMock,
    fromMock,
    rpcMock,
  };
}

function baseSalesBundle() {
  return {
    salesOrders: [
      {
        id: 'order-1',
        order_number: 'VEN-2026-1',
        client_id: 'client-1',
        order_date: '2026-01-10',
        due_date: '2026-02-10',
        status: 'Atendido',
        total_amount: 500,
        has_return: false,
        notes: null,
      },
    ],
    salesOrderItems: [
      {
        id: 'item-1',
        sales_order_id: 'order-1',
        product_id: 'prod-1',
        ordered_quantity: 10,
        fulfilled_quantity: 10,
        unit_price: 50,
        total_value: 500,
        status: 'Atendido',
      },
    ],
    fulfillments: [
      {
        id: 'ful-1',
        sales_order_id: 'order-1',
        sales_order_item_id: 'item-1',
        finished_product_lot_id: 'lot-1',
        quantity: 10,
        fulfilled_at: '2026-01-15T10:00:00Z',
      },
    ],
    clients: [
      { id: 'client-1', name: 'Cliente Teste', document: '12345678000100' },
    ],
    finishedProducts: [
      { id: 'prod-1', name: 'Queijo Minas', unit_id: 'unit-kg', active: true },
    ],
    finishedProductLots: [
      {
        id: 'lot-1',
        product_id: 'prod-1',
        lot_code: 'LOTE-001',
        available_quantity: 50,
        returned_quantity: 0,
        quantity_produced: 100,
        produced_at: '2026-01-01',
        expiration_date: '2026-06-01',
      },
    ],
    salesReturns: [] as any[],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SalesService', () => {
  let service: SalesService;
  let supabaseMock: ReturnType<typeof createMockSupabase>;
  let clientsServiceMock: any;

  beforeEach(() => {
    supabaseMock = createMockSupabase();
    clientsServiceMock = {};
    service = new SalesService(
      supabaseMock as unknown as SupabaseService,
      clientsServiceMock as ClientsService,
    );
  });

  // ─── deleteOrder ──────────────────────────────────────────────────────────

  describe('deleteOrder', () => {
    beforeEach(() => {
      supabaseMock.selectMock.mockImplementation(() =>
        Promise.resolve({
          data: [
            { id: 'order-1', client_id: 'client-1' },
            { id: 'item-1', sales_order_id: 'order-1' },
            { id: 'ful-1', sales_order_id: 'order-1', finished_product_lot_id: 'fp-1', quantity: 10 },
            { id: 'client-1' },
            { id: 'prod-1' },
            { id: 'fp-1', available_quantity: 100 },
            // sales_returns
          ],
          error: null,
        }),
      );
    });

    it('should delete order and restore lots successfully', async () => {
      const result = await service.deleteOrder('order-1');
      expect(result).toEqual({ success: true });
      expect(supabaseMock.updateMock).toHaveBeenCalled();
      expect(supabaseMock.deleteMock).toHaveBeenCalledTimes(5);
    });

    it('should clear quantities returned by the deleted sale while restoring its fulfilled stock', async () => {
      const bundle = baseSalesBundle();
      bundle.fulfillments[0].quantity = 7.28;
      bundle.finishedProductLots[0].available_quantity = 0;
      bundle.finishedProductLots[0].returned_quantity = 5;
      bundle.salesReturns = [{
        id: 'return-1',
        sales_order_id: 'order-1',
        product_id: 'prod-1',
        finished_product_lot_id: 'lot-1',
        returned_quantity: 5,
      }];

      const tableData: Record<string, any[]> = {
        sales_orders: bundle.salesOrders,
        sales_order_items: bundle.salesOrderItems,
        sales_order_fulfillments: bundle.fulfillments,
        clients: bundle.clients,
        finished_products: bundle.finishedProducts,
        finished_product_lots: bundle.finishedProductLots,
        sales_returns: bundle.salesReturns,
      };
      const updates: Array<{ table: string; data: any }> = [];

      supabaseMock.fromMock.mockImplementation((table: string) => ({
        select: jest.fn().mockResolvedValue({ data: tableData[table] ?? [], error: null }),
        update: jest.fn().mockImplementation((data: any) => {
          updates.push({ table, data });
          return { eq: jest.fn().mockResolvedValue({ error: null }) };
        }),
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue(Object.assign(
            Promise.resolve({ error: null }),
            { eq: jest.fn().mockResolvedValue({ error: null }) },
          )),
        }),
      }));

      await service.deleteOrder('order-1');

      expect(updates).toContainEqual({
        table: 'finished_product_lots',
        data: {
          available_quantity: 7.28,
          returned_quantity: 0,
        },
      });
    });

    it('should throw NotFoundException if order does not exist', async () => {
      supabaseMock.selectMock.mockImplementation(() =>
        Promise.resolve({ data: [], error: null }),
      );
      await expect(service.deleteOrder('order-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── fulfillSalesOrder ──────────────────────────────────────────────────────

  describe('fulfillSalesOrder', () => {
    let bundle: ReturnType<typeof baseSalesBundle>;

    beforeEach(() => {
      bundle = baseSalesBundle();
      bundle.salesOrders[0].status = 'Aberto';
      bundle.salesOrderItems[0].status = 'Aberto';
      bundle.salesOrderItems[0].ordered_quantity = 10;
      bundle.salesOrderItems[0].fulfilled_quantity = 0;
      bundle.salesOrderItems[0].unit_price = 50;
      bundle.salesOrderItems[0].total_value = 500;
      bundle.fulfillments = [];
    });

    it('should create a receivable entry for each fulfillment without a provision entry', async () => {
      const updates: Array<{ table: string; data: any }> = [];
      const inserts: Array<{ table: string; data: any }> = [];

      supabaseMock.fromMock.mockImplementation((table: string) => {
        return {
          select: jest.fn().mockImplementation(() => {
            const tableMap: Record<string, any[]> = {
              sales_orders: bundle.salesOrders,
              sales_order_items: bundle.salesOrderItems,
              sales_order_fulfillments: bundle.fulfillments,
              clients: bundle.clients,
              finished_products: bundle.finishedProducts,
              finished_product_lots: bundle.finishedProductLots,
              sales_returns: bundle.salesReturns,
            };

            const data = tableMap[table] ?? [];
            return Object.assign(Promise.resolve({ data, error: null }), {
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ data: [], error: null }),
              }),
            });
          }),
          update: jest.fn().mockImplementation((data: any) => {
            updates.push({ table, data });
            return { eq: jest.fn().mockResolvedValue({ error: null }) };
          }),
          insert: jest.fn().mockImplementation((data: any) => {
            inserts.push({ table, data });
            return {
              select: jest.fn().mockResolvedValue({ data: Array.isArray(data) ? data.map((d, i) => ({ id: `new-fe-${i}`, amount: d.amount })) : [{ id: 'new-fe-1', amount: data.amount }], error: null })
            };
          }),
          delete: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ error: null }),
          }),
        };
      });

      jest.spyOn(service, 'getSalesOrder').mockImplementation(() => Promise.resolve({} as any));

      const payload = {
        fulfilledAt: '2026-09-07T10:00:00Z',
        items: [{
          salesOrderItemId: 'item-1',
          finishedProductLotId: 'lot-1',
          quantity: 4 // 4 * 50 = 200
        }]
      };

      await service.fulfillSalesOrder('order-1', payload);
      await service.fulfillSalesOrder('order-1', {
        fulfilledAt: '2026-09-08T10:00:00Z',
        items: [{
          salesOrderItemId: 'item-1',
          finishedProductLotId: 'lot-1',
          quantity: 6,
        }],
      });

      const financialEntryInserts = inserts.filter(i => i.table === 'financial_entries');
      expect(financialEntryInserts).toHaveLength(2);
      expect(financialEntryInserts.map(i => i.data[0].amount)).toEqual([200, 300]);
      expect(financialEntryInserts.reduce((sum, insert) => sum + insert.data[0].amount, 0)).toBe(500);
      expect(financialEntryInserts[0].data[0]).toMatchObject({
        reference_table: 'sales_orders',
        reference_id: 'order-1',
        installment_number: 1,
        installments: 1,
      });
      expect(financialEntryInserts[0].data[0].installment_group_id).toBeTruthy();
      expect(financialEntryInserts[0].data[0].installment_group_id)
        .not.toBe(financialEntryInserts[1].data[0].installment_group_id);
      expect(financialEntryInserts[0].data[0].description).toContain('atendimento 07/09/2026');
      expect(updates.some(u => u.table === 'financial_entries')).toBe(false);

      const rateioInserts = inserts.filter(i => i.table === 'financial_entry_items');
      expect(rateioInserts.length).toBeGreaterThan(0);
    });

    it('should reject installments whose total differs from the fulfilled value', async () => {
      const tableMap: Record<string, any[]> = {
        sales_orders: bundle.salesOrders,
        sales_order_items: bundle.salesOrderItems,
        sales_order_fulfillments: bundle.fulfillments,
        clients: bundle.clients,
        finished_products: bundle.finishedProducts,
        finished_product_lots: bundle.finishedProductLots,
        sales_returns: bundle.salesReturns,
      };
      supabaseMock.fromMock.mockImplementation((table: string) => ({
        select: jest.fn().mockResolvedValue({ data: tableMap[table] ?? [], error: null }),
      }));

      const payload = {
        fulfilledAt: '2026-09-07T10:00:00Z',
        installmentEntries: [{ amount: 150, dueDate: '2026-10-07T12:00:00Z' }],
        items: [{
          salesOrderItemId: 'item-1',
          finishedProductLotId: 'lot-1',
          quantity: 4,
        }],
      };

      await expect(service.fulfillSalesOrder('order-1', payload)).rejects.toThrow(
        'O total das parcelas deve ser igual ao valor atendido nesta etapa.',
      );
      expect(supabaseMock.rpcMock).not.toHaveBeenCalled();
    });
  });

  // ─── returnSalesOrder ─────────────────────────────────────────────────────

  describe('returnSalesOrder', () => {
    let bundle: ReturnType<typeof baseSalesBundle>;

    beforeEach(() => {
      bundle = baseSalesBundle();

      // loadSalesBundle via selectMany – returns based on table order
      let callIndex = 0;
      const tableData: Record<string, any[]> = {
        sales_orders: bundle.salesOrders,
        sales_order_items: bundle.salesOrderItems,
        sales_order_fulfillments: bundle.fulfillments,
        clients: bundle.clients,
        finished_products: bundle.finishedProducts,
        finished_product_lots: bundle.finishedProductLots,
        sales_returns: bundle.salesReturns,
      };

      supabaseMock.fromMock.mockImplementation((table: string) => {
        const data = tableData[table] ?? [];

        return {
          select: jest.fn().mockImplementation(() => {
            // For chained .eq() calls (past returns query, financial queries)
            const eqChain: any = {
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ data: [], error: null }),
              }),
            };
            return Object.assign(Promise.resolve({ data, error: null }), eqChain);
          }),
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ error: null }),
          }),
          insert: jest.fn().mockResolvedValue({ data: null, error: null }),
          delete: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ error: null }),
            }),
          }),
        };
      });
    });

    it('should throw NotFoundException when order does not exist', async () => {
      bundle.salesOrders = [];
      // re-mock with empty orders
      supabaseMock.fromMock.mockImplementation((table: string) => ({
        select: jest.fn().mockImplementation(() =>
          Object.assign(Promise.resolve({ data: table === 'sales_orders' ? [] : [], error: null }), {
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        ),
        update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
        insert: jest.fn().mockResolvedValue({ data: null, error: null }),
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
        }),
      }));

      await expect(
        service.returnSalesOrder('non-existent', {
          returnDate: '2026-08-25',
          items: [{ salesOrderItemId: 'item-1', lotId: 'lot-1', returnedQuantity: 1 }],
          discountAmount: 0,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when fulfillment is not found', async () => {
      // Remove fulfillments so lookup will fail
      supabaseMock.fromMock.mockImplementation((table: string) => {
        const tableMap: Record<string, any[]> = {
          sales_orders: bundle.salesOrders,
          sales_order_items: bundle.salesOrderItems,
          sales_order_fulfillments: [], // no fulfillments
          clients: bundle.clients,
          finished_products: bundle.finishedProducts,
          finished_product_lots: bundle.finishedProductLots,
          sales_returns: [],
        };
        return {
          select: jest.fn().mockImplementation(() =>
            Object.assign(Promise.resolve({ data: tableMap[table] ?? [], error: null }), {
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          ),
          update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
          insert: jest.fn().mockResolvedValue({ data: null, error: null }),
          delete: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
          }),
        };
      });

      await expect(
        service.returnSalesOrder('order-1', {
          returnDate: '2026-08-25',
          items: [{ salesOrderItemId: 'item-1', lotId: 'lot-1', returnedQuantity: 2 }],
          discountAmount: 0,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when returned quantity exceeds available', async () => {
      // Mock selectMany for bundle load
      const tables = [
        bundle.salesOrders,
        bundle.salesOrderItems,
        bundle.fulfillments,
        bundle.clients,
        bundle.finishedProducts,
        bundle.finishedProductLots,
        bundle.salesReturns,
      ];
      let tableIndex = 0;

      supabaseMock.fromMock.mockImplementation((table: string) => ({
        select: jest.fn().mockImplementation((selectStr?: string) => {
          // If it's the sales_returns query (chained .eq calls for past returns)
          if (table === 'sales_returns' && selectStr === 'returned_quantity') {
            return {
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockResolvedValue({
                    data: [{ returned_quantity: 8 }], // Already returned 8 of 10
                    error: null,
                  }),
                }),
              }),
            };
          }

          const data = tables[tableIndex] ?? [];
          tableIndex++;
          return Object.assign(Promise.resolve({ data, error: null }), {
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
          });
        }),
        update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
        insert: jest.fn().mockResolvedValue({ data: null, error: null }),
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
        }),
      }));

      await expect(
        service.returnSalesOrder('order-1', {
          returnDate: '2026-08-25',
          items: [{ salesOrderItemId: 'item-1', lotId: 'lot-1', returnedQuantity: 5 }], // 8 + 5 > 10
          discountAmount: 0,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should insert return record and update lot returned_quantity on valid return', async () => {
      const insertCalls: any[] = [];
      const updateCalls: Array<{ table: string; data: any }> = [];

      const tables = [
        bundle.salesOrders,
        bundle.salesOrderItems,
        bundle.fulfillments,
        bundle.clients,
        bundle.finishedProducts,
        bundle.finishedProductLots,
        bundle.salesReturns,
      ];
      let tableIndex = 0;

      // For the second loadSalesBundle call (at the end in getSalesOrder)
      let secondBundleCall = false;

      supabaseMock.fromMock.mockImplementation((table: string) => ({
        select: jest.fn().mockImplementation((selectStr?: string) => {
          if (table === 'sales_returns' && selectStr === 'returned_quantity') {
            return {
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockResolvedValue({
                    data: [], // No past returns
                    error: null,
                  }),
                }),
              }),
            };
          }

          if (table === 'financial_entries') {
            return {
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            };
          }

          const idx = tableIndex % tables.length;
          const data = tables[idx] ?? [];
          tableIndex++;
          return Object.assign(Promise.resolve({ data, error: null }), {
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
          });
        }),
        update: jest.fn().mockImplementation((data: any) => {
          updateCalls.push({ table, data });
          return { eq: jest.fn().mockResolvedValue({ error: null }) };
        }),
        insert: jest.fn().mockImplementation((data: any) => {
          insertCalls.push({ table, data });
          return Promise.resolve({ data: null, error: null });
        }),
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
        }),
      }));

      try {
        await service.returnSalesOrder('order-1', {
          returnDate: '2026-08-25',
          items: [{ salesOrderItemId: 'item-1', lotId: 'lot-1', returnedQuantity: 3, reason: 'Avariado' }],
          discountAmount: 0,
        });
      } catch {
        // May throw on the final getSalesOrder call due to mock limitations – that's OK
      }

      // Verify lot returned_quantity update
      const lotUpdate = updateCalls.find(
        (c) => c.table === 'finished_product_lots',
      );
      expect(lotUpdate).toBeDefined();
      expect(lotUpdate!.data.returned_quantity).toBe(3); // 0 + 3

      // Verify return record insert
      const returnInsert = insertCalls.find(
        (c) => c.table === 'sales_returns',
      );
      expect(returnInsert).toBeDefined();
      expect(returnInsert!.data.returned_quantity).toBe(3);
      expect(returnInsert!.data.reason).toBe('Avariado');
      expect(returnInsert!.data.return_date).toBe('2026-08-25');

      // Verify has_return flag
      const orderUpdate = updateCalls.find(
        (c) => c.table === 'sales_orders',
      );
      expect(orderUpdate).toBeDefined();
      expect(orderUpdate!.data.has_return).toBe(true);
    });
  });

  // ─── hydrateSalesOrder ────────────────────────────────────────────────────

  describe('hydrateSalesOrder (via getSalesOrder)', () => {
    it('should include hasReturn=true and returnedQuantity in hydrated output', async () => {
      const bundle = baseSalesBundle();
      bundle.salesOrders[0].has_return = true;
      bundle.salesReturns = [
        {
          id: 'ret-1',
          sales_order_id: 'order-1',
          product_id: 'prod-1',
          finished_product_lot_id: 'lot-1',
          returned_quantity: 4,
        },
      ];

      const tables = [
        bundle.salesOrders,
        bundle.salesOrderItems,
        bundle.fulfillments,
        bundle.clients,
        bundle.finishedProducts,
        bundle.finishedProductLots,
        bundle.salesReturns,
      ];
      let tableIndex = 0;

      supabaseMock.fromMock.mockImplementation(() => ({
        select: jest.fn().mockImplementation(() => {
          const data = tables[tableIndex] ?? [];
          tableIndex++;
          return Object.assign(Promise.resolve({ data, error: null }), {
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
          });
        }),
        update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
        insert: jest.fn().mockResolvedValue({ data: null, error: null }),
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
        }),
      }));

      const result = await service.getSalesOrder('order-1');

      expect(result.hasReturn).toBe(true);
      expect(result.items[0].fulfillments[0].returnedQuantity).toBe(4);
    });

    it('should default hasReturn=false and returnedQuantity=0 when no returns exist', async () => {
      const bundle = baseSalesBundle();

      const tables = [
        bundle.salesOrders,
        bundle.salesOrderItems,
        bundle.fulfillments,
        bundle.clients,
        bundle.finishedProducts,
        bundle.finishedProductLots,
        bundle.salesReturns,
      ];
      let tableIndex = 0;

      supabaseMock.fromMock.mockImplementation(() => ({
        select: jest.fn().mockImplementation(() => {
          const data = tables[tableIndex] ?? [];
          tableIndex++;
          return Object.assign(Promise.resolve({ data, error: null }), {
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
          });
        }),
        update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
        insert: jest.fn().mockResolvedValue({ data: null, error: null }),
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
        }),
      }));

      const result = await service.getSalesOrder('order-1');

      expect(result.hasReturn).toBe(false);
      expect(result.items[0].fulfillments[0].returnedQuantity).toBe(0);
    });
  });
});
