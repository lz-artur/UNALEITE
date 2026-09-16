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
      expect(supabaseMock.deleteMock).toHaveBeenCalledTimes(6);
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
    it('should call create_sale_attendance rpc successfully', async () => {
      supabaseMock.rpcMock.mockResolvedValue({ data: 'new-attendance-id', error: null });
      jest.spyOn(service, 'getSalesOrder').mockImplementation(() => Promise.resolve({} as any));

      const payload = {
        idempotencyKey: 'test-key',
        fulfilledAt: '2026-09-07T10:00:00Z',
        paymentMethod: 'Pix',
        bankAccountId: '00000000-0000-4000-8000-000000000002',
        items: [{
          salesOrderItemId: 'item-1',
          finishedProductLotId: 'lot-1',
          quantity: 4
        }]
      };

      await service.fulfillSalesOrder('order-1', payload);

      expect(supabaseMock.rpcMock).toHaveBeenCalledWith('create_sale_attendance', {
        p_sales_order_id: 'order-1',
        p_user_id: null,
        p_fulfilled_at: '2026-09-07T10:00:00Z',
        p_idempotency_key: 'test-key',
        p_items: payload.items,
        p_payment_method: 'Pix',
        p_bank_account_id: '00000000-0000-4000-8000-000000000002',
        p_installment_entries: null,
        p_notes: null,
      });
      expect(service.getSalesOrder).toHaveBeenCalledWith('order-1');
    });

    it('should throw BadRequestException if rpc fails', async () => {
      supabaseMock.rpcMock.mockResolvedValue({ data: null, error: { message: 'Erro no banco' } });

      const payload = {
        idempotencyKey: 'test-key',
        paymentMethod: 'Pix',
        bankAccountId: '00000000-0000-4000-8000-000000000002',
        items: [{
          salesOrderItemId: 'item-1',
          finishedProductLotId: 'lot-1',
          quantity: 4
        }]
      };

      await expect(service.fulfillSalesOrder('order-1', payload)).rejects.toThrow('Erro no banco');
    });

    it('should reject an attendance without a payment method', async () => {
      await expect(service.fulfillSalesOrder('order-1', {
        idempotencyKey: 'test-key',
        bankAccountId: '00000000-0000-4000-8000-000000000002',
        items: [{ salesOrderItemId: 'item-1', finishedProductLotId: 'lot-1', quantity: 4 }],
      } as any)).rejects.toThrow('Informe a forma de pagamento');

      expect(supabaseMock.rpcMock).not.toHaveBeenCalled();
    });

    it('should reject an attendance without a receiving account', async () => {
      await expect(service.fulfillSalesOrder('order-1', {
        idempotencyKey: 'test-key',
        paymentMethod: 'Pix',
        items: [{ salesOrderItemId: 'item-1', finishedProductLotId: 'lot-1', quantity: 4 }],
      } as any)).rejects.toThrow('Informe a conta de recebimento');

      expect(supabaseMock.rpcMock).not.toHaveBeenCalled();
    });
  });

  // ─── cancelAttendance ─────────────────────────────────────────────────────

  describe('cancelAttendance', () => {
    it('should call cancel_sale_attendance rpc successfully', async () => {
      supabaseMock.fromMock.mockImplementation(() => ({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: { id: 'att-1', sales_order_id: 'order-1' },
                error: null
              })
            })
          })
        })
      }));
      supabaseMock.rpcMock.mockResolvedValue({ data: null, error: null });
      jest.spyOn(service, 'getSalesOrder').mockImplementation(() => Promise.resolve({} as any));

      await service.cancelAttendance('order-1', 'att-1');

      expect(supabaseMock.rpcMock).toHaveBeenCalledWith('cancel_sale_attendance', {
        p_attendance_id: 'att-1',
        p_user_id: null,
      });
      expect(service.getSalesOrder).toHaveBeenCalledWith('order-1');
    });

    it('should throw NotFoundException if attendance does not exist', async () => {
      supabaseMock.fromMock.mockImplementation(() => ({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: null,
                error: null
              })
            })
          })
        })
      }));

      await expect(service.cancelAttendance('order-1', 'att-1')).rejects.toThrow(NotFoundException);
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

    it.each([
      ['credit', 'client_credits'],
      ['refund', 'financial_entries'],
    ] as const)(
      'generates %s handling from entries linked to the financial finalization',
      async (excessHandlingStrategy, expectedInsertTable) => {
        const inserts: Array<{ table: string; data: any }> = [];
        const tableData: Record<string, any[]> = {
          sales_orders: bundle.salesOrders,
          sales_order_items: bundle.salesOrderItems,
          sales_order_fulfillments: bundle.fulfillments,
          clients: [{ ...bundle.clients[0], credit_balance: 0 }],
          finished_products: bundle.finishedProducts,
          finished_product_lots: bundle.finishedProductLots,
          sales_returns: bundle.salesReturns,
          sale_attendances: [],
          sale_attendance_items: [],
          sales_order_financial_finalizations: [{ id: 'finalization-1' }],
          financial_entry_items: [],
        };
        let financialEntriesQuery = 0;

        supabaseMock.fromMock.mockImplementation((table: string) => ({
          select: jest.fn().mockImplementation((selection?: string) => {
            if (table === 'sales_returns' && selection === 'returned_quantity') {
              return {
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              };
            }

            if (table === 'financial_entries') {
              const data = financialEntriesQuery++ === 0
                ? []
                : [{
                    id: 'entry-1',
                    amount: 100,
                    discount_amount: 0,
                    // Reembolso deve ser criado mesmo quando o título ainda
                    // não possui recebimentos; nesse caso o desconto reduz o
                    // contas a receber e a opção escolhida cria o contas a pagar.
                    financial_entry_receipts: excessHandlingStrategy === 'credit' ? [{ amount: 100 }] : [],
                  }];
              return {
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockResolvedValue({ data, error: null }),
                }),
              };
            }

            if (table === 'clients' && selection === 'credit_balance') {
              return {
                eq: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({ data: { credit_balance: 0 }, error: null }),
                }),
              };
            }

            const data = tableData[table] ?? [];
            const result = Promise.resolve({ data, error: null });
            return Object.assign(result, { eq: jest.fn().mockResolvedValue({ data, error: null }) });
          }),
          update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
          insert: jest.fn().mockImplementation((data: any) => {
            inserts.push({ table, data });
            return Promise.resolve({ data: null, error: null });
          }),
          delete: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
          }),
        }));

        await service.returnSalesOrder('order-1', {
          returnDate: '2026-08-25',
          items: [{ salesOrderItemId: 'item-1', lotId: 'lot-1', returnedQuantity: 1 }],
          discountAmount: 50,
          excessHandlingStrategy,
        });

        const generatedEntry = inserts.find((entry) => entry.table === expectedInsertTable);
        expect(generatedEntry).toBeDefined();
        expect(generatedEntry!.data.amount).toBe(50);
      },
    );
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
