import { describe, it, expect, vi } from 'vitest';

describe('retrieveChunks', () => {
  const cfg = { ragTopK: 5, ragMinSimilarity: 0.35, openaiApiKey: 'k' } as any;

  it('embeda query e chama RPC match_eva_chunks; retorna contents', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [
      { source_file: 'a.md', content: 'AAA', similarity: 0.8 }], error: null });
    const supa = { rpc } as any;
    const { retrieveChunks } = await import('../../src/modules/rag/retrieve.js');
    const r = await retrieveChunks('qual inversor?', supa, cfg, async () => [[0.1]]);
    expect(r).toEqual(['AAA']);
    expect(rpc).toHaveBeenCalledWith('match_eva_chunks', expect.objectContaining({
      p_tenant: 'ecosunpower', match_count: 5, min_similarity: 0.35 }));
  });

  it('sem OPENAI key → [] (fallback core-only no caller)', async () => {
    const { retrieveChunks } = await import('../../src/modules/rag/retrieve.js');
    const r = await retrieveChunks('x', { rpc: vi.fn() } as any,
      { ...cfg, openaiApiKey: '' }, async () => { throw new Error('no'); });
    expect(r).toEqual([]);
  });

  it('erro na RPC → [] (nunca lança)', async () => {
    const supa = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }) } as any;
    const { retrieveChunks } = await import('../../src/modules/rag/retrieve.js');
    expect(await retrieveChunks('x', supa, cfg, async () => [[0.1]])).toEqual([]);
  });
});
