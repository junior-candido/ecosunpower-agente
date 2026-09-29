// Adapter GoodWe — SEMS+ (us-semsplus.goodwe.com)
//
// HISTÓRICO: até 23/09/2026 usávamos a API interna do SEMS Portal antigo
// (www.semsportal.com/api/v2 — CrossLogin, GetChartByPlant). A GoodWe desligou
// essa plataforma ("This platform is no longer in service") e as usinas GoodWe
// ficaram sem dado. Em 29/09 a API do SEMS+ foi observada ao vivo no portal
// logado (mesma técnica do NEP: replicar o que o próprio site usa). Os IDs das
// estações (UUID) são OS MESMOS do SEMS antigo → os cadastros continuam valendo.
//
// Auth:
//   POST https://us-semsplus.goodwe.com/web/sems/sems-user/api/v1/auth/cross-login
//     body { account, pwd: Base64(MD5hex(senha)), agreement:1, isLocal:false, isChinese:false }
//     header `token` = JSON "vazio" com client semsPlusWeb.
//   A resposta `data` ({uid,timestamp,token,client,...,api,region}) vai INTEIRA,
//   em JSON, no header `token` das chamadas seguintes. `data.api` diz o gateway
//   da conta (ex.: https://us-gateway.semsportal.com/web/sems). É essa string que
//   fica no token-cache. x-signature não é exigido hoje; mandamos mesmo assim
//   (fórmula do portal) — não custa e protege se a GoodWe passar a exigir.
//   Sucesso = code "00000" | "0" | 0. Sessão caída = C0602/C0607/100002/A0301
//   (ou HTTP 401) → reloga 1× e repete.
//
// Endpoints (gateway = origem de data.api):
//   POST {gw}/web/sems/sems-plant/api/stations/production           — kWh de 1 dia
//   POST {gw}/web/sems/sems-plant/api/v1/hems/power/statisticsAndPreV2 — curva kW
//   POST {gw}/sems/sems-dashboard-web/api/front/page/stationPage     — lista + status
//
// GRANULARIDADE = USINA (stationId, UUID). Credenciais no api_credentials JSONB
// (formato inalterado):  conta { email, password } · por usina { email, password, site_id }

import crypto from 'crypto';
import type {
  AdapterResult,
  GeracaoDiaria,
  IntradayPonto,
  IntradayResult,
  ListSitesResult,
  MonitoringAdapter,
  SiteResumo,
} from '../types.js';
import { fetchWithTimeout } from '../util/fetch-with-timeout.js';
import { getOrFetch } from '../util/token-cache.js';
import { retryTransient, isTransientFailure } from '../util/retry.js';
import { hojeBrasilia, somarDias, dataCurtaBr } from '../util/dia-brasilia.js';

const LOGIN_URL = 'https://us-semsplus.goodwe.com/web/sems/sems-user/api/v1/auth/cross-login';
const GATEWAY_PADRAO = 'https://us-gateway.semsportal.com';
// Header `token` usado SÓ no login (ainda sem uid/token).
const LOGIN_TOKEN_HEADER = JSON.stringify({ uid: '', timestamp: 0, token: '', client: 'semsPlusWeb', version: '', language: 'en' });
const CODIGOS_OK = new Set<unknown>(['00000', '0', 0]);
const CODIGOS_SESSAO = new Set<string>(['C0602', 'C0607', '100002', 'A0301']);
// Dias buscados em paralelo por usina (10 usinas × 8 dias ≈ 80 chamadas/rodada).
const DIAS_EM_PARALELO = 4;
// Status das usinas (lista da conta) fica 5 min em memória: 1 lista por rodada, não 1 por usina.
const STATUS_TTL_MS = 5 * 60 * 1000;
// Tipos de estação que a tela do SEMS+ separa (residencial e comercial).
const TIPOS_ESTACAO = ['HOUSEHOLD_PHOTOVOLTAIC', 'INDUSTRIAL_AND_COMMERCIAL'] as const;

// ============================================================================
// CREDENTIALS
// ============================================================================

export interface ParsedCreds {
  email: string;
  password: string;
  siteId?: string;        // stationId (UUID) da planta
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
        'Credenciais GoodWe precisam de { email, password } (login do instalador no SEMS+). ' +
        'Para fetchGeneration também precisa de { site_id } (id da usina).',
    };
  }
  return { email, password, siteId };
}

