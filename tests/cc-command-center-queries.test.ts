// Leituras do Command Center (fase B): TODA consulta escopada pela empresa da
// sessão (dupla tranca com o RLS), fonte que falha vira null/"não carregou"
// (nunca 0) e área sem permissão nem é consultada.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { carregarCommandCenter, lerModulosContratados, TODAS_PERMISSOES } from '../src/modules/dashboard/command-center-queries.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const AGORA = new Date('2026-09-27T14:42:00Z'); // 11:42 em Brasília

type Filtro = [string, string, unknown];
interface Chamada { tabela: string; filtros: Filtro[]; head: boolean; ranges: Array<[number, number]> }
type Resposta = { data?: unknown[]; count?: number | null; error?: { message: string } | null } | Error;

/** Supabase falso: devolve `respostas[tabela]` e guarda os filtros de cada consulta. */
function fakeDb(respostas: Record<string, Resposta>) {
  const chamadas: Chamada[] = [];
  const client = {
    from(tabela: string) {
      const reg: Chamada = { tabela, filtros: [], head: false, ranges: [] };
      chamadas.push(reg);
      let de: number | null = null;
      let ate: number | null = null;
      const q: Record<string, unknown> = {};
      const f = (op: string) => (c: string, v?: unknown, w?: unknown) => { reg.filtros.push([op, c, w === undefined ? v : [v, w]]); return q; };
      q.select = (_c?: string, o?: { head?: boolean }) => { if (o?.head) reg.head = true; return q; };
      for (const op of ['eq', 'gte', 'lt', 'lte', 'in', 'is', 'not']) q[op] = f(op);
      q.order = () => q;
      q.limit = () => q;
      q.range = (a: number, b: number) => { de = a; ate = b; reg.ranges.push([a, b]); return q; };
      q.then = (ok: (r: unknown) => unknown, falha?: (e: unknown) => unknown) => {
        const r = respostas[tabela];
        if (r instanceof Error) return Promise.reject(r).then(ok, falha);
        const dados = r?.data ?? [];
        const pagina = de !== null && ate !== null ? dados.slice(de, ate + 1) : dados;
        const res = {
          data: reg.head ? null : pagina,
          count: r?.count !== undefined ? r.count : dados.length,
          error: r?.error ?? null,
        };
        return Promise.resolve(res).then(ok, falha);
      };
      return q;
    },
  };
  return { client: client as unknown as SupabaseClient, chamadas };
}

const usina = (id: string, extra: Record<string, unknown> = {}) => ({
  id, apelido: `Usina ${id}`, potencia_kwp: 10, cidade: 'Gama', uf: 'DF', ativo: true,
  ultima_sincronizacao: '2026-09-27T14:30:00Z', ultimo_erro: null, status_inversor: 'ok', acompanhamento: 'api', ...extra,
});

