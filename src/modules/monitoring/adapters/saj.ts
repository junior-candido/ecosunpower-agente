// Adapter SAJ — portal elekeeper (iop.saj-electric.com, região internacional).
//
// API descoberta 29/07/2026 via engenharia reversa do app web elekeeper +
// integrações da comunidade Home Assistant (elboletaire/ha-saj-esolar-cloud,
// erelke/ha-esolar). Validada AO VIVO contra a conta do instalador (Thiago/
// SunBright, 85 plantas): login, lista paginada, status e série diária.
//
// Auth (2 camadas, ambas extraídas do app.js do portal):
//   1. TODA requisição leva params base (appProjectName/clientDate/lang/
//      timeStamp/random/clientId) + assinatura: MD5(params ordenados por
//      chave + "&key=<QUERY_SIGN_KEY>") em hex minúsculo → SHA1 desse hex →
//      UPPERCASE. signParams = chaves na ORDEM DE INSERÇÃO.
//   2. Login POST form em /api/v1/sys/login com a senha cifrada em
//      AES-128-ECB (chave fixa do app, hex) + PKCS7, enviada em hex.
//      Resposta traz tokenHead ("Bearer ") + token → header Authorization.
//
// Endpoints usados:
//   POST /api/v1/sys/login                          — login (form)
//   GET  /api/v1/monitor/plant/getPlantList         — plantas do INSTALADOR
//        (getEndUserPlantList é só do dono-final — volta vazio pro Thiago)
//   GET  /api/v1/monitor/plant/getOnePlantInfo      — detalhe (status)
//   POST /api/v2/monitor/plant/chart/getCommonChartData — série de energia
//        {plantUid, chartDateType:3, chartMonth, commonChartType:3} →
//        yAxis[legendKey=PV_PRODUCTION].dataList = kWh por dia do mês.
//
// Status (censo real da carteira, 29/07): runningState 1=normal, 2=alarme,
// 3=offline; isOnline 'Y'/'N' como fallback.
//
// Credenciais no api_credentials JSONB:
//   conta:  { username, password, region? }         (region default 'in')
//   planta: { username, password, region?, site_id } (site_id = plantUid;
//            chave do dedupe do registry — igual NEP/SolarEdge/Deye)

import crypto from 'crypto';
import type { AdapterResult, GeracaoDiaria, ListSitesResult, MonitoringAdapter, SiteResumo } from '../types.js';
import { fetchWithTimeout } from '../util/fetch-with-timeout.js';
import { getOrFetch } from '../util/token-cache.js';
import { retryTransient, isTransientFailure, TRANSIENT_HTTP_STATUS } from '../util/retry.js';

const QUERY_SIGN_KEY = 'ktoKRLgQPjvNyUZO8lVc9kU1Bsip6XIe';
const PASSWORD_AES_KEY_HEX = 'ec1840a7c53cf0709eb784be480379b6';

const ROOTS: Record<string, string> = {
  in: 'https://iop.saj-electric.com/dev-api',
  eu: 'https://eop.saj-electric.com/dev-api',
  cn: 'https://op.saj-electric.cn/dev-api',
};

// ============================================================================
// ASSINATURA + CIFRA (puras, testadas)
// ============================================================================

export function sajSignature(params: Record<string, string | number>): Record<string, string | number> {
  const signParams = Object.keys(params).join(',');
  const ordenado = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
  const h = crypto.createHash('md5').update(Buffer.from(`${ordenado}&key=${QUERY_SIGN_KEY}`, 'latin1')).digest('hex');
  const signature = crypto.createHash('sha1').update(h, 'utf8').digest('hex').toUpperCase();
  return { ...params, signature, signParams };
}

export function sajEncryptPassword(plain: string): string {
  const key = Buffer.from(PASSWORD_AES_KEY_HEX, 'hex'); // 16 bytes → AES-128-ECB
  const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
  cipher.setAutoPadding(true); // PKCS7
  return Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]).toString('hex');
}

function paramsBase(): Record<string, string | number> {
  return {
    appProjectName: 'elekeeper',
    clientDate: new Date().toISOString().slice(0, 10),
    lang: 'en',
    timeStamp: Date.now(),
    random: crypto.randomBytes(16).toString('hex'),
    clientId: 'esolar-monitor-admin',
  };
}

