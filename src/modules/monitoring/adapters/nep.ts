// Adapter NEP (Northern Electric Power) — microinversores BDM via api.nepviewer.net
//
// API descoberta via engenharia reversa do app web NEPViewer (28/05/2026). Não tem
// doc pública oficial. Comunidade Home Assistant mapeou base; este adapter usa o
// mesmo endpoint que o site instalador (user.nepviewer.com) consome.
//
// Auth: header `Authorization: <JWT puro>` (sem prefixo "Bearer"). JWT vive ~30
// dias. Renovação automática quando Junior cadastra email+password (modo prod);
// modo `jwt` direto serve pra teste/MVP.
//
// Header `sign`: assinatura caseira do payload — MD5(stringify(body) sem-espaços
// com toda letra `e` minúscula trocada por `NEP`), em UPPERCASE. Algoritmo extraído
// do JS minificado do app web. Validado contra 6 payloads do HAR.
//
// Credenciais esperadas no api_credentials JSONB:
//   modo MVP:  { jwt: "eyJ..." }
//   modo prod: { email: "...", password: "..." }   (renova JWT sozinho)
//
// Endpoints usados:
//   POST /v2/site/listWithSN        — lista plantas + SNs + KPIs do instalador
//   POST /v2/site/statistics/echarts — geração diária (types=3) p/ planta+período

import crypto from 'crypto';
import type { AdapterResult, ListSitesResult, MonitoringAdapter, SiteResumo } from '../types.js';
import { fetchWithTimeout } from '../util/fetch-with-timeout.js';
import { getOrFetch } from '../util/token-cache.js';
import { retryTransient, isTransientFailure } from '../util/retry.js';

const BASE_URL = 'https://api.nepviewer.net';

// ============================================================================
// SIGN — algoritmo extraído do app NEPViewer
// ============================================================================
//
// Do JS minificado (interceptor axios):
//   let t = "";
//   if (e.data) {
//     t = JSON.stringify(e.data)
//          .replace(/[ ]|[\r\n]/g, "")
//          .replace(/e/g, "NEP");
//   }
//   const n = MD5(t).toUpperCase();
//   e.headers.sign = n;
export function nepSign(body: unknown): string {
  const text =
    body === undefined || body === null
      ? ''
      : JSON.stringify(body).replace(/[ \r\n]/g, '').replace(/e/g, 'NEP');
  return crypto.createHash('md5').update(text, 'utf8').digest('hex').toUpperCase();
}

// ============================================================================
// TOKEN CACHE — usa util compartilhado (src/modules/monitoring/util/token-cache.ts)
// ============================================================================

function cacheKey(creds: ParsedCreds): string {
  if (creds.mode === 'jwt') {
    return `nep|jwt|${crypto.createHash('sha256').update(creds.jwt).digest('hex').slice(0, 16)}`;
  }
  return `nep|login|${creds.email}|${crypto.createHash('sha256').update(creds.password).digest('hex').slice(0, 12)}`;
}

// ============================================================================
// CREDENTIALS
// ============================================================================

type ParsedCreds =
  | { mode: 'jwt'; jwt: string; sid?: string }
  | { mode: 'login'; email: string; password: string; sid?: string };

export function parseCreds(c: Record<string, unknown>): ParsedCreds | { error: string } {
  const jwt = typeof c.jwt === 'string' ? c.jwt.trim() : '';
  const email = typeof c.email === 'string' ? c.email.trim() : '';
  const password = typeof c.password === 'string' ? c.password.trim() : '';
  // ID da planta. Convenção do adapter-registry é `site_id` (igual SolarEdge/
  // Deye) — o service.ts deduplica por `api_credentials->>site_id`. Versões
  // antigas do NEP gravavam `sid`; aceitamos os dois (site_id tem prioridade)
  // pra não quebrar plantas já cadastradas. BUG corrigido: gravar `sid` fazia
  // a descoberta nunca achar a planta → duplicava a cada hora.
  const sid =
    typeof c.site_id === 'string' && c.site_id.trim()
      ? c.site_id.trim()
      : typeof c.sid === 'string' && c.sid.trim()
        ? c.sid.trim()
        : undefined;

  if (jwt) {
    return { mode: 'jwt', jwt, sid };
  }
  if (email && password) {
    // Modo RENOVAÇÃO AUTOMÁTICA: o adapter loga sozinho (signIn) e renova o JWT
    // quando expira — Junior nunca mais mexe. /v2/sign-in mapeado em 27/06.
    return { mode: 'login', email, password, sid };
  }
  return {
    error:
      'Credenciais NEP precisam de { jwt }. ' +
      'Para fetchGeneration tambem precisa de { site_id } (id da planta).',
  };
}

