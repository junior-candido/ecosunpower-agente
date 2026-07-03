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
import type { AdapterResult, IntradayPonto, IntradayResult, ListSitesResult, MonitoringAdapter } from '../types.js';
import { fetchWithTimeout } from '../util/fetch-with-timeout.js';
import { getOrFetch } from '../util/token-cache.js';

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
  // Opcional — quando setado, autentica contra a empresa especifica
  // (ex: 'Ecosunpower super admin') em vez do perfil pessoal. Sem ele,
  // Deye autentica como Personal e so retorna plantas pessoais.
  companyId?: string;
}

function parseCreds(c: Record<string, unknown>): ParsedCreds | { error: string } {
  const cc = c as DeyeCredenciais & { countryCode?: unknown; companyId?: unknown };
  const appId = String(cc.appId ?? '').trim();
  const appSecret = String(cc.appSecret ?? '').trim();
  const email = String(cc.email ?? '').trim();
  const password = String(cc.password ?? '').trim();
  // Default 'us1' — Americas/Brasil. Junior pode escolher 'eu1' se for Europa.
  let dataCenter = String(cc.dataCenter ?? 'us1').trim().toLowerCase();
  if (!['us1', 'eu1'].includes(dataCenter)) dataCenter = 'us1';
  // Default Brasil. Junior pode mudar pelo form.
  const countryCode = String(cc.countryCode ?? '55').trim() || '55';
  // companyId opcional — string vazia = perfil pessoal
  const companyId = String(cc.companyId ?? '').trim() || undefined;

  if (!appId || !appSecret) {
    return { error: 'Faltam appId/appSecret (cadastre no portal Deye)' };
  }
  if (!email || !password) {
    return { error: 'Faltam email/password da conta Deye master' };
  }
  return { appId, appSecret, email, password, dataCenter, countryCode, companyId };
}

type TokenResult = { ok: true; token: string } | { ok: false; reason: string; invalidCredentials?: boolean };

// Cache de token POR CONTA (não por planta): o token org-scoped vale pra conta
// inteira, então as 22 plantas Ecosunpower compartilham 1 token. Sem isto, cada
// syncAll faria 22×(token pessoal + /account/info + token org) = 66 chamadas de
// auth. Token Deye dura ~60d; janela conservadora de 6h limita staleness sem
// re-logar a cada planta. Module-level (zera ao reiniciar o processo).
//
// Storage subjacente: src/modules/monitoring/util/token-cache.ts (compartilhado
// com NEP e futuros adapters).
//
// Chave inclui hash de appSecret+password: se Junior rotacionar o secret/senha
// (importarSitesEmMassa reescreve api_credentials), a chave muda e o token
// velho não é mais servido — sem esperar o TTL nem depender de restart.
function tokenCacheKey(c: ParsedCreds): string {
  const credHash = crypto.createHash('sha256').update(`${c.appSecret}:${c.password}`).digest('hex').slice(0, 12);
  return `deye|${c.dataCenter}|${c.appId}|${c.email}|${credHash}`;
}

// Detecta falha de AUTENTICAÇÃO numa resposta da Deye (token inválido/revogado).
// 2101023 = "access Denied" — exatamente o erro que este fix existe pra matar.
function isAuthFailure(r: { status?: number; reason: string }): boolean {
  return (
    r.status === 401 ||
    r.status === 403 ||
    /\b401\b|\b403\b|2101023|access denied|invalid token|token expired|unauthor/i.test(r.reason)
  );
}

