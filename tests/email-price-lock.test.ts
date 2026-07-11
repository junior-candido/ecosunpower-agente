import { describe, it, expect } from 'vitest';
import { contemPreco, aplicarTravaPreco, contemPrecoExplicito } from '../src/modules/email/price-lock.js';

describe('trava de preco', () => {
  it('detecta valores em reais', () => {
    expect(contemPreco('fica por R$ 19.900')).toBe(true);
    expect(contemPreco('economize 850 reais por mes')).toBe(true);
    expect(contemPreco('a partir de 12x de 499')).toBe(true);
    expect(contemPreco('parcelas de R$1.200,00')).toBe(true);
  });

  it('nao acusa texto sem preco', () => {
    expect(contemPreco('Ola Joao, tudo bem em Brasilia?')).toBe(false);
    expect(contemPreco('sua conta de luz pode cair muito')).toBe(false);
  });

  it('aplicarTravaPreco troca o texto suspeito pelo fallback', () => {
    expect(aplicarTravaPreco('sai por R$ 19.900', 'Ola!')).toBe('Ola!');
    expect(aplicarTravaPreco('Ola Joao', 'fallback')).toBe('Ola Joao');
  });

  it('pega numeros soltos grandes e amounts por extenso (gaps do review)', () => {
    expect(contemPreco('pague apenas 1900 a vista')).toBe(true);
    expect(contemPreco('economia de 3200 por ano')).toBe(true);
    expect(contemPreco('custa mil reais')).toBe(true);
    expect(contemPreco('R$  1.900')).toBe(true);           // dois espacos
    expect(contemPreco('parcelas de 1.200,00')).toBe(true);
  });

  it('NAO bloqueia numeros nao-monetarios comuns', () => {
    expect(contemPreco('a venda leva 34 dias')).toBe(false);
    expect(contemPreco('gerou 18% acima do previsto')).toBe(false);
    expect(contemPreco('sua energia em 2026')).toBe(false);
    expect(contemPreco('economia na conta de luz todo mes')).toBe(false); // "economia" sem numero
  });
});

describe('trava de preco explicita (usada pelo Elo)', () => {
  it('detecta sinais explicitos de preco', () => {
    expect(contemPrecoExplicito('R$ 19.900')).toBe(true);
    expect(contemPrecoExplicito('custa mil reais')).toBe(true);
    expect(contemPrecoExplicito('12x de 499')).toBe(true);
    expect(contemPrecoExplicito('parcelas de 1.200,00')).toBe(true);
    expect(contemPrecoExplicito('pague 1900 a vista')).toBe(true);
  });

  it('NAO bloqueia contagens reais (diferenca chave em relacao a variante estrita)', () => {
    expect(contemPrecoExplicito('300 usinas')).toBe(false);
    expect(contemPrecoExplicito('120 eventos')).toBe(false);
    expect(contemPrecoExplicito('a venda leva 34 dias')).toBe(false);
  });
});
