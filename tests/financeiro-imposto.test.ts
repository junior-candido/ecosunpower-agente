import { describe, it, expect } from 'vitest';
import {
  faixaPorRBT12,
  aliquotaEfetiva,
  impostoDaVenda,
  proximoSalto,
  fatorR,
  resolverAnexo,
  proLaboreMinimoParaAnexoIII,
} from '../src/modules/financeiro/imposto.js';

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

describe('financeiro/imposto: imposto de uma venda de R$ 30.000', () => {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  it('imposto por anexo no RBT12 de R$ 355.000', () => {
    expect(round2(impostoDaVenda(30000, 355000, 'I').imposto)).toBe(1688.03);
    expect(round2(impostoDaVenda(30000, 355000, 'III').imposto)).toBe(2569.01);
    expect(round2(impostoDaVenda(30000, 355000, 'V').imposto)).toBe(5019.72);
  });
  it('imposto Anexo III progressivo', () => {
    expect(round2(impostoDaVenda(30000, 150000, 'III').imposto)).toBe(1800);
    expect(round2(impostoDaVenda(30000, 700000, 'III').imposto)).toBe(3294);
  });
});

describe('financeiro/imposto: próximo salto de faixa', () => {
  it('aponta o limite e a distância', () => {
    expect(proximoSalto(355000)).toEqual({ limite: 360000, distancia: 5000 });
    expect(proximoSalto(150000)).toEqual({ limite: 180000, distancia: 30000 });
  });
  it('null quando já na última faixa', () => {
    expect(proximoSalto(4000000)).toBeNull();
  });
});

describe('financeiro/imposto: Fator R', () => {
  const round4 = (n: number) => Math.round(n * 1e4) / 1e4;
  it('>= 28% vai pro Anexo III; < 28% vai pro V', () => {
    expect(fatorR(100000, 355000).anexo).toBe('III'); // 28,17%
    expect(round4(fatorR(100000, 355000).ratio)).toBe(0.2817);
    expect(fatorR(90000, 355000).anexo).toBe('V');    // 25,35%
  });
  it('receita zero não divide por zero', () => {
    expect(fatorR(0, 0).ratio).toBe(0);
    expect(fatorR(0, 0).anexo).toBe('V');
  });
});

describe('financeiro/imposto: resolverAnexo aplica Fator R só em quem é sujeito', () => {
  it('atividade não sujeita usa o anexo padrão', () => {
    expect(resolverAnexo('I', false, 0, 355000)).toBe('I');   // comércio sempre I
    expect(resolverAnexo('III', false, 0, 355000)).toBe('III'); // instalação sempre III
  });
  it('atividade sujeita (agenciamento) vira III ou V pelo Fator R', () => {
    expect(resolverAnexo('V', true, 100000, 355000)).toBe('III'); // FR 28,17%
    expect(resolverAnexo('V', true, 90000, 355000)).toBe('V');    // FR 25,35%
  });
});

describe('financeiro/imposto: pró-labore mínimo pra manter Anexo III', () => {
  it('28% da receita, descontando outras folhas, dividido por 12', () => {
    // 0,28 * 355000 = 99400; sem outras folhas → 99400/12 = 8283,33/mês
    expect(Math.round(proLaboreMinimoParaAnexoIII(355000, 0))).toBe(8283);
    // com 12k de outras folhas no ano → (99400-12000)/12 = 7283,33
    expect(Math.round(proLaboreMinimoParaAnexoIII(355000, 12000))).toBe(7283);
  });
  it('nunca negativo', () => {
    expect(proLaboreMinimoParaAnexoIII(10000, 100000)).toBe(0);
  });
});