// POST /v1.0/account/token. Sem companyId = token PESSOAL (organizationId:0,
// só lê plantas pessoais). Com companyId = token ORG-SCOPED (lê as plantas da
// organização — ex: as 22 da Ecosunpower).
async function postToken(creds: ParsedCreds, companyId?: number): Promise<TokenResult> {
  const base = baseUrl(creds);
  const url = `${base}/v1.0/account/token?appId=${encodeURIComponent(creds.appId)}`;

  // Deye exige password como hash SHA-256 (descoberto via doc oficial).
  const passwordHash = crypto.createHash('sha256').update(creds.password).digest('hex');
  const body: Record<string, unknown> = {
    appSecret: creds.appSecret,
    email: creds.email,
    password: passwordHash,
  };
  if (companyId !== undefined) body.companyId = companyId;

  // Log debug — sem expor password (mostra hash truncado)
  console.log(`[deye] POST /account/token body={appSecret:'${creds.appSecret.slice(0,4)}...',email:'${creds.email}',companyId:${companyId ?? 'none'},password:'${passwordHash.slice(0,8)}...'}`);

  let resp: Response;
  try {
    resp = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Deye doc lista 'host' como header obrigatorio. fetch ja seta
        // 'Host' automaticamente baseado na URL, mas garantimos explicito
        // pra cobrir validacao em minusculas.
        'host': new URL(base).host,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, reason: `network: ${(err as Error).message}` };
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    return { ok: false, reason: `Deye token ${resp.status}: ${text.slice(0, 200)}` };
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

// Descobre o companyId da organização via /v1.0/account/info (passo 2 do fluxo
// Business Member documentado). Retorna undefined quando a conta NÃO tem
// vínculo de org (perfil só pessoal — ex: planta 11206 Personal do Gabriel),
// caso em que o token pessoal é o correto.
async function obterCompanyId(creds: ParsedCreds, token: string): Promise<number | undefined> {
  const result = await deyePost(baseUrl(creds), '/v1.0/account/info', token, {});
  if (!result.ok) {
    console.warn(`[deye] /account/info falhou (segue com token pessoal): ${result.reason}`);
    return undefined;
  }
  // Primeira org com id não-zero vence. Conta da Ecosunpower tem 1 só (2912).
  // Conta multi-org (futuro cliente integrador) deve setar companyId explícito
  // nas credenciais (override) — listarEmpresasDeye() ajuda a descobrir qual.
  const orgList = (result.data?.orgInfoList as Array<{ companyId?: number | string }>) ?? [];
  for (const o of orgList) {
    const id = Number(o?.companyId);
    if (Number.isFinite(id) && id !== 0) return id;
  }
  return undefined;
}

// Fluxo Business Member completo (root cause do 403 nas 22 plantas Ecosunpower):
//   1. token PESSOAL (organizationId:0)
//   2. /account/info -> companyId da org (provado em prod: 2912 = Ecosunpower)
//   3. re-emite token COM companyId -> token ORG-SCOPED, lê /station/history
// Fallback: conta sem org usa o token pessoal (zero-regressão p/ planta Personal).
// Override: companyId explícito nas credenciais pula a descoberta.
// forceRefresh=true: descarta o token cacheado e re-emite do zero. Usado quando
// o /history responde auth-failure (token revogado/expirado dentro da janela
// de cache) — auto-cura sem esperar o TTL de 6h.
async function obterToken(creds: ParsedCreds, forceRefresh = false): Promise<TokenResult> {
  return getOrFetch(
    tokenCacheKey(creds),
    () => resolverToken(creds),
    undefined, // default 6h
    forceRefresh,
  );
}

async function resolverToken(creds: ParsedCreds): Promise<TokenResult> {
  // Override explícito: companyId já gravado nas credenciais. Valida (string
  // do JSONB pode vir lixo); se inválido, cai pro fluxo de descoberta em vez
  // de mandar companyId:null pra Deye.
  if (creds.companyId) {
    const cid = Number(creds.companyId);
    if (Number.isFinite(cid) && cid !== 0) {
      return postToken(creds, cid);
    }
    console.warn(`[deye] companyId inválido nas credenciais ('${creds.companyId}'); descobrindo via /account/info`);
  }

  const pessoal = await postToken(creds);
  if (!pessoal.ok) return pessoal;

  const companyId = await obterCompanyId(creds, pessoal.token);
  if (companyId === undefined) {
    // Conta sem organização — token pessoal é o correto.
    return pessoal;
  }

  const org = await postToken(creds, companyId);
  if (org.ok) {
    console.log(`[deye] token org-scoped OK (companyId=${companyId})`);
    return org;
  }
  // Re-emissão org falhou: devolve o pessoal (não fica pior que antes).
  console.warn(`[deye] re-emissão org falhou (${org.reason}); usando token pessoal`);
  return pessoal;
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
    resp = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
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

// Curva do dia da Deye (station/history granularity=1 "frame"). Cada item tem
// generationPower (W) + timeStamp (unix seg, UTC). Vira { hora BRT, kw }. A Deye
// não dá energia acumulada por frame (generationValue é null no frame), então a
// curva é só potência. Brasil = UTC-3 (sem horário de verão). Puro/testável.
export function parseDeyeFrames(
  items: Array<{ timeStamp?: number | string; generationPower?: number | string | null }>,
): IntradayPonto[] {
  const out: IntradayPonto[] = [];
  for (const it of items) {
    const ts = Number(it.timeStamp);
    const w = typeof it.generationPower === 'string' ? Number(it.generationPower) : (it.generationPower as number);
    if (!Number.isFinite(ts) || !Number.isFinite(w)) continue;
    const hora = new Date((ts - 3 * 3600) * 1000).toISOString().slice(11, 16); // BRT (UTC-3)
    out.push({ hora, kw: Number((Math.max(0, w) / 1000).toFixed(3)) });
  }
  return out.sort((a, b) => a.hora.localeCompare(b.hora));
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

    // Auth — usa companyId nas creds (Business member token).
    // Doc oficial Deye (obtain_token.py): "When companyId is provided, the token
    // retrieved will correspond to the business member"
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

    let token = tokenResp.token;
    let jaRetentou = false;
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

      // Body: doc oficial pede stationId+granularity+startAt+endAt apenas.
      // Tentativa: tambem passamos companyId no body se a planta tem (defensive)
      // pra cobrir caso a Deye filtre por companyId no /history.
      const historyBody: Record<string, unknown> = {
        stationId: Number(stationId),
        startAt,
        endAt,
        granularity: 2, // 1=frame, 2=day, 3=month, 4=year
      };
      if (parsed.companyId) historyBody.companyId = Number(parsed.companyId);
      const result = await deyePost(baseUrl(parsed), '/v1.0/station/history', token, historyBody);

      if (!result.ok) {
        // Token cacheado pode ter sido revogado/expirado dentro da janela de
        // cache. Auto-cura UMA vez: invalida o cache, re-emite token do zero e
        // retenta ESTE mesmo chunk. Mata o cenário "1 token ruim trava as 22
        // plantas por até 6h" (code 2101023 = o erro que este fix existe pra matar).
        if (todasGeracoes.length === 0 && !jaRetentou && isAuthFailure(result)) {
          jaRetentou = true;
          console.warn(`[deye] auth-failure no /history (${result.reason}); invalidando cache + re-emitindo token`);
          const fresh = await obterToken(parsed, true);
          if (!fresh.ok) {
            return { ok: false, reason: fresh.reason, invalidCredentials: fresh.invalidCredentials };
          }
          token = fresh.token;
          continue; // retenta o MESMO chunk com token novo (não avança o cursor)
        }
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

  // Curva do dia (potência kW) — validada ao vivo 03/07. Vem do NÍVEL DA ESTAÇÃO
  // (station/history granularity=1 "frame"), que INCLUI o dia atual. Sem energia
  // acumulada (a Deye não dá por frame). Telemetria completa (tensão/corrente)
  // fica pra quando o app Deye ganhar escopo de "device" (device/list volta 0 hoje).
  async fetchIntraday(credenciais: Record<string, unknown>, dia: string): Promise<IntradayResult> {
    const parsed = parseCreds(credenciais);
    if ('error' in parsed) return { ok: false, reason: parsed.error };
    const stationId = (credenciais as { site_id?: unknown; stationId?: unknown }).site_id
      ?? (credenciais as { stationId?: unknown }).stationId;
    if (!stationId) return { ok: false, reason: 'Deye fetchIntraday precisa de site_id (stationId)' };

    const body = { stationId: Number(stationId), startAt: dia, endAt: dia, granularity: 1 };
    const tk = await obterToken(parsed);
    if (!tk.ok) return { ok: false, reason: tk.reason };
    let r = await deyePost(baseUrl(parsed), '/v1.0/station/history', tk.token, body);
    if (!r.ok && isAuthFailure(r)) {
      const tk2 = await obterToken(parsed, true);
      if (!tk2.ok) return { ok: false, reason: tk2.reason };
      r = await deyePost(baseUrl(parsed), '/v1.0/station/history', tk2.token, body);
    }
    if (!r.ok) return { ok: false, reason: r.reason };
    const items = (r.data?.stationDataItems as Array<{ timeStamp?: number; generationPower?: number | null }>) ?? [];
    const pontos = parseDeyeFrames(items);
    if (pontos.length === 0) return { ok: false, reason: 'Sem curva pra esse dia.' };
    return { ok: true, pontos };
  },

  // Deye: credenciais da conta = tudo menos site_id (que e por planta).
  // Inclui companyId se a planta foi cadastrada com fluxo Business Member.
  extractAccountCreds(credsPlanta) {
    const cc = credsPlanta as Record<string, unknown>;
    const appId = String(cc.appId ?? '').trim();
    const appSecret = String(cc.appSecret ?? '').trim();
    const email = String(cc.email ?? '').trim();
    const password = String(cc.password ?? '').trim();
    if (!appId || !appSecret || !email || !password) return null;
    const out: Record<string, unknown> = { appId, appSecret, email, password };
    if (cc.dataCenter) out.dataCenter = cc.dataCenter;
    if (cc.companyId) out.companyId = cc.companyId;
    return out;
  },
};

// ============================================================================
// HELPER: lista empresas/organizacoes que a conta tem acesso
// ============================================================================
//
// Endpoint POST /v1.0/account/info — retorna orgInfoList[{companyId,companyName,roleName}]
// Junior usa pra descobrir o companyId da empresa "Ecosunpower super admin"
// (sem precisar caçar no portal Deye).
export async function listarEmpresasDeye(
  credenciais: Record<string, unknown>,
): Promise<
  | { ok: true; empresas: Array<{ companyId: string; companyName: string; roleName: string }> }
  | { ok: false; reason: string; invalidCredentials?: boolean }
> {
  const parsed = parseCreds(credenciais);
  if ('error' in parsed) return { ok: false, reason: parsed.error, invalidCredentials: true };

  const tokenResp = await obterToken(parsed);
  if (!tokenResp.ok) {
    return { ok: false, reason: tokenResp.reason, invalidCredentials: tokenResp.invalidCredentials };
  }

  const result = await deyePost(baseUrl(parsed), '/v1.0/account/info', tokenResp.token, {});
  if (!result.ok) return { ok: false, reason: result.reason };

  const orgList = (result.data?.orgInfoList as Array<{
    companyId?: number | string;
    companyName?: string;
    roleName?: string;
  }>) ?? [];

  const empresas = orgList.flatMap((o) => {
    if (o.companyId === undefined || o.companyId === null) return [];
    return [{
      companyId: String(o.companyId),
      companyName: String(o.companyName ?? '').trim() || `Empresa ${o.companyId}`,
      roleName: String(o.roleName ?? '').trim() || '—',
    }];
  });

  return { ok: true, empresas };
}
