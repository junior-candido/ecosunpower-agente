// O cron roda com service role: o isolamento por empresa é disciplina do repo.
// Toda consulta/escrita sobre dado do medidor leva o company_id DELE.
import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { criarEnergiaRepo } from '../src/modules/energia/energia-repo.js';
import type { MedidorRow } from '../src/modules/energia/energia-service.js';

const M: MedidorRow = {
  id: 'm1', company_id: 'empresa-X', lead_id: null, sistema_id: 's1', apelido: 'A', device_id: 'd', modo_coleta: 'push',
  perfil: 'triphase', canais: { rede: 2 }, tensao_nominal_v: 220, api_credentials_cifrado: null, ativo: true, status: 'ok',
  status_desde: null, ultima_leitura_em: null, ultimo_erro: null,
  nuvem_ok: null, nuvem_desde: null, nuvem_avisado_em: null, aviso_dia: null, avisos_no_dia: 0,
};

function clienteFalso(respostaLinhas: unknown[] = []) {
  const chamadas: Array<{ tabela: string; op: string; filtros: Array<[string, unknown]>; payload?: unknown }> = [];
  const from = vi.fn((tabela: string) => {
    const reg = { tabela, op: 'select', filtros: [] as Array<[string, unknown]>, payload: undefined as unknown };
    chamadas.push(reg);
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.upsert = (p: unknown) => { reg.op = 'upsert'; reg.payload = p; return q; };
    q.update = (p: unknown) => { reg.op = 'update'; reg.payload = p; return q; };
    q.delete = () => { reg.op = 'delete'; return q; };
    for (const f of ['eq', 'neq', 'gte', 'lt']) q[f] = (c: string, v: unknown) => { reg.filtros.push([c, v]); return q; };
    q.order = () => q; q.limit = () => q; q.range = () => q;
    q.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: respostaLinhas, error: null, count: 0 }).then(ok);
    return q;
  });
  return { client: { from } as unknown as SupabaseClient, chamadas };
}

