import { describe, it, expect } from 'vitest';
import {
  valorParcelaCartao,
  totalCartaoComTaxa,
  servicePaymentOptions,
  JUROS_CARTAO_SERVICO,
} from '../src/modules/proposal/service-payment.js';

describe('valorParcelaCartao (taxa da maquininha repassada: valor ÷ (1 − taxa) ÷ parcelas)', () => {
  it('R$ 1.000 em 3x = R$ 380,91 (número real da maquininha do Junior)', () => {
    // 1000 / (1 - 0,1249) / 3 = 380,9088... → 380,91
    expect(valorParcelaCartao(1000, 3)).toBeCloseTo(380.91, 2);
  });
  it('1x já tem a taxa (5,99%): R$ 1.000 → R$ 1.063,72', () => {
    expect(valorParcelaCartao(1000, 1)).toBeCloseTo(1063.72, 2);
  });
  it('12x (18,79%): total = valor ÷ (1 − 0,1879) e parcela R$ 102,61', () => {
    expect(totalCartaoComTaxa(1000, 12)).toBeCloseTo(1231.38, 1);
    expect(valorParcelaCartao(1000, 12)).toBeCloseTo(102.61, 2);
  });
  it('cobre as 12 parcelas (tabela completa)', () => {
    for (let n = 1; n <= 12; n++) {
      expect(JUROS_CARTAO_SERVICO[n]).toBeGreaterThan(0);
      expect(valorParcelaCartao(1000, n)).toBeGreaterThan(0);
    }
  });
});

describe('servicePaymentOptions (3 formas, SEM financiamento bancário)', () => {
  const opts = servicePaymentOptions(1000);
  it('tem exatamente 3 formas: à vista PIX, 50/50 PIX, cartão 12x', () => {
    expect(opts).toHaveLength(3);
    expect(opts.map(o => o.tipo)).toEqual(['À Vista', 'Parcelado', 'Cartão']);
  });
  it('NÃO tem financiamento bancário (só no solar)', () => {
    const texto = JSON.stringify(opts).toLowerCase();
    expect(texto).not.toContain('financiamento');
    expect(texto).not.toContain('banco');
  });
  it('à vista mostra o valor cheio sem juros e o PIX (CNPJ)', () => {
    const aVista = opts[0];
    expect(aVista.valorPrincipal).toContain('1.000');
    expect(JSON.stringify(aVista).toLowerCase()).toContain('pix');
    expect(JSON.stringify(aVista)).toContain('33.020.459');
  });
  it('50/50 mostra metade pra iniciar e metade no término', () => {
    const metade = opts[1];
    const txt = JSON.stringify(metade).toLowerCase();
    expect(metade.valorPrincipal).toContain('500');
    expect(txt).toContain('início');
    expect(txt).toContain('término');
  });
  it('cartão mostra o 12x calculado pela taxa da maquininha', () => {
    const cartao = opts[2];
    // 12x de 1231,38/12 = 102,61
    expect(cartao.valorPrincipal).toContain('12x');
    expect(JSON.stringify(cartao)).toContain('102,61');
  });
});
