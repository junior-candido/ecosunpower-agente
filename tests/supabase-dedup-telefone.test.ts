// Dedup do 9º dígito: getLeadByPhone acha o lead em qualquer variante, e
// upsertLead ATUALIZA o existente (por id) em vez de criar duplicata.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capturas compartilhadas
let inVals: string[] | null = null;
let existingRows: any[] = [];
let updatedId: string | null = null;
let upsertCalled = false;

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: (_table: string) => ({
      // getLeadByPhone: select('*').in('phone', variantes).order().limit()
      select: (_cols: string) => ({
        in: (_col: string, vals: string[]) => {
          inVals = vals;
          return {
            order: () => ({
              limit: async () => ({ data: existingRows, error: null }),
            }),
          };
        },
      }),
      // upsertLead (achou): update().eq(id).select().single()
      update: (_vals: Record<string, unknown>) => ({
        eq: (_col: string, id: string) => {
          updatedId = id;
          return { select: () => ({ single: async () => ({ data: { id }, error: null }) }) };
        },
      }),
      // upsertLead (não achou): upsert().select().single()
      upsert: (_vals: Record<string, unknown>) => {
        upsertCalled = true;
        return { select: () => ({ single: async () => ({ data: { id: 'novo-id' }, error: null }) }) };
      },
    }),
  })),
}));

describe('dedup de telefone (9º dígito)', () => {
  beforeEach(() => {
    inVals = null;
    existingRows = [];
    updatedId = null;
    upsertCalled = false;
  });

  it('getLeadByPhone busca por todas as variantes (com e sem o 9)', async () => {
    const { SupabaseService } = await import('../src/modules/supabase.js');
    const svc = new SupabaseService({ supabaseUrl: 'https://x.supabase.co', supabaseServiceKey: 'key' });
    existingRows = [{ id: 'lead-1', phone: '5561987654321' }]; // salvo COM o 9

    // chega SEM o 9 (formato do WhatsApp) → tem que achar o mesmo lead
    const lead = await svc.getLeadByPhone('556187654321');

    expect(lead?.id).toBe('lead-1');
    expect(inVals).toContain('556187654321'); // sem 9
    expect(inVals).toContain('5561987654321'); // com 9
  });

  it('upsertLead ATUALIZA o lead existente (não cria duplicata) quando acha por variante', async () => {
    const { SupabaseService } = await import('../src/modules/supabase.js');
    const svc = new SupabaseService({ supabaseUrl: 'https://x.supabase.co', supabaseServiceKey: 'key' });
    existingRows = [{ id: 'lead-1', phone: '5561987654321' }];

    const r = await svc.upsertLead({ phone: '556187654321', ctwa_clid: 'abc' } as any);

    expect(r.id).toBe('lead-1'); // reusa o existente
    expect(updatedId).toBe('lead-1'); // fez UPDATE por id
    expect(upsertCalled).toBe(false); // NÃO inseriu
  });

  it('upsertLead INSERE quando não existe nenhuma variante', async () => {
    const { SupabaseService } = await import('../src/modules/supabase.js');
    const svc = new SupabaseService({ supabaseUrl: 'https://x.supabase.co', supabaseServiceKey: 'key' });
    existingRows = []; // ninguém

    const r = await svc.upsertLead({ phone: '5561987654321', status: 'novo' } as any);

    expect(r.id).toBe('novo-id');
    expect(upsertCalled).toBe(true); // inseriu
    expect(updatedId).toBeNull(); // não atualizou ninguém
  });
});
