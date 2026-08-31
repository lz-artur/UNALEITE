import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as api from './api';
import {
  deleteMilkReception,
  deleteMilkAnalysis,
  deleteSupplyLot,
  deleteFinishedProductLot,
  deleteProductionOrder,
  deleteSalesOrder,
  deletePurchase,
  deleteFinancialEntry,
  createBatchFinancialEntries,
  createFinancialReceipt,
  deleteFinancialReceipt,
  unsettleFinancialEntry,
  uploadFinancialAttachment,
  returnSalesOrder,
} from './operationsApi';
import { supabase } from '../lib/supabase';

vi.mock('./api', async () => {
  const original = await vi.importActual('./api');
  return {
    ...original,
    apiRequest: vi.fn().mockResolvedValue([]),
  };
});

vi.mock('../lib/supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn(),
    },
  },
}));

describe('operationsApi - Deletion endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deleteMilkReception calls DELETE /milk-lots/:id', async () => {
    await deleteMilkReception('lot-1');
    expect(api.apiRequest).toHaveBeenCalledWith('/milk-lots/lot-1', {
      method: 'DELETE',
    });
  });

  it('deleteMilkAnalysis calls DELETE /milk-lot-analyses/:id', async () => {
    await deleteMilkAnalysis('analysis-1');
    expect(api.apiRequest).toHaveBeenCalledWith('/milk-lot-analyses/analysis-1', {
      method: 'DELETE',
    });
  });

  it('deleteSupplyLot calls DELETE /inventory/supply-lots/:id', async () => {
    await deleteSupplyLot('lot-2');
    expect(api.apiRequest).toHaveBeenCalledWith('/inventory/supply-lots/lot-2', {
      method: 'DELETE',
    });
  });

  it('deleteFinishedProductLot calls DELETE /inventory/finished-product-lots/:id', async () => {
    await deleteFinishedProductLot('lot-3');
    expect(api.apiRequest).toHaveBeenCalledWith('/inventory/finished-product-lots/lot-3', {
      method: 'DELETE',
    });
  });

  it('deleteProductionOrder calls DELETE /production-orders/:id', async () => {
    await deleteProductionOrder('order-1');
    expect(api.apiRequest).toHaveBeenCalledWith('/production-orders/order-1', {
      method: 'DELETE',
    });
  });

  it('deleteSalesOrder calls DELETE /sales-orders/:id', async () => {
    await deleteSalesOrder('sales-1');
    expect(api.apiRequest).toHaveBeenCalledWith('/sales-orders/sales-1', {
      method: 'DELETE',
    });
  });

  it('deletePurchase calls DELETE /purchases/:id', async () => {
    await deletePurchase('purchases-1');
    expect(api.apiRequest).toHaveBeenCalledWith('/purchases/purchases-1', {
      method: 'DELETE',
    });
  });

  it('deleteFinancialEntry calls DELETE /financial-entries/:id', async () => {
    await deleteFinancialEntry('entry-1');
    expect(api.apiRequest).toHaveBeenCalledWith('/financial-entries/entry-1', {
      method: 'DELETE',
    });
  });

  describe('New Financial Methods', () => {
    it('createBatchFinancialEntries calls POST /financial-entries/batch', async () => {
      const payloads = [{ valor: 100 } as any];
      await createBatchFinancialEntries(payloads);
      expect(api.apiRequest).toHaveBeenCalledWith('/financial-entries/batch', {
        method: 'POST',
        body: JSON.stringify([{ amount: 100 }]),
      });
    });

    it('unsettleFinancialEntry calls POST /financial-entries/:id/unsettle', async () => {
      await unsettleFinancialEntry('entry-2');
      expect(api.apiRequest).toHaveBeenCalledWith('/financial-entries/entry-2/unsettle', {
        method: 'POST',
      });
    });

    it('createFinancialReceipt calls POST with partial receipt details', async () => {
      await createFinancialReceipt('entry-3', {
        valor: 2000,
        dataPagamento: '2026-08-30',
        formaPagamento: 'Pix',
        contaBancariaId: '00000000-0000-0000-0000-000000000001',
      });

      expect(api.apiRequest).toHaveBeenCalledWith('/financial-entries/entry-3/receipts', {
        method: 'POST',
        body: JSON.stringify({
          amount: 2000,
          paymentDate: '2026-08-30',
          paymentMethod: 'Pix',
          bankAccountId: '00000000-0000-0000-0000-000000000001',
        }),
      });
    });

    it('deleteFinancialReceipt calls DELETE for one receipt', async () => {
      await deleteFinancialReceipt('entry-3', 'receipt-1');
      expect(api.apiRequest).toHaveBeenCalledWith('/financial-entries/entry-3/receipts/receipt-1', {
        method: 'DELETE',
      });
    });

    it('uploadFinancialAttachment uploads to supabase and returns url', async () => {
      const uploadMock = vi.fn().mockResolvedValue({ error: null });
      const getPublicUrlMock = vi.fn().mockReturnValue({ data: { publicUrl: 'https://fake-url.com/file.png' } });
      
      (supabase.storage.from as any).mockReturnValue({
        upload: uploadMock,
        getPublicUrl: getPublicUrlMock,
      });

      const file = new File([''], 'test.png', { type: 'image/png' });
      const url = await uploadFinancialAttachment(file);

      expect(supabase.storage.from).toHaveBeenCalledWith('comprovantes');
      expect(uploadMock).toHaveBeenCalled();
      expect(getPublicUrlMock).toHaveBeenCalled();
      expect(url).toBe('https://fake-url.com/file.png');
    });
  });

  // ─── NEW: returnSalesOrder ──────────────────────────────────────────────

  describe('returnSalesOrder', () => {
    it('calls POST /sales-orders/:id/return with correct payload', async () => {
      const mockResponse = {
        id: 'order-1',
        number: 'VEN-2026-1',
        clientId: 'c1',
        clientName: 'Cliente',
        orderDate: '2026-01-01',
        dueDate: '2026-02-01',
        status: 'Atendido',
        totalAmount: 500,
        hasReturn: true,
        items: [],
      };

      (api.apiRequest as any).mockResolvedValue(mockResponse);

      const payload = {
        salesOrderId: 'order-1',
        returnDate: '2026-08-25',
        items: [
          {
            productId: 'item-1',
            lotId: 'lot-1',
            returnedQuantity: 3,
            reason: 'Produto danificado',
          },
        ],
        discountAmount: 50,
      };

      const result = await returnSalesOrder(payload);

      expect(api.apiRequest).toHaveBeenCalledWith('/sales-orders/order-1/return', {
        method: 'POST',
        body: JSON.stringify({
          returnDate: '2026-08-25',
          items: [
            {
              productId: 'item-1',
              lotId: 'lot-1',
              returnedQuantity: 3,
              reason: 'Produto danificado',
            },
          ],
          discountAmount: 50,
        }),
      });

      // Verify it returns a mapped sales order
      expect(result).toBeDefined();
      expect(result.hasReturn).toBe(true);
    });

    it('sends discountAmount=0 when no discount', async () => {
      (api.apiRequest as any).mockResolvedValue({
        id: 'order-1',
        number: 'VEN-2026-1',
        clientId: 'c1',
        clientName: 'Cliente',
        orderDate: '2026-01-01',
        dueDate: '2026-02-01',
        status: 'Atendido',
        totalAmount: 500,
        hasReturn: true,
        items: [],
      });

      await returnSalesOrder({
        salesOrderId: 'order-1',
        returnDate: '2026-08-25',
        items: [{ productId: 'item-1', lotId: 'lot-1', returnedQuantity: 1 }],
        discountAmount: 0,
      });

      const callArgs = (api.apiRequest as any).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.discountAmount).toBe(0);
    });

    it('sends multiple items in a single return', async () => {
      (api.apiRequest as any).mockResolvedValue({
        id: 'order-1',
        number: 'VEN-2026-1',
        clientId: 'c1',
        clientName: 'Cliente',
        orderDate: '2026-01-01',
        dueDate: '2026-02-01',
        status: 'Atendido',
        totalAmount: 1000,
        hasReturn: true,
        items: [],
      });

      await returnSalesOrder({
        salesOrderId: 'order-1',
        returnDate: '2026-08-25',
        items: [
          { productId: 'item-1', lotId: 'lot-1', returnedQuantity: 5 },
          { productId: 'item-2', lotId: 'lot-2', returnedQuantity: 3, reason: 'Validade' },
        ],
        discountAmount: 100,
      });

      const callArgs = (api.apiRequest as any).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.items).toHaveLength(2);
      expect(body.items[1].reason).toBe('Validade');
    });
  });
});

