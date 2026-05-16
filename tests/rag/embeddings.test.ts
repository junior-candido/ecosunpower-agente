import { describe, it, expect, vi } from 'vitest';

describe('embedTexts', () => {
  it('retorna 1 vetor por input, em batches', async () => {
    const create = vi.fn().mockResolvedValue({ data: [{ embedding: [0.1] }, { embedding: [0.2] }] });
    const { embedTexts } = await import('../../src/modules/rag/embeddings.js');
    const fakeClient = { embeddings: { create } } as any;
    const out = await embedTexts(['a', 'b'], fakeClient);
    expect(out).toEqual([[0.1], [0.2]]);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ model: 'text-embedding-3-small', input: ['a','b'] }));
  });

  it('lista vazia → [] sem chamar API', async () => {
    const create = vi.fn();
    const { embedTexts } = await import('../../src/modules/rag/embeddings.js');
    expect(await embedTexts([], { embeddings: { create } } as any)).toEqual([]);
    expect(create).not.toHaveBeenCalled();
  });
});
