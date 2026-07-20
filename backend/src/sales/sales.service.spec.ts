import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SupabaseService } from '../supabase/supabase.service';
import { ClientsService } from '../clients/clients.service';

describe('SalesService', () => {
  let service: SalesService;
  let supabaseServiceMock: any;
  let clientsServiceMock: any;

  beforeEach(() => {
    supabaseServiceMock = {
      admin: {
        from: jest.fn(),
      },
    };
    clientsServiceMock = {};

    service = new SalesService(
      supabaseServiceMock as SupabaseService,
      clientsServiceMock as ClientsService,
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
        };
      });
    });

    it('should delete order and restore lots successfully', async () => {
      selectMock.mockImplementation(() => {
        return Promise.resolve({
          data: [
            { id: 'order-1', client_id: 'client-1' }, // sales_orders (or fulfillments depending on call order, we just return an array with an id for everything in selectMany)
            { id: 'item-1', sales_order_id: 'order-1' }, // items
            { id: 'ful-1', sales_order_id: 'order-1', finished_product_lot_id: 'fp-1', quantity: 10 }, // fulfillments
            { id: 'client-1' }, // clients
            { id: 'prod-1' }, // finished products
            { id: 'fp-1', available_quantity: 100 }, // finished product lots
          ],
          error: null,
        });
      });

      const result = await service.deleteOrder('order-1');
      expect(result).toEqual({ success: true });
      expect(updateMock).toHaveBeenCalled(); // Restore lot volume
      expect(deleteMock).toHaveBeenCalledTimes(5); // fulfillments, stock_movements, sales_order_items, financial_entries, sales_orders
    });

    it('should throw NotFoundException if order does not exist', async () => {
      selectMock.mockImplementation(() => {
        return Promise.resolve({
          data: [],
          error: null,
        });
      });

      await expect(service.deleteOrder('order-1')).rejects.toThrow(NotFoundException);
    });
  });
});
