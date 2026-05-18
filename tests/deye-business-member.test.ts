// Guarda do fix root-cause Deye: o adapter DEVE rodar o fluxo Business Member
// documentado (token pessoal -> /account/info pega companyId -> re-emite token
// org-scoped) pra ler plantas da organização. Sem isso, as 22 plantas da
// Ecosunpower dão 403 (organizationId:0). Diagnóstico que provou em prod:
// scripts/deye-diag-orginfo.ts (companyId 2912, station 166879 -> 200).
//
// Cada teste usa um e-mail de conta DISTINTO de propósito: o cache de token é
// module-level (chave = dataCenter|appId|email), então e-mails únicos isolam
// os testes sem precisar de API de reset só-pra-teste na produção.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { deyeAdapter } from '../src/modules/monitoring/adapters/deye.js';

function res(status: number, jsonBody: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => jsonBody,
    text: async () => JSON.stringify(jsonBody),
  } as Response;
}

const ORG = [{ companyId: 2912, companyName: 'Ecosunpower Energia Solar', roleName: '超级管理员' }];

function credsFor(email: string, siteId = '166879') {
  return {
    appId: '202601151929002',
    appSecret: 'app-secret',
    email,
    password: 'plain-pw',
    dataCenter: 'us1',
    site_id: siteId,
  };
}

// fetch que roteia token (pessoal vs org), /account/info e /station/history.
// history só responde 200 com Bearer ORG-TOKEN (espelha o 403 real da Deye
// quando o token é pessoal numa planta empresarial), salvo overrides.
function routedFetch(opts: {
  orgList: unknown[];
  personalHistoryOk?: boolean;
  generationValue?: number;
}) {
  return vi.fn(async (url: string, init: any) => {
    const u = String(url);
    const body = init?.body ? JSON.parse(init.body) : {};
    if (u.includes('/v1.0/account/token')) {
      return res(200, {
        success: true, code: '1000000', tokenType: 'bearer', expiresIn: '5183999',
        accessToken: body.companyId ? 'ORG-TOKEN' : 'PERSONAL-TOKEN',
      });
    }
    if (u.includes('/v1.0/account/info')) {
      return res(200, { success: true, code: '1000000', orgInfoList: opts.orgList });
    }
    if (u.includes('/v1.0/station/history')) {
      const auth = init.headers.Authorization ?? init.headers.authorization;
      const allowed = auth === 'Bearer ORG-TOKEN' || (opts.personalHistoryOk && auth === 'Bearer PERSONAL-TOKEN');
      if (allowed) {
        return res(200, {
          success: true, code: '1000000', total: 1,
          stationDataItems: [{ year: 2026, month: 5, day: 6, generationValue: opts.generationValue ?? 28.1 }],
        });
      }
      return res(403, { success: false, code: '2101023', msg: 'access Denied' });
    }
    throw new Error(`URL inesperada no mock: ${u}`);
  });
}

afterEach(() => vi.restoreAllMocks());