// Monta credenciais POR PLANTA no formato padrão do registry (chave `site_id`).
export function buildSiteCredenciais(parsed: ParsedCreds, plantaSiteId: string): Record<string, unknown> {
  return { email: parsed.email, password: parsed.password, site_id: plantaSiteId };
}

// ============================================================================
// LOGIN: senha, assinatura, gateway
// ============================================================================

/** pwd do login SEMS+ = Base64 da string MD5 hex minúscula (44 caracteres). */
export function codificarSenha(senha: string): string {
  const md5hex = crypto.createHash('md5').update(senha, 'utf8').digest('hex');
  return Buffer.from(md5hex, 'utf8').toString('base64');
}

/** x-signature do portal: Base64( sha256hex(`${ts}@${uid}@${token}`) + "@" + ts ). */
export function assinaturaSemsPlus(ts: number, uid: string, token: string): string {
  const hash = crypto.createHash('sha256').update(`${ts}@${uid}@${token}`, 'utf8').digest('hex');
  return Buffer.from(`${hash}@${ts}`, 'utf8').toString('base64');
}

/**
 * Bases das APIs a partir de `data.api` do login. Só aceita gateway https da
 * própria GoodWe (semsportal.com / goodwe.com) — o token nunca vai pra outro host.
 */
export function basesDaApi(api: string | undefined | null): { plant: string; dashboard: string } {
  let origem = GATEWAY_PADRAO;
  try {
    const u = new URL(String(api ?? ''));
    if (u.protocol === 'https:' && /(^|\.)(semsportal\.com|goodwe\.com)$/i.test(u.hostname)) origem = u.origin;
  } catch { /* api ausente/ruim → padrão */ }
  return { plant: `${origem}/web/sems/sems-plant/api`, dashboard: `${origem}/sems/sems-dashboard-web/api` };
}

interface LoginData { uid?: string; timestamp?: number | string; token?: string; api?: string; [k: string]: unknown }

function cacheKey(creds: ParsedCreds): string {
  const pwdHash = crypto.createHash('sha256').update(creds.password).digest('hex').slice(0, 12);
  return `goodwe-semsplus|${creds.email.toLowerCase()}|${pwdHash}`;
}

type LoginResult =
  | { ok: true; token: string }
  | { ok: false; reason: string; status?: number; invalidCredentials?: boolean };

// Login = loginOnce + retry em erro passageiro (5xx/429/rede).
async function login(email: string, password: string): Promise<LoginResult> {
  return retryTransient(() => loginOnce(email, password), isTransientFailure);
}

async function loginOnce(email: string, password: string): Promise<LoginResult> {
  let resp: Response;
  try {
    resp = await fetchWithTimeout(LOGIN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', token: LOGIN_TOKEN_HEADER, currentlang: 'en' },
      body: JSON.stringify({ account: email, pwd: codificarSenha(password), agreement: 1, isLocal: false, isChinese: false }),
    });
  } catch (err) {
    return { ok: false, reason: `network: ${(err as Error).message}` };
  }
  if (!resp.ok) return { ok: false, reason: `GoodWe login HTTP ${resp.status}`, status: resp.status };

  let json: SemsEnvelope<LoginData>;
  try {
    json = (await resp.json()) as SemsEnvelope<LoginData>;
  } catch (err) {
    return { ok: false, reason: `GoodWe login: resposta inválida (${(err as Error).message})` };
  }
  if (!CODIGOS_OK.has(json.code) || !json.data?.token) {
    const code = String(json.code ?? '?');
    // Padrão de códigos da GoodWe: A02xx = login recusado (conta/senha) → o
    // Junior corrige. Qualquer outro (B = erro do servidor deles) NÃO desativa
    // a usina — o próximo cron tenta de novo.
    return {
      ok: false,
      reason: `GoodWe login recusado (code=${code}): ${textoErro(json) || 'sem token na resposta'}`,
      invalidCredentials: /^A02/.test(code),
    };
  }
  return { ok: true, token: JSON.stringify(json.data) };
}

// Relogin forçado em andamento por conta — vários dias expirando juntos
// esperam o MESMO login (não martelam o endpoint de login).
const reloginEmAndamento = new Map<string, Promise<LoginResult>>();

async function obterAuth(creds: ParsedCreds): Promise<LoginResult> {
  const key = cacheKey(creds);
  // Relogin em andamento (cache já foi descartado): espera ele em vez de logar de novo.
  const emAndamento = reloginEmAndamento.get(key);
  if (emAndamento) return emAndamento;
  return getOrFetch(key, () => login(creds.email, creds.password));
}

