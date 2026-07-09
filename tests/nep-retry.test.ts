// Blindagem contra tropeço PASSAGEIRO do servidor da NEP.
//
// Bug real (09/07/2026): o servidor da NEP (api.nepviewer.net) devolveu 502 Bad
// Gateway por alguns minutos bem na hora do cron diário. Como o adapter não
// tentava de novo, as 25 usinas NEP ficaram marcadas com `ultimo_erro` até o
// ciclo seguinte (~24h depois), mesmo com a API deles já no ar.
//
// Estes testes travam o comportamento certo:
//   - 502 (e outros 5xx/rede) → repete algumas vezes; se estabilizar, sucede.
//   - 401 (credencial) → NÃO é passageiro: falha na hora, sem repetir.
//
// Usa timers falsos pra não esperar o backoff de verdade.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { nepAdapter } from '../src/modules/monitoring/adapters/nep.js';
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

// Resposta 502 com corpo HTML do nginx (exatamente o que a NEP devolveu).
function res502(): Response {
  return {
    ok: false,
    status: 502,
    json: async () => ({}),
    text: async () =>
      '<html>\r\n<head><title>502 Bad Gateway</title></head>\r\n<body>\r\n<center><h1>502 Bad Gateway</h1></center>\r\n<hr><center>nginx/1.24.0</center>\r\n</body>\r\n</html>',
  } as Response;
}

const echartsOk = {
  code: 200,
  msg: 'ok',
  data: {
    legend: ['SN1'],
    xAxisData: ['08/07'],
    series: [{ name: 'SN1', data: [1.5] }],
  },
};

const CREDS = { jwt: 'fake-jwt', site_id: 'BR_1' };

describe('nepAdapter.fetchGeneration — retry em erro passageiro', () => {
  it('repete no 502 e sucede quando a API volta a responder', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res502())        // 1ª: tropeço da NEP
      .mockResolvedValueOnce(resJson(200, echartsOk)); // 2ª: já voltou
    vi.stubGlobal('fetch', fetchMock);

    const p = nepAdapter.fetchGeneration(CREDS, '2026-07-08', '2026-07-08');
    await vi.runAllTimersAsync(); // avança o backoff
    const r = await p;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.geracoes).toEqual([{ data: '2026-07-08', geracao_kwh: 1.5 }]);
  });

  it('desiste depois de esgotar as tentativas se a NEP continua em 502', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(res502());
    vi.stubGlobal('fetch', fetchMock);

    const p = nepAdapter.fetchGeneration(CREDS, '2026-07-08', '2026-07-08');
    await vi.runAllTimersAsync();
    const r = await p;

    // 1 execução + 2 re-tentativas = 3
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain('502');
  });

  it('NÃO repete no 401 (credencial inválida não é passageiro)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(resJson(401, {}));
    vi.stubGlobal('fetch', fetchMock);

    const r = await nepAdapter.fetchGeneration(CREDS, '2026-07-08', '2026-07-08');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.invalidCredentials).toBe(true);
  });

  // Modo login (email+senha, renova o JWT sozinho): o 502 pode bater no próprio
  // sign-in. Sem retry aqui, a conta inteira caía. Deve repetir e seguir.
  it('repete no 502 durante o login (sign-in) e segue o fluxo', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res502())                                   // sign-in tropeça
      .mockResolvedValueOnce(resJson(200, { code: 200, msg: 'ok', data: { token: 'eyJabc.def.ghi' } })) // sign-in volta
      .mockResolvedValueOnce(resJson(200, echartsOk));                   // dados
    vi.stubGlobal('fetch', fetchMock);

    const p = nepAdapter.fetchGeneration(
      { email: 'a@b.com', password: 'x', site_id: 'BR_1' },
      '2026-07-08',
      '2026-07-08',
    );
    await vi.runAllTimersAsync();
    const r = await p;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(r.ok).toBe(true);
  });
});
