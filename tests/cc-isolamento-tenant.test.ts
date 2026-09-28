// Command Center e Central de Atenção abertos pro tenant (28/09/2026).
// Banco falso que APLICA os filtros (eq/gte/lt/in/is/order/range...) e guarda
// linhas de DUAS empresas. Se alguma consulta esquecer o company_id, a linha da
// EcoSun aparece no HTML do tenant — e o teste quebra.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { rotaCommandCenter, rotaCentralAtencao } from '../src/modules/dashboard/command-center-rotas.js';
import type { DashUser } from '../src/modules/dashboard/permissions.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const CONQUISTA = 'c0c0c0c0-2222-3333-4444-555566667777';
const AGORA = new Date('2026-09-28T13:40:00Z'); // 10:40 em Brasília

type Linha = Record<string, unknown>;

/** Banco falso com filtros de verdade. Método desconhecido lança (nada passa sem filtrar). */
function bancoFalso(tabelas: Record<string, Linha[]>) {
  const lidas: string[] = [];
  const client = {
    from(tabela: string) {
      lidas.push(tabela);
      let linhas = [...(tabelas[tabela] ?? [])];
      let head = false;
      let comContagem = false;
      let faixa: [number, number] | null = null;
      let limite: number | null = null;
      const ordens: Array<[string, boolean]> = [];
      const cmp = (a: unknown, b: unknown) => (a === b ? 0 : a === null || a === undefined ? 1 : b === null || b === undefined ? -1 : (a as string) < (b as string) ? -1 : 1);
      const q: Record<string, unknown> = {
        select: (_c?: string, o?: { head?: boolean; count?: string }) => { head = !!o?.head; comContagem = !!o?.count; return q; },
        eq: (c: string, v: unknown) => { linhas = linhas.filter((r) => r[c] === v); return q; },
        gte: (c: string, v: unknown) => { linhas = linhas.filter((r) => r[c] != null && cmp(r[c], v) >= 0); return q; },
        gt: (c: string, v: unknown) => { linhas = linhas.filter((r) => r[c] != null && cmp(r[c], v) > 0); return q; },
        lte: (c: string, v: unknown) => { linhas = linhas.filter((r) => r[c] != null && cmp(r[c], v) <= 0); return q; },
        lt: (c: string, v: unknown) => { linhas = linhas.filter((r) => r[c] != null && cmp(r[c], v) < 0); return q; },
        in: (c: string, vs: unknown[]) => { linhas = linhas.filter((r) => vs.includes(r[c])); return q; },
        is: (c: string, v: unknown) => { linhas = linhas.filter((r) => (r[c] ?? null) === v); return q; },
        order: (c: string, o?: { ascending?: boolean }) => { ordens.push([c, o?.ascending !== false]); return q; },
        limit: (n: number) => { limite = n; return q; },
        range: (a: number, b: number) => { faixa = [a, b]; return q; },
        then: (ok: (r: unknown) => unknown, falha?: (e: unknown) => unknown) => {
          let out = [...linhas];
          if (ordens.length) {
            out.sort((a, b) => {
              for (const [c, asc] of ordens) { const x = cmp(a[c], b[c]); if (x) return asc ? x : -x; }
              return 0;
            });
          }
          const total = out.length;
          if (faixa) out = out.slice(faixa[0], faixa[1] + 1);
          if (limite !== null) out = out.slice(0, limite);
          return Promise.resolve({ data: head ? null : out, count: comContagem ? total : null, error: null }).then(ok, falha);
        },
      };
      return new Proxy(q, {
        get(alvo, prop) {
          if (prop in alvo) return alvo[prop as string];
          throw new Error(`banco falso: método ${String(prop)} não implementado`);
        },
      });
    },
  };
  return { client: client as unknown as SupabaseClient, lidas };
}

