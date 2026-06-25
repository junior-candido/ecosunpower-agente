import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capturas mutable compartilhadas entre testes
let capturedInsertRow: Record<string, unknown> | null = null;
let sistemaData: { id: string; lead_id: string | null; data_instalacao: string } | null = {
  id: 's1',
  lead_id: null,
  data_instalacao: '2025-01-01',
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'sistemas_clientes') {
        return {
          select: (_cols: string) => ({
            eq: (_col: string, _val: string) => ({
              single: async () => ({ data: sistemaData, error: sistemaData ? null : { message: 'not found' } }),
            }),
          }),
          update: (_vals: Record<string, unknown>) => ({
            eq: async (_col: string, _val: string) => ({ error: null }),
          }),
        };
      }
      // table === 'leads'
      return {
        // Passo 2 do código: checa telefone já cadastrado antes de inserir.
        // Aqui devolvemos null (ninguém encontrado) pra o fluxo seguir pro insert.
        select: (_cols: string) => ({
          eq: (_col: string, _val: string) => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
        insert: (row: Record<string, unknown>) => {
          capturedInsertRow = row;
          return {
            select: (_cols: string) => ({
              single: async () => ({ data: { id: 'lead1' }, error: null }),
            }),
          };
        },
        delete: () => ({
          eq: async () => ({ error: null }),
        }),
      };
    },
  })),
}));

describe('vincularNovoLeadAoSistema com campos completos', () => {
  beforeEach(() => {
    capturedInsertRow = null;
    sistemaData = { id: 's1', lead_id: null, data_instalacao: '2025-01-01' };
  });

  it('grava city/uf/cep quando passados', async () => {
    const { SupabaseService } = await import('../src/modules/supabase.js');
    const svc = new SupabaseService({ supabaseUrl: 'https://x.supabase.co', supabaseServiceKey: 'key' });

    const r = await svc.vincularNovoLeadAoSistema({
      sistema_id: 's1',
      name: 'Marcelo Dias',
      phone: '5561999998888',
      email: 'm@x.com',
      city: 'Brasília',
      uf: 'DF',
      cep: '70000000',
    });

    expect(r.ok).toBe(true);
    expect(capturedInsertRow?.city).toBe('Brasília');
    expect(capturedInsertRow?.uf).toBe('DF');
    expect(capturedInsertRow?.cep).toBe('70000000');
  });

  it('campos opcionais omitidos viram null', async () => {
    const { SupabaseService } = await import('../src/modules/supabase.js');
    const svc = new SupabaseService({ supabaseUrl: 'https://x.supabase.co', supabaseServiceKey: 'key' });

    const r = await svc.vincularNovoLeadAoSistema({
      sistema_id: 's1',
      name: 'Ana',
      phone: '5561988887777',
    });

    expect(r.ok).toBe(true);
    expect(capturedInsertRow?.city ?? null).toBeNull();
    expect(capturedInsertRow?.uf ?? null).toBeNull();
    expect(capturedInsertRow?.cep ?? null).toBeNull();
  });
});
