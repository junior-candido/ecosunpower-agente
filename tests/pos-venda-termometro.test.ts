// tests/pos-venda-termometro.test.ts
import { describe, it, expect } from 'vitest';
import { temperatura } from '../src/modules/dashboard/pos-venda-termometro.js';

const HOJE = new Date('2026-06-28T12:00:00Z');
const diasAtras = (n: number) => new Date(HOJE.getTime() - n * 86400000).toISOString();

describe('temperatura', () => {
  it('morno quando nunca houve contato (sem histórico)', () => {
    expect(temperatura({ saude: 'verde', ultimoContatoEm: null, jaTeveDepoimento: false }, HOJE)).toBe('morno');
  });
  it('quente: contato recente (<30d) e saúde não-vermelha', () => {
    expect(temperatura({ saude: 'verde', ultimoContatoEm: diasAtras(10), jaTeveDepoimento: false }, HOJE)).toBe('quente');
  });
  it('quente: cliente que deu depoimento com contato até 60d', () => {
    expect(temperatura({ saude: 'amarelo', ultimoContatoEm: diasAtras(45), jaTeveDepoimento: true }, HOJE)).toBe('quente');
  });
  it('frio: mais de 90 dias sem contato', () => {
    expect(temperatura({ saude: 'verde', ultimoContatoEm: diasAtras(120), jaTeveDepoimento: true }, HOJE)).toBe('frio');
  });
  it('frio: saúde vermelha arrastando há mais de 30d', () => {
    expect(temperatura({ saude: 'vermelho', ultimoContatoEm: diasAtras(40), jaTeveDepoimento: false }, HOJE)).toBe('frio');
  });
  it('morno: contato entre 30 e 90 dias sem engajamento', () => {
    expect(temperatura({ saude: 'verde', ultimoContatoEm: diasAtras(50), jaTeveDepoimento: false }, HOJE)).toBe('morno');
  });
});
