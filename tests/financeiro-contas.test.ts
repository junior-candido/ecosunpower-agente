import { describe, it, expect } from 'vitest';
import { calcularImpostoDaConta, calcularParcelaRecebimento } from '../src/modules/financeiro/contas.js';

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

describe('financeiro/contas: acumulação de recebimento parcial (50/50)', () => {
  const aberta = { valor: 30000, valorRecebido: 0, impostoConfirmado: 0, status: 'pendente' };

  it('1ª parcela de 15k fica parcial', () => {
    expect(calcularParcelaRecebimento(aberta, 15000)).toEqual({ parcela: 15000, acumulado: 15000, total: false });
  });

  it('2ª parcela sem valor = saldo restante e fecha total', () => {
    const meio = { ...aberta, valorRecebido: 15000, status: 'recebido_parcial' };
    expect(calcularParcelaRecebimento(meio)).toEqual({ parcela: 15000, acumulado: 30000, total: true });
  });

  it('2ª parcela explícita de 15k fecha total', () => {
    const meio = { ...aberta, valorRecebido: 15000, status: 'recebido_parcial' };
    expect(calcularParcelaRecebimento(meio, 15000).total).toBe(true);
  });

  it('rejeita conta já recebida (re-clique do botão)', () => {
    expect(() => calcularParcelaRecebimento({ ...aberta, status: 'recebido' })).toThrow('já está recebido');
  });

  it('rejeita parcela negativa, zero e maior que o saldo', () => {
    expect(() => calcularParcelaRecebimento(aberta, 0)).toThrow();
    expect(() => calcularParcelaRecebimento(aberta, -5)).toThrow();
    expect(() => calcularParcelaRecebimento(aberta, 30001)).toThrow('maior que o saldo');
  });
});