/** Dados de uma empresa, com nomes próprios (pra caçar vazamento no HTML). */
function empresa(companyId: string, p: { usina: string; cidade: string; uf: string; conta: string; gdCliente: string; leads: number }): Record<string, Linha[]> {
  const leads: Linha[] = Array.from({ length: p.leads }, (_, i) => ({
    id: `${companyId}-L${i}`, company_id: companyId, created_at: '2026-09-20T12:00:00.000Z', contract_signed_at: null,
    status: 'qualificando', eva_active: true, opt_out: false, updated_at: '2026-09-20T12:00:00.000Z',
  }));
  return {
    sistemas_clientes: [{
      id: `${companyId}-S1`, company_id: companyId, apelido: p.usina, potencia_kwp: 8, cidade: p.cidade, uf: p.uf, ativo: true,
      ultima_sincronizacao: '2026-09-28T13:30:00.000Z', ultimo_erro: 'Credenciais do inversor expiraram', status_inversor: 'ok', acompanhamento: 'api',
      created_at: '2026-09-03T12:00:00.000Z',
    }],
    geracao_diaria: [{ company_id: companyId, sistema_id: `${companyId}-S1`, data: '2026-09-27', geracao_kwh: 30 }],
    telemetria_medicoes: [],
    leads,
    lead_tarefas: [{ id: `${companyId}-T1`, company_id: companyId, lead_id: `${companyId}-L0`, status: 'pendente', due_at: '2026-09-25T12:00:00.000Z' }],
    propostas_publicas: [{
      id: `${companyId}-P1`, company_id: companyId, lead_id: `${companyId}-L0`, created_at: '2026-09-10T12:00:00.000Z', sent_to_client_at: null,
      ultimo_acesso_at: null, cliente_respondeu_at: null, revoked: false, expires_at: '2026-11-30T00:00:00.000Z', dados_input: { investimento: { total: 25000 } },
    }],
    demonstrativos_gd: [{ company_id: companyId, instalacao: `${companyId.slice(0, 4)}77`, cliente_nome: p.gdCliente, referencia: '2026-08-01', proximo_expirar_kwh: 900, ciclo_expirar: '2026-11-01' }],
    manutencoes: [{ id: `${companyId}-M1`, company_id: companyId, status: 'agendada', data_agendada: '2026-09-01' }],
    financeiro_recebimentos: [{ id: `${companyId}-R1`, company_id: companyId, competencia: '2026-09', valor: 1000 }],
    financeiro_contas_a_pagar: [{
      id: `${companyId}-C1`, company_id: companyId, descricao: p.conta, valor: 480, vencimento: '2026-09-25', mundo: 'PJ', status: 'aberta', categoria_slug: null,
    }],
    empresa_modulos: ['eva', 'monitoramento', 'financeiro', 'marketing'].map((modulo) => ({ company_id: companyId, modulo, ativo: true })),
  };
}

function juntar(...bases: Array<Record<string, Linha[]>>): Record<string, Linha[]> {
  const out: Record<string, Linha[]> = {};
  for (const b of bases) for (const [t, ls] of Object.entries(b)) out[t] = [...(out[t] ?? []), ...ls];
  return out;
}

const ECOSUN_DADOS = empresa(ECOSUN, { usina: 'Chácara do Junior', cidade: 'Gama', uf: 'DF', conta: 'Aluguel do galpão EcoSun', gdCliente: 'Maria do Socorro', leads: 5 });
const CONQUISTA_DADOS = empresa(CONQUISTA, { usina: 'Fazenda Boa Esperança', cidade: 'Vitória da Conquista', uf: 'BA', conta: 'Energia da loja Conquista', gdCliente: 'Posto Serra Azul', leads: 2 });
const SEGREDOS_ECOSUN = ['Chácara do Junior', 'Gama', 'Aluguel do galpão EcoSun', 'Maria do Socorro', 'EcoSunPower', 'Eva'];
const DA_CONQUISTA = ['Fazenda Boa Esperança', 'Vitória da Conquista', 'Energia da loja Conquista', 'Posto Serra Azul'];

const jimena: DashUser = {
  id: 'j', companyId: CONQUISTA, nome: 'Jimena', login: 'jimena', isAdmin: true, roleNome: 'Administradora', permissoes: {}, companyNome: 'Conquista Solar',
};
const junior: DashUser = { id: 'u', companyId: ECOSUN, nome: 'Junior', login: 'j', isAdmin: true, roleNome: 'Administrador', permissoes: {} };

