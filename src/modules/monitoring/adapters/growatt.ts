// Adapter GROWATT — OpenAPI V1 oficial com TOKEN (02/10/2026).
// O login clássico (usuário/senha) BLOQUEIA a conta por até 24 h quando acha
// consulta demais (relatos 2023–2025) — numa conta de instalador isso derruba a
// carteira inteira. Por isso: só token oficial (header `token`).
// Fontes: growattServer (OpenApiV1, cita o showdoc oficial), Growatt Server API
// Guide (growatt.pl), Home Assistant growatt_server (2026).
//   GET {base}/v1/plant/list?page&perpage                     → usinas da conta
//   GET {base}/v1/plant/energy?plant_id&start_date&end_date&time_unit=day&perpage=100
//       (time_unit=day: no máx. 7 dias por chamada)            → energia por dia (kWh)
//   GET {base}/v1/plant/power?plant_id&date                    → curva do dia (W)
// Base padrão (fora EUA/China/Austrália): https://openapi.growatt.com
// Limite: relatos de erro consultando a cada 5 min → aqui 2 s entre chamadas e
// geração em blocos de 7 dias.
// ⚠ Ainda NÃO validado ao vivo (aguardando token). Parse tolerante a nomes.
import type { AdapterResult, IntradayResult, ListSitesResult, MonitoringAdapter, SiteResumo } from '../types.js';
import { fetchWithTimeout } from '../util/fetch-with-timeout.js';

const BASE_PADRAO = 'https://openapi.growatt.com';
const INTERVALO_MS = 2000;

interface Creds { token: string; base: string; siteId?: string }
function parseCreds(c: Record<string, unknown>): Creds | { error: string } {
  const token = String(c.token ?? '').trim();
  if (!token) return { error: 'Falta o token da OpenAPI Growatt (peça em oss.growatt.com → System Management → Add API Request, ou no app ShinePhone → Me → API Token)' };
  let base = String(c.base ?? c.server ?? '').trim().replace(/\/+$/, '').replace(/\/v1$/, '');
  if (!/^https:\/\/openapi(-us|-cn|-au)?\.growatt\.com$/.test(base)) base = BASE_PADRAO; // só hosts oficiais
  const siteId = String(c.site_id ?? c.plant_id ?? '').trim() || undefined;
  return { token, base, siteId };
}

let proxima = 0;
async function vez(): Promise<void> {
  const agora = Date.now();
  const espera = Math.max(0, proxima - agora);
  proxima = Math.max(agora, proxima) + INTERVALO_MS;
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
}
/** Só pra testes. */
export function _zerarGrowatt(): void { proxima = 0; }

type R = { ok: true; data: any } | { ok: false; reason: string; status?: number; invalidCredentials?: boolean };

