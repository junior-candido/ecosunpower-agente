// Adapter HOYMILES (S-Miles Cloud) — 02/10/2026.
// A Open API oficial é paga e a Hoymiles não respondeu ao pedido. Usamos a API
// do próprio portal/app com o login da conta de INSTALADOR (mesmo padrão de
// NEP/GoodWe SEMS). Fluxo (projetos abertos ioBroker.hoymiles / EnergyDashboard,
// confirmado AO VIVO em 02/10 com a conta EcoSun — 11 usinas):
//   POST /iam/pub/3/auth/pre-insp {u}            → n (uso único) + a (sal)
//   senha: sem sal → md5(senha) + "." + base64(sha256(senha))
//          com sal → Argon2id (ainda não suportado aqui: erro claro)
//   POST /iam/pub/3/auth/login {u, ch, n}        → token (header Authorization, sem "Bearer")
//   POST /pvm/api/0/station/select_by_page        → usinas da conta
//   POST /pvm-report/api/0/station/report/count_eq_by_station
//        {sid_list:[sid], mode:1, start_date, end_date} → data.total_pv_eq (kWh do período)
// ⚠ API não documentada: pode mudar sem aviso (já mudou em 2026). Erros vêm claros.
import { createHash } from 'node:crypto';
import type { AdapterResult, ListSitesResult, MonitoringAdapter, SiteResumo } from '../types.js';
import { fetchWithTimeout } from '../util/fetch-with-timeout.js';
import { getOrFetch } from '../util/token-cache.js';

const BASE = 'https://neapi.hoymiles.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
const INTERVALO_MS = 1200; // gentil com o portal
const MAX_DIAS_POR_SYNC = 400;

interface Creds { email: string; password: string; siteId?: string }
function parseCreds(c: Record<string, unknown>): Creds | { error: string } {
  const email = String(c.email ?? '').trim();
  const password = String(c.password ?? '').trim();
  if (!email || !password) return { error: 'Faltam credenciais Hoymiles (e-mail e senha da conta S-Miles de instalador)' };
  const siteId = String(c.site_id ?? '').trim() || undefined;
  return { email, password, siteId };
}

let proxima = 0;
async function vez(): Promise<void> {
  const agora = Date.now();
  const espera = Math.max(0, proxima - agora);
  proxima = Math.max(agora, proxima) + INTERVALO_MS;
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
}
/** Só pra testes. */
export function _zerarHoymiles(): void { proxima = 0; }

type R = { ok: true; data: any } | { ok: false; reason: string; status?: number; invalidCredentials?: boolean };

async function hmPost(path: string, body: unknown, token?: string): Promise<R> {
  await vez();
  let resp: Response;
  try {
    resp = await fetchWithTimeout(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA, ...(token ? { Authorization: token } : {}) },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, reason: `network: ${(err as Error).message}` };
  }
  if (!resp.ok) return { ok: false, reason: `Hoymiles HTTP ${resp.status}`, status: resp.status };
  let j: any;
  try { j = await resp.json(); } catch { return { ok: false, reason: 'Hoymiles: resposta não é JSON' }; }
  if (String(j?.status) !== '0') {
    const msg = String(j?.message ?? j?.status ?? 'erro');
    const cred = /password|account|user|login|token|auth/i.test(msg);
    return { ok: false, reason: `Hoymiles: ${msg}`, invalidCredentials: cred };
  }
  return { ok: true, data: j.data };
}

/** Senha no formato do app (conta SEM sal). */
export function senhaSemSal(senha: string): string {
  return createHash('md5').update(senha).digest('hex') + '.' + createHash('sha256').update(senha).digest('base64');
}

async function token(c: Creds, forcar = false): Promise<{ ok: true; token: string } | { ok: false; reason: string; invalidCredentials?: boolean }> {
  const key = `hoymiles:${createHash('sha256').update(`${c.email}|${c.password}`).digest('hex').slice(0, 24)}`;
  return getOrFetch(key, async () => {
    const pre = await hmPost('/iam/pub/3/auth/pre-insp', { u: c.email });
    if (!pre.ok) return pre;
    if (pre.data?.a) return { ok: false, reason: 'Hoymiles: esta conta usa senha com sal (Argon2) — conector precisa de atualização', invalidCredentials: false };
    const lg = await hmPost('/iam/pub/3/auth/login', { u: c.email, ch: senhaSemSal(c.password), n: pre.data?.n });
    if (!lg.ok) return { ...lg, invalidCredentials: true };
    const t = String(lg.data?.token ?? '');
    return t ? { ok: true, token: t } : { ok: false, reason: 'Hoymiles: login sem token', invalidCredentials: true };
  }, 3 * 60 * 60 * 1000, forcar);
}