function resFalso() {
  const res = { redirect: vi.fn(), type: vi.fn(), send: vi.fn() };
  res.type.mockReturnValue(res);
  return res;
}
async function html(rota: 'cc' | 'atencao', user: DashUser, banco: Record<string, Linha[]>): Promise<string> {
  const { client } = bancoFalso(banco);
  const res = resFalso();
  const req = { dashUser: user, query: {} } as unknown as Request;
  await (rota === 'cc' ? rotaCommandCenter(client, () => AGORA) : rotaCentralAtencao(client, () => AGORA))(req, res as unknown as Response);
  expect(res.redirect).not.toHaveBeenCalled();
  return res.send.mock.calls[0][0] as string;
}

beforeEach(() => {
  delete process.env.RLS_TENANT_ROTAS;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('isolamento: a tela do tenant só tem o que é dele', () => {
  const banco = juntar(ECOSUN_DADOS, CONQUISTA_DADOS);

  for (const rota of ['cc', 'atencao'] as const) {
    it(`${rota === 'cc' ? '/command-center' : '/atencao'}: nomes da Conquista aparecem, nenhum da EcoSun`, async () => {
      const h = await html(rota, jimena, banco);
      for (const nome of DA_CONQUISTA.filter((n) => rota === 'cc' || n !== 'Vitória da Conquista')) expect(h, nome).toContain(nome);
      for (const segredo of SEGREDOS_ECOSUN) expect(h, segredo).not.toContain(segredo);
    });
  }

  it('contagens são só da empresa da sessão (2 leads, não 7)', async () => {
    const h = await html('cc', jimena, banco);
    const i = h.indexOf('<div class="cc-lbl">Leads do mês</div>');
    expect(h.slice(i, h.indexOf('</a>', i))).toContain('<div class="cc-val">2</div>');
  });

  it('e o contrário: a EcoSun não vê nada da Conquista', async () => {
    for (const rota of ['cc', 'atencao'] as const) {
      const h = await html(rota, junior, banco);
      for (const nome of DA_CONQUISTA) expect(h, nome).not.toContain(nome);
      expect(h).toContain('Chácara do Junior');
    }
  });
});

describe('módulos: tenant sem nada contratado', () => {
  it('ZERO leitura de dado de negócio; blocos trancados com link pra conhecer e sem número', async () => {
    const semModulo = juntar(ECOSUN_DADOS, { ...CONQUISTA_DADOS, empresa_modulos: [] });
    const { client, lidas } = bancoFalso(semModulo);
    const res = resFalso();
    await rotaCommandCenter(client, () => AGORA)({ dashUser: jimena, query: {} } as unknown as Request, res as unknown as Response);
    const proibidas = ['sistemas_clientes', 'geracao_diaria', 'telemetria_medicoes', 'demonstrativos_gd', 'manutencoes',
      'financeiro_recebimentos', 'financeiro_contas_a_pagar', 'propostas_publicas', 'leads', 'lead_tarefas'];
    for (const t of proibidas) expect(lidas, t).not.toContain(t);
    expect(lidas).toEqual(['empresa_modulos']);

    const h = res.send.mock.calls[0][0] as string;
    const blocos = [...h.matchAll(/data-trancado="([a-z_]+)">[\s\S]*?Quero liberar \/ falar com o suporte<\/a>/g)];
    expect(new Set(blocos.map((b) => b[1]))).toEqual(new Set(['monitoramento', 'financeiro', 'leads', 'marketing', 'usinas_kanban', 'manutencao']));
    for (const b of blocos) {
      expect(b[0]).toContain(`href="/dashboard/conhecer/${b[1]}"`);
      const texto = b[0].slice(b[0].indexOf('>') + 1).replace(/<[^>]+>/g, ' ');
      expect(texto, b[1]).not.toMatch(/\d|—|sem acesso/);
    }
    // faixa de KPIs sem número nenhum
    const faixa = h.slice(h.indexOf('cc-kstrip-cc'), h.indexOf('</section>', h.indexOf('cc-kstrip-cc')));
    expect(faixa).not.toMatch(/cc-val/);
  });
});
