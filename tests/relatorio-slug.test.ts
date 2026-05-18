// tests/relatorio-slug.test.ts
import { describe, it, expect } from 'vitest';
import { SupabaseService } from '../src/modules/supabase.js';

function fakeSb(rowBySlug: any) {
  const calls: any[] = [];
  return {
    svc: new SupabaseService({ supabaseUrl: 'http://x', supabaseServiceKey: 'k' }),
    patch(svc: SupabaseService) {
      (svc as any).getClient = () => ({
        from() {
          return {
            insert(v: any) { calls.push(['insert', v]); return Promise.resolve({ error: null }); },
            select() { return this; },
            eq(_c: string, _v: string) { return this; },
            maybeSingle() { return Promise.resolve({ data: rowBySlug, error: null }); },
          };
        },
      });
      return calls;
    },
  };
}

describe('relatorio slug', () => {
  it('criarRelatorioSlug gera slug 16-32 urlsafe e insere com expira_em ~60d', async () => {
    const f = fakeSb(null); const calls = f.patch(f.svc);
    const slug = await f.svc.criarRelatorioSlug('sis-1');
    expect(slug).toMatch(/^[A-Za-z0-9_-]{16,32}$/);
    expect(calls[0][0]).toBe('insert');
    expect(calls[0][1].sistema_id).toBe('sis-1');
    expect(new Date(calls[0][1].expira_em).getTime()).toBeGreaterThan(Date.now() + 59 * 864e5);
  });
  it('getRelatorioSlug devolve row; expirado -> null', async () => {
    const ativo = { sistema_id: 'sis-1', expira_em: new Date(Date.now() + 864e5).toISOString() };
    const f1 = fakeSb(ativo); f1.patch(f1.svc);
    expect(await f1.svc.getRelatorioSlug('abcdefghijklmnop')).toEqual(ativo);
    const exp = { sistema_id: 'sis-1', expira_em: new Date(Date.now() - 864e5).toISOString() };
    const f2 = fakeSb(exp); f2.patch(f2.svc);
    expect(await f2.svc.getRelatorioSlug('abcdefghijklmnop')).toBeNull();
  });
});
