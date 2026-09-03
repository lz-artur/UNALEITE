import { describe, expect, it } from 'vitest';
import { calcularEstatisticas } from './mockData';

describe('calcularEstatisticas', () => {
  it('sempre entrega os indicadores numéricos exigidos pelo dashboard', () => {
    const stats = calcularEstatisticas();

    expect(Number.isFinite(stats.custoMedioKg)).toBe(true);
    expect(Number.isFinite(stats.ticketMedioCustoKg)).toBe(true);
  });
});