// Monta as credenciais POR PLANTA no formato PADRÃO do adapter-registry:
// chave `site_id` (NÃO `sid`) — é por ela que o service.ts deduplica
// (`api_credentials->>site_id`). Gravar `sid` furava o dedup e duplicava as
// plantas a cada rodada de descoberta.
export function buildSiteCredenciais(parsed: ParsedCreds, plantaSiteId: string): Record<string, unknown> {
  return parsed.mode === 'jwt'
    ? { jwt: parsed.jwt, site_id: plantaSiteId }
    : { email: parsed.email, password: parsed.password, site_id: plantaSiteId };
}

// Normaliza UF pro formato do banco: a coluna `uf` exige NULL ou 2 letras
// (CHECK uf IS NULL OR length(uf)=2). A NEP manda o estado como NOME completo
// ("Acre") e quase sempre ERRADO (plantas de DF/GO vêm como "Acre") — então
// só aceitamos se já vier como sigla de 2 letras; caso contrário null (a UF
// real é preenchida depois pelo cliente/proprietário). Sem isso, o insert das
// plantas batia no uf_check e falhava silenciosamente.
export function normalizeUf(stateName: string | undefined | null): string | null {
  const s = (stateName ?? '').trim();
  return s.length === 2 ? s.toUpperCase() : null;
}

// ============================================================================
// AUTH
// ============================================================================

type TokenResult =
  | { ok: true; token: string }
  | { ok: false; reason: string; status?: number; invalidCredentials?: boolean };

async function obterToken(creds: ParsedCreds, forceRefresh = false): Promise<TokenResult> {
  return getOrFetch(
    cacheKey(creds),
    async () => {
      if (creds.mode === 'jwt') {
        // Modo MVP: JWT veio pronto nas credenciais. Validação só fica por
        // conta da API (se for inválido, requests vão dar 401 e o adapter
        // marca invalidCredentials → Junior atualiza nas credenciais).
        return { ok: true, token: creds.jwt };
      }
      return signIn(creds.email, creds.password);
    },
    undefined,
    forceRefresh,
  );
}

// POST /v2/sign-in — login com email/senha → retorna JWT. Renova sozinho.
// Mapeado via Network do NEPViewer (27/06): body { account, password }, mesmos
// headers das outras chamadas (+ sign), token em data.userInfo.token.
// É o que torna o modo email+password automático (igual ABB/Deye): quando o
// JWT cacheado expira/401, obterToken chama signIn e renova sem ninguem mexer.
async function signIn(email: string, password: string): Promise<TokenResult> {
  return retryTransient(() => signInOnce(email, password), isTransientFailure);
}

