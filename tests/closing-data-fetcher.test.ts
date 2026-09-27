// tests/closing-data-fetcher.test.ts
import { describe, it, expect, vi } from 'vitest';
import { fetchByLeadId, searchLeadByName, buildInitialData, normalizarNomeBusca, normalizarModalidade } from '../src/modules/closing/closing-data-fetcher.js';
import { leadCamilaRow, propostaPublicaCamilaRow } from './fixtures/closing-camila.js';

// Fake HONESTO de propostas_publicas: aplica de verdade os filtros eq/gt, a
// ordenação e o limit — e explode se alguém tentar o `.or()` com nome/telefone
// (a busca antiga, que entregava a proposta de um HOMÔNIMO).
function fakePropostas(linhas: any[]) {
  const eqs: Array<[string, unknown]> = [];
  const gts: Array<[string, string]> = [];
  let ordem: { col: string; desc: boolean } | null = null;
  let limite = Infinity;
  const b: any = {
    select: () => b,
    eq: (col: string, v: unknown) => { eqs.push([col, v]); return b; },
    gt: (col: string, v: string) => { gts.push([col, v]); return b; },
    or: () => { throw new Error('busca por nome/telefone (.or) não pode mais existir'); },
    ilike: () => { throw new Error('busca por nome (ilike) não pode mais existir'); },
    order: (col: string, o?: { ascending?: boolean }) => { ordem = { col, desc: o?.ascending === false }; return b; },
    limit: (n: number) => { limite = n; return b; },
    maybeSingle: async () => {
      let r = linhas
        .filter((l) => eqs.every(([c, v]) => l[c] === v))
        .filter((l) => gts.every(([c, v]) => String(l[c] ?? '') > v));
      if (ordem) {
        const { col, desc } = ordem;
        r = [...r].sort((x, y) => String(x[col]).localeCompare(String(y[col])) * (desc ? -1 : 1));
      }
      r = r.slice(0, limite);
      if (r.length > 1) return { data: null, error: { message: 'multiple rows returned' } };
      return { data: r[0] ?? null, error: null };
    },
  };
  return b;
}

function mockSupabase(opts: {
  leadById?: any;
  leadsByName?: any[];   // resultado do ilike no nome
  leadsByPhone?: any[];  // resultado do ilike no telefone
  leadsRecent?: any[];   // lote recente do fallback (sem ilike)
  propostas?: any[];
}) {
  return {
    from: (table: string) => {
      if (table === 'leads') {
        // Builder encadeável: lembra em QUAL coluna o ilike caiu pra devolver o
        // dataset certo no limit() (nome / telefone / fallback recente).
        let ilikeCol: string | null = null;
        const b: any = {
          select: () => b,
          eq: (_col: string, _val: string) => ({
            maybeSingle: async () => ({ data: opts.leadById ?? null, error: null }),
          }),
          ilike: (col: string, _val: string) => { ilikeCol = col; return b; },
          or: (_expr: string) => b,
          order: () => b,
          limit: async () => {
            const data = ilikeCol === 'phone' ? (opts.leadsByPhone ?? [])
              : ilikeCol === 'name' ? (opts.leadsByName ?? [])
              : (opts.leadsRecent ?? []); // sem ilike = fallback recente
            return { data, error: null };
          },
        };
        return b;
      }
      if (table === 'propostas_publicas') return fakePropostas(opts.propostas ?? []);
      throw new Error(`tabela inesperada: ${table}`);
    },
  } as any;
}

