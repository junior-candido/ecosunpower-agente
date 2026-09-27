import { describe, it, expect } from 'vitest';
import { buscarPropostasOrfas, vincularPropostaAoLead, escaparIlike } from '../src/modules/closing/closing-data-fetcher.js';
import { montarFechamentoAuto } from '../src/modules/closing/fechamento-auto.js';
import { renderContratoFormPage } from '../src/modules/dashboard/contrato-form-views.js';
import { CONTRATOS, getContrato } from '../src/modules/closing/contratos-registry.js';

// Proposta salva sem telefone fica sem lead_id (órfã) — e o contrato nunca a
// achava. Agora o operador VINCULA explicitamente (nunca automático: homônimo).
// E proposta vencida continua valendo pro contrato (a validade é do link público).

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** ilike do Postgres de verdade: % e _ são curinga, \ escapa. */
function ilikeRe(pat: string): RegExp {
  let re = '';
  for (let i = 0; i < pat.length; i++) {
    const ch = pat[i];
    if (ch === '\\') { re += escRe(pat[++i] ?? ''); continue; }
    if (ch === '%') { re += '.*'; continue; }
    if (ch === '_') { re += '.'; continue; }
    re += escRe(ch);
  }
  return new RegExp('^' + re + '$', 'i');
}

function fakeDb(tabelas: Record<string, any[]>, registro: { filtros: any[] } = { filtros: [] }) {
  return {
    from(tabela: string) {
      const eqs: Array<[string, unknown]> = [];
      const iss: Array<[string, unknown]> = [];
      let ilike: [string, RegExp] | null = null;
      let update: any = null;
      let limite = Infinity;
      const casa = (l: any) => eqs.every(([c, v]) => l[c] === v)
        && iss.every(([c, v]) => (l[c] ?? null) === v)
        && (!ilike || ilike[1].test(String(l[ilike[0]] ?? '')));
      const b: any = {
        select: () => b,
        eq: (c: string, v: unknown) => { eqs.push([c, v]); return b; },
        is: (c: string, v: unknown) => { iss.push([c, v]); return b; },
        ilike: (c: string, v: string) => { ilike = [c, ilikeRe(v)]; registro.filtros.push({ ilike: v }); return b; },
        order: () => b,
        limit: (n: number) => { limite = n; return b; },
        update: (row: any) => { update = row; return b; },
        maybeSingle: async () => ({ data: (tabelas[tabela] ?? []).filter(casa)[0] ?? null, error: null }),
        then: (ok: any, err: any) => {
          const linhas = (tabelas[tabela] ?? []).filter(casa);
          if (update) {
            for (const l of linhas) Object.assign(l, update);
            return Promise.resolve({ data: linhas.map((l) => ({ id: l.id })), error: null }).then(ok, err);
          }
          return Promise.resolve({ data: linhas.slice(0, limite), error: null }).then(ok, err);
        },
      };
      return b;
    },
  } as any;
}

describe('escaparIlike', () => {
  it('curinga digitado vira texto (% _ \\)', () => {
    expect(escaparIlike('50%_a\\b')).toBe('50\\%\\_a\\\\b');
  });
});

describe('buscarPropostasOrfas', () => {
  const props = [
    { id: 'p1', company_id: 'emp-1', lead_id: null, revoked: false, cliente_nome: 'Maria Souza', numero_proposta: 'P-1', created_at: '2026-09-01' },
    { id: 'p2', company_id: 'emp-1', lead_id: 'outro', revoked: false, cliente_nome: 'Maria Souza', created_at: '2026-09-02' },
    { id: 'p3', company_id: 'emp-2', lead_id: null, revoked: false, cliente_nome: 'Maria Souza', created_at: '2026-09-03' },
    { id: 'p4', company_id: 'emp-1', lead_id: null, revoked: false, cliente_nome: 'João', created_at: '2026-09-04' },
    { id: 'p5', company_id: 'emp-1', lead_id: null, revoked: true, cliente_nome: 'Maria Souza', created_at: '2026-09-05' },
  ];

  it('só as sem lead, não revogadas, da MESMA empresa, com o nome do cliente', async () => {
    const r = await buscarPropostasOrfas(fakeDb({ propostas_publicas: props }), 'emp-1', 'Maria Souza');
    expect(r.map((p) => p.id)).toEqual(['p1']);
  });

  it('sem empresa → nada (nunca busca em todas as empresas)', async () => {
    expect(await buscarPropostasOrfas(fakeDb({ propostas_publicas: props }), null, 'Maria Souza')).toEqual([]);
  });

  it('nome com curinga é escapado no filtro (o "%" não casa com todo mundo)', async () => {
    const reg = { filtros: [] as any[] };
    const r = await buscarPropostasOrfas(fakeDb({ propostas_publicas: props }, reg), 'emp-1', '%');
    expect(reg.filtros[0].ilike).toBe('%\\%%');
    expect(r).toEqual([]);
  });
});