// ============================================================================
// CREDENCIAIS
// ============================================================================

export interface SajCreds {
  username: string;
  password: string;
  region: 'in' | 'eu' | 'cn';
  siteId?: string;
}

export function parseCreds(c: Record<string, unknown>): SajCreds | { error: string } {
  const username = typeof c.username === 'string' ? c.username.trim() : '';
  const password = typeof c.password === 'string' ? c.password.trim() : '';
  const regionRaw = typeof c.region === 'string' ? c.region.trim().toLowerCase() : 'in';
  const region = (['in', 'eu', 'cn'].includes(regionRaw) ? regionRaw : 'in') as SajCreds['region'];
  const siteId = typeof c.site_id === 'string' && c.site_id.trim() ? c.site_id.trim() : undefined;
  if (!username || !password) {
    return { error: 'Credenciais SAJ precisam de { username, password } (login do portal elekeeper/eSolar do instalador).' };
  }
  return { username, password, region, siteId };
}

export function buildSiteCredenciais(creds: SajCreds, plantUid: string): Record<string, unknown> {
  return { username: creds.username, password: creds.password, region: creds.region, site_id: plantUid };
}

// ============================================================================
// HELPERS PUROS de datas / parse
// ============================================================================

export function mesesNoIntervalo(inicio: string, fim: string): string[] {
  const out: string[] = [];
  let [y, m] = inicio.slice(0, 7).split('-').map(Number);
  const [fy, fm] = fim.slice(0, 7).split('-').map(Number);
  // teto de segurança: 10 anos de backfill (mesmo limite do botão do dashboard)
  for (let i = 0; i < 120 && (y < fy || (y === fy && m <= fm)); i++) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

interface CommonChartResposta {
  xAxis?: { coordinateList?: unknown[] };
  yAxis?: Array<{ legendKey?: string; dataList?: unknown[]; unit?: string }>;
}

export function parseCommonChart(
  resposta: unknown, mes: string, inicio: string, fim: string,
): GeracaoDiaria[] {
  const r = (resposta ?? {}) as CommonChartResposta;
  const dias = Array.isArray(r.xAxis?.coordinateList) ? r.xAxis!.coordinateList! : [];
  const serie = (r.yAxis ?? []).find((s) => s.legendKey === 'PV_PRODUCTION');
  if (!serie || !Array.isArray(serie.dataList)) return [];
  const out: GeracaoDiaria[] = [];
  for (let i = 0; i < dias.length && i < serie.dataList.length; i++) {
    const dia = Number(dias[i]);
    const kwh = Number(serie.dataList[i]);
    if (!Number.isFinite(dia) || dia < 1 || dia > 31 || !Number.isFinite(kwh)) continue;
    const data = `${mes}-${String(dia).padStart(2, '0')}`;
    if (data < inicio || data > fim) continue;
    out.push({ data, geracao_kwh: kwh });
  }
  return out;
}

export function statusSaj(
  runningState: number | null | undefined,
  isOnline: string | null | undefined,
): 'ok' | 'offline' | 'falha' | 'desconhecido' {
  if (runningState === 1) return 'ok';
  if (runningState === 2) return 'falha';
  if (runningState === 3) return 'offline';
  if (isOnline === 'N') return 'offline';
  if (isOnline === 'Y') return 'ok';
  return 'desconhecido';
}

// createDate do portal vem "dd/MM/yyyy HH:mm:ss"
export function parseDataInstalacaoSaj(createDate: string | null | undefined): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec((createDate ?? '').trim());
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// ============================================================================
// HTTP
// ============================================================================

const TIMEOUT_MS = 20_000;

interface Envelope<T> { errCode?: number; errMsg?: string; data?: T }

function cacheKey(creds: SajCreds): string {
  return `saj|${creds.region}|${creds.username}|${crypto.createHash('sha256').update(creds.password).digest('hex').slice(0, 12)}`;
}

async function login(creds: SajCreds): Promise<{ ok: true; token: string } | { ok: false; reason: string; invalidCredentials?: boolean }> {
  const form = new URLSearchParams({
    ...Object.fromEntries(Object.entries(sajSignature(paramsBase())).map(([k, v]) => [k, String(v)])),
    username: creds.username,
    password: sajEncryptPassword(creds.password),
    rememberMe: 'false',
    loginType: '1',
  });
  const resp = await fetchWithTimeout(`${ROOTS[creds.region]}/api/v1/sys/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  }, TIMEOUT_MS);
  const json = (await resp.json().catch(() => null)) as Envelope<{ token?: string; tokenHead?: string }> | null;
  if (!json) return { ok: false, reason: `SAJ login HTTP ${resp.status}: resposta não-JSON` };
  if (json.errCode !== 0) {
    // 10003 = conta/senha incorreta (mensagem do portal) → não retentar
    const invalid = json.errCode === 10003;
    return { ok: false, reason: `SAJ login errCode=${json.errCode}: ${json.errMsg ?? ''}`, invalidCredentials: invalid };
  }
  const token = json.data?.token ? `${json.data.tokenHead ?? 'Bearer '}${json.data.token}` : null;
  if (!token) return { ok: false, reason: 'SAJ login sem token na resposta' };
  return { ok: true, token };
}

async function tokenDe(creds: SajCreds, forceRefresh = false) {
  return getOrFetch(cacheKey(creds), () => retryTransient(() => login(creds), isTransientFailure), undefined, forceRefresh);
}

// 5xx/429 nas chamadas já autenticadas = tropeço do servidor SAJ → retry
const httpTransiente = (r: { status: number }): boolean => TRANSIENT_HTTP_STATUS.has(r.status);

// true = resposta indica token vencido/ausente → vale re-logar UMA vez
function tokenVencido(status: number, json: Envelope<unknown> | null): boolean {
  if (status === 401) return true;
  const msg = (json?.errMsg ?? '').toLowerCase();
  return msg.includes('token') || msg.includes('login') && json?.errCode !== 0;
}

async function getV1<T>(creds: SajCreds, token: string, path: string, extra: Record<string, string | number>): Promise<{ status: number; json: Envelope<T> | null }> {
  const qs = new URLSearchParams(
    Object.entries(sajSignature({ ...extra, ...paramsBase() })).map(([k, v]) => [k, String(v)]),
  ).toString();
  const resp = await fetchWithTimeout(`${ROOTS[creds.region]}/api/v1${path}?${qs}`, {
    headers: { Authorization: token },
  }, TIMEOUT_MS);
  const json = (await resp.json().catch(() => null)) as Envelope<T> | null;
  return { status: resp.status, json };
}

async function postV2<T>(creds: SajCreds, token: string, path: string, body: Record<string, string | number>): Promise<{ status: number; json: Envelope<T> | null }> {
  const payload = sajSignature({ ...body, ...paramsBase() });
  const resp = await fetchWithTimeout(`${ROOTS[creds.region]}/api/v2${path}`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, TIMEOUT_MS);
  const json = (await resp.json().catch(() => null)) as Envelope<T> | null;
  return { status: resp.status, json };
}

// ============================================================================
// ADAPTER
// ============================================================================

interface PlantaLista {
  plantUid?: string; plantName?: string; systemPower?: number | string;
  isOnline?: string; runningState?: number; createDate?: string;
  todayEnergy?: number | string; country?: string; address?: string;
}

export const sajAdapter: MonitoringAdapter = {
  marca: 'saj',

  async fetchGeneration(credenciais, dataInicio, dataFim): Promise<AdapterResult> {
    const creds = parseCreds(credenciais);
    if ('error' in creds) return { ok: false, reason: creds.error, invalidCredentials: true };
    if (!creds.siteId) {
      return { ok: false, reason: 'SAJ fetchGeneration precisa de credenciais.site_id (plantUid da planta)', invalidCredentials: true };
    }

    try {
      let tok = await tokenDe(creds);
      if (!tok.ok) return { ok: false, reason: tok.reason, invalidCredentials: tok.invalidCredentials };

      const geracoes: GeracaoDiaria[] = [];
      for (const mes of mesesNoIntervalo(dataInicio, dataFim)) {
        const corpo = { plantUid: creds.siteId, chartDateType: 3, chartMonth: mes, commonChartType: 3 };
        let r = await retryTransient(
          () => postV2<unknown>(creds, (tok as { token: string }).token, '/monitor/plant/chart/getCommonChartData', corpo),
          httpTransiente,
        );
        if (tokenVencido(r.status, r.json)) {
          tok = await tokenDe(creds, true);
          if (!tok.ok) return { ok: false, reason: tok.reason, invalidCredentials: tok.invalidCredentials };
          r = await postV2<unknown>(creds, tok.token, '/monitor/plant/chart/getCommonChartData', corpo);
        }
        if (r.json?.errCode !== 0) {
          return { ok: false, reason: `SAJ getCommonChartData ${mes}: HTTP ${r.status} errCode=${r.json?.errCode}: ${r.json?.errMsg ?? ''}` };
        }
        geracoes.push(...parseCommonChart(r.json.data, mes, dataInicio, dataFim));
      }

      // Status atual da planta (best-effort — sem ele o sync segue normal)
      let statusInversor: 'ok' | 'offline' | 'falha' | 'desconhecido' | undefined;
      try {
        const det = await getV1<PlantaLista>(creds, (tok as { token: string }).token, '/monitor/plant/getOnePlantInfo', { plantUid: creds.siteId });
        if (det.json?.errCode === 0 && det.json.data) {
          statusInversor = statusSaj(det.json.data.runningState ?? null, det.json.data.isOnline ?? null);
        }
      } catch { /* best-effort */ }

      return { ok: true, geracoes, ...(statusInversor ? { statusInversor } : {}) };
    } catch (err) {
      return { ok: false, reason: `network: SAJ ${(err as Error).message}` };
    }
  },

  async listSites(credenciaisConta): Promise<ListSitesResult> {
    const creds = parseCreds(credenciaisConta);
    if ('error' in creds) return { ok: false, reason: creds.error, invalidCredentials: true };

    try {
      const tok = await tokenDe(creds);
      if (!tok.ok) return { ok: false, reason: tok.reason, invalidCredentials: tok.invalidCredentials };

      const sites: SiteResumo[] = [];
      let pageNo = 1;
      let total = Infinity;
      // pageSize 100; teto de 50 páginas = 5000 plantas (backstop anti-loop)
      while (sites.length < total && pageNo <= 50) {
        const r = await retryTransient(
          () => getV1<{ total?: number; list?: PlantaLista[] }>(creds, tok.token, '/monitor/plant/getPlantList', { pageNo, pageSize: 100 }),
          httpTransiente,
        );
        if (r.json?.errCode !== 0) {
          return { ok: false, reason: `SAJ getPlantList: HTTP ${r.status} errCode=${r.json?.errCode}: ${r.json?.errMsg ?? ''}` };
        }
        const lista = r.json.data?.list ?? [];
        total = Number(r.json.data?.total ?? lista.length);
        if (lista.length === 0) break;
        for (const p of lista) {
          if (!p.plantUid) continue;
          sites.push({
            externalId: p.plantUid,
            apelido: (p.plantName ?? '').trim() || `SAJ ${p.plantUid.slice(0, 6)}`,
            potencia_kwp: Number.isFinite(Number(p.systemPower)) && Number(p.systemPower) > 0 ? Number(p.systemPower) : null,
            // address do portal é texto livre (rua+cidade colados) e o país vem
            // separado — cidade/UF ficam pro cadastro manual, igual NEP.
            cidade: null,
            uf: null,
            data_instalacao: parseDataInstalacaoSaj(p.createDate),
            credenciais: buildSiteCredenciais(creds, p.plantUid),
          });
        }
        pageNo++;
      }
      return { ok: true, sites };
    } catch (err) {
      return { ok: false, reason: `network: SAJ ${(err as Error).message}` };
    }
  },

  extractAccountCreds(credsPlanta): Record<string, unknown> | null {
    const creds = parseCreds(credsPlanta);
    if ('error' in creds) return null;
    return { username: creds.username, password: creds.password, region: creds.region };
  },
};
