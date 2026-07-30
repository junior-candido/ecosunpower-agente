// Par de links + vigia da forma (097): o cliente pagou DIFERENTE do
// combinado? A análise diz quanto sobrou/faltou usando a MESMA tabela da
// maquininha (JUROS_CARTAO_SERVICO — fonte única, conferida pelo Junior).
import { describe, it, expect } from 'vitest';
import { analisarFormaPaga, montarParDeLinks } from '../src/modules/cobranca-forma.js';

describe('montarParDeLinks (preços do par)', () => {
  it('Pix = valor líquido; cartão 12× = líquido ÷ (1 − 18,79%)', () => {
    const par = montarParDeLinks(1500000); // R$ 15.000,00 líquidos
    expect(par.pix.valorCentavos).toBe(1500000);
    expect(par.pix.forma).toBe('pix');
    expect(par.cartao.forma).toBe('cartao-12');
    expect(par.cartao.taxaPct).toBe(18.79);
    // 15000 / (1-0.1879) = 18470.6299... → arredonda centavos
    expect(par.cartao.valorCentavos).toBe(Math.round(1500000 / (1 - 0.1879)));
    expect(par.cartao.parcelaCentavos).toBe(Math.round(par.cartao.valorCentavos / 12));
  });
});

describe('analisarFormaPaga (o vigia)', () => {
  const base = { formaCombinada: 'pix', valorLiquidoCentavos: 1500000, valorCentavos: 1500000 };
  it('pagou como combinado → null (nada a avisar)', () => {
    expect(analisarFormaPaga(base, { metodo: 'pix' })).toBeNull();
    expect(analisarFormaPaga(
      { formaCombinada: 'cartao-12', valorLiquidoCentavos: 1500000, valorCentavos: 1846900 },
      { metodo: 'credit_card', parcelas: 12 },
    )).toBeNull();
  });
  it('link do PIX pago no CARTÃO 12× → FALTA dinheiro (alerta com a diferença)', () => {
    const m = analisarFormaPaga(base, { metodo: 'credit_card', parcelas: 12 });
    expect(m).toContain('⚠️');
    expect(m).toContain('CARTÃO em 12×');
    // recebido ≈ 15000×(1−0.1879)=12181,50 → faltam ≈ 2818,50
    expect(m).toContain('2.818,50');
  });
  it('link do CARTÃO pago no PIX → SOBRA (aviso bonzinho pra devolver/abater)', () => {
    const m = analisarFormaPaga(
      { formaCombinada: 'cartao-12', valorLiquidoCentavos: 1500000, valorCentavos: 1846900 },
      { metodo: 'pix' },
    );
    expect(m).toContain('sobr');
    expect(m).toContain('Pix');
  });
  it('cartão combinado 12× pago em MENOS parcelas → sobra pequena, aviso leve', () => {
    const m = analisarFormaPaga(
      { formaCombinada: 'cartao-12', valorLiquidoCentavos: 1500000, valorCentavos: 1846900 },
      { metodo: 'credit_card', parcelas: 3 },
    );
    expect(m).toContain('3×');
  });
  it('cobrança antiga sem forma combinada → null (compat)', () => {
    expect(analisarFormaPaga({ formaCombinada: null, valorLiquidoCentavos: null, valorCentavos: 1500000 }, { metodo: 'pix' })).toBeNull();
  });
});
