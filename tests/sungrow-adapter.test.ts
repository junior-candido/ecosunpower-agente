// Testa o adapter Sungrow (OpenAPI OAuth2, texto plano — validado ao vivo 03/07).
// Cobre: parsing de credenciais, helpers de data, parse da série diária e do
// tempo real, e o fluxo de rede com fetch mockado (troca de code, ROTAÇÃO do
// refresh_token + persistência, geração histórica + dia de hoje, listSites).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseCreds,
  buildSiteCredenciais,
  cacheKey,
  isoParaYmd,
  ymdParaIso,
  dataInstalacaoParaIso,
  parseSerieDiaria,
  parseGeracaoHojeKwh,
  janelasDeDias,
  janelas3hDaylight,
  parseDeviceMinuto,
  sungrowAdapter,
  type ParsedCreds,
} from '../src/modules/monitoring/adapters/sungrow.js';
import { clearAllTokens } from '../src/modules/monitoring/util/token-cache.js';

const CONTA = {
  appkey: 'APPKEY123',
  accessKey: 'SECRET456',
  appId: '3229',
  redirectUri: 'https://www.ecosunpowerenergia.com.br',
  refreshToken: 'RT-ORIGINAL',
};

// ============================================================================
// parseCreds
// ============================================================================

describe('parseCreds', () => {
  it('aceita credenciais de conta (appkey+accessKey+refreshToken)', () => {
    const c = parseCreds(CONTA) as ParsedCreds;
    expect(c.appkey).toBe('APPKEY123');
    expect(c.accessKey).toBe('SECRET456');
    expect(c.refreshToken).toBe('RT-ORIGINAL');
    expect(c.gateway).toMatch(/isolarcloud\.com\.hk$/);
  });

  it('aceita bootstrap com code (sem refreshToken)', () => {
    const c = parseCreds({ ...CONTA, refreshToken: undefined, code: 'B6QD7g' }) as ParsedCreds;
    expect(c.code).toBe('B6QD7g');
    expect(c.refreshToken).toBe('');
  });

  it('aceita por-planta com site_id (ps_id numérico vira string)', () => {
    const c = parseCreds({ ...CONTA, site_id: 1800490 }) as ParsedCreds;
    expect(c.siteId).toBe('1800490');
  });

  it('erro sem appkey/accessKey', () => {
    const r = parseCreds({ refreshToken: 'x' });
    expect('error' in r).toBe(true);
    expect((r as { error: string }).error).toMatch(/appkey/i);
  });

  it('erro sem refreshToken E sem code', () => {
    const r = parseCreds({ appkey: 'A', accessKey: 'B' });
    expect('error' in r).toBe(true);
    expect((r as { error: string }).error).toMatch(/refreshToken|code/i);
  });
});

describe('buildSiteCredenciais / cacheKey', () => {
  it('buildSiteCredenciais leva conta + site_id', () => {
    const c = parseCreds(CONTA) as ParsedCreds;
    const site = buildSiteCredenciais(c, '1800490');
    expect(site).toMatchObject({ appkey: 'APPKEY123', accessKey: 'SECRET456', refreshToken: 'RT-ORIGINAL', site_id: '1800490' });
  });

  it('cacheKey é estável mesmo quando o refresh_token muda (rotação)', () => {
    const a = parseCreds({ ...CONTA, refreshToken: 'RT-1' }) as ParsedCreds;
    const b = parseCreds({ ...CONTA, refreshToken: 'RT-2' }) as ParsedCreds;
    expect(cacheKey(a)).toBe(cacheKey(b));
  });
});

// ============================================================================
// helpers de data
// ============================================================================

describe('helpers de data', () => {
  it('isoParaYmd', () => expect(isoParaYmd('2026-07-03')).toBe('20260703'));
  it('ymdParaIso', () => {
    expect(ymdParaIso('20240823')).toBe('2024-08-23');
    expect(ymdParaIso('lixo')).toBeNull();
  });
  it('dataInstalacaoParaIso aceita datetime e ymd', () => {
    expect(dataInstalacaoParaIso('2026-03-18 16:46:43')).toBe('2026-03-18');
    expect(dataInstalacaoParaIso('20260318')).toBe('2026-03-18');
    expect(dataInstalacaoParaIso(null)).toBeNull();
  });
});

