import { describe, it, expect } from 'vitest';
import { estimarPorConta, precoParaKwp } from '../src/modules/proposal/lead-estimativa.js';

describe('estimarPorConta — números vêm das tabelas vetadas, nunca de cabeça', () => {
  it('conta R$600 (caso Vilma) dá sistema pequeno, NÃO R$25k', () => {
    const e = estimarPorConta(600);
    expect(e.kWp).toBeGreaterThanOrEqual(3);
    expect(e.kWp).toBeLessThanOrEqual(5.5);
    expect(e.paineis).toBeGreaterThanOrEqual(5);
    expect(e.paineis).toBeLessThanOrEqual(8);
    expect(e.precoRs).toBeGreaterThanOrEqual(9000);
    expect(e.precoRs).toBeLessThanOrEqual(15000);
    expect(e.economiaMensalRs).toBeCloseTo(600 * 0.93, 0);
  });

  it('preço interpola a tabela entre 4 e 5 kWp', () => {
    const p4 = precoParaKwp(4);
    const p5 = precoParaKwp(5);
    const p45 = precoParaKwp(4.5);
    expect(p45).toBeGreaterThan(p4);
    expect(p45).toBeLessThan(p5);
  });

  it('clampa nos extremos (abaixo de 3 kWp usa 3; acima de 75 usa 75)', () => {
    expect(precoParaKwp(2)).toBe(precoParaKwp(3));
    expect(precoParaKwp(100)).toBe(precoParaKwp(75));
  });

  it('conta muito baixa (R$250) devolve sistema mínimo coerente', () => {
    const e = estimarPorConta(250);
    expect(e.kWp).toBeGreaterThan(0);
    expect(e.precoRs).toBeGreaterThan(0);
  });
});