async function signInOnce(email: string, password: string): Promise<TokenResult> {
  const body = { account: email, password };
  let resp: Response;
  try {
    resp = await fetchWithTimeout(`${BASE_URL}/v2/sign-in`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'app': '0',
        'client': 'web',
        'lan': '5',
        'oem': 'NEP',
        'sign': nepSign(body),
        'Origin': 'https://user.nepviewer.com',
        'Referer': 'https://user.nepviewer.com/',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, reason: `network: ${(err as Error).message}` };
  }

  if (!resp.ok) {
    return { ok: false, reason: `NEP sign-in HTTP ${resp.status}`, status: resp.status };
  }

  let json: { code?: number; msg?: string; data?: { userInfo?: { token?: string } } };
  try {
    json = (await resp.json()) as typeof json;
  } catch (err) {
    return { ok: false, reason: `NEP sign-in JSON invalido: ${(err as Error).message}` };
  }

  if (json.code !== 200) {
    // code != 200 no login = email/senha errados → invalidCredentials (Junior corrige).
    return { ok: false, reason: `NEP sign-in code=${json.code}: ${json.msg ?? ''}`, invalidCredentials: true };
  }
  // O JWT pode vir em data.token, data.userInfo.token, etc — varia. Em vez de
  // cravar o caminho, acha o token de forma robusta (string com cara de JWT).
  const token = extrairToken(json.data);
  if (!token) {
    return { ok: false, reason: `NEP sign-in: token (JWT) nao encontrado na resposta (msg: ${json.msg ?? ''})` };
  }
  return { ok: true, token };
}

// Acha o JWT na resposta do sign-in sem depender do caminho exato:
// 1) tenta os campos mais comuns; 2) varre recursivamente atras de um valor
//    com cara de JWT (eyJ....). Robusto a mudanca de estrutura da API.
export function extrairToken(data: unknown): string | undefined {
  const jwtRe = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/;
  if (!data || typeof data !== 'object') {
    return typeof data === 'string' && jwtRe.test(data) ? data : undefined;
  }
  const d = data as Record<string, unknown>;
  const ui = d.userInfo as Record<string, unknown> | undefined;
  for (const cand of [d.token, ui?.token, d.access_token, ui?.access_token, d.accessToken, ui?.accessToken]) {
    if (typeof cand === 'string' && jwtRe.test(cand)) return cand;
  }
  // fallback: varredura recursiva
  const seen = new Set<unknown>();
  const walk = (v: unknown): string | undefined => {
    if (typeof v === 'string') return jwtRe.test(v) ? v : undefined;
    if (v && typeof v === 'object' && !seen.has(v)) {
      seen.add(v);
      for (const val of Object.values(v as Record<string, unknown>)) {
        const found = walk(val);
        if (found) return found;
      }
    }
    return undefined;
  };
  return walk(d);
}

// ============================================================================
// REQUEST HELPER
// ============================================================================

interface NepResponse<T> { code: number; msg: string; data: T }

type NepPostResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: string; status?: number; invalidCredentials?: boolean };

// nepPost = nepPostOnce + retry em erro passageiro (502 & cia). Um blip de alguns
// minutos no servidor da NEP não pode mais derrubar a integração até o próximo
// cron (que pra micro é 1× por dia). O refresh de 401 continua uma camada acima,
// no nepPostAuth — aqui só re-tentamos o que é transitório de verdade.
async function nepPost<T = unknown>(
  endpoint: string,
  body: Record<string, unknown>,
  token: string,
): Promise<NepPostResult<T>> {
  return retryTransient<NepPostResult<T>>(
    () => nepPostOnce<T>(endpoint, body, token),
    isTransientFailure,
  );
}

async function nepPostOnce<T = unknown>(
  endpoint: string,
  body: Record<string, unknown>,
  token: string,
): Promise<NepPostResult<T>> {
  const url = `${BASE_URL}${endpoint}`;
  const bodyStr = JSON.stringify(body);
  const sign = nepSign(body);

  let resp: Response;
  try {
    resp = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token,            // JWT puro, sem "Bearer"
        'app': '0',
        'client': 'web',
        'lan': '5',                         // 5 = pt-BR (LANG-CODE do app)
        'oem': 'NEP',
        'sign': sign,
        'Origin': 'https://user.nepviewer.com',
        'Referer': 'https://user.nepviewer.com/',
      },
      body: bodyStr,
    });
  } catch (err) {
    return { ok: false, reason: `network: ${(err as Error).message}` };
  }

  if (resp.status === 401 || resp.status === 403) {
    return {
      ok: false,
      reason: `NEP ${resp.status} (JWT invalido/expirado)`,
      status: resp.status,
      invalidCredentials: true,
    };
  }
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    return { ok: false, reason: `NEP ${resp.status}: ${txt.slice(0, 200)}`, status: resp.status };
  }

  let json: NepResponse<T>;
  try {
    json = (await resp.json()) as NepResponse<T>;
  } catch (err) {
    return { ok: false, reason: `NEP JSON invalido: ${(err as Error).message}` };
  }

  if (json.code !== 200) {
    return { ok: false, reason: `NEP code=${json.code}: ${json.msg}`, status: json.code };
  }
  return { ok: true, data: json.data };
}

