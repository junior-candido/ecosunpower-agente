// Leads — "piscada" e demora (Junior, 28/09/2026: "a tela de lead ainda está
// com aquela piscada, e demorando").
//
// PISCADA: o CSS das telas de Leads (a grade de 3 colunas das Conversas/ficha,
// o Quadro e a lista) ia num <style> no FIM do <body>. O HTML chega em pedaços
// e o navegador pinta o que já chegou: por ~0,5 s a lista de conversas aparecia
// como um texto corrido, sem colunas, e depois "pulava" pro lugar. Regra: todo
// CSS da tela vai no <head> (antes de qualquer coisa ser pintada).
//
// DEMORA: cada ida-e-volta ao Supabase custa a latência inteira. A lista de
// conversas (Conversas e ficha do lead) fazia ~6 rodadas em fila; a ficha do
// lead, outras ~7 só pra montar o lead. Mesmo resultado, menos espera.
import { describe, it, expect } from 'vitest';
import { telasRenovadas } from './fixtures/telas-renovadas.js';
import { USER_CASA, USER_TENANT } from './fixtures/miolo-leads.js';
import { listarConversas } from '../src/modules/dashboard/conversas-queries.js';
import { getLeadDetail, listLeads, leadsParaKanban } from '../src/modules/dashboard/leads-queries.js';
import { buildLeadsInsights } from '../src/modules/dashboard/ai-summary.js';
import { filtroEmpresa } from '../src/modules/dashboard/filtro-empresa.js';

const CASA = '00000000-0000-0000-0000-000000000001';

// ---------------------------------------------------------------------------
// Piscada
// ---------------------------------------------------------------------------
describe('Leads sem piscada — todo CSS da tela no <head>', () => {
  const telas = telasRenovadas(30);
  for (const nome of ['leads', 'conversas', 'ficha', 'quadro-vendas'] as const) {
    it(`${nome}: nenhum <style> nem <link rel=stylesheet> dentro do <body>`, () => {
      const html = telas[nome];
      const corpo = html.slice(html.indexOf('<body'));
      expect(corpo).not.toMatch(/<style[\s>]/i);
      expect(corpo).not.toMatch(/<link[^>]+rel="?stylesheet/i);
    });
  }

  it('Conversas e ficha: a grade de 3 colunas vem por arquivo com hash (cache de 1 ano), no <head>', () => {
    for (const nome of ['conversas', 'ficha'] as const) {
      const html = telas[nome];
      const cabeca = html.slice(0, html.indexOf('</head>'));
      expect(cabeca).toMatch(/<link rel="stylesheet" href="\/dashboard\/estatico\/atendimento\.[0-9a-f]{10}\.css">/);
    }
  });

  it('o arquivo de CSS do Atendimento é servido e tem a grade', async () => {
    const { URL_CSS_ATENDIMENTO, servirEstatico } = await import('../src/modules/dashboard/ui/estatico.js');
    const nome = URL_CSS_ATENDIMENTO.split('/').pop()!;
    let corpo = '';
    const res: any = { setHeader() {}, status() { return res; }, type() { return res; }, send(b: Buffer | string) { corpo = String(b); } };
    servirEstatico({ params: { arquivo: nome } } as any, res);
    expect(corpo).toContain('.cc-at-grade{display:grid');
  });

  it('tenant: mesma regra (nenhum CSS no <body>)', () => {
    const t = telasRenovadas(5, USER_TENANT);
    for (const nome of ['leads', 'conversas', 'ficha', 'quadro-vendas'] as const) {
      expect(t[nome].slice(t[nome].indexOf('<body'))).not.toMatch(/<style[\s>]/i);
    }
  });
});

// ---------------------------------------------------------------------------
// Demora — cliente falso que conta RODADAS (ondas) de ida-e-volta ao banco
// ---------------------------------------------------------------------------
interface Consulta { tabela: string; chamadas: Array<[string, unknown[]]> }

function clienteFalso(resposta: (c: Consulta) => { data?: unknown; count?: number | null; error?: unknown }) {
  let emVoo = 0;
  const estado = { ondas: 0, consultas: [] as Consulta[] };
  const promessa = (c: Consulta) => (ok: (v: unknown) => void, erro: (e: unknown) => void) => {
    if (emVoo === 0) estado.ondas++;
    emVoo++;
    setTimeout(() => { emVoo--; try { ok({ error: null, data: null, count: null, ...resposta(c) }); } catch (e) { erro(e); } }, 5);
  };
  const construir = (c: Consulta): any => new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'then') return promessa(c);
      return (...args: unknown[]) => { c.chamadas.push([prop, args]); return construir(c); };
    },
  });
  const from = (tabela: string) => { const c: Consulta = { tabela, chamadas: [] }; estado.consultas.push(c); return construir(c); };
  const rpc = (nome: string, args: unknown) => { const c: Consulta = { tabela: `rpc:${nome}`, chamadas: [['rpc', [args]]] }; estado.consultas.push(c); return construir(c); };
  return { client: { from, rpc } as never, estado };
}

