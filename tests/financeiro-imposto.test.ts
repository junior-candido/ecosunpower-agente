import { describe, it, expect } from 'vitest';
import { faixaPorRBT12, aliquotaEfetiva } from '../src/modules/financeiro/imposto.js';

describe('financeiro/imposto: faixa por RBT12', () => {
  it('faixas pelos limites do Anexo (LC 123/2006)', () => {
    expect(faixaPorRBT12(150000)).toBe(1);
    expect(faixaPorRBT12(180000)).toBe(1);      // limite superior inclusivo
    expect(faixaPorRBT12(180000.01)).toBe(2);
    expect(faixaPorRBT12(355000)).toBe(2);
    expect(faixaPorRBT12(400000)).toBe(3);
    expect(faixaPorRBT12(1000000)).toBe(4);
    expect(faixaPorRBT12(3600000)).toBe(5);
    expect(faixaPorRBT12(4000000)).toBe(6);
  });
});

describe('financeiro/imposto: alíquota efetiva progressiva', () => {
  const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

  it('Anexo III progressivo bate com a lei', () => {
    expect(round4(aliquotaEfetiva(150000, 'III').efetiva)).toBe(0.06);     // 6,00%
    expect(round4(aliquotaEfetiva(355000, 'III').efetiva)).toBe(0.0856);   // 8,56%
    expect(round4(aliquotaEfetiva(400000, 'III').efetiva)).toBe(0.0909);   // 9,09%
    expect(round4(aliquotaEfetiva(700000, 'III').efetiva)).toBe(0.1098);   // 10,98%
    expect(round4(aliquotaEfetiva(1000000, 'III').efetiva)).toBe(0.1244);  // 12,44%
  });

  it('Anexo I (comércio) é mais barato que III no mesmo RBT12', () => {
    expect(round4(aliquotaEfetiva(355000, 'I').efetiva)).toBe(0.0563);     // 5,63%
  });

  it('Anexo V (agenciamento sem Fator R) é mais caro', () => {
    expect(round4(aliquotaEfetiva(355000, 'V').efetiva)).toBe(0.1673);     // 16,73%
  });

  it('RBT12 = 0 cai na faixa 1 sem dividir por zero', () => {
    expect(aliquotaEfetiva(0, 'III').efetiva).toBe(0.06);
    expect(aliquotaEfetiva(0, 'III').faixa).toBe(1);
  });
});
