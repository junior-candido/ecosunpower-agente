// Webhook: a "última leitura" do medidor (o que o vigia olha) nunca vai pro futuro.
import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from '../src/modules/supabase.js';

function clienteFalso() {
  const regs: Array<{ tabela: string; payload?: Record<string, unknown>; filtros: unknown[] }> = [];
  const from = vi.fn((tabela: string) => {
    const reg = { tabela, payload: undefined as Record<string, unknown> | undefined, filtros: [] as unknown[] };
    regs.push(reg);
    const q: Record<string, unknown> = {};
    q.update = (p: Record<string, unknown>) => { reg.payload = p; return q; };
    q.eq = (c: string, v: unknown) => { reg.filtros.push([c, v]); return q; };
    q.or = (v: string) => { reg.filtros.push(['or', v]); return q; };
    q.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(ok);
    return q;
  });
  return { client: { from } as unknown as SupabaseClient, regs };
}

describe('marcarLeituraMedidor', () => {
  it('limita ao agora e filtra pela empresa do medidor', async () => {
    const { client, regs } = clienteFalso();
    const s = new SupabaseService({ supabaseUrl: 'http://x', supabaseServiceKey: 'k' }, client);
    const futuro = new Date(Date.now() + 2 * 3_600_000).toISOString();
    await s.marcarLeituraMedidor('m1', 'empresa-X', futuro);
    const r = regs[0];
    expect(Date.parse(String(r.payload!.ultima_leitura_em))).toBeLessThanOrEqual(Date.now());
    expect(r.filtros).toContainEqual(['company_id', 'empresa-X']);
    expect(String((r.filtros.find((f) => (f as unknown[])[0] === 'or') as unknown[])[1])).not.toContain(futuro);
  });
});