// Re-tenta uma vez se primeira chamada deu 401 (JWT expirou no meio da janela).
async function nepPostAuth<T = unknown>(
  endpoint: string,
  body: Record<string, unknown>,
  creds: ParsedCreds,
): Promise<{ ok: true; data: T } | { ok: false; reason: string; invalidCredentials?: boolean }> {
  const tk1 = await obterToken(creds);
  if (!tk1.ok) return tk1;

  const r1 = await nepPost<T>(endpoint, body, tk1.token);
  if (r1.ok) return r1;

  if (r1.invalidCredentials && creds.mode === 'login') {
    // 401 com login flow: força refresh e re-tenta UMA vez
    const tk2 = await obterToken(creds, true);
    if (!tk2.ok) return tk2;
    const r2 = await nepPost<T>(endpoint, body, tk2.token);
    if (r2.ok) return r2;
    return { ok: false, reason: r2.reason, invalidCredentials: r2.invalidCredentials };
  }
  return { ok: false, reason: r1.reason, invalidCredentials: r1.invalidCredentials };
}

// ============================================================================
// API SHAPES
// ============================================================================

interface ListWithSNRespRaw {
  list: Array<{
    sid: string;
    siteName: string;
    country: string;
    countryName: string;
    stateName: string;
    city: string;
    street: string;
    userEmail: string;
    installerEmail: string;
    registerDate: string;       // "23/03/2026 21:12"
    snCount: number;
    sn: Array<{
      sid: string;
      sn: string;
      model: string;             // ex "BDM-2250"
      status: number;            // 0 = online (visto em prod)
      statusTitle: string;
      alertCode: string;
      alertTitle: string;
      alertDescription: string;
      lastUpdate: string;
      lastUpdateTime: number;
      now: number;
      todayPower: number;
      totalPower: number;
      nowUnit: string;
      todayPowerUnit: string;
      totalPowerUnit: string;
    }>;
  }>;
  total?: number;
}

interface EchartsRespRaw {
  legend: string[];
  xAxisData: string[];          // ["01/05", "02/05", ...]
  series: Array<{
    stack?: string;
    name: string;
    data: Array<number | null>;
  }>;
}

// ============================================================================
// ADAPTER
// ============================================================================

