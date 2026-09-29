// Economia de IA SEM mudar o que o modelo lê (28/09/2026).
// Setembro: 1.187 conversas = R$ 424,81 (~R$ 0,36 cada). Duas causas:
//  1. o cache do prompt fixo (~25 mil tokens) vivia 5 min; cliente responde
//     depois de 10, 20 min → quase toda mensagem REESCREVIA o cache (1,25×);
//  2. a base de conhecimento FIXA (6 arquivos, ~6 mil tokens) ia sem cache
//     nenhum, cobrada cheia toda mensagem.
// Correção: cache de 1 hora no prompt fixo e um 2º ponto de cache logo depois
// da base fixa. O TEXTO somado dos blocos é o mesmo byte a byte.
import { describe, it, expect } from 'vitest';
import { buildSystemBlocks } from '../src/modules/system-blocks.js';

const SYS = 'PROMPT ESTAVEL '.repeat(100);
const CORE = '[empresa]\nsomos a empresa\n\n[faq]\nperguntas';
const RAG = '\n\n## CONHECIMENTO RELEVANTE (RAG)\n\nchunk variavel';
const LEADCTX = '\n\n## ATENCAO: contato existente';
const NOW = new Date('2026-09-28T15:00:00.000Z');

const base = {
  systemPrompt: SYS,
  knowledgeBase: CORE + RAG + LEADCTX,
  residencialPrompt: 'residencial',
  qualificationStep: 'inicio',
  summary: 'resumo',
  now: NOW,
};
const juntar = (b: Array<{ text: string }>) => b.map((x) => x.text).join('');

describe('buildSystemBlocks — economia segura', () => {
  it('sem opções: igual a antes (2 blocos, cache 5 min padrão)', () => {
    const b = buildSystemBlocks(base);
    expect(b).toHaveLength(2);
    expect(b[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('ttl 1h vai no bloco fixo', () => {
    const b = buildSystemBlocks({ ...base, ttl: '1h' });
    expect(b[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
  });

  it('base fixa ganha o próprio ponto de cache — e o texto total NÃO muda', () => {
    const antes = juntar(buildSystemBlocks(base));
    const b = buildSystemBlocks({ ...base, ttl: '1h', conhecimentoEstavel: CORE });
    expect(b).toHaveLength(3);
    expect(b[1].text.endsWith(CORE)).toBe(true);
    expect(b[1].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    expect(b[2].cache_control).toBeUndefined();
    expect(b[2].text).toContain('chunk variavel');
    expect(b[2].text).toContain('Data ISO');
    expect(juntar(b)).toBe(antes); // byte a byte
  });

  it('bloco cacheado da base NÃO leva nada que muda (data, resumo, RAG, lead)', () => {
    const b = buildSystemBlocks({ ...base, conhecimentoEstavel: CORE });
    for (const volatil of ['chunk variavel', 'resumo', 'Data ISO', 'contato existente']) {
      expect(b[1].text).not.toContain(volatil);
    }
  });

  it('com FICHA (vem antes da base): não separa — senão mudaria a ordem do texto', () => {
    const comFicha = { ...base, ficha: 'cliente desde 2024' };
    const b = buildSystemBlocks({ ...comFicha, conhecimentoEstavel: CORE });
    expect(b).toHaveLength(2);
    expect(juntar(b)).toBe(juntar(buildSystemBlocks(comFicha)));
  });

  it('base fixa que não é o começo da base: ignora (segurança)', () => {
    const b = buildSystemBlocks({ ...base, conhecimentoEstavel: 'outra coisa' });
    expect(b).toHaveLength(2);
  });

  it('base inteira fixa (vitrine, sem RAG/lead): 3º bloco começa sem sobras', () => {
    const b = buildSystemBlocks({ ...base, knowledgeBase: CORE, conhecimentoEstavel: CORE });
    expect(b).toHaveLength(3);
    expect(juntar(b)).toBe(juntar(buildSystemBlocks({ ...base, knowledgeBase: CORE })));
  });
});
