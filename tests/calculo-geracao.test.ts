import { describe, it, expect } from 'vitest';
import { calcularGeracaoMensal, calcularGeracaoAnual } from '../src/modules/calculo-geracao.js';

describe('calcularGeracaoMensal', () => {
  it('calcula com os defaults de Brasília (hsp=5.40, fatorPerda=0.80)', () => {
    // 5 kWp × 5.40 × 30 × 0.80 = 648 kWh/mês
    expect(calcularGeracaoMensal(5)).toBeCloseTo(648, 1);
  });

  it('aceita hsp e fatorPerda customizados', () => {
    // 5 kWp × 4.5 × 30 × 0.75 = 506.25 kWh/mês
    expect(calcularGeracaoMensal(5, 4.5, 0.75)).toBeCloseTo(506.25, 1);
  });

  it('retorna 0 quando potência é 0', () => {
    expect(calcularGeracaoMensal(0)).toBe(0);
  });

  it('retorna 0 quando potência é negativa', () => {
    expect(calcularGeracaoMensal(-3)).toBe(0);
  });
});

describe('calcularGeracaoAnual', () => {
  it('é exatamente 12x a geração mensal', () => {
    // 5 kWp × 5.40 × 30 × 0.80 × 12 = 7776 kWh/ano
    expect(calcularGeracaoAnual(5)).toBeCloseTo(7776, 0);
  });

  it('aceita hsp e fatorPerda customizados', () => {
    expect(calcularGeracaoAnual(5, 4.5, 0.75)).toBeCloseTo(6075, 0);
  });

  it('retorna 0 quando potência é 0', () => {
    expect(calcularGeracaoAnual(0)).toBe(0);
  });
});