describe('energia-repo: company_id do medidor em toda operação', () => {
  it('leituras, escritas e apagamentos', async () => {
    const { client, chamadas } = clienteFalso();
    const repo = criarEnergiaRepo(client);
    await repo.brutoEntre(M, '2026-09-08T00:00:00Z', '2026-09-09T00:00:00Z');
    await repo.primeiraLeitura(M);
    await repo.proximaLeitura(M, '2026-09-08T00:00:00Z');
    await repo.ultimaJanela(M);
    await repo.janelasDoDia(M, '2026-09-08');
    await repo.geracaoDoDia(M, '2026-09-08');
    await repo.atualizarStatus(M, { status: 'mudo' });
    await repo.apagarBrutoAntesDe(M, '2026-06-01T00:00:00Z');
    await repo.apagar15minAntesDe(M, '2024-08-01T00:00:00Z');
    await repo.gravarLeituraSintetica(M, { tensao: 1, corrente: 1, potenciaW: 1, potenciaVa: 1, fatorPotencia: 1, energiaWh: 1, energiaDevolvidaWh: 1 }, '2026-09-08T12:00:00Z');
    const semUpsert = chamadas.filter((c) => c.op !== 'upsert');
    expect(semUpsert.length).toBeGreaterThan(9);
    for (const c of semUpsert) expect(c.filtros, `${c.tabela}/${c.op}`).toContainEqual(['company_id', 'empresa-X']);
  });

  it('upserts carimbam o company_id do medidor', async () => {
    const { client, chamadas } = clienteFalso();
    const repo = criarEnergiaRepo(client);
    await repo.gravarJanelas(M, [{ inicio: '2026-09-08T03:00:00.000Z', importadoWh: 1, exportadoWh: 0, potenciaMaxW: 1, tensaoMinV: null, tensaoMaxV: null, tensaoMedV: null, fpMedio: null, minTensaoPrecaria: 0, minTensaoCritica: 0, minAcima242: 0, segundosCobertos: 900 }], 'push');
    await repo.gravarDia(M, { dia: '2026-09-08', importadoKwh: 1, exportadoKwh: 0, impPontaKwh: 0, impIntermediarioKwh: 0, impForaPontaKwh: 1, demandaMaxW: null, demandaMaxInicio: null, baseNoturnaW: null, tensaoMinV: null, tensaoMaxV: null, minPrecaria: 0, minCritica: 0, coberturaPct: 50, geracaoKwh: null, consumoKwh: null });
    const ups = chamadas.filter((c) => c.op === 'upsert');
    expect(ups).toHaveLength(2);
    expect((ups[0].payload as Array<{ company_id: string }>)[0].company_id).toBe('empresa-X');
    expect((ups[1].payload as { company_id: string }).company_id).toBe('empresa-X');
  });

  it('bruto e 15 min filtram o CANAL da rede do medidor (não mistura as fases)', async () => {
    const { client, chamadas } = clienteFalso();
    const repo = criarEnergiaRepo(client);
    const m0: MedidorRow = { ...M, canais: { rede: 0 } };
    await repo.brutoEntre(m0, '2026-09-08T00:00:00Z', '2026-09-09T00:00:00Z');
    await repo.primeiraLeitura(m0);
    await repo.proximaLeitura(m0, '2026-09-08T00:00:00Z');
    await repo.ultimaJanela(m0);
    await repo.janelasDoDia(m0, '2026-09-08');
    expect(chamadas).toHaveLength(5);
    for (const c of chamadas) expect(c.filtros, c.tabela).toContainEqual(['canal', 0]);
    chamadas.length = 0;
    await repo.brutoEntre({ ...M, canais: null }, '2026-09-08T00:00:00Z', '2026-09-09T00:00:00Z');
    expect(chamadas[0].filtros).toContainEqual(['canal', 2]); // padrão: fase C
  });

  it('leitura sintética com hora no futuro é gravada com o agora (não empurra ultima_leitura_em)', async () => {
    const { client, chamadas } = clienteFalso();
    const repo = criarEnergiaRepo(client);
    const futuro = new Date(Date.now() + 3_600_000).toISOString();
    await repo.gravarLeituraSintetica(M, { tensao: 1, corrente: 1, potenciaW: 1, potenciaVa: 1, fatorPotencia: 1, energiaWh: 1, energiaDevolvidaWh: 1 }, futuro);
    const up = chamadas.find((c) => c.op === 'upsert')!.payload as { medido_em: string };
    const upd = chamadas.find((c) => c.op === 'update')!.payload as { ultima_leitura_em: string };
    expect(Date.parse(up.medido_em)).toBeLessThanOrEqual(Date.now());
    expect(Date.parse(upd.ultima_leitura_em)).toBeLessThanOrEqual(Date.now());
  });

  it('medidor desligado (ativo=false) fica fora dos crons', async () => {
    const { client, chamadas } = clienteFalso();
    await criarEnergiaRepo(client).medidoresAtivos();
    expect(chamadas[0].filtros).toContainEqual(['ativo', true]);
  });
});

/** Cliente falso que responde por tabela e guarda o tipo de cada filtro. */
function clientePorTabela(resp: Record<string, unknown[]> = {}) {
  const chamadas: Array<{ tabela: string; op: string; filtros: Array<[string, string, unknown]>; payload?: unknown; limite?: number }> = [];
  const from = vi.fn((tabela: string) => {
    const reg = { tabela, op: 'select', filtros: [] as Array<[string, string, unknown]>, payload: undefined as unknown, limite: undefined as number | undefined };
    chamadas.push(reg);
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.update = (p: unknown) => { reg.op = 'update'; reg.payload = p; return q; };
    q.delete = () => { reg.op = 'delete'; return q; };
    for (const f of ['eq', 'neq', 'gte', 'lt', 'in', 'is']) q[f] = (c: string, v: unknown) => { reg.filtros.push([f, c, v]); return q; };
    q.order = () => q; q.range = () => q;
    q.limit = (n: number) => { reg.limite = n; return q; };
    q.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: reg.op === 'select' ? (resp[tabela] ?? []) : null, error: null, count: 0 }).then(ok);
    return q;
  });
  return { client: { from } as unknown as SupabaseClient, chamadas };
}

