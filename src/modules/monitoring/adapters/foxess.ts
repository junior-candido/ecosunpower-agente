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
//
// GRANULARIDADE = USINA (não micro). FoxESS de micro reporta 1 deviceSN por
// microinversor; uma usina tem vários. Pra não poluir o painel com o mesmo
// cliente repetido (igual o NEP faz), cada SITE = 1 PLANTA (stationID), e a
// geração da usina = SOMA dos micros dela. Validado ao vivo 27/06.
//
// Rate limit: 1440 chamadas/dia POR inversor (~1/min). Polling diário folga.
//
// Credenciais no api_credentials JSONB:
//   conta:      { apiKey }
//   por usina:  { apiKey, site_id, deviceSNs }   (site_id = stationID da planta)

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
  siteId?: string;        // stationID da planta (UUID)
  deviceSNs: string[];    // micros da planta (somados na geração)
}

function pick(c: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = c[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function pickArray(c: Record<string, unknown>, ...keys: string[]): string[] {
  for (const k of keys) {
    const v = c[k];
    if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
    // aceita também string separada por vírgula
    if (typeof v === 'string' && v.trim()) return v.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export function parseCreds(c: Record<string, unknown>): ParsedCreds | { error: string } {
  const apiKey = pick(c, 'apiKey', 'api_key', 'token', 'key');
  const siteId = pick(c, 'site_id', 'siteId', 'stationID', 'stationId') || undefined;
  let deviceSNs = pickArray(c, 'deviceSNs', 'device_sns', 'sns');
  // Compat: entradas antigas (por micro) gravavam só site_id = deviceSN.
  // Sem deviceSNs, usa o próprio site_id como único SN (não quebra na transição).
  if (deviceSNs.length === 0 && siteId) deviceSNs = [siteId];
  if (!apiKey) {
    return {
      error:
        'Credenciais FoxESS precisam de { apiKey }. ' +
        'Gere no app FoxESS Cloud em User Profile → API Management.',
    };
  }
  return { apiKey, siteId, deviceSNs };
}

export function buildSiteCredenciais(conta: ParsedCreds, stationID: string, deviceSNs: string[]): Record<string, unknown> {
  return { apiKey: conta.apiKey, site_id: stationID, deviceSNs };
}

// Potência (kW) a partir do deviceType "Q1-2500-E" → 2.5 kW. null se não casar.
export function capacidadeKw(deviceType: string | undefined): number {
  const m = /(\d{3,5})/.exec(deviceType ?? '');
  if (!m) return 0;
  const w = Number(m[1]);
  return Number.isFinite(w) && w > 0 ? w / 1000 : 0;
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
): Promise<{ ok: true; data: T } | { ok: false; reason: string; invalidCredentials?: boolean }> {
  const now = Date.now();
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

// Resposta do report (dimension=month) → kWh por dia daquele mês (1 micro).
// result = [{ variable:'generation', unit:'kWh', values:[d1,d2,...,dN] }]
export function parseReportMes(result: unknown, year: number, month: number): GeracaoDiaria[] {
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

interface PlantListItem { stationID?: string; name?: string; ianaTimezone?: string }
interface DeviceListItem { deviceSN?: string; stationID?: string; stationName?: string; deviceType?: string }

export const foxessAdapter: MonitoringAdapter = {
  marca: 'foxess',

  // Geração da USINA = soma dos micros (deviceSNs), por dia, no intervalo.
  async fetchGeneration(
    credenciais: Record<string, unknown>,
    dataInicio: string,
    dataFim: string,
  ): Promise<AdapterResult> {
    const parsed = parseCreds(credenciais);
    if ('error' in parsed) return { ok: false, reason: parsed.error, invalidCredentials: true };
    if (parsed.deviceSNs.length === 0) {
      return { ok: false, reason: 'FoxESS fetchGeneration precisa de credenciais.deviceSNs (micros da usina)', invalidCredentials: true };
    }

    const porDia = new Map<string, number>();
    for (const { year, month } of mesesNoIntervalo(dataInicio, dataFim)) {
      for (const sn of parsed.deviceSNs) {
        const r = await foxPost<unknown>(parsed.apiKey, '/op/v0/device/report/query', {
          sn, year, month, dimension: 'month', variables: ['generation'],
        });
        if (!r.ok) {
          if (r.invalidCredentials) return r;     // credencial ruim: aborta tudo
          console.warn(`[foxess] report ${sn} ${year}-${month} falhou (${r.reason}); pula esse micro/mês`);
          continue;                                // micro com erro pontual: soma o resto
        }
        for (const g of parseReportMes(r.data, year, month)) {
          if (dentroDoIntervalo(g.data, dataInicio, dataFim)) {
            porDia.set(g.data, (porDia.get(g.data) ?? 0) + g.geracao_kwh);
          }
        }
      }
    }
    const geracoes: GeracaoDiaria[] = [...porDia.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([data, kwh]) => ({ data, geracao_kwh: Number(kwh.toFixed(3)) }));
    return { ok: true, geracoes, statusInversor: geracoes.length > 0 ? 'ok' : 'desconhecido' };
  },

  // Lista 1 SITE por USINA (plant/list) + agrupa os micros (device/list) por
  // stationID → soma potência e guarda os deviceSNs pra geração.
  async listSites(credenciaisConta: Record<string, unknown>): Promise<ListSitesResult> {
    const parsed = parseCreds(credenciaisConta);
    if ('error' in parsed) return { ok: false, reason: parsed.error, invalidCredentials: true };

    // 1) plantas
    const plantsResp: PlantListItem[] = [];
    let pagina = 1, safety = 50;
    while (safety-- > 0) {
      const r = await foxPost<{ data?: PlantListItem[] }>(parsed.apiKey, '/op/v0/plant/list', { currentPage: pagina, pageSize: 100 });
      if (!r.ok) return { ok: false, reason: r.reason, invalidCredentials: r.invalidCredentials };
      const lista = Array.isArray(r.data?.data) ? r.data.data : [];
      plantsResp.push(...lista);
      if (lista.length < 100) break;
      pagina++;
    }

    // 2) micros, agrupados por stationID
    const devicesPorPlanta = new Map<string, DeviceListItem[]>();
    pagina = 1; safety = 50;
    while (safety-- > 0) {
      const r = await foxPost<{ data?: DeviceListItem[] }>(parsed.apiKey, '/op/v0/device/list', { currentPage: pagina, pageSize: 100 });
      if (!r.ok) return { ok: false, reason: r.reason, invalidCredentials: r.invalidCredentials };
      const lista = Array.isArray(r.data?.data) ? r.data.data : [];
      for (const d of lista) {
        const sid = d.stationID ?? '';
        if (!sid || !d.deviceSN) continue;
        if (!devicesPorPlanta.has(sid)) devicesPorPlanta.set(sid, []);
        devicesPorPlanta.get(sid)!.push(d);
      }
      if (lista.length < 100) break;
      pagina++;
    }

    // 3) monta 1 SiteResumo por planta
    const sites: SiteResumo[] = [];
    for (const p of plantsResp) {
      const sid = p.stationID ?? '';
      if (!sid) continue;
      const micros = devicesPorPlanta.get(sid) ?? [];
      const deviceSNs = micros.map((d) => d.deviceSN!).filter(Boolean);
      if (deviceSNs.length === 0) continue;       // planta sem micro reportando — pula
      const kwp = micros.reduce((s, d) => s + capacidadeKw(d.deviceType), 0);
      sites.push({
        externalId: sid,
        apelido: (p.name ?? `Usina ${sid.slice(0, 8)}`).trim(),
        potencia_kwp: kwp > 0 ? Number(kwp.toFixed(2)) : null,
        cidade: null,
        uf: null,
        data_instalacao: null,
        credenciais: buildSiteCredenciais(parsed, sid, deviceSNs),
      });
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
