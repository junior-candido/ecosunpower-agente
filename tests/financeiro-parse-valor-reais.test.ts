import { describe, it, expect } from 'vitest';
import { parseValorReais } from '../src/modules/financeiro/comando-imposto.js';

describe('financeiro/parseValorReais', () => {
  it('lê número puro', () => expect(parseValorReais('30000')).toBe(30000));
  it('lê milhar com ponto', () => expect(parseValorReais('30.000')).toBe(30000));
  it('lê milhar + decimal BR', () => expect(parseValorReais('30.000,50')).toBe(30000.5));
  it('lê com R$', () => expect(parseValorReais('R$ 30.000')).toBe(30000));
  it('lê "30 mil"', () => expect(parseValorReais('30 mil')).toBe(30000));
  it('lê "30k"', () => expect(parseValorReais('30k')).toBe(30000));
  it('lê decimal americano copiado', () => expect(parseValorReais('1500.50')).toBe(1500.5));
  it('lê "1,5 mi" como milhão', () => expect(parseValorReais('1,5 mi')).toBe(1500000));
  it('rejeita lixo', () => expect(parseValorReais('oi tudo bem')).toBeNull());
  it('rejeita vazio', () => expect(parseValorReais('   ')).toBeNull());
  it('rejeita zero', () => expect(parseValorReais('0')).toBeNull());
  it('rejeita negativo', () => expect(parseValorReais('-50')).toBeNull());
});
