import { describe, it, expect } from 'vitest';
import { SupabaseService } from '../src/modules/supabase.js';

function fakeClient(row: any) {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  } as any;
}

describe('getPropostaInputBySlug', () => {
  it('devolve dados_input + meta quando existe', async () => {
    const svc = new SupabaseService({ supabaseUrl: 'http://x', supabaseServiceKey: 'k' });
    (svc as any).client = fakeClient({ dados_input: { potenciaKwp: 8.4 }, numero_proposta: '2026-AB', cliente_nome: 'X', cliente_telefone: '5561', tipo: 'basica', modo_envio: 'junior_envia', revoked: false });
    const r = await svc.getPropostaInputBySlug('slug1');
    expect(r?.dadosInput).toEqual({ potenciaKwp: 8.4 });
    expect(r?.numeroProposta).toBe('2026-AB');
  });
  it('devolve null quando não existe', async () => {
    const svc = new SupabaseService({ supabaseUrl: 'http://x', supabaseServiceKey: 'k' });
    (svc as any).client = fakeClient(null);
    expect(await svc.getPropostaInputBySlug('nope')).toBeNull();
  });
});
