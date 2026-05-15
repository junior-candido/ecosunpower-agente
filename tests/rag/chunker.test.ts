import { describe, it, expect } from 'vitest';
import { chunkMarkdown, estimateTokens } from '../../src/modules/rag/chunker.js';

describe('estimateTokens', () => {
  it('aproxima ~4 chars/token, nunca < 1 pra texto', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });
});

describe('chunkMarkdown', () => {
  it('texto curto vira 1 chunk', () => {
    const c = chunkMarkdown('# T\n\nparágrafo curto.', { maxTokens: 600, overlapTokens: 80 });
    expect(c.length).toBe(1);
    expect(c[0].content).toContain('parágrafo curto.');
    expect(c[0].index).toBe(0);
  });

  it('quebra por H2 quando excede o limite', () => {
    const big = 'x'.repeat(2000);
    const md = `## A\n\n${big}\n\n## B\n\n${big}`;
    const c = chunkMarkdown(md, { maxTokens: 600, overlapTokens: 80 });
    expect(c.length).toBeGreaterThanOrEqual(2);
    expect(c[0].content).toContain('## A');
    expect(c.some(k => k.content.includes('## B'))).toBe(true);
  });

  it('seção gigante sem H2 cai pra split fixo com overlap', () => {
    const huge = Array.from({ length: 50 }, (_, i) => `linha ${i} ${'y'.repeat(80)}`).join('\n');
    const c = chunkMarkdown(huge, { maxTokens: 300, overlapTokens: 50 });
    expect(c.length).toBeGreaterThan(1);
    const tail = c[0].content.slice(-40);
    expect(c[1].content.includes(tail.trim().split('\n').pop()!.slice(0, 10))).toBe(true);
    expect(c.every(k => estimateTokens(k.content) <= 300 + 50)).toBe(true);
  });

  it('índices sequenciais e sem chunk vazio', () => {
    const c = chunkMarkdown('## A\n\nzzz\n\n## B\n\nwww', { maxTokens: 600, overlapTokens: 80 });
    c.forEach((k, i) => { expect(k.index).toBe(i); expect(k.content.trim().length).toBeGreaterThan(0); });
  });

  it('degrada com graça: vazio/whitespace → []', () => {
    expect(chunkMarkdown('', { maxTokens: 600, overlapTokens: 80 })).toEqual([]);
    expect(chunkMarkdown('   \n\n  ', { maxTokens: 600, overlapTokens: 80 })).toEqual([]);
  });
});
