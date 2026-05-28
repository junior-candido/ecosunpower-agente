// Adapter ABB / FIMER Aurora Vision.
// Doc oficial: https://documentation.auroravision.net/av-api/av-api-v3.yaml.html
//
// Auth (mais elaborado que SolarEdge/NEP):
//   GET /authenticate
//     - HTTP Basic Auth: UserID + Password (credenciais Aurora Vision)
//     - Header: X-AuroraVision-ApiKey: <api key da conta — gerada no portal>
//     - Response: { result: "<TOKEN>" }
//   Token expira em 60 minutos de inatividade — cache mais agressivo que outros
//   adapters (50min p/ margem de segurança).
//
// Listar plantas — 2 etapas (hierarquia Portfolio Group → Portfolios → Plants):
//   GET /v1/portfolioGroup
//     → { result: { portfolioGroupEntityID, portfolioGroupName,
//                   portfolioGroupPortfolios: [{ portfolioEntityID, portfolioName }] } }
//   GET /v1/portfolio/{portfolioEntityID}/plants?page=0
//     → { result: [ { plantEntityID, plantName, plantState, plantStatus, ... } ] }
//
// Geração diária:
//   GET /v1/plant/{entityID}/dailyProduction?startDate=YYYYMMDD&endDate=YYYYMMDD
//     → { result: { plantEntityID, dailyProduction: [{ timestamp, value }] } }
//
// Status:
//   GET /v1/plant/{entityID}/status
//     → { result: { plantStatus: "NORM|LOW|MEDIUM|HIGH|...", ... } }
//
// Credenciais esperadas no api_credentials JSONB:
//   modo MVP:  { userId, password, apiKey }
//   o portfolioEntityID/plantEntityID é descoberto via listSites e gravado
//   junto nas credenciais por planta como { ..., plantEntityID }.

import crypto from 'crypto';
import type { AdapterResult, ListSitesResult, MonitoringAdapter, SiteResumo } from '../types.js';
import { fetchWithTimeout } from '../util/fetch-with-timeout.js';
import { getOrFetch } from '../util/token-cache.js';

const BASE_URL = 'https://api.auroravision.net/api/rest';
const TOKEN_TTL_MS = 50 * 60 * 1000; // 50min (margem dos 60min de inatividade da API)

// ============================================================================
// CREDENTIALS
// ============================================================================

interface ParsedCreds {
  userId: string;
  password: string;
  apiKey: string;
  plantEntityID?: string; // só preenchido quando reusado por planta específica
}

function parseCreds(c: Record<string, unknown>): ParsedCreds | { error: string } {
  const userId = String(c.userId ?? c.email ?? '').trim();
  const password = String(c.password ?? '').trim();
  const apiKey = String(c.apiKey ?? '').trim();
  const plantEntityID = c.plantEntityID ? String(c.plantEntityID).trim() : undefined;

  if (!userId || !password || !apiKey) {
    return {
      error:
        'Credenciais ABB precisam de { userId, password, apiKey }. ' +
        'apiKey vem do portal Aurora Vision (Account → API Access).',
    };
  }
  return { userId, password, apiKey, plantEntityID };
}

// ============================================================================
// TOKEN
// ============================================================================

function cacheKey(c: ParsedCreds): string {
  const credHash = crypto.createHash('sha256').update(`${c.password}:${c.apiKey}`).digest('hex').slice(0, 12);
  return `abb|${c.userId}|${credHash}`;
}

type TokenResult =
  | { ok: true; token: string }
  | { ok: false; reason: string; invalidCredentials?: boolean };

async function obterToken(c: ParsedCreds, forceRefresh = false): Promise<TokenResult> {
  return getOrFetch(
    cacheKey(c),
    () => fazerAuth(c),
    TOKEN_TTL_MS,
    forceRefresh,
  );
}

