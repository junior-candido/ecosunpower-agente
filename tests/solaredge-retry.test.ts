// Blindagem contra tropeço PASSAGEIRO do servidor da SolarEdge.
//
// Mesma ideia do nep-retry.test.ts: um blip de 5xx/rede na hora do cron não
// pode marcar a usina com erro até o ciclo seguinte. Um 502 momentâneo deve
// ser re-tentado; um 401 (credencial) NÃO — falha na hora, sem repetir.
//
// Usa timers falsos pra não esperar o backoff de verdade.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { solarEdgeAdapter } from '../src/modules/monitoring/adapters/solaredge.js';

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

// Resposta 502 com corpo HTML do gateway (tropeço passageiro).
function res502(): Response {
  return {
    ok: false,
    status: 502,
    json: async () => ({}),
    text: async () => '<html><head><title>502 Bad Gateway</title></head></html>',
  } as Response;
}

// Resposta válida de energy da SolarEdge: 25600 Wh → 25.6 kWh.
const energyOk = {
  energy: {
    timeUnit: 'DAY',
    unit: 'Wh',
    values: [{ date: '2026-05-01 00:00:00', value: 25600 }],
  },
};

const CREDS = { site_id: '1234567', api_key: 'ABC123' };

describe('solarEdgeAdapter.fetchGeneration — retry em erro passageiro', () => {
  it('repete no 502 e sucede quando a API volta a responder', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res502())                 // 1ª: tropeço da SolarEdge
      .mockResolvedValueOnce(resJson(200, energyOk));  // 2ª: já voltou
    vi.stubGlobal('fetch', fetchMock);

    const p = solarEdgeAdapter.fetchGeneration(CREDS, '2026-05-01', '2026-05-01');
    await vi.runAllTimersAsync(); // avança o backoff
    const r = await p;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.geracoes).toEqual([{ data: '2026-05-01', geracao_kwh: 25.6 }]);
  });

  it('NÃO repete no 401 (credencial inválida não é passageiro)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(resJson(401, {}));
    vi.stubGlobal('fetch', fetchMock);

    const r = await solarEdgeAdapter.fetchGeneration(CREDS, '2026-05-01', '2026-05-01');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.invalidCredentials).toBe(true);
  });
});
