// tests/closing-data-fetcher.test.ts
import { describe, it, expect, vi } from 'vitest';
import { fetchByLeadId, searchLeadByName, buildInitialData, normalizarNomeBusca } from '../src/modules/closing/closing-data-fetcher.js';
import { leadCamilaRow, propostaPublicaCamilaRow } from './fixtures/closing-camila.js';

function mockSupabase(opts: {
  leadById?: any;
  leadsByName?: any[];  // resultado do ilike direto
  leadsRecent?: any[];  // lote recente do fallback (sem ilike)
  propostas?: any[];
}) {
  return {
    from: (table: string) => {
      if (table === 'leads') {
        return {
          select: () => ({
            eq: (_col: string, _val: string) => ({
              maybeSingle: async () => ({ data: opts.leadById ?? null, error: null }),
            }),
            ilike: (_col: string, _val: string) => ({
              not: (_c: string, _o: string, _v: string) => ({
                order: () => ({
                  limit: () => ({ data: opts.leadsByName ?? [], error: null }),
                }),
              }),
              order: () => ({
                limit: () => ({ data: opts.leadsByName ?? [], error: null }),
              }),
            }),
            // Fallback do searchLeadByName (sem ilike): select().not().order().limit()
            not: (_c: string, _o: string, _v: string) => ({
              order: () => ({
                limit: () => ({ data: opts.leadsRecent ?? [], error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'propostas_publicas') {
        return {
          select: () => ({
            or: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: opts.propostas?.[0] ?? null, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`tabela inesperada: ${table}`);
    },
  } as any;
}

describe('closing-data-fetcher', () => {
  it('fetchByLeadId retorna lead + última proposta', async () => {
    const sb = mockSupabase({ leadById: leadCamilaRow, propostas: [propostaPublicaCamilaRow] });
    const res = await fetchByLeadId(sb, leadCamilaRow.id);
    expect(res.lead).toBeTruthy();
    expect(res.lead!.id).toBe(leadCamilaRow.id);
    expect(res.proposta).toBeTruthy();
    expect(res.proposta!.dados_input!.potencia_kwp).toBe(8.4);
  });

  it('fetchByLeadId retorna proposta null quando não acha', async () => {
    const sb = mockSupabase({ leadById: leadCamilaRow, propostas: [] });
    const res = await fetchByLeadId(sb, leadCamilaRow.id);
    expect(res.proposta).toBeNull();
  });

  it('searchLeadByName retorna [] quando vazio', async () => {
    const sb = mockSupabase({ leadsByName: [] });
    const res = await searchLeadByName(sb, 'Inexistente');
    expect(res).toEqual([]);
  });

  it('searchLeadByName retorna múltiplos quando ambíguo', async () => {
    const sb = mockSupabase({
      leadsByName: [leadCamilaRow, { ...leadCamilaRow, id: '99', name: 'Camila Outra' }],
    });
    const res = await searchLeadByName(sb, 'Camila');
    expect(res).toHaveLength(2);
  });

  it('normalizarNomeBusca tira acento e maiúscula', () => {
    expect(normalizarNomeBusca('Márcio')).toBe('marcio');
    expect(normalizarNomeBusca('JOÃO  ')).toBe('joao');
    expect(normalizarNomeBusca('Conceição')).toBe('conceicao');
  });

  it('searchLeadByName: fallback acha IGNORANDO acento (Marcio → Márcio)', async () => {
    // ilike direto vazio; o fallback pega o lote recente e filtra normalizado
    const sb = mockSupabase({
      leadsByName: [],
      leadsRecent: [{ ...leadCamilaRow, id: '7', name: 'Márcio Ferraz' }, { ...leadCamilaRow, id: '8', name: 'Outro' }],
    });
    const res = await searchLeadByName(sb, 'Marcio'); // sem acento
    expect(res).toHaveLength(1);
    expect(res[0].name).toBe('Márcio Ferraz');
  });

  it('searchLeadByName: ilike direto acha → não usa fallback', async () => {
    const sb = mockSupabase({ leadsByName: [leadCamilaRow], leadsRecent: [] });
    const res = await searchLeadByName(sb, 'Camila');
    expect(res).toHaveLength(1);
  });

  it('buildInitialData mapeia lead + proposta pra Partial<DadosFechamento>', () => {
    const partial = buildInitialData(leadCamilaRow as any, propostaPublicaCamilaRow as any);
    expect(partial.titular_uc?.tipo).toBe('PF');
    expect((partial.titular_uc as any)?.nome).toBe(leadCamilaRow.name);
    expect((partial.titular_uc as any)?.cpf).toBe(leadCamilaRow.cpf_cnpj);
    expect(partial.concessionaria).toBe('Equatorial-GO');
    expect(partial.uc_numero).toBe('10005936703');
    expect(partial.sistema?.kwp).toBe(8.4);
    expect(partial.comercial?.valor_total_brl).toBe(38500);
    expect((partial.titular_uc as any)?.rg).toBeUndefined();
  });

  it('buildInitialData infere concessionária pela UF se faltar', () => {
    const partial = buildInitialData({ ...leadCamilaRow, concessionaria: null, uf: 'DF' } as any, null);
    expect(partial.concessionaria).toBe('Neoenergia-DF');
  });
});