async function fazerAuth(c: ParsedCreds): Promise<TokenResult> {
  const basic = Buffer.from(`${c.userId}:${c.password}`).toString('base64');
  let resp: Response;
  try {
    resp = await fetchWithTimeout(`${BASE_URL}/authenticate`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${basic}`,
        'X-AuroraVision-ApiKey': c.apiKey,
        'Accept': 'application/json',
      },
    });
  } catch (err) {
    return { ok: false, reason: `network: ${(err as Error).message}` };
  }

  if (resp.status === 401 || resp.status === 403) {
    return {
      ok: false,
      reason: `ABB ${resp.status} (userId/password/apiKey invalidos)`,
      invalidCredentials: true,
    };
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    return { ok: false, reason: `ABB authenticate ${resp.status}: ${text.slice(0, 200)}` };
  }
  let json: { result?: string };
  try {
    json = (await resp.json()) as typeof json;
  } catch (err) {
    return { ok: false, reason: `ABB authenticate JSON invalido: ${(err as Error).message}` };
  }
  const token = json.result?.trim();
  if (!token) {
    return { ok: false, reason: 'ABB authenticate nao retornou result.token' };
  }
  return { ok: true, token };
}

// ============================================================================
// REQUEST HELPER
// ============================================================================

async function abbGet<T = unknown>(
  endpoint: string,
  token: string,
): Promise<{ ok: true; data: T } | { ok: false; reason: string; status?: number; invalidCredentials?: boolean }> {
  let resp: Response;
  try {
    resp = await fetchWithTimeout(`${BASE_URL}${endpoint}`, {
      method: 'GET',
      headers: {
        'X-AuroraVision-Token': token,
        'Accept': 'application/json',
      },
    });
  } catch (err) {
    return { ok: false, reason: `network: ${(err as Error).message}` };
  }

  if (resp.status === 401 || resp.status === 403) {
    return {
      ok: false,
      reason: `ABB ${endpoint} ${resp.status} (token invalido/expirado)`,
      status: resp.status,
      invalidCredentials: true,
    };
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    return { ok: false, reason: `ABB ${endpoint} ${resp.status}: ${text.slice(0, 200)}`, status: resp.status };
  }
  try {
    const json = (await resp.json()) as { result?: T };
    // Aurora Vision pode devolver `result: null` em transients (planta nova,
    // backend parcial). Tratamos igual a "sem result" — evita caller deref
    // null.dailyProduction e TypeError abaixo na cadeia.
    if (json.result === undefined || json.result === null) {
      return { ok: false, reason: `ABB ${endpoint}: resposta sem campo "result" (ou null)` };
    }
    return { ok: true, data: json.result as T };
  } catch (err) {
    return { ok: false, reason: `ABB ${endpoint} JSON: ${(err as Error).message}` };
  }
}

// Re-tenta uma vez se token expirou na janela de cache (auto-cura sem TTL).
async function abbGetAuth<T = unknown>(
  endpoint: string,
  c: ParsedCreds,
): Promise<{ ok: true; data: T } | { ok: false; reason: string; invalidCredentials?: boolean }> {
  const tk1 = await obterToken(c);
  if (!tk1.ok) return tk1;
  const r1 = await abbGet<T>(endpoint, tk1.token);
  if (r1.ok) return r1;
  if (r1.invalidCredentials) {
    const tk2 = await obterToken(c, true);
    if (!tk2.ok) return tk2;
    const r2 = await abbGet<T>(endpoint, tk2.token);
    if (r2.ok) return r2;
    return { ok: false, reason: r2.reason, invalidCredentials: r2.invalidCredentials };
  }
  return { ok: false, reason: r1.reason };
}

// ============================================================================
// API SHAPES
// ============================================================================

interface PortfolioGroupRaw {
  portfolioGroupEntityID: number | string;
  portfolioGroupName?: string;
  portfolioGroupPortfolios?: Array<{
    portfolioEntityID: number | string;
    portfolioName?: string;
  }>;
}

interface PlantRaw {
  plantEntityID: number | string;
  plantName?: string;
  plantState?: string;       // "ACTIVE" | "INACTIVE" | ...
  plantStatus?: string;       // "NORM" | "LOW" | "MEDIUM" | "HIGH" | ...
  plantPeakPower?: number;    // kW
  plantInstallationDate?: string; // ISO ou epoch
  plantAddress?: { city?: string; state?: string; country?: string };
}

interface DailyProductionRaw {
  plantEntityID: number | string;
  dailyProduction?: Array<{
    timestamp?: string | number; // pode vir como "YYYY-MM-DD" ou epoch ms
    value?: number;              // Wh
  }>;
}

// ============================================================================
// ADAPTER
// ============================================================================

export const abbAdapter: MonitoringAdapter = {
  marca: 'abb',

  // Geração diária de UMA planta no período. As credenciais por planta carregam
  // o plantEntityID descoberto via listSites; sem ele, fetchGeneration nao tem
  // como saber qual planta consultar (a conta tem N).
  async fetchGeneration(
    credenciais: Record<string, unknown>,
    dataInicio: string,        // YYYY-MM-DD
    dataFim: string,           // YYYY-MM-DD
  ): Promise<AdapterResult> {
    const parsed = parseCreds(credenciais);
    if ('error' in parsed) {
      return { ok: false, reason: parsed.error, invalidCredentials: true };
    }
    if (!parsed.plantEntityID) {
      return {
        ok: false,
        reason: 'ABB fetchGeneration precisa de credenciais.plantEntityID (vem do listSites)',
        invalidCredentials: true,
      };
    }

    const startDate = dataInicio.replace(/-/g, '');
    const endDate = dataFim.replace(/-/g, '');
    const endpoint = `/v1/plant/${encodeURIComponent(parsed.plantEntityID)}/dailyProduction?startDate=${startDate}&endDate=${endDate}`;

    const r = await abbGetAuth<DailyProductionRaw>(endpoint, parsed);
    if (!r.ok) return r;

    const itens = r.data.dailyProduction;
    // Fix 7: result OK mas sem o campo dailyProduction (transient API). Loga
    // warn pra Junior nao confundir com planta sem geracao no S4.
    if (!Array.isArray(itens)) {
      console.warn(
        `[abb] dailyProduction ausente no result da planta ${parsed.plantEntityID} ` +
        '(API devolveu 200 mas sem o array). Pode ser transient — re-tenta na proxima janela.',
      );
    }
    const geracoes = parseDailyProduction(itens ?? [], { plantEntityID: parsed.plantEntityID });

    // Status da planta (chamada barata e isolada — diferente do NEP, ABB tem
    // endpoint dedicado, então vale chamar).
    const statusR = await abbGetAuth<{ plantStatus?: string; plantState?: string }>(
      `/v1/plant/${encodeURIComponent(parsed.plantEntityID)}/status`,
      parsed,
    );
    const statusInversor = statusR.ok
      ? mapearStatus(statusR.data.plantStatus, statusR.data.plantState)
      : 'desconhecido';

    return { ok: true, geracoes, statusInversor };
  },

  // Lista TODAS as plantas do instalador via PortfolioGroup → Portfolios → Plants.
  async listSites(credenciaisConta: Record<string, unknown>): Promise<ListSitesResult> {
    const parsed = parseCreds(credenciaisConta);
    if ('error' in parsed) {
      return { ok: false, reason: parsed.error, invalidCredentials: true };
    }

    // 1) descobre portfolio group + portfolios
    const grupoR = await abbGetAuth<PortfolioGroupRaw>('/v1/portfolioGroup', parsed);
    if (!grupoR.ok) {
      return { ok: false, reason: grupoR.reason, invalidCredentials: grupoR.invalidCredentials };
    }

    const portfolios = grupoR.data.portfolioGroupPortfolios ?? [];
    if (portfolios.length === 0) {
      return { ok: true, sites: [] };
    }

    // 2) pra cada portfolio, busca plantas paginadas
    const sites: SiteResumo[] = [];
    // Hard cap conservador. Aurora Vision nao documenta o page-size em /plants
    // — observei na pratica 100/pagina. 200 paginas × 100 = 20k plantas/conta,
    // cobre integrador gigante. Se atingir o cap, loga warn pra Junior saber
    // que precisamos investigar (provavelmente bug de API ou page-size mudou).
    const HARD_CAP_PAGINAS = 200;
    for (const p of portfolios) {
      const pid = String(p.portfolioEntityID);
      let pagina = 0;
      let safety = HARD_CAP_PAGINAS;
      while (safety-- > 0) {
        const r = await abbGetAuth<PlantRaw[]>(
          `/v1/portfolio/${encodeURIComponent(pid)}/plants?page=${pagina}`,
          parsed,
        );
        if (!r.ok) {
          // Falha intermediaria: preserva o que ja coletou (igual NEP).
          if (r.invalidCredentials || sites.length === 0) {
            return { ok: false, reason: r.reason, invalidCredentials: r.invalidCredentials };
          }
          console.warn(`[abb] listSites portfolio=${pid} pagina=${pagina} falhou (${r.reason}); retornando ${sites.length} plantas parciais`);
          return { ok: true, sites };
        }
        const lista = Array.isArray(r.data) ? r.data : [];
        for (const plant of lista) {
          const id = plant.plantEntityID !== undefined ? String(plant.plantEntityID) : null;
          const nome = plant.plantName?.trim();
          if (!id || !nome) continue;
          sites.push({
            externalId: id,
            apelido: nome,
            potencia_kwp:
              typeof plant.plantPeakPower === 'number' && Number.isFinite(plant.plantPeakPower)
                ? plant.plantPeakPower
                : null,
            cidade: plant.plantAddress?.city?.trim() || null,
            uf: plant.plantAddress?.state?.trim() || null,
            data_instalacao: parseDataInstalacao(plant.plantInstallationDate),
            credenciais: {
              userId: parsed.userId,
              password: parsed.password,
              apiKey: parsed.apiKey,
              plantEntityID: id,
            },
          });
        }
        // Aurora Vision pagina implicitamente: pagina vazia = fim.
        if (lista.length === 0) break;
        pagina++;
      }
      if (safety <= 0) {
        console.warn(
          `[abb] listSites portfolio=${pid} atingiu HARD_CAP_PAGINAS=${HARD_CAP_PAGINAS} ` +
          `(${sites.length} plantas coletadas ate aqui). Investigar: page-size mudou ou API loop?`,
        );
      }
    }

    return { ok: true, sites };
  },

  // ABB: credenciais da conta = userId + password + apiKey (sem plantEntityID).
  extractAccountCreds(credsPlanta) {
    const cc = credsPlanta as Record<string, unknown>;
    const userId = String(cc.userId ?? '').trim();
    const password = String(cc.password ?? '').trim();
    const apiKey = String(cc.apiKey ?? '').trim();
    if (!userId || !password || !apiKey) return null;
    return { userId, password, apiKey };
  },
};

// ============================================================================
// HELPERS (exportados pra testes)
// ============================================================================

// Aurora Vision pode devolver dailyProduction em formatos ligeiramente
// diferentes — `value` em Wh ou kWh, timestamp como ISO ou epoch.
// Normalizamos pra { data: YYYY-MM-DD, geracao_kwh: number }.
//
// LIMITAÇÃO: a unit (Wh vs kWh) NÃO é documentada pelo endpoint /dailyProduction.
// Aurora Vision só crava unit no /aggregated. Aplicamos heurística "valor grande
// = Wh, valor pequeno = kWh" com threshold 10_000. Loga warn em CADA detecção
// pra Junior validar contra produção real e remover a ambiguidade depois.
//
// TODO(ABB-unit): calibrar com 1 ciclo de cron em prod e cravar a unit.
// Pesquisa rápida: trocar pro endpoint /v1/stats/energy/aggregated/{entityID}
// /GenerationEnergy/delta?sampling=Day que documenta unit explicito (kWh).
export function parseDailyProduction(
  itens: Array<{ timestamp?: string | number; value?: number }>,
  contexto?: { plantEntityID?: string },
): Array<{ data: string; geracao_kwh: number }> {
  const out: Array<{ data: string; geracao_kwh: number }> = [];
  let usouHeuristicaWh = 0;
  for (const item of itens) {
    if (typeof item.value !== 'number' || !Number.isFinite(item.value)) continue;
    const dataIso = parseTimestamp(item.timestamp);
    if (!dataIso) continue;
    const eraWh = item.value > 10_000;
    const kwh = eraWh ? item.value / 1000 : item.value;
    if (eraWh) usouHeuristicaWh++;
    out.push({ data: dataIso, geracao_kwh: Math.max(0, kwh) });
  }
  if (usouHeuristicaWh > 0) {
    console.warn(
      `[abb] heuristica Wh->kWh disparou em ${usouHeuristicaWh}/${itens.length} dias` +
      (contexto?.plantEntityID ? ` (planta=${contexto.plantEntityID})` : '') +
      ' — validar unit do endpoint dailyProduction em prod (TODO ABB-unit).',
    );
  }
  return out;
}

function parseTimestamp(t: string | number | undefined): string | null {
  if (t === undefined || t === null) return null;
  // Epoch (ms ou s)
  if (typeof t === 'number') {
    const ms = t > 1e12 ? t : t * 1000;
    const d = new Date(ms);
    if (!Number.isFinite(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  // String — pode ser "YYYY-MM-DD", "YYYYMMDD", ou ISO completo
  const s = t.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// Aurora Vision: plantStatus = severidade do ALERTA DE GERAÇÃO (LOW/MEDIUM/HIGH
// = quanto a producao está abaixo do esperado por causa de nuvem/sujeira/etc),
// NÃO saude do inversor. Tratar LOW como 'falha' polui o dashboard em dia
// chuvoso. So marcamos 'falha' quando há status EXPLICITO de problema de
// equipamento (FAULT/COMM_FAIL/ERROR). Sub-geracao por clima fica como 'ok'.
//
// plantState = ACTIVE | INACTIVE — INACTIVE = inversor desligado de verdade.
export function mapearStatus(
  plantStatus: string | undefined,
  plantState: string | undefined,
): 'ok' | 'offline' | 'falha' | 'desconhecido' {
  const state = (plantState ?? '').toUpperCase();
  if (state === 'INACTIVE') return 'offline';

  const status = (plantStatus ?? '').toUpperCase();
  // Problemas EXPLICITOS de equipamento → falha
  if (
    status === 'FAULT' || status === 'ERROR' || status === 'COMM_FAIL' ||
    status === 'WARN' || status === 'WARNING' || status === 'ALARM'
  ) {
    return 'falha';
  }
  // Sub-geracao (LOW/MED/HIGH) — anomalia de PRODUCAO, nao de equipamento.
  // Reportamos como 'ok' pra Eva nao alertar como falha. (Eva avalia % de
  // geracao no S3/S4 com sua propria heuristica baseada em PVGIS+marca.)
  if (
    status === 'NORM' || status === 'OK' ||
    status === 'LOW' || status === 'MEDIUM' || status === 'HIGH'
  ) {
    return 'ok';
  }
  if (!state && !status) return 'desconhecido';
  // ACTIVE sem status conhecido = ok otimista; status desconhecido em outros
  // estados = desconhecido (nao esconder, mas tambem nao alarmar).
  return state === 'ACTIVE' ? 'ok' : 'desconhecido';
}

function parseDataInstalacao(s: string | undefined): string | null {
  if (!s) return null;
  return parseTimestamp(s);
}
