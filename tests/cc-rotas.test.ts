// Rotas /dashboard/command-center, /dashboard/atencao e /dashboard/tv (fase B):
// abertas pro tenant (Modo TV só da casa), escopo pela empresa da sessão,
// papel + módulo contratado e falha vira "—". Testa os handlers que o router
// registra (command-center-rotas.ts) com req/res falsos.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { rotaCommandCenter, rotaCentralAtencao, rotaModoTv, CC_ABERTO_A_TENANTS } from '../src/modules/dashboard/command-center-rotas.js';
import { fetchCommandCenterKpis } from '../src/modules/dashboard/queries.js';
import type { DashUser } from '../src/modules/dashboard/permissions.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const junior: DashUser = { id: 'u', companyId: ECOSUN, nome: 'Junior', login: 'j', isAdmin: true, roleNome: 'Administrador', permissoes: {} };
const tenant: DashUser = {
  id: 't', companyId: 'aaaa1111-2222-3333-4444-555566667777', nome: 'Thiago', login: 't',
  isAdmin: true, roleNome: 'Admin', permissoes: {}, companyNome: 'Sabion Solar',
};
const AGORA = new Date('2026-09-27T14:42:00Z');

type Resultado = { count: number | null; error: unknown };

/** Supabase falso: cada contagem é identificada por "tabela:coluna do filtro". */
type Chamada = { tabela: string; metodo: string; coluna: string; valor: unknown };

function supabaseFalso(respostas: Record<string, Resultado | Error>) {
  const chamadas: Chamada[] = [];
  const from = vi.fn((tabela: string) => {
    const filtros: string[] = [];
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'gte', 'lt', 'lte', 'in', 'not', 'order', 'limit']) {
      q[m] = (col?: unknown, valor?: unknown) => {
        if (typeof col === 'string' && m !== 'select') {
          filtros.push(col);
          chamadas.push({ tabela, metodo: m, coluna: col, valor });
        }
        return q;
      };
    }
    q.then = (ok: (r: Resultado) => unknown, falha: (e: unknown) => unknown) => {
      const chave = `${tabela}:${filtros[0] ?? ''}`;
      const r = respostas[chave];
      if (r instanceof Error) return Promise.reject(r).then(ok, falha);
      return Promise.resolve(r ?? { count: null, error: { message: `sem resposta pra ${chave}` } }).then(ok, falha);
    };
    return q;
  });
  return { from, chamadas } as unknown as SupabaseClient & { from: typeof from; chamadas: Chamada[] };
}

const TUDO_OK: Record<string, Resultado> = {
  'leads:created_at': { count: 212, error: null },
  'propostas_publicas:revoked': { count: 47, error: null },
  'leads:contract_signed_at': { count: 9, error: null },
  'sistemas_clientes:created_at': { count: 3, error: null },
};

function resFalso() {
  const res = { redirect: vi.fn(), type: vi.fn(), send: vi.fn() };
  res.type.mockReturnValue(res);
  return res;
}
const reqDe = (user?: DashUser) => ({ dashUser: user } as unknown as Request);

/** Recorta o cartão de KPI pelo rótulo. */
function cartaoKpi(html: string, rotulo: string): string {
  const i = html.indexOf(`<div class="cc-lbl">${rotulo}</div>`);
  expect(i, rotulo).toBeGreaterThan(-1);
  return html.slice(i, html.indexOf('</a>', i));
}

