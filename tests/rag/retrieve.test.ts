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

  it('tenant explícito é repassado à RPC (p_tenant)', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const { retrieveChunks } = await import('../../src/modules/rag/retrieve.js');
    await retrieveChunks('q', { rpc } as any, cfg, async () => [[0.1]], 'abc-123');
    expect(rpc).toHaveBeenCalledWith('match_eva_chunks',
      expect.objectContaining({ p_tenant: 'abc-123' }));
  });
});

describe('ragTenantDe (B2a — chave do conhecimento por empresa)', () => {
  it('sem companyId (mensagem legada/flag off) → slug histórico ecosunpower', async () => {
    const { ragTenantDe } = await import('../../src/modules/rag/retrieve.js');
    expect(ragTenantDe(undefined)).toBe('ecosunpower');
    expect(ragTenantDe(null)).toBe('ecosunpower');
    expect(ragTenantDe('')).toBe('ecosunpower');
  });

  it('companyId da EcoSun → ecosunpower (os chunks já ingeridos usam o slug)', async () => {
    const { ragTenantDe } = await import('../../src/modules/rag/retrieve.js');
    const { ECOSUN_COMPANY_ID } = await import('../../src/modules/tenant-resolver.js');
    expect(ragTenantDe(ECOSUN_COMPANY_ID)).toBe('ecosunpower');
  });

  it('outro tenant → o próprio company_id (sem chunks ingeridos o RAG devolve [] — a Eva de um tenant NUNCA herda o catálogo da EcoSun)', async () => {
    const { ragTenantDe } = await import('../../src/modules/rag/retrieve.js');
    expect(ragTenantDe('11111111-2222-3333-4444-555555555555'))
      .toBe('11111111-2222-3333-4444-555555555555');
  });
});
