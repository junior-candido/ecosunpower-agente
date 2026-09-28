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
    for (const f of ['eq', 'gte', 'lt']) q[f] = (c: string, v: unknown) => { reg.filtros.push([c, v]); return q; };
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
});
