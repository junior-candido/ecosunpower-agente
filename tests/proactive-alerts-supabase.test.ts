// tests/proactive-alerts-supabase.test.ts
import { describe, it, expect, vi } from 'vitest';

// Builders para mockar fluência do supabase-js
function chain(retornaria: { data: unknown; error: unknown }) {
  const m: any = {};
  for (const k of ['select','insert','update','upsert','delete','eq','lt','lte','gt','gte','is','order','limit','in','not','or']) {
    m[k] = vi.fn().mockReturnValue(m);
  }
  m.single = vi.fn().mockResolvedValue(retornaria);
  m.then = (cb: (v: any) => any) => cb(retornaria);
  return m;
}
const fromMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: fromMock })),
}));

describe('SupabaseService — proactive alerts methods', () => {
  it('expõe métodos novos', async () => {
    const { SupabaseService } = await import('../src/modules/supabase.js');
    const s = new SupabaseService({ supabaseUrl: 'https://x.co', supabaseServiceKey: 'k' });
    expect(typeof s.getAlertasAbertosBySistemas).toBe('function');
    expect(typeof s.criarAlertaPendente).toBe('function');
    expect(typeof s.marcarAlertaEnviado).toBe('function');
    expect(typeof s.snoozeAlerta).toBe('function');
    expect(typeof s.resolverAlerta).toBe('function');
    expect(typeof s.resolverAlertaManual).toBe('function');
    expect(typeof s.lockAlertaParaEnvio).toBe('function');
    expect(typeof s.unlockAlerta).toBe('function');
    expect(typeof s.getAlertasParaDespachar).toBe('function');
    expect(typeof s.marcarAlertaAcaoDisparada).toBe('function');
    expect(typeof s.getSistemasNoAniversarioHoje).toBe('function');
    expect(typeof s.getSistemaById).toBe('function');
    expect(typeof s.getLeadById).toBe('function');
    expect(typeof s.upsertMaintenanceReminderPublic).toBe('function');
  });

  it('lockAlertaParaEnvio: retorna true quando update afeta 1 linha', async () => {
    fromMock.mockReturnValue(chain({ data: [{ id: 'aid-1' }], error: null }));
    const { SupabaseService } = await import('../src/modules/supabase.js');
    const s = new SupabaseService({ supabaseUrl: 'https://x.co', supabaseServiceKey: 'k' });
    const ok = await s.lockAlertaParaEnvio('aid-1');
    expect(ok).toBe(true);
  });

  it('lockAlertaParaEnvio: retorna false quando 0 linhas (já tomado)', async () => {
    fromMock.mockReturnValue(chain({ data: [], error: null }));
    const { SupabaseService } = await import('../src/modules/supabase.js');
    const s = new SupabaseService({ supabaseUrl: 'https://x.co', supabaseServiceKey: 'k' });
    const ok = await s.lockAlertaParaEnvio('aid-1');
    expect(ok).toBe(false);
  });
});
