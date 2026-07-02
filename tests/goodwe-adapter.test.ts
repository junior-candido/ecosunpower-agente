// Testa o adapter GoodWe (SEMS Portal, granularidade = USINA). Cobre parsing das
// credenciais, montagem do header de auth (uid+timestamp+token), o mapeamento de
// status, o parse de cidade/UF do campo location, a geração das janelas de ~30
// dias pra cobrir um intervalo, e o parse da geração diária do GetChartByPlant.
// A rede fica de fora (validada ao vivo 01/07).

import { describe, it, expect } from 'vitest';
import {
  parseCreds,
  buildSiteCredenciais,
  buildAuthHeader,
  parseLocation,
  janelasParaIntervalo,
  parseChartGeneration,
  parseIntradayGoodwe,
  parseStationRecord,
  goodweAdapter,
  type ParsedCreds,
} from '../src/modules/monitoring/adapters/goodwe.js';

// ============================================================================
// parseCreds
// ============================================================================

describe('parseCreds', () => {
  it('aceita { email, password } + site_id', () => {
    const c = parseCreds({ email: 'a@b.com', password: 'x', site_id: 'UUID-1' }) as ParsedCreds;
    expect(c.email).toBe('a@b.com');
    expect(c.password).toBe('x');
    expect(c.siteId).toBe('UUID-1');
  });

  it('aceita aliases account/pwd e powerstation_id', () => {
    const c = parseCreds({ account: ' a@b.com ', pwd: ' x ', powerstation_id: 'PS-9' }) as ParsedCreds;
    expect(c.email).toBe('a@b.com');
    expect(c.password).toBe('x');
    expect(c.siteId).toBe('PS-9');
  });

  it('sem site_id fica undefined (conta)', () => {
    const c = parseCreds({ email: 'a@b.com', password: 'x' }) as ParsedCreds;
    expect(c.siteId).toBeUndefined();
  });

  it('erro sem email/senha', () => {
    const r = parseCreds({ foo: 'bar' });
    expect('error' in r).toBe(true);
    expect((r as { error: string }).error).toMatch(/email/i);
  });
});

describe('buildSiteCredenciais', () => {
  it('grava chave site_id (não sid) + carrega email/senha', () => {
    const parsed = { email: 'a@b.com', password: 'x' } as ParsedCreds;
    expect(buildSiteCredenciais(parsed, 'PS-1')).toEqual({ email: 'a@b.com', password: 'x', site_id: 'PS-1' });
  });
});

// ============================================================================
// buildAuthHeader
// ============================================================================

describe('buildAuthHeader', () => {
  it('monta o header com uid+timestamp+token+client web', () => {
    const h = JSON.parse(buildAuthHeader({ uid: 'U1', timestamp: 123, token: 'TK' }));
    expect(h).toMatchObject({ uid: 'U1', timestamp: 123, token: 'TK', client: 'web', version: '', language: 'en' });
  });
  it('tolera campos ausentes sem quebrar', () => {
    const h = JSON.parse(buildAuthHeader({}));
    expect(h.uid).toBe('');
    expect(h.token).toBe('');
  });
});

// ============================================================================
// parseLocation
// ============================================================================

describe('parseLocation', () => {
  it('extrai cidade e UF do endereço real da conta', () => {
    const r = parseLocation('St. Res. Leste | Buritís I Q 1 Conjunto D, 51 - Planaltina, Brasília - DF, Brasil');
    expect(r).toEqual({ cidade: 'Brasília', uf: 'DF' });
  });
  it('funciona sem o sufixo ", Brasil"', () => {
    expect(parseLocation('Rua X, 10, Centro, Anápolis - GO')).toEqual({ cidade: 'Anápolis', uf: 'GO' });
  });
  it('sem padrão reconhecível → nulls', () => {
    expect(parseLocation('endereço bagunçado sem uf')).toEqual({ cidade: null, uf: null });
    expect(parseLocation('')).toEqual({ cidade: null, uf: null });
    expect(parseLocation(null)).toEqual({ cidade: null, uf: null });
  });
});

// ============================================================================
// janelasParaIntervalo — janela móvel de 31 dias terminando na `date`
// ============================================================================

describe('janelasParaIntervalo', () => {
  it('intervalo curto cabe em 1 janela', () => {
    expect(janelasParaIntervalo('2026-06-28', '2026-07-01')).toEqual(['2026-07-01']);
  });
  it('faixa exata de 31 dias = 1 janela', () => {
    // janela de fim cobre [fim-30, fim]; inicio == fim-30 → 1 só
    expect(janelasParaIntervalo('2026-06-01', '2026-07-01')).toEqual(['2026-07-01']);
  });
  it('intervalo longo anda ~30 dias pra trás e cobre o início', () => {
    const js = janelasParaIntervalo('2026-01-01', '2026-07-01');
    expect(js[0]).toBe('2026-07-01');
    // última janela precisa cobrir 2026-01-01 (ou seja, ancora-30 <= inicio)
    const ultima = js[js.length - 1];
    const [y, m, d] = ultima.split('-').map(Number);
    const anc = new Date(Date.UTC(y, m - 1, d));
    anc.setUTCDate(anc.getUTCDate() - 30);
    expect(anc.toISOString().slice(0, 10) <= '2026-01-01').toBe(true);
  });
  it('não entra em loop infinito (guarda)', () => {
    expect(janelasParaIntervalo('2000-01-01', '2026-07-01').length).toBeLessThanOrEqual(60);
  });
});

