// tests/monitoramento-adapters-falha-parcial.test.ts
// Auditoria 29/09: adapters escondiam falha parcial e gravavam dia errado.
//   - FoxESS: micro que falha era pulado e o dia gravado com SOMA PARCIAL
//   - FoxESS: rate limit vem como HTTP 200 + errno e não era repetido
//   - Deye/GoodWe/Solis: pedaço do período que falha era engolido calado
//   - Deye: dia sem leitura (null) virava 0 kWh
//   - Sungrow: depois das 21h (Brasília) gravava o total de hoje no dia de AMANHÃ
//   - SolarEdge: 429 era repetido (queimava mais cota do limite diário)
// Regra: dia com qualquer parte faltando NÃO vem em `geracoes` (fica o valor
// anterior no banco) e o adapter avisa em `falhaParcial` (texto em português).
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { foxessAdapter } from '../src/modules/monitoring/adapters/foxess.js';
import { deyeAdapter } from '../src/modules/monitoring/adapters/deye.js';
import { goodweAdapter } from '../src/modules/monitoring/adapters/goodwe.js';
import { solisAdapter } from '../src/modules/monitoring/adapters/solis.js';
import { sungrowAdapter } from '../src/modules/monitoring/adapters/sungrow.js';
import { solarEdgeAdapter } from '../src/modules/monitoring/adapters/solaredge.js';
import { clearAllTokens } from '../src/modules/monitoring/util/token-cache.js';

function resJson(status: number, jsonBody: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => jsonBody,
    text: async () => JSON.stringify(jsonBody),
  } as Response;
}

beforeEach(() => clearAllTokens());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  clearAllTokens();
});

describe('FoxESS', () => {
  const CREDS = { apiKey: 'k', deviceSNs: ['SN1', 'SN2'] };
  const report = (v: number[]) => ({ errno: 0, result: [{ variable: 'generation', unit: 'kWh', values: v }] });

  it('micro que não responde: NÃO grava soma parcial e avisa "1 de 2 micros"', async () => {
    const fetchMock = vi.fn(async (url: string, init: any) => {
      const body = JSON.parse(init.body);
      if (String(url).includes('/device/list')) return resJson(200, { errno: 0, result: { data: [] } });
      if (body.sn === 'SN2') return resJson(200, { errno: 40257, msg: 'param invalid' });
      return resJson(200, report([1, 2, 3, 4, 5]));
    });
    vi.stubGlobal('fetch', fetchMock);
    const r = await foxessAdapter.fetchGeneration(CREDS, '2026-09-01', '2026-09-05');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.geracoes).toEqual([]);
    expect(r.falhaParcial).toBe('1 de 2 micros não responderam');
  });

  it('rate limit (HTTP 200 + errno 40400) é repetido e sucede', async () => {
    vi.useFakeTimers();
    let n = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/device/list')) return resJson(200, { errno: 0, result: { data: [] } });
      n++;
      if (n === 1) return resJson(200, { errno: 40400, msg: 'The number of requests is too frequent' });
      return resJson(200, report([1.5]));
    });
    vi.stubGlobal('fetch', fetchMock);
    const p = foxessAdapter.fetchGeneration({ apiKey: 'k', deviceSNs: ['SN1'] }, '2026-09-01', '2026-09-01');
    await vi.runAllTimersAsync();
    const r = await p;
    expect(n).toBe(2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.geracoes).toEqual([{ data: '2026-09-01', geracao_kwh: 1.5 }]);
    expect(r.falhaParcial).toBeUndefined();
  });
});

describe('Deye', () => {
  const creds = (email: string) => ({
    appId: 'a', appSecret: 's', email, password: 'p', dataCenter: 'us1', site_id: '1',
  });
  function deyeFetch(history: (body: any) => Response) {
    return vi.fn(async (url: string, init: any) => {
      const u = String(url);
      const body = init?.body ? JSON.parse(init.body) : {};
      if (u.includes('/account/token')) return resJson(200, { success: true, code: '1000000', accessToken: 'T', expiresIn: '5183999' });
      if (u.includes('/account/info')) return resJson(200, { success: true, code: '1000000', orgInfoList: [] });
      if (u.includes('/station/history')) return history(body);
      throw new Error(u);
    });
  }

  it('dia sem leitura (generationValue null) não vira 0 kWh', async () => {
    vi.stubGlobal('fetch', deyeFetch(() => resJson(200, {
      success: true, code: '1000000',
      stationDataItems: [
        { year: 2026, month: 9, day: 27, generationValue: 20 },
        { year: 2026, month: 9, day: 28, generationValue: null },
      ],
    })));
    const r = await deyeAdapter.fetchGeneration(creds('null@x.com'), '2026-09-27', '2026-09-28');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.geracoes).toEqual([{ data: '2026-09-27', geracao_kwh: 20 }]);
  });

  it('pedaço do período que falha depois de um que deu certo → falhaParcial', async () => {
    let n = 0;
    vi.stubGlobal('fetch', deyeFetch(() => {
      n++;
      if (n === 1) return resJson(200, { success: true, code: '1000000', stationDataItems: [{ year: 2026, month: 8, day: 5, generationValue: 10 }] });
      return resJson(400, { success: false, code: '2100000', msg: 'bad' });
    }));
    const r = await deyeAdapter.fetchGeneration(creds('parcial@x.com'), '2026-08-01', '2026-09-10');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.geracoes).toEqual([{ data: '2026-08-05', geracao_kwh: 10 }]);
    expect(r.falhaParcial).toMatch(/31\/08 a 10\/09/);
  });
});

