// Adapter Solis (Ginlong) — API oficial SolisCloud (www.soliscloud.com:13333)
//
// Diferente do GoodWe/NEP: a Solis tem API OFICIAL self-service. O instalador
// gera KeyId + KeySecret no app SolisCloud (Serviço → Gerenciamento de API) e o
// adapter assina cada request (não tem login/token). Validado ao vivo 01/07
// (8 usinas, geração diária real).
//
// Auth por request (assinatura estilo AWS/HMAC):
//   headers: Content-MD5, Content-Type, Date (GMT), Authorization
//   Authorization = "API {keyId}:{sign}"
//   sign = base64( HMAC-SHA1( keySecret, StringToSign ) )
//   StringToSign = "POST\n{Content-MD5}\n{Content-Type}\n{Date}\n{resource}"
//     (aqui o \n são QUEBRAS DE LINHA de verdade, ≠ do FoxESS que usa literal)
//   Content-MD5 = base64( md5( body ) )
//
// ⚠️ RATE LIMIT AGRESSIVO: 1 request/segundo (429 "too many request 1 times in
// 1000 milliseconds" se passar). Um acelerador module-level serializa TODAS as
// chamadas Solis com intervalo mínimo, valendo pra frota inteira no cron.
//
// GRANULARIDADE = USINA (station id). Cada SITE = 1 planta.
//
// Credenciais no api_credentials JSONB:
//   conta:      { keyId, keySecret, apiUrl? }
//   por usina:  { keyId, keySecret, apiUrl?, site_id }   (site_id = station id)
//
// Endpoints:
//   POST /v1/api/userStationList   — lista as usinas do instalador (paginado)
//   POST /v1/api/stationMonth      — energia POR DIA de um mês (yyyy-MM)

import crypto from 'crypto';
import type {
  AdapterResult,
  GeracaoDiaria,
  IntradayResult,
  ListSitesResult,
  MonitoringAdapter,
  SiteResumo,
} from '../types.js';
import { fetchWithTimeout } from '../util/fetch-with-timeout.js';

const DEFAULT_BASE = 'https://www.soliscloud.com:13333';
// Intervalo mínimo entre chamadas Solis (limite é 1/s; folga de segurança).
const MIN_INTERVAL_MS = 1100;

// ============================================================================
// CREDENTIALS
// ============================================================================

export interface ParsedCreds {
  keyId: string;
  keySecret: string;
  base: string;         // apiUrl normalizada (sem barra final)
  siteId?: string;      // station id da planta
}

function pick(c: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = c[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

export function normalizeBase(apiUrl: string): string {
  const u = apiUrl.trim().replace(/\/+$/, '');
  return u || DEFAULT_BASE;
}

export function parseCreds(c: Record<string, unknown>): ParsedCreds | { error: string } {
  const keyId = pick(c, 'keyId', 'key_id', 'appId', 'appid');
  const keySecret = pick(c, 'keySecret', 'key_secret', 'appSecret', 'secret');
  const apiUrl = pick(c, 'apiUrl', 'api_url', 'base');
  const siteId = pick(c, 'site_id', 'siteId', 'stationId', 'id') || undefined;
  if (!keyId || !keySecret) {
    return {
      error:
        'Credenciais Solis precisam de { keyId, keySecret }. ' +
        'Gere no app SolisCloud em Serviço → Gerenciamento de API.',
    };
  }
  return { keyId, keySecret, base: normalizeBase(apiUrl), siteId };
}

export function buildSiteCredenciais(parsed: ParsedCreds, plantaSiteId: string): Record<string, unknown> {
  return { keyId: parsed.keyId, keySecret: parsed.keySecret, apiUrl: parsed.base, site_id: plantaSiteId };
}

// ============================================================================
// ASSINATURA
// ============================================================================

export function solisSign(keySecret: string, contentMd5: string, contentType: string, date: string, resource: string): string {
  const strToSign = `POST\n${contentMd5}\n${contentType}\n${date}\n${resource}`;
  return crypto.createHmac('sha1', keySecret).update(strToSign, 'utf8').digest('base64');
}

// ============================================================================
// RATE LIMITER (module-level) — serializa TODAS as chamadas Solis com ≥1.1s
// ============================================================================

let gate: Promise<void> = Promise.resolve();
function throttle(): Promise<void> {
  const prev = gate;
  let release!: () => void;
  gate = new Promise<void>((r) => { release = r; });
  return prev.then(async () => {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS));
    release();
  });
}

// ============================================================================
// REQUEST
// ============================================================================

interface SolisEnvelope<T> { success?: boolean; code?: string | number; msg?: string; data?: T }

