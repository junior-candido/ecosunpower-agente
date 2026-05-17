import { describe, it, expect } from 'vitest';
import { buildSystemBlocks } from '../src/modules/system-blocks.js';

// Custo do caso Ivan (~US$1,15): brain.ts re-cobrava o system-prompt inteiro
// (~1443 linhas) todo turno, sem cache. Fix = separar prefixo ESTÁVEL (cacheado)
// do volátil (conhecimento/resumo/data, depois do breakpoint).
const SYS = 'PROMPT ESTAVEL DA EVA '.repeat(50); // estável todo request
const KNOW = 'conhecimento RAG que muda por query';
const RESID = 'instrucoes residencial';
const SUMMARY = 'resumo da conversa anterior';
const NOW = new Date('2026-05-17T11:56:09.000Z');

describe('buildSystemBlocks', () => {
  it('bloco 0 = só o prompt estável, com cache_control ephemeral', () => {
    const blocks = buildSystemBlocks({
      systemPrompt: SYS,
      knowledgeBase: KNOW,
      residencialPrompt: RESID,
      qualificationStep: 'comercial',
      summary: SUMMARY,
      now: NOW,
    });

    expect(blocks.length).toBeGreaterThanOrEqual(2);
    expect(blocks[0].text).toBe(SYS); // prefixo exato e estável
    expect(blocks[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('prefixo cacheado NÃO contém nada volátil (senão cache invalida todo request)', () => {
    const blocks = buildSystemBlocks({
      systemPrompt: SYS,
      knowledgeBase: KNOW,
      residencialPrompt: RESID,
      qualificationStep: 'comercial',
      summary: SUMMARY,
      now: NOW,
    });

    expect(blocks[0].text).not.toContain(KNOW);
    expect(blocks[0].text).not.toContain(SUMMARY);
    expect(blocks[0].text).not.toContain(NOW.toISOString());
    // a data volátil tem que estar num bloco SEM cache
    const volatile = blocks.slice(1);
    const joinedVolatile = volatile.map((b) => b.text).join('');
    expect(joinedVolatile).toContain(NOW.toISOString());
    expect(volatile.every((b) => b.cache_control === undefined)).toBe(true);
  });

  it('preserva o conteúdo total e a ordem (core→conhecimento→resumo→qualstep→data)', () => {
    const blocks = buildSystemBlocks({
      systemPrompt: SYS,
      knowledgeBase: KNOW,
      residencialPrompt: RESID,
      qualificationStep: 'comercial',
      summary: SUMMARY,
      now: NOW,
    });
    const joined = blocks.map((b) => b.text).join('');

    expect(joined.startsWith(SYS)).toBe(true);
    expect(joined).toContain(KNOW);
    expect(joined).toContain(SUMMARY);
    expect(joined).toContain('## Estado atual da qualificacao: comercial');
    expect(joined).toContain(NOW.toISOString());
    // ordem preservada
    expect(joined.indexOf(KNOW)).toBeLessThan(joined.indexOf(SUMMARY));
    expect(joined.indexOf(SUMMARY)).toBeLessThan(joined.indexOf('## Estado atual'));
    expect(joined.indexOf('## Estado atual')).toBeLessThan(joined.indexOf(NOW.toISOString()));
  });

  it('inclui residencial em inicio/residencial, exclui caso contrário (e nunca no prefixo cacheado)', () => {
    const withResid = buildSystemBlocks({
      systemPrompt: SYS, knowledgeBase: KNOW, residencialPrompt: RESID,
      qualificationStep: 'inicio', summary: null, now: NOW,
    });
    const noResid = buildSystemBlocks({
      systemPrompt: SYS, knowledgeBase: KNOW, residencialPrompt: RESID,
      qualificationStep: 'comercial', summary: null, now: NOW,
    });
    expect(withResid.map((b) => b.text).join('')).toContain(RESID);
    expect(noResid.map((b) => b.text).join('')).not.toContain(RESID);
    // residencial nunca entra no prefixo cacheado (1 só variante de cache)
    expect(withResid[0].text).toBe(SYS);
  });

  it('sem summary não emite a seção de resumo', () => {
    const blocks = buildSystemBlocks({
      systemPrompt: SYS, knowledgeBase: KNOW, residencialPrompt: RESID,
      qualificationStep: 'comercial', summary: null, now: NOW,
    });
    expect(blocks.map((b) => b.text).join('')).not.toContain('Resumo da conversa anterior');
  });

  // Trava os separadores byte-exatos: a preservação byte-a-byte é o ponto
  // dessa mudança. Trocar \n\n por \n ou tirar um ## mudaria o que o modelo
  // vê — esse teste pega isso.
  it('separadores byte-exatos (knowledge / resumo / qualstep / data)', () => {
    const joined = buildSystemBlocks({
      systemPrompt: SYS, knowledgeBase: KNOW, residencialPrompt: RESID,
      qualificationStep: 'comercial', summary: SUMMARY, now: NOW,
    }).map((b) => b.text).join('');
    expect(joined).toContain(`\n\n## Base de Conhecimento da Ecosunpower\n\n${KNOW}`);
    expect(joined).toContain(`\n\n## Resumo da conversa anterior\n${SUMMARY}`);
    expect(joined).toContain('\n\n## Estado atual da qualificacao: comercial');
    expect(joined).toContain(`\nData ISO: ${NOW.toISOString()}`);
  });
});
