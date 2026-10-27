import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { SupabaseService } from '../supabase/supabase.service';

describe('InventoryService', () => {
  let service: InventoryService;
  let supabaseServiceMock: any;
  let usersServiceMock: any;

  beforeEach(() => {
    supabaseServiceMock = {
      admin: {
        from: jest.fn(),
      },
    };
    usersServiceMock = { ensureAppUser: jest.fn() };

    service = new InventoryService(supabaseServiceMock as SupabaseService, usersServiceMock);
  });

  describe('getFinishedProductLots', () => {
    it('adds the returned piece totals to each finished product lot', async () => {
      supabaseServiceMock.admin.from.mockImplementation((table: string) => {
        if (table === 'finished_product_lots') {
          return {
            select: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({
                data: [{ id: 'lot-1', available_quantity: 100, available_pieces: 25 }],
                error: null,
              }),
            }),
          };
        }
        if (table === 'sales_returns') {
          return {
            select: jest.fn().mockResolvedValue({
              data: [
                { finished_product_lot_id: 'lot-1', returned_pieces: 7 },
                { finished_product_lot_id: 'lot-1', returned_pieces: 5 },
              ],
              error: null,
            }),
          };
        }
        return {};
      });

      await expect(service.getFinishedProductLots()).resolves.toEqual([
        expect.objectContaining({ id: 'lot-1', returned_pieces: 12 }),
      ]);
    });
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

  describe('expired lot disposals', () => {
    const actor = { id: 'user-1', email: 'estoque@una.com' } as any;
    const expiredSupplyLot = {
      id: 'supply-lot-1', internal_lot_code: 'INS-001', supply_item_name: 'Fermento',
      expiration_date: '2020-01-01', available_quantity: 10, unit_cost: 4.5, units: { symbol: 'kg' },
    };

    it('rejects a request for a lot that has not expired yet', async () => {
      usersServiceMock.ensureAppUser.mockResolvedValue({ id: 'user-1', display_name: 'Operador', role: 'operacional' });
      supabaseServiceMock.admin.from.mockImplementation((table: string) => {
        if (table === 'supply_lots_with_item') return {
          select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue({ data: { ...expiredSupplyLot, expiration_date: '2999-01-01' }, error: null }) }) }),
        };
        return { insert: jest.fn() };
      });

      await expect(service.createExpiredLotDisposal({
        lotType: 'Insumo', lotId: '11111111-1111-1111-1111-111111111111', quantity: 2,
        destination: 'doacao_dre', justification: 'Lote separado incorretamente',
      }, actor)).rejects.toThrow('A baixa especial só pode ser solicitada para lote vencido.');
    });

    it('approves a donation only after checking the current balance and creates stock and DRE records', async () => {
      usersServiceMock.ensureAppUser.mockResolvedValue({ id: 'admin-1', display_name: 'Gestora', role: 'admin' });
      const updateSupply = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
      const financialInsert = jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: { id: 'financial-1' }, error: null }) }) });
      const movementInsert = jest.fn().mockResolvedValue({ error: null });
      const finalUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: { id: 'request-1', status: 'aprovada' }, error: null }),
          }),
        }),
      });
      supabaseServiceMock.admin.from.mockImplementation((table: string) => {
        if (table === 'expired_lot_disposals') return {
          select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'request-1', lot_type: 'Insumo', lot_id: 'supply-lot-1', quantity: 2, lot_code: 'INS-001', total_value: 9, destination: 'doacao_dre', status: 'aguardando_aprovacao' }, error: null }) }) }),
          update: finalUpdate,
        };
        if (table === 'supply_lots_with_item') return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue({ data: expiredSupplyLot, error: null }) }) }) };
        if (table === 'supply_lots') return { update: updateSupply };
        if (table === 'financial_entries') return { insert: financialInsert };
        if (table === 'stock_movements') return { insert: movementInsert };
        return {};
      });

      const result = await service.reviewExpiredLotDisposal('request-1', { decision: 'aprovada' }, actor);

      expect(result.status).toBe('aprovada');
      expect(updateSupply).toHaveBeenCalledWith(expect.objectContaining({ available_quantity: 8, updated_by: 'user-1' }));
      expect(financialInsert).toHaveBeenCalledWith(expect.objectContaining({ entry_type: 'Pagar', category: 'Doações de lotes vencidos', amount: 9 }));
      expect(movementInsert).toHaveBeenCalledWith(expect.objectContaining({ lot_type: 'Insumo', quantity: 2, reference_table: 'expired_lot_disposals' }));
    });
  });

  describe('createManualExit with 5% piece tolerance', () => {
    const actor = { id: 'user-1', email: 'estoque@una.com', claims: {} } as any;

    it('persists pieces_quantity in stock_movements when product tracks pieces', async () => {
      const lot = {
        id: 'lot-fp-1',
        lot_code: 'LOTE-FP-01',
        available_quantity: 200,
        available_pieces: 100,
        finished_products: { tracks_quantity_and_weight: true, tracks_pieces: true },
      };
      const exitRecord = { id: 'exit-1', quantity: 20, pieces: 10 };
      const movementInsert = jest.fn().mockResolvedValue({ error: null });

      supabaseServiceMock.admin.from.mockImplementation((table: string) => {
        if (table === 'finished_product_lots') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({ data: lot, error: null }),
              }),
            }),
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === 'finished_product_manual_exits') {
          return {
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({ data: exitRecord, error: null }),
              }),
            }),
          };
        }
        if (table === 'stock_movements') {
          return { insert: movementInsert };
        }
        return {};
      });

      const result = await service.createManualExit({
        finishedProductLotId: 'lot-fp-1',
        quantity: 20,
        pieces: 10,
        reason: 'Ajuste de degustação',
      }, actor);

      expect(result.success).toBe(true);
      expect(movementInsert).toHaveBeenCalledWith(expect.objectContaining({
        lot_type: 'Produto Acabado',
        quantity: 20,
        pieces_quantity: 10,
        reference_table: 'finished_product_manual_exits',
      }));
    });

    it('rejects manual piece exit exceeding authorized reference pieces by more than 5%', async () => {
      const lot = {
        id: 'lot-fp-1',
        lot_code: 'LOTE-FP-01',
        available_quantity: 500,
        available_pieces: 200,
        finished_products: { tracks_quantity_and_weight: true, tracks_pieces: true },
      };

      supabaseServiceMock.admin.from.mockImplementation((table: string) => {
        if (table === 'finished_product_lots') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({ data: lot, error: null }),
              }),
            }),
          };
        }
        return {};
      });

      // 100 authorized pieces -> tolerance is [95, 105]. 106 pieces should be rejected
      await expect(service.createManualExit({
        finishedProductLotId: 'lot-fp-1',
        quantity: 150,
        pieces: 106,
        authorizedPieces: 100,
        reason: 'Saída autorizada',
      }, actor)).rejects.toThrow('tolerância de 5% permitido (95 a 105 peças');
    });
  });
});
