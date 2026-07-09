// Blindagem contra tropeço PASSAGEIRO do servidor SEMS (GoodWe).
//
// Mesmo bug do NEP (09/07/2026): se o SEMS Portal (www.semsportal.com) devolve
// um 5xx por alguns minutos bem na hora do cron, sem retry a usina fica marcada
// com `ultimo_erro` até o ciclo seguinte, mesmo com a API deles já no ar.
//
// Estes testes travam o comportamento certo:
//   - 502 na chamada de dados → repete; se estabilizar, sucede.
//   - login falho (credencial) → NÃO é passageiro: falha na hora, sem repetir.
//
// O fluxo do GoodWe faz LOGIN (CrossLogin) antes da chamada de dados, então o
// mock roteia por URL: CrossLogin sempre responde, GetChartByPlant tropeça 1×.
// Usa timers falsos pra não esperar o backoff de verdade.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { goodweAdapter } from '../src/modules/monitoring/adapters/goodwe.js';
import { clearAllTokens } from '../src/modules/monitoring/util/token-cache.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  clearAllTokens();
});

function resJson(status: number, jsonBody: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => jsonBody,
    text: async () => JSON.stringify(jsonBody),
  } as Response;
}

// Resposta 502 com corpo HTML do nginx (tropeço passageiro do gateway).
function res502(): Response {
  return {
    ok: false,
    status: 502,
    json: async () => ({}),
    text: async () =>
      '<html>\r\n<head><title>502 Bad Gateway</title></head>\r\n<body>\r\n<center><h1>502 Bad Gateway</h1></center>\r\n<hr><center>nginx/1.24.0</center>\r\n</body>\r\n</html>',
  } as Response;
}

// CrossLogin OK → devolve uid/timestamp/token (o adapter monta o header a partir daí).
const loginOk = {
  hasError: false,
  code: 0,
  data: { uid: 'u1', timestamp: 1720000000000, token: 'tok-abc' },
};

// GetChartByPlant OK → linha PVGeneration (kWh) com 1 dia de leitura.
const chartOk = {
  hasError: false,
  code: 0,
  data: {
    lines: [
      { name: 'PVGeneration', unit: 'kWh', xy: [{ x: '2026-07-08', y: 1.5 }] },
    ],
  },
};

const CREDS = { email: 'a@b.com', password: 'x', site_id: 'ps-uuid-1' };

describe('goodweAdapter.fetchGeneration — retry em erro passageiro', () => {
  it('repete no 502 da chamada de dados e sucede quando a API volta', async () => {
    vi.useFakeTimers();
    let dataCalls = 0;
    const fetchMock = vi.fn().mockImplementation((url: string | URL) => {
      const u = String(url);
      if (u.includes('CrossLogin')) return Promise.resolve(resJson(200, loginOk));
      // GetChartByPlant: 1º tropeça (502), 2º já voltou (200)
      dataCalls++;
      return Promise.resolve(dataCalls === 1 ? res502() : resJson(200, chartOk));
    });
    vi.stubGlobal('fetch', fetchMock);

    const p = goodweAdapter.fetchGeneration(CREDS, '2026-07-08', '2026-07-08');
    await vi.runAllTimersAsync(); // avança o backoff
    const r = await p;

    // A chamada de dados repetiu (login 1× + dados 2×)
    expect(dataCalls).toBe(2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.geracoes).toEqual([{ data: '2026-07-08', geracao_kwh: 1.5 }]);
  });

  it('NÃO repete quando o login falha por credencial (hasError)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(resJson(200, { hasError: true, code: 100, msg: 'senha errada' }));
    vi.stubGlobal('fetch', fetchMock);

    const r = await goodweAdapter.fetchGeneration(CREDS, '2026-07-08', '2026-07-08');

    // Só a tentativa de login — credencial inválida não é passageiro, não repete.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.invalidCredentials).toBe(true);
  });
});
