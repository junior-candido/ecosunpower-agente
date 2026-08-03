import { describe, it, expect } from 'vitest';
import {
  parcelaCartaoSolar,
  tabelaCartaoSolar,
  frasePagamentoCartao,
  parcelaCartaoBelenus,
  parcelaCartaoSolFacil,
  parcelasMaxCartaoSolar,
  BELENUS_ACRESCIMO,
  SOLFACIL_TAXA,
} from '../src/modules/proposal/cartao-solar.js';

// Esta é a tabela do cartão QUE O CLIENTE PAGA — a mesma que a proposta usa.
// A Central de Contratos tinha nascido com OUTRA (a do custo do kit na Solfácil):
// o cliente leria "24x de R$ 1.947" na proposta e assinaria "12x de R$ 2.006" no
// contrato. Agora é uma fonte só.
//
// Desde 03/08/2026 são DUAS tabelas vivas (dois distribuidores do Junior):
// 'parceria'  → tabela Belenus até 24× (acréscimo por fora, degraus por faixa)
// 'solfacil'  → parcelamento Sol Fácil/Fortlev até 18× (taxa POR DENTRO:
//               total = valor ÷ (1 − taxa), sem juros até 3×)
// Nome de distribuidor NUNCA aparece pro cliente — pra ele é "Cartão de crédito".

describe('tabela da parceria (até 24×) continua intacta', () => {
  it('calibrada pelo Junior em 07/06/2026', () => {
    expect(BELENUS_ACRESCIMO[12]).toBe(0.1149);
    expect(BELENUS_ACRESCIMO[21]).toBe(0.1888);
    expect(BELENUS_ACRESCIMO[24]).toBe(0.2105);
  });

  it('a conta é a mesma que a proposta faz', () => {
    const valor = 20959.09;
    expect(parcelaCartaoSolar(valor, 24, 'parceria')!.parcela).toBeCloseTo(parcelaCartaoBelenus(valor, 24), 1);
  });

  it('o caso do Junior: a bandeira só liberou 21x', () => {
    const r = parcelaCartaoSolar(20959.09, 21, 'parceria')!;
    expect(r.parcela).toBeCloseTo(1186.48, 1);
    expect(r.acrescimo).toBeCloseTo(0.1888, 2);
  });

  it('vai até 24× e é a tabela padrão (compatibilidade com quem já chamava sem escolher)', () => {
    expect(parcelasMaxCartaoSolar()).toBe(24);
    expect(parcelasMaxCartaoSolar('parceria')).toBe(24);
    expect(parcelaCartaoSolar(20959.09, 24)).not.toBeNull();
    expect(parcelaCartaoSolar(20959.09, 25)).toBeNull();
  });
});

describe('tabela Sol Fácil/Fortlev (até 18×, taxa por dentro)', () => {
  it('taxas-chave conferidas na imagem de 01/08', () => {
    expect(SOLFACIL_TAXA[3]).toBe(0);       // sem juros até 3×
    expect(SOLFACIL_TAXA[10]).toBe(0.0485);
    expect(SOLFACIL_TAXA[12]).toBe(0.0639);
    expect(SOLFACIL_TAXA[18]).toBe(0.1079);
  });

  it('golden do Junior (01/08): R$ 26.400 em 18× → parcela R$ 1.644,06', () => {
    const r = parcelaCartaoSolar(26400, 18, 'solfacil')!;
    expect(r.parcela).toBeCloseTo(1644.06, 1);
    expect(r.total).toBeCloseTo(29593.1, 0);
  });

  it('sem juros até 3×: total é exatamente o valor à vista', () => {
    const r = parcelaCartaoSolar(26400, 3, 'solfacil')!;
    expect(r.parcela).toBeCloseTo(8800, 2);
    expect(r.total).toBeCloseTo(26400, 2);
    expect(r.acrescimo).toBeCloseTo(0, 6);
  });

  it('vai até 18×, nunca além', () => {
    expect(parcelasMaxCartaoSolar('solfacil')).toBe(18);
    expect(parcelaCartaoSolar(20959.09, 18, 'solfacil')).not.toBeNull();
    expect(parcelaCartaoSolar(20959.09, 19, 'solfacil')).toBeNull();
  });

  it('a conta bate com a fórmula por dentro', () => {
    const valor = 20959.09;
    expect(parcelaCartaoSolar(valor, 18, 'solfacil')!.parcela).toBeCloseTo(parcelaCartaoSolFacil(valor, 18), 1);
  });
});

describe('a frase do contrato', () => {
  it('não cita distribuidor em NENHUMA tabela (o nome pode mudar)', () => {
    for (const tabela of ['parceria', 'solfacil'] as const) {
      const f = frasePagamentoCartao(20959.09, 18, tabela);
      expect(f).toContain('Cartão de crédito');
      expect(f).toContain('18x');
      expect(f.toLowerCase()).not.toContain('belenus');
      expect(f.toLowerCase()).not.toMatch(/sol\s*f[aá]cil|fortlev/);
    }
  });

  it('parcela impossível → frase vazia (nunca chuta número em contrato)', () => {
    expect(frasePagamentoCartao(20959.09, 30)).toBe('');
    expect(frasePagamentoCartao(20959.09, 19, 'solfacil')).toBe('');
    expect(frasePagamentoCartao(0, 12)).toBe('');
  });
});

describe('o total impresso fecha com a parcela', () => {
  it('parcela × n é exatamente o total da frase, nas duas tabelas', () => {
    for (const n of [1, 3, 12, 18]) {
      for (const tabela of ['parceria', 'solfacil'] as const) {
        const r = parcelaCartaoSolar(20959.09, n, tabela)!;
        expect(r.total).toBeCloseTo(r.parcela * n, 2);
      }
    }
  });

  it('parceria sempre custa mais que o à vista; Sol Fácil só a partir de 4×', () => {
    for (const l of tabelaCartaoSolar(20959.09, 'parceria')) {
      expect(l.total).toBeGreaterThan(20959.09);
    }
    for (const l of tabelaCartaoSolar(20959.09, 'solfacil')) {
      if (l.parcelas <= 3) expect(l.total).toBeCloseTo(20959.09, 0);
      else expect(l.total).toBeGreaterThan(20959.09);
    }
  });

  it('as tabelas vão de 1× ao teto de cada uma', () => {
    const p = tabelaCartaoSolar(20000, 'parceria');
    expect(p[0].parcelas).toBe(1);
    expect(p[p.length - 1].parcelas).toBe(24);
    const s = tabelaCartaoSolar(20000, 'solfacil');
    expect(s[0].parcelas).toBe(1);
    expect(s[s.length - 1].parcelas).toBe(18);
  });
});
