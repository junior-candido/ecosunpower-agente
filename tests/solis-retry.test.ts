// Blindagem contra tropeço PASSAGEIRO do servidor da Solis (SolisCloud).
//
// Mesma ideia do nep-retry: um blip momentâneo do backend (502/503/504, 429 de
// rate limit, queda de rede) não pode mais derrubar a coleta da usina até o
// próximo ciclo do cron. O adapter deve repetir alguns instantes e, se
// estabilizar, suceder. Credencial inválida (401) NÃO é passageiro: falha na
// hora, sem repetir.
//
// Usa timers falsos pra não esperar o backoff (nem o acelerador de 1.1s) de
// verdade — molde igual ao tests/nep-retry.test.ts.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { solisAdapter } from '../src/modules/monitoring/adapters/solis.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function resJson(status: number, jsonBody: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => jsonBody,
    text: async () => JSON.stringify(jsonBody),
  } as Response;
}

// 502 com corpo HTML do nginx (o mesmo formato que os fabricantes devolvem).
function res502(): Response {
  return {
    ok: false,
    status: 502,
    json: async () => ({}),
    text: async () =>
      '<html>\r\n<head><title>502 Bad Gateway</title></head>\r\n<body>\r\n<center><h1>502 Bad Gateway</h1></center>\r\n</body>\r\n</html>',
  } as Response;
}

// 429 = rate limit agressivo da Solis (1 req/s). É transitório: vale repetir.
function res429(): Response {
  return {
    ok: false,
    status: 429,
    json: async () => ({}),
    text: async () => 'too many request 1 times in 1000 milliseconds',
  } as Response;
}

// Envelope de sucesso do stationMonth (code "0" = ok), com 1 dia de geração.
const stationMonthOk = {
  success: true,
  code: '0',
  msg: 'success',
  data: [{ dateStr: '2026-07-08', energy: 1.5, energyStr: 'kWh' }],
};

const CREDS = { keyId: 'fake-key', keySecret: 'fake-secret', site_id: 'ST_1' };

describe('solisAdapter.fetchGeneration — retry em erro passageiro', () => {
  it('repete no 502 e sucede quando a API volta a responder', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res502())                  // 1ª: tropeço da Solis
      .mockResolvedValueOnce(resJson(200, stationMonthOk)); // 2ª: já voltou
    vi.stubGlobal('fetch', fetchMock);

    const p = solisAdapter.fetchGeneration(CREDS, '2026-07-08', '2026-07-08');
    await vi.runAllTimersAsync(); // avança o acelerador + o backoff
    const r = await p;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.geracoes).toEqual([{ data: '2026-07-08', geracao_kwh: 1.5 }]);
  });

  it('NÃO repete no 401 (credencial inválida não é passageiro)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(resJson(401, {}));
    vi.stubGlobal('fetch', fetchMock);

    const r = await solisAdapter.fetchGeneration(CREDS, '2026-07-08', '2026-07-08');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.invalidCredentials).toBe(true);
  });

  it('repete no 429 (rate limit) e sucede quando a API libera', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res429())                  // 1ª: estourou o rate limit
      .mockResolvedValueOnce(resJson(200, stationMonthOk)); // 2ª: liberou
    vi.stubGlobal('fetch', fetchMock);

    const p = solisAdapter.fetchGeneration(CREDS, '2026-07-08', '2026-07-08');
    await vi.runAllTimersAsync();
    const r = await p;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.geracoes).toEqual([{ data: '2026-07-08', geracao_kwh: 1.5 }]);
  });
});
