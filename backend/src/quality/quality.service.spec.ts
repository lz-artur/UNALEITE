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
      expect(deleteMock).toHaveBeenCalledTimes(4); // milk_lot_analyses, milk_lot_pricing, lot_block_events, financial_entries
      expect(updateMock).toHaveBeenCalledWith({
        status: MILK_LOT_STATUS.PENDING_ANALYSIS,
        latest_analysis_id: null,
        cost_per_liter: null,
        total_value: null,
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