const chamou = (c: Consulta, metodo: string, ...args: unknown[]) =>
  c.chamadas.some(([m, a]) => m === metodo && args.every((x, i) => a[i] === x));
const selectDe = (c: Consulta) => String(c.chamadas.find(([m]) => m === 'select')?.[1][0] ?? '');

const uuid = (i: number) => `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`;
const hora = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

describe('listarConversas — rodadas ao banco (Conversas e ficha do lead)', () => {
  const N = 250; // 3 lotes de leads
  const convs = Array.from({ length: N }, (_, i) => ({ lead_id: uuid(i), last_message_at: hora(i), created_at: hora(i + 1),
    messages: [{ role: 'user', content: `oi ${i}`, timestamp: hora(i) }] }));
  const leads = convs.map((c, i) => ({ id: c.lead_id, name: `Lead ${i}`, phone: `55619${String(10000000 + i)}`, status: 'novo', city: null, eva_active: true, opt_out: false, claimed_by: null }));
  const resposta = (c: Consulta) => {
    if (c.tabela === 'conversations') return { data: convs };
    if (c.tabela === 'leads') {
      const ids = (c.chamadas.find(([m]) => m === 'in')?.[1][1] ?? []) as string[];
      return { data: leads.filter((l) => ids.includes(l.id)) };
    }
    if (c.tabela === 'rpc:conversas_pessoais_recentes') return { data: [] };
    if (c.tabela === 'whatsapp_numeros_pessoais') return { data: null };
    return { data: [] };
  };

  it('casa (com número pessoal): no máximo 3 rodadas (antes: 6 em fila) e o MESMO resultado', async () => {
    const { client, estado } = clienteFalso(resposta);
    const servico = clienteFalso(resposta);
    const r = await listarConversas(client, USER_CASA, { filtro: 'todas' }, servico.client);
    expect(r.itens).toHaveLength(N);
    expect(r.itens[0]).toMatchObject({ leadId: uuid(0), nome: 'Lead 0', ultimaTexto: 'oi 0', aguardandoResposta: true });
    // As consultas do client do operador e do serviço rodam juntas: conta as ondas pelo relógio.
    expect(estado.ondas).toBeLessThanOrEqual(2);
    expect(servico.estado.ondas).toBeLessThanOrEqual(2);
  });

  it('os lotes de leads (100 ids cada) vão juntos, na MESMA rodada', async () => {
    const { client, estado } = clienteFalso(resposta);
    await listarConversas(client, { ...USER_TENANT, companyId: 'aaaa1111-2222-3333-4444-555566667777' }, {});
    expect(estado.consultas.filter((c) => c.tabela === 'leads')).toHaveLength(3);
    expect(estado.ondas).toBe(2); // conversations → leads (3 lotes juntos)
  });

  it('continua com company_id da SESSÃO em toda consulta (multi-tenant)', async () => {
    const { client, estado } = clienteFalso(resposta);
    await listarConversas(client, USER_TENANT, {});
    for (const c of estado.consultas) expect(chamou(c, 'eq', 'company_id', USER_TENANT.companyId), c.tabela).toBe(true);
  });

  it('tempo total com 60 ms de latência por rodada: < 250 ms (antes ~360+ ms)', async () => {
    const lento = (c: Consulta) => resposta(c);
    const { client } = clienteFalsoLento(lento, 60);
    const servico = clienteFalsoLento(lento, 60);
    const t0 = Date.now();
    await listarConversas(client, USER_CASA, {}, servico.client);
    expect(Date.now() - t0).toBeLessThan(250);
  });
});

function clienteFalsoLento(resposta: (c: Consulta) => { data?: unknown }, ms: number) {
  const construir = (c: Consulta): any => new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'then') return (ok: (v: unknown) => void) => setTimeout(() => ok({ error: null, data: null, count: null, ...resposta(c) }), ms);
      return (...args: unknown[]) => { c.chamadas.push([prop, args]); return construir(c); };
    },
  });
  return { client: { from: (t: string) => construir({ tabela: t, chamadas: [] }), rpc: (n: string) => construir({ tabela: `rpc:${n}`, chamadas: [] }) } as never };
}