// ─── Mapper tests ─────────────────────────────────────────────────────────

describe('operationsApi - mapSalesOrder mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps hasReturn field from API response', async () => {
    const mockApiResponse = {
      id: 'order-1',
      number: 'VEN-2026-1',
      clientId: 'c1',
      clientName: 'Cliente',
      orderDate: '2026-01-01',
      dueDate: '2026-02-01',
      status: 'Atendido',
      totalAmount: 500,
      hasReturn: true,
      items: [
        {
          id: 'item-1',
          productId: 'prod-1',
          productName: 'Queijo',
          orderedQuantity: 10,
          fulfilledQuantity: 10,
          pendingQuantity: 0,
          unitPrice: 50,
          totalValue: 500,
          status: 'Atendido',
          fulfillments: [
            {
              id: 'ful-1',
              finishedProductLotId: 'lot-1',
              lotCode: 'LOTE-001',
              quantity: 10,
              returnedQuantity: 3,
              fulfilledAt: '2026-01-15T10:00:00Z',
            },
          ],
        },
      ],
    };

    (api.apiRequest as any).mockResolvedValue(mockApiResponse);

    // Use returnSalesOrder which also calls mapSalesOrder
    const result = await returnSalesOrder({
      salesOrderId: 'order-1',
      returnDate: '2026-08-25',
      items: [{ productId: 'item-1', lotId: 'lot-1', returnedQuantity: 3 }],
      discountAmount: 0,
    });

    expect(result.hasReturn).toBe(true);
    expect(result.items[0].fulfillments[0].returnedQuantity).toBe(3);
  });

  it('defaults returnedQuantity to 0 when absent', async () => {
    const mockApiResponse = {
      id: 'order-2',
      number: 'VEN-2026-2',
      clientId: 'c2',
      clientName: 'Cliente 2',
      orderDate: '2026-02-01',
      dueDate: '2026-03-01',
      status: 'Aberto',
      totalAmount: 200,
      items: [
        {
          id: 'item-2',
          productId: 'prod-2',
          productName: 'Manteiga',
          orderedQuantity: 5,
          fulfilledQuantity: 5,
          pendingQuantity: 0,
          unitPrice: 40,
          totalValue: 200,
          status: 'Atendido',
          fulfillments: [
            {
              id: 'ful-2',
              finishedProductLotId: 'lot-2',
              lotCode: 'LOTE-002',
              quantity: 5,
              // returnedQuantity NOT present
              fulfilledAt: '2026-02-10T10:00:00Z',
            },
          ],
        },
      ],
    };

    (api.apiRequest as any).mockResolvedValue(mockApiResponse);

    const result = await returnSalesOrder({
      salesOrderId: 'order-2',
      returnDate: '2026-08-25',
      items: [{ productId: 'item-2', lotId: 'lot-2', returnedQuantity: 1 }],
      discountAmount: 0,
    });

    expect(result.items[0].fulfillments[0].returnedQuantity).toBe(0);
  });
});

// ─── Interface type checks (compile-time verification) ────────────────────

describe('operationsApi - SalesOrderRecord interface', () => {
  it('SalesOrderRecord has hasReturn field', async () => {
    const record: import('./operationsApi').SalesOrderRecord = {
      id: '1',
      number: 'VEN-1',
      clientId: 'c1',
      clientName: 'Test',
      orderDate: new Date(),
      dueDate: new Date(),
      status: 'Aberto',
      totalAmount: 100,
      hasReturn: true,
      items: [],
    };

    expect(record.hasReturn).toBe(true);
  });

  it('SalesOrderItemFulfillmentRecord has returnedQuantity field', async () => {
    const record: import('./operationsApi').SalesOrderItemFulfillmentRecord = {
      id: '1',
      finishedProductLotId: 'lot-1',
      lotCode: 'LOTE-001',
      quantity: 10,
      returnedQuantity: 3,
      fulfilledAt: new Date(),
    };

    expect(record.returnedQuantity).toBe(3);
  });
});