async function renovarAuth(creds: ParsedCreds, tokenVencido: string): Promise<LoginResult> {
  const key = cacheKey(creds);
  let p = reloginEmAndamento.get(key);
  if (!p) {
    p = (async () => {
      // Outro dia já renovou? usa o token novo do cache sem logar de novo.
      const atual = await getOrFetch(key, () => login(creds.email, creds.password));
      if (atual.ok && atual.token !== tokenVencido) return atual;
      return getOrFetch(key, () => login(creds.email, creds.password), undefined, true);
    })().finally(() => reloginEmAndamento.delete(key));
    reloginEmAndamento.set(key, p);
  }
  return p;
}

// ============================================================================
// REQUEST
// ============================================================================

interface SemsEnvelope<T> { code?: string | number; description?: string; msg?: string; data?: T }

type Resp<T> = { ok: true; data: T } | { ok: false; reason: string; status?: number; expired?: boolean };

function textoErro(json: { description?: string; msg?: string }): string {
  return String(json.description ?? json.msg ?? '').slice(0, 200);
}

function cabecalhos(authJson: string): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json', token: authJson, currentlang: 'en' };
  try {
    const d = JSON.parse(authJson) as LoginData;
    h['x-signature'] = assinaturaSemsPlus(Date.now(), String(d.uid ?? ''), String(d.token ?? ''));
  } catch { /* sem assinatura — hoje ela é opcional */ }
  return h;
}

async function semsPostOnce<T>(url: string, body: Record<string, unknown>, authJson: string): Promise<Resp<T>> {
  let resp: Response;
  try {
    resp = await fetchWithTimeout(url, { method: 'POST', headers: cabecalhos(authJson), body: JSON.stringify(body) });
  } catch (err) {
    return { ok: false, reason: `network: ${(err as Error).message}` };
  }
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    return {
      ok: false,
      reason: `GoodWe HTTP ${resp.status}: ${txt.slice(0, 200)}`,
      status: resp.status,
      expired: resp.status === 401,
    };
  }
  let json: SemsEnvelope<T>;
  try {
    json = (await resp.json()) as SemsEnvelope<T>;
  } catch (err) {
    return { ok: false, reason: `GoodWe resposta inválida: ${(err as Error).message}` };
  }
  if (!CODIGOS_OK.has(json.code)) {
    const code = String(json.code ?? '?');
    return { ok: false, reason: `GoodWe code=${code}: ${textoErro(json)}`, expired: CODIGOS_SESSAO.has(code) };
  }
  return { ok: true, data: (json.data as T) ?? ({} as T) };
}

// Chamada autenticada: token do cache (ou login), retry em erro passageiro e,
// se a sessão caiu, UM relogin + UMA repetição.
async function semsPostAuth<T>(
  destino: (bases: { plant: string; dashboard: string }) => string,
  body: Record<string, unknown>,
  creds: ParsedCreds,
): Promise<{ ok: true; data: T } | { ok: false; reason: string; invalidCredentials?: boolean }> {
  const chamar = (authJson: string) => {
    let api: string | undefined;
    try { api = (JSON.parse(authJson) as LoginData).api; } catch { /* padrão */ }
    const url = destino(basesDaApi(api));
    return retryTransient(() => semsPostOnce<T>(url, body, authJson), isTransientFailure);
  };

  const a1 = await obterAuth(creds);
  if (!a1.ok) return { ok: false, reason: a1.reason, invalidCredentials: a1.invalidCredentials };
  const r1 = await chamar(a1.token);
  if (r1.ok) return r1;
  if (!r1.expired) return { ok: false, reason: r1.reason };

  const a2 = await renovarAuth(creds, a1.token);
  if (!a2.ok) return { ok: false, reason: a2.reason, invalidCredentials: a2.invalidCredentials };
  const r2 = await chamar(a2.token);
  if (r2.ok) return r2;
  // Ainda sem acesso depois de relogar: erro (sem desativar — pode ser a usina
  // que saiu da conta, não a senha).
  return { ok: false, reason: r2.reason };
}

// ============================================================================
// PARSING (puro, testável)
// ============================================================================

// Extrai cidade/UF do endereço (string livre). Formato típico:
//   "...Conjunto D, 51 - Planaltina, Brasília - DF, Brasil"
// Só aceita UF de 2 letras (a coluna uf exige NULL ou length=2). Sem match → nulls.
export function parseLocation(location: string | undefined | null): { cidade: string | null; uf: string | null } {
  const s = (location ?? '').trim();
  if (!s) return { cidade: null, uf: null };
  const m = /,\s*([^,]+?)\s*[-–]\s*([A-Za-z]{2})\b\s*(?:,\s*[\d-]{5,10})?\s*(?:,\s*Bra[sz]il\.?)?\s*$/.exec(s);
  if (!m) return { cidade: null, uf: null };
  return { cidade: m[1].trim() || null, uf: m[2].toUpperCase() };
}