async function solisPost<T>(
  parsed: ParsedCreds,
  resource: string,
  body: Record<string, unknown>,
  retriesRateLimit = 2,
): Promise<{ ok: true; data: T } | { ok: false; reason: string; invalidCredentials?: boolean }> {
  await throttle();

  const bodyStr = JSON.stringify(body);
  const contentMd5 = crypto.createHash('md5').update(bodyStr).digest('base64');
  const contentType = 'application/json';
  const date = new Date().toUTCString();
  const auth = `API ${parsed.keyId}:${solisSign(parsed.keySecret, contentMd5, contentType, date, resource)}`;

  let resp: Response;
  try {
    resp = await fetchWithTimeout(`${parsed.base}${resource}`, {
      method: 'POST',
      headers: { 'Content-MD5': contentMd5, 'Content-Type': contentType, Date: date, Authorization: auth },
      body: bodyStr,
    });
  } catch (err) {
    return { ok: false, reason: `network: ${(err as Error).message}` };
  }

  // 429 = estourou o rate limit: espera e re-tenta (o throttle já espaça, mas
  // sob concorrência pode bater). 401/403 = chave/assinatura errada.
  if (resp.status === 429 && retriesRateLimit > 0) {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS));
    return solisPost<T>(parsed, resource, body, retriesRateLimit - 1);
  }
  if (resp.status === 401 || resp.status === 403) {
    const txt = await resp.text().catch(() => '');
    return { ok: false, reason: `Solis ${resp.status}: ${txt.slice(0, 160)}`, invalidCredentials: true };
  }
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    return { ok: false, reason: `Solis HTTP ${resp.status}: ${txt.slice(0, 160)}` };
  }

  let json: SolisEnvelope<T>;
  try {
    json = (await resp.json()) as SolisEnvelope<T>;
  } catch (err) {
    return { ok: false, reason: `Solis JSON inválido: ${(err as Error).message}` };
  }

  const code = String(json.code ?? '');
  // code "0" = sucesso. Erros de auth (appid/sign) → invalidCredentials.
  if (code !== '0' || json.success === false) {
    const invalid = /appid|sign|permission|denied|token|unauthor/i.test(json.msg ?? '');
    return { ok: false, reason: `Solis code=${code}: ${json.msg ?? ''}`, invalidCredentials: invalid || undefined };
  }
  return { ok: true, data: (json.data as T) ?? ({} as T) };
}

// ============================================================================
// PARSING (puro, testável)
// ============================================================================