beforeEach(() => {
  delete process.env.RLS_TENANT_ROTAS;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const TODOS_MODULOS = ['eva', 'email', 'pasta_digital', 'monitoramento', 'financeiro', 'fiscal', 'rh', 'marketing', 'medicao'].map((modulo) => ({ modulo }));

/** Supabase "de verdade" pra rota: responde qualquer tabela e guarda os filtros.
 *  Por padrão a empresa contratou todos os módulos (empresa_modulos). */
function dbCompleto(respostasIn: Record<string, { data?: unknown[]; count?: number } | Error> = {}) {
  const respostas: Record<string, { data?: unknown[]; count?: number } | Error> = { empresa_modulos: { data: TODOS_MODULOS }, ...respostasIn };
  const chamadas: Array<{ tabela: string; filtros: Array<[string, string, unknown]> }> = [];
  const from = vi.fn((tabela: string) => {
    const reg = { tabela, filtros: [] as Array<[string, string, unknown]> };
    chamadas.push(reg);
    let head = false;
    const q: Record<string, unknown> = {};
    q.select = (_c?: string, o?: { head?: boolean }) => { head = !!o?.head; return q; };
    for (const op of ['eq', 'gte', 'lt', 'lte', 'in', 'is', 'not']) q[op] = (c: string, v: unknown) => { reg.filtros.push([op, c, v]); return q; };
    q.order = () => q; q.limit = () => q; q.range = () => q;
    q.then = (ok: (r: unknown) => unknown, falha?: (e: unknown) => unknown) => {
      const r = respostas[tabela];
      if (r instanceof Error) return Promise.reject(r).then(ok, falha);
      const dados = r?.data ?? [];
      return Promise.resolve({ data: head ? null : dados, count: r?.count ?? dados.length, error: null }).then(ok, falha);
    };
    return q;
  });
  return { from, chamadas } as unknown as SupabaseClient & { from: typeof from; chamadas: typeof chamadas };
}

const vendedor: DashUser = { ...junior, id: 'v', nome: 'Rafael', isAdmin: false, permissoes: { leads: ['visualizar'], propostas: ['visualizar'] } };

describe('GET /dashboard/command-center', () => {
  it('tenant vê a tela (200), com TODA consulta escopada pela empresa dele', async () => {
    const db = dbCompleto({ empresa_modulos: { data: [{ modulo: 'eva' }] }, leads: { data: [], count: 38 } });
    const res = resFalso();
    await rotaCommandCenter(db, () => AGORA)(reqDe(tenant), res as unknown as Response);
    expect(res.redirect).not.toHaveBeenCalled();
    const h = res.send.mock.calls[0][0] as string;
    expect(h).toContain('Command Center');
    expect(cartaoKpi(h, 'Leads do mês')).toContain('<div class="cc-val">38</div>');
    expect(db.chamadas.length).toBeGreaterThan(3);
    for (const c of db.chamadas) expect(c.filtros, c.tabela).toContainEqual(['eq', 'company_id', tenant.companyId]);
    // só a assistente contratada: nada de usinas nem financeiro é lido
    const tabelas = db.chamadas.map((c) => c.tabela);
    for (const t of ['sistemas_clientes', 'geracao_diaria', 'financeiro_recebimentos', 'financeiro_contas_a_pagar']) expect(tabelas).not.toContain(t);
    expect(h).not.toContain('/dashboard/tv');
  });

  it('sem sessão também vai pro Cockpit (nunca pra Home da casa)', async () => {
    const res = resFalso();
    await rotaCommandCenter(dbCompleto())(reqDe(undefined), res as unknown as Response);
    expect(res.redirect).toHaveBeenCalledWith('/dashboard/cockpit');
  });

  it('a flag de abertura pro tenant está ligada', () => {
    expect(CC_ABERTO_A_TENANTS).toBe(true);
  });

  it('empresa_modulos fora do ar: tudo trancado (fail-closed), nenhum dado de negócio lido', async () => {
    const db = dbCompleto({ empresa_modulos: new Error('rede caiu') });
    const res = resFalso();
    await rotaCommandCenter(db, () => AGORA)(reqDe(tenant), res as unknown as Response);
    expect(db.chamadas.map((c) => c.tabela)).toEqual(['empresa_modulos']);
    const h = res.send.mock.calls[0][0] as string;
    expect(h).toContain('data-trancado="monitoramento"');
    expect(h).toContain('data-trancado="leads"');
  });

  it('contas PF: só o admin lê; os outros só PJ', async () => {
    const semAdmin: DashUser = { ...junior, isAdmin: false, permissoes: { financeiro: ['visualizar'] } };
    for (const [u, esperaFiltro] of [[junior, false], [semAdmin, true]] as const) {
      const db = dbCompleto();
      await rotaCommandCenter(db, () => AGORA)(reqDe(u), resFalso() as unknown as Response);
      const c = db.chamadas.find((x) => x.tabela === 'financeiro_contas_a_pagar')!;
      expect(c.filtros.some((f) => f[1] === 'mundo' && f[2] === 'PJ'), u.nome).toBe(esperaFiltro);
    }
  });

  it('nome da assistente só se a empresa tiver um de verdade (tenant desconhecido: "Resumo do dia")', async () => {
    const res = resFalso();
    await rotaCommandCenter(dbCompleto(), () => AGORA)(reqDe(tenant), res as unknown as Response);
    const h = res.send.mock.calls[0][0] as string;
    expect(h).toContain('>Resumo do dia<');
    expect(h).not.toContain('Eva');
    const r2 = resFalso();
    await rotaCommandCenter(dbCompleto(), () => AGORA)(reqDe(junior), r2 as unknown as Response);
    expect(r2.send.mock.calls[0][0]).toContain('Eva · resumo do dia');
  });

  it('EcoSun: mostra os números reais', async () => {
    const res = resFalso();
    const db = dbCompleto({ leads: { data: [], count: 212 }, financeiro_recebimentos: { data: [{ valor: 1200 }] } });
    await rotaCommandCenter(db, () => AGORA)(reqDe(junior), res as unknown as Response);
    expect(res.redirect).not.toHaveBeenCalled();
    const h = res.send.mock.calls[0][0] as string;
    expect(cartaoKpi(h, 'Leads do mês')).toContain('<div class="cc-val">212</div>');
    expect(cartaoKpi(h, 'Recebido')).toContain('1,2<small>mil</small>');
  });

  it('TODA consulta vai escopada pela empresa da sessão', async () => {
    const db = dbCompleto();
    await rotaCommandCenter(db, () => AGORA)(reqDe(junior), resFalso() as unknown as Response);
    expect(db.chamadas.length).toBeGreaterThan(10);
    for (const c of db.chamadas) expect(c.filtros, c.tabela).toContainEqual(['eq', 'company_id', ECOSUN]);
  });

  it('usuário sem permissão de Financeiro/Usinas: nada dessas áreas é lido nem mostrado', async () => {
    const db = dbCompleto({ financeiro_recebimentos: { data: [{ valor: 4321987 }] } });
    const res = resFalso();
    await rotaCommandCenter(db, () => AGORA)(reqDe(vendedor), res as unknown as Response);
    const tabelas = db.chamadas.map((c) => c.tabela);
    for (const t of ['financeiro_recebimentos', 'financeiro_contas_a_pagar', 'geracao_diaria', 'manutencoes', 'demonstrativos_gd']) expect(tabelas).not.toContain(t);
    const h = res.send.mock.calls[0][0] as string;
    expect(h).not.toContain('4,32');
    expect(cartaoKpi(h, 'Recebido')).toContain('sem acesso');
  });

  it('módulos lidos, mas o resto lança: KPIs "—" + "sem dado agora" (não "em construção")', async () => {
    const res = resFalso();
    const db = {
      from: vi.fn((t: string) => {
        if (t === 'empresa_modulos') return dbCompleto().from(t);
        throw new Error('cliente quebrado');
      }),
    } as unknown as SupabaseClient;
    await rotaCommandCenter(db, () => AGORA)(reqDe(junior), res as unknown as Response);
    const h = res.send.mock.calls[0][0] as string;
    for (const rotulo of ['Leads do mês', 'Vendas', 'Energia hoje', 'Recebido']) {
      const c = cartaoKpi(h, rotulo);
      expect(c, rotulo).toContain('<div class="cc-val">—</div>');
      expect(c, rotulo).toContain('sem dado agora');
    }
    expect(h).not.toContain('Tudo em dia');
  });

  it('se até o cliente lança: sem número nenhum e nada de "tudo em dia"', async () => {
    const res = resFalso();
    const db = { from: vi.fn(() => { throw new Error('cliente quebrado'); }) } as unknown as SupabaseClient;
    await rotaCommandCenter(db, () => AGORA)(reqDe(junior), res as unknown as Response);
    const h = res.send.mock.calls[0][0] as string;
    expect(h).not.toMatch(/cc-val">\d/);
    expect(h).not.toContain('Tudo em dia');
  });
});

describe('GET /dashboard/atencao', () => {
  it('tenant vê a Central (200), com as fontes não contratadas marcadas', async () => {
    const res = resFalso();
    const db = dbCompleto({ empresa_modulos: { data: [{ modulo: 'eva' }] } });
    await rotaCentralAtencao(db, () => AGORA)(reqDe(tenant), res as unknown as Response);
    expect(res.redirect).not.toHaveBeenCalled();
    const h = res.send.mock.calls[0][0] as string;
    expect(h).toContain('De onde vêm os avisos');
    expect(h).toContain('não contratado');
    for (const c of db.chamadas) expect(c.filtros, c.tabela).toContainEqual(['eq', 'company_id', tenant.companyId]);
  });

  it('sem sessão vai pro Cockpit', async () => {
    const res = resFalso();
    await rotaCentralAtencao(dbCompleto())(reqDe(undefined), res as unknown as Response);
    expect(res.redirect).toHaveBeenCalledWith('/dashboard/cockpit');
  });

  it('EcoSun vê a lista completa, com o filtro da URL', async () => {
    const res = resFalso();
    const db = dbCompleto({ manutencoes: { data: [{ id: 'm', data_agendada: '2026-09-01' }] } });
    const req = { dashUser: junior, query: { area: 'om' } } as unknown as Request;
    await rotaCentralAtencao(db, () => AGORA)(req, res as unknown as Response);
    const h = res.send.mock.calls[0][0] as string;
    expect(h).toContain('Central de Atenção');
    expect(h).toContain('1 manutenção vencida');
    expect(h).toContain('cc-chip cc-chip-on" href="/dashboard/atencao?area=om"');
  });
});

describe('GET /dashboard/tv', () => {
  it('tenant é mandado pro Cockpit (Modo TV é só da casa)', async () => {
    const res = resFalso();
    await rotaModoTv()(reqDe(tenant), res as unknown as Response);
    expect(res.redirect).toHaveBeenCalledWith('/dashboard/cockpit');
    expect(res.send).not.toHaveBeenCalled();
  });

  it('EcoSun vê a página do Modo TV', async () => {
    const res = resFalso();
    await rotaModoTv()(reqDe(junior), res as unknown as Response);
    expect(res.redirect).not.toHaveBeenCalled();
    expect(res.send.mock.calls[0][0]).toContain('Modo TV');
  });
});

describe('fetchCommandCenterKpis', () => {
  it('erro, count null ou exceção → null; sucesso → número', async () => {
    const db = supabaseFalso({
      ...TUDO_OK,
      'leads:created_at': { count: null, error: null },
      'sistemas_clientes:created_at': new Error('rede caiu'),
    });
    expect(await fetchCommandCenterKpis(db, ECOSUN, AGORA)).toEqual({
      leads: null, propostas: 47, vendas: 9, usinasNovas: null,
    });
  });

  it('filtra company_id em todas as contagens', async () => {
    const db = supabaseFalso(TUDO_OK);
    await fetchCommandCenterKpis(db, 'empresa-x', AGORA);
    const porTabela = db.chamadas.filter((c) => c.metodo === 'eq' && c.coluna === 'company_id');
    expect(porTabela.map((c) => c.tabela).sort()).toEqual(
      ['leads', 'leads', 'propostas_publicas', 'sistemas_clientes'],
    );
    expect(porTabela.every((c) => c.valor === 'empresa-x')).toBe(true);
  });

  it('mês pelo relógio de Brasília: último dia do mês às 22h (já 01:00Z do dia seguinte) ainda é o mês corrente', async () => {
    // 30/09/2026 22:00 em Brasília = 01/10/2026 01:00Z.
    const ref = new Date('2026-10-01T01:00:00Z');
    const db = supabaseFalso(TUDO_OK);
    await fetchCommandCenterKpis(db, ECOSUN, ref);
    const leadsGte = db.chamadas.find((c) => c.tabela === 'leads' && c.metodo === 'gte' && c.coluna === 'created_at')!;
    const leadsLt = db.chamadas.find((c) => c.tabela === 'leads' && c.metodo === 'lt' && c.coluna === 'created_at')!;
    expect(leadsGte.valor).toBe('2026-09-01T03:00:00.000Z');
    expect(leadsLt.valor).toBe('2026-10-01T03:00:00.000Z');
  });

  it('virada de ano em Brasília: 31/12 às 23h fica em dezembro', async () => {
    const db = supabaseFalso(TUDO_OK);
    await fetchCommandCenterKpis(db, ECOSUN, new Date('2027-01-01T02:00:00Z'));
    const lt = db.chamadas.find((c) => c.tabela === 'sistemas_clientes' && c.metodo === 'lt')!;
    const gte = db.chamadas.find((c) => c.tabela === 'sistemas_clientes' && c.metodo === 'gte')!;
    expect(gte.valor).toBe('2026-12-01T03:00:00.000Z');
    expect(lt.valor).toBe('2027-01-01T03:00:00.000Z');
  });
});