// ============================================================================
// parseSerieDiaria — result_data[psId].p83022 = [{ "2": Wh, time_stamp }]
// ============================================================================

describe('parseSerieDiaria', () => {
  it('converte Wh->kWh e ordena por data', () => {
    const rd = {
      '1517903': {
        p83022: [
          { '2': '509300.0', time_stamp: '20260625' },
          { '2': '343900.0', time_stamp: '20260702' },
        ],
      },
    };
    const out = parseSerieDiaria(rd, '1517903');
    expect(out).toEqual([
      { data: '2026-06-25', geracao_kwh: 509.3 },
      { data: '2026-07-02', geracao_kwh: 343.9 },
    ]);
  });

  it('planta ausente → vazio', () => {
    expect(parseSerieDiaria({ '999': { p83022: [] } }, '1517903')).toEqual([]);
  });

  it('descarta amostras sem número', () => {
    const rd = { '1': { p83022: [{ '2': '--', time_stamp: '20260625' }, { '2': '1000', time_stamp: '20260626' }] } };
    expect(parseSerieDiaria(rd, '1')).toEqual([{ data: '2026-06-26', geracao_kwh: 1 }]);
  });
});

describe('janelasDeDias (limite de 100 dias por chamada)', () => {
  it('range curto = 1 janela', () => {
    expect(janelasDeDias('2026-01-01', '2026-01-05', 90)).toEqual([['2026-01-01', '2026-01-05']]);
  });
  it('range longo quebra em janelas de <= maxDias e não deixa buraco', () => {
    const js = janelasDeDias('2026-01-01', '2026-06-30', 90);
    expect(js.length).toBeGreaterThan(1);
    // primeira janela começa no início; última termina no fim
    expect(js[0][0]).toBe('2026-01-01');
    expect(js[js.length - 1][1]).toBe('2026-06-30');
    // contíguo: o início de cada janela é o dia seguinte ao fim da anterior
    for (let i = 1; i < js.length; i++) {
      const antFim = new Date(`${js[i - 1][1]}T00:00:00Z`);
      antFim.setUTCDate(antFim.getUTCDate() + 1);
      expect(js[i][0]).toBe(antFim.toISOString().slice(0, 10));
    }
    // cada janela cabe no limite
    for (const [a, b] of js) {
      const dias = (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000 + 1;
      expect(dias).toBeLessThanOrEqual(90);
    }
  });
  it('fim antes do início = vazio', () => {
    expect(janelasDeDias('2026-02-01', '2026-01-01', 90)).toEqual([]);
  });
});

describe('parseGeracaoHojeKwh', () => {
  it('acha a planta na device_point_list e converte Wh->kWh', () => {
    const rd = { device_point_list: [
      { ps_id: 1800490, p83022: '3800.0' },
      { ps_id: 1517903, p83022: '93000.0' },
    ] };
    expect(parseGeracaoHojeKwh(rd, '1800490')).toBe(3.8);
    expect(parseGeracaoHojeKwh(rd, '1517903')).toBe(93);
  });
  it('planta ausente → null', () => {
    expect(parseGeracaoHojeKwh({ device_point_list: [] }, '1')).toBeNull();
  });
});

// ============================================================================
// REDE (fetch mockado)
// ============================================================================

// Roteia por path. Guarda as chamadas pra inspeção.
function mockFetch(routes: Record<string, (body: any) => any>) {
  const calls: Array<{ path: string; body: any; headers: any }> = [];
  const fn = vi.fn(async (url: string, init: any) => {
    const path = new URL(url).pathname;
    const body = init?.body ? JSON.parse(init.body) : {};
    calls.push({ path, body, headers: init?.headers ?? {} });
    const handler = routes[path];
    const json = handler ? handler(body) : { result_code: '0', result_msg: `sem rota ${path}` };
    return { ok: true, status: 200, json: async () => json, text: async () => JSON.stringify(json) } as any;
  });
  vi.stubGlobal('fetch', fn);
  return { calls };
}

const hoje = new Date().toISOString().slice(0, 10);
const ymdHoje = hoje.replace(/-/g, '');

describe('fetchGeneration (rede mockada)', () => {
  beforeEach(() => clearAllTokens());
  afterEach(() => vi.unstubAllGlobals());

  it('renova token, puxa histórico + hoje, e persiste o refresh_token ROTACIONADO', async () => {
    const { calls } = mockFetch({
      '/openapi/apiManage/refreshToken': () => ({
        result_code: '1',
        result_data: { access_token: 'AT-1', refresh_token: 'RT-NOVO' },
      }),
      '/openapi/platform/getPowerStationPointDayMonthYearDataList': () => ({
        result_code: '1',
        result_data: { '1800490': { p83022: [{ '2': '14100.0', time_stamp: '20260701' }] } },
      }),
      '/openapi/platform/getPowerStationRealTimeData': () => ({
        result_code: '1',
        result_data: { device_point_list: [{ ps_id: 1800490, p83022: '3800.0' }] },
      }),
    });

    const persisted: any[] = [];
    const ctx = { persistAccountCreds: async (patch: any) => { persisted.push(patch); } };

    const r = await sungrowAdapter.fetchGeneration(
      { ...CONTA, site_id: '1800490' },
      '2026-07-01',
      hoje,
      ctx,
    );

    expect(r.ok).toBe(true);
    if (r.ok) {
      // histórico (01/07) + hoje (via tempo real)
      expect(r.geracoes).toContainEqual({ data: '2026-07-01', geracao_kwh: 14.1 });
      expect(r.geracoes.find((g) => g.data === hoje)?.geracao_kwh).toBe(3.8);
    }
    // rotação persistida
    expect(persisted).toContainEqual({ refreshToken: 'RT-NOVO' });
    // usou o Bearer novo nas chamadas de dados
    const dataCall = calls.find((c) => c.path.endsWith('DayMonthYearDataList'));
    expect(dataCall?.headers['Authorization']).toBe('Bearer AT-1');
    // header obrigatório sys_code + x-access-key
    expect(dataCall?.headers['sys_code']).toBe('901');
    expect(dataCall?.headers['x-access-key']).toBe('SECRET456');
  });

  it('bootstrap: troca o code por tokens quando não há refreshToken', async () => {
    const { calls } = mockFetch({
      '/openapi/apiManage/token': (body) => {
        expect(body.grant_type).toBe('authorization_code');
        expect(body.code).toBe('B6QD7g');
        return { result_code: '1', result_data: { access_token: 'AT-X', refresh_token: 'RT-FRESCO' } };
      },
      '/openapi/apiManage/refreshToken': () => ({ result_code: '1', result_data: { access_token: 'AT-X', refresh_token: 'RT-FRESCO' } }),
      '/openapi/platform/getPowerStationPointDayMonthYearDataList': () => ({ result_code: '1', result_data: {} }),
      '/openapi/platform/getPowerStationRealTimeData': () => ({ result_code: '1', result_data: { device_point_list: [] } }),
    });

    const persisted: any[] = [];
    const r = await sungrowAdapter.fetchGeneration(
      { ...CONTA, refreshToken: undefined, code: 'B6QD7g', site_id: '1800490' },
      '2026-07-01', '2026-07-02',
      { persistAccountCreds: async (p: any) => { persisted.push(p); } },
    );
    expect(r.ok).toBe(true);
    expect(calls.some((c) => c.path.endsWith('/token'))).toBe(true);
    expect(persisted.some((p) => p.refreshToken === 'RT-FRESCO')).toBe(true);
  });

  it('erro de credencial (result_code 5) marca invalidCredentials', async () => {
    mockFetch({
      '/openapi/apiManage/refreshToken': () => ({ result_code: '5', result_msg: 'invalid refresh token' }),
    });
    const r = await sungrowAdapter.fetchGeneration({ ...CONTA, site_id: '1800490' }, '2026-07-01', '2026-07-02');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalidCredentials).toBe(true);
  });

  it('sem site_id → invalidCredentials', async () => {
    const r = await sungrowAdapter.fetchGeneration(CONTA, '2026-07-01', '2026-07-02');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalidCredentials).toBe(true);
  });

  it('range longo (>100 dias) faz MÚLTIPLAS chamadas ao histórico (limite Sungrow)', async () => {
    const { calls } = mockFetch({
      '/openapi/apiManage/refreshToken': () => ({ result_code: '1', result_data: { access_token: 'AT', refresh_token: 'RT-ORIGINAL' } }),
      '/openapi/platform/getPowerStationPointDayMonthYearDataList': (body) => ({
        result_code: '1',
        result_data: { '1': { p83022: [{ '2': '1000', time_stamp: body.start_time }] } },
      }),
    });
    const r = await sungrowAdapter.fetchGeneration({ ...CONTA, site_id: '1' }, '2025-01-01', '2025-12-31');
    expect(r.ok).toBe(true);
    const histCalls = calls.filter((c) => c.path.endsWith('DayMonthYearDataList'));
    expect(histCalls.length).toBeGreaterThanOrEqual(4); // 365d / 90d ≈ 5 janelas
  });

  it('range inteiro no passado NÃO chama o tempo real (histórico basta)', async () => {
    const { calls } = mockFetch({
      '/openapi/apiManage/refreshToken': () => ({ result_code: '1', result_data: { access_token: 'AT', refresh_token: 'RT-ORIGINAL' } }),
      '/openapi/platform/getPowerStationPointDayMonthYearDataList': () => ({ result_code: '1', result_data: { '1': { p83022: [{ '2': '1000', time_stamp: '20260101' }] } } }),
    });
    const r = await sungrowAdapter.fetchGeneration({ ...CONTA, site_id: '1' }, '2026-01-01', '2026-01-05');
    expect(r.ok).toBe(true);
    expect(calls.some((c) => c.path.endsWith('RealTimeData'))).toBe(false);
  });
});

