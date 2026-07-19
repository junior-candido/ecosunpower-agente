import { describe, it, expect, vi, beforeEach } from 'vitest';

// Captura o payload do INSERT de conversa e permite controlar o que a busca
// por conversa ativa devolve (existente vs. inexistente).
const inserts: Record<string, unknown>[] = [];
let existing: unknown[] = [];

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      // SELECT ... .eq().eq().order().limit()  → lista de conversas ativas
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(async () => ({ data: existing, error: null })),
            })),
          })),
        })),
      })),
      // INSERT(payload).select().single()  → captura o payload
      insert: vi.fn((payload: Record<string, unknown>) => {
        inserts.push(payload);
        return {
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: { id: 'conv-nova', ...payload }, error: null })),
          })),
        };
      }),
      // UPDATE(...).eq(...)  → usado pra expirar conversa velha
      update: vi.fn(() => ({ eq: vi.fn(async () => ({ data: null, error: null })) })),
    })),
  })),
}));

async function novoService() {
  const { SupabaseService } = await import('../src/modules/supabase.js');
  return new SupabaseService({ supabaseUrl: 'https://test.supabase.co', supabaseServiceKey: 'key' });
}

describe('getOrCreateConversation — company_id (fatia 2)', () => {
  beforeEach(() => {
    inserts.length = 0;
    existing = [];
  });

  it('conversa NOVA com companyId → carimba company_id no INSERT', async () => {
    existing = []; // nenhuma conversa ativa
    const service = await novoService();
    await service.getOrCreateConversation('lead-1', 'empresa-9');
    expect(inserts).toHaveLength(1);
    expect(inserts[0].company_id).toBe('empresa-9');
    expect(inserts[0].lead_id).toBe('lead-1');
  });

  it('conversa NOVA sem companyId → NÃO manda company_id (usa default da coluna)', async () => {
    existing = [];
    const service = await novoService();
    await service.getOrCreateConversation('lead-2');
    expect(inserts).toHaveLength(1);
    expect('company_id' in inserts[0]).toBe(false);
  });

  it('conversa EXISTENTE (ativa, não expirada) → devolve a existente, NÃO insere nem reatribui', async () => {
    const futuro = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    existing = [{ id: 'conv-velha', lead_id: 'lead-3', expires_at: futuro, company_id: 'empresa-original' }];
    const service = await novoService();
    const conv = await service.getOrCreateConversation('lead-3', 'empresa-nova');
    expect(conv.id).toBe('conv-velha');
    expect(inserts).toHaveLength(0); // nunca insere no ramo existente
  });
});
