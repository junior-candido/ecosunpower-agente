// Adapter Deye Cloud Developer.
// Doc oficial: developer.deyecloud.com (login required)
//
// Base URL VARIA por região: <region>1-developer.deyecloud.com
//   - us1: Americas (incluindo Brasil — default)
//   - eu1: Europa
//   - (AMEA mostra no portal mas usa endpoint padrao us1/eu1 conforme aprovado)
//
// API version: v2.2 (paths versionados como /v1.0/...)
//
// Auth flow:
//   - Junior cria App no portal Deye (já tem: AppId + AppSecret).
//   - POST /v1.0/account/token com appId+appSecret+email+password (SHA-256!).
//   - Token expira em ~30 dias.
//
// Body do token (descoberto via doc oficial):
//   {
//     "appSecret": "...",
//     "email": "...",
//     "password": "<SHA-256 hex do password>",
//     "countryCode": "55" (Brasil),
//     "identity_type": 1 (1=email, 2=mobile, 3=username)
//   }
//
// Credenciais esperadas no api_credentials JSONB:
//   { appId, appSecret, email, password, dataCenter?, countryCode? }
//   dataCenter default 'us1' (cobre Brasil)
//   countryCode default '55' (Brasil)
//
// Endpoints usados:
//   POST /v1.0/account/token   — obter access_token
//   POST /v1.0/station/list    — listar plantas da conta
//   POST /v1.0/station/history — histórico de geração da planta

import crypto from 'crypto';
import type { AdapterResult, ListSitesResult, MonitoringAdapter } from '../types.js';

function baseUrl(creds: ParsedCreds): string {
  return `https://${creds.dataCenter}-developer.deyecloud.com`;
}

// ============================================================================
// AUTH
// ============================================================================

interface DeyeCredenciais {
  appId?: unknown;
  appSecret?: unknown;
  email?: unknown;
  password?: unknown;
  dataCenter?: unknown;
  // Cache de token (preenchido após primeira chamada — não persiste no banco
  // por enquanto; cada chamada gera novo token. Otimizar depois com Redis.)
  access_token?: unknown;
  token_expires_at?: unknown;
}

interface ParsedCreds {
  appId: string;
  appSecret: string;
  email: string;
  password: string;
  dataCenter: string;
  countryCode: string;
}

function parseCreds(c: Record<string, unknown>): ParsedCreds | { error: string } {
  const cc = c as DeyeCredenciais & { countryCode?: unknown };
  const appId = String(cc.appId ?? '').trim();
  const appSecret = String(cc.appSecret ?? '').trim();
  const email = String(cc.email ?? '').trim();
  const password = String(cc.password ?? '').trim();
  // Default 'us1' — Americas/Brasil. Junior pode escolher 'eu1' se for Europa.
  let dataCenter = String(cc.dataCenter ?? 'us1').trim().toLowerCase();
  if (!['us1', 'eu1'].includes(dataCenter)) dataCenter = 'us1';
  // Default Brasil. Junior pode mudar pelo form.
  const countryCode = String(cc.countryCode ?? '55').trim() || '55';

  if (!appId || !appSecret) {
    return { error: 'Faltam appId/appSecret (cadastre no portal Deye)' };
  }
  if (!email || !password) {
    return { error: 'Faltam email/password da conta Deye master' };
  }
  return { appId, appSecret, email, password, dataCenter, countryCode };
}

async function obterToken(creds: ParsedCreds): Promise<{ ok: true; token: string } | { ok: false; reason: string; invalidCredentials?: boolean }> {
  const base = baseUrl(creds);
  const url = `${base}/v1.0/account/token?appId=${encodeURIComponent(creds.appId)}`;

  // Deye exige password como hash SHA-256 (descoberto via doc oficial).
  // countryCode em formato numerico ("55" Brasil, "1" US, "86" China, etc).
  // identity_type removido — exemplo na doc nao tinha esse campo, e adicionar
  // como number causa "invalid param type". Inferido pelo proprio campo
  // enviado (email vs mobile vs username).
  const passwordHash = crypto.createHash('sha256').update(creds.password).digest('hex');
  const body = {
    appSecret: creds.appSecret,
    email: creds.email,
    password: passwordHash,
    countryCode: creds.countryCode,
  };

  let resp: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Deye doc lista 'host' como header obrigatorio. fetch ja seta
          // 'Host' automaticamente baseado na URL, mas garantimos explicito
          // pra cobrir validacao em minusculas.
          'host': new URL(base).host,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    return { ok: false, reason: `network: ${(err as Error).message}` };
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    return { ok: false, reason: `Deye token ${resp.status}: ${body.slice(0, 200)}` };
  }

  let json: { access_token?: string; Bearer?: string; id?: string; success?: boolean; msg?: string; code?: string };
  try {
    json = (await resp.json()) as typeof json;
  } catch (err) {
    return { ok: false, reason: `Deye token JSON: ${(err as Error).message}` };
  }

  // Deye retorna {success: true, Bearer: "..." OR access_token: "...", ...}
  // ou {success: false, code: "...", msg: "..."}
  if (json.success === false) {
    const isAuth = /password|credential|token|secret|account|invalid/i.test(json.msg ?? '');
    return {
      ok: false,
      reason: `Deye: ${json.msg ?? json.code ?? 'erro desconhecido'}`,
      invalidCredentials: isAuth,
    };
  }
  // A doc Deye mostra response com campo "Bearer" (capitalizado);
  // tambem aceitamos access_token e id por seguranca.
  const token = json.Bearer ?? json.access_token ?? json.id;
  if (!token) {
    return { ok: false, reason: 'Deye nao retornou token (Bearer/access_token)' };
  }
  return { ok: true, token };
}

