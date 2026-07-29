// tests/infinitepay.test.ts
// Cliente da API de Checkout Integrado da InfinitePay (contrato confirmado ao
// vivo 29/07: POST /links gera o link só com o handle público; POST
// /payment_check confirma se pagou — usado pra BLINDAR o webhook, que NÃO tem
// assinatura/HMAC).
import { describe, it, expect, vi } from 'vitest';
import {
  montarCorpoLink, parseRespostaLink, montarCorpoCheck, parseRespostaCheck,
  criarLinkPagamento, verificarPagamento, webhookConfirmado,
} from '../src/modules/infinitepay.js';

describe('montarCorpoLink', () => {
  it('monta o corpo: handle sem $, itens com price em CENTAVOS, order_nsu', () => {
    const body = montarCorpoLink({
      handle: '$ecosunpower',
      orderNsu: 'contrato-42',
      itens: [{ descricao: 'Serviço', valorCentavos: 2011582 }],
      redirectUrl: 'https://ecosunpower.eng.br/obrigado',
      webhookUrl: 'https://app.ecosunpower.eng.br/webhook/infinitepay',
      cliente: { nome: 'Superbom', email: 's@x.com', telefone: '+5561999998888' },
    });
    expect(body).toEqual({
      handle: 'ecosunpower', // o $ é só visual — a API quer sem
      order_nsu: 'contrato-42',
      items: [{ quantity: 1, price: 2011582, description: 'Serviço' }],
      redirect_url: 'https://ecosunpower.eng.br/obrigado',
      webhook_url: 'https://app.ecosunpower.eng.br/webhook/infinitepay',
      customer: { name: 'Superbom', email: 's@x.com', phone_number: '+5561999998888' },
    });
  });

  it('arredonda centavos e usa quantidade default 1; sem cliente/urls omite os campos', () => {
    const body = montarCorpoLink({ handle: 'ecosunpower', orderNsu: 'x', itens: [{ descricao: 'A', valorCentavos: 100.6 }] });
    expect(body.items).toEqual([{ quantity: 1, price: 101, description: 'A' }]);
    expect('customer' in body).toBe(false);
    expect('webhook_url' in body).toBe(false);
  });
});

describe('parseRespostaLink', () => {
  it('extrai a url', () => {
    expect(parseRespostaLink({ url: 'https://checkout.infinitepay.io/ecosunpower?lenc=abc' }))
      .toBe('https://checkout.infinitepay.io/ecosunpower?lenc=abc');
  });
  it('sem url válida → null', () => {
    expect(parseRespostaLink({})).toBeNull();
    expect(parseRespostaLink({ url: '' })).toBeNull();
    expect(parseRespostaLink(null)).toBeNull();
  });
});

describe('montarCorpoCheck (confirmar pagamento)', () => {
  it('monta o corpo do payment_check', () => {
    expect(montarCorpoCheck({ handle: '$ecosunpower', orderNsu: 'contrato-42', transactionNsu: 'tx-1', slug: 'fatura-9' }))
      .toEqual({ handle: 'ecosunpower', order_nsu: 'contrato-42', transaction_nsu: 'tx-1', slug: 'fatura-9' });
  });
});

describe('parseRespostaCheck', () => {
  it('pago=true com valores', () => {
    expect(parseRespostaCheck({ success: true, paid: true, amount: 2011582, paid_amount: 2011582, installments: 1, capture_method: 'pix' }))
      .toEqual({ pago: true, valorCentavos: 2011582, pagoCentavos: 2011582, parcelas: 1, metodo: 'pix' });
  });
  it('não pago', () => {
    expect(parseRespostaCheck({ success: true, paid: false }).pago).toBe(false);
  });
});

describe('webhookConfirmado (blindagem anti-fraude)', () => {
  // O webhook NÃO tem HMAC: nunca confia no payload cru. Confirma com o
  // payment_check E exige que o valor pago bata com o esperado.
  const wh = { order_nsu: 'contrato-42', transaction_nsu: 'tx-1', invoice_slug: 'fatura-9', amount: 2011582 };

  it('confirma quando o payment_check diz pago E o valor bate', async () => {
    const check = vi.fn().mockResolvedValue({ ok: true, pago: true, pagoCentavos: 2011582, metodo: 'pix' });
    const r = await webhookConfirmado(wh, 2011582, check as any);
    expect(r.confirmado).toBe(true);
    expect(check).toHaveBeenCalledWith(expect.objectContaining({ orderNsu: 'contrato-42', transactionNsu: 'tx-1', slug: 'fatura-9' }));
  });

  it('REJEITA webhook falso: payment_check diz que não pagou', async () => {
    const check = vi.fn().mockResolvedValue({ ok: true, pago: false });
    const r = await webhookConfirmado(wh, 2011582, check as any);
    expect(r.confirmado).toBe(false);
  });

  it('REJEITA quando o valor pago é MENOR que o esperado (pagou de menos)', async () => {
    const check = vi.fn().mockResolvedValue({ ok: true, pago: true, pagoCentavos: 1000, metodo: 'pix' });
    const r = await webhookConfirmado(wh, 2011582, check as any);
    expect(r.confirmado).toBe(false);
  });

  it('erro na verificação (rede) → não confirma MAS pede retry (erroVerificacao)', async () => {
    const check = vi.fn().mockResolvedValue({ ok: false, reason: 'network: x' });
    const r = await webhookConfirmado(wh, 2011582, check as any);
    expect(r.confirmado).toBe(false);
    expect(r.erroVerificacao).toBe(true);
  });
});

describe('criarLinkPagamento (rede, com fetch injetado)', () => {
  it('POST /links → devolve a url', async () => {
    const fake = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ url: 'https://checkout.infinitepay.io/ecosunpower?lenc=z' }) });
    const r = await criarLinkPagamento({ handle: 'ecosunpower', orderNsu: 'x', itens: [{ descricao: 'A', valorCentavos: 100 }] }, fake as any);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url).toContain('checkout.infinitepay.io');
    const [url, init] = fake.mock.calls[0];
    expect(url).toBe('https://api.checkout.infinitepay.io/links');
    expect(init.method).toBe('POST');
  });
  it('erro HTTP → ok:false', async () => {
    const fake = vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ error: 'handle inválido' }) });
    const r = await criarLinkPagamento({ handle: 'x', orderNsu: 'x', itens: [{ descricao: 'A', valorCentavos: 100 }] }, fake as any);
    expect(r.ok).toBe(false);
  });
});
