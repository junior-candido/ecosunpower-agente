/**
 * Google Ads → channel_daily_metrics sync.
 *
 * Consulta a MCC self via Google Ads API v21 (FROM customer agrega toda a conta)
 * e faz upsert em channel_daily_metrics (channel='google', source='google_ads').
 *
 * Best-effort: qualquer erro retorna {ok: false, ...} sem throw, para que o cron
 * nunca quebre por causa do adapter Google Ads.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getGoogleAdsAccessToken } from './client.js';

export interface GoogleAdsSyncResult {
  ok: boolean;
  dias_processados: number;
  total_spend_cents: number;
  total_clicks: number;
  total_impressions: number;
  error?: string;
}

// Formato de cada linha retornada pelo searchStream
interface SearchStreamRow {
  segments?: { date?: string };
  metrics?: {
    costMicros?: string;
    clicks?: string;
    impressions?: string;
  };
}

// O searchStream pode retornar um array de objetos com a chave "results"
interface SearchStreamResponse {
  results?: SearchStreamRow[];
  error?: { message?: string; code?: number };
}

/**
 * Synca métricas do Google Ads (últimos 30 dias) para channel_daily_metrics.
 *
 * Usa FROM customer (MCC self) — não itera por campanha, agrega tudo da conta.
 * Contas filho não linkadas à MCC ficam fora (follow-up: linkar via painel Google Ads UI).
 */
export async function syncGoogleAdsToChannelMetrics(
  supabase: SupabaseClient,
): Promise<GoogleAdsSyncResult> {
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const mcc = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;

  if (!devToken || !mcc) {
    return { ok: false, dias_processados: 0, total_spend_cents: 0, total_clicks: 0, total_impressions: 0, error: 'env missing' };
  }

  console.log(`[google-ads-sync] iniciando MCC=${mcc}`);

  let accessToken: string;
  try {
    accessToken = await getGoogleAdsAccessToken();
  } catch (err) {
    const msg = (err as Error).message;
    console.warn(`[google-ads-sync] falha ao obter access_token: ${msg}`);
    return { ok: false, dias_processados: 0, total_spend_cents: 0, total_clicks: 0, total_impressions: 0, error: msg };
  }

  const url = `https://googleads.googleapis.com/v21/customers/${mcc}/googleAds:searchStream`;
  const query = 'SELECT segments.date, metrics.cost_micros, metrics.clicks, metrics.impressions FROM customer WHERE segments.date DURING LAST_30_DAYS';

  let rawText: string;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': devToken,
        'login-customer-id': mcc,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.warn(`[google-ads-sync] HTTP ${response.status}: ${body.slice(0, 300)}`);
      return { ok: false, dias_processados: 0, total_spend_cents: 0, total_clicks: 0, total_impressions: 0, error: `HTTP ${response.status}` };
    }

    rawText = await response.text();
  } catch (err) {
    const msg = (err as Error).message;
    console.warn(`[google-ads-sync] erro de rede: ${msg}`);
    return { ok: false, dias_processados: 0, total_spend_cents: 0, total_clicks: 0, total_impressions: 0, error: msg };
  }

  // Parse robusto: tenta JSON direto (array), senão split por \n
  let allRows: SearchStreamRow[] = [];
  try {
    // searchStream retorna um array de objetos {"results":[...]}
    const parsed = JSON.parse(rawText) as SearchStreamResponse | SearchStreamResponse[];
    const responses = Array.isArray(parsed) ? parsed : [parsed];
    for (const chunk of responses) {
      if (chunk.results) {
        allRows = allRows.concat(chunk.results);
      }
    }
  } catch {
    // Fallback: newline-delimited JSON
    const lines = rawText.split('\n').filter((l) => l.trim().startsWith('{') || l.trim().startsWith('['));
    for (const line of lines) {
      try {
        const chunk = JSON.parse(line) as SearchStreamResponse | SearchStreamResponse[];
        const chunks = Array.isArray(chunk) ? chunk : [chunk];
        for (const c of chunks) {
          if (c.results) {
            allRows = allRows.concat(c.results);
          }
        }
      } catch {
        // linha malformada, ignora
      }
    }
  }

  if (allRows.length === 0) {
    // Sem dados não é erro — conta pode não ter gasto nos últimos 30 dias
    console.log(`[google-ads-sync] OK: 0 dias (sem dados no período)`);
    return { ok: true, dias_processados: 0, total_spend_cents: 0, total_clicks: 0, total_impressions: 0 };
  }

  // Agrega por data (YYYY-MM-DD)
  const byDate = new Map<string, { spend_cents: number; clicks: number; impressions: number }>();

  for (const row of allRows) {
    const date = row.segments?.date;
    if (!date) continue;

    const costMicros = parseInt(row.metrics?.costMicros ?? '0', 10);
    const clicks = parseInt(row.metrics?.clicks ?? '0', 10);
    const impressions = parseInt(row.metrics?.impressions ?? '0', 10);

    // spend_cents: cost_micros / 10_000
    // 1 BRL = 100 cents = 1_000_000 micros → 1 cent = 10_000 micros
    const spend_cents = Math.floor(costMicros / 10_000);

    const existing = byDate.get(date);
    if (existing) {
      existing.spend_cents += spend_cents;
      existing.clicks += clicks;
      existing.impressions += impressions;
    } else {
      byDate.set(date, { spend_cents, clicks, impressions });
    }
  }

  if (byDate.size === 0) {
    console.log(`[google-ads-sync] OK: 0 dias (nenhum segmento com data válida)`);
    return { ok: true, dias_processados: 0, total_spend_cents: 0, total_clicks: 0, total_impressions: 0 };
  }

  // Upsert em channel_daily_metrics
  const upsertRows = Array.from(byDate.entries()).map(([date, m]) => ({
    channel: 'google',
    date,
    spend_cents: m.spend_cents,
    clicks: m.clicks,
    impressions: m.impressions,
    source: 'google_ads',
    updated_at: new Date().toISOString(),
  }));

  const { error: upsertErr } = await supabase
    .from('channel_daily_metrics')
    .upsert(upsertRows, { onConflict: 'channel,date' });

  if (upsertErr) {
    console.warn(`[google-ads-sync] upsert falhou: ${upsertErr.message}`);
    return { ok: false, dias_processados: 0, total_spend_cents: 0, total_clicks: 0, total_impressions: 0, error: upsertErr.message };
  }

  const total_spend_cents = upsertRows.reduce((s, r) => s + r.spend_cents, 0);
  const total_clicks = upsertRows.reduce((s, r) => s + r.clicks, 0);
  const total_impressions = upsertRows.reduce((s, r) => s + r.impressions, 0);

  console.log(`[google-ads-sync] OK: ${byDate.size} dias, ${total_spend_cents} gastos centavos, ${total_clicks} clicks`);
  return {
    ok: true,
    dias_processados: byDate.size,
    total_spend_cents,
    total_clicks,
    total_impressions,
  };
}