const DADOS: Record<string, Resposta> = {
  sistemas_clientes: { data: [usina('a'), usina('b', { ultimo_erro: 'token' })] },
  geracao_diaria: { data: [{ sistema_id: 'a', data: '2026-09-27', geracao_kwh: 12.5 }, { sistema_id: 'a', data: '2026-09-26', geracao_kwh: 40 }] },
  telemetria_medicoes: { data: [{ sistema_id: 'a', device_key: 'i', valor: 3.5, ts: '2026-09-27T14:35:00Z' }] },
  leads: { data: [{ id: 'L1', status: 'ganho', updated_at: '2026-09-20T10:00:00Z' }], count: 4 },
  propostas_publicas: {
    data: [
      { id: 'p1', lead_id: 'L2', created_at: '2026-09-10T12:00:00Z', sent_to_client_at: null, ultimo_acesso_at: null, cliente_respondeu_at: null, revoked: false, expires_at: '2026-11-09T12:00:00Z', dados_input: { investimento: { total: 30000 } } },
      { id: 'p2', lead_id: 'L1', created_at: '2026-09-10T12:00:00Z', sent_to_client_at: null, ultimo_acesso_at: null, cliente_respondeu_at: null, revoked: false, expires_at: '2026-11-09T12:00:00Z', dados_input: null },
    ],
    count: 2,
  },
  lead_tarefas: { data: [{ id: 't1', lead_id: 'L2', due_at: '2026-09-25T12:00:00Z' }] },
  demonstrativos_gd: {
    data: [
      { instalacao: '937758', cliente_nome: 'Socorro', referencia: '2026-08-01', proximo_expirar_kwh: 410, ciclo_expirar: '2026-11-01' },
      { instalacao: '937758', cliente_nome: 'Socorro', referencia: '2026-07-01', proximo_expirar_kwh: 999, ciclo_expirar: '2026-10-01' },
    ],
  },
  manutencoes: { data: [{ id: 'm1', data_agendada: '2026-09-01' }, { id: 'm2', data_agendada: '2026-10-10' }] },
  financeiro_recebimentos: { data: [{ valor: 1000 }, { valor: '2500.50' }] },
  financeiro_contas_a_pagar: { data: [{ id: 'c1', descricao: 'DAS', valor: 2418, vencimento: '2026-09-30', mundo: 'PJ', categoria_slug: 'imposto_das' }] },
};

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('carregarCommandCenter — escopo por empresa', () => {
  it('TODA consulta filtra o company_id da sessão', async () => {
    const TENANT = 'aaaa1111-2222-3333-4444-555566667777';
    const { client, chamadas } = fakeDb(DADOS);
    await carregarCommandCenter(client, TENANT, AGORA, TODAS_PERMISSOES);
    expect(chamadas.length).toBeGreaterThan(10);
    for (const c of chamadas) expect(c.filtros, c.tabela).toContainEqual(['eq', 'company_id', TENANT]);
  });

  it('área sem permissão não é consultada e aparece como "sem acesso"', async () => {
    const { client, chamadas } = fakeDb(DADOS);
    const r = await carregarCommandCenter(client, ECOSUN, AGORA, { ...TODAS_PERMISSOES, financeiro: false, usinas: false });
    const tabelas = chamadas.map((c) => c.tabela);
    for (const t of ['financeiro_recebimentos', 'financeiro_contas_a_pagar', 'geracao_diaria', 'telemetria_medicoes', 'demonstrativos_gd', 'manutencoes']) {
      expect(tabelas, t).not.toContain(t);
    }
    // Só a contagem do mês (usinas novas) toca sistemas_clientes — sem linha, e o número some.
    expect(chamadas.filter((c) => c.tabela === 'sistemas_clientes').every((c) => c.head)).toBe(true);
    expect(r.kpisMes.usinasNovas).toBeNull();
    expect(r.recebidoMes).toBeNull();
    expect(r.frota).toBeNull();
    expect(r.fontes.find((f) => f.id === 'contas')?.estado).toBe('sem_acesso');
    expect(r.fontes.find((f) => f.id === 'usinas')?.estado).toBe('sem_acesso');
    expect(r.eventos.some((e) => e.area === 'financeiro' || e.area === 'usinas')).toBe(false);
  });
});

