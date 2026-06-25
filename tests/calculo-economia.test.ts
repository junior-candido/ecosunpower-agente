import { describe, it, expect } from 'vitest';
import { calcularEconomiaAnual, calcularPaybackAnos } from '../src/modules/calculo-economia.js';

describe('calcularEconomiaAnual', () => {
  it('multiplica economia mensal por 12', () => {
    expect(calcularEconomiaAnual(800)).toBe(9600);
  });

  it('funciona com valores decimais', () => {
    expect(calcularEconomiaAnual(333.33)).toBeCloseTo(3999.96);
  });

  it('retorna 0 quando economia mensal é 0', () => {
    expect(calcularEconomiaAnual(0)).toBe(0);
  });
});

describe('calcularPaybackAnos', () => {
  it('calcula payback normal: R$50.000 investimento, R$800/mês economia', () => {
    // 50000 / (800 * 12) = 50000 / 9600 ≈ 5.208 anos
    expect(calcularPaybackAnos(50_000, 800)).toBeCloseTo(5.208, 2);
  });

  it('retorna null quando economia mensal é 0 (evita divisão por zero)', () => {
    expect(calcularPaybackAnos(50_000, 0)).toBeNull();
  });

  it('retorna null quando economia mensal é negativa', () => {
    expect(calcularPaybackAnos(50_000, -100)).toBeNull();
  });

  it('retorna 0 quando investimento é 0', () => {
    expect(calcularPaybackAnos(0, 800)).toBe(0);
  });
});
