import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ANALYSIS_STATUS,
  MILK_LOT_STATUS,
  SUPPLY_LOT_STATUS,
} from '../constants/domain';

export interface PieceToleranceResult {
  referencePieces: number;
  minPieces: number;
  maxPieces: number;
  tolerancePercent: number;
  isWithinTolerance: (actualPieces: number) => boolean;
}

export interface ValidatePieceExitParams {
  authorizedPieces?: number | null;
  actualPieces?: number;
  requestedPieces?: number;
  availablePieces: number;
  operationName?: string;
  productName?: string;
  allowAdminOverride?: boolean;
}

interface QualityParameter {
  name: string;
  data_type: string;
  min_value?: number | null;
  max_value?: number | null;
  required: boolean;
  auto_block: boolean;
}

interface MilkPriceRule {
  base_price: number;
  fat_bonus: number;
  protein_bonus: number;
  acidity_penalty: number;
  cbt_penalty: number;
  ccs_penalty: number;
  temperature_penalty: number;
}

interface AnalysisPayload {
  alizarol: string;
  acidez?: number | null;
  crioscopia?: number | null;
  densidade?: number | null;
  antibioticos: string;
  gordura?: number | null;
  proteina?: number | null;
  cbt?: number | null;
  ccs?: number | null;
  temperatura?: number | null;
  alcool?: string | null;
  ph?: number | null;
  porcentagem_agua?: number | null;
  est?: number | null;
  esd?: number | null;
  redutase?: string | null;
}

@Injectable()
export class DomainRulesService {
  evaluateAnalysis(
    parameters: QualityParameter[],
    payload: AnalysisPayload,
  ): {
    approved: boolean;
    blocked: boolean;
    reasonNames: string[];
  } {
    const reasonNames: string[] = [];

    if (payload.alizarol === ANALYSIS_STATUS.REPROVED) {
      reasonNames.push('Alizarol reprovado');
    }

    if (payload.antibioticos === ANALYSIS_STATUS.DETECTED) {
      reasonNames.push('Antibiotico detectado');
    }

    if (payload.alcool === ANALYSIS_STATUS.REPROVED) {
      reasonNames.push('Álcool reprovado');
    }

    const valuesByLabel: Record<string, number | string | null | undefined> = {
      'Gordura %': payload.gordura,
      'Proteina %': payload.proteina,
      'Acidez': payload.acidez,
      'Crioscopia': payload.crioscopia,
      'Densidade': payload.densidade,
      'Alizarol': payload.alizarol,
      'Antibiotico': payload.antibioticos,
      'Temperatura': payload.temperatura,
      'Álcool': payload.alcool,
      'pH': payload.ph,
      'Porcentagem de Água': payload.porcentagem_agua,
      'EST': payload.est,
      'ESD': payload.esd,
      'Redutase': payload.redutase,
    };

    for (const parameter of parameters) {
      const value = valuesByLabel[parameter.name];

      if (parameter.required && (value === null || value === undefined || value === '')) {
        reasonNames.push(`Parâmetro obrigatório ausente: ${parameter.name}`);
        continue;
      }

      if (typeof value !== 'number') {
        continue;
      }

      const belowMin =
        typeof parameter.min_value === 'number' && value < parameter.min_value;
      const aboveMax =
        typeof parameter.max_value === 'number' && value > parameter.max_value;

      if ((belowMin || aboveMax) && parameter.auto_block) {
        reasonNames.push(`${parameter.name} fora do padrão`);
      }
    }

    return {
      approved: reasonNames.length === 0,
      blocked: reasonNames.length > 0,
      reasonNames,
    };
  }

  calculateMilkPricing(rule: MilkPriceRule, payload: AnalysisPayload, volumeLiters: number) {
    const fatBonus = payload.gordura && payload.gordura >= 3.4 ? rule.fat_bonus : 0;
    const proteinBonus = payload.proteina && payload.proteina >= 3.1 ? rule.protein_bonus : 0;
    const acidityPenalty =
      payload.acidez && payload.acidez > 18 ? rule.acidity_penalty : 0;
    const cbtPenalty = payload.cbt && payload.cbt > 100000 ? rule.cbt_penalty : 0;
    const ccsPenalty = payload.ccs && payload.ccs > 500000 ? rule.ccs_penalty : 0;
    const temperaturePenalty =
      payload.temperatura && payload.temperatura > 7 ? rule.temperature_penalty : 0;

    const priceFinal =
      rule.base_price +
      fatBonus +
      proteinBonus +
      acidityPenalty +
      cbtPenalty +
      ccsPenalty +
      temperaturePenalty;

    return {
      basePrice: rule.base_price,
      fatBonus,
      proteinBonus,
      acidityPenalty,
      cbtPenalty,
      ccsPenalty,
      temperaturePenalty,
      priceFinal,
      totalValue: priceFinal * volumeLiters,
    };
  }