function numero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * kWh do dia a partir do stations/production (dimension "day").
 * 0, null, ausente ou negativo = SEM LEITURA (null) — o endpoint não separa
 * "gerou zero" de "não tem dado", e gravar 0 esconderia usina parada.
 */
export function kwhDoDia(data: { proSystemTotalStats?: unknown } | undefined | null): number | null {
  const n = numero(data?.proSystemTotalStats);
  if (n == null || n <= 0) return null;
  return Number(n.toFixed(3));
}

/** Dias de [inicio, fim] (inclusive), sem passar do hoje de Brasília. */
export function diasParaBuscar(inicio: string, fim: string, hoje: string): string[] {
  const ate = fim < hoje ? fim : hoje;
  const out: string[] = [];
  for (let d = inicio, guard = 0; d <= ate && guard < 4000; d = somarDias(d, 1), guard++) out.push(d);
  return out;
}

interface CurvaItem { item?: string; unit?: string; powerData?: Array<{ tp?: string; power?: unknown }> }

/** statisticsAndPreV2 → pontos { hora 'HH:mm', kw } da série pSystem (kW). */
export function parseCurvaSemsPlus(data: { dataList?: CurvaItem[] } | undefined | null): IntradayPonto[] {
  const lista = Array.isArray(data?.dataList) ? data!.dataList : [];
  const serie = lista.find((x) => x?.item === 'pSystem');
  const pts = Array.isArray(serie?.powerData) ? serie!.powerData : [];
  const out: IntradayPonto[] = [];
  for (const p of pts) {
    const hora = String(p?.tp ?? '').slice(11, 16);
    if (!/^\d{2}:\d{2}$/.test(hora)) continue;
    const kw = numero(p?.power);
    if (kw == null) continue;
    out.push({ hora, kw: Number(Math.max(0, kw).toFixed(3)) });
  }
  return out;
}

// Status da estação no SEMS+ (enum do próprio portal, conferido no código da
// tela em 29/09): 0=offline · 1=gerando · 2=falha · 3=em espera · 11=em construção.
// Espera (noite/madrugada) não é problema → 'ok'. Em construção → 'desconhecido'.
export function mapStatusGoodweStation(
  status: number | null | undefined,
): 'ok' | 'offline' | 'falha' | 'desconhecido' {
  if (status === 1 || status === 3) return 'ok';
  if (status === 0) return 'offline';
  if (status === 2) return 'falha';
  return 'desconhecido';
}

export interface StationRec {
  id?: string;
  name?: string;
  status?: number;
  stationAddress?: string | null;
  longitude?: unknown;
  latitude?: unknown;
  installedCapacity?: unknown;   // W (quando vier)
}

// stationPage → SiteResumo (sem credenciais; o adapter injeta). A lista NÃO
// traz potência — fica null (a descoberta não sobrescreve kWp de quem já existe).
export function parseStationRecord(r: StationRec): Omit<SiteResumo, 'credenciais'> | null {
  const id = String(r?.id ?? '').trim();
  if (!id) return null;
  const capW = numero(r.installedCapacity);
  const { cidade, uf } = parseLocation(r.stationAddress);
  const lat = numero(r.latitude);
  const lng = numero(r.longitude);
  const temPosicao = lat != null && lng != null && !(lat === 0 && lng === 0);
  return {
    externalId: id,
    apelido: String(r.name ?? '').trim() || `Usina ${id.slice(0, 8)}`,
    potencia_kwp: capW != null && capW > 0 ? Number((capW / 1000).toFixed(2)) : null,
    cidade,
    uf,
    data_instalacao: null,
    ...(temPosicao ? { lat, lng } : {}),
  };
}

// ============================================================================
// LISTA DE ESTAÇÕES (descoberta + status)
// ============================================================================

interface StationPageData { dataList?: StationRec[]; total?: number | string }

