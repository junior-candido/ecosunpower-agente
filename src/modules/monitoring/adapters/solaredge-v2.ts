// SolarEdge Monitoring API **V2** (a V1 é desligada em 01/11/2026 — doc oficial
// https://api-docs.solaredge.com/docs/basic-monitoring-api/m32bx376ka8mb-migrating-from-v1-to-v2).
//
// - Base: https://monitoringapi.solaredge.com/v2 · chave no header X-API-Key.
// - Chave "Fleet" (My Fleet) da CONTA do instalador: uma chave cobre todas as
//   usinas da conta. A V2 NÃO tem mais chave por usina.
// - Plano Free: 2.000 créditos/mês e 10 chamadas/min (1 crédito por chamada).
//   Por isso: throttle de 1 chamada a cada 6,5 s e cache por usina (consulta
//   no máx. a cada N min, só de dia) — ver energiaCacheada().
// - Energia DAY: no máx. 1 mês por chamada → partimos o período por mês.
// - Potência QUARTER_HOUR: no máx. 12 h por chamada → o dia vira 2 chamadas.
// - 429: header x-ratelimit-remaining-minute = 0 → limite por minuto; > 0 →
//   acabaram os créditos do mês. Nos dois casos NÃO repete (o service pausa).
import type { AdapterResult, IntradayResult, ListSitesResult, IntradayPonto } from '../types.js';
import { fetchWithTimeout } from '../util/fetch-with-timeout.js';

export const BASE_V2 = 'https://monitoringapi.solaredge.com/v2';
const INTERVALO_MIN_MS = 6500;

type R = { ok: true; data: unknown } | { ok: false; reason: string; status?: number; invalidCredentials?: boolean };

let proximaChamada = 0;
async function esperarVez(): Promise<void> {
  const agora = Date.now();
  const espera = Math.max(0, proximaChamada - agora);
  proximaChamada = Math.max(agora, proximaChamada) + INTERVALO_MIN_MS;
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
}
/** Só pra testes. */
export function _zerarThrottleV2(): void { proximaChamada = 0; cacheEnergia.clear(); }