// ============================================================================
// CURVA DO DIA (intraday)
// ============================================================================

describe('janelas3hDaylight', () => {
  it('5 janelas de 3h cobrindo 05h–20h, formato yyyyMMddHHmmss', () => {
    const js = janelas3hDaylight('2026-06-30');
    expect(js).toEqual([
      ['20260630050000', '20260630080000'],
      ['20260630080000', '20260630110000'],
      ['20260630110000', '20260630140000'],
      ['20260630140000', '20260630170000'],
      ['20260630170000', '20260630200000'],
    ]);
  });
});

describe('parseDeviceMinuto', () => {
  it('converte W->kW e Wh->kWh, ordena por hora', () => {
    const rd = { '1517903_1_1_1': [
      { time_stamp: '20260630110000', p24: '73001.0', p1: '150000.0' },
      { time_stamp: '20260630090000', p24: '30000.0', p1: '50000.0' },
    ] };
    expect(parseDeviceMinuto(rd)).toEqual([
      { hora: '09:00', kw: 30, kwh: 50 },
      { hora: '11:00', kw: 73.001, kwh: 150 },
    ]);
  });

  it('SOMA os inversores no mesmo horário', () => {
    const rd = {
      'INV_A': [{ time_stamp: '20260630120000', p24: '40000.0', p1: '100000.0' }],
      'INV_B': [{ time_stamp: '20260630120000', p24: '35000.0', p1: '90000.0' }],
    };
    expect(parseDeviceMinuto(rd)).toEqual([{ hora: '12:00', kw: 75, kwh: 190 }]);
  });

  it('ignora point_dict e pontos sem potência/energia', () => {
    const rd = {
      point_dict: [{ point_id: 24, point_name: 'x' }],
      'INV': [
        { time_stamp: '20260630120000', p24: '10000.0' }, // só potência (sem kwh)
        { time_stamp: '20260630123000' },                  // vazio -> descartado
      ],
    };
    const out = parseDeviceMinuto(rd);
    expect(out).toEqual([{ hora: '12:00', kw: 10 }]);
    expect(out[0].kwh).toBeUndefined();
  });
});