export const nepAdapter: MonitoringAdapter = {
  marca: 'nep',

  // POST /v2/site/statistics/echarts com types=3 → série diária por SN.
  // Soma todas as séries por índice de dia → geração da planta no dia.
  async fetchGeneration(
    credenciais: Record<string, unknown>,
    dataInicio: string,         // YYYY-MM-DD
    dataFim: string,            // YYYY-MM-DD
  ): Promise<AdapterResult> {
    const parsed = parseCreds(credenciais);
    if ('error' in parsed) {
      return { ok: false, reason: parsed.error, invalidCredentials: true };
    }
    if (!parsed.sid) {
      return {
        ok: false,
        reason: 'NEP fetchGeneration precisa de credenciais.site_id (id da planta)',
        invalidCredentials: true,
      };
    }

    const body = {
      types: 3,
      rangeDate: `${dataInicio}~${dataFim}`,
      sid: parsed.sid,
    };

    const r = await nepPostAuth<EchartsRespRaw>('/v2/site/statistics/echarts', body, parsed);
    if (!r.ok) return r;

    const { xAxisData, series } = r.data;
    if (!Array.isArray(xAxisData) || !Array.isArray(series)) {
      return { ok: false, reason: 'NEP echarts: resposta sem xAxisData/series' };
    }

    const geracoes = agregarGeracaoDiaria(xAxisData, series, dataInicio);
    const statusInversor = derivarStatusDoEcharts(series);

    return { ok: true, geracoes, statusInversor };
  },

  // POST /v2/site/listWithSN paginado → todas as plantas do instalador.
  async listSites(credenciaisConta: Record<string, unknown>): Promise<ListSitesResult> {
    const parsed = parseCreds(credenciaisConta);
    if ('error' in parsed) {
      return { ok: false, reason: parsed.error, invalidCredentials: true };
    }

    const sites: SiteResumo[] = [];
    const PAGE_SIZE = 50;
    let pageNum = 0;
    let safety = 20; // hard cap: 20 páginas × 50 = 1000 plantas

    while (safety-- > 0) {
      const body = {
        page: { size: PAGE_SIZE, num: pageNum },
        filters: {
          keywords: '', site_name: '', user_email: '', installer_email: '',
          country_code: '', created_start_date: '', created_end_date: '', street: '',
        },
        sort: [],
      };
      const r = await nepPostAuth<ListWithSNRespRaw>('/v2/site/listWithSN', body, parsed);
      if (!r.ok) {
        // Falha em pagina intermediaria: invalidCredentials nao tem partial possivel
        // (auth quebrou), retorna erro. Falha generica com sites ja coletados:
        // retorna partial com warning — melhor importar 700 plantas que perder 800.
        if (r.invalidCredentials || sites.length === 0) {
          return { ok: false, reason: r.reason, invalidCredentials: r.invalidCredentials };
        }
        console.warn(`[nep] listSites: pagina ${pageNum} falhou (${r.reason}); retornando ${sites.length} plantas parciais`);
        return { ok: true, sites };
      }

      // API devolveu code:200 mas data.list ausente/null = comportamento anormal.
      // Anteriormente caia no `?? []` e saia silenciosamente do loop, dando
      // ilusao de termino. Agora loga warn e para — Junior ve no log que faltou.
      if (!r.data || !Array.isArray(r.data.list)) {
        console.warn(`[nep] listSites: pagina ${pageNum} sem data.list (resposta anormal); parando com ${sites.length} plantas`);
        return { ok: true, sites };
      }
      const list = r.data.list;
      for (const p of list) {
        if (!p.sid || !p.siteName) continue;
        sites.push({
          externalId: p.sid,
          apelido: p.siteName.trim(),
          potencia_kwp: estimarKwpPorSNs(p.sn),
          cidade: p.city?.trim() || null,
          uf: normalizeUf(p.stateName),
          data_instalacao: parseDataInstalacao(p.registerDate),
          // Credenciais pra usar depois em fetchGeneration: reaproveita
          // o modo (jwt ou login) + injeta o sid específico desta planta.
          credenciais: buildSiteCredenciais(parsed, p.sid),
        });
      }

      if (list.length < PAGE_SIZE) break;
      pageNum++;
    }

    return { ok: true, sites };
  },

  // NEP: credenciais da conta = jwt sem o sid (sid e por planta).
  extractAccountCreds(credsPlanta) {
    const cc = credsPlanta as Record<string, unknown>;
    const jwt = String(cc.jwt ?? '').trim();
    if (!jwt) return null;
    return { jwt };
  },
};

