import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { SupabaseService } from '../supabase/supabase.service';

describe('InventoryService', () => {
  let service: InventoryService;
  let supabaseServiceMock: any;

  beforeEach(() => {
    supabaseServiceMock = {
      admin: {
        from: jest.fn(),
      },
    };

    service = new InventoryService(supabaseServiceMock as SupabaseService);
  });

  describe('deleteSupplyLot', () => {
    let selectMock: jest.Mock;
    let deleteMock: jest.Mock;

    beforeEach(() => {
      selectMock = jest.fn();
      deleteMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      supabaseServiceMock.admin.from.mockImplementation((table: string) => {
        if (table === 'supply_lots') {
          return {
            select: selectMock,
            delete: deleteMock,
          };
        }
        return {};
      });
    });

    it('should delete a supply lot successfully', async () => {
      selectMock.mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({
            data: { id: 'lot-1', received_quantity: 100, available_quantity: 100 },
            error: null,
          }),
        }),
      });

      const result = await service.deleteSupplyLot('lot-1');
      expect(result).toEqual({ success: true });
      expect(deleteMock).toHaveBeenCalled();
    });

    it('should throw NotFoundException if supply lot does not exist', async () => {
      selectMock.mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        }),
      });

      await expect(service.deleteSupplyLot('lot-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if supply lot is partially consumed', async () => {
      selectMock.mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({
            data: { id: 'lot-1', received_quantity: 100, available_quantity: 50 },
            error: null,
          }),
        }),
      });

      await expect(service.deleteSupplyLot('lot-1')).rejects.toThrow(
        'Não é possível excluir o lote de insumo pois ele já foi parcialmente ou totalmente consumido.',
      );
    });
  });

  describe('deleteFinishedProductLot', () => {
    let selectMock: jest.Mock;
    let deleteMock: jest.Mock;

    beforeEach(() => {
      selectMock = jest.fn();
      deleteMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      supabaseServiceMock.admin.from.mockImplementation((table: string) => {
        if (table === 'finished_product_lots') {
          return {
            select: selectMock,
            delete: deleteMock,
          };
        }
        return {};
      });
    });

    it('should delete a finished product lot successfully', async () => {
      selectMock.mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({
            data: { id: 'lot-2', quantity_produced: 200, available_quantity: 200 },
            error: null,
          }),
        }),
      });

      const result = await service.deleteFinishedProductLot('lot-2');
      expect(result).toEqual({ success: true });
      expect(deleteMock).toHaveBeenCalled();
    });

    it('should throw BadRequestException if product lot is partially sold', async () => {
      selectMock.mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({
            data: { id: 'lot-2', quantity_produced: 200, available_quantity: 150 },
            error: null,
          }),
        }),
      });

      await expect(service.deleteFinishedProductLot('lot-2')).rejects.toThrow(
        'Não é possível excluir o lote de produto pois ele já foi parcialmente ou totalmente vendido.',
      );
    });
  });
});