async function gwGet(c: Creds, path: string, params: Record<string, string | number>): Promise<R> {
  await vez();
  const url = new URL(`${c.base}/v1/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  let resp: Response;
  try {
    resp = await fetchWithTimeout(url, { headers: { token: c.token, Accept: 'application/json' } });
  } catch (err) {
    return { ok: false, reason: `network: ${(err as Error).message}` };
  }
  if (resp.status === 401 || resp.status === 403) return { ok: false, reason: `Growatt ${resp.status}: token inválido ou sem acesso`, invalidCredentials: true };
  if (!resp.ok) return { ok: false, reason: `Growatt HTTP ${resp.status}`, status: resp.status };
  let j: any;
  try { j = await resp.json(); } catch { return { ok: false, reason: 'Growatt: resposta não é JSON' }; }
  const code = Number(j?.error_code ?? 0);
  if (code !== 0) {
    const msg = String(j?.error_msg ?? `código ${code}`);
    if (/token|auth|permission|login/i.test(msg)) return { ok: false, reason: `Growatt: ${msg}`, invalidCredentials: true };
    if (code === 10012 || /frequen|too many|limit/i.test(msg)) return { ok: false, reason: `Growatt: limite de consultas (${msg})`, status: 429 };
    return { ok: false, reason: `Growatt: ${msg}` };
  }
  return { ok: true, data: j?.data ?? {} };
}

const n = (v: unknown): number | null => { const x = Number(v); return Number.isFinite(x) ? x : null; };

/** Blocos de no máx. 7 dias [ini, fim] (inclusivos). */
export function blocosDe7(ini: string, fim: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (let t = Date.parse(`${ini}T12:00:00Z`); t <= Date.parse(`${fim}T12:00:00Z`); t += 7 * 86400_000) {
    const a = new Date(t).toISOString().slice(0, 10);
    const bT = Math.min(t + 6 * 86400_000, Date.parse(`${fim}T12:00:00Z`));
    out.push([a, new Date(bT).toISOString().slice(0, 10)]);
  }
  return out;
}

export const growattAdapter: MonitoringAdapter = {
  marca: 'growatt',

  async fetchGeneration(credenciais, dataInicio, dataFim): Promise<AdapterResult> {
    const c = parseCreds(credenciais);
    if ('error' in c) return { ok: false, reason: c.error, invalidCredentials: true };
    if (!c.siteId) return { ok: false, reason: 'Growatt: falta o plant_id da usina', invalidCredentials: true };
    const blocos = blocosDe7(dataInicio, dataFim).slice(-60); // até ~14 meses por sync
    const geracoes: { data: string; geracao_kwh: number }[] = [];
    for (const [de, ate] of blocos) {
      const r = await gwGet(c, 'plant/energy', { plant_id: c.siteId, start_date: de, end_date: ate, time_unit: 'day', page: 1, perpage: 100 });
      if (!r.ok) { if (geracoes.length) break; return r; }
      const lista: any[] = Array.isArray(r.data?.energys) ? r.data.energys : Array.isArray(r.data?.energy) ? r.data.energy : [];
      for (const e of lista) {
        const data = String(e?.date ?? e?.time ?? '').slice(0, 10);
        const kwh = n(e?.energy ?? e?.value);
        if (/^\d{4}-\d{2}-\d{2}$/.test(data) && kwh !== null && kwh >= 0) geracoes.push({ data, geracao_kwh: kwh });
      }
    }
    return { ok: true, geracoes };
  },

  async fetchIntraday(credenciais, dia): Promise<IntradayResult> {
    const c = parseCreds(credenciais);
    if ('error' in c) return { ok: false, reason: c.error };
    if (!c.siteId) return { ok: false, reason: 'Growatt: falta o plant_id' };
    const r = await gwGet(c, 'plant/power', { plant_id: c.siteId, date: dia });
    if (!r.ok) return { ok: false, reason: r.reason };
    const lista: any[] = Array.isArray(r.data?.powers) ? r.data.powers : [];
    const pontos = lista.map((p) => ({ hora: String(p?.time ?? '').slice(11, 16), kw: (n(p?.power) ?? 0) / 1000 }))
      .filter((p) => /^\d{2}:\d{2}$/.test(p.hora));
    return pontos.length ? { ok: true, pontos } : { ok: false, reason: 'Sem curva pra esse dia.' };
  },

  async listSites(credenciaisConta): Promise<ListSitesResult> {
    const c = parseCreds(credenciaisConta);
    if ('error' in c) return { ok: false, reason: c.error, invalidCredentials: true };
    const sites: SiteResumo[] = [];
    for (let page = 1; page <= 50; page++) {
      const r = await gwGet(c, 'plant/list', { page, perpage: 100 });
      if (!r.ok) return r;
      const lista: any[] = Array.isArray(r.data?.plants) ? r.data.plants : [];
      for (const p of lista) {
        const id = p?.plant_id ?? p?.id;
        const nome = String(p?.name ?? p?.plant_name ?? '').trim();
        if (id === undefined || !nome) continue;
        const kwp = n(p?.peak_power);
        const lat = n(p?.latitude), lng = n(p?.longitude);
        sites.push({
          externalId: String(id), apelido: nome,
          potencia_kwp: kwp !== null && kwp > 0 ? kwp : null,
          cidade: String(p?.city ?? '').trim() || null, uf: null,
          data_instalacao: p?.create_date ? String(p.create_date).slice(0, 10) : null,
          lat: lat !== null && lat !== 0 ? lat : null, lng: lng !== null && lng !== 0 ? lng : null,
          credenciais: { token: c.token, base: c.base, site_id: String(id) },
        });
      }
      const total = n(r.data?.count);
      if (lista.length < 100 || (total !== null && sites.length >= total)) break;
    }
    return { ok: true, sites };
  },

  extractAccountCreds(credsPlanta) {
    const c = parseCreds((credsPlanta ?? {}) as Record<string, unknown>);
    if ('error' in c) return null;
    return { token: c.token, base: c.base };
  },
};
