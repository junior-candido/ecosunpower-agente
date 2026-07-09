// Blindagem contra tropeço PASSAGEIRO do servidor da ABB / FIMER Aurora Vision.
//
// Mesmo problema do NEP (ver tests/nep-retry.test.ts): um blip de 502/503/504
// no backend da Aurora Vision bem na hora do cron deixava a usina no vermelho
// até o ciclo seguinte, mesmo com a API deles já no ar.
//
// Estes testes travam o comportamento certo:
//   - 502 na chamada de DADOS → repete; se a API volta, sucede.
//   - 401 (credencial) → NÃO é passageiro: falha na hora, sem repetir.
//
// A ABB faz GET /authenticate ANTES da chamada de dados, então o mock reflete
// os dois passos: authenticate 200 (result=token), depois os dados.
// Usa timers falsos pra não esperar o backoff de verdade.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { abbAdapter } from '../src/modules/monitoring/adapters/abb.js';
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

// Resposta 502 com corpo HTML do nginx (igual ao que os fabricantes devolvem).
function res502(): Response {
  return {
    ok: false,
    status: 502,
    json: async () => ({}),
    text: async () =>
      '<html>\r\n<head><title>502 Bad Gateway</title></head>\r\n<body>\r\n<center><h1>502 Bad Gateway</h1></center>\r\n<hr><center>nginx/1.24.0</center>\r\n</body>\r\n</html>',
  } as Response;
}

// Resposta de /authenticate: { result: "<TOKEN>" }
const authOk = { result: 'TOKEN-ABB' };

// Resposta de /dailyProduction: { result: { plantEntityID, dailyProduction: [...] } }
const dailyOk = {
  result: {
    plantEntityID: 'P1',
    dailyProduction: [{ timestamp: '2026-07-08', value: 5.5 }],
  },
};

// Resposta de /status: { result: { plantStatus, plantState } }
const statusOk = { result: { plantStatus: 'NORM', plantState: 'ACTIVE' } };

const CREDS = { userId: 'u@b.com', password: 'x', apiKey: 'k', plantEntityID: 'P1' };

describe('abbAdapter.fetchGeneration — retry em erro passageiro', () => {
  it('repete no 502 da chamada de dados e sucede quando a API volta', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(resJson(200, authOk)) // 1) /authenticate ok
      .mockResolvedValueOnce(res502())             // 2) dados: tropeço da ABB
      .mockResolvedValueOnce(resJson(200, dailyOk)) // 3) dados: já voltou
      .mockResolvedValueOnce(resJson(200, statusOk)); // 4) /status
    vi.stubGlobal('fetch', fetchMock);

    const p = abbAdapter.fetchGeneration(CREDS, '2026-07-08', '2026-07-08');
    await vi.runAllTimersAsync(); // avança o backoff
    const r = await p;

    // authenticate(1) + dados 502(1) + dados 200(1) + status(1) = 4 → repetiu os dados
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.geracoes).toEqual([{ data: '2026-07-08', geracao_kwh: 5.5 }]);
  });

  it('NÃO repete no 401 (credencial inválida não é passageiro)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(resJson(401, {}));
    vi.stubGlobal('fetch', fetchMock);

    const r = await abbAdapter.fetchGeneration(CREDS, '2026-07-08', '2026-07-08');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.invalidCredentials).toBe(true);
  });
});
