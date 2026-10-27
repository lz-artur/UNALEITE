import { DomainRulesService } from './domain-rules.service';

describe('DomainRulesService', () => {
  const service = new DomainRulesService();

  it('blocks a lot when alizarol is reproved', () => {
    const result = service.evaluateAnalysis(
      [],
      {
        alizarol: 'Reprovado',
        antibioticos: 'Não Detectado',
      },
    );

    expect(result.blocked).toBe(true);
    expect(result.reasonNames).toContain('Alizarol reprovado');
  });

  it('calculates milk pricing with quality bonuses and penalties', () => {
    const result = service.calculateMilkPricing(
      {
        base_price: 2.3,
        fat_bonus: 0.05,
        protein_bonus: 0.03,
        acidity_penalty: -0.04,
        cbt_penalty: -0.05,
        ccs_penalty: -0.05,
        temperature_penalty: -0.03,
      },
      {
        alizarol: 'Aprovado',
        antibioticos: 'Não Detectado',
        gordura: 3.5,
        proteina: 3.2,
        acidez: 16,
        cbt: 50000,
        ccs: 300000,
        temperatura: 4,
      },
      1000,
    );

    expect(result.priceFinal).toBeCloseTo(2.38, 4);
    expect(result.totalValue).toBeCloseTo(2380, 4);
  });

  it('calculates expected yield and fat adjustment', () => {
    expect(service.calculateExpectedYield(1000, 10)).toBe(100);
    expect(service.calculateFatAdjustment(8000, 3.3, 2.8)).toBe(40);
  });

  describe('5% piece exit tolerance', () => {
    it('calculates 5% tolerance correctly for Q = 100 (95 to 105)', () => {
      const tolerance = service.calculatePieceExitTolerance(100);
      expect(tolerance.minPieces).toBe(95);
      expect(tolerance.maxPieces).toBe(105);
      expect(tolerance.isWithinTolerance(94)).toBe(false);
      expect(tolerance.isWithinTolerance(95)).toBe(true);
      expect(tolerance.isWithinTolerance(100)).toBe(true);
      expect(tolerance.isWithinTolerance(105)).toBe(true);
      expect(tolerance.isWithinTolerance(106)).toBe(false);
    });

    it('calculates tolerance for Q = 20 (19 to 21)', () => {
      const tolerance = service.calculatePieceExitTolerance(20);
      expect(tolerance.minPieces).toBe(19);
      expect(tolerance.maxPieces).toBe(21);
    });

    it('accepts exits exactly at lower and upper limits when stock is available', () => {
      expect(
        service.validatePieceExit({
          authorizedPieces: 100,
          actualPieces: 95,
          availablePieces: 150,
          operationName: 'expedição',
        }),
      ).toEqual({ valid: true, minPieces: 95, maxPieces: 105 });

      expect(
        service.validatePieceExit({
          authorizedPieces: 100,
          actualPieces: 105,
          availablePieces: 150,
          operationName: 'expedição',
        }),
      ).toEqual({ valid: true, minPieces: 95, maxPieces: 105 });
    });

    it('rejects exits outside 5% tolerance (e.g. 94 or 106 pieces for Q = 100)', () => {
      expect(() =>
        service.validatePieceExit({
          authorizedPieces: 100,
          actualPieces: 94,
          availablePieces: 150,
          operationName: 'expedição',
        }),
      ).toThrow('fora do intervalo de tolerância de 5% permitido (95 a 105');

      expect(() =>
        service.validatePieceExit({
          authorizedPieces: 100,
          actualPieces: 106,
          availablePieces: 150,
          operationName: 'expedição',
        }),
      ).toThrow('fora do intervalo de tolerância de 5% permitido (95 a 105');
    });

    it('rejects exits when available stock is insufficient even if within tolerance', () => {
      expect(() =>
        service.validatePieceExit({
          authorizedPieces: 100,
          actualPieces: 98,
          availablePieces: 90,
          operationName: 'venda',
        }),
      ).toThrow('Saldo insuficiente no lote de produto acabado. Disponível: 90 peças, solicitado: 98 peças');
    });

    it('rejects non-integer piece quantities', () => {
      expect(() =>
        service.validatePieceExit({
          authorizedPieces: 100,
          actualPieces: 99.5,
          availablePieces: 150,
        }),
      ).toThrow('A quantidade de peças informada deve ser um número inteiro positivo');
    });

    it('allows exit without reference pieces if stock is available', () => {
      expect(
        service.validatePieceExit({
          actualPieces: 10,
          availablePieces: 20,
        }),
      ).toEqual({ valid: true });
    });
  });
});