describe('closing-data-fetcher', () => {
  const FUTURO = '2999-01-01T00:00:00Z';
  const propostaDaCamila = { ...propostaPublicaCamilaRow, lead_id: leadCamilaRow.id, revoked: false, expires_at: FUTURO };

  it('fetchByLeadId retorna lead + última proposta', async () => {
    const sb = mockSupabase({ leadById: leadCamilaRow, propostas: [propostaDaCamila] });
    const res = await fetchByLeadId(sb, leadCamilaRow.id);
    expect(res.lead).toBeTruthy();
    expect(res.lead!.id).toBe(leadCamilaRow.id);
    expect(res.proposta).toBeTruthy();
    expect(res.proposta!.dados_input!.potencia_kwp).toBe(8.4);
  });

  // O bug da auditoria: a busca era `telefone OU nome ilike %nome%`. A "Maria"
  // pegava a proposta da "Maria José" (ou de qualquer Maria) — e o contrato saía
  // com o sistema e o valor de OUTRA cliente.
  it('homônima: a lead "Maria" NUNCA pega a proposta de outra Maria', async () => {
    const maria = { id: 'lead-maria', name: 'Maria', phone: '5561999990000', company_id: 'emp-1' };
    const outraMaria = {
      id: 'p-outra', lead_id: 'lead-maria-jose', company_id: 'emp-1', cliente_nome: 'Maria',
      cliente_telefone: '5561999990000', revoked: false, expires_at: FUTURO,
      created_at: '2026-09-01T10:00:00Z', dados_input: { potenciaKwp: 99 },
    };
    const sb = mockSupabase({ leadById: maria, propostas: [outraMaria] });
    const res = await fetchByLeadId(sb, 'lead-maria');
    expect(res.proposta).toBeNull();
  });

  it('pega a proposta pelo lead_id, a mais nova VÁLIDA (ignora revogada e vencida)', async () => {
    const maria = { id: 'lead-maria', name: 'Maria', phone: null, company_id: 'emp-1' };
    const base = { lead_id: 'lead-maria', company_id: 'emp-1', cliente_nome: 'Maria', dados_input: {} };
    const sb = mockSupabase({
      leadById: maria,
      propostas: [
        { ...base, id: 'antiga', revoked: false, expires_at: FUTURO, created_at: '2026-08-01T10:00:00Z' },
        { ...base, id: 'revogada', revoked: true, expires_at: FUTURO, created_at: '2026-09-20T10:00:00Z' },
        { ...base, id: 'vencida', revoked: false, expires_at: '2020-01-01T00:00:00Z', created_at: '2026-09-21T10:00:00Z' },
        { ...base, id: 'boa', revoked: false, expires_at: FUTURO, created_at: '2026-09-10T10:00:00Z' },
      ],
    });
    const res = await fetchByLeadId(sb, 'lead-maria');
    expect(res.proposta?.id).toBe('boa');
  });

  it('não pega proposta de OUTRA empresa, mesmo com o mesmo lead_id', async () => {
    const maria = { id: 'lead-maria', name: 'Maria', phone: null, company_id: 'emp-1' };
    const sb = mockSupabase({
      leadById: maria,
      propostas: [{ id: 'x', lead_id: 'lead-maria', company_id: 'emp-2', revoked: false, expires_at: FUTURO, created_at: '2026-09-10T10:00:00Z' }],
    });
    expect((await fetchByLeadId(sb, 'lead-maria')).proposta).toBeNull();
  });

  it('nome com vírgula/parêntese não quebra nada (não vai mais pro filtro)', async () => {
    const lead = { id: 'lead-x', name: 'Ana, (teste).*', phone: '1,2', company_id: 'emp-1' };
    const sb = mockSupabase({ leadById: lead, propostas: [] });
    await expect(fetchByLeadId(sb, 'lead-x')).resolves.toMatchObject({ proposta: null });
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

  it('searchLeadByName: acha por TELEFONE quando o termo é número (não só nome)', async () => {
    // nome não bate (perfil do WhatsApp é outro), mas o telefone acha
    const sb = mockSupabase({ leadsByName: [], leadsByPhone: [{ ...leadCamilaRow, id: 'tel-1' }] });
    const res = await searchLeadByName(sb, '5561998800770');
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('tel-1');
  });

  it('searchLeadByName: nome E telefone juntos deduplicam pelo id', async () => {
    const mesmo = { ...leadCamilaRow, id: 'dup-1' };
    const sb = mockSupabase({ leadsByName: [mesmo], leadsByPhone: [mesmo] });
    // termo com dígitos suficientes dispara as duas buscas; o mesmo lead não repete
    const res = await searchLeadByName(sb, 'Camila 5561998800770');
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

  // REGRESSÃO (bug "fechar pede tudo de novo"): a proposta salva dados_input em
  // camelCase (potenciaKwp/valorTotalRs/modulo.fabricante/potenciaW + investimento.total),
  // exatamente como montarDadosInputCompleto produz — NÃO em snake_case. O fechar
  // precisa ler esse formato real, senão sistema/comercial vêm vazios e a Eva re-pergunta tudo.
  it('buildInitialData lê o formato REAL da proposta (camelCase) pra sistema + comercial', () => {
    const propostaReal = {
      id: 'p-real',
      cliente_nome: leadCamilaRow.name,
      cliente_telefone: leadCamilaRow.phone,
      created_at: '2026-06-22T00:00:00Z',
      dados_input: {
        nomeCliente: leadCamilaRow.name,
        potenciaKwp: 8.4,
        modalidade: 'Autoconsumo local',
        modulo: { fabricante: 'Risen Energy', modelo: 'RSM 700W', potenciaW: 700, quantidade: 12 },
        inversor: { fabricante: 'Sungrow', modelo: 'SG5.0RS', potenciaW: 5000, quantidade: 1 },
        valorTotalRs: 38500,
        investimento: { total: 38500 },
      },
    };
    const partial = buildInitialData(leadCamilaRow as any, propostaReal as any);
    // sistema
    expect(partial.sistema?.kwp).toBe(8.4);
    expect(partial.sistema?.modulos.marca).toBe('Risen Energy');
    expect(partial.sistema?.modulos.potencia_w).toBe(700);
    expect(partial.sistema?.modulos.quantidade).toBe(12);
    expect(partial.sistema?.inversor.marca).toBe('Sungrow');
    expect(partial.sistema?.inversor.modelo).toBe('SG5.0RS');
    expect(partial.sistema?.inversor.potencia_kw).toBe(5); // 5000 W → 5 kW
    // modalidade: texto humano da proposta normalizado pro enum do contrato
    expect(partial.sistema?.modalidade).toBe('autoconsumo_local');
    // comercial
    expect(partial.comercial?.valor_total_brl).toBe(38500);
  });

  it('normalizarModalidade: texto humano e enum → enum do contrato', () => {
    expect(normalizarModalidade('Autoconsumo local')).toBe('autoconsumo_local');
    expect(normalizarModalidade('Autoconsumo remoto')).toBe('autoconsumo_remoto');
    expect(normalizarModalidade('Geração compartilhada')).toBe('geracao_compartilhada');
    expect(normalizarModalidade('autoconsumo_remoto')).toBe('autoconsumo_remoto'); // legado já-enum
    expect(normalizarModalidade(undefined)).toBe('autoconsumo_local'); // default seguro
  });

  it('buildInitialData ainda aceita o formato legado snake_case (compat)', () => {
    const partial = buildInitialData(leadCamilaRow as any, propostaPublicaCamilaRow as any);
    expect(partial.sistema?.kwp).toBe(8.4);
    expect(partial.comercial?.valor_total_brl).toBe(38500);
  });
});