describe('fetchIntraday (rede mockada)', () => {
  beforeEach(() => clearAllTokens());
  afterEach(() => vi.unstubAllGlobals());

  it('dia de HOJE → ok:false (Sungrow só dá dias passados)', async () => {
    const r = await sungrowAdapter.fetchIntraday!({ ...CONTA, site_id: '1' }, hoje);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/dia seguinte|passad/i);
  });

  it('dia passado: lista inversores, soma janelas, devolve curva kW+kWh', async () => {
    mockFetch({
      '/openapi/apiManage/refreshToken': () => ({ result_code: '1', result_data: { access_token: 'AT', refresh_token: 'RT-ORIGINAL' } }),
      '/openapi/platform/getDeviceListByPsId': () => ({ result_code: '1', result_data: { pageList: [{ ps_key: '1_1_1_1' }] } }),
      '/openapi/platform/getDevicePointMinuteDataList': (body) => ({
        result_code: '1',
        // devolve 1 ponto por janela, no horário de início da janela
        result_data: { '1_1_1_1': [{ time_stamp: body.start_time_stamp, p24: '20000.0', p1: '5000.0' }] },
      }),
    });
    const r = await sungrowAdapter.fetchIntraday!({ ...CONTA, site_id: '1' }, '2026-06-30');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.pontos.length).toBeGreaterThanOrEqual(5); // 1 por janela (5 janelas)
      expect(r.pontos[0]).toEqual({ hora: '05:00', kw: 20, kwh: 5 });
      expect(r.pontos.every((p) => p.kwh === 5)).toBe(true);
    }
  });

  it('usina sem inversor (ex: micro) → ok:false', async () => {
    mockFetch({
      '/openapi/apiManage/refreshToken': () => ({ result_code: '1', result_data: { access_token: 'AT', refresh_token: 'RT-ORIGINAL' } }),
      '/openapi/platform/getDeviceListByPsId': () => ({ result_code: '1', result_data: { pageList: [] } }),
    });
    const r = await sungrowAdapter.fetchIntraday!({ ...CONTA, site_id: '1' }, '2026-06-30');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/inversor/i);
  });

  it('dia glitch (inversor não reporta minuto) → ok:false', async () => {
    mockFetch({
      '/openapi/apiManage/refreshToken': () => ({ result_code: '1', result_data: { access_token: 'AT', refresh_token: 'RT-ORIGINAL' } }),
      '/openapi/platform/getDeviceListByPsId': () => ({ result_code: '1', result_data: { pageList: [{ ps_key: 'K' }] } }),
      '/openapi/platform/getDevicePointMinuteDataList': () => ({ result_code: '1', result_data: { K: [] } }),
    });
    const r = await sungrowAdapter.fetchIntraday!({ ...CONTA, site_id: '1' }, '2026-06-30');
    expect(r.ok).toBe(false);
  });
});

describe('listSites (rede mockada)', () => {
  beforeEach(() => clearAllTokens());
  afterEach(() => vi.unstubAllGlobals());

  it('lista as plantas do queryPowerStationList', async () => {
    mockFetch({
      '/openapi/apiManage/refreshToken': () => ({ result_code: '1', result_data: { access_token: 'AT', refresh_token: 'RT-ORIGINAL' } }),
      '/openapi/platform/queryPowerStationList': () => ({
        result_code: '1',
        result_data: { rowCount: 2, pageList: [
          { ps_id: 1800490, ps_name: 'Cesar', ps_location: 'Brasília - DF', install_date: '2026-03-18 16:46:43' },
          { ps_id: 1517903, ps_name: 'Usina Planaltina', ps_location: 'Planaltina, GO' },
        ] },
      }),
    });
    const r = await sungrowAdapter.listSites!(CONTA);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sites).toHaveLength(2);
      expect(r.sites[0]).toMatchObject({ externalId: '1800490', apelido: 'Cesar', data_instalacao: '2026-03-18' });
      expect((r.sites[0].credenciais as any).site_id).toBe('1800490');
    }
  });
});