describe('energia-repo: G1 revisão 2', () => {
  const MP: MedidorRow = { ...M, device_id: '007007422d90' };

  it('ultimaJanela ignora janela de backfill (o cursor não pula bruto)', async () => {
    const { client, chamadas } = clientePorTabela();
    await criarEnergiaRepo(client).ultimaJanela(MP);
    expect(chamadas[0].filtros).toContainEqual(['neq', 'fonte', 'backfill']);
  });

  it('todosMedidores inclui os desligados (sem filtro de ativo)', async () => {
    const { client, chamadas } = clientePorTabela();
    await criarEnergiaRepo(client).todosMedidores();
    expect(chamadas[0].filtros.some((f) => f[1] === 'ativo')).toBe(false);
  });

  it('vincularBrutoOrfao: só órfão da empresa do medidor, com e sem prefixo do modelo, em lote limitado e idempotente', async () => {
    const linhas = [{ id: 'r1', medido_em: '2026-09-28T10:00:00+00:00' }, { id: 'r2', medido_em: '2026-09-28T10:01:00+00:00' }];
    const { client, chamadas } = clientePorTabela({ medicoes_shelly: linhas });
    const r = await criarEnergiaRepo(client).vincularBrutoOrfao(MP);
    expect(r).toEqual({ vinculadas: 2, maisAntiga: '2026-09-28T10:00:00.000Z', restam: false });
    const sel = chamadas[0];
    expect(sel.filtros).toContainEqual(['eq', 'company_id', 'empresa-X']);
    expect(sel.filtros).toContainEqual(['is', 'medidor_id', null]);
    const formas = sel.filtros.find((f) => f[0] === 'in' && f[1] === 'device_id')![2] as string[];
    expect(formas).toEqual(expect.arrayContaining(['007007422d90', 'shellypro3em-007007422d90', 'shellypro3em-007007422D90']));
    expect(sel.limite).toBeGreaterThan(0);
    const upd = chamadas.find((c) => c.op === 'update')!;
    expect(upd.payload).toEqual({ medidor_id: 'm1' });
    expect(upd.filtros).toContainEqual(['eq', 'company_id', 'empresa-X']);
    expect(upd.filtros).toContainEqual(['is', 'medidor_id', null]); // idempotente: não rouba linha já ligada
    expect(upd.filtros).toContainEqual(['in', 'id', ['r1', 'r2']]);
  });

  it('vincularBrutoOrfao sem órfão: não faz update', async () => {
    const { client, chamadas } = clientePorTabela();
    const r = await criarEnergiaRepo(client).vincularBrutoOrfao(MP);
    expect(r).toEqual({ vinculadas: 0, maisAntiga: null, restam: false });
    expect(chamadas.some((c) => c.op === 'update')).toBe(false);
  });

  it('diasAlteradosDepoisDeFechar: dia com janela mexida depois do fechamento, ou nunca fechado', async () => {
    const { client, chamadas } = clientePorTabela({
      energia_15min: [
        { inicio: '2026-09-08T03:00:00+00:00', atualizado_em: '2026-09-28T10:00:00+00:00' }, // dia 08, fechado depois → não
        { inicio: '2026-09-09T03:00:00+00:00', atualizado_em: '2026-09-28T10:00:00+00:00' }, // dia 09, fechado antes → sim
        { inicio: '2026-09-10T02:45:00+00:00', atualizado_em: '2026-09-28T10:00:00+00:00' }, // 23h45 BRT do dia 09
        { inicio: '2026-09-10T03:00:00+00:00', atualizado_em: '2026-09-28T10:00:00+00:00' }, // dia 10, sem dia → sim
      ],
      energia_diaria: [
        { dia: '2026-09-08', fechado_em: '2026-09-28T11:00:00+00:00' },
        { dia: '2026-09-09', fechado_em: '2026-09-20T00:00:00+00:00' },
      ],
    });
    const dias = await criarEnergiaRepo(client).diasAlteradosDepoisDeFechar(MP, '2026-09-21T00:00:00.000Z');
    expect(dias).toEqual(['2026-09-09', '2026-09-10']);
    for (const c of chamadas) expect(c.filtros, c.tabela).toContainEqual(['eq', 'company_id', 'empresa-X']);
    expect(chamadas[0].filtros).toContainEqual(['gte', 'atualizado_em', '2026-09-21T00:00:00.000Z']);
  });

  it('apagarBrutoOrfaoAntesDe: só linha SEM medidor e mais velha que o corte, em lote', async () => {
    const { client, chamadas } = clientePorTabela({ medicoes_shelly: [{ id: 'x1' }, { id: 'x2' }] });
    await criarEnergiaRepo(client).apagarBrutoOrfaoAntesDe('2026-06-30T12:00:00.000Z');
    expect(chamadas[0].filtros).toEqual(expect.arrayContaining([['is', 'medidor_id', null], ['lt', 'medido_em', '2026-06-30T12:00:00.000Z']]));
    expect(chamadas[0].limite).toBeGreaterThan(0);
    const del = chamadas.find((c) => c.op === 'delete')!;
    expect(del.filtros).toEqual(expect.arrayContaining([['is', 'medidor_id', null], ['in', 'id', ['x1', 'x2']]]));
  });
});
