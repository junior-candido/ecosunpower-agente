// Blindagem contra tropeço PASSAGEIRO do servidor da Sungrow (iSolarCloud).
//
// Mesmo bug de classe do NEP (09/07/2026): um 502/503/504 momentâneo do gateway
// da Sungrow marcava a usina com `ultimo_erro` até o próximo ciclo do cron. O
// retry entra na camada `rawPostOnce` (abaixo do refresh de token do authPost):
//   - 502 → repete; se estabilizar, sucede.
//   - 401 (credencial) → NÃO é passageiro: falha na hora, sem repetir.
//
// Usa timers falsos pra não esperar o backoff de verdade.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { sungrowAdapter } from '../src/modules/monitoring/adapters/sungrow.js';
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

// Envelope de sucesso da Sungrow (result_code === '1').
function envelope(result_data: unknown): Response {
  return resJson(200, { result_code: '1', result_msg: 'success', result_data });
}

// Resposta 502 com corpo HTML de gateway (o que o server da marca devolve num blip).
function res502(): Response {
  return {
    ok: false,
    status: 502,
    json: async () => ({}),
    text: async () => '<html><head><title>502 Bad Gateway</title></head><body>502</body></html>',
  } as Response;
}

// result_data do endpoint de token (refresh/exchange): { access_token, refresh_token }.
const REFRESH_OK = { access_token: 'AT-fake', refresh_token: 'RT0' };

// result_data de getPowerStationPointDayMonthYearDataList → p83022 por dia (Wh).
const SERIE_OK = { '999': { p83022: [{ '2': '12345', time_stamp: '20200101' }] } };

// refreshToken igual ao devolvido (RT0) → não dispara persistência (rota == atual).
const CREDS = {
  appkey: 'AK',
  accessKey: 'SECRET',
  appId: 'APPID',
  redirectUri: 'https://ex.com/cb',
  refreshToken: 'RT0',
  site_id: '999',
};

// Data no passado → fetchGeneration faz 1 única chamada de dados (sem tempo real
// de hoje, 1 só janela de 90 dias).
const DIA_PASSADO = '2020-01-01';

// Aquece o cache do token (1 refresh OK) pra que a chamada de dados seguinte não
// precise refrescar — assim o teste de retry conta só os fetches de dados.
async function aquecerToken(): Promise<void> {
  const warm = vi
    .fn()
    .mockResolvedValueOnce(envelope(REFRESH_OK)) // refreshToken
    .mockResolvedValueOnce(envelope(SERIE_OK));  // chamada de dados
  vi.stubGlobal('fetch', warm);
  await sungrowAdapter.fetchGeneration(CREDS, DIA_PASSADO, DIA_PASSADO);
}

describe('sungrowAdapter — retry em erro passageiro', () => {
  it('repete no 502 e sucede quando a API volta a responder', async () => {
    await aquecerToken(); // token já em cache (real timers)

    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res502())        // 1ª: tropeço da Sungrow
      .mockResolvedValueOnce(envelope(SERIE_OK)); // 2ª: já voltou
    vi.stubGlobal('fetch', fetchMock);

    const p = sungrowAdapter.fetchGeneration(CREDS, DIA_PASSADO, DIA_PASSADO);
    await vi.runAllTimersAsync(); // avança o backoff
    const r = await p;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r.ok).toBe(true);
  });

  it('NÃO repete no 401 (credencial inválida não é passageiro)', async () => {
    // Sem aquecer: o 401 bate no próprio refresh de token → falha na hora, 1 fetch.
    const fetchMock = vi.fn().mockResolvedValue(resJson(401, {}));
    vi.stubGlobal('fetch', fetchMock);

    const r = await sungrowAdapter.fetchGeneration(CREDS, DIA_PASSADO, DIA_PASSADO);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.invalidCredentials).toBe(true);
  });
});
