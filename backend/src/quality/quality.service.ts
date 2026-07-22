import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MILK_LOT_STATUS,
} from '../common/constants/domain';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { DomainRulesService } from '../common/services/domain-rules.service';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateMilkAnalysisDto } from './dto/create-milk-analysis.dto';

@Injectable()
export class QualityService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly domainRulesService: DomainRulesService,
  ) {}

  async listAnalyses() {
    const { data, error } = await this.supabaseService.admin
      .from('milk_lot_analyses')
      .select('*, subanalyses:milk_lot_subanalyses(*)')
      .order('analyzed_at', { ascending: false });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data;
  }

  async listPricings() {
    const { data, error } = await this.supabaseService.admin
      .from('milk_lot_pricing')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data;
  }

  async createAnalysis(
    milkLotId: string,
    payload: CreateMilkAnalysisDto,
    user?: AuthenticatedUser,
  ) {
    const milkLot = await this.getMilkLot(milkLotId);
    const qualityParameters = await this.getQualityParameters();
    const { subanalyses, ...mainPayload } = payload;
    const evaluation = this.domainRulesService.evaluateAnalysis(qualityParameters, mainPayload);

    const { data: analysis, error: analysisError } = await this.supabaseService.admin
      .from('milk_lot_analyses')
      .insert({
        milk_lot_id: milkLotId,
        analyzed_at: new Date().toISOString(),
        ...mainPayload,
        approved: evaluation.approved,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      })
      .select('*')
      .single();

    if (analysisError) {
      throw new BadRequestException(analysisError.message);
    }

    if (subanalyses && subanalyses.length > 0) {
      const subanalysesInsertPayload = subanalyses.map((sub) => {
        const subEval = this.domainRulesService.evaluateAnalysis(qualityParameters, sub);
        return {
          milk_lot_analysis_id: analysis.id,
          analyzed_at: analysis.analyzed_at,
          ...sub,
          approved: subEval.approved,
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        };
      });

      const { data: insertedSubs, error: subanalysesError } = await this.supabaseService.admin
        .from('milk_lot_subanalyses')
        .insert(subanalysesInsertPayload)
        .select('*');

      if (subanalysesError) {
        throw new BadRequestException(subanalysesError.message);
      }

      analysis.subanalyses = insertedSubs;
    } else {
      analysis.subanalyses = [];
    }

    const currentRule = await this.getCurrentPriceRule(milkLot.received_at);
    const pricingCalc = currentRule
      ? this.domainRulesService.calculateMilkPricing(currentRule, mainPayload, milkLot.volume_liters)
      : null;

    let pricing: Record<string, unknown> | null = null;

    if (pricingCalc && currentRule) {
      const pricingInsert = await this.supabaseService.admin
        .from('milk_lot_pricing')
        .insert({
          milk_lot_id: milkLotId,
          producer_id: milkLot.producer_id,
          milk_price_rule_id: currentRule.id,
          base_price: pricingCalc.basePrice,
          fat_bonus: pricingCalc.fatBonus,
          protein_bonus: pricingCalc.proteinBonus,
          acidity_penalty: pricingCalc.acidityPenalty,
          cbt_penalty: pricingCalc.cbtPenalty,
          ccs_penalty: pricingCalc.ccsPenalty,
          temperature_penalty: pricingCalc.temperaturePenalty,
          final_price: pricingCalc.priceFinal,
          total_value: pricingCalc.totalValue,
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        })
        .select('*')
        .single();

      if (pricingInsert.error) {
        throw new BadRequestException(pricingInsert.error.message);
      }

      pricing = pricingInsert.data;
    }

    const status = evaluation.blocked ? MILK_LOT_STATUS.BLOCKED : MILK_LOT_STATUS.APPROVED;

    const { data: updatedLot, error: updateLotError } = await this.supabaseService.admin
      .from('milk_lots')
      .update({
        latest_analysis_id: analysis.id,
        status,
        cost_per_liter: pricingCalc?.priceFinal ?? null,
        total_value: pricingCalc?.totalValue ?? null,
        updated_by: user?.id ?? null,
      })
      .eq('id', milkLotId)
      .select('*')
      .single();

    if (updateLotError) {
      throw new BadRequestException(updateLotError.message);
    }

    if (evaluation.blocked) {
      await this.createBlockEvent(milkLotId, evaluation.reasonNames, user);
    } else if (pricingCalc) {
      await this.upsertFinancialEntry(updatedLot, pricingCalc.totalValue, user);
    }

    return {
      lot: updatedLot,
      analysis,
      pricing,
      evaluation,
    };
  }

  private async getMilkLot(id: string) {
    const { data, error } = await this.supabaseService.admin
      .from('milk_lots')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Milk lot not found');
    }

    return data;
  }

  private async getQualityParameters() {
    const { data, error } = await this.supabaseService.admin
      .from('quality_parameters')
      .select('*')
      .eq('active', true);

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data ?? [];
  }

  private async getCurrentPriceRule(receivedAt: string) {
    const effectiveDate = receivedAt.slice(0, 10);
    const { data, error } = await this.supabaseService.admin
      .from('milk_price_rules')
      .select('*')
      .eq('active', true)
      .lte('start_date', effectiveDate)
      .gte('end_date', effectiveDate)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data;
  }

  private async createBlockEvent(
    lotId: string,
    reasonNames: string[],
    user?: AuthenticatedUser,
  ) {
    const reasons = await this.supabaseService.admin
      .from('block_reasons')
      .select('id, name')
      .in('name', reasonNames);

    if (reasons.error) {
      throw new BadRequestException(reasons.error.message);
    }

    const payload = reasonNames.map((reasonName) => {
      const match = reasons.data?.find((reason) => reason.name === reasonName);
      return {
        lot_type: 'Leite',
        lot_id: lotId,
        block_reason_id: match?.id ?? null,
        reason_snapshot: reasonName,
        automatic: true,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      };
    });

    const { error } = await this.supabaseService.admin.from('lot_block_events').insert(payload);

    if (error) {
      throw new BadRequestException(error.message);
    }
  }

  private async upsertFinancialEntry(
    lot: Record<string, unknown>,
    totalValue: number,
    user?: AuthenticatedUser,
  ) {
    const description = `Folha do leite - ${lot.code as string}`;

    const { error } = await this.supabaseService.admin.from('financial_entries').insert({
      entry_type: 'Pagar',
      description,
      amount: totalValue,
      due_date: lot.received_at,
      status: 'Aberto',
      category: 'Matéria Prima',
      producer_id: lot.producer_id,
      reference_table: 'milk_lots',
      reference_id: lot.id,
      created_by: user?.id ?? null,
      updated_by: user?.id ?? null,
    });

    if (error && !error.message.includes('duplicate')) {
      throw new BadRequestException(error.message);
    }
  }

  async deleteAnalysis(id: string) {
    const { data: analysis, error: analysisError } = await this.supabaseService.admin
      .from('milk_lot_analyses')
      .select('id, milk_lot_id')
      .eq('id', id)
      .maybeSingle();

    if (analysisError) {
      throw new BadRequestException(analysisError.message);
    }

    if (!analysis) {
      throw new NotFoundException('Análise não encontrada');
    }

    const { data: lot, error: lotFindError } = await this.supabaseService.admin
      .from('milk_lots')
      .select('id, volume_liters, available_volume_liters')
      .eq('id', analysis.milk_lot_id)
      .maybeSingle();

    if (lotFindError) {
      throw new BadRequestException(lotFindError.message);
    }

    if (lot && lot.available_volume_liters < lot.volume_liters) {
      throw new BadRequestException('Não é possível excluir a análise pois o lote já foi parcialmente ou totalmente consumido na produção.');
    }

    const { error: deleteError } = await this.supabaseService.admin
      .from('milk_lot_analyses')
      .delete()
      .eq('id', id);

    if (deleteError) {
      throw new BadRequestException(deleteError.message);
    }

    if (lot) {
      await this.supabaseService.admin
        .from('milk_lots')
        .update({ status: MILK_LOT_STATUS.PENDING_ANALYSIS, latest_analysis_id: null, cost_per_liter: null, total_value: null })
        .eq('id', lot.id);
        
      await this.supabaseService.admin
        .from('milk_lot_pricing')
        .delete()
        .eq('milk_lot_id', lot.id);

      await this.supabaseService.admin
        .from('lot_block_events')
        .delete()
        .eq('lot_id', lot.id);

      await this.supabaseService.admin
        .from('financial_entries')
        .delete()
        .eq('reference_table', 'milk_lots')
        .eq('reference_id', lot.id);
    }

    return { success: true };
  }
}