// ============================================================================
// HELPERS
// ============================================================================

async function deyePost(
  baseUrlStr: string,
  endpoint: string,
  token: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; data: any } | { ok: false; reason: string; status?: number }> {
  const url = `${baseUrlStr}${endpoint}`;
  let resp: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    return { ok: false, reason: `network: ${(err as Error).message}` };
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    return { ok: false, reason: `Deye ${endpoint} ${resp.status}: ${text.slice(0, 200)}`, status: resp.status };
  }

  let json: any;
  try {
    json = await resp.json();
  } catch (err) {
    return { ok: false, reason: `JSON inválido: ${(err as Error).message}` };
  }

  if (json && json.success === false) {
    return { ok: false, reason: `Deye: ${json.msg ?? json.code ?? 'erro'}` };
  }

  return { ok: true, data: json };
}

// ============================================================================
// ADAPTER
// ============================================================================

export const deyeAdapter: MonitoringAdapter = {
  marca: 'deye',

  async fetchGeneration(
    credenciais: Record<string, unknown>,
    dataInicio: string,
    dataFim: string,
  ): Promise<AdapterResult> {
    const parsed = parseCreds(credenciais);
    if ('error' in parsed) {
      return { ok: false, reason: parsed.error, invalidCredentials: true };
    }

    // Auth
    const tokenResp = await obterToken(parsed);
    if (!tokenResp.ok) {
      return { ok: false, reason: tokenResp.reason, invalidCredentials: tokenResp.invalidCredentials };
    }

    // stationId está nas creds (importado por listSites)
    const stationId = (credenciais as { stationId?: unknown }).stationId;
    if (!stationId) {
      return { ok: false, reason: 'stationId não cadastrado nas credenciais — importe via /importar' };
    }

    // POST /v1.0/station/history
    // Body: { stationId, startAt: "YYYY-MM-DD", endAt: "YYYY-MM-DD", timeType: "DAY" }
    const result = await deyePost(baseUrl(parsed), '/v1.0/station/history', tokenResp.token, {
      stationId: Number(stationId),
      startAt: dataInicio,
      endAt: dataFim,
      timeType: 'DAY',
    });

    if (!result.ok) {
      return { ok: false, reason: result.reason };
    }

    // Resposta esperada (padrão Deye/SolarMan):
    //   { stationDataItems: [{ date: "YYYY-MM-DD", generationValue: <kWh> }, ...] }
    // Variações possíveis: dataList, items
    const items =
      (result.data?.stationDataItems as { date?: string; generationValue?: number }[]) ??
      (result.data?.dataList as { date?: string; generationValue?: number }[]) ??
      (result.data?.items as { date?: string; generationValue?: number }[]) ??
      [];

    const geracoes = items
      .filter((it) => typeof it.date === 'string' && typeof it.generationValue === 'number')
      .map((it) => ({
        data: it.date!.slice(0, 10),
        geracao_kwh: Math.max(0, Number(it.generationValue ?? 0)),
      }));

    return { ok: true, geracoes };
  },

  // Lista todas as plantas da conta Deye master.
  // Endpoint: POST /v1.0/station/list
  // Body: { page: 1, size: 100 }
  async listSites(credenciaisConta: Record<string, unknown>): Promise<ListSitesResult> {
    const parsed = parseCreds(credenciaisConta);
    if ('error' in parsed) {
      return { ok: false, reason: parsed.error, invalidCredentials: true };
    }

    const tokenResp = await obterToken(parsed);
    if (!tokenResp.ok) {
      return { ok: false, reason: tokenResp.reason, invalidCredentials: tokenResp.invalidCredentials };
    }

    const result = await deyePost(baseUrl(parsed), '/v1.0/station/list', tokenResp.token, {
      page: 1,
      size: 100,
    });

    if (!result.ok) {
      return { ok: false, reason: result.reason };
    }

    // Resposta (estrutura comum Deye/SolarMan):
    //   { stationList: [{ id, name, locationLat, locationLng, installedCapacity,
    //     installationDate, regionNationName, address, ... }] }
    const stationList =
      (result.data?.stationList as Array<Record<string, unknown>>) ??
      (result.data?.dataList as Array<Record<string, unknown>>) ??
      (result.data?.list as Array<Record<string, unknown>>) ??
      [];

    const sites = stationList.flatMap((st) => {
      const id = st.id !== undefined ? String(st.id) : null;
      const apelido = String(st.name ?? '').trim();
      if (!id || !apelido) return [];

      // installedCapacity vem em kWp (típico Deye/SolarMan)
      const potencia_kwp = typeof st.installedCapacity === 'number' && Number.isFinite(st.installedCapacity)
        ? st.installedCapacity
        : null;

      // Localização: tenta address ou regionNationName
      const cidade = typeof st.regionCityName === 'string' && st.regionCityName.trim()
        ? st.regionCityName.trim()
        : (typeof st.address === 'string' && st.address.trim() ? st.address.trim().split(',')[0] : null);

      const data_instalacao =
        typeof st.installationDate === 'string' ? st.installationDate.slice(0, 10) :
        typeof st.gridConnectionDate === 'string' ? st.gridConnectionDate.slice(0, 10) :
        null;

      return [{
        externalId: id,
        apelido,
        potencia_kwp,
        cidade,
        uf: null, // Deye não retorna UF brasileira separado
        data_instalacao,
        // Credenciais que ficam por planta (incluem stationId pra fetchGeneration)
        credenciais: {
          appId: parsed.appId,
          appSecret: parsed.appSecret,
          email: parsed.email,
          password: parsed.password,
          stationId: id,
        },
      }];
    });

    return { ok: true, sites };
  },
};
