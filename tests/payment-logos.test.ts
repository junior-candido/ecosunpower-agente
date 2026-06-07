import { describe, it, expect } from 'vitest';
import { logoMeioPagamento } from '../src/modules/proposal/payment-logos.js';

describe('logoMeioPagamento', () => {
  it('pix: mostra o selo Pix (teal)', () => {
    const html = logoMeioPagamento('pix');
    expect(html).toContain('Pix');
    expect(html.toLowerCase()).toContain('32bcad'); // teal oficial do PIX
  });
  it('cartao: mostra as bandeiras VISA + Mastercard + elo', () => {
    const html = logoMeioPagamento('cartao');
    expect(html).toContain('VISA');
    expect(html.toLowerCase()).toContain('elo');
    expect(html.toLowerCase()).toContain('eb001b'); // vermelho Mastercard
  });
  it('financiamento ou ausente: sem logo (string vazia)', () => {
    expect(logoMeioPagamento('financiamento')).toBe('');
    expect(logoMeioPagamento(undefined)).toBe('');
  });
});