// Lista de meses YYYY-MM cobrindo [inicio, fim] (datas YYYY-MM-DD).
export function mesesNoIntervalo(dataInicio: string, dataFim: string): string[] {
  const [ai, mi] = dataInicio.split('-').map(Number);
  const [af, mf] = dataFim.split('-').map(Number);
  const out: string[] = [];
  let y = ai, m = mi, guard = 0;
  while ((y < af || (y === af && m <= mf)) && guard++ < 240) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

interface StationMonthRec { dateStr?: string; energy?: number | string; energyStr?: string }

// Resposta do stationMonth (array de dias) → kWh/dia dentro de [inicio, fim].
// A energia já vem em kWh (energyStr="kWh"); se vier MWh, converte.
export function parseStationMonth(data: unknown, inicio: string, fim: string): GeracaoDiaria[] {
  const arr = Array.isArray(data) ? (data as StationMonthRec[]) : [];
  const out: GeracaoDiaria[] = [];
  for (const r of arr) {
    const dia = (r.dateStr ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) continue;
    if (dia < inicio || dia > fim) continue;
    let kwh = typeof r.energy === 'string' ? Number(r.energy) : r.energy;
    if (!Number.isFinite(kwh)) continue;
    kwh = kwh as number;
    if ((r.energyStr ?? '').toLowerCase() === 'mwh') kwh *= 1000;
    out.push({ data: dia, geracao_kwh: Math.max(0, kwh) });
  }
  return out;
}

// stationDay devolve um ARRAY de pontos do dia. Campos confirmados ao vivo
// (01/07): `timeStr`="HH:mm:ss" (hora) e `power` (potência instantânea em W —
// ex.: 13780 → 13.78 kW, coerente com powerPec="0.001"). W→kW = ÷1000.
interface SolisDayPonto { timeStr?: string; power?: number | string | null }
export function parseIntradaySolis(data: unknown): Array<{ hora: string; kw: number }> {
  const arr = Array.isArray(data) ? (data as SolisDayPonto[]) : [];
  const out: Array<{ hora: string; kw: number }> = [];
  for (const p of arr) {
    const hora = (p?.timeStr ?? '').toString().trim();
    if (!hora) continue;
    const raw = p?.power;
    const w = typeof raw === 'string' ? Number(raw) : raw;
    if (typeof w !== 'number' || !Number.isFinite(w)) continue;
    out.push({ hora, kw: Number((w / 1000).toFixed(3)) });
  }
  return out;
}

interface StationListRec {
  id?: string;
  stationName?: string;
  capacity?: number | string;
  capacityStr?: string;
}

// Converte capacity pra kWp levando o unit em conta (kWp direto; MWp→×1000; Wp→÷1000).
export function capacidadeKwp(rec: StationListRec): number | null {
  const n = typeof rec.capacity === 'string' ? Number(rec.capacity) : rec.capacity;
  if (!Number.isFinite(n) || (n as number) <= 0) return null;
  const unit = (rec.capacityStr ?? 'kwp').toLowerCase();
  let kwp = n as number;
  if (unit === 'mwp' || unit === 'mw') kwp *= 1000;
  else if (unit === 'wp' || unit === 'w') kwp /= 1000;
  return Number(kwp.toFixed(2));
}

export function parseStationRecord(r: StationListRec): Omit<SiteResumo, 'credenciais'> | null {
  const id = (r.id ?? '').trim();
  if (!id) return null;
  return {
    externalId: id,
    apelido: (r.stationName ?? `Usina ${id.slice(0, 8)}`).trim(),
    potencia_kwp: capacidadeKwp(r),
    cidade: null,       // userStationList não traz endereço; cliente preenche
    uf: null,
    data_instalacao: null,
  };
}

// ============================================================================
// ADAPTER
// ============================================================================

interface UserStationListData { page?: { records?: StationListRec[] }; records?: StationListRec[] }

export const solisAdapter: MonitoringAdapter = {
  marca: 'solis',

  // stationMonth por mês do intervalo → geração diária da usina.
  async fetchGeneration(
    credenciais: Record<string, unknown>,
    dataInicio: string,
    dataFim: string,
  ): Promise<AdapterResult> {
    const parsed = parseCreds(credenciais);
    if ('error' in parsed) return { ok: false, reason: parsed.error, invalidCredentials: true };
    if (!parsed.siteId) {
      return { ok: false, reason: 'Solis fetchGeneration precisa de credenciais.site_id (station id)', invalidCredentials: true };
    }

    const porDia = new Map<string, number>();
    let ultimoErro: string | null = null;
    for (const month of mesesNoIntervalo(dataInicio, dataFim)) {
      const r = await solisPost<unknown>(parsed, '/v1/api/stationMonth', {
        id: parsed.siteId, month, timeZone: -3, money: 'BRL',
      });
      if (!r.ok) {
        if (r.invalidCredentials) return r;
        ultimoErro = r.reason;
        console.warn(`[solis] stationMonth ${parsed.siteId} ${month} falhou (${r.reason}); pula esse mês`);
        continue;
      }
      for (const g of parseStationMonth(r.data, dataInicio, dataFim)) {
        porDia.set(g.data, g.geracao_kwh);
      }
    }

    // Nada coletado + houve falha = erro transitório: devolve erro pro cron
    // re-tentar (não finge "sincronizou 0"). Vazio sem falha = intervalo futuro.
    if (porDia.size === 0 && ultimoErro) return { ok: false, reason: ultimoErro };

    const geracoes: GeracaoDiaria[] = [...porDia.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([data, kwh]) => ({ data, geracao_kwh: Number(kwh.toFixed(3)) }));
    return { ok: true, geracoes, statusInversor: geracoes.length > 0 ? 'ok' : 'desconhecido' };
  },

  // stationDay → curva de potência (kW) do dia da usina. Ao vivo.
  async fetchIntraday(credenciais: Record<string, unknown>, dia: string): Promise<IntradayResult> {
    const parsed = parseCreds(credenciais);
    if ('error' in parsed) return { ok: false, reason: parsed.error };
    if (!parsed.siteId) return { ok: false, reason: 'Solis fetchIntraday precisa de site_id' };
    const r = await solisPost<unknown>(parsed, '/v1/api/stationDay', { id: parsed.siteId, time: dia, timeZone: -3, money: 'BRL' });
    if (!r.ok) return { ok: false, reason: r.reason };
    return { ok: true, pontos: parseIntradaySolis(r.data) };
  },

  // userStationList paginado → todas as usinas do instalador.
  async listSites(credenciaisConta: Record<string, unknown>): Promise<ListSitesResult> {
    const parsed = parseCreds(credenciaisConta);
    if ('error' in parsed) return { ok: false, reason: parsed.error, invalidCredentials: true };

    const sites: SiteResumo[] = [];
    const PAGE_SIZE = 50;
    let pageNo = 1;
    let safety = 40;
    while (safety-- > 0) {
      const r = await solisPost<UserStationListData>(parsed, '/v1/api/userStationList', { pageNo, pageSize: PAGE_SIZE });
      if (!r.ok) {
        if (r.invalidCredentials || sites.length === 0) {
          return { ok: false, reason: r.reason, invalidCredentials: r.invalidCredentials };
        }
        console.warn(`[solis] listSites: página ${pageNo} falhou (${r.reason}); retornando ${sites.length} parciais`);
        return { ok: true, sites };
      }
      const records = r.data.page?.records ?? r.data.records ?? [];
      if (!Array.isArray(records)) break;
      for (const rec of records) {
        const base = parseStationRecord(rec);
        if (!base) continue;
        sites.push({ ...base, credenciais: buildSiteCredenciais(parsed, base.externalId) });
      }
      if (records.length < PAGE_SIZE) break;
      pageNo++;
    }
    return { ok: true, sites };
  },

  // Solis: credenciais da conta = keyId+keySecret (+apiUrl) sem o site_id.
  extractAccountCreds(credsPlanta) {
    const parsed = parseCreds(credsPlanta as Record<string, unknown>);
    if ('error' in parsed) return null;
    return { keyId: parsed.keyId, keySecret: parsed.keySecret, apiUrl: parsed.base };
  },
};
