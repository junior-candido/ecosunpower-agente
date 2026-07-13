import { describe, it, expect } from 'vitest';
import {
  parcelaCartao,
  tabelaCartao,
  frasePagamento,
  SOLFACIL,
} from '../src/modules/closing/parcelamento-cartao.js';

// A taxa foi descoberta por engenharia reversa de 2 tabelas reais da Solfácil
// (mesmo carrinho, com e sem frete): base = valor + 3,19%, e daí Price a 1,689%
// ao mês. A regra reproduz as duas tabelas com erro de centavos.
describe('parcelaCartao — bate com a tabela real da Solfácil', () => {
  const PIX = 20959.09; // o carrinho com frete que o Junior mandou

  it.each([
    [4, 5636.98],
    [6, 3820.68],
    [12, 2006.25],
    [18, 1403.47],
  ])('%sx bate com a tabela (tolerância de 1 real)', (n, esperado) => {
    const r = parcelaCartao(PIX, n as number, SOLFACIL);
    expect(Math.abs(r.parcela - (esperado as number))).toBeLessThan(1);
  });

  it('o mesmo carrinho SEM frete também bate (a outra tabela)', () => {
    const semFrete = 20091.95;
    expect(Math.abs(parcelaCartao(semFrete, 12, SOLFACIL).parcela - 1923.25)).toBeLessThan(1);
    expect(Math.abs(parcelaCartao(semFrete, 18, SOLFACIL).parcela - 1345.41)).toBeLessThan(1);
  });

  it('devolve o total e avisa que tem juros', () => {
    const r = parcelaCartao(PIX, 12, SOLFACIL);
    expect(r.comJuros).toBe(true);
    expect(Math.abs(r.total - 24075.06)).toBeLessThan(2);
    expect(r.total).toBeGreaterThan(PIX); // parcelado sai mais caro que o à vista
  });

  it('até 3x é SEM JUROS — divide o valor e pronto', () => {
    const r = parcelaCartao(3000, 3, SOLFACIL);
    expect(r.comJuros).toBe(false);
    expect(r.parcela).toBe(1000);
    expect(r.total).toBe(3000);
  });

  it('não passa do limite de parcelas nem aceita bobagem', () => {
    expect(parcelaCartao(20000, 19, SOLFACIL)).toBeNull(); // Solfácil vai até 18x
    expect(parcelaCartao(20000, 0, SOLFACIL)).toBeNull();
    expect(parcelaCartao(0, 12, SOLFACIL)).toBeNull();
    expect(parcelaCartao(NaN, 12, SOLFACIL)).toBeNull();
  });
});

describe('tabelaCartao — a tabela inteira de uma venda', () => {
  it('vai de 1x até o limite', () => {
    const t = tabelaCartao(20000, SOLFACIL);
    expect(t[0].parcelas).toBe(1);
    expect(t[t.length - 1].parcelas).toBe(18);
    expect(t.filter((l) => !l.comJuros).map((l) => l.parcelas)).toEqual([1, 2, 3]);
  });

  it('quanto mais parcela, mais caro o total (e menor a parcela)', () => {
    const t = tabelaCartao(20000, SOLFACIL);
    const doze = t.find((l) => l.parcelas === 12)!;
    const dezoito = t.find((l) => l.parcelas === 18)!;
    expect(dezoito.parcela).toBeLessThan(doze.parcela);
    expect(dezoito.total).toBeGreaterThan(doze.total);
  });
});

describe('frasePagamento — o que vai escrito no contrato', () => {
  it('escreve em português, com o total', () => {
    const f = frasePagamento(20959.09, 12, SOLFACIL);
    expect(f).toContain('Sol Fácil');
    expect(f).toContain('12x');
    expect(f).toContain('2.006,2'); // a parcela, escrita como brasileiro escreve
    expect(f).toContain('total');
  });

  it('sem juros não fala em juros', () => {
    expect(frasePagamento(3000, 3, SOLFACIL)).toContain('sem juros');
  });

  it('parcela impossível → frase vazia (não inventa nada no contrato)', () => {
    expect(frasePagamento(20000, 99, SOLFACIL)).toBe('');
  });
});