export async function v2Get(path: string, chave: string, params: Record<string, string>, semThrottle = false): Promise<R> {
  if (!semThrottle) await esperarVez();
  const url = new URL(`${BASE_V2}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let resp: Response;
  try {
    resp = await fetchWithTimeout(url, { headers: { 'X-API-Key': chave, Accept: 'application/json' } });
  } catch (err) {
    return { ok: false, reason: `network: ${(err as Error).message}` };
  }
  if (resp.status === 401 || resp.status === 403) {
    return { ok: false, reason: `SolarEdge V2 ${resp.status} (chave Fleet inválida, vencida ou sem acesso a esta usina)`, invalidCredentials: true };
  }
  if (resp.status === 429) {
    const restMin = Number(resp.headers.get('x-ratelimit-remaining-minute'));
    const motivo = Number.isFinite(restMin) && restMin > 0
      ? 'SolarEdge V2 429: créditos do mês acabaram (plano da API)'
      : 'SolarEdge V2 429: limite de chamadas por minuto';
    return { ok: false, reason: motivo, status: 429 };
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    return { ok: false, reason: `SolarEdge V2 ${resp.status}: ${body.slice(0, 200)}`, status: resp.status };
  }
  try {
    return { ok: true, data: await resp.json() };
  } catch (err) {
    return { ok: false, reason: `JSON invalido: ${(err as Error).message}` };
  }
}

/** Períodos de no máx. 1 mês (DAY): [ini, fim] inclusivos em YYYY-MM-DD. */
export function partirPorMes(ini: string, fim: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  let a = ini;
  while (a <= fim) {
    const [y, m] = a.split('-').map(Number);
    const ultimo = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // último dia do mês de `a`
    const b = ultimo < fim ? ultimo : fim;
    out.push([a, b]);
    a = new Date(Date.parse(`${b}T12:00:00Z`) + 86400_000).toISOString().slice(0, 10);
  }
  return out;
}

const fatorKwh = (unit: unknown): number => {
  const u = String(unit ?? '').toUpperCase();
  return u === 'WH' ? 1 / 1000 : u === 'MWH' ? 1000 : 1; // pedimos KWH; tolera outras
};

export async function v2FetchGeneration(chave: string, siteId: string, dataInicio: string, dataFim: string): Promise<AdapterResult> {
  const geracoes: { data: string; geracao_kwh: number }[] = [];
  for (const [de, ate] of partirPorMes(dataInicio, dataFim)) {
    const r = await v2Get(`/sites/${encodeURIComponent(siteId)}/energy`, chave, {
      from: `${de}T00:00:00`, to: `${ate}T23:59:59`, resolution: 'DAY', unit: 'KWH',
    });
    if (!r.ok) return r;
    const j = r.data as { unit?: string; values?: Array<{ timestamp?: string; value?: number | null }> };
    if (!Array.isArray(j?.values)) return { ok: false, reason: 'Resposta SolarEdge V2 sem values' };
    const f = fatorKwh(j.unit);
    for (const v of j.values) {
      if (typeof v.value !== 'number' || !Number.isFinite(v.value) || !v.timestamp) continue;
      geracoes.push({ data: String(v.timestamp).slice(0, 10), geracao_kwh: Math.max(0, v.value * f) });
    }
  }
  return { ok: true, geracoes };
}

// Cache por usina: no Free cada chamada custa crédito. Consulta só de dia
// (6h–19h BRT) e no máx. a cada SOLAREDGE_V2_INTERVALO_MIN (padrão 120 min);
// fora disso devolve a última resposta da mesma janela.
const cacheEnergia = new Map<string, { em: number; r: AdapterResult }>();
export async function energiaCacheada(
  chave: string, siteId: string, dataInicio: string, dataFim: string, agora: Date = new Date(),
): Promise<AdapterResult> {
  const k = `${siteId}|${dataInicio}|${dataFim}`;
  const c = cacheEnergia.get(k);
  const intervalo = Math.max(15, Number(process.env.SOLAREDGE_V2_INTERVALO_MIN) || 120) * 60_000;
  const horaBrt = (agora.getUTCHours() + 21) % 24;
  const deDia = horaBrt >= 6 && horaBrt < 19;
  if (c && c.r.ok && (agora.getTime() - c.em < intervalo || !deDia)) return c.r;
  const r = await v2FetchGeneration(chave, siteId, dataInicio, dataFim);
  if (r.ok) cacheEnergia.set(k, { em: agora.getTime(), r });
  return r;
}

export async function v2ListSites(chave: string): Promise<ListSitesResult> {
  interface RawSite { siteId?: number | string; id?: number | string; name?: string; peakPower?: number; installationDate?: string; location?: { city?: string } }
  const sites: Array<{ externalId: string; apelido: string; potencia_kwp: number | null; cidade: string | null; uf: null; data_instalacao: string | null; credenciais: Record<string, unknown> }> = [];
  for (let page = 1; page <= 50; page++) {
    const r = await v2Get('/sites', chave, { page: String(page), 'sites-in-page': '1000' });
    if (!r.ok) return r;
    const j = r.data as { sites?: { count?: number; site?: RawSite[] } };
    const lote = j?.sites?.site ?? [];
    if (!Array.isArray(lote)) return { ok: false, reason: 'Resposta SolarEdge V2 sem sites.site' };
    for (const s of lote) {
      const id = s.siteId ?? s.id;
      const apelido = s.name?.trim() ?? '';
      if (id === undefined || !apelido) continue;
      sites.push({
        externalId: String(id), apelido,
        potencia_kwp: typeof s.peakPower === 'number' && Number.isFinite(s.peakPower) ? s.peakPower : null,
        cidade: s.location?.city?.trim() || null, uf: null,
        data_instalacao: s.installationDate ? s.installationDate.slice(0, 10) : null,
        // V2: a chave é da CONTA (Fleet) e mora no ambiente/conta — na usina só o site_id.
        credenciais: { site_id: String(id), api_versao: 'v2' },
      });
    }
    if (lote.length < 1000) break;
  }
  return { ok: true, sites };
}

/** Curva do dia em 15 min (2 chamadas: 00–12h e 12–24h). kW, hora "HH:MM". */
export async function v2FetchIntraday(chave: string, siteId: string, dia: string): Promise<IntradayResult> {
  const pontos: IntradayPonto[] = [];
  for (const [de, ate] of [[`${dia}T00:00:00`, `${dia}T11:59:59`], [`${dia}T12:00:00`, `${dia}T23:59:59`]]) {
    const r = await v2Get(`/sites/${encodeURIComponent(siteId)}/power`, chave, { from: de, to: ate, resolution: 'QUARTER_HOUR' });
    if (!r.ok) return { ok: false, reason: r.reason };
    const j = r.data as { unit?: string; values?: Array<{ timestamp?: string; value?: number | null }> };
    const u = String(j?.unit ?? 'W').toUpperCase();
    const f = u === 'KW' ? 1 : u === 'MW' ? 1000 : 1 / 1000;
    for (const v of j?.values ?? []) {
      if (!v.timestamp || typeof v.value !== 'number' || !Number.isFinite(v.value)) continue;
      const hora = String(v.timestamp).slice(11, 16);
      pontos.push({ hora, kw: Math.max(0, Math.round(v.value * f * 1000) / 1000) });
    }
  }
  if (!pontos.length) return { ok: false, reason: 'Sem curva pra esse dia.' };
  return { ok: true, pontos };
}
