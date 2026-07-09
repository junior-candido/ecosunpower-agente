// Adapter Sungrow iSolarCloud — OpenAPI oficial (developer-api.isolarcloud.com).
//
// ✅ Validado ao vivo 03/07/2026 (app "EcoSunPower Monitoring", id 3229, server
// internacional HK). Duas descobertas que simplificam tudo vs. o rascunho antigo:
//   1. A API aceita TEXTO PLANO — dispensa a criptografia AES/RSA. Basta o
//      header x-access-key (secret) + Authorization: Bearer nas chamadas de dados.
//   2. O app tem que ser SÓ Monitoring. Se pedir "Grid control" a autorização
//      do dono falha ("Falha na autorização").
//
// AUTORIZAÇÃO (OAuth2, 1x por conta): o dono abre a Authorization URL, escolhe as
// usinas, autoriza → redireciona pra redirect_uri?code=XXXX (uso único). O `code`
// é trocado por { access_token, refresh_token } no bootstrap (exchangeCode).
//
// ⚠️ O refresh_token ROTA: cada refreshToken invalida o anterior e devolve um
// novo. Por isso, ao renovar, gravamos o refresh_token novo de volta no banco
// (via ctx.persistAccountCreds) em TODAS as plantas da mesma conta (mesmo appkey).
// Sem isso, depois de um deploy (cache em memória zera) a próxima sync quebraria.
//
// Headers: Content-Type: application/json;charset=UTF-8, sys_code: 901,
//          x-access-key: <secret>, Authorization: Bearer <access_token> (dados).
// Corpo público: appkey + lang. NÃO mandar api_key_param (Map opcional; string quebra).
//
// Gateway regional: conta internacional (HK, cloudId=2) => gateway.isolarcloud.com.hk.
//
// Credenciais no api_credentials JSONB:
//   conta:      { appkey, accessKey, appId, redirectUri, gateway?, refreshToken }
//   por planta: { ...conta, site_id }              (site_id = ps_id)
//   bootstrap:  { appkey, accessKey, appId, redirectUri, gateway?, code }  -> exchangeCode

import type {
  AdapterContext,
  AdapterResult,
  GeracaoDiaria,
  IntradayPonto,
  IntradayResult,
  ListSitesResult,
  MonitoringAdapter,
  SiteResumo,
  TelemetryDevice,
  TelemetryResult,
} from '../types.js';
import { fetchWithTimeout } from '../util/fetch-with-timeout.js';
import { getOrFetch } from '../util/token-cache.js';
import { retryTransient, isTransientFailure } from '../util/retry.js';

export const DEFAULT_GATEWAY = 'https://gateway.isolarcloud.com.hk';
const LANG = '_pt_BR';

// Pontos de medição da PLANTA (measure points) — valores em Wh / W.
//   83022 = geração do DIA (Wh, zera à meia-noite)
//   83024 = geração TOTAL acumulada (Wh)
//   83033 = potência instantânea (W)
const POINT_DAILY = '83022';
const POINT_TOTAL = '83024';
const POINT_POWER = '83033';

// Pontos de medição do DISPOSITIVO (inversor) — pra curva intradiária, que só
// existe no nível do inversor (o nível da usina não guarda potência minuto a
// minuto). Valores em W / Wh.
//   24 = potência ativa total (W)
//   1  = geração de HOJE acumulada (Wh)
const DEV_POINT_POWER = '24';
const DEV_POINT_YIELD_TODAY = '1';
// Tipos de dispositivo que geram: 1 = inversor string, 55 = microinversor.
const DEVICE_TYPES_GERACAO = [1, 55];

// access_token dura ~48h (172799s). Cacheamos por ~40h: refresca antes de expirar
// e, como o refresh_token ROTA, minimiza o nº de rotações (cada uma tem que ser
// persistida). O processo recicla no deploy (~1×/semana), zerando o cache.
const TOKEN_TTL_MS = 40 * 60 * 60 * 1000;

// ============================================================================
// CREDENTIALS
// ============================================================================

export interface ParsedCreds {
  appkey: string;
  accessKey: string;        // header x-access-key (secret)
  appId: string;            // applicationId (informativo; monta a Authorization URL)
  redirectUri: string;      // precisa bater com o cadastrado na troca do code
  gateway: string;
  refreshToken: string;     // mantém o acesso vivo (rota a cada refresh)
  code: string;             // opcional: só no bootstrap (troca por tokens)
  siteId?: string;          // ps_id — por planta
}

