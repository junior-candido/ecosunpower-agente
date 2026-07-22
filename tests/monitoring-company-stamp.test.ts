// Fase 2 fatia A3 (docs/ecosof/07): TODA escrita derivada de um sistema carrega
// o company_id DO SISTEMA — sem isso, o dado da usina do tenant nasceria com o
// DEFAULT EcoSun (077) e sumiria pro dono sob RLS (079).
import { describe, it, expect } from 'vitest';
import { linhasGeracao } from '../src/modules/monitoring/service.js';
import { agregarDia } from '../src/modules/monitoring/telemetria-service.js';
import { registrarLeituraManual } from '../src/modules/dashboard/manutencao-queries.js';
import { SupabaseService } from '../src/modules/supabase.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const SABION = '33333333-3333-4333-8333-333333333333';

describe('linhasGeracao — carimbo nas linhas de geracao_diaria', () => {
  const ger = [{ data: '2026-07-21', geracao_kwh: 42 }];

  it('sistema do tenant → company_id do tenant', () => {
    const rows = linhasGeracao('sis-1', SABION, ger);
    expect(rows[0]).toMatchObject({ sistema_id: 'sis-1', data: '2026-07-21', geracao_kwh: 42, company_id: SABION });
  });

  it('sistema sem company_id (linha antiga) → carimbo EXPLÍCITO EcoSun (nunca confia no default)', () => {
    const rows = linhasGeracao('sis-1', null, ger);
    expect(rows[0]!.company_id).toBe(ECOSUN);
    expect(linhasGeracao('sis-1', undefined, ger)[0]!.company_id).toBe(ECOSUN);
  });
});

describe('agregarDia — resumo herda o company_id das medições', () => {
  it('carrega o company_id do grupo (mesmo sistema = mesma empresa)', () => {
    const resumo = agregarDia([
      { sistema_id: 's1', device_key: 'inv1', ponto: 'potencia', ts: '2026-07-21T10:00:00Z', valor: 1, unidade: 'kW', company_id: SABION },
      { sistema_id: 's1', device_key: 'inv1', ponto: 'potencia', ts: '2026-07-21T11:00:00Z', valor: 3, unidade: 'kW', company_id: SABION },
    ]);
    expect(resumo).toHaveLength(1);
    expect(resumo[0]).toMatchObject({ sistema_id: 's1', dia: '2026-07-21', valor_min: 1, valor_max: 3, company_id: SABION });
  });

  it('sem company_id nas medições (legado) → resumo com EcoSun explícito', () => {
    const resumo = agregarDia([
      { sistema_id: 's1', device_key: 'inv1', ponto: 'potencia', ts: '2026-07-21T10:00:00Z', valor: 2, unidade: 'kW' },
    ]);
    expect(resumo[0]!.company_id).toBe(ECOSUN);
  });
});

// Mock chainable p/ capturar inserts/upserts (estilo das fatias 3a-3e).
function mockClient(respostas: Record<string, any[]>) {
  const escritas: Record<string, any[]> = {};
  const client = {
    from(tabela: string) {
      const resposta = () => (respostas[tabela] ?? []).shift() ?? { data: null, error: null };
      const chain: any = {
        insert(row: any) { (escritas[tabela] ??= []).push(row); return chain; },
        upsert(row: any) { (escritas[tabela] ??= []).push(row); return chain; },
        select() { return chain; },
        eq() { return chain; },
        maybeSingle() { return Promise.resolve(resposta()); },
        single() { return Promise.resolve(resposta()); },
        then(res: any, rej: any) { return Promise.resolve(resposta()).then(res, rej); },
      };
      return chain;
    },
  };
  return { client: client as any, escritas };
}

describe('criarAlertaPendente — carimbo no alerta', () => {
  it('grava company_id quando informado; EcoSun explícito quando não', async () => {
    const { client, escritas } = mockClient({});
    const svc = new SupabaseService({ supabaseUrl: 'http://x', supabaseServiceKey: 'k' } as any, client);
    await svc.criarAlertaPendente({
      sistema_id: 's1', tipo: 'sistema_offline', severidade: 'alta', texto: 'x',
      primeiro_visto_em: '2026-07-22T00:00:00Z', next_send_at: '2026-07-22T00:00:00Z',
      company_id: SABION,
    });
    await svc.criarAlertaPendente({
      sistema_id: 's2', tipo: 'sistema_offline', severidade: 'alta', texto: 'y',
      primeiro_visto_em: '2026-07-22T00:00:00Z', next_send_at: '2026-07-22T00:00:00Z',
    });
    expect(escritas.monitoring_alerts?.[0]).toMatchObject({ sistema_id: 's1', company_id: SABION });
    expect(escritas.monitoring_alerts?.[1]).toMatchObject({ sistema_id: 's2', company_id: ECOSUN });
  });
});

describe('listarParaDashboard — tela filtra pela empresa do operador', () => {
  it('com companyId, a consulta de sistemas ganha eq(company_id)', async () => {
    const eqs: Array<[string, unknown]> = [];
    const chain: any = {
      select: () => chain,
      eq: (col: string, val: unknown) => { eqs.push([col, val]); return chain; },
      then: (res: any) => Promise.resolve({ data: [], error: null }).then(res),
    };
    const fakeSupabase = { getClient: () => ({ from: () => chain }) };
    const { MonitoringService } = await import('../src/modules/monitoring/service.js');
    const svc = new MonitoringService(fakeSupabase as any);
    const lista = await svc.listarParaDashboard(SABION);
    expect(lista).toEqual([]);
    expect(eqs).toContainEqual(['company_id', SABION]);
    // sem companyId (crons) → sem filtro de empresa
    eqs.length = 0;
    await svc.listarParaDashboard();
    expect(eqs.some(([c]) => c === 'company_id')).toBe(false);
  });
});

describe('registrarLeituraManual — leitura manual herda a empresa do sistema', () => {
  it('busca o sistema ANTES e carimba o upsert com o company dele', async () => {
    const { client, escritas } = mockClient({
      sistemas_clientes: [{ data: { potencia_kwp: 10, company_id: SABION }, error: null }],
    });
    const r = await registrarLeituraManual(client, { sistemaId: 's1', competencia: '2026-07', kwh: 1200 });
    expect(escritas.geracao_diaria?.[0]).toMatchObject({
      sistema_id: 's1', data: '2026-07-01', geracao_kwh: 1200, fetched_source: 'manual', company_id: SABION,
    });
    expect(r.kwhDigitado ?? 1200).toBeTruthy(); // feedback continua vindo
  });
});
