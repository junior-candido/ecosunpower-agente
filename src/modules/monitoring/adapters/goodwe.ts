// Adapter GoodWe — SEMS Portal (www.semsportal.com/api/...)
//
// API descoberta por engenharia reversa do portal web SEMS (01/07/2026), do mesmo
// jeito que o NEP: em vez do programa oficial de API (que exige NDA + via física +
// whitelist de IP), replicamos a API interna que o próprio site do instalador usa.
// Login com e-mail+senha do instalador → token → lista de usinas + geração. Testado
// ao vivo contra a conta da EcoSunPower (2 usinas, geração real). Vários projetos
// da comunidade (Home Assistant, sems2mqtt) usam exatamente esses endpoints.
//
// Auth: header `Token` = JSON string. No LOGIN o header é fixo
//   {"version":"","client":"web","language":"en"} e o body {account,pwd}.
//   O CrossLogin devolve data={uid,timestamp,token,...}; nas chamadas seguintes o
//   header `Token` passa a ser o JSON com esses campos (uid+timestamp+token). Como
//   o token-cache guarda uma STRING, cacheamos o próprio header de auth já montado.
//
// GRANULARIDADE = USINA (powerstation_id, um UUID). Cada SITE = 1 planta.
//
// Credenciais no api_credentials JSONB:
//   conta:      { email, password }
//   por usina:  { email, password, site_id }   (site_id = powerstation_id)
//
// Endpoints usados:
//   POST /api/v2/Common/CrossLogin                                — login → token
//   POST /api/v2/PowerStationMonitor/QueryPowerStationMonitor      — lista usinas
//   POST /api/v2/Charts/GetChartByPlant (range=2, chartIndexId=3)  — geração diária

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
import { getOrFetch } from '../util/token-cache.js';
import { retryTransient, isTransientFailure } from '../util/retry.js';

// LIMITAÇÃO conhecida: algumas contas SEMS são roteadas pra uma API regional
// (eu./us.semsportal.com) que o CrossLogin devolve em `data.api`. A conta da
// EcoSunPower loga na base global (data.api vem vazio) e www funciona — todas as
// usinas do mesmo login instalador seguem a mesma rota. Se um dia usar uma conta
// de outra região, honrar `data.api` aqui.
const BASE_URL = 'https://www.semsportal.com';
// Header usado SÓ no CrossLogin (ainda sem uid/token).
const LOGIN_TOKEN_HEADER = JSON.stringify({ version: '', client: 'web', language: 'en' });

// ============================================================================
// CREDENTIALS
// ============================================================================

export interface ParsedCreds {
  email: string;
  password: string;
  siteId?: string;        // powerstation_id (UUID) da planta
}

