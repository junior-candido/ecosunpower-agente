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

import type { AdapterResult, MonitoringAdapter } from '../types.js';

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
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      try {
        resp = await fetch(url, { signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
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
};