describe('Deye adapter — fluxo Business Member', () => {
  it('descobre companyId via /account/info e lê planta EMPRESARIAL (que com token pessoal dá 403)', async () => {
    const fetchMock = routedFetch({ orgList: ORG });
    global.fetch = fetchMock as any;

    const r = await deyeAdapter.fetchGeneration(credsFor('biz-flow@org.com'), '2026-05-05', '2026-05-07');

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.geracoes).toEqual([{ data: '2026-05-06', geracao_kwh: 28.1 }]);

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/v1.0/account/info'))).toBe(true);
    const pediuTokenComCompany = fetchMock.mock.calls.some((c) => {
      const u = String(c[0]);
      const b = (c[1] as any)?.body ? JSON.parse((c[1] as any).body) : {};
      return u.includes('/v1.0/account/token') && b.companyId === 2912;
    });
    expect(pediuTokenComCompany).toBe(true);
  });

  it('zero-regressão: conta SEM organização (planta pessoal) continua lendo com token pessoal', async () => {
    const fetchMock = routedFetch({ orgList: [], personalHistoryOk: true, generationValue: 12.5 });
    global.fetch = fetchMock as any;

    const r = await deyeAdapter.fetchGeneration(
      credsFor('personal-only@x.com', '11206'), '2026-05-05', '2026-05-07',
    );

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.geracoes).toEqual([{ data: '2026-05-06', geracao_kwh: 12.5 }]);
  });

  it('cacheia o token org-scoped por conta: 2 chamadas NÃO refazem login/account-info', async () => {
    const fetchMock = routedFetch({ orgList: ORG });
    global.fetch = fetchMock as any;

    const email = 'cache-acct@org.com';
    // Duas plantas da MESMA conta (org token vale pra conta inteira).
    const r1 = await deyeAdapter.fetchGeneration(credsFor(email, '166879'), '2026-05-05', '2026-05-07');
    const r2 = await deyeAdapter.fetchGeneration(credsFor(email, '175128'), '2026-05-05', '2026-05-07');

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);

    const accountInfoCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/v1.0/account/info')).length;
    const tokenCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/v1.0/account/token')).length;
    // Sem cache seria 2x: 2 account/info + 4 token. Com cache: 1 + 2.
    expect(accountInfoCalls).toBe(1);
    expect(tokenCalls).toBe(2);
  });

  it('auto-cura: token cacheado revogado (403 no /history) é invalidado e re-emitido na mesma chamada', async () => {
    let orgIssued = 0;
    const fetchMock = vi.fn(async (url: string, init: any) => {
      const u = String(url);
      const body = init?.body ? JSON.parse(init.body) : {};
      if (u.includes('/v1.0/account/token')) {
        if (body.companyId) { orgIssued += 1; return res(200, { success: true, code: '1000000', accessToken: `ORG-${orgIssued}` }); }
        return res(200, { success: true, code: '1000000', accessToken: 'PERSONAL-TOKEN' });
      }
      if (u.includes('/v1.0/account/info')) return res(200, { success: true, code: '1000000', orgInfoList: ORG });
      if (u.includes('/v1.0/station/history')) {
        const auth = init.headers.Authorization ?? init.headers.authorization;
        // Só o SEGUNDO token org (ORG-2) é aceito — simula o 1º revogado.
        if (auth === 'Bearer ORG-2') {
          return res(200, { success: true, code: '1000000', total: 1, stationDataItems: [{ year: 2026, month: 5, day: 6, generationValue: 28.1 }] });
        }
        return res(403, { success: false, code: '2101023', msg: 'access Denied' });
      }
      throw new Error(`URL inesperada no mock: ${u}`);
    });
    global.fetch = fetchMock as any;

    const r = await deyeAdapter.fetchGeneration(credsFor('selfheal@org.com'), '2026-05-05', '2026-05-07');

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.geracoes).toEqual([{ data: '2026-05-06', geracao_kwh: 28.1 }]);
    // Provou auto-cura: dois tokens org emitidos (1 revogado + 1 fresco) na MESMA chamada.
    expect(orgIssued).toBe(2);
  });

  it('override: companyId explícito nas credenciais NÃO chama /account/info', async () => {
    const fetchMock = routedFetch({ orgList: ORG });
    global.fetch = fetchMock as any;

    const r = await deyeAdapter.fetchGeneration(
      { ...credsFor('override@org.com'), companyId: '2912' }, '2026-05-05', '2026-05-07',
    );

    expect(r.ok).toBe(true);
    const chamouAccountInfo = fetchMock.mock.calls.some((c) => String(c[0]).includes('/v1.0/account/info'));
    expect(chamouAccountInfo).toBe(false);
  });

  it('zero-regressão: /account/info falhando (blip transitório) cai pro token pessoal e ainda lê', async () => {
    const fetchMock = vi.fn(async (url: string, init: any) => {
      const u = String(url);
      if (u.includes('/v1.0/account/token')) return res(200, { success: true, code: '1000000', accessToken: 'PERSONAL-TOKEN' });
      if (u.includes('/v1.0/account/info')) return res(500, { success: false, msg: 'internal error' });
      if (u.includes('/v1.0/station/history')) {
        return res(200, { success: true, code: '1000000', total: 1, stationDataItems: [{ year: 2026, month: 5, day: 6, generationValue: 9.9 }] });
      }
      throw new Error(`URL inesperada no mock: ${u}`);
    });
    global.fetch = fetchMock as any;

    const r = await deyeAdapter.fetchGeneration(credsFor('infoblip@x.com'), '2026-05-05', '2026-05-07');

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.geracoes).toEqual([{ data: '2026-05-06', geracao_kwh: 9.9 }]);
  });
});
