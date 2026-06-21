import { describe, it, expect } from 'vitest';
import { MarketingService } from '../../src/modules/marketing.js';

// Supabase fake mínimo: from().select().order().limit() → resultado controlado.
// Captura os args de order/limit pra travar a ordenação (anti-repetição depende disso).
interface Spy { orderArgs?: [string, { ascending: boolean }]; limitArg?: number }
function fakeSupabase(result: { data: unknown; error: unknown }, spy: Spy = {}) {
  const chain = {
    select: () => chain,
    order: (col: string, opts: { ascending: boolean }) => {
      spy.orderArgs = [col, opts];
      return chain;
    },
    limit: (n: number) => {
      spy.limitArg = n;
      return Promise.resolve(result);
    },
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

  it('busca os MAIS RECENTES primeiro (created_at desc) — anti-repetição depende disso', async () => {
    const spy: Spy = {};
    const svc = makeService(fakeSupabase({ data: [], error: null }, spy));
    await svc.getRecentDrafts(15);
    expect(spy.orderArgs).toEqual(['created_at', { ascending: false }]);
    expect(spy.limitArg).toBe(15);
  });

  it('devolve [] quando o banco dá erro (não lança)', async () => {
    const svc = makeService(fakeSupabase({ data: null, error: { message: 'boom' } }));
    const out = await svc.getRecentDrafts(15);
    expect(out).toEqual([]);
  });
});