describe('vincularPropostaAoLead', () => {
  it('liga a órfã da mesma empresa ao lead', async () => {
    const tab = { propostas_publicas: [{ id: 'p1', company_id: 'emp-1', lead_id: null as string | null }] };
    const ok = await vincularPropostaAoLead(fakeDb(tab), { propostaId: 'p1', leadId: 'L1', companyId: 'emp-1' });
    expect(ok).toBe(true);
    expect(tab.propostas_publicas[0].lead_id).toBe('L1');
  });

  it('não rouba proposta que já tem lead, nem de outra empresa', async () => {
    const tab = { propostas_publicas: [
      { id: 'p1', company_id: 'emp-1', lead_id: 'outro' as string | null },
      { id: 'p2', company_id: 'emp-2', lead_id: null as string | null },
    ] };
    expect(await vincularPropostaAoLead(fakeDb(tab), { propostaId: 'p1', leadId: 'L1', companyId: 'emp-1' })).toBe(false);
    expect(await vincularPropostaAoLead(fakeDb(tab), { propostaId: 'p2', leadId: 'L1', companyId: 'emp-1' })).toBe(false);
    expect(tab.propostas_publicas[0].lead_id).toBe('outro');
    expect(tab.propostas_publicas[1].lead_id).toBeNull();
  });

  it('sem empresa → não vincula', async () => {
    const tab = { propostas_publicas: [{ id: 'p1', company_id: 'emp-1', lead_id: null }] };
    expect(await vincularPropostaAoLead(fakeDb(tab), { propostaId: 'p1', leadId: 'L1', companyId: null })).toBe(false);
  });
});

describe('proposta vencida: o contrato usa, mas avisa', () => {
  const lead = { id: 'L1', company_id: 'emp-1', name: 'Maria', contrato_dados: null };

  it('montarFechamentoAuto devolve a data de expiração quando a proposta venceu', async () => {
    const prop = { id: 'p1', lead_id: 'L1', company_id: 'emp-1', revoked: false, expires_at: '2026-08-10T12:00:00Z', created_at: '2026-06-10', dados_input: { potenciaKwp: 5, valorTotalRs: 20000 } };
    const r = await montarFechamentoAuto(fakeDb({ leads: [lead], propostas_publicas: [prop], fechamentos: [] }), 'L1', 'fv');
    expect(r!.temProposta).toBe(true);
    expect(r!.propostaExpiradaEm).toBe('2026-08-10T12:00:00Z');
  });

  it('proposta no prazo → sem aviso', async () => {
    const prop = { id: 'p1', lead_id: 'L1', company_id: 'emp-1', revoked: false, expires_at: '2999-01-01T00:00:00Z', created_at: '2026-06-10', dados_input: {} };
    const r = await montarFechamentoAuto(fakeDb({ leads: [lead], propostas_publicas: [prop], fechamentos: [] }), 'L1', 'fv');
    expect(r!.propostaExpiradaEm).toBeNull();
  });
});

describe('formulário: aviso de vencida e o "Vincular proposta"', () => {
  const def = getContrato('fv')!;
  const base = {
    leadId: 'L1', nome: 'Maria', def, problemas: [],
    tipos: CONTRATOS.map((c) => ({ tipo: c.tipo, nome: c.nome, emoji: c.emoji })),
    valores: {}, faltando: [],
  };

  it('vencida → "proposta expirada em dd/mm — conferir valores"', () => {
    const html = renderContratoFormPage({ ...base, temProposta: true, propostaExpiradaEm: '2026-08-10T12:00:00Z' });
    expect(html).toContain('proposta expirada em 10/08');
    expect(html).toContain('conferir valores');
  });

  it('sem proposta + órfãs parecidas → botão de vincular cada uma (nome escapado)', () => {
    const html = renderContratoFormPage({
      ...base, temProposta: false,
      propostasOrfas: [{ id: 'p1', cliente_nome: 'Maria <b>x</b>', numero_proposta: 'P-1', created_at: '2026-09-01T10:00:00Z' }],
    });
    expect(html).toContain('/dashboard/leads/L1/contrato-vincular-proposta');
    expect(html).toContain('name="proposta_id" value="p1"');
    expect(html).toContain('Maria &lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('<b>x</b>');
  });
});
