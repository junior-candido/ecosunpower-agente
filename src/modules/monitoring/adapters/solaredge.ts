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

const BASE_URL = 'https://monitoringapi.solaredge.com';

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

    let resp: Response;
    try {
      // 30s timeout pra nao travar o cron se SolarEdge estiver lento.
      resp = await fetchWithTimeout(url);
    } catch (err) {
      const msg = (err as Error).message;
      return { ok: false, reason: `network: ${msg}` };
    }

    if (resp.status === 401 || resp.status === 403) {
      return {
        ok: false,
        reason: `SolarEdge ${resp.status} (credenciais invalidas ou sem permissao)`,
        invalidCredentials: true,
      };
    }
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      return { ok: false, reason: `SolarEdge ${resp.status}: ${body.slice(0, 200)}` };
    }

    let json: unknown;
    try {
      json = await resp.json();
    } catch (err) {
      return { ok: false, reason: `JSON invalido: ${(err as Error).message}` };
    }

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

    let resp: Response;
    try {
      resp = await fetchWithTimeout(url);
    } catch (err) {
      return { ok: false, reason: `network: ${(err as Error).message}` };
    }

    if (resp.status === 401 || resp.status === 403) {
      return {
        ok: false,
        reason: `SolarEdge ${resp.status} (api_key invalida ou sem permissao)`,
        invalidCredentials: true,
      };
    }
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      return { ok: false, reason: `SolarEdge ${resp.status}: ${body.slice(0, 200)}` };
    }

    interface RawSite {
      id?: number | string;
      name?: string;
      peakPower?: number;
      installationDate?: string;
      location?: { country?: string; city?: string; address?: string; zip?: string };
    }
    let json: { sites?: { site?: RawSite[] } };
    try {
      json = (await resp.json()) as typeof json;
    } catch (err) {
      return { ok: false, reason: `JSON invalido: ${(err as Error).message}` };
    }

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
