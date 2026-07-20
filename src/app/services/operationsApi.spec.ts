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
  unsettleFinancialEntry,
  uploadFinancialAttachment,
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
});
