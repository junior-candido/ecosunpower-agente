// Adapter FoxESS — OpenAPI oficial (www.foxesscloud.com/op/...).
//
// Doc: https://www.foxesscloud.com/public/i18n/en/OpenApiDocument.html
// Muito mais simples que Sungrow/NEP/ABB: a API KEY (gerada no app, em
// User Profile → API Management) JÁ É o token — não tem login nem cache.
//
// Auth por request (assinatura):
//   headers: token (api key), timestamp (ms), signature, lang, Content-Type
//   signature = MD5( path + "\r\n" + token + "\r\n" + timestamp )
//     ⚠️ o "\r\n" é o LITERAL barra-r-barra-n (4 chars: \ r \ n),
//        NÃO os bytes de controle CR/LF. É o erro nº1 de quem implementa.
//   path = só o caminho (ex /op/v0/device/list), sem host nem query.
//
// Rate limit: 1440 chamadas/dia POR inversor (~1/min). Polling diário folga.
//
// Credenciais no api_credentials JSONB:
//   conta:      { apiKey }
//   por planta: { apiKey, site_id }   (site_id = deviceSN do inversor)

import crypto from 'crypto';
import type {
  AdapterResult,
  GeracaoDiaria,
  ListSitesResult,
  MonitoringAdapter,
  SiteResumo,
} from '../types.js';
import { fetchWithTimeout } from '../util/fetch-with-timeout.js';

const BASE_URL = 'https://www.foxesscloud.com';
const LANG = 'en';

// ============================================================================
// CREDENTIALS
// ============================================================================

export interface ParsedCreds {
  apiKey: string;
  siteId?: string;   // deviceSN — por planta
}

