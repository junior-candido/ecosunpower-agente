// Blindagem contra tropeço PASSAGEIRO do servidor da Deye (mesmo bug da NEP,
// ver tests/nep-retry.test.ts). O portal Deye (developer.deyecloud.com) pode
// dar 502/503/rede por alguns minutos bem na hora do cron. Sem retry, a planta
// fica marcada com erro até o ciclo seguinte, mesmo com a API já no ar.
//
// Estes testes travam o comportamento certo:
//   - 502 na chamada de DADOS → repete e, se estabilizar, sucede.
//   - 401 (credencial) → NÃO é passageiro: a camada de dados não fica repetindo.
//
// Usa timers falsos pra não esperar o backoff de verdade (igual nep-retry).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { deyeAdapter } from '../src/modules/monitoring/adapters/deye.js';
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

const tokenOk = { success: true, code: '1000000', accessToken: 'Bearer eyJfake.token.deye' };
const historyOk = {
  success: true,
  code: '1000000',
  stationDataItems: [{ dateTime: '2026-07-08', generationValue: 1.5 }],
};

// companyId nas credenciais faz o resolverToken emitir DIRETO o token org-scoped
// (pula o /account/info), deixando a sequência de fetch limpa: token -> dados.
// Assim o teste isola a camada de dados (deyePost) do fluxo Business Member.
function credsFor(email: string) {
  return {
    appId: 'app1',
    appSecret: 'sec1',
    email,
    password: 'x',
    dataCenter: 'us1',
    site_id: '12345',
    companyId: '2912',
  };
}

describe('deyeAdapter.fetchGeneration — retry em erro passageiro', () => {
  it('repete no 502 da chamada de dados e sucede quando a Deye volta a responder', async () => {
    vi.useFakeTimers();
    let dataCalls = 0;
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes('/v1.0/account/token')) return resJson(200, tokenOk); // token OK antes dos dados
      if (u.includes('/v1.0/station/history')) {
        dataCalls++;
        return dataCalls === 1 ? resJson(502, {}) : resJson(200, historyOk); // 1º tropeça, 2º volta
      }
      throw new Error(`URL inesperada no mock: ${u}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const p = deyeAdapter.fetchGeneration(credsFor('retry502@x.com'), '2026-07-08', '2026-07-08');
    await vi.runAllTimersAsync(); // avança o backoff
    const r = await p;

    expect(dataCalls).toBe(2); // 1× 502 + 1× re-tentativa 200
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.geracoes).toEqual([{ data: '2026-07-08', geracao_kwh: 1.5 }]);
  });

  it('NÃO repete na camada de dados quando dá 401 (credencial não é passageiro)', async () => {
    let dataCalls = 0;
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes('/v1.0/account/token')) return resJson(200, tokenOk);
      if (u.includes('/v1.0/station/history')) {
        dataCalls++;
        return resJson(401, { success: false, msg: 'access Denied' });
      }
      throw new Error(`URL inesperada no mock: ${u}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const r = await deyeAdapter.fetchGeneration(credsFor('nao-repete401@x.com'), '2026-07-08', '2026-07-08');

    // 2 = 1ª tentativa + 1 re-emissão de token (auto-cura de auth JÁ existente,
    // ver deye-business-member.test.ts). NÃO é 3/6: o retryTransient não trata
    // 401 como passageiro, então a camada de dados não fica repetindo.
    expect(dataCalls).toBe(2);
    expect(r.ok).toBe(false);
  });
});
