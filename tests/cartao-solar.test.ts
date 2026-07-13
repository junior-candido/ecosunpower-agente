import { describe, it, expect } from 'vitest';
import {
  parcelaCartaoSolar,
  tabelaCartaoSolar,
  frasePagamentoCartao,
  parcelaCartaoBelenus,
  parcelasMaxCartaoSolar,
  BELENUS_ACRESCIMO,
} from '../src/modules/proposal/cartao-solar.js';

// Esta é a tabela do cartão QUE O CLIENTE PAGA — a mesma que a proposta usa.
// A Central de Contratos tinha nascido com OUTRA (a do custo do kit na Solfácil):
// o cliente leria "24x de R$ 1.947" na proposta e assinaria "12x de R$ 2.006" no
// contrato. Agora é uma fonte só.

describe('a tabela do cartão é a mesma da proposta', () => {
  it('a tabela Belenus continua intacta (calibrada pelo Junior em 07/06/2026)', () => {
    expect(BELENUS_ACRESCIMO[12]).toBe(0.1149);
    expect(BELENUS_ACRESCIMO[21]).toBe(0.1888);
    expect(BELENUS_ACRESCIMO[24]).toBe(0.2105);
  });

  it('a conta é a mesma que a proposta faz', () => {
    const valor = 20959.09;
    expect(parcelaCartaoSolar(valor, 24)!.parcela).toBeCloseTo(parcelaCartaoBelenus(valor, 24), 1);
  });
});

// O caso que originou tudo: "falei 24x sem juros, a bandeira só liberou 21x".
// A calculadora ANTIGA parava em 18x — não conseguia calcular o único caso real.
describe('o caso do Junior: a bandeira só liberou 21x', () => {
  it('calcula 21x (antes nem chegava lá)', () => {
    const r = parcelaCartaoSolar(20959.09, 21)!;
    expect(r).not.toBeNull();
    expect(r.parcelas).toBe(21);
    // 20.959,09 × 1,1888 = 24.916,15 → /21
    expect(r.parcela).toBeCloseTo(1186.48, 1);
    expect(r.acrescimo).toBeCloseTo(0.1888, 2);
  });

  it('vai até 24x', () => {
    expect(parcelasMaxCartaoSolar()).toBe(24);
    expect(parcelaCartaoSolar(20959.09, 24)).not.toBeNull();
    expect(parcelaCartaoSolar(20959.09, 25)).toBeNull();
  });

  it('a frase do contrato não cita o parceiro (o nome pode mudar)', () => {
    const f = frasePagamentoCartao(20959.09, 21);
    expect(f).toContain('Cartão de crédito');
    expect(f).toContain('21x');
    expect(f).not.toContain('Belenus');
    expect(f).not.toContain('Sol');
  });

  it('parcela impossível → frase vazia (nunca chuta número em contrato)', () => {
    expect(frasePagamentoCartao(20959.09, 30)).toBe('');
    expect(frasePagamentoCartao(0, 12)).toBe('');
  });
});

describe('o total impresso fecha com a parcela', () => {
  it('parcela × n é exatamente o total da frase (contrato não pode ter 2 valores)', () => {
    for (const n of [1, 3, 12, 21, 24]) {
      const r = parcelaCartaoSolar(20959.09, n)!;
      expect(r.total).toBeCloseTo(r.parcela * n, 2);
    }
  });

  it('parcelar sempre custa mais que o à vista', () => {
    const t = tabelaCartaoSolar(20959.09);
    for (const l of t) expect(l.total).toBeGreaterThan(20959.09);
  });

  it('a tabela vai de 1x a 24x', () => {
    const t = tabelaCartaoSolar(20000);
    expect(t[0].parcelas).toBe(1);
    expect(t[t.length - 1].parcelas).toBe(24);
  });
});