function pick(c: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = c[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

export function parseCreds(c: Record<string, unknown>): ParsedCreds | { error: string } {
  const apiKey = pick(c, 'apiKey', 'api_key', 'token', 'key');
  const siteId = pick(c, 'site_id', 'siteId', 'deviceSN', 'sn') || undefined;
  if (!apiKey) {
    return {
      error:
        'Credenciais FoxESS precisam de { apiKey }. ' +
        'Gere no app FoxESS Cloud em User Profile → API Management.',
    };
  }
  return { apiKey, siteId };
}

export function buildSiteCredenciais(conta: ParsedCreds, deviceSN: string): Record<string, unknown> {
  return { apiKey: conta.apiKey, site_id: deviceSN };
}

// ============================================================================
// ASSINATURA  (MD5 com o "\r\n" LITERAL)
// ============================================================================

export function foxSign(path: string, token: string, timestampMs: number): string {
  const raw = `${path}\\r\\n${token}\\r\\n${timestampMs}`;   // \\r\\n = literal \ r \ n
  return crypto.createHash('md5').update(raw, 'utf8').digest('hex');
}

// ============================================================================
// REQUEST
// ============================================================================

interface FoxEnvelope<T> { errno?: number; msg?: string; result?: T }

// errnos de credencial inválida → invalidCredentials (não retentar em loop).
const AUTH_ERRNOS = new Set([40256, 41807, 41808, 41809]); // signature/token errors

async function foxPost<T>(
  apiKey: string,
  path: string,
  body: Record<string, unknown>,
  now: number,
): Promise<{ ok: true; data: T } | { ok: false; reason: string; invalidCredentials?: boolean }> {
  let resp: Response;
  try {
    resp = await fetchWithTimeout(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        token: apiKey,
        timestamp: String(now),
        signature: foxSign(path, apiKey, now),
        lang: LANG,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, reason: `network: ${(err as Error).message}` };
  }

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    return { ok: false, reason: `FoxESS HTTP ${resp.status}: ${txt.slice(0, 200)}` };
  }

  let json: FoxEnvelope<T>;
  try {
    json = (await resp.json()) as FoxEnvelope<T>;
  } catch (err) {
    return { ok: false, reason: `FoxESS JSON inválido: ${(err as Error).message}` };
  }

  if (json.errno !== 0) {
    const errno = Number(json.errno);
    return {
      ok: false,
      reason: `FoxESS errno=${errno}: ${json.msg ?? ''}`,
      invalidCredentials: AUTH_ERRNOS.has(errno),
    };
  }
  return { ok: true, data: (json.result as T) ?? ({} as T) };
}

// ============================================================================
// PARSING (puro, testável)
// ============================================================================

// Lista de meses YYYY-MM cobrindo [inicio, fim] (inclusive). Datas YYYY-MM-DD.
export function mesesNoIntervalo(dataInicio: string, dataFim: string): Array<{ year: number; month: number }> {
  const [ai, mi] = dataInicio.split('-').map(Number);
  const [af, mf] = dataFim.split('-').map(Number);
  const out: Array<{ year: number; month: number }> = [];
  let y = ai, m = mi, guard = 0;
  while ((y < af || (y === af && m <= mf)) && guard++ < 240) {
    out.push({ year: y, month: m });
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

// Resposta do report (dimension=day) → kWh por dia daquele mês.
// result = [{ variable:'generation', unit:'kWh', values:[d1,d2,...,dN] }]
// values[i] = geração do dia (i+1). Descarta null/não-numérico (dias futuros).
export function parseReportMes(
  result: unknown,
  year: number,
  month: number,
): GeracaoDiaria[] {
  const arr = Array.isArray(result) ? result : [];
  const ger = arr.find((x) => x && typeof x === 'object' && (x as { variable?: string }).variable === 'generation')
    ?? arr[0];
  const values: unknown[] = ger && Array.isArray((ger as { values?: unknown[] }).values)
    ? (ger as { values: unknown[] }).values
    : [];
  const out: GeracaoDiaria[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = typeof values[i] === 'string' ? Number(values[i]) : (values[i] as number);
    if (!Number.isFinite(v)) continue;
    const dia = String(i + 1).padStart(2, '0');
    const mm = String(month).padStart(2, '0');
    out.push({ data: `${year}-${mm}-${dia}`, geracao_kwh: Math.max(0, v) });
  }
  return out;
}

function dentroDoIntervalo(data: string, inicio: string, fim: string): boolean {
  return data >= inicio && data <= fim;
}

// ============================================================================
// ADAPTER
// ============================================================================

interface DeviceListItem { deviceSN?: string; plantName?: string; deviceType?: string; stationName?: string }

export const foxessAdapter: MonitoringAdapter = {
  marca: 'foxess',

  async fetchGeneration(
    credenciais: Record<string, unknown>,
    dataInicio: string,
    dataFim: string,
  ): Promise<AdapterResult> {
    const parsed = parseCreds(credenciais);
    if ('error' in parsed) return { ok: false, reason: parsed.error, invalidCredentials: true };
    if (!parsed.siteId) {
      return { ok: false, reason: 'FoxESS fetchGeneration precisa de credenciais.site_id (deviceSN)', invalidCredentials: true };
    }

    const geracoes: GeracaoDiaria[] = [];
    for (const { year, month } of mesesNoIntervalo(dataInicio, dataFim)) {
      const now = Date.now();
      const r = await foxPost<unknown>(parsed.apiKey, '/op/v0/device/report/query', {
        sn: parsed.siteId, year, month, dimension: 'day', variables: ['generation'],
      }, now);
      if (!r.ok) {
        // falha de credencial: aborta. falha pontual num mês: segue com o resto.
        if (r.invalidCredentials) return r;
        if (geracoes.length === 0) return r;
        console.warn(`[foxess] report ${year}-${month} falhou (${r.reason}); parcial`);
        continue;
      }
      for (const g of parseReportMes(r.data, year, month)) {
        if (dentroDoIntervalo(g.data, dataInicio, dataFim)) geracoes.push(g);
      }
    }
    geracoes.sort((a, b) => a.data.localeCompare(b.data));
    return { ok: true, geracoes, statusInversor: geracoes.length > 0 ? 'ok' : 'desconhecido' };
  },

  async listSites(credenciaisConta: Record<string, unknown>): Promise<ListSitesResult> {
    const parsed = parseCreds(credenciaisConta);
    if ('error' in parsed) return { ok: false, reason: parsed.error, invalidCredentials: true };

    const sites: SiteResumo[] = [];
    const SIZE = 100;
    let pagina = 1;
    let safety = 50;
    while (safety-- > 0) {
      const now = Date.now();
      const r = await foxPost<{ data?: DeviceListItem[]; total?: number; pageSize?: number; currentPage?: number }>(
        parsed.apiKey, '/op/v0/device/list', { currentPage: pagina, pageSize: SIZE }, now,
      );
      if (!r.ok) {
        if (r.invalidCredentials || sites.length === 0) return { ok: false, reason: r.reason, invalidCredentials: r.invalidCredentials };
        console.warn(`[foxess] listSites: página ${pagina} falhou (${r.reason}); ${sites.length} parciais`);
        return { ok: true, sites };
      }
      const lista = Array.isArray(r.data?.data) ? r.data.data : [];
      for (const d of lista) {
        const sn = d.deviceSN ? String(d.deviceSN).trim() : '';
        if (!sn) continue;
        sites.push({
          externalId: sn,
          apelido: (d.plantName ?? d.stationName ?? `Inversor ${sn}`).trim(),
          potencia_kwp: null,           // device/list não traz kWp — Junior preenche depois
          cidade: null,
          uf: null,
          data_instalacao: null,
          credenciais: buildSiteCredenciais(parsed, sn),
        });
      }
      if (lista.length < SIZE) break;
      pagina++;
    }
    return { ok: true, sites };
  },

  // FoxESS: credenciais da conta = só a apiKey (mesma key na conta e na planta).
  extractAccountCreds(credsPlanta) {
    const parsed = parseCreds(credsPlanta as Record<string, unknown>);
    if ('error' in parsed) return null;
    return { apiKey: parsed.apiKey };
  },
};
