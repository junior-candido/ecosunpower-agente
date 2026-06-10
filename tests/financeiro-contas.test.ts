import { describe, it, expect } from 'vitest';
import { calcularImpostoDaConta } from '../src/modules/financeiro/contas.js';

describe('financeiro/contas: cálculo do imposto de uma conta', () => {
  const round2 = (n: number) => Math.round(n * 100) / 100;

  it('instalação (Anexo III fixo) ignora Fator R', () => {
    const r = calcularImpostoDaConta({
      valor: 30000, rbt12: 355000, receita12: 355000,
      atividade: { anexo_padrao: 'III', sujeito_fator_r: false },
      proLabore12: 0, outrasFolhas12: 0,
    });
    expect(r.anexo).toBe('III');
    expect(round2(r.imposto)).toBe(2569.01);
  });

  it('comissão (sujeita a Fator R) cai no Anexo III quando folha >= 28%', () => {
    const r = calcularImpostoDaConta({
      valor: 30000, rbt12: 355000, receita12: 355000,
      atividade: { anexo_padrao: 'V', sujeito_fator_r: true },
      proLabore12: 100000, outrasFolhas12: 0, // FR 28,17%
    });
    expect(r.anexo).toBe('III');
    expect(round2(r.imposto)).toBe(2569.01);
  });

  it('comissão escorrega pro Anexo V quando folha < 28%', () => {
    const r = calcularImpostoDaConta({
      valor: 30000, rbt12: 355000, receita12: 355000,
      atividade: { anexo_padrao: 'V', sujeito_fator_r: true },
      proLabore12: 90000, outrasFolhas12: 0, // FR 25,35%
    });
    expect(r.anexo).toBe('V');
    expect(round2(r.imposto)).toBe(5019.72);
  });
});