  calculateFatAdjustment(
    litersToUse: number,
    currentFat?: number | null,
    targetFat?: number | null,
  ) {
    if (!currentFat || !targetFat || currentFat <= targetFat) {
      return 0;
    }

    const currentFatKg = (currentFat / 100) * litersToUse;
    const targetFatKg = (targetFat / 100) * litersToUse;
    return Number((currentFatKg - targetFatKg).toFixed(3));
  }

  calculateExpectedYield(litersToUse: number, theoreticalYield: number) {
    if (!theoreticalYield) {
      return 0;
    }

    return Number((litersToUse / theoreticalYield).toFixed(3));
  }

  calculateSupplyLotStatus(availableQuantity: number, expirationDate?: string | null) {
    // Desabilitado temporariamente para inserção de dados retroativos
    // if (expirationDate && new Date(expirationDate) < new Date()) {
    //   return SUPPLY_LOT_STATUS.EXPIRED;
    // }

    if (availableQuantity <= 0) {
      return SUPPLY_LOT_STATUS.USED;
    }

    return SUPPLY_LOT_STATUS.AVAILABLE;
  }

  calculateMilkLotStatus(availableVolume: number, approved: boolean) {
    if (!approved) {
      return MILK_LOT_STATUS.BLOCKED;
    }

    if (availableVolume <= 0) {
      return MILK_LOT_STATUS.USED;
    }

    return MILK_LOT_STATUS.PARTIALLY_USED;
  }

  /**
   * Calcula o intervalo permitido com tolerância percentual (padrão 5%) para peças.
   * Para quantidades inteiras de peças:
   * Limite mínimo: Math.ceil(Q * 0.95)
   * Limite máximo: Math.floor(Q * 1.05)
   * Exemplo para Q = 100: Min = 95, Max = 105.
   */
  calculatePieceExitTolerance(authorizedPieces: number, tolerancePercent = 5): PieceToleranceResult {
    if (!Number.isInteger(authorizedPieces) || authorizedPieces <= 0) {
      throw new BadRequestException('A quantidade de referência para peças deve ser um número inteiro positivo.');
    }

    const factor = tolerancePercent / 100;
    const minPieces = Math.ceil(authorizedPieces * (1 - factor));
    const maxPieces = Math.floor(authorizedPieces * (1 + factor));

    return {
      referencePieces: authorizedPieces,
      minPieces,
      maxPieces,
      tolerancePercent,
      isWithinTolerance: (actual: number) => Number.isInteger(actual) && actual >= minPieces && actual <= maxPieces,
    };
  }

  /**
   * Valida a saída de peças contra o saldo físico disponível e, quando aplicável,
   * contra a quantidade de referência autorizada com tolerância de 5%.
   */
  validatePieceExit(params: ValidatePieceExitParams): { valid: boolean; minPieces?: number; maxPieces?: number } {
    const { authorizedPieces, availablePieces } = params;
    const actualPieces = params.actualPieces ?? params.requestedPieces ?? 0;
    const operationName = params.operationName || (params.productName ? `saída de ${params.productName}` : undefined);

    if (!Number.isInteger(actualPieces) || actualPieces <= 0) {
      throw new BadRequestException('A quantidade de peças informada deve ser um número inteiro positivo.');
    }

    // Regra física inegociável: nunca permitir saída maior que o saldo em estoque
    if (actualPieces > availablePieces) {
      throw new BadRequestException(
        `Saldo insuficiente no lote de produto acabado. Disponível: ${availablePieces} peças, solicitado: ${actualPieces} peças.`,
      );
    }

    // Validação de tolerância de 5% se houver quantidade autorizada de referência
    if (authorizedPieces != null && authorizedPieces > 0) {
      const tolerance = this.calculatePieceExitTolerance(authorizedPieces, 5);
      if (!tolerance.isWithinTolerance(actualPieces)) {
        const prefix = operationName ? `Na operação de ${operationName}: ` : '';
        throw new BadRequestException(
          `${prefix}A quantidade de peças informada (${actualPieces}) está fora do intervalo de tolerância de 5% permitido (${tolerance.minPieces} a ${tolerance.maxPieces} peças para a quantidade autorizada de ${authorizedPieces} peças).`,
        );
      }
      return { valid: true, minPieces: tolerance.minPieces, maxPieces: tolerance.maxPieces };
    }

    return { valid: true };
  }
}
