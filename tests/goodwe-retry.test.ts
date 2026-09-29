// Blindagem contra tropeço PASSAGEIRO do servidor SEMS+ (GoodWe).
//
// Mesmo bug do NEP (09/07/2026): se o gateway da GoodWe devolve um 5xx por
// alguns minutos bem na hora do cron, sem retry a usina fica marcada com
// `ultimo_erro` até o ciclo seguinte, mesmo com a API deles já no ar.
//
// Estes testes travam o comportamento certo:
//   - 502 na chamada de dados → repete; se estabilizar, sucede.
//   - login recusado (senha) → NÃO é passageiro: falha na hora, sem repetir.
// Usa timers falsos pra não esperar o backoff de verdade.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { goodweAdapter, limparCachesGoodwe } from '../src/modules/monitoring/adapters/goodwe.js';
import { clearAllTokens } from '../src/modules/monitoring/util/token-cache.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  clearAllTokens();
  limparCachesGoodwe();
});

function resJson(status: number, jsonBody: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => jsonBody,
    text: async () => JSON.stringify(jsonBody),
  } as Response;
}

function res502(): Response {
  return {
    ok: false,
    status: 502,
    json: async () => ({}),
    text: async () => '<html><head><title>502 Bad Gateway</title></head></html>',
  } as Response;
}

const loginOk = {
  code: '00000',
  data: { uid: 'u1', timestamp: 1720000000000, token: 'tok-abc', client: 'semsPlusWeb', api: 'https://us-gateway.semsportal.com/web/sems' },
};

const CREDS = { email: 'a@b.com', password: 'x', site_id: 'ps-uuid-1' };

describe('goodweAdapter.fetchGeneration — retry em erro passageiro', () => {
  it('repete no 502 da chamada de dados e sucede quando a API volta', async () => {
    vi.useFakeTimers();
    let dataCalls = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string | URL) => {
      const u = String(url);
      if (u.includes('/auth/cross-login')) return Promise.resolve(resJson(200, loginOk));
      if (u.includes('stationPage')) {
        return Promise.resolve(resJson(200, { code: '00000', data: { dataList: [{ id: 'ps-uuid-1', status: 1 }], total: 1 } }));
      }
      dataCalls++;
      return Promise.resolve(dataCalls === 1
        ? res502()
        : resJson(200, { code: '00000', data: { proSystemTotalStats: 1.5 } }));
    }));

    const p = goodweAdapter.fetchGeneration(CREDS, '2026-07-08', '2026-07-08');
    await vi.runAllTimersAsync();
    const r = await p;

    expect(dataCalls).toBe(2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.geracoes).toEqual([{ data: '2026-07-08', geracao_kwh: 1.5 }]);
    expect(r.statusInversor).toBe('ok');
  });

  it('NÃO repete quando o login é recusado por senha', async () => {
    const fetchMock = vi.fn().mockResolvedValue(resJson(200, { code: 'A0210', description: 'senha errada' }));
    vi.stubGlobal('fetch', fetchMock);

    const r = await goodweAdapter.fetchGeneration(CREDS, '2026-07-08', '2026-07-08');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.invalidCredentials).toBe(true);
  });
});
