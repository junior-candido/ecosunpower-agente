// tests/ficha-do-cliente.test.ts
// FICHA = memória permanente do cliente (migration 117).
// Junior 31/08: "ela precisa identificar e já saber o que fazer... ter o
// histórico daquele cliente". Antes disso a memória era só as últimas 20
// mensagens e o campo summary NUNCA era gerado.
import { describe, it, expect } from 'vitest';
import { buildSystemBlocks } from '../src/modules/system-blocks.js';

const base = {
  systemPrompt: 'PROMPT',
  knowledgeBase: 'KB',
  residencialPrompt: 'RES',
  qualificationStep: 'inicio',
  summary: null,
  now: new Date('2026-08-31T12:00:00-03:00'),
};

describe('ficha do cliente no prompt', () => {
  it('sem ficha, o prompt sai igual ao de sempre (nada muda pra lead novo)', () => {
    const blocos = buildSystemBlocks(base);
    expect(blocos[1].text).not.toContain('FICHA DESTA PESSOA');
    expect(blocos[1].text.startsWith('\n\n## Base de Conhecimento')).toBe(true);
  });

  it('com ficha, ela vem ANTES da base de conhecimento', () => {
    const blocos = buildSystemBlocks({ ...base, ficha: 'cliente desde 2024, sistema no telhado' });
    const t = blocos[1].text;
    expect(t).toContain('FICHA DESTA PESSOA');
    expect(t).toContain('cliente desde 2024');
    expect(t.indexOf('FICHA DESTA PESSOA')).toBeLessThan(t.indexOf('Base de Conhecimento'));
  });

  it('a ficha manda NÃO repetir pergunta que já está respondida', () => {
    const t = buildSystemBlocks({ ...base, ficha: 'cliente desde 2024' })[1].text;
    expect(t).toContain('NÃO pergunte de novo');
    expect(t).toMatch(/nada de "você já é nosso\s*\n?cliente\?"/);
  });

  it('ficha vazia ou só espaço é tratada como sem ficha', () => {
    expect(buildSystemBlocks({ ...base, ficha: '   ' })[1].text).not.toContain('FICHA DESTA PESSOA');
    expect(buildSystemBlocks({ ...base, ficha: null })[1].text).not.toContain('FICHA DESTA PESSOA');
  });

  it('a ficha não substitui a apresentação — cliente conhecido também ouve o nome', () => {
    const t = buildSystemBlocks({ ...base, ficha: 'cliente desde 2024' })[1].text;
    // a ficha manda tratar como cliente, mas nunca manda pular a apresentação
    expect(t).not.toMatch(/n[ãa]o precisa se apresentar|pule a apresenta/i);
  });

  it('o bloco cacheável (prompt estável) não é afetado pela ficha', () => {
    const semFicha = buildSystemBlocks(base);
    const comFicha = buildSystemBlocks({ ...base, ficha: 'algo' });
    expect(comFicha[0].text).toBe(semFicha[0].text);
    expect(comFicha[0].cache_control).toEqual({ type: 'ephemeral' });
  });
});
