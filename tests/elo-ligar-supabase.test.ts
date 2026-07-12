// Elo — liga as casas Comercial (Leads + Propostas) na espinha do event-stream.
// Verifica que os métodos do SupabaseService registram os eventos certos em
// `eventos_elo` no ponto certo. Mocke do @supabase/supabase-js segue o padrão
// dos testes vizinhos (supabase-dedup-telefone / supabase-savePropostaPublica).
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Estado mutável compartilhado com o mock.
const state = {
  events: [] as any[],            // inserts em eventos_elo
  existingLeadRows: [] as any[],  // getLeadByPhone (.in().order().limit())
  leadRow: null as any,           // .select().eq().maybeSingle() (status/company_id)
  propAcessos: 0,                 // acessos ANTES do incremento
  propLeadId: null as string | null,
};

// eq() do leads.update: precisa ser awaitável (estágio) E encadeável (.select().single()).
function eqUpdate(id: string) {
  return {
    select: () => ({ single: async () => ({ data: { id }, error: null }) }),
    then: (res: (v: any) => void) => res({ error: null }),
  } as any;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'eventos_elo') {
        return {
          insert: async (row: any) => {
            state.events.push(row);
            return { error: null };
          },
        };
      }
      if (table === 'leads') {
        return {
          select: (_cols: string) => ({
            in: (_c: string, _vals: string[]) => ({
              order: () => ({ limit: async () => ({ data: state.existingLeadRows, error: null }) }),
            }),
            eq: (_c: string, _v: string) => ({
              maybeSingle: async () => ({ data: state.leadRow, error: null }),
            }),
          }),
          upsert: (_vals: any) => ({
            select: () => ({ single: async () => ({ data: { id: 'novo-lead' }, error: null }) }),
          }),
          update: (_vals: any) => ({ eq: (_c: string, id: string) => eqUpdate(id) }),
          insert: (row: any) => ({
            select: () => ({ single: async () => ({ data: { id: 'created-lead', ...row }, error: null }) }),
          }),
        };
      }
      if (table === 'lead_atividades') {
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ gte: () => ({ limit: async () => ({ data: [], error: null }) }) }) }),
          }),
          insert: async () => ({ error: null }),
        };
      }
      // propostas_publicas
      return {
        insert: (_row: any) => ({
          select: () => ({
            single: async () => ({
              data: { id: 'prop-1', expires_at: new Date(Date.now() + 60 * 86400000).toISOString() },
              error: null,
            }),
          }),
        }),
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: 'prop-9', acessos: state.propAcessos, lead_id: state.propLeadId },
              error: null,
            }),
          }),
        }),
        update: () => ({ eq: async () => ({ error: null }) }),
      };
    },
  })),
}));

import { SupabaseService } from '../src/modules/supabase.js';

function makeSb() {
  return new SupabaseService({ supabaseUrl: 'http://x', supabaseServiceKey: 'k' } as any);
}

beforeEach(() => {
  state.events.length = 0;
  state.existingLeadRows = [];
  state.leadRow = null;
  state.propAcessos = 0;
  state.propLeadId = null;
});

describe('Elo — Comercial: Leads', () => {
  it('upsertLead INSERE lead novo → registra comercial:lead_novo', async () => {
    state.existingLeadRows = []; // ninguém com esse telefone
    const sb = makeSb();
    const r = await sb.upsertLead({ phone: '5561999990000', status: 'novo' } as any);
    expect(r.id).toBe('novo-lead');

    const ev = state.events.find((e) => e.tipo === 'comercial:lead_novo');
    expect(ev).toBeTruthy();
    expect(ev).toMatchObject({ tipo: 'comercial:lead_novo', departamento: 'comercial', lead_id: 'novo-lead' });
    expect(ev.canal).toBe('whatsapp'); // sem origem → default inbound
  });

  it('upsertLead que ATUALIZA lead existente NÃO registra comercial:lead_novo', async () => {
    state.existingLeadRows = [{ id: 'lead-existe', phone: '5561999990000' }];
    const sb = makeSb();
    await sb.upsertLead({ phone: '5561999990000', name: 'Fulano' } as any);
    expect(state.events.find((e) => e.tipo === 'comercial:lead_novo')).toBeUndefined();
  });

  it('avancarEtapaFunil registra comercial:estagio_mudou quando o estágio muda', async () => {
    state.leadRow = { status: 'novo', company_id: 'c1' };
    const sb = makeSb();
    // proposta_gerada leva 'novo' → 'proposta_enviada' (muda) → deve emitir o evento
    await (sb as any).avancarEtapaFunil('lead-77', 'proposta_gerada');

    const ev = state.events.find((e) => e.tipo === 'comercial:estagio_mudou');
    expect(ev).toBeTruthy();
    expect(ev).toMatchObject({ departamento: 'comercial', lead_id: 'lead-77' });
    expect(ev.payload).toMatchObject({ de: 'novo', para: 'proposta_enviada', evento: 'proposta_gerada' });
  });

  it('avancarEtapaFunil NÃO registra evento quando o estágio não muda', async () => {
    state.leadRow = { status: 'ganho', company_id: 'c1' };
    const sb = makeSb();
    // 'ganho' já é o topo → proposta_gerada não recua → sem mudança
    await (sb as any).avancarEtapaFunil('lead-88', 'proposta_gerada');
    expect(state.events.find((e) => e.tipo === 'comercial:estagio_mudou')).toBeUndefined();
  });
});

describe('Elo — Comercial: Propostas', () => {
  it('savePropostaPublica registra comercial:proposta_criada', async () => {
    const sb = makeSb();
    vi.spyOn(sb, 'getOrCreateLeadByPhone').mockResolvedValue('lead-prop');
    vi.spyOn(sb, 'onPropostaEnviada').mockResolvedValue(undefined as any);

    await sb.savePropostaPublica({
      slug: 'abc123',
      numeroProposta: '001',
      clienteNome: 'Fulano',
      clienteTelefone: '5561988887777',
      htmlContent: '<p>oi</p>',
    });

    const ev = state.events.find((e) => e.tipo === 'comercial:proposta_criada');
    expect(ev).toBeTruthy();
    expect(ev).toMatchObject({ departamento: 'comercial', lead_id: 'lead-prop' });
    expect(ev.payload).toMatchObject({ propostaId: 'prop-1', numeroProposta: '001' });
  });

  it('incrementPropostaPublicaAcesso registra comercial:proposta_aberta na PRIMEIRA visualização', async () => {
    state.propAcessos = 0; // primeira vez
    state.propLeadId = 'lead-abre';
    const sb = makeSb();
    vi.spyOn(sb, 'onPropostaAberta').mockResolvedValue(undefined as any);

    await sb.incrementPropostaPublicaAcesso('slug-xyz');

    const ev = state.events.find((e) => e.tipo === 'comercial:proposta_aberta');
    expect(ev).toBeTruthy();
    expect(ev).toMatchObject({ departamento: 'comercial', canal: 'web', lead_id: 'lead-abre' });
    expect(ev.payload).toMatchObject({ propostaId: 'prop-9', slug: 'slug-xyz' });
  });

  it('incrementPropostaPublicaAcesso NÃO registra proposta_aberta em refresh (acessos > 0)', async () => {
    state.propAcessos = 3; // já foi aberta antes
    state.propLeadId = 'lead-abre';
    const sb = makeSb();
    vi.spyOn(sb, 'onPropostaAberta').mockResolvedValue(undefined as any);

    await sb.incrementPropostaPublicaAcesso('slug-xyz');
    expect(state.events.find((e) => e.tipo === 'comercial:proposta_aberta')).toBeUndefined();
  });
});
