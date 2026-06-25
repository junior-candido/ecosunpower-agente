import { describe, it, expect, vi, beforeEach } from 'vitest';

// === Mock do @supabase/supabase-js — segue padrao identico ao
// === tests/supabase-getOrCreateLeadByPhone.test.ts (commit 394e848)

// Setup: registrar estado mutavel acessivel do mock
const state = {
  insertedPropostas: [] as any[],
  insertedLeads: [] as any[],
  leadsByPhone: {} as Record<string, { id: string; phone: string } | null>,
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'leads') {
        return {
          select: () => ({
            eq: (_col: string, val: string) => ({
              maybeSingle: async () => ({ data: state.leadsByPhone[val] ?? null, error: null }),
            }),
            // getLeadByPhone agora busca por variantes: .in('phone', [...]).order().limit()
            in: (_col: string, vals: string[]) => ({
              order: () => ({
                limit: async () => {
                  const found = vals.map((v) => state.leadsByPhone[v]).find(Boolean) ?? null;
                  return { data: found ? [found] : [], error: null };
                },
              }),
            }),
          }),
          insert: (row: any) => ({
            select: () => ({
              single: async () => {
                const created = { id: `new-lead-${state.insertedLeads.length + 1}`, ...row };
                state.insertedLeads.push(created);
                return { data: created, error: null };
              },
            }),
          }),
        };
      }
      // propostas_publicas
      return {
        insert: (row: any) => {
          state.insertedPropostas.push(row);
          return {
            select: () => ({
              single: async () => ({
                data: { id: `prop-${state.insertedPropostas.length}`, expires_at: new Date(Date.now() + 60 * 86400000).toISOString() },
                error: null,
              }),
            }),
          };
        },
      };
    },
  })),
}));

import { SupabaseService } from '../src/modules/supabase.js';

beforeEach(() => {
  state.insertedPropostas.length = 0;
  state.insertedLeads.length = 0;
  state.leadsByPhone = {};
});

function makeSb() {
  return new SupabaseService({ supabaseUrl: 'http://x', supabaseServiceKey: 'k' } as any);
}

describe('SupabaseService.savePropostaPublica — vinculo lead_id', () => {
  it('linka lead_id quando telefone vem preenchido (lead ja existe)', async () => {
    state.leadsByPhone['5561999999999'] = { id: 'lead-existing', phone: '5561999999999' };
    const sb = makeSb();
    await sb.savePropostaPublica({
      slug: 'abc',
      numeroProposta: '001',
      clienteNome: 'Fulano',
      clienteTelefone: '5561999999999',
      htmlContent: '<p>hi</p>',
    });
    expect(state.insertedPropostas[0]).toMatchObject({ lead_id: 'lead-existing' });
    expect(state.insertedLeads).toHaveLength(0);
  });

  it('cria lead novo (status qualificado) quando nao existe', async () => {
    const sb = makeSb();
    await sb.savePropostaPublica({
      slug: 'def',
      numeroProposta: '002',
      clienteNome: 'Beltrana',
      clienteTelefone: '5561988887777',
      htmlContent: '<p>hi</p>',
    });
    expect(state.insertedPropostas[0]).toMatchObject({ lead_id: expect.stringMatching(/^new-lead-/) });
    expect(state.insertedLeads).toHaveLength(1);
    expect(state.insertedLeads[0]).toMatchObject({ name: 'Beltrana', phone: '5561988887777', status: 'qualificado' });
  });

  it('insere proposta com lead_id null quando telefone nao vem', async () => {
    const sb = makeSb();
    await sb.savePropostaPublica({
      slug: 'ghi',
      numeroProposta: '003',
      clienteNome: 'Sem Telefone',
      htmlContent: '<p>hi</p>',
    });
    expect(state.insertedPropostas[0]).toMatchObject({ lead_id: null });
    expect(state.insertedLeads).toHaveLength(0);
  });

  it('NAO bloqueia salvar proposta se getOrCreateLeadByPhone falhar', async () => {
    const sb = makeSb();
    const spy = vi.spyOn(sb, 'getOrCreateLeadByPhone').mockRejectedValueOnce(new Error('boom'));
    await sb.savePropostaPublica({
      slug: 'jkl',
      numeroProposta: '004',
      clienteNome: 'Resiliente',
      clienteTelefone: '5561900000000',
      htmlContent: '<p>hi</p>',
    });
    expect(spy).toHaveBeenCalled();
    expect(state.insertedPropostas[0]).toMatchObject({ lead_id: null });
  });
});
