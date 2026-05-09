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
  // Body minimo: appSecret + email + password. Outros campos (countryCode,
  // companyId, mobile, username) sao opcionais — adicionar so causou erros.
  // identity_type tambem nao funciona como number — eh inferido pelo campo
  // de identidade enviado (email).
  const passwordHash = crypto.createHash('sha256').update(creds.password).digest('hex');
  const body = {
    appSecret: creds.appSecret,
    email: creds.email,
    password: passwordHash,
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

  let json: { accessToken?: string; access_token?: string; Bearer?: string; success?: boolean; msg?: string; code?: string };
  try {
    json = (await resp.json()) as typeof json;
  } catch (err) {
    return { ok: false, reason: `Deye token JSON: ${(err as Error).message}` };
  }

  // Deye retorna (doc oficial):
  //   { success: true, accessToken: "Bearer eyJ...", code: "1000000",
  //     expiresIn: "5183999", refreshToken: "...", scope: "all",
  //     tokenType: "bearer", uid: 3 }
  // ou em caso de erro:
  //   { success: false, code: "...", msg: "..." }
  if (json.success === false) {
    const isAuth = /password|credential|token|secret|account|invalid|param/i.test(json.msg ?? '');
    return {
      ok: false,
      reason: `Deye: ${json.msg ?? json.code ?? 'erro desconhecido'}`,
      invalidCredentials: isAuth,
    };
  }
  // accessToken (camelCase, doc oficial). Pode vir com prefixo "Bearer "
  // que precisa ser removido antes de usar em headers Authorization.
  let token = json.accessToken ?? json.access_token ?? json.Bearer;
  if (!token) {
    return { ok: false, reason: 'Deye nao retornou accessToken' };
  }
  // Remove prefixo "Bearer " se vier (algumas APIs mandam ja com prefixo).
  token = token.replace(/^Bearer\s+/i, '').trim();
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
  // Log do body pra debug — deye eh chato com tipos. Nao loga token nem
  // credenciais (so o body do request, que so tem ids/datas).
  console.log(`[deye] POST ${endpoint} body=${JSON.stringify(body)}`);
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
    console.warn(`[deye] ${endpoint} status=${resp.status} body=${text.slice(0, 300)}`);
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

    // site_id (padrao adapter) ou stationId (legado) nas creds — importado por listSites
    const stationId = (credenciais as { site_id?: unknown; stationId?: unknown }).site_id
      ?? (credenciais as { stationId?: unknown }).stationId;
    if (!stationId) {
      return { ok: false, reason: 'site_id nao cadastrado nas credenciais — importe via /importar' };
    }

    // POST /v1.0/station/history (doc oficial Deye Cloud)
    // Body: { stationId, startAt:"YYYY-MM-DD", endAt:"YYYY-MM-DD", granularity:2 }
    // - granularity=2 (day): retorna kWh diario, formato startAt/endAt yyyy-MM-dd
    // - endAt eh EXCLUSIVO (Return from startAt to endAt(excluded))
    // - Limite 31 dias por chamada — chunko se intervalo for maior.
    // Resposta:
    //   { stationDataItems: [{ dateTime, generationValue, year, month, day }] }
    //   generationValue em kWh.

    const startDate = new Date(dataInicio + 'T00:00:00Z');
    const endDate = new Date(dataFim + 'T00:00:00Z');
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate > endDate) {
      return { ok: false, reason: `Range invalido: ${dataInicio}..${dataFim}` };
    }

    const todasGeracoes: { data: string; geracao_kwh: number }[] = [];
    // Deye limita intervalo a 31 dias por chamada. Como endAt eh exclusivo
    // (mandamos chunkEnd+1), o intervalo enviado eh CHUNK_DAYS+1. Pra ficar
    // claramente abaixo do limite, usamos 29 (intervalo enviado = 30 dias).
    const CHUNK_DAYS = 29;

    let chunkStart = new Date(startDate);
    while (chunkStart <= endDate) {
      // chunkEnd = min(chunkStart + 30d, endDate)
      const chunkEndCandidato = new Date(chunkStart);
      chunkEndCandidato.setUTCDate(chunkEndCandidato.getUTCDate() + CHUNK_DAYS);
      const chunkEnd = chunkEndCandidato > endDate ? new Date(endDate) : chunkEndCandidato;

      // endAt eh exclusivo na Deye, entao pra pegar chunkEnd inclusive,
      // mandamos chunkEnd + 1 dia.
      const endExclusivo = new Date(chunkEnd);
      endExclusivo.setUTCDate(endExclusivo.getUTCDate() + 1);

      const startAt = chunkStart.toISOString().slice(0, 10);
      const endAt = endExclusivo.toISOString().slice(0, 10);

      const result = await deyePost(baseUrl(parsed), '/v1.0/station/history', tokenResp.token, {
        stationId: Number(stationId),
        startAt,
        endAt,
        granularity: 2, // 1=frame, 2=day, 3=month, 4=year
      });

      if (!result.ok) {
        // Se ja pegou alguma coisa, retorna o que tem; senao falha
        if (todasGeracoes.length === 0) return { ok: false, reason: result.reason };
        console.warn(`[deye] history chunk ${startAt}..${endAt} falhou, retornando ${todasGeracoes.length} pontos`);
        break;
      }

      const items = (result.data?.stationDataItems as Array<{
        dateTime?: string | null;
        year?: number;
        month?: number;
        day?: number;
        generationValue?: number | null;
      }>) ?? [];

      for (const it of items) {
        // dateTime pode vir como "yyyy-MM-dd HH:mm:ss" ou apenas "yyyy-MM-dd"
        // Fallback: monta a partir de year/month/day.
        let data: string | null = null;
        if (typeof it.dateTime === 'string' && /^\d{4}-\d{2}-\d{2}/.test(it.dateTime)) {
          data = it.dateTime.slice(0, 10);
        } else if (
          typeof it.year === 'number' && it.year > 0 &&
          typeof it.month === 'number' && it.month > 0 &&
          typeof it.day === 'number' && it.day > 0
        ) {
          data = `${it.year}-${String(it.month).padStart(2, '0')}-${String(it.day).padStart(2, '0')}`;
        }
        if (!data) continue;

        const kwh = Number(it.generationValue ?? 0);
        if (!Number.isFinite(kwh)) continue;

        todasGeracoes.push({ data, geracao_kwh: Math.max(0, kwh) });
      }

      // Avanca pro proximo chunk
      chunkStart = new Date(chunkEnd);
      chunkStart.setUTCDate(chunkStart.getUTCDate() + 1);
    }

    return { ok: true, geracoes: todasGeracoes };
  },

  // Lista todas as plantas da conta Deye master, paginando ate pegar tudo.
  // Endpoint: POST /v1.0/station/list
  // Body: { page, size } (size max 100)
  // Response: { stationList: [...], total: <int>, success: true, ... }
  async listSites(credenciaisConta: Record<string, unknown>): Promise<ListSitesResult> {
    const parsed = parseCreds(credenciaisConta);
    if ('error' in parsed) {
      return { ok: false, reason: parsed.error, invalidCredentials: true };
    }

    const tokenResp = await obterToken(parsed);
    if (!tokenResp.ok) {
      return { ok: false, reason: tokenResp.reason, invalidCredentials: tokenResp.invalidCredentials };
    }

    // Pagina ate pegar todas — total vem na response.
    const PAGE_SIZE = 100;
    const todasStations: Array<Record<string, unknown>> = [];
    let page = 1;
    let total = 0;
    const MAX_PAGES = 50; // hard cap defensivo (5000 plantas)

    while (page <= MAX_PAGES) {
      const result = await deyePost(baseUrl(parsed), '/v1.0/station/list', tokenResp.token, {
        page,
        size: PAGE_SIZE,
      });

      if (!result.ok) {
        // Se ja pegou alguma planta, retorna o que tem; senao falha
        if (todasStations.length === 0) {
          return { ok: false, reason: result.reason };
        }
        console.warn(`[deye] listSites pagina ${page} falhou, retornando ${todasStations.length} ja coletadas`);
        break;
      }

      const stationList =
        (result.data?.stationList as Array<Record<string, unknown>>) ??
        (result.data?.dataList as Array<Record<string, unknown>>) ??
        [];
      total = Number(result.data?.total ?? stationList.length);

      todasStations.push(...stationList);

      // Termina se ja tem tudo (ou se essa pagina veio menor que size = ultima)
      if (todasStations.length >= total || stationList.length < PAGE_SIZE) break;
      page++;
    }

    console.log(`[deye] listSites: ${todasStations.length}/${total} plantas coletadas em ${page} pagina(s)`);

    const sites = todasStations.flatMap((st) => {
      const id = st.id !== undefined ? String(st.id) : null;
      const apelido = String(st.name ?? '').trim();
      if (!id || !apelido) return [];

      // installedCapacity vem em kWp (confirmado pelo example)
      const potencia_kwp = typeof st.installedCapacity === 'number' && Number.isFinite(st.installedCapacity)
        ? st.installedCapacity
        : null;

      // Localizacao: locationAddress eh o campo certo (confirmado pelo example).
      // Pega primeiro componente (separado por virgula) como cidade aproximada.
      const cidade = typeof st.locationAddress === 'string' && st.locationAddress.trim()
        ? st.locationAddress.trim().split(',')[0].trim()
        : null;

      // startOperatingTime eh Unix timestamp em SEGUNDOS (ex: 1705593600)
      // Converte pra YYYY-MM-DD.
      let data_instalacao: string | null = null;
      const ts = st.startOperatingTime ?? st.createdDate;
      if (typeof ts === 'number' && ts > 0) {
        const d = new Date(ts * 1000);
        if (!isNaN(d.getTime())) data_instalacao = d.toISOString().slice(0, 10);
      }

      return [{
        externalId: id,
        apelido,
        potencia_kwp,
        cidade,
        uf: null, // Deye nao retorna UF brasileira separado
        data_instalacao,
        // Credenciais que ficam por planta. Usa 'site_id' (padrao do adapter
        // registry — service.ts faz upsert por api_credentials->>site_id).
        credenciais: {
          appId: parsed.appId,
          appSecret: parsed.appSecret,
          email: parsed.email,
          password: parsed.password,
          dataCenter: parsed.dataCenter,
          countryCode: parsed.countryCode,
          site_id: id,
        },
      }];
    });

    return { ok: true, sites };
  },
};
