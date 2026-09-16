import { BadRequestException, NotFoundException } from '@nestjs/common';
import { QualityService } from './quality.service';
import { SupabaseService } from '../supabase/supabase.service';
import { DomainRulesService } from '../common/services/domain-rules.service';
import { MILK_LOT_STATUS } from '../common/constants/domain';

describe('QualityService', () => {
  let service: QualityService;
  let supabaseServiceMock: any;
  let domainRulesServiceMock: any;

  beforeEach(() => {
    supabaseServiceMock = {
      admin: {
        from: jest.fn(),
      },
    };
    domainRulesServiceMock = {
      evaluateAnalysis: jest.fn(),
      calculateMilkPricing: jest.fn(),
    };

    service = new QualityService(
      supabaseServiceMock as SupabaseService,
      domainRulesServiceMock as DomainRulesService,
    );
  });

  describe('createAnalysis', () => {
    let selectMock: jest.Mock;
    let insertMock: jest.Mock;
    let updateMock: jest.Mock;

    beforeEach(() => {
      selectMock = jest.fn();
      insertMock = jest.fn();
      updateMock = jest.fn();

      supabaseServiceMock.admin.from.mockImplementation((table: string) => {
        return {
          select: selectMock,
          insert: insertMock,
          update: updateMock,
        };
      });
    });

    it('should not create a financial entry because it is generated at reception', async () => {
      // 1. getMilkLot
      selectMock.mockReturnValueOnce({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({
            data: { id: 'lot-1', producer_id: 'prod-1', milk_type_id: 'type-1', total_value: 500, received_at: '2026-05-01' },
            error: null,
          }),
        }),
      });

      // 2. getQualityParameters
      selectMock.mockReturnValueOnce({
        eq: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      });

      // 3. evaluateAnalysis
      domainRulesServiceMock.evaluateAnalysis.mockReturnValue({
        approved: true,
        blocked: false,
        reasonNames: [],
      });

      // 4. insert milk_lot_analyses
      insertMock.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: 'analysis-1', analyzed_at: '2026-05-02' },
            error: null,
          }),
        }),
      });

      // 5. update milk_lots
      updateMock.mockReturnValueOnce({
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: 'lot-1', status: MILK_LOT_STATUS.APPROVED },
              error: null,
            }),
          }),
        }),
      });

      await service.createAnalysis('lot-1', {
        alizarol: 'Aprovado',
        gordura: 3.5,
        proteina: 3.2,
        antibioticos: 'Não Detectado'
      });

      expect(supabaseServiceMock.admin.from).not.toHaveBeenCalledWith('financial_entries');
    });

    it('should not create a payable entry when the analysis approves a lot', async () => {
      // 1. getMilkLot
      selectMock.mockReturnValueOnce({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({
            data: { id: 'lot-2', producer_id: 'prod-2', milk_type_id: 'type-2', total_value: 300, received_at: '2026-05-01' },
            error: null,
          }),
        }),
      });

      // 2. getQualityParameters
      selectMock.mockReturnValueOnce({
        eq: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      });

      // 3. evaluateAnalysis
      domainRulesServiceMock.evaluateAnalysis.mockReturnValue({
        approved: true,
        blocked: false,
        reasonNames: [],
      });

      // 4. insert milk_lot_analyses
      insertMock.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: 'analysis-2', analyzed_at: '2026-05-02' },
            error: null,
          }),
        }),
      });

      // 5. update milk_lots
      updateMock.mockReturnValueOnce({
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: 'lot-2', status: MILK_LOT_STATUS.APPROVED },
              error: null,
            }),
          }),
        }),
      });

      await service.createAnalysis('lot-2', {
        alizarol: 'Aprovado',
        gordura: 3.5,
        proteina: 3.2,
        antibioticos: 'Não Detectado'
      });

      expect(supabaseServiceMock.admin.from).not.toHaveBeenCalledWith('financial_entries');
    });
  });

  describe('deleteAnalysis', () => {
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

    it('should delete analysis and reset lot state successfully', async () => {
      selectMock
        .mockReturnValueOnce({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'analysis-1', milk_lot_id: 'lot-1' },
              error: null,
            }),
          }),
        })
        .mockReturnValueOnce({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'lot-1', volume_liters: 1000, available_volume_liters: 1000 },
              error: null,
            }),
          }),
        });

      const result = await service.deleteAnalysis('analysis-1');
      expect(result).toEqual({ success: true });
      expect(deleteMock).toHaveBeenCalledTimes(2); // milk_lot_analyses, lot_block_events
      expect(updateMock).toHaveBeenCalledWith({
        status: MILK_LOT_STATUS.PENDING_ANALYSIS,
        latest_analysis_id: null,
      });
    });

    it('should throw NotFoundException if analysis does not exist', async () => {
      selectMock.mockReturnValueOnce({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        }),
      });

      await expect(service.deleteAnalysis('analysis-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if lot is partially consumed', async () => {
      selectMock
        .mockReturnValueOnce({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'analysis-1', milk_lot_id: 'lot-1' },
              error: null,
            }),
          }),
        })
        .mockReturnValueOnce({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'lot-1', volume_liters: 1000, available_volume_liters: 500 },
              error: null,
            }),
          }),
        });

      await expect(service.deleteAnalysis('analysis-1')).rejects.toThrow(
        'Não é possível excluir a análise pois o lote já foi parcialmente ou totalmente consumido na produção.',
      );
    });
  });
});
