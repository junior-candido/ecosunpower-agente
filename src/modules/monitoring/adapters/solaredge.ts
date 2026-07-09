// Adapter SolarEdge — busca geracao diaria via Monitoring API publica.
// Doc: https://monitoringapi.solaredge.com/  (account → API)
//
// Credenciais esperadas no api_credentials JSONB:
//   { site_id: "1234567", api_key: "ABC..." }
//
// Endpoint usado: GET /site/{siteId}/energy?timeUnit=DAY&startDate=...&endDate=...
// Resposta:
//   { energy: { timeUnit: "DAY", unit: "Wh",
//     values: [ { date: "2026-05-01 00:00:00", value: 25600 }, ... ] } }
//
// Conversao: value vem em Wh, dividimos por 1000 pra obter kWh.

import type { AdapterResult, ListSitesResult, MonitoringAdapter } from '../types.js';
import { fetchWithTimeout } from '../util/fetch-with-timeout.js';
import { retryTransient, isTransientFailure } from '../util/retry.js';

const BASE_URL = 'https://monitoringapi.solaredge.com';

// Resultado do helper HTTP comum. Igual formato dos outros adapters
// (ok/reason/status/invalidCredentials) pra o isTransientFailure classificar.
type SeGetResult =
  | { ok: true; data: unknown }
  | { ok: false; reason: string; status?: number; invalidCredentials?: boolean };

// Faz o GET + trata a camada HTTP comum aos 2 métodos (fetchGeneration e
// listSites): rede, 401/403 (credencial), demais !resp.ok (com `status` — pro
// retry pegar 5xx/429) e JSON inválido. No sucesso devolve o JSON parseado; cada
// método interpreta o `data` do seu jeito (energy.values / sites.site).
// As mensagens de erro são EXATAMENTE as de antes pra não mudar o visível — o
// `credErro` guarda a única diferença entre os dois métodos no 401/403
// ("credenciais invalidas..." em fetchGeneration, "api_key invalida..." em listSites).
async function seGetJson(
  url: string | URL,
  credErro = 'credenciais invalidas ou sem permissao',
): Promise<SeGetResult> {
  let resp: Response;
  try {
    // 30s timeout pra nao travar o cron se SolarEdge estiver lento.
    resp = await fetchWithTimeout(url);
  } catch (err) {
    return { ok: false, reason: `network: ${(err as Error).message}` };
  }

  if (resp.status === 401 || resp.status === 403) {
    return {
      ok: false,
      reason: `SolarEdge ${resp.status} (${credErro})`,
      invalidCredentials: true,
    };
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    return { ok: false, reason: `SolarEdge ${resp.status}: ${body.slice(0, 200)}`, status: resp.status };
  }

  let json: unknown;
  try {
    json = await resp.json();
  } catch (err) {
    return { ok: false, reason: `JSON invalido: ${(err as Error).message}` };
  }
  return { ok: true, data: json };
}

// seGet = seGetJson + retry em erro passageiro (5xx/429/rede). Um blip momentaneo
// no servidor da SolarEdge nao derruba a sync ate o proximo cron. 401/403
// (credencial) nunca repete — isTransientFailure ja filtra.
const seGet = (url: string | URL, credErro?: string): Promise<SeGetResult> =>
  retryTransient(() => seGetJson(url, credErro), isTransientFailure);