describe('getLeadDetail — rodadas ao banco (ficha do lead)', () => {
  const LEAD = { id: uuid(1), phone: '5561999990001', name: 'Ana', status: 'novo', updated_at: hora(1), created_at: hora(30), company_id: CASA, eva_active: true, opt_out: false };
  const resposta = (c: Consulta) => {
    if (c.tabela === 'leads') return { data: LEAD };
    if (c.tabela === 'conversations') return { data: [{ messages: [{ role: 'user', content: 'oi', timestamp: hora(1) }] }] };
    if (c.tabela === 'eva_cadence') return { data: [{ step: 1, status: 'pending', scheduled_for: hora(-2), sent_at: null }] };
    if (c.tabela === 'lead_tarefas') return { data: [{ id: 't1', due_at: hora(2), status: 'pendente' }] };
    if (c.tabela === 'lead_atividades') return { data: [{ id: 'a1', tipo: 'nota' }] };
    return { data: [] };
  };

  it('2 rodadas sem anexos (antes: 6 em fila) e o MESMO lead', async () => {
    const { client, estado } = clienteFalso(resposta);
    const l = await getLeadDetail(client, LEAD.id);
    expect(estado.ondas).toBe(2);
    expect(l).toMatchObject({ id: LEAD.id, has_cadence_pending: true, seloSla: 'vermelho', company_id: CASA });
    expect(l!.conversation_messages).toHaveLength(1);
    expect(l!.timeline).toHaveLength(1);
    expect(l!.tarefas).toHaveLength(1);
  });

  it('timeline/tarefas falhando continuam best-effort', async () => {
    const { client } = clienteFalso((c) => { if (c.tabela === 'lead_atividades' || c.tabela === 'lead_tarefas') throw new Error('caiu'); return resposta(c); });
    const l = await getLeadDetail(client, LEAD.id);
    expect(l!.timeline).toEqual([]);
    expect(l!.tarefas).toEqual([]);
  });

  it('lead inexistente: não consulta o resto', async () => {
    const { client, estado } = clienteFalso(() => ({ data: null }));
    expect(await getLeadDetail(client, LEAD.id)).toBeNull();
    expect(estado.consultas).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Multi-tenant (revisão 2): a lista, o Quadro e os "insights" da Eva só
// contam/mostram leads da empresa da SESSÃO (antes: todas as empresas quando
// a chave do RLS está desligada — o tenant via números da casa).
// ---------------------------------------------------------------------------
describe('Lista de Leads, Quadro e insights — só a empresa da sessão', () => {
  const resp = (c: Consulta) => (c.tabela === 'leads' && selectDe(c).includes('phone') ? { data: [], count: 0 } : { count: 0, data: [] });

  const DO_TENANT = filtroEmpresa(USER_TENANT.companyId);

  it('tenant: TODA consulta em leads leva company_id = empresa da sessão', async () => {
    const { client, estado } = clienteFalso(resp);
    await listLeads(client, { companyId: USER_TENANT.companyId });
    const emLeads = estado.consultas.filter((c) => c.tabela === 'leads');
    expect(DO_TENANT).toBe(`company_id.eq.${USER_TENANT.companyId}`);
    expect(emLeads.length).toBeGreaterThan(5);
    for (const c of emLeads) expect(chamou(c, 'or', DO_TENANT)).toBe(true);
  });

  it('casa: leads da casa + legados sem empresa', async () => {
    const { client, estado } = clienteFalso(resp);
    await listLeads(client, { companyId: CASA });
    for (const c of estado.consultas.filter((x) => x.tabela === 'leads')) {
      expect(chamou(c, 'or', `company_id.eq.${CASA},company_id.is.null`)).toBe(true);
    }
  });

  it('Quadro de Vendas: company_id da sessão', async () => {
    const { client, estado } = clienteFalso(() => ({ data: [] }));
    await leadsParaKanban(client, USER_TENANT);
    expect(chamou(estado.consultas[0], 'or', DO_TENANT)).toBe(true);
  });

  it('insights da Eva: company_id da sessão em leads e cadência', async () => {
    const { client, estado } = clienteFalso(() => ({ data: [{ id: 'x' }], count: 0 }));
    await buildLeadsInsights(client, USER_TENANT.companyId);
    // Cadência: a contagem geral leva a empresa; a busca por ids de leads silentes já vem presa à empresa.
    for (const c of estado.consultas.filter((x) => x.tabela === 'leads' || (x.tabela === 'eva_cadence' && !x.chamadas.some(([m]) => m === 'in')))) {
      expect(chamou(c, 'or', DO_TENANT), `${c.tabela} ${selectDe(c)}`).toBe(true);
    }
  });
});