function str(c: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = c[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

export function parseCreds(c: Record<string, unknown>): ParsedCreds | { error: string } {
  const email = str(c, 'email', 'account', 'user');
  const password = str(c, 'password', 'pwd', 'pass');
  // Convenção do adapter-registry: `site_id` (o service.ts deduplica por
  // api_credentials->>site_id). Aceita alguns aliases por robustez.
  const siteId = str(c, 'site_id', 'siteId', 'powerstation_id', 'stationId') || undefined;
  if (!email || !password) {
    return {
      error:
        'Credenciais GoodWe precisam de { email, password } (login do instalador no SEMS Portal). ' +
        'Para fetchGeneration também precisa de { site_id } (powerstation_id da usina).',
    };
  }
  return { email, password, siteId };
}

// Monta credenciais POR PLANTA no formato padrão do registry (chave `site_id`).
export function buildSiteCredenciais(parsed: ParsedCreds, plantaSiteId: string): Record<string, unknown> {
  return { email: parsed.email, password: parsed.password, site_id: plantaSiteId };
}

// ============================================================================
// AUTH HEADER + TOKEN CACHE
// ============================================================================

interface CrossLoginData {
  uid?: string;
  timestamp?: number | string;
  token?: string;
}

// Monta o valor do header `Token` das chamadas autenticadas a partir da
// resposta do CrossLogin. É essa STRING que fica cacheada no token-cache.
export function buildAuthHeader(data: CrossLoginData): string {
  return JSON.stringify({
    uid: data.uid ?? '',
    timestamp: data.timestamp ?? 0,
    token: data.token ?? '',
    client: 'web',
    version: '',
    language: 'en',
  });
}

function cacheKey(creds: ParsedCreds): string {
  const pwdHash = crypto.createHash('sha256').update(creds.password).digest('hex').slice(0, 12);
  return `goodwe|${creds.email.toLowerCase()}|${pwdHash}`;
}

// POST /api/v2/Common/CrossLogin — login e-mail+senha → header de auth pronto.
// crossLogin = crossLoginOnce + retry em erro passageiro (5xx/429/rede). Um blip
// do SEMS no login não pode mais derrubar a conta inteira até o próximo cron. O
// 401/hasError (credencial) NÃO é transitório → não repete (isTransientFailure).
async function crossLogin(email: string, password: string): Promise<
  { ok: true; token: string } | { ok: false; reason: string; status?: number; invalidCredentials?: boolean }
> {
  return retryTransient(() => crossLoginOnce(email, password), isTransientFailure);
}

async function crossLoginOnce(email: string, password: string): Promise<
  { ok: true; token: string } | { ok: false; reason: string; status?: number; invalidCredentials?: boolean }
> {
  let resp: Response;
  try {
    resp = await fetchWithTimeout(`${BASE_URL}/api/v2/Common/CrossLogin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Token: LOGIN_TOKEN_HEADER },
      body: JSON.stringify({ account: email, pwd: password }),
    });
  } catch (err) {
    return { ok: false, reason: `network: ${(err as Error).message}` };
  }
  if (!resp.ok) return { ok: false, reason: `GoodWe CrossLogin HTTP ${resp.status}`, status: resp.status };

  let json: { hasError?: boolean; code?: number; msg?: string; data?: CrossLoginData };
  try {
    json = (await resp.json()) as typeof json;
  } catch (err) {
    return { ok: false, reason: `GoodWe CrossLogin JSON inválido: ${(err as Error).message}` };
  }

  // hasError no login = e-mail/senha errados → invalidCredentials (Junior corrige).
  if (json.hasError || !json.data?.token) {
    return {
      ok: false,
      reason: `GoodWe login falhou (code=${json.code ?? '?'}): ${json.msg ?? 'sem token na resposta'}`,
      invalidCredentials: true,
    };
  }
  return { ok: true, token: buildAuthHeader(json.data) };
}

async function obterAuth(creds: ParsedCreds, forceRefresh = false): Promise<
  { ok: true; token: string } | { ok: false; reason: string; invalidCredentials?: boolean }
> {
  return getOrFetch(cacheKey(creds), () => crossLogin(creds.email, creds.password), undefined, forceRefresh);
}

// ============================================================================
// REQUEST
// ============================================================================

interface SemsEnvelope<T> { hasError?: boolean; code?: number; msg?: string; data?: T }

// Detecta token expirado (≠ credencial errada). SEMS devolve HTTP 200 com
// hasError + msg de sessão nesses casos → força um refresh do login.
function tokenExpirado(status: number, msg: string | undefined, code: number | undefined): boolean {
  if (status === 401 || status === 403) return true;
  if (code === 100001 || code === 100002) return true;
  return /not\s*login|token|expire|auth|会话|登录|登陆/i.test(msg ?? '');
}

// semsPost = semsPostOnce + retry em erro passageiro (5xx/429/rede). O refresh de
// token expirado continua uma camada acima (semsPostAuth); aqui só re-tentamos o
// que é transitório de verdade. `expired` (auth) não é passageiro pra isTransient
// e 401/403 ficam fora do conjunto transitório → auth nunca é repetido aqui.
async function semsPost<T>(
  path: string,
  body: Record<string, unknown>,
  authHeader: string,
): Promise<{ ok: true; data: T } | { ok: false; reason: string; status?: number; expired?: boolean }> {
  return retryTransient(() => semsPostOnce<T>(path, body, authHeader), isTransientFailure);
}

async function semsPostOnce<T>(
  path: string,
  body: Record<string, unknown>,
  authHeader: string,
): Promise<{ ok: true; data: T } | { ok: false; reason: string; status?: number; expired?: boolean }> {
  let resp: Response;
  try {
    resp = await fetchWithTimeout(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Token: authHeader },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, reason: `network: ${(err as Error).message}` };
  }

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    return {
      ok: false,
      reason: `GoodWe HTTP ${resp.status}: ${txt.slice(0, 200)}`,
      status: resp.status,
      expired: tokenExpirado(resp.status, txt, undefined),
    };
  }

  let json: SemsEnvelope<T>;
  try {
    json = (await resp.json()) as SemsEnvelope<T>;
  } catch (err) {
    return { ok: false, reason: `GoodWe JSON inválido: ${(err as Error).message}` };
  }

  if (json.hasError) {
    return {
      ok: false,
      reason: `GoodWe code=${json.code ?? '?'}: ${json.msg ?? ''}`,
      expired: tokenExpirado(200, json.msg, json.code),
    };
  }
  return { ok: true, data: (json.data as T) ?? ({} as T) };
}

// Obtém auth (cache), chama; se o token expirou no meio da janela, força
// refresh e re-tenta UMA vez (igual NEP).
async function semsPostAuth<T>(
  path: string,
  body: Record<string, unknown>,
  creds: ParsedCreds,
): Promise<{ ok: true; data: T } | { ok: false; reason: string; invalidCredentials?: boolean }> {
  const a1 = await obterAuth(creds);
  if (!a1.ok) return a1;

  const r1 = await semsPost<T>(path, body, a1.token);
  if (r1.ok) return r1;
  if (!r1.expired) return { ok: false, reason: r1.reason };

  const a2 = await obterAuth(creds, true);
  if (!a2.ok) return a2;
  const r2 = await semsPost<T>(path, body, a2.token);
  if (r2.ok) return r2;
  // Se ainda expirou após relogar, a credencial provavelmente é inválida.
  return { ok: false, reason: r2.reason, invalidCredentials: r2.expired };
}

// ============================================================================
// PARSING (puro, testável)
// ============================================================================

// Extrai cidade/UF do campo `location` (string livre). Formato típico:
//   "...Conjunto D, 51 - Planaltina, Brasília - DF, Brasil"
// Best-effort: pega o "Cidade - UF" no fim (antes do opcional ", Brasil").
// Só aceita UF de 2 letras (a coluna uf exige NULL ou length=2). Sem match → nulls.
export function parseLocation(location: string | undefined | null): { cidade: string | null; uf: string | null } {
  const s = (location ?? '').trim();
  if (!s) return { cidade: null, uf: null };
  const m = /,\s*([^,]+?)\s*[-–]\s*([A-Za-z]{2})\b\s*(?:,\s*Bra[sz]il\.?)?\s*$/.exec(s);
  if (!m) return { cidade: null, uf: null };
  const cidade = m[1].trim() || null;
  const uf = m[2].toUpperCase();
  return { cidade, uf };
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

// GetChartByPlant range=2 devolve uma janela MÓVEL de ~31 dias TERMINANDO na
// `date` (não é o mês do calendário). Pra cobrir [inicio, fim] arbitrário,
// gera as datas-âncora andando ~30 dias pra trás a partir de `fim`.
export function janelasParaIntervalo(inicio: string, fim: string): string[] {
  const out: string[] = [];
  let d = fim;
  let guard = 0;
  while (guard++ < 60) {
    out.push(d);
    // a janela cobre [d-30, d]; se já alcançou o início, para.
    if (addDays(d, -30) <= inicio) break;
    d = addDays(d, -31);
  }
  return out;
}

interface ChartLine { name?: string; label?: string; unit?: string; xy?: Array<{ x?: string; y?: number | null }> }
interface ChartData { lines?: ChartLine[] }

// Da resposta do GetChartByPlant, pega a linha de geração (PVGeneration, kWh) e
// devolve os dias DENTRO de [inicio, fim] com leitura numérica.
export function parseChartGeneration(data: ChartData, inicio: string, fim: string): GeracaoDiaria[] {
  const lines = Array.isArray(data?.lines) ? data.lines : [];
  const line =
    lines.find((l) => l.name === 'PVGeneration') ??
    lines.find((l) => (l.unit ?? '').toLowerCase() === 'kwh' && /generation/i.test(l.label ?? '')) ??
    lines[0];
  const xy = line && Array.isArray(line.xy) ? line.xy : [];
  const out: GeracaoDiaria[] = [];
  for (const p of xy) {
    const data_ = (p?.x ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data_)) continue;
    if (data_ < inicio || data_ > fim) continue;
    // y null/ausente = dia sem leitura (futuro do mês) → descarta. NÃO coagir
    // null pra 0 (Number(null)===0 marcaria dia futuro como "gerou 0").
    if (typeof p.y !== 'number' || !Number.isFinite(p.y)) continue;
    out.push({ data: data_, geracao_kwh: Math.max(0, p.y) });
  }
  return out;
}

// GetPlantPowerChart devolve a curva de POTÊNCIA do dia. A linha da geração PV
// tem name='PCurve_Power_PV' e unit='W'; xy=[{x:'HH:mm', y:<W>|null}].
interface ChartLineIntra { name?: string; unit?: string; xy?: Array<{ x?: string; y?: number | null }> }
export function parseIntradayGoodwe(data: { lines?: ChartLineIntra[] }): Array<{ hora: string; kw: number }> {
  const lines = Array.isArray(data?.lines) ? data.lines : [];
  const line = lines.find((l) => l.name === 'PCurve_Power_PV')
    ?? lines.find((l) => (l.unit ?? '').toUpperCase() === 'W')
    ?? lines[0];
  const xy = line && Array.isArray(line.xy) ? line.xy : [];
  const out: Array<{ hora: string; kw: number }> = [];
  for (const p of xy) {
    const hora = (p?.x ?? '').trim();
    if (!hora) continue;
    if (typeof p.y !== 'number' || !Number.isFinite(p.y)) continue;
    out.push({ hora, kw: Number((p.y / 1000).toFixed(3)) });
  }
  return out;
}

interface MonitorRecord {
  powerstation_id?: string;
  stationname?: string;
  capacity?: number | string;
  status?: number;
  location?: string;
}

// [Fase 2A — alerta com motivo] Status REAL da usina no SEMS
// (QueryPowerStationMonitor.status: -1=offline · 0=em espera · 1=gerando · 2=falha).
// 0 (standby, ex.: noite/madrugada) NÃO é problema → 'ok'.
export function mapStatusGoodweStation(
  status: number | null | undefined,
): 'ok' | 'offline' | 'falha' | 'desconhecido' {
  if (status === -1) return 'offline';
  if (status === 2) return 'falha';
  if (status === 0 || status === 1) return 'ok';
  return 'desconhecido';
}

// QueryPowerStationMonitor → SiteResumo (sem credenciais; o adapter injeta).
export function parseStationRecord(r: MonitorRecord): Omit<SiteResumo, 'credenciais'> | null {
  const id = (r.powerstation_id ?? '').trim();
  if (!id) return null;
  const cap = typeof r.capacity === 'string' ? Number(r.capacity) : r.capacity;
  const { cidade, uf } = parseLocation(r.location);
  return {
    externalId: id,
    apelido: (r.stationname ?? `Usina ${id.slice(0, 8)}`).trim(),
    potencia_kwp: Number.isFinite(cap) && (cap as number) > 0 ? Number((cap as number).toFixed(2)) : null,
    cidade,
    uf,
    data_instalacao: null,
  };
}

// ============================================================================
// ADAPTER
// ============================================================================

interface QueryMonitorData { list?: MonitorRecord[]; record?: MonitorRecord[] }

export const goodweAdapter: MonitoringAdapter = {
  marca: 'goodwe',

  // GetChartByPlant (range=2, chartIndexId=3) por janela de ~30 dias → geração
  // diária da usina no intervalo. Dedup por dia (janelas se sobrepõem).
  async fetchGeneration(
    credenciais: Record<string, unknown>,
    dataInicio: string,
    dataFim: string,
  ): Promise<AdapterResult> {
    const parsed = parseCreds(credenciais);
    if ('error' in parsed) return { ok: false, reason: parsed.error, invalidCredentials: true };
    if (!parsed.siteId) {
      return { ok: false, reason: 'GoodWe fetchGeneration precisa de credenciais.site_id (powerstation_id)', invalidCredentials: true };
    }

    const porDia = new Map<string, number>();
    let ultimoErro: string | null = null;
    for (const date of janelasParaIntervalo(dataInicio, dataFim)) {
      const r = await semsPostAuth<ChartData>(
        '/api/v2/Charts/GetChartByPlant',
        { id: parsed.siteId, date, range: 2, chartIndexId: '3', isDetailFull: false },
        parsed,
      );
      if (!r.ok) {
        if (r.invalidCredentials) return r;       // credencial ruim: aborta
        // janela pontual falhou: loga e segue (melhor geração parcial que nada)
        ultimoErro = r.reason;
        console.warn(`[goodwe] GetChartByPlant ${parsed.siteId} @${date} falhou (${r.reason}); pula essa janela`);
        continue;
      }
      for (const g of parseChartGeneration(r.data, dataInicio, dataFim)) {
        porDia.set(g.data, g.geracao_kwh);         // último valor do dia vence (idempotente)
      }
    }

    // Nada coletado E houve falha = erro transitório (rede/timeout): devolve erro
    // pro cron RE-TENTAR, em vez de fingir "sincronizou 0". Map vazio sem falha =
    // intervalo só de dias futuros/sem leitura → ok legítimo.
    if (porDia.size === 0 && ultimoErro) {
      return { ok: false, reason: ultimoErro };
    }

    const geracoes: GeracaoDiaria[] = [...porDia.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([data, kwh]) => ({ data, geracao_kwh: Number(kwh.toFixed(3)) }));

    // [Fase 2A] status REAL da usina via QueryPowerStationMonitor (key = busca
    // pelo próprio id). Best-effort: QUALQUER erro → 'desconhecido' — status
    // nunca derruba o sync de geração.
    let statusInversor: 'ok' | 'offline' | 'falha' | 'desconhecido' = 'desconhecido';
    try {
      const st = await semsPostAuth<QueryMonitorData>(
        '/api/v2/PowerStationMonitor/QueryPowerStationMonitor',
        { page_index: 1, page_size: 50, key: parsed.siteId, orderby: '', powerstation_type: '', powerstation_status: '' },
        parsed,
      );
      if (st.ok) {
        const lista = st.data.list ?? st.data.record ?? [];
        const rec = (Array.isArray(lista) ? lista : []).find((x) => (x.powerstation_id ?? '').trim() === parsed.siteId);
        statusInversor = mapStatusGoodweStation(rec?.status);
      }
    } catch { /* best-effort */ }
    return { ok: true, geracoes, statusInversor };
  },

  // GetPlantPowerChart → curva de potência (kW) do dia da usina. Ao vivo.
  async fetchIntraday(credenciais: Record<string, unknown>, dia: string): Promise<IntradayResult> {
    const parsed = parseCreds(credenciais);
    if ('error' in parsed) return { ok: false, reason: parsed.error };
    if (!parsed.siteId) return { ok: false, reason: 'GoodWe fetchIntraday precisa de site_id' };
    const r = await semsPostAuth<{ lines?: ChartLineIntra[] }>(
      '/api/v2/Charts/GetPlantPowerChart',
      { id: parsed.siteId, date: dia, full_script: false },
      parsed,
    );
    if (!r.ok) return { ok: false, reason: r.reason };
    return { ok: true, pontos: parseIntradayGoodwe(r.data) };
  },

  // QueryPowerStationMonitor paginado → todas as usinas do instalador.
  async listSites(credenciaisConta: Record<string, unknown>): Promise<ListSitesResult> {
    const parsed = parseCreds(credenciaisConta);
    if ('error' in parsed) return { ok: false, reason: parsed.error, invalidCredentials: true };

    const sites: SiteResumo[] = [];
    const PAGE_SIZE = 50;
    let page = 1;
    let safety = 40; // 40 × 50 = 2000 usinas
    while (safety-- > 0) {
      const r = await semsPostAuth<QueryMonitorData>(
        '/api/v2/PowerStationMonitor/QueryPowerStationMonitor',
        { page_index: page, page_size: PAGE_SIZE, key: '', orderby: '', powerstation_type: '', powerstation_status: '' },
        parsed,
      );
      if (!r.ok) {
        // Auth quebrada ou nada coletado: erro. Já tem plantas: parcial (melhor
        // importar N usinas que perder tudo por uma página).
        if (r.invalidCredentials || sites.length === 0) {
          return { ok: false, reason: r.reason, invalidCredentials: r.invalidCredentials };
        }
        console.warn(`[goodwe] listSites: página ${page} falhou (${r.reason}); retornando ${sites.length} parciais`);
        return { ok: true, sites };
      }

      const list = r.data.list ?? r.data.record ?? [];
      if (!Array.isArray(list)) break;
      for (const rec of list) {
        const base = parseStationRecord(rec);
        if (!base) continue;
        sites.push({ ...base, credenciais: buildSiteCredenciais(parsed, base.externalId) });
      }
      if (list.length < PAGE_SIZE) break;
      page++;
    }
    return { ok: true, sites };
  },

  // GoodWe: credenciais da conta = e-mail+senha sem o site_id.
  extractAccountCreds(credsPlanta) {
    const parsed = parseCreds(credsPlanta as Record<string, unknown>);
    if ('error' in parsed) return null;
    return { email: parsed.email, password: parsed.password };
  },
};