// ============================================================================
// parseChartGeneration — lines[PVGeneration].xy → kWh/dia, filtrado no intervalo
// ============================================================================

const chartSample = {
  lines: [
    {
      label: 'Generation (kWh)', name: 'PVGeneration', unit: 'kWh',
      xy: [
        { x: '2026-06-29', y: 40.5, z: null },
        { x: '2026-06-30', y: 0, z: null },
        { x: '2026-07-01', y: 42.2, z: null },
        { x: '2026-07-02', y: null, z: null }, // futuro sem leitura
      ],
    },
    { label: 'Income (USD)', name: 'Income', unit: 'USD', xy: [{ x: '2026-07-01', y: 41.3 }] },
  ],
};

describe('parseChartGeneration', () => {
  it('pega a linha PVGeneration e filtra o intervalo', () => {
    const g = parseChartGeneration(chartSample, '2026-06-30', '2026-07-01');
    expect(g).toEqual([
      { data: '2026-06-30', geracao_kwh: 0 },
      { data: '2026-07-01', geracao_kwh: 42.2 },
    ]);
  });
  it('descarta dias com leitura null (futuro) e fora do intervalo', () => {
    const g = parseChartGeneration(chartSample, '2026-06-01', '2026-07-31');
    expect(g.map((x) => x.data)).toEqual(['2026-06-29', '2026-06-30', '2026-07-01']);
  });
  it('negativos viram 0', () => {
    const g = parseChartGeneration({ lines: [{ name: 'PVGeneration', unit: 'kWh', xy: [{ x: '2026-07-01', y: -3 }] }] }, '2026-07-01', '2026-07-01');
    expect(g).toEqual([{ data: '2026-07-01', geracao_kwh: 0 }]);
  });
  it('resposta sem lines → vazio', () => {
    expect(parseChartGeneration({} as never, '2026-07-01', '2026-07-01')).toEqual([]);
  });
});

// ============================================================================
// parseIntradayGoodwe — lines[PCurve_Power_PV].xy → kW por horário
// ============================================================================

describe('parseIntradayGoodwe', () => {
  it('pega a linha PCurve_Power_PV e converte W→kW', () => {
    const data = { lines: [
      { name: 'PCurve_Power_PV', unit: 'W', xy: [{ x: '06:00', y: 0 }, { x: '12:00', y: 17281 }, { x: '18:00', y: null }] },
      { name: 'Consumption', unit: 'W', xy: [{ x: '12:00', y: 5 }] },
    ] };
    expect(parseIntradayGoodwe(data)).toEqual([{ hora: '06:00', kw: 0 }, { hora: '12:00', kw: 17.281 }]);
  });
  it('sem linha de potencia → vazio', () => expect(parseIntradayGoodwe({})).toEqual([]));
});

// ============================================================================
// parseStationRecord
// ============================================================================

describe('parseStationRecord', () => {
  it('mapeia o registro real da usina', () => {
    const base = parseStationRecord({
      powerstation_id: '82f11450-cac6-4924-8058-81f1ebf2c1b8',
      stationname: 'Colégio Delta Planaltina',
      capacity: 23.76,
      status: 1,
      location: 'St. Res. Leste, 51 - Planaltina, Brasília - DF, Brasil',
    });
    expect(base).toEqual({
      externalId: '82f11450-cac6-4924-8058-81f1ebf2c1b8',
      apelido: 'Colégio Delta Planaltina',
      potencia_kwp: 23.76,
      cidade: 'Brasília',
      uf: 'DF',
      data_instalacao: null,
    });
  });
  it('capacity como string vira número', () => {
    const base = parseStationRecord({ powerstation_id: 'X', stationname: 'S', capacity: '10.5' });
    expect(base?.potencia_kwp).toBe(10.5);
  });
  it('sem powerstation_id → null', () => {
    expect(parseStationRecord({ stationname: 'sem id' })).toBeNull();
  });
});

// ============================================================================
// adapter — contrato
// ============================================================================

describe('goodweAdapter', () => {
  it('marca é goodwe', () => expect(goodweAdapter.marca).toBe('goodwe'));

  it('fetchGeneration sem site_id → invalidCredentials', async () => {
    const r = await goodweAdapter.fetchGeneration({ email: 'a@b.com', password: 'x' }, '2026-07-01', '2026-07-01');
    expect(r.ok).toBe(false);
    expect((r as { invalidCredentials?: boolean }).invalidCredentials).toBe(true);
  });

  it('fetchGeneration sem credencial → erro', async () => {
    const r = await goodweAdapter.fetchGeneration({}, '2026-07-01', '2026-07-01');
    expect(r.ok).toBe(false);
  });

  it('extractAccountCreds tira o site_id, deixa email+senha', () => {
    const cc = goodweAdapter.extractAccountCreds!({ email: 'a@b.com', password: 'x', site_id: 'PS-1' });
    expect(cc).toEqual({ email: 'a@b.com', password: 'x' });
  });

  it('extractAccountCreds null sem credencial', () => {
    expect(goodweAdapter.extractAccountCreds!({ foo: 1 })).toBeNull();
  });
});