async function listarTipo(
  creds: ParsedCreds,
  tipo: string,
): Promise<{ ok: true; recs: StationRec[] } | { ok: false; reason: string; invalidCredentials?: boolean }> {
  const SIZE = 1000;
  const recs: StationRec[] = [];
  for (let current = 1; current <= 20; current++) {
    const r = await semsPostAuth<StationPageData>(
      (b) => `${b.dashboard}/front/page/stationPage`,
      {
        size: SIZE, current, order: { column: 'createTime', asc: false }, stationTypeEnum: tipo,
        stationAddress: null, email: null, phone: null, unifiedTextSearch: null,
      },
      creds,
    );
    if (!r.ok) {
      if (recs.length === 0) return r;
      console.warn(`[goodwe] stationPage ${tipo} página ${current} falhou (${r.reason}); seguindo com ${recs.length}`);
      break;
    }
    const lista = Array.isArray(r.data?.dataList) ? r.data.dataList : [];
    recs.push(...lista);
    const total = numero(r.data?.total);
    if (lista.length < SIZE || (total != null && recs.length >= total)) break;
  }
  return { ok: true, recs };
}

// Todas as estações da conta (residencial + comercial), sem repetir id.
async function listarEstacoes(
  creds: ParsedCreds,
): Promise<{ ok: true; recs: StationRec[] } | { ok: false; reason: string; invalidCredentials?: boolean }> {
  const porId = new Map<string, StationRec>();
  let falha: { reason: string; invalidCredentials?: boolean } | null = null;
  for (const tipo of TIPOS_ESTACAO) {
    const r = await listarTipo(creds, tipo);
    if (!r.ok) {
      if (r.invalidCredentials) return r;
      falha = r;
      console.warn(`[goodwe] stationPage ${tipo} falhou (${r.reason})`);
      continue;
    }
    for (const rec of r.recs) {
      const id = String(rec?.id ?? '').trim();
      if (id && !porId.has(id)) porId.set(id, rec);
    }
  }
  if (porId.size === 0 && falha) return { ok: false, ...falha };
  return { ok: true, recs: [...porId.values()] };
}

const cacheStatus = new Map<string, { exp: number; porId: Map<string, number | undefined> }>();

async function statusDaUsina(creds: ParsedCreds, siteId: string): Promise<'ok' | 'offline' | 'falha' | 'desconhecido'> {
  const key = cacheKey(creds);
  let entrada = cacheStatus.get(key);
  if (!entrada || entrada.exp <= Date.now()) {
    const r = await listarEstacoes(creds);
    if (!r.ok) return 'desconhecido';
    entrada = { exp: Date.now() + STATUS_TTL_MS, porId: new Map(r.recs.map((x) => [String(x.id ?? '').trim(), x.status])) };
    cacheStatus.set(key, entrada);
  }
  const st = entrada.porId.get(siteId);
  return mapStatusGoodweStation(typeof st === 'number' ? st : numero(st) ?? undefined);
}

/** Limpa os caches do adapter (status da lista + relogins). Útil em testes. */
export function limparCachesGoodwe(): void {
  cacheStatus.clear();
  reloginEmAndamento.clear();
}

