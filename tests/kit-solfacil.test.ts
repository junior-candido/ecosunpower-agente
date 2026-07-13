import { describe, it, expect } from 'vitest';
import { precoDoKit, parcelaKit, tabelaKit, SOLFACIL } from '../src/modules/custos/kit-solfacil.js';

// ⚠️ Isto é o CUSTO do kit (o que a EcoSun paga pra Solfácil), NÃO o que o cliente
// paga. O cliente paga pela tabela do cartão (proposal/cartao-solar.ts).
//
// Os números abaixo são 2 orçamentos REAIS que o Junior mandou: o mesmo carrinho,
// um com frete e outro sem. Se a Solfácil mudar a taxa, é aqui que a suíte grita —
// por isso a tolerância é de CENTAVOS, não de reais (o teste antigo tolerava R$ 1,00
// por parcela, o que esconderia uma mudança de taxa de verdade).

describe('precoDoKit — a conta do orçamento da Solfácil', () => {
  it('bate com o carrinho real: equipamento + seguro (1%) + frete', () => {
    const p = precoDoKit(21390.34, 932.41)!;
    expect(p.seguro).toBeCloseTo(213.90, 1); // 1% do equipamento
    expect(p.total).toBeCloseTo(22536.66, 1); // total informado na tela
    expect(p.financiamento).toBeCloseTo(20283.00, 1); // 10% OFF
    expect(p.pix).toBeCloseTo(20959.09, 1); // 7% OFF
  });

  it('valor sem sentido → null (não inventa preço)', () => {
    expect(precoDoKit(0)).toBeNull();
    expect(precoDoKit(NaN)).toBeNull();
    expect(precoDoKit(-5)).toBeNull();
  });
});

describe('parcelaKit — bate com a tabela real, ao centavo', () => {
  const PIX_COM_FRETE = 20959.09;
  const PIX_SEM_FRETE = 20091.95;

  it.each([
    [6, 3820.68],
    [12, 2006.25],
    [18, 1403.47],
  ])('carrinho COM frete, %sx = R$ %s', (n, esperado) => {
    expect(parcelaKit(PIX_COM_FRETE, n as number)!.parcela).toBeCloseTo(esperado as number, 1);
  });

  it.each([
    [12, 1923.25],
    [18, 1345.41],
  ])('carrinho SEM frete, %sx = R$ %s', (n, esperado) => {
    expect(parcelaKit(PIX_SEM_FRETE, n as number)!.parcela).toBeCloseTo(esperado as number, 1);
  });

  it('até 3x é sem juros', () => {
    const r = parcelaKit(3000, 3)!;
    expect(r.comJuros).toBe(false);
    expect(r.parcela).toBe(1000);
  });

  it('não passa de 18x nem aceita bobagem', () => {
    expect(parcelaKit(20000, 19)).toBeNull();
    expect(parcelaKit(20000, 0)).toBeNull();
    expect(parcelaKit(0, 12)).toBeNull();
  });
});

describe('tabelaKit', () => {
  it('vai de 1x a 18x, e quanto mais parcela mais caro o total', () => {
    const t = tabelaKit(20000);
    expect(t[0].parcelas).toBe(1);
    expect(t[t.length - 1].parcelas).toBe(SOLFACIL.maxParcelas);
    const doze = t.find((l) => l.parcelas === 12)!;
    const dezoito = t.find((l) => l.parcelas === 18)!;
    expect(dezoito.total).toBeGreaterThan(doze.total);
    expect(dezoito.parcela).toBeLessThan(doze.parcela);
  });
});