export const solarEdgeAdapter: MonitoringAdapter = {
  marca: 'solaredge',

  async fetchGeneration(
    credenciais: Record<string, unknown>,
    dataInicio: string,
    dataFim: string,
  ): Promise<AdapterResult> {
    const siteId = String(credenciais.site_id ?? '').trim();
    const apiKey = String(credenciais.api_key ?? '').trim();

    if (!siteId || !apiKey) {
      return {
        ok: false,
        reason: 'Faltam credenciais SolarEdge (api_credentials precisa de site_id + api_key)',
        invalidCredentials: true,
      };
    }

    const url = new URL(`${BASE_URL}/site/${encodeURIComponent(siteId)}/energy`);
    url.searchParams.set('timeUnit', 'DAY');
    url.searchParams.set('startDate', dataInicio);
    url.searchParams.set('endDate', dataFim);
    url.searchParams.set('api_key', apiKey);

    // seGet cuida da camada HTTP comum + retry em erro passageiro (5xx/rede).
    const r = await seGet(url);
    if (!r.ok) return r;
    const json = r.data;

    const energy = (json as { energy?: { unit?: string; values?: { date: string; value: number | null }[] } }).energy;
    if (!energy || !Array.isArray(energy.values)) {
      return { ok: false, reason: 'Resposta SolarEdge sem campo energy.values' };
    }

    // unit padrao da SolarEdge eh "Wh"; algumas plantas devolvem em "kWh".
    // Tratamos ambos por seguranca.
    const fator = energy.unit === 'kWh' ? 1 : 1 / 1000;

    const geracoes = energy.values
      .filter((v): v is { date: string; value: number } =>
        typeof v.value === 'number' && Number.isFinite(v.value),
      )
      .map((v) => ({
        // SolarEdge devolve "2026-05-01 00:00:00" — pegar so a data
        data: v.date.slice(0, 10),
        geracao_kwh: Math.max(0, v.value * fator),
      }));

    return { ok: true, geracoes };
  },

  // Lista todos os sites da conta SolarEdge associados a uma API key.
  // Endpoint: GET /sites/list?api_key=XXX&size=N
  // Resposta:
  //   { sites: { count: 3, site: [
  //     { id: 12345, name: "Casa Silva", peakPower: 8.4,
  //       installationDate: "2025-03-12",
  //       location: { country: "Brazil", city: "Brasilia", ... }
  //     }, ... ] } }
  async listSites(credenciaisConta: Record<string, unknown>): Promise<ListSitesResult> {
    const apiKey = String(credenciaisConta.api_key ?? '').trim();
    if (!apiKey) {
      return {
        ok: false,
        reason: 'Faltam credenciais (precisa de api_key da conta SolarEdge)',
        invalidCredentials: true,
      };
    }

    const url = new URL(`${BASE_URL}/sites/list`);
    url.searchParams.set('size', '100'); // SolarEdge: max 100 por chamada
    url.searchParams.set('api_key', apiKey);

    interface RawSite {
      id?: number | string;
      name?: string;
      peakPower?: number;
      installationDate?: string;
      location?: { country?: string; city?: string; address?: string; zip?: string };
    }

    // seGet cuida da camada HTTP comum + retry em erro passageiro (5xx/rede).
    const r = await seGet(url, 'api_key invalida ou sem permissao');
    if (!r.ok) return r;
    const json = r.data as { sites?: { site?: RawSite[] } };

    const rawSites = json.sites?.site ?? [];
    if (!Array.isArray(rawSites)) {
      return { ok: false, reason: 'Resposta SolarEdge sem campo sites.site (array)' };
    }

    const sites = rawSites.flatMap((s) => {
      const id = s.id !== undefined ? String(s.id) : null;
      const apelido = s.name?.trim() ?? '';
      if (!id || !apelido) return [];
      return [{
        externalId: id,
        apelido,
        potencia_kwp: typeof s.peakPower === 'number' && Number.isFinite(s.peakPower) ? s.peakPower : null,
        cidade: s.location?.city?.trim() || null,
        uf: null, // SolarEdge nao retorna UF separado; Junior pode editar depois
        data_instalacao: s.installationDate ? s.installationDate.slice(0, 10) : null,
        // Credenciais que vao no api_credentials JSONB do sistema
        credenciais: {
          site_id: id,
          api_key: apiKey,
        },
      }];
    });

    return { ok: true, sites };
  },

  // SolarEdge: a mesma api_key da conta vai em cada planta. Devolve só a key.
  extractAccountCreds(credsPlanta) {
    const apiKey = String(credsPlanta?.api_key ?? '').trim();
    if (!apiKey) return null;
    return { api_key: apiKey };
  },
};