// Roda `fn` em cada item com no máximo `limite` ao mesmo tempo (ordem preservada).
async function comLimite<T, R>(itens: T[], limite: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(itens.length);
  let prox = 0;
  const trabalhador = async () => {
    while (prox < itens.length) {
      const i = prox++;
      out[i] = await fn(itens[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador));
  return out;
}

// ============================================================================
// ADAPTER
// ============================================================================

export const goodweAdapter: MonitoringAdapter = {
  marca: 'goodwe',

  // stations/production (dimension "day") — 1 chamada por dia, até o hoje de
  // Brasília. Dia que falhou NÃO entra (o banco mantém o valor anterior) e vira
  // `falhaParcial`; dia sem leitura (0/null) também não entra — nunca 0 kWh inventado.
  async fetchGeneration(
    credenciais: Record<string, unknown>,
    dataInicio: string,
    dataFim: string,
  ): Promise<AdapterResult> {
    const parsed = parseCreds(credenciais);
    if ('error' in parsed) return { ok: false, reason: parsed.error, invalidCredentials: true };
    const siteId = parsed.siteId;
    if (!siteId) {
      return { ok: false, reason: 'GoodWe fetchGeneration precisa de credenciais.site_id (id da usina)', invalidCredentials: true };
    }

    const dias = diasParaBuscar(dataInicio, dataFim, hojeBrasilia());
    if (dias.length === 0) return { ok: true, geracoes: [] };

    // Loga UMA vez antes de abrir os dias em paralelo (senão cada dia logaria).
    const auth = await obterAuth(parsed);
    if (!auth.ok) return { ok: false, reason: auth.reason, invalidCredentials: auth.invalidCredentials };

    type Dia = { dia: string; ok: true; kwh: number | null } | { dia: string; ok: false; reason: string; invalidCredentials?: boolean };
    const resultados = await comLimite(dias, DIAS_EM_PARALELO, async (dia): Promise<Dia> => {
      const r = await semsPostAuth<{ proSystemTotalStats?: unknown }>(
        (b) => `${b.plant}/stations/production`,
        {
          stationId: siteId,
          items: ['profitProStats', 'proSystemTotalStats'],
          dimension: 'day',
          isReport: false,
          startTime: `${dia} 00:00:00`,
          endTime: `${dia} 23:59:59`,
        },
        parsed,
      );
      if (!r.ok) return { dia, ok: false, reason: r.reason, invalidCredentials: r.invalidCredentials };
      return { dia, ok: true, kwh: kwhDoDia(r.data) };
    });

    const credRuim = resultados.find((x) => !x.ok && x.invalidCredentials);
    if (credRuim && !credRuim.ok) return { ok: false, reason: credRuim.reason, invalidCredentials: true };

    const falhas = resultados.filter((x): x is Extract<Dia, { ok: false }> => !x.ok);
    if (falhas.length === dias.length) {
      // Nada respondeu: erro pro cron tentar de novo (não finge "sincronizou").
      return { ok: false, reason: falhas[falhas.length - 1].reason };
    }
    for (const f of falhas) console.warn(`[goodwe] production ${siteId} @${f.dia} falhou (${f.reason})`);

    const geracoes: GeracaoDiaria[] = [];
    for (const x of resultados) {
      if (x.ok && x.kwh != null) geracoes.push({ data: x.dia, geracao_kwh: x.kwh });
    }

    // Status REAL da usina pela lista da conta (cache 5 min). Best-effort:
    // qualquer erro → 'desconhecido' — status nunca derruba a geração.
    let statusInversor: 'ok' | 'offline' | 'falha' | 'desconhecido' = 'desconhecido';
    try { statusInversor = await statusDaUsina(parsed, siteId); } catch { /* best-effort */ }

    let falhaParcial: string | undefined;
    if (falhas.length > 0) {
      const lista = falhas.slice(0, 5).map((f) => dataCurtaBr(f.dia)).join(', ') + (falhas.length > 5 ? ', …' : '');
      falhaParcial = `${falhas.length} de ${dias.length} dias não ${falhas.length === 1 ? 'respondeu' : 'responderam'} (${lista})`;
    }
    return { ok: true, geracoes, statusInversor, ...(falhaParcial ? { falhaParcial } : {}) };
  },

  // statisticsAndPreV2 → curva de potência (kW) do dia, em hora local da usina.
  async fetchIntraday(credenciais: Record<string, unknown>, dia: string): Promise<IntradayResult> {
    const parsed = parseCreds(credenciais);
    if ('error' in parsed) return { ok: false, reason: parsed.error };
    if (!parsed.siteId) return { ok: false, reason: 'GoodWe fetchIntraday precisa de site_id' };
    const r = await semsPostAuth<{ dataList?: CurvaItem[] }>(
      (b) => `${b.plant}/v1/hems/power/statisticsAndPreV2`,
      {
        stationId: parsed.siteId,
        items: ['pSystem'],
        timeScale: 5,          // minutos entre pontos (o portal oferece 1/5/10/30/60)
        timeZone: 3,           // valor que o portal manda pras usinas de Brasília
        startTime: `${dia} 00:00:00`,
        endTime: `${dia} 23:59:59`,
      },
      parsed,
    );
    if (!r.ok) return { ok: false, reason: r.reason };
    return { ok: true, pontos: parseCurvaSemsPlus(r.data) };
  },

  // stationPage (residencial + comercial) → todas as usinas do instalador.
  async listSites(credenciaisConta: Record<string, unknown>): Promise<ListSitesResult> {
    const parsed = parseCreds(credenciaisConta);
    if ('error' in parsed) return { ok: false, reason: parsed.error, invalidCredentials: true };
    const r = await listarEstacoes(parsed);
    if (!r.ok) return { ok: false, reason: r.reason, invalidCredentials: r.invalidCredentials };
    const sites: SiteResumo[] = [];
    for (const rec of r.recs) {
      const base = parseStationRecord(rec);
      if (!base) continue;
      sites.push({ ...base, credenciais: buildSiteCredenciais(parsed, base.externalId) });
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
