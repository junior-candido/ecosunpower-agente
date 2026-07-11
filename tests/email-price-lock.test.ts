import { describe, it, expect } from 'vitest';
import { contemPreco, aplicarTravaPreco } from '../src/modules/email/price-lock.js';

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
});
