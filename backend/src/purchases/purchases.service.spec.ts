import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { SupabaseService } from '../supabase/supabase.service';

describe('PurchasesService', () => {
  let service: PurchasesService;
  let supabaseServiceMock: any;

  beforeEach(() => {
    supabaseServiceMock = {
      admin: {
        from: jest.fn(),
      },
    };

    service = new PurchasesService(supabaseServiceMock as SupabaseService);
  });

  describe('deletePurchase', () => {
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
        };
      });
    });

    it('should delete purchase and restore lots successfully', async () => {
      selectMock.mockImplementation(() => {
        return Promise.resolve({
          data: [
            { id: 'purchase-1', supplier_id: 'supplier-1' }, // purchases (from selectMany)
            { id: 'item-1', purchase_id: 'purchase-1' }, // purchase_items
            { id: 'supplier-1' }, // suppliers
            { id: 'supply-item-1' }, // supply items
            { id: 'lot-1', purchase_id: 'purchase-1', received_quantity: 10, available_quantity: 10, supply_item_id: 'supply-item-1' }, // supply_lots
            { id: 'supply-item-1', current_stock: 100 }, // single supply item
          ],
          error: null,
        });
      });
      // The selectMock will return an array, but the find calls for single items will expect an object, so let's adjust it
      // Since supabaseServiceMock.admin.from(table).select(*) returns data, we can mock based on table if needed,
      // but a generic mock returning an array with the right fields works because the find methods and array map work on arrays.
      // Wait, there's one single() call inside the loop:
      // const { data: supplyItem } = await this.supabaseService.admin.from('supply_items').select('current_stock').eq('id', lot.supply_item_id).single();
      // Let's refine the mock to handle `.single()`.
      
      selectMock.mockImplementation((columns?: string) => {
        const dataToReturn = [
          { id: 'purchase-1', supplier_id: 'supplier-1' },
          { id: 'item-1', purchase_id: 'purchase-1', supply_item_id: 'supply-item-1' },
          { id: 'supplier-1' },
          { id: 'supply-item-1', name: 'Item', current_stock: 100 },
          { id: 'lot-1', purchase_id: 'purchase-1', received_quantity: 10, available_quantity: 10, supply_item_id: 'supply-item-1' },
        ];
        
        return {
          in: jest.fn().mockResolvedValue({ data: dataToReturn, error: null }),
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            single: jest.fn().mockResolvedValue({ data: { current_stock: 100 }, error: null }),
            then: (cb: any) => cb({ data: dataToReturn, error: null }),
          }),
          then: (cb: any) => cb({
            data: dataToReturn,
            error: null,
          }),
        };
      });

      const result = await service.deletePurchase('purchase-1');
      expect(result).toEqual({ success: true });
      expect(updateMock).toHaveBeenCalled(); // Restore item stock
      expect(deleteMock).toHaveBeenCalledTimes(5); // stock_movements, supply_lots, purchase_items, financial_entries, purchases
    });

    it('should throw BadRequestException if supply lot was partially consumed', async () => {
      selectMock.mockImplementation(() => {
        const dataToReturn = [
          { id: 'purchase-1', supplier_id: 'supplier-1' },
          { id: 'item-1', purchase_id: 'purchase-1', supply_item_id: 'supply-item-1' },
          { id: 'supplier-1' },
          { id: 'supply-item-1' },
          { id: 'lot-1', purchase_id: 'purchase-1', received_quantity: 10, available_quantity: 5, supply_item_id: 'supply-item-1' },
        ];
        return {
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            then: (cb: any) => cb({ data: dataToReturn, error: null }),
          }),
          then: (cb: any) => cb({
            data: dataToReturn,
            error: null,
          }),
        };
      });

      await expect(service.deletePurchase('purchase-1')).rejects.toThrow(
        'Não é possível excluir a compra pois os insumos recebidos já foram parcialmente ou totalmente consumidos.',
      );
    });
  });
});