// Agrega geração diária da planta a partir das series do echarts.
// - Soma valores por índice (planta = N microinversores em paralelo).
// - Mantém dia com 0 kWh REAL (algum SN reportou número finito = leitura
//   válida, planta apenas não gerou). Descarta dia com TODAS series null
//   (futuro do mês corrente, leitura inexistente).
// - Lida com virada de ano: xAxisData traz só "DD/MM"; quando o mês anda
//   pra trás (ex: ..30/12,31/12,01/01,02/01..), incrementa o ano. Usa
//   dataInicio só como ponto de partida.
export function agregarGeracaoDiaria(
  xAxisData: string[],
  series: Array<{ data: Array<number | null> }>,
  dataInicio: string, // YYYY-MM-DD
): Array<{ data: string; geracao_kwh: number }> {
  let ano = Number(dataInicio.slice(0, 4));
  let mesAnterior = -1;
  const out: Array<{ data: string; geracao_kwh: number }> = [];

  for (let idx = 0; idx < xAxisData.length; idx++) {
    const label = xAxisData[idx];
    const [dd, mm] = label.split('/');
    const mesNum = Number(mm);
    if (mesAnterior > 0 && mesNum < mesAnterior) {
      // Wrap detectado (ex: 12 → 01). Avança ano.
      ano++;
    }
    mesAnterior = mesNum;
    const dataIso = `${ano}-${mm}-${dd}`;

    let total = 0;
    let temLeitura = false;
    for (const s of series) {
      const v = s.data[idx];
      if (typeof v === 'number' && Number.isFinite(v)) {
        total += v;
        temLeitura = true;
      }
    }
    if (temLeitura) {
      out.push({ data: dataIso, geracao_kwh: Math.max(0, total) });
    }
  }
  return out;
}

// Deriva status do inversor a partir do echarts (sem chamar listWithSN extra).
// Olha o ÚLTIMO dia com qualquer leitura (skip dias futuros que ainda não
// rodaram). Se todas as series estão null/0 nesse dia = offline. Se algumas
// series caíram = falha parcial. Tudo gerando = ok.
//
// LIMITAÇÃO conhecida (trade-off vs perf — evita 2ª chamada por planta):
// planta com 1 SN único onde a série termina em null é AMBÍGUA — pode ser
// "futuro ainda não rodou" OU "SN morreu". A heurística assume futuro
// (= status preservado do dia anterior). No ciclo seguinte do cron, se o
// SN continuar null, o range não tem dia com leitura → 'desconhecido' →
// Eva avisa. Detecção atrasa 1 ciclo (= 24h pra cron diário).
// Pra plantas multi-SN, a ambiguidade some (basta 1 série com leitura).
export function derivarStatusDoEcharts(
  series: Array<{ data: Array<number | null> }>,
): 'ok' | 'offline' | 'falha' | 'desconhecido' {
  if (series.length === 0) return 'desconhecido';

  // Último índice onde QUALQUER série tem número (= último dia com leitura).
  let idx = -1;
  for (let i = (series[0]?.data.length ?? 0) - 1; i >= 0; i--) {
    const algumNumero = series.some((s) => typeof s.data[i] === 'number' && Number.isFinite(s.data[i] as number));
    if (algumNumero) { idx = i; break; }
  }
  if (idx === -1) return 'desconhecido';

  const vivos = series.filter((s) => {
    const v = s.data[idx];
    return typeof v === 'number' && Number.isFinite(v) && v > 0;
  }).length;
  const totalSeries = series.length;

  if (vivos === 0) return 'offline';
  if (vivos < totalSeries) return 'falha';
  return 'ok';
}

// Estima kWp da planta somando potência nominal de cada modelo de microinversor.
// Modelo "BDM-2250" → 2.25 kW. Outros modelos comuns: BDM-300/600/1200.
// Se modelo não bate o padrão, planta fica com null (Junior preenche depois).
function estimarKwpPorSNs(sns: ListWithSNRespRaw['list'][number]['sn'] | undefined): number | null {
  if (!sns || sns.length === 0) return null;
  let total = 0;
  let viuModelo = false;
  for (const s of sns) {
    const m = /BDM-(\d{3,4})/i.exec(s.model ?? '');
    if (!m) continue;
    const watts = Number(m[1]);
    if (Number.isFinite(watts) && watts > 0) {
      total += watts / 1000; // BDM-2250 → 2.25 kW
      viuModelo = true;
    }
  }
  return viuModelo ? Number(total.toFixed(2)) : null;
}

// "23/03/2026 21:12" → "2026-03-23"
function parseDataInstalacao(s: string | undefined): string | null {
  if (!s) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s.trim());
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}