describe('GoodWe', () => {
  it('janela que falha depois de uma que deu certo → falhaParcial', async () => {
    const fetchMock = vi.fn(async (url: string, init: any) => {
      const u = String(url);
      if (u.includes('CrossLogin')) return resJson(200, { hasError: false, code: 0, data: { uid: 'u', timestamp: 1, token: 't' } });
      if (u.includes('QueryPowerStationMonitor')) return resJson(200, { hasError: false, code: 0, data: { list: [] } });
      const body = JSON.parse(init.body);
      if (body.date === '2026-09-10') {
        return resJson(200, { hasError: false, code: 0, data: { lines: [{ name: 'PVGeneration', unit: 'kWh', xy: [{ x: '2026-09-05', y: 7 }] }] } });
      }
      return resJson(400, { hasError: true, msg: 'bad' });
    });
    vi.stubGlobal('fetch', fetchMock);
    const r = await goodweAdapter.fetchGeneration({ email: 'a@b.com', password: 'x', site_id: 'ps' }, '2026-08-01', '2026-09-10');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.geracoes).toEqual([{ data: '2026-09-05', geracao_kwh: 7 }]);
    expect(r.falhaParcial).toBeTruthy();
  });
});

describe('Solis', () => {
  it('mês que falha depois de um que deu certo → falhaParcial', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (_url: string, init: any) => {
      const body = JSON.parse(init.body);
      if (body.month === '2026-09') return resJson(200, { success: true, code: '0', data: [{ dateStr: '2026-09-02', energy: 4 }] });
      return resJson(400, { success: false, code: '1', msg: 'bad' });
    });
    vi.stubGlobal('fetch', fetchMock);
    const p = solisAdapter.fetchGeneration({ keyId: 'k', keySecret: 's', site_id: 'ST' }, '2026-08-25', '2026-09-05');
    await vi.runAllTimersAsync();
    const r = await p;
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.geracoes).toEqual([{ data: '2026-09-02', geracao_kwh: 4 }]);
    expect(r.falhaParcial).toMatch(/08\/2026/);
  });
});

describe('Sungrow — dia de Brasília', () => {
  const CONTA = { appkey: 'APPKEY123', accessKey: 'SECRET456', appId: '3229', redirectUri: 'https://x', refreshToken: 'RT' };
  it('às 22h30 de Brasília o total do tempo real vai pra HOJE (29/09), nunca pra 30/09', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-30T01:30:00Z')); // 29/09 22:30 BRT
    const calls: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
      const path = new URL(url).pathname;
      const body = init?.body ? JSON.parse(init.body) : {};
      calls.push({ path, body });
      let json: any = { result_code: '0' };
      if (path.endsWith('refreshToken')) json = { result_code: '1', result_data: { access_token: 'AT', refresh_token: 'RT' } };
      if (path.endsWith('DayMonthYearDataList')) json = { result_code: '1', result_data: { '1': { p83022: [{ '2': '20000', time_stamp: '20260928' }] } } };
      if (path.endsWith('RealTimeData')) json = { result_code: '1', result_data: { device_point_list: [{ ps_id: 1, p83022: '31000' }] } };
      return { ok: true, status: 200, json: async () => json, text: async () => JSON.stringify(json) } as any;
    }));
    const r = await sungrowAdapter.fetchGeneration({ ...CONTA, site_id: '1' }, '2026-09-22', '2026-09-29');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.geracoes).toEqual([
      { data: '2026-09-28', geracao_kwh: 20 },
      { data: '2026-09-29', geracao_kwh: 31 },
    ]);
    const hist = calls.find((c) => c.path.endsWith('DayMonthYearDataList'));
    expect(hist.body.end_time).toBe('20260928');
  });

  it('tempo real falhou → hoje fica com o valor anterior e o adapter avisa', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-29T15:00:00Z'));
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      let json: any = { result_code: '0', result_msg: 'erro' };
      if (path.endsWith('refreshToken')) json = { result_code: '1', result_data: { access_token: 'AT', refresh_token: 'RT' } };
      if (path.endsWith('DayMonthYearDataList')) json = { result_code: '1', result_data: { '1': { p83022: [{ '2': '20000', time_stamp: '20260928' }] } } };
      return { ok: true, status: 200, json: async () => json, text: async () => JSON.stringify(json) } as any;
    }));
    const r = await sungrowAdapter.fetchGeneration({ ...CONTA, site_id: '1' }, '2026-09-22', '2026-09-29');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.geracoes.map((g) => g.data)).toEqual(['2026-09-28']);
    expect(r.falhaParcial).toMatch(/hoje/);
  });
});

describe('SolarEdge', () => {
  it('429 (limite diário) NÃO é repetido — cada repetição queima mais cota', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false, status: 429, json: async () => ({}), text: async () => 'Too Many Requests',
    });
    vi.stubGlobal('fetch', fetchMock);
    const r = await solarEdgeAdapter.fetchGeneration({ site_id: '1', api_key: 'K' }, '2026-09-22', '2026-09-29');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/^SolarEdge 429/);
  });
});
