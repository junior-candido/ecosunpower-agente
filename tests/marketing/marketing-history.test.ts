import { describe, it, expect } from 'vitest';
import { MarketingService } from '../../src/modules/marketing.js';

// Supabase fake mínimo: from().select().order().limit() → resultado controlado.
function fakeSupabase(result: { data: unknown; error: unknown }) {
  const chain = {
    select: () => chain,
    order: () => chain,
    limit: () => Promise.resolve(result),
  };
  return { from: () => chain } as never;
}

function makeService(supabase: never): MarketingService {
  return new MarketingService('test-key', supabase, {} as never, '5561999999999');
}

describe('getRecentDrafts', () => {
  it('devolve as linhas quando o banco responde', async () => {
    const rows = [{ topic: 'x', topic_type: 'dica_tecnica', scene_key: 'comercial', caption: 'c' }];
    const svc = makeService(fakeSupabase({ data: rows, error: null }));
    const out = await svc.getRecentDrafts(15);
    expect(out).toHaveLength(1);
    expect(out[0]!.scene_key).toBe('comercial');
  });

  it('devolve [] quando o banco dá erro (não lança)', async () => {
    const svc = makeService(fakeSupabase({ data: null, error: { message: 'boom' } }));
    const out = await svc.getRecentDrafts(15);
    expect(out).toEqual([]);
  });
});
