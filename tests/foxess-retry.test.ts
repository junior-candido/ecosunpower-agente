// Blindagem contra tropeço PASSAGEIRO do servidor da FoxESS (www.foxesscloud.com).
//
// Mesmo problema já resolvido no NEP: quando o servidor da marca dá um blip
// (502/503/rede) bem na hora do cron, a usina fica marcada com erro até o
// próximo ciclo. O adapter precisa RE-tentar erro passageiro e NUNCA repetir
// erro de credencial.
//
// Estes testes travam o comportamento certo:
//   - 502 na 1ª e 200 (json válido) na 2ª → repete e sucede (fetch 2×).
//   - errno de auth → NÃO é passageiro: falha na hora (fetch 1×), invalidCredentials.
//
// Usa timers falsos pra não esperar o backoff de verdade (igual tests/nep-retry).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { foxessAdapter } from '../src/modules/monitoring/adapters/foxess.js';

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

// Resposta 502 com corpo HTML de gateway (tropeço passageiro do servidor FoxESS).
function res502(): Response {
  return {
    ok: false,
    status: 502,
    json: async () => ({}),
    text: async () =>
      '<html>\r\n<head><title>502 Bad Gateway</title></head>\r\n<body>\r\n<center><h1>502 Bad Gateway</h1></center>\r\n</body>\r\n</html>',
  } as Response;
}

// Envelope de sucesso do report (dimension=month): errno 0 + result com a série
// de geração diária. Um valor → dia 01 do mês consultado.
const reportOk = {
  errno: 0,
  msg: 'success',
  result: [{ variable: 'generation', unit: 'kWh', values: [1.5] }],
};

// Credenciais válidas: apiKey + 1 micro (deviceSN). Sem erro de parse.
const CREDS = { apiKey: 'fake-api-key', deviceSNs: ['SN1'] };

describe('foxessAdapter.fetchGeneration — retry em erro passageiro', () => {
  it('repete no 502 e sucede quando a API volta a responder', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res502())                  // 1ª: tropeço da FoxESS
      .mockResolvedValueOnce(resJson(200, reportOk));   // 2ª: já voltou
    vi.stubGlobal('fetch', fetchMock);

    const p = foxessAdapter.fetchGeneration(CREDS, '2026-07-01', '2026-07-01');
    await vi.runAllTimersAsync(); // avança o backoff
    const r = await p;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.geracoes).toEqual([{ data: '2026-07-01', geracao_kwh: 1.5 }]);
  });

  it('NÃO repete em erro de credencial (errno de auth não é passageiro)', async () => {
    // errno 40256 = signature/token error → invalidCredentials, sem repetir.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(resJson(200, { errno: 40256, msg: 'signature error' }));
    vi.stubGlobal('fetch', fetchMock);

    const r = await foxessAdapter.fetchGeneration(CREDS, '2026-07-01', '2026-07-01');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.invalidCredentials).toBe(true);
  });
});
