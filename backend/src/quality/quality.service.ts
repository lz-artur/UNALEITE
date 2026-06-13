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
      .select('*')
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
    const evaluation = this.domainRulesService.evaluateAnalysis(qualityParameters, payload);

    const { data: analysis, error: analysisError } = await this.supabaseService.admin
      .from('milk_lot_analyses')
      .insert({
        milk_lot_id: milkLotId,
        analyzed_at: new Date().toISOString(),
        ...payload,
        approved: evaluation.approved,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      })
      .select('*')
      .single();

    if (analysisError) {
      throw new BadRequestException(analysisError.message);
    }

    const currentRule = await this.getCurrentPriceRule(milkLot.received_at);
    const pricingCalc = currentRule
      ? this.domainRulesService.calculateMilkPricing(currentRule, payload, milkLot.volume_liters)
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
}
