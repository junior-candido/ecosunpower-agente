// Rotas /dashboard/command-center e /dashboard/tv (fase A): só EcoSun, e
// contagem que falha vira "—" (nunca um 0 inventado). Testa os handlers que o
// router registra (command-center-rotas.ts) com req/res falsos.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { rotaCommandCenter, rotaModoTv } from '../src/modules/dashboard/command-center-rotas.js';
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
  'maintenance_reminders:status': { count: 5, error: null },
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

describe('GET /dashboard/command-center', () => {
  it('tenant é mandado pro Cockpit (a entrada dele), sem consultar nada', async () => {
    const db = supabaseFalso(TUDO_OK);
    const res = resFalso();
    await rotaCommandCenter(db)(reqDe(tenant), res as unknown as Response);
    expect(res.redirect).toHaveBeenCalledWith('/dashboard/cockpit');
    expect(res.send).not.toHaveBeenCalled();
    expect(db.from).not.toHaveBeenCalled();
  });

  it('sem sessão também vai pro Cockpit (nunca pra Home da casa)', async () => {
    const res = resFalso();
    await rotaCommandCenter(supabaseFalso(TUDO_OK))(reqDe(undefined), res as unknown as Response);
    expect(res.redirect).toHaveBeenCalledWith('/dashboard/cockpit');
  });

  it('EcoSun: mostra os contadores reais do mês', async () => {
    const res = resFalso();
    await rotaCommandCenter(supabaseFalso(TUDO_OK), () => AGORA)(reqDe(junior), res as unknown as Response);
    expect(res.redirect).not.toHaveBeenCalled();
    const h = res.send.mock.calls[0][0] as string;
    expect(cartaoKpi(h, 'Leads do mês')).toContain('<div class="cc-val">212</div>');
    expect(cartaoKpi(h, 'Vendas')).toContain('<div class="cc-val">9</div>');
  });

  it('contagem com erro vira "—" (nunca 0); as outras seguem com número', async () => {
    const res = resFalso();
    const db = supabaseFalso({
      ...TUDO_OK,
      'leads:contract_signed_at': { count: null, error: { message: 'timeout' } },
      'propostas_publicas:revoked': { count: 0, error: { message: 'permission denied' } },
    });
    await rotaCommandCenter(db, () => AGORA)(reqDe(junior), res as unknown as Response);
    const h = res.send.mock.calls[0][0] as string;
    const vendas = cartaoKpi(h, 'Vendas');
    expect(vendas).toContain('<div class="cc-val">—</div>');
    expect(vendas).not.toContain('<div class="cc-val">0</div>');
    expect(cartaoKpi(h, 'Propostas')).toContain('<div class="cc-val">—</div>');
    expect(cartaoKpi(h, 'Leads do mês')).toContain('<div class="cc-val">212</div>');
    // Resumo da Eva não cita número quando falta algum dos três.
    expect(h).not.toContain('Neste mês entraram');
    expect(h).not.toContain('0 vendas fechadas');
  });

  it('consulta só os dados da EcoSun (company_id em todas as 5 contagens)', async () => {
    const db = supabaseFalso(TUDO_OK);
    const res = resFalso();
    await rotaCommandCenter(db, () => AGORA)(reqDe(junior), res as unknown as Response);
    const escopo = db.chamadas.filter((c) => c.metodo === 'eq' && c.coluna === 'company_id');
    expect(escopo).toHaveLength(5);
    expect(escopo.every((c) => c.valor === ECOSUN)).toBe(true);
  });

  it('se a busca inteira lança, os 3 KPIs reais mostram "—" + "sem dado agora" (não "em construção")', async () => {
    const res = resFalso();
    const db = { from: vi.fn(() => { throw new Error('cliente quebrado'); }) } as unknown as SupabaseClient;
    await rotaCommandCenter(db, () => AGORA)(reqDe(junior), res as unknown as Response);
    const h = res.send.mock.calls[0][0] as string;
    for (const rotulo of ['Leads do mês', 'Propostas', 'Vendas']) {
      const c = cartaoKpi(h, rotulo);
      expect(c, rotulo).toContain('<div class="cc-val">—</div>');
      expect(c, rotulo).toContain('sem dado agora');
      expect(c, rotulo).not.toContain('em construção');
    }
  });
});

describe('GET /dashboard/tv', () => {
  it('tenant é mandado pro Cockpit até a fase B', async () => {
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
      'maintenance_reminders:status': { count: 0, error: null },
    });
    expect(await fetchCommandCenterKpis(db, ECOSUN, AGORA)).toEqual({
      leads: null, propostas: 47, vendas: 9, usinasNovas: null, manutencoesPendentes: 0,
    });
  });

  it('filtra company_id em todas as contagens', async () => {
    const db = supabaseFalso(TUDO_OK);
    await fetchCommandCenterKpis(db, 'empresa-x', AGORA);
    const porTabela = db.chamadas.filter((c) => c.metodo === 'eq' && c.coluna === 'company_id');
    expect(porTabela.map((c) => c.tabela).sort()).toEqual(
      ['leads', 'leads', 'maintenance_reminders', 'propostas_publicas', 'sistemas_clientes'],
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
    // Janela de manutenção sai da data de referência, não do relógio do servidor.
    const manut = db.chamadas.find((c) => c.tabela === 'maintenance_reminders' && c.metodo === 'lte')!;
    expect(manut.valor).toBe('2026-10-30');
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
