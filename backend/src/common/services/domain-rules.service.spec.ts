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
});