function pick(c: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = c[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return '';
}

export function parseCreds(c: Record<string, unknown>): ParsedCreds | { error: string } {
  const appkey = pick(c, 'appkey', 'appKey', 'app_key');
  const accessKey = pick(c, 'accessKey', 'access_key', 'secretKey', 'secret_key', 'x-access-key');
  const appId = pick(c, 'appId', 'app_id', 'applicationId', 'application_id');
  const redirectUri = pick(c, 'redirectUri', 'redirect_uri', 'redirectUrl', 'redirect_url');
  const gateway = pick(c, 'gateway', 'baseUrl', 'base_url') || DEFAULT_GATEWAY;
  const refreshToken = pick(c, 'refreshToken', 'refresh_token');
  const code = pick(c, 'code', 'authCode', 'auth_code');
  const siteId = pick(c, 'site_id', 'ps_id', 'siteId', 'psId') || undefined;

  if (!appkey || !accessKey) {
    return {
      error:
        'Credenciais Sungrow precisam de { appkey, accessKey }. ' +
        'Crie um app SÓ Monitoring na Open Platform (developer-api.isolarcloud.com).',
    };
  }
  // Pra operar continuamente precisa de refreshToken (ou code pra trocar na 1a vez).
  if (!refreshToken && !code) {
    return {
      error:
        'Sungrow OAuth precisa de { refreshToken } (ou { code } pra trocar na 1a vez). ' +
        'Autorize o app e capture o code do redirect (redirect_uri?code=...).',
    };
  }
  return { appkey, accessKey, appId, redirectUri, gateway, refreshToken, code, siteId };
}

export function buildSiteCredenciais(conta: ParsedCreds, psId: string): Record<string, unknown> {
  return {
    appkey: conta.appkey,
    accessKey: conta.accessKey,
    appId: conta.appId,
    redirectUri: conta.redirectUri,
    gateway: conta.gateway,
    refreshToken: conta.refreshToken,
    site_id: psId,
  };
}

// Chave de cache do token por CONTA (estável: não usa o refresh_token, que rota).
export function cacheKey(c: ParsedCreds): string {
  return `sungrow|${c.appkey}|${c.appId}`;
}

// ============================================================================
// API ENVELOPE  ( { result_code, result_msg, result_data } — success = "1" )
// ============================================================================

interface SungrowEnvelope<T> {
  result_code?: string;
  result_msg?: string;
  result_data?: T;
}

// Códigos de credencial inválida/expirada. Tratados como invalidCredentials
// (não retentar em loop; força reautorização). "5"/"-2" = refresh_token ruim.
const AUTH_ERR_CODES = new Set(['401', '403', 'E912', '009', '010', '5', '-2']);

// ============================================================================
// TOKEN (OAuth2, texto plano)
// ============================================================================

type TokenResult =
  | { ok: true; token: string }
  | { ok: false; reason: string; invalidCredentials?: boolean };

// Troca o `code` (uso único) por { access_token, refresh_token }. Bootstrap 1x.
export async function exchangeCode(
  c: ParsedCreds,
): Promise<{ ok: true; accessToken: string; refreshToken: string } | { ok: false; reason: string; invalidCredentials?: boolean }> {
  if (!c.code) return { ok: false, reason: 'exchangeCode: sem code nas credenciais' };
  if (!c.redirectUri) return { ok: false, reason: 'exchangeCode: sem redirectUri (precisa bater com o cadastrado)' };
  const r = await rawPost<{ access_token?: string; refresh_token?: string }>(
    c,
    '/openapi/apiManage/token',
    { grant_type: 'authorization_code', code: c.code, redirect_uri: c.redirectUri },
    null,
  );
  if (!r.ok) return { ok: false, reason: r.reason, invalidCredentials: r.invalidCredentials };
  const at = r.data?.access_token ?? '';
  const rt = r.data?.refresh_token ?? '';
  if (!at || !rt) return { ok: false, reason: `troca de code não retornou tokens (msg: ${r.msg})` };
  return { ok: true, accessToken: at, refreshToken: rt };
}

// Renova o access_token a partir do refresh_token. O refresh_token ROTA: se vier
// um novo, persiste via ctx (todas as plantas da conta) antes de seguir.
async function refreshAccessToken(c: ParsedCreds, ctx?: AdapterContext): Promise<TokenResult> {
  if (!c.refreshToken) {
    return { ok: false, reason: 'Sungrow sem refreshToken — reautorize o app', invalidCredentials: true };
  }
  const r = await rawPost<{ access_token?: string; refresh_token?: string; code?: string }>(
    c,
    '/openapi/apiManage/refreshToken',
    { refresh_token: c.refreshToken },
    null,
  );
  if (!r.ok) return { ok: false, reason: r.reason, invalidCredentials: r.invalidCredentials };
  const at = r.data?.access_token ?? '';
  const rt = r.data?.refresh_token ?? '';
  if (!at) return { ok: false, reason: 'refreshToken não retornou access_token', invalidCredentials: true };
  // refresh_token novo → grava no banco (rotação) antes de usar o access_token.
  if (rt && rt !== c.refreshToken) {
    c.refreshToken = rt; // atualiza a cópia em memória desta chamada
    if (ctx?.persistAccountCreds) {
      try {
        await ctx.persistAccountCreds({ refreshToken: rt });
      } catch (err) {
        console.warn(`[sungrow] falha ao persistir refresh_token rotacionado: ${(err as Error).message}`);
      }
    }
  }
  return { ok: true, token: at };
}

async function obterToken(c: ParsedCreds, ctx?: AdapterContext, forceRefresh = false): Promise<TokenResult> {
  return getOrFetch(cacheKey(c), () => refreshAccessToken(c, ctx), TOKEN_TTL_MS, forceRefresh);
}

// ============================================================================
// REQUEST HELPERS
// ============================================================================

// rawPost = rawPostOnce + retry em erro passageiro (502/503/504/429/rede). Um
// tropeço momentâneo do servidor da Sungrow não pode mais derrubar a sync até o
// próximo cron. O refresh de token (401/403) continua uma camada acima, no
// authPost — aqui só re-tentamos o que é transitório de verdade.
async function rawPost<T>(
  c: ParsedCreds,
  path: string,
  data: Record<string, unknown>,
  bearer: string | null,
): Promise<{ ok: true; data: T; msg: string } | { ok: false; reason: string; status?: number; invalidCredentials?: boolean }> {
  return retryTransient(() => rawPostOnce<T>(c, path, data, bearer), isTransientFailure);
}

// POST cru (texto plano). `bearer` != null => Authorization. Endpoints de token
// não levam Bearer; endpoints de dados levam.
async function rawPostOnce<T>(
  c: ParsedCreds,
  path: string,
  data: Record<string, unknown>,
  bearer: string | null,
): Promise<{ ok: true; data: T; msg: string } | { ok: false; reason: string; status?: number; invalidCredentials?: boolean }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json;charset=UTF-8',
    'sys_code': '901',
    'x-access-key': c.accessKey,
  };
  if (bearer) headers['Authorization'] = `Bearer ${bearer}`;

  let resp: Response;
  try {
    resp = await fetchWithTimeout(`${c.gateway}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...data, appkey: c.appkey, lang: LANG }),
    });
  } catch (err) {
    return { ok: false, reason: `network: ${(err as Error).message}` };
  }

  if (resp.status === 401 || resp.status === 403) {
    return { ok: false, reason: `Sungrow ${resp.status} (token/credencial inválida)`, invalidCredentials: true };
  }
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    return { ok: false, reason: `Sungrow ${resp.status}: ${txt.slice(0, 200)}`, status: resp.status };
  }

  let json: SungrowEnvelope<T>;
  try {
    json = (await resp.json()) as SungrowEnvelope<T>;
  } catch (err) {
    return { ok: false, reason: `Sungrow JSON inválido: ${(err as Error).message}` };
  }

  if (json.result_code !== '1') {
    const code = String(json.result_code ?? '');
    return {
      ok: false,
      reason: `Sungrow result_code=${code}: ${json.result_msg ?? ''}`,
      invalidCredentials: AUTH_ERR_CODES.has(code),
    };
  }
  return { ok: true, data: (json.result_data as T) ?? ({} as T), msg: json.result_msg ?? '' };
}

// POST autenticado (Bearer + auto-refresh + 1 retry no token inválido).
async function authPost<T>(
  c: ParsedCreds,
  path: string,
  data: Record<string, unknown>,
  ctx?: AdapterContext,
): Promise<{ ok: true; data: T } | { ok: false; reason: string; invalidCredentials?: boolean }> {
  const tk = await obterToken(c, ctx);
  if (!tk.ok) return tk;

  const r1 = await rawPost<T>(c, path, data, tk.token);
  if (r1.ok) return { ok: true, data: r1.data };

  // Token revogado dentro da janela de cache → força refresh e tenta 1x.
  if (r1.invalidCredentials && c.refreshToken) {
    const tk2 = await obterToken(c, ctx, true);
    if (!tk2.ok) return tk2;
    const r2 = await rawPost<T>(c, path, data, tk2.token);
    if (r2.ok) return { ok: true, data: r2.data };
    return { ok: false, reason: r2.reason, invalidCredentials: r2.invalidCredentials };
  }
  return { ok: false, reason: r1.reason, invalidCredentials: r1.invalidCredentials };
}

// Lista os ps_keys dos dispositivos que geram (inversor string + micro) de uma
// planta. Usado só pela curva intradiária (a geração diária é por planta).
async function listarDeviceKeys(
  c: ParsedCreds,
  ctx?: AdapterContext,
): Promise<{ ok: true; keys: string[] } | { ok: false; reason: string; invalidCredentials?: boolean }> {
  const keys: string[] = [];
  let page = 1;
  let safety = 20;
  while (safety-- > 0) {
    const r = await authPost<{ pageList?: Array<{ ps_key?: string }> }>(
      c,
      '/openapi/platform/getDeviceListByPsId',
      { ps_id: c.siteId, device_type_list: DEVICE_TYPES_GERACAO, page, size: 100 },
      ctx,
    );
    if (!r.ok) return r;
    const lista = Array.isArray(r.data?.pageList) ? r.data.pageList : [];
    for (const d of lista) if (d.ps_key) keys.push(d.ps_key);
    if (lista.length < 100) break;
    page++;
  }
  return { ok: true, keys };
}

// ============================================================================
// PARSING HELPERS  (puros, testáveis sem rede)
// ============================================================================

// "2026-07-03" -> "20260703"
export function isoParaYmd(iso: string): string {
  return iso.replace(/-/g, '').slice(0, 8);
}

// "20240823" -> "2024-08-23". null se não bater.
export function ymdParaIso(ts: string | number | undefined): string | null {
  const s = String(ts ?? '').trim();
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// "2026-03-18 16:46:43" | "20260318..." -> "2026-03-18". null se não bater.
export function dataInstalacaoParaIso(v: unknown): string | null {
  const s = String(v ?? '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{4})(\d{2})(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// Resposta de getPowerStationPointDayMonthYearDataList (query_type='day',
// data_type='2') → kWh por dia. Formato:
//   result_data[psId].p83022 = [{ "2": "<Wh>", time_stamp: "yyyyMMdd" }, ...]
// A chave "2" (data_type pico) = geração acumulada do dia (Wh). Wh -> kWh.
export function parseSerieDiaria(resultData: unknown, psId: string): GeracaoDiaria[] {
  if (!resultData || typeof resultData !== 'object') return [];
  const rd = resultData as Record<string, unknown>;
  const porPlanta = rd[psId] ?? rd[String(psId)];
  if (!porPlanta || typeof porPlanta !== 'object') return [];
  const serie = (porPlanta as Record<string, unknown>)[`p${POINT_DAILY}`];
  if (!Array.isArray(serie)) return [];

  const out: GeracaoDiaria[] = [];
  for (const item of serie) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const dia = ymdParaIso(o.time_stamp as string | number | undefined);
    if (!dia) continue;
    const raw = o['2'] ?? o.value ?? o['4'] ?? o['1'];
    const wh = typeof raw === 'string' ? Number(raw) : (raw as number);
    if (!Number.isFinite(wh)) continue;
    out.push({ data: dia, geracao_kwh: Number((Math.max(0, wh) / 1000).toFixed(3)) });
  }
  return out.sort((a, b) => a.data.localeCompare(b.data));
}

// Extrai a geração do DIA de hoje (Wh) da resposta de getPowerStationRealTimeData.
//   result_data.device_point_list = [{ ps_id, p83022, ... }]
// Retorna kWh (>= 0) ou null se não achar.
export function parseGeracaoHojeKwh(resultData: unknown, psId: string): number | null {
  if (!resultData || typeof resultData !== 'object') return null;
  const list = (resultData as Record<string, unknown>).device_point_list;
  if (!Array.isArray(list)) return null;
  const row = list.find((r) => r && typeof r === 'object' && String((r as Record<string, unknown>).ps_id) === String(psId));
  if (!row) return null;
  const raw = (row as Record<string, unknown>)[`p${POINT_DAILY}`];
  const wh = typeof raw === 'string' ? Number(raw) : (raw as number);
  if (!Number.isFinite(wh)) return null;
  return Number((Math.max(0, wh) / 1000).toFixed(3));
}

function numOrNull(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

// Janelas de 3h (limite duro da API) cobrindo o horário de sol (05:00–20:00) de
// um dia YYYY-MM-DD. 5 janelas. Pares [start,end] em yyyyMMddHHmmss (hora local
// da usina). O ponto da borda (ex: 08:00) repete entre janelas — deduplicado por
// hora no fetchIntraday.
export function janelas3hDaylight(dia: string): Array<[string, string]> {
  const ymd = isoParaYmd(dia);
  const marcos = [5, 8, 11, 14, 17, 20];
  const out: Array<[string, string]> = [];
  for (let i = 0; i < marcos.length - 1; i++) {
    const a = String(marcos[i]).padStart(2, '0');
    const b = String(marcos[i + 1]).padStart(2, '0');
    out.push([`${ymd}${a}0000`, `${ymd}${b}0000`]);
  }
  return out;
}

// Parseia a resposta de getDevicePointMinuteDataList → pontos da curva, SOMANDO
// os dispositivos (inversores/micros) por horário. Formato:
//   result_data[ps_key] = [{ time_stamp:"yyyyMMddHHmmss", p24:"<W>", p1:"<Wh>" }]
//   (result_data.point_dict é ignorado). p24=potência, p1=energia do dia acum.
export function parseDeviceMinuto(resultData: unknown): IntradayPonto[] {
  if (!resultData || typeof resultData !== 'object') return [];
  const rd = resultData as Record<string, unknown>;
  const porTs = new Map<string, { kw: number; kwh: number; temKw: boolean; temKwh: boolean }>();
  for (const [k, v] of Object.entries(rd)) {
    if (k === 'point_dict' || !Array.isArray(v)) continue; // só as séries por ps_key
    for (const item of v) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const ts = String(o.time_stamp ?? '');
      if (!/^\d{12,14}$/.test(ts)) continue;
      const acc = porTs.get(ts) ?? { kw: 0, kwh: 0, temKw: false, temKwh: false };
      const pw = numOrNull(o[`p${DEV_POINT_POWER}`]);
      const en = numOrNull(o[`p${DEV_POINT_YIELD_TODAY}`]);
      if (pw !== null) { acc.kw += pw / 1000; acc.temKw = true; }
      if (en !== null) { acc.kwh += en / 1000; acc.temKwh = true; }
      porTs.set(ts, acc);
    }
  }
  const out: IntradayPonto[] = [];
  for (const [ts, acc] of porTs) {
    if (!acc.temKw && !acc.temKwh) continue;
    const ponto: IntradayPonto = { hora: `${ts.slice(8, 10)}:${ts.slice(10, 12)}`, kw: Number(Math.max(0, acc.kw).toFixed(3)) };
    if (acc.temKwh) ponto.kwh = Number(Math.max(0, acc.kwh).toFixed(3));
    out.push(ponto);
  }
  return out.sort((a, b) => a.hora.localeCompare(b.hora));
}

// Parseia a resposta de getDeviceRealTimeData → foto ATUAL de cada dispositivo,
// mapeando só os pontos presentes no catálogo (ponto_nativo -> normalização).
//   result_data.device_point_list = [{ ps_key, p24:"<W>", p13112:"<V>", ... }]
// Cada valor cru vem na menor unidade da Sungrow (W/Wh/V/A); aplica o `fator` do
// catálogo (ex: 0.001 = W->kW). Dispositivo sem nenhuma leitura catalogada é omitido.
export function parseTelemetriaRealTime(
  resultData: unknown,
  catalogo: Map<string, { ponto: string; unidade: string; fator: number }>,
  ts: string,
): TelemetryDevice[] {
  if (!resultData || typeof resultData !== 'object') return [];
  const list = (resultData as Record<string, unknown>).device_point_list;
  if (!Array.isArray(list)) return [];
  const out: TelemetryDevice[] = [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    // getDeviceRealTimeData aninha os valores em `device_point` (validado ao vivo
    // 03/07): [{ device_point: { ps_key, p24, p5, ... } }]. Fallback pro item cru
    // se algum dia vier achatado.
    const rowObj = row as Record<string, unknown>;
    const o = (rowObj.device_point && typeof rowObj.device_point === 'object'
      ? rowObj.device_point
      : rowObj) as Record<string, unknown>;
    const deviceKey = String(o.ps_key ?? o.device_sn ?? '');
    if (!deviceKey) continue;
    const leituras: TelemetryDevice['leituras'] = [];
    for (const [nativo, meta] of catalogo) {
      const raw = o[`p${nativo}`];
      const n = typeof raw === 'string' ? Number(raw) : (raw as number);
      if (!Number.isFinite(n)) continue;
      leituras.push({ ponto: meta.ponto, valor: Number((n * meta.fator).toFixed(4)), unidade: meta.unidade, ts });
    }
    if (leituras.length > 0) out.push({ deviceKey, leituras });
  }
  return out;
}

function normalizeUf(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s.length === 2 ? s.toUpperCase() : null;
}

function isoHoje(): string {
  return new Date().toISOString().slice(0, 10);
}

// ============================================================================
// ADAPTER
// ============================================================================

interface StationListItem {
  ps_id?: number | string;
  ps_name?: string;
  ps_location?: string;
  install_date?: string;
}

export const sungrowAdapter: MonitoringAdapter = {
  marca: 'sungrow',

  async fetchGeneration(
    credenciais: Record<string, unknown>,
    dataInicio: string,
    dataFim: string,
    ctx?: AdapterContext,
  ): Promise<AdapterResult> {
    const parsed = parseCreds(credenciais);
    if ('error' in parsed) return { ok: false, reason: parsed.error, invalidCredentials: true };
    if (!parsed.siteId) {
      return { ok: false, reason: 'Sungrow fetchGeneration precisa de credenciais.site_id (ps_id)', invalidCredentials: true };
    }

    // Bootstrap: se ainda não temos refreshToken mas temos code, troca 1x.
    if (!parsed.refreshToken && parsed.code) {
      const ex = await exchangeCode(parsed);
      if (!ex.ok) return { ok: false, reason: ex.reason, invalidCredentials: ex.invalidCredentials };
      parsed.refreshToken = ex.refreshToken;
      if (ctx?.persistAccountCreds) {
        await ctx.persistAccountCreds({ refreshToken: ex.refreshToken, code: '' }).catch(() => {});
      }
    }

    const hoje = isoHoje();
    // Endpoint histórico NÃO retorna o dia atual → busca [inicio, ontem].
    const fimHistorico = dataFim >= hoje ? isoOntem(hoje) : dataFim;

    const porDia = new Map<string, number>();
    // O endpoint diário aceita no máximo 100 dias por chamada — quebra em
    // janelas de 90 dias (margem) pra cobrir backfill de anos sem estourar.
    for (const [ini, fim] of janelasDeDias(dataInicio, fimHistorico, 90)) {
      const r = await authPost<unknown>(
        parsed,
        '/openapi/platform/getPowerStationPointDayMonthYearDataList',
        {
          query_type: 'day',
          data_type: '2',
          ps_id_list: [parsed.siteId],
          data_point: `p${POINT_DAILY}`,
          start_time: isoParaYmd(ini),
          end_time: isoParaYmd(fim),
        },
        ctx,
      );
      if (!r.ok) return r;
      for (const g of parseSerieDiaria(r.data, parsed.siteId)) porDia.set(g.data, g.geracao_kwh);
    }

    // Dia de hoje (se pedido no range): pega do tempo real (histórico não traz).
    if (dataFim >= hoje && dataInicio <= hoje) {
      const rt = await authPost<unknown>(
        parsed,
        '/openapi/platform/getPowerStationRealTimeData',
        { ps_id_list: [parsed.siteId], point_id_list: [POINT_DAILY, POINT_TOTAL, POINT_POWER], is_get_point_dict: '1' },
        ctx,
      );
      if (rt.ok) {
        const hojeKwh = parseGeracaoHojeKwh(rt.data, parsed.siteId);
        if (hojeKwh !== null) porDia.set(hoje, hojeKwh);
      }
      // erro no tempo real não derruba a sync — o histórico já veio.
    }

    const geracoes: GeracaoDiaria[] = [...porDia.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([data, kwh]) => ({ data, geracao_kwh: Number(kwh.toFixed(3)) }));
    return { ok: true, geracoes, statusInversor: geracoes.length > 0 ? 'ok' : 'desconhecido' };
  },

  async listSites(credenciaisConta: Record<string, unknown>, ctx?: AdapterContext): Promise<ListSitesResult> {
    const parsed = parseCreds(credenciaisConta);
    if ('error' in parsed) return { ok: false, reason: parsed.error, invalidCredentials: true };

    // Bootstrap: troca o code por tokens na 1a importação.
    if (!parsed.refreshToken && parsed.code) {
      const ex = await exchangeCode(parsed);
      if (!ex.ok) return { ok: false, reason: ex.reason, invalidCredentials: ex.invalidCredentials };
      parsed.refreshToken = ex.refreshToken;
    }

    const sites: SiteResumo[] = [];
    const SIZE = 100;
    let page = 1;
    let safety = 50; // cap 50×100 = 5000 plantas

    while (safety-- > 0) {
      const r = await authPost<{ pageList?: StationListItem[]; rowCount?: number }>(
        parsed,
        '/openapi/platform/queryPowerStationList',
        { ps_type: '1,3,4,5,6,7,8,9,12', ps_name: '', valid_flag: '1,3', page, size: SIZE },
        ctx,
      );
      if (!r.ok) {
        if (r.invalidCredentials || sites.length === 0) return { ok: false, reason: r.reason, invalidCredentials: r.invalidCredentials };
        console.warn(`[sungrow] listSites: página ${page} falhou (${r.reason}); retornando ${sites.length} parciais`);
        return { ok: true, sites };
      }
      const lista = Array.isArray(r.data?.pageList) ? r.data.pageList : [];
      for (const p of lista) {
        const psId = p.ps_id != null ? String(p.ps_id) : '';
        if (!psId) continue;
        sites.push({
          externalId: psId,
          apelido: (p.ps_name ?? `Usina ${psId}`).trim(),
          potencia_kwp: null, // queryPowerStationList não traz kWp; Junior preenche ou enriquece depois
          cidade: p.ps_location ? String(p.ps_location).trim() : null,
          uf: normalizeUf(undefined),
          data_instalacao: dataInstalacaoParaIso(p.install_date),
          credenciais: buildSiteCredenciais(parsed, psId),
        });
      }
      if (lista.length < SIZE) break;
      page++;
    }
    return { ok: true, sites };
  },

  // Curva do dia (potência kW + energia kWh acumulada) de um dia YYYY-MM-DD.
  // Vem do NÍVEL DO INVERSOR (a usina não guarda potência minuto a minuto),
  // somando os inversores. Limitações da API aberta da Sungrow:
  //   - NÃO entrega o dia atual (só dias anteriores).
  //   - Máx 3h por chamada → quebra o dia em janelas (05h–20h).
  //   - Micro/plantas sem telemetria minuto degradam (retorna ok:false → a tela
  //     mostra o aviso padrão, sem quebrar).
  async fetchIntraday(
    credenciais: Record<string, unknown>,
    dia: string,
    ctx?: AdapterContext,
  ): Promise<IntradayResult> {
    const parsed = parseCreds(credenciais);
    if ('error' in parsed) return { ok: false, reason: parsed.error };
    if (!parsed.siteId) return { ok: false, reason: 'Sungrow fetchIntraday precisa de site_id (ps_id)' };
    if (dia >= isoHoje()) {
      return { ok: false, reason: 'A Sungrow só disponibiliza a curva detalhada a partir do dia seguinte.' };
    }

    const dev = await listarDeviceKeys(parsed, ctx);
    if (!dev.ok) return { ok: false, reason: dev.reason };
    if (dev.keys.length === 0) {
      return { ok: false, reason: 'Nenhum inversor com dados minuto a minuto nesta usina.' };
    }

    const porHora = new Map<string, IntradayPonto>();
    for (const [st, et] of janelas3hDaylight(dia)) {
      const r = await authPost<unknown>(
        parsed,
        '/openapi/platform/getDevicePointMinuteDataList',
        {
          ps_key_list: dev.keys,
          points: `p${DEV_POINT_POWER},p${DEV_POINT_YIELD_TODAY}`,
          is_get_point_dict: '0',
          start_time_stamp: st,
          end_time_stamp: et,
          minute_interval: '5',
        },
        ctx,
      );
      if (!r.ok) {
        if (r.invalidCredentials) return { ok: false, reason: r.reason };
        continue; // janela com erro pontual não derruba as outras
      }
      for (const p of parseDeviceMinuto(r.data)) porHora.set(p.hora, p);
    }
    const pontos = [...porHora.values()].sort((a, b) => a.hora.localeCompare(b.hora));
    if (pontos.length === 0) return { ok: false, reason: 'Sem curva pra esse dia (o inversor não reportou dados minuto a minuto).' };
    return { ok: true, pontos };
  },

  async fetchTelemetry(
    credenciais: Record<string, unknown>,
    catalogo: Map<string, { ponto: string; unidade: string; fator: number }>,
    ts: string,
    ctx?: AdapterContext,
  ): Promise<TelemetryResult> {
    const parsed = parseCreds(credenciais);
    if ('error' in parsed) return { ok: false, reason: parsed.error, invalidCredentials: true };
    if (!parsed.siteId) return { ok: false, reason: 'Sungrow fetchTelemetry precisa de site_id (ps_id)' };
    const dev = await listarDeviceKeys(parsed, ctx);
    if (!dev.ok) return { ok: false, reason: dev.reason, invalidCredentials: dev.invalidCredentials };
    if (dev.keys.length === 0) return { ok: true, devices: [] };
    const pontos = [...catalogo.keys()];
    if (pontos.length === 0) return { ok: true, devices: [] };
    // getDeviceRealTimeData exige device_type; no piloto consultamos os inversores string (type 1).
    const r = await authPost<unknown>(
      parsed,
      '/openapi/platform/getDeviceRealTimeData',
      { ps_key_list: dev.keys, device_type: 1, point_id_list: pontos, is_get_point_dict: '0' },
      ctx,
    );
    if (!r.ok) return { ok: false, reason: r.reason, invalidCredentials: r.invalidCredentials };
    return { ok: true, devices: parseTelemetriaRealTime(r.data, catalogo, ts) };
  },

  // Credenciais da CONTA (sem o site_id) pro discovery deduplicar.
  extractAccountCreds(credsPlanta) {
    const parsed = parseCreds(credsPlanta as Record<string, unknown>);
    if ('error' in parsed) return null;
    if (!parsed.refreshToken) return null; // sem refresh não dá pra rechamar sozinho
    return {
      appkey: parsed.appkey,
      accessKey: parsed.accessKey,
      appId: parsed.appId,
      redirectUri: parsed.redirectUri,
      gateway: parsed.gateway,
      refreshToken: parsed.refreshToken,
    };
  },
};

// "2026-07-03" -> "2026-07-02" (dia anterior). Puro, sem timezone surpresa.
function isoOntem(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

// Quebra [inicio, fim] (YYYY-MM-DD, inclusivo) em janelas de no máximo `maxDias`
// dias. Vazio se fim < inicio. Puro/testável. Cap de guarda evita loop infinito.
export function janelasDeDias(inicio: string, fim: string, maxDias: number): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  if (fim < inicio) return out;
  const passo = Math.max(1, maxDias);
  let cursor = new Date(`${inicio}T00:00:00Z`);
  const fimDate = new Date(`${fim}T00:00:00Z`);
  let guard = 0;
  while (cursor <= fimDate && guard++ < 1000) {
    const janelaFim = new Date(cursor);
    janelaFim.setUTCDate(janelaFim.getUTCDate() + passo - 1);
    const fimUsar = janelaFim < fimDate ? janelaFim : fimDate;
    out.push([cursor.toISOString().slice(0, 10), fimUsar.toISOString().slice(0, 10)]);
    cursor = new Date(fimUsar);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}