/** Chamada autenticada; token expirado/revogado → relogin 1×. */
async function autenticado(c: Creds, path: string, body: unknown): Promise<R> {
  let t = await token(c);
  if (!t.ok) return t;
  let r = await hmPost(path, body, t.token);
  if (!r.ok && /token|auth|login|expired|unauthor/i.test(r.reason)) {
    t = await token(c, true);
    if (!t.ok) return t;
    r = await hmPost(path, body, t.token);
  }
  return r;
}

function dias(de: string, ate: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${de}T12:00:00Z`); t <= Date.parse(`${ate}T12:00:00Z`); t += 86400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export const hoymilesAdapter: MonitoringAdapter = {
  marca: 'hoymiles',

  // Um dia por chamada (count_eq_by_station soma o período → pedimos dia a dia).
  async fetchGeneration(credenciais, dataInicio, dataFim): Promise<AdapterResult> {
    const c = parseCreds(credenciais);
    if ('error' in c) return { ok: false, reason: c.error, invalidCredentials: true };
    if (!c.siteId) return { ok: false, reason: 'Hoymiles: falta o site_id (sid) da usina', invalidCredentials: true };
    const lista = dias(dataInicio, dataFim).slice(-MAX_DIAS_POR_SYNC);
    const geracoes: { data: string; geracao_kwh: number }[] = [];
    for (const d of lista) {
      const r = await autenticado(c, '/pvm-report/api/0/station/report/count_eq_by_station',
        { sid_list: [Number(c.siteId)], mode: 1, start_date: d, end_date: d });
      if (!r.ok) {
        if (geracoes.length) break; // devolve o que já veio
        return r;
      }
      const kwh = Number(r.data?.total_pv_eq);
      if (Number.isFinite(kwh) && kwh >= 0) geracoes.push({ data: d, geracao_kwh: kwh });
    }
    return { ok: true, geracoes };
  },

  async listSites(credenciaisConta): Promise<ListSitesResult> {
    const c = parseCreds(credenciaisConta);
    if ('error' in c) return { ok: false, reason: c.error, invalidCredentials: true };
    const sites: SiteResumo[] = [];
    for (let page = 1; page <= 20; page++) {
      const r = await autenticado(c, '/pvm/api/0/station/select_by_page', { page, page_size: 100 });
      if (!r.ok) return r;
      const lista: any[] = Array.isArray(r.data?.list) ? r.data.list : [];
      for (const s of lista) {
        const id = s?.id ?? s?.sid;
        const nome = String(s?.name ?? '').trim();
        if (id === undefined || !nome) continue;
        const kwp = Number(s?.capacitor);
        const end = String(s?.address ?? '');
        sites.push({
          externalId: String(id), apelido: nome,
          potencia_kwp: Number.isFinite(kwp) && kwp > 0 ? kwp : null,
          cidade: /Distrito Federal|Bras[ií]lia/i.test(end) ? 'Brasília' : (end.split(',').map((x) => x.trim()).filter(Boolean)[1] ?? null),
          uf: /Distrito Federal/i.test(end) ? 'DF' : null,
          data_instalacao: s?.create_at ? String(s.create_at).slice(0, 10) : null,
          lat: Number.isFinite(Number(s?.latitude)) && Number(s?.latitude) !== 0 ? Number(s.latitude) : null,
          lng: Number.isFinite(Number(s?.longitude)) && Number(s?.longitude) !== 0 ? Number(s.longitude) : null,
          credenciais: { email: c.email, password: c.password, site_id: String(id) },
        });
      }
      if (lista.length < 100) break;
    }
    // Posição: a lista não traz; o detalhe da usina (station/find) traz lat/lng.
    for (const s of sites) {
      if (s.lat != null && s.lng != null) continue;
      const det = await autenticado(c, '/pvm/api/0/station/find', { id: Number(s.externalId) });
      if (!det.ok) continue;
      const la = Number(det.data?.latitude), lo = Number(det.data?.longitude);
      if (Number.isFinite(la) && Number.isFinite(lo) && la !== 0 && lo !== 0) { s.lat = la; s.lng = lo; }
    }
    return { ok: true, sites };
  },

  extractAccountCreds(credsPlanta) {
    const c = parseCreds((credsPlanta ?? {}) as Record<string, unknown>);
    if ('error' in c) return null;
    return { email: c.email, password: c.password };
  },
};