describe('carregarCommandCenter — números e avisos', () => {
  it('frota, energia (dia de Brasília), geração agora e faturamento recebido', async () => {
    const { client, chamadas } = fakeDb(DADOS);
    const r = await carregarCommandCenter(client, ECOSUN, AGORA, TODAS_PERMISSOES);
    expect(r.frota?.total).toBe(2);
    expect(r.frota?.energiaHojeKwh).toBe(12.5);
    expect(r.frota?.geracaoAgora).toEqual({ kw: 3.5, usinas: 1 });
    expect(r.frota?.porEstado.sem_comunicacao).toBe(1);
    expect(r.recebidoMes).toBe(3500.5);
    // janela da geração: desde o menor entre o 1º do mês e 30 dias atrás (Brasília)
    const g = chamadas.find((c) => c.tabela === 'geracao_diaria')!;
    expect(g.filtros).toContainEqual(['gte', 'data', '2026-08-28']);
    expect(g.filtros).toContainEqual(['lte', 'data', '2026-09-27']);
    // competência do faturamento pelo mês de Brasília
    expect(chamadas.find((c) => c.tabela === 'financeiro_recebimentos')!.filtros).toContainEqual(['eq', 'competencia', '2026-09']);
  });

  it('avisos de todas as fontes; proposta de lead já ganho não conta como parada', async () => {
    const { client } = fakeDb(DADOS);
    const r = await carregarCommandCenter(client, ECOSUN, AGORA, TODAS_PERMISSOES);
    const ids = r.eventos.map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining([
      'usinas:sem-comunicacao', 'leads:esperando-24h', 'leads:sla-vencido', 'propostas:paradas-72h',
      'gd:937758', 'manutencao:vencidas', 'conta:c1',
    ]));
    const prop = r.eventos.find((e) => e.id === 'propostas:paradas-72h')!;
    expect(prop.titulo).toMatch(/^1 proposta parada/);
    expect(prop.impactoTexto?.replace(/ /g, ' ')).toBe('R$ 30.000 em jogo');
    // GD: vale o demonstrativo MAIS RECENTE da UC (ago: 410 kWh em nov), não o antigo
    expect(r.eventos.find((e) => e.id === 'gd:937758')!.titulo).toContain('410 kWh');
    expect(r.manutencao).toEqual({ vencidas: 1, proximas30: 1 });
    expect(r.fontes.every((f) => f.estado === 'ok')).toBe(true);
  });

  it('proposta refeita pro mesmo lead: só a mais recente conta (o R$ em jogo não dobra)', async () => {
    const base = { sent_to_client_at: null, ultimo_acesso_at: null, cliente_respondeu_at: null, revoked: false, expires_at: '2026-11-09T12:00:00Z' };
    const { client } = fakeDb({ ...DADOS, propostas_publicas: { data: [
      { ...base, id: 'v2', lead_id: 'L2', created_at: '2026-09-15T12:00:00Z', dados_input: { investimento: { total: 28000 } } },
      { ...base, id: 'v1', lead_id: 'L2', created_at: '2026-09-10T12:00:00Z', dados_input: { investimento: { total: 30000 } } },
      { ...base, id: 'sem-lead', lead_id: null, created_at: '2026-09-11T12:00:00Z', dados_input: { investimento: { total: 5000 } } },
    ] } });
    const r = await carregarCommandCenter(client, ECOSUN, AGORA, TODAS_PERMISSOES);
    const prop = r.eventos.find((e) => e.id === 'propostas:paradas-72h')!;
    expect(prop.titulo).toMatch(/^2 propostas paradas/);
    expect(prop.impactoTexto?.replace(/ /g, ' ')).toBe('R$ 33.000 em jogo');
  });

  it('tarefa de SLA de lead já encerrado não conta', async () => {
    const { client } = fakeDb({ ...DADOS, lead_tarefas: { data: [{ id: 't1', lead_id: 'L1', due_at: '2026-09-25T12:00:00Z' }] } });
    const r = await carregarCommandCenter(client, ECOSUN, AGORA, TODAS_PERMISSOES);
    expect(r.eventos.find((e) => e.id === 'leads:sla-vencido')).toBeUndefined();
  });

  it('mudanças das últimas 24 h vêm contadas (desde ontem neste horário)', async () => {
    const { client, chamadas } = fakeDb(DADOS);
    const r = await carregarCommandCenter(client, ECOSUN, AGORA, TODAS_PERMISSOES);
    expect(r.mudancas24h).toEqual({ leads: 4, propostas: 2, vendas: 4 });
    const desde = '2026-09-26T14:42:00.000Z';
    expect(chamadas.some((c) => c.tabela === 'leads' && c.head && c.filtros.some((f) => f[0] === 'gte' && f[1] === 'created_at' && f[2] === desde))).toBe(true);
  });
});

