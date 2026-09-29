// NEP: o echarts devolve uma série por micro (nome = SN). Se vier também uma
// série de TOTAL da planta junto, somar tudo DOBRAVA a geração (auditoria 29/09).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { nepAdapter, separarSeriesNep, janelasPorMes } from '../src/modules/monitoring/adapters/nep.js';
import { clearAllTokens } from '../src/modules/monitoring/util/token-cache.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  clearAllTokens();
});

function res(status: number, jsonBody: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => jsonBody, text: async () => JSON.stringify(jsonBody) } as Response;
}

async function buscar(series: Array<{ name: string; data: Array<number | null> }>, xAxisData = ['01/05', '02/05', '03/05']) {
  vi.stubGlobal('fetch', vi.fn(async () => res(200, { code: 200, msg: 'ok', data: { legend: series.map((s) => s.name), xAxisData, series } })));
  return nepAdapter.fetchGeneration({ jwt: 'x', site_id: 'BR_X' }, '2026-05-01', '2026-05-31');
}

describe('NEP — série de total não dobra a geração', () => {
  it('série "Total" junto das séries por micro → usa só o total', async () => {
    const r = await buscar([
      { name: 'Total', data: [15, 12, 8] },
      { name: 'SN_A', data: [10, 12, null] },
      { name: 'SN_B', data: [5, null, 8] },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.geracoes).toEqual([
      { data: '2026-05-01', geracao_kwh: 15 },
      { data: '2026-05-02', geracao_kwh: 12 },
      { data: '2026-05-03', geracao_kwh: 8 },
    ]);
    // Status continua olhando os micros (1 dos 2 sem leitura no último dia = falha).
    expect(r.statusInversor).toBe('falha');
  });

  it('série sem nome de total mas que é a SOMA exata das outras → não entra de novo na soma', async () => {
    const r = await buscar([
      { name: 'SN_A', data: [10, 12, 9.5] },
      { name: 'SN_B', data: [5, 6, 8] },
      { name: 'Power Generation', data: [15, 18, 17.5] },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.geracoes.map((g) => g.geracao_kwh)).toEqual([15, 18, 17.5]);
    expect(r.statusInversor).toBe('ok');
  });

  it('só séries por micro (caso normal) → soma todas, como antes', () => {
    const { soma, dispositivos } = separarSeriesNep([
      { name: 'SN_A', data: [10] },
      { name: 'SN_B', data: [5] },
    ]);
    expect(soma.map((s) => s.name)).toEqual(['SN_A', 'SN_B']);
    expect(dispositivos.map((s) => s.name)).toEqual(['SN_A', 'SN_B']);
  });

  it('SN que contém as letras "sum" não é confundido com série de total', () => {
    const { soma } = separarSeriesNep([
      { name: 'BDM2SUM3', data: [4] },
      { name: 'SN_B', data: [5] },
    ]);
    expect(soma).toHaveLength(2);
  });

  it('2 micros iguais NÃO são confundidos com total (precisa de 3+ séries pra detectar soma)', () => {
    const { soma } = separarSeriesNep([
      { name: 'SN_A', data: [5, 6] },
      { name: 'SN_B', data: [5, 6] },
    ]);
    expect(soma).toHaveLength(2);
  });

  it('coincidência num dia só não basta pra tratar como total', () => {
    const { soma } = separarSeriesNep([
      { name: 'SN_A', data: [1, null] },
      { name: 'SN_B', data: [1, null] },
      { name: 'SN_C', data: [2, null] },
    ]);
    expect(soma).toHaveLength(3);
  });
});

describe('NEP — período longo (refresh do mês) pedido mês a mês', () => {
  it('janelasPorMes quebra no calendário', () => {
    expect(janelasPorMes('2026-08-15', '2026-09-29')).toEqual([['2026-08-15', '2026-08-31'], ['2026-09-01', '2026-09-29']]);
    expect(janelasPorMes('2026-12-20', '2027-01-03')).toEqual([['2026-12-20', '2026-12-31'], ['2027-01-01', '2027-01-03']]);
    expect(janelasPorMes('2026-09-01', '2026-09-01')).toEqual([['2026-09-01', '2026-09-01']]);
  });

  it('mês anterior + corrente = 2 pedidos; mês que falha depois de outro dar certo → falhaParcial', async () => {
    const corpos: string[] = [];
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
      corpos.push(String(init?.body ?? ''));
      n++;
      if (n === 1) return res(200, { code: 200, msg: 'ok', data: { xAxisData: ['31/08'], series: [{ name: 'SN_A', data: [7] }] } });
      return res(500, { code: 500, msg: 'erro' });
    }));
    const r = await nepAdapter.fetchGeneration({ jwt: 'x', site_id: 'BR_X' }, '2026-08-31', '2026-09-29');
    expect(corpos.some((c) => c.includes('2026-08-31~2026-08-31'))).toBe(true);
    expect(corpos.some((c) => c.includes('2026-09-01~2026-09-29'))).toBe(true);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.geracoes).toEqual([{ data: '2026-08-31', geracao_kwh: 7 }]);
    expect(r.falhaParcial).toMatch(/2026-09/);
  });
});
