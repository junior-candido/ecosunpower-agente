import { describe, it, expect, vi, beforeEach } from 'vitest';

// Estado compartilhado entre os mocks — cada teste redefine antes de rodar
let mockMaybySingleReturn: { data: { id: string; phone: string } | null; error: null } = {
  data: null,
  error: null,
};
let insertedRows: Array<Record<string, unknown>> = [];

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: (table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _val: string) => ({
          maybeSingle: async () => mockMaybySingleReturn,
          single: async () => mockMaybySingleReturn,
        }),
      }),
      insert: (row: Record<string, unknown>) => ({
        select: (_cols: string) => ({
          single: async () => {
            const created = { id: `new-id-${insertedRows.length + 1}`, ...row };
            insertedRows.push(created);
            return { data: created, error: null };
          },
        }),
      }),
    }),
  })),
}));

describe('SupabaseService.getOrCreateLeadByPhone', () => {
  beforeEach(() => {
    insertedRows = [];
    mockMaybySingleReturn = { data: null, error: null };
  });

  it('retorna lead existente quando telefone bate', async () => {
    mockMaybySingleReturn = { data: { id: 'existing-lead-uuid', phone: '5561999999999' }, error: null };

    const { SupabaseService } = await import('../src/modules/supabase.js');
    const sb = new SupabaseService({ supabaseUrl: 'https://x.supabase.co', supabaseServiceKey: 'key' });

    const id = await sb.getOrCreateLeadByPhone('5561999999999', 'Cliente Foo');

    expect(id).toBe('existing-lead-uuid');
    expect(insertedRows).toHaveLength(0);
  });

  it('cria novo lead com status qualificado quando nao existe', async () => {
    mockMaybySingleReturn = { data: null, error: null };

    const { SupabaseService } = await import('../src/modules/supabase.js');
    const sb = new SupabaseService({ supabaseUrl: 'https://x.supabase.co', supabaseServiceKey: 'key' });

    const id = await sb.getOrCreateLeadByPhone('5561900000000', 'Cliente Bar');

    expect(id).toMatch(/^new-id-/);
    expect(insertedRows).toEqual([
      expect.objectContaining({ name: 'Cliente Bar', phone: '5561900000000', status: 'qualificado' }),
    ]);
  });

  it('lanca erro quando telefone esta vazio', async () => {
    const { SupabaseService } = await import('../src/modules/supabase.js');
    const sb = new SupabaseService({ supabaseUrl: 'https://x.supabase.co', supabaseServiceKey: 'key' });
    await expect(sb.getOrCreateLeadByPhone('', 'Foo')).rejects.toThrow(/telefone/i);
  });
});