describe('carregarCommandCenter — falhas', () => {
  it('erro numa fonte: só ela vira "não carregou"; o resto segue', async () => {
    const { client } = fakeDb({ ...DADOS, geracao_diaria: { error: { message: 'timeout' } } });
    const r = await carregarCommandCenter(client, ECOSUN, AGORA, TODAS_PERMISSOES);
    expect(r.frota).toBeNull(); // geração parcial nunca vira número
    expect(r.fontes.find((f) => f.id === 'usinas')?.estado).toBe('falhou');
    expect(r.recebidoMes).toBe(3500.5);
    expect(r.eventos.some((e) => e.id === 'conta:c1')).toBe(true);
  });

  it('paginação: lê todas as páginas (mais de 1000 linhas) e nunca soma página parcial com erro', async () => {
    const muitas = Array.from({ length: 1500 }, (_, i) => ({ sistema_id: 'a', data: '2026-09-27', geracao_kwh: i < 1000 ? 1 : 0 }));
    const { client, chamadas } = fakeDb({ ...DADOS, geracao_diaria: { data: muitas } });
    const r = await carregarCommandCenter(client, ECOSUN, AGORA, TODAS_PERMISSOES);
    expect(chamadas.filter((c) => c.tabela === 'geracao_diaria' && !c.head)).toHaveLength(2);
    expect(r.frota?.energiaHojeKwh).toBe(1000);
  });

  it('cliente quebrado: nada de número, nenhum aviso e todas as fontes "não carregou"', async () => {
    const client = { from() { throw new Error('caiu'); } } as unknown as SupabaseClient;
    const r = await carregarCommandCenter(client, ECOSUN, AGORA, TODAS_PERMISSOES);
    expect(r.frota).toBeNull();
    expect(r.kpisMes).toEqual({ leads: null, propostas: null, vendas: null, usinasNovas: null });
    expect(r.recebidoMes).toBeNull();
    expect(r.mudancas24h).toEqual({ leads: null, propostas: null, vendas: null });
    expect(r.eventos).toEqual([]);
    expect(r.fontes.every((f) => f.estado === 'falhou')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Revisão 3 + abertura pro tenant
// ---------------------------------------------------------------------------

/** Igual ao fakeDb, mas cada resposta demora um tique e mede quantas páginas da geração estão no ar juntas. */
function fakeDbLento(respostas: Record<string, Resposta>) {
  const base = fakeDb(respostas);
  let noAr = 0;
  const pico = { max: 0 };
  const client = {
    from(tabela: string) {
      const q = (base.client as unknown as { from: (t: string) => Record<string, unknown> }).from(tabela);
      const thenOriginal = q.then as (ok: (r: unknown) => unknown, falha?: (e: unknown) => unknown) => Promise<unknown>;
      q.then = (ok: (r: unknown) => unknown, falha?: (e: unknown) => unknown) => {
        const conta = tabela === 'geracao_diaria';
        if (conta) { noAr++; pico.max = Math.max(pico.max, noAr); }
        return new Promise((r) => setTimeout(r, 1)).then(() => { if (conta) noAr--; return thenOriginal(ok, falha); });
      };
      return q;
    },
  };
  return { client: client as unknown as SupabaseClient, chamadas: base.chamadas, pico };
}

describe('I1 — contas PF só pro admin', () => {
  it('por padrão a consulta de contas leva mundo = PJ', async () => {
    const { client, chamadas } = fakeDb(DADOS);
    await carregarCommandCenter(client, ECOSUN, AGORA, TODAS_PERMISSOES);
    expect(chamadas.find((c) => c.tabela === 'financeiro_contas_a_pagar')!.filtros).toContainEqual(['eq', 'mundo', 'PJ']);
  });
  it('admin (verContasPF) lê PJ e PF', async () => {
    const { client, chamadas } = fakeDb(DADOS);
    await carregarCommandCenter(client, ECOSUN, AGORA, TODAS_PERMISSOES, { verContasPF: true });
    const f = chamadas.find((c) => c.tabela === 'financeiro_contas_a_pagar')!.filtros;
    expect(f.some((x) => x[1] === 'mundo')).toBe(false);
  });
  it('o botão da conta leva a uma tela que existe, com rótulo honesto', async () => {
    const { client } = fakeDb(DADOS);
    const r = await carregarCommandCenter(client, ECOSUN, AGORA, TODAS_PERMISSOES);
    const conta = r.eventos.find((e) => e.id === 'conta:c1')!;
    expect(conta.acao).toEqual({ rotulo: 'Ver financeiro', href: '/dashboard/financeiro' });
  });
});

describe('I2 — proposta refeita que o cliente respondeu', () => {
  const base = { sent_to_client_at: null, ultimo_acesso_at: null, revoked: false, expires_at: '2026-11-09T12:00:00Z', dados_input: { investimento: { total: 30000 } } };
  it('A (antiga, sem resposta) + B (nova, respondida) do mesmo lead → nenhum aviso', async () => {
    const { client, chamadas } = fakeDb({ ...DADOS, propostas_publicas: { data: [
      { ...base, id: 'B', lead_id: 'L2', created_at: '2026-09-15T12:00:00Z', cliente_respondeu_at: '2026-09-16T12:00:00Z' },
      { ...base, id: 'A', lead_id: 'L2', created_at: '2026-09-10T12:00:00Z', cliente_respondeu_at: null },
    ] } });
    const r = await carregarCommandCenter(client, ECOSUN, AGORA, TODAS_PERMISSOES);
    expect(r.eventos.find((e) => e.id === 'propostas:paradas-72h')).toBeUndefined();
    const f = chamadas.find((c) => c.tabela === 'propostas_publicas' && !c.head)!.filtros;
    expect(f.some((x) => x[1] === 'revoked' || x[1] === 'cliente_respondeu_at')).toBe(false);
  });
});

describe('I3 — escala da geração (sem migration)', () => {
  it('45 mil linhas: conta antes, lê em lotes paralelos (no máximo 5 no ar) e soma tudo', async () => {
    const linhas = Array.from({ length: 45_000 }, (_, i) => ({ sistema_id: 'a', data: '2026-09-27', geracao_kwh: i % 2 }));
    const { client, chamadas, pico } = fakeDbLento({ ...DADOS, geracao_diaria: { data: linhas } });
    const r = await carregarCommandCenter(client, ECOSUN, AGORA, TODAS_PERMISSOES);
    const g = chamadas.filter((c) => c.tabela === 'geracao_diaria');
    expect(g.filter((c) => c.head)).toHaveLength(1);
    expect(g.filter((c) => !c.head)).toHaveLength(45);
    expect(r.frota?.energiaHojeKwh).toBe(22_500);
    expect(pico.max).toBeGreaterThan(1);
    expect(pico.max).toBeLessThanOrEqual(5);
  });
  it('acima do teto (200 mil linhas): não soma nada e a fonte vira "não carregou"', async () => {
    const { client, chamadas } = fakeDb({ ...DADOS, geracao_diaria: { data: [], count: 200_001 } });
    const r = await carregarCommandCenter(client, ECOSUN, AGORA, TODAS_PERMISSOES);
    expect(r.frota).toBeNull();
    expect(r.fontes.find((f) => f.id === 'usinas')?.estado).toBe('falhou');
    expect(chamadas.filter((c) => c.tabela === 'geracao_diaria' && !c.head)).toHaveLength(0);
  });
});

describe('I4 — telemetria pelo índice (sistema_id)', () => {
  it('filtra pelas usinas ativas, em lotes de até 150 ids', async () => {
    const muitas = Array.from({ length: 400 }, (_, i) => usina(`s${i}`));
    const { client, chamadas } = fakeDb({ ...DADOS, sistemas_clientes: { data: muitas } });
    await carregarCommandCenter(client, ECOSUN, AGORA, TODAS_PERMISSOES);
    const t = chamadas.filter((c) => c.tabela === 'telemetria_medicoes');
    expect(t).toHaveLength(3);
    const ids = t.flatMap((c) => (c.filtros.find((f) => f[0] === 'in' && f[1] === 'sistema_id')![2] as string[]));
    expect(ids).toHaveLength(400);
    expect(new Set(ids).size).toBe(400);
    for (const c of t) expect((c.filtros.find((f) => f[0] === 'in')![2] as string[]).length).toBeLessThanOrEqual(150);
  });
  it('lote que bate o limite de 5000 linhas fica marcado (Geração agora pode estar incompleta)', async () => {
    const cheio = Array.from({ length: 5000 }, (_, i) => ({ sistema_id: 'a', device_key: `d${i}`, valor: 0.001, ts: '2026-09-27T14:35:00Z' }));
    const { client } = fakeDb({ ...DADOS, telemetria_medicoes: { data: cheio } });
    const r = await carregarCommandCenter(client, ECOSUN, AGORA, TODAS_PERMISSOES);
    expect(r.telemetriaCortada).toBe(true);
    const { client: c2 } = fakeDb(DADOS);
    expect((await carregarCommandCenter(c2, ECOSUN, AGORA, TODAS_PERMISSOES)).telemetriaCortada).toBe(false);
  });
  it('sem usina ativa, nem consulta a telemetria', async () => {
    const { client, chamadas } = fakeDb({ ...DADOS, sistemas_clientes: { data: [] } });
    await carregarCommandCenter(client, ECOSUN, AGORA, TODAS_PERMISSOES);
    expect(chamadas.some((c) => c.tabela === 'telemetria_medicoes')).toBe(false);
  });
});

describe('M4 — tarefas de SLA sem teto de 1000', () => {
  it('conta exata antes e lê todas as páginas', async () => {
    const tarefas = Array.from({ length: 1500 }, (_, i) => ({ id: `t${i}`, lead_id: 'L2', due_at: '2026-09-25T12:00:00Z' }));
    const { client, chamadas } = fakeDb({ ...DADOS, lead_tarefas: { data: tarefas } });
    const r = await carregarCommandCenter(client, ECOSUN, AGORA, TODAS_PERMISSOES);
    expect(chamadas.filter((c) => c.tabela === 'lead_tarefas' && c.head)).toHaveLength(1);
    expect(r.eventos.find((e) => e.id === 'leads:sla-vencido')!.titulo).toMatch(/^1500 tarefas/);
  });
});

describe('T3 — módulo contratado + permissão', () => {
  const NADA = { usinas: false, leads: false, propostas: false, financeiro: false, marketing: false };
  it('nenhum módulo contratado: ZERO leitura de dado de negócio; fontes "não contratado"', async () => {
    const { client, chamadas } = fakeDb(DADOS);
    const r = await carregarCommandCenter(client, ECOSUN, AGORA, TODAS_PERMISSOES, { contratados: NADA });
    const proibidas = ['sistemas_clientes', 'geracao_diaria', 'telemetria_medicoes', 'demonstrativos_gd', 'manutencoes',
      'financeiro_recebimentos', 'financeiro_contas_a_pagar', 'propostas_publicas', 'leads', 'lead_tarefas'];
    for (const t of proibidas) expect(chamadas.map((c) => c.tabela), t).not.toContain(t);
    expect(r.fontes.every((f) => f.estado === 'nao_contratado')).toBe(true);
    expect(r.eventos).toEqual([]);
    expect(r.contratados).toEqual(NADA);
  });
  it('contratou, mas o papel não deixa → "sem acesso" (não "não contratado")', async () => {
    const { client } = fakeDb(DADOS);
    const r = await carregarCommandCenter(client, ECOSUN, AGORA, { ...TODAS_PERMISSOES, financeiro: false });
    expect(r.fontes.find((f) => f.id === 'contas')?.estado).toBe('sem_acesso');
  });
  it('status dos leads só é consultado quando leads é permitido', async () => {
    const { client, chamadas } = fakeDb(DADOS);
    await carregarCommandCenter(client, ECOSUN, AGORA, { ...TODAS_PERMISSOES, leads: false, marketing: false });
    expect(chamadas.some((c) => c.tabela === 'leads')).toBe(false);
  });
  it('só marketing (sem leads): conta os leads do mês pro cartão de Marketing, sem ler a lista', async () => {
    const { client, chamadas } = fakeDb(DADOS);
    const r = await carregarCommandCenter(client, ECOSUN, AGORA, { ...NADA, marketing: true });
    expect(chamadas.filter((c) => c.tabela === 'leads').every((c) => c.head)).toBe(true);
    expect(r.kpisMes.leads).toBe(4);
    expect(r.kpisMes.vendas).toBeNull();
  });
});

describe('lerModulosContratados', () => {
  it('lê empresa_modulos da empresa (ativo) e mapeia bloco → módulo', async () => {
    const { client, chamadas } = fakeDb({ empresa_modulos: { data: [{ modulo: 'eva' }, { modulo: 'email' }] } });
    expect(await lerModulosContratados(client, 'emp-x')).toEqual({ usinas: false, leads: true, propostas: true, financeiro: false, marketing: false });
    expect(chamadas[0].filtros).toContainEqual(['eq', 'company_id', 'emp-x']);
    expect(chamadas[0].filtros).toContainEqual(['eq', 'ativo', true]);
  });
  it('erro ou exceção → tudo desligado (fail-closed)', async () => {
    const { client } = fakeDb({ empresa_modulos: { error: { message: 'relation does not exist' } } });
    const nada = { usinas: false, leads: false, propostas: false, financeiro: false, marketing: false };
    expect(await lerModulosContratados(client, 'x')).toEqual(nada);
    const quebrado = { from() { throw new Error('caiu'); } } as unknown as SupabaseClient;
    expect(await lerModulosContratados(quebrado, 'x')).toEqual(nada);
  });
});
