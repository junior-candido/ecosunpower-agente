/**
 * google-analytics/index.ts — adapter GA4 Data API
 *
 * Reusa o refresh_token do Google Ads (mesma OAuth credential, escopo
 * combinado `adwords + analytics.readonly`). Property ID em env separada
 * GOOGLE_ANALYTICS_PROPERTY_ID.
 *
 * MVP minimal: chamada on-demand pelo dashboard (sem persistir em tabela
 * nova). Cada page load = 1 request GA4. Pode evoluir pra tabela
 * web_traffic_daily com cron 1x/h se virar gargalo.
 */

import { getGoogleAdsAccessToken } from '../google-ads/client.js';

const GA4_API_BASE = 'https://analyticsdata.googleapis.com/v1beta';

export interface GoogleAnalyticsSummary {
  sessions: number;
  users: number;
  pageviews: number;
  dias_com_dado: number;
  /** Quebra por canal: organic / paid / direct / referral / social */
  channels: Array<{ channel: string; sessions: number; users: number; pageviews: number }>;
  /** Top 5 paginas mais vistas */
  top_pages: Array<{ path: string; pageviews: number }>;
  error?: string;
}

/**
 * Puxa relatorio GA4 dos ultimos N dias agregando sessions/users/pageviews
 * por canal (sessionDefaultChannelGroup) e top paginas.
 */
export async function fetchGoogleAnalyticsSummary(
  dias: number = 30,
): Promise<GoogleAnalyticsSummary> {
  const empty: GoogleAnalyticsSummary = {
    sessions: 0, users: 0, pageviews: 0, dias_com_dado: 0, channels: [], top_pages: [],
  };

  const propertyId = process.env.GOOGLE_ANALYTICS_PROPERTY_ID;
  if (!propertyId) {
    return { ...empty, error: 'GOOGLE_ANALYTICS_PROPERTY_ID nao configurado' };
  }

  let accessToken: string;
  try {
    accessToken = await getGoogleAdsAccessToken();
  } catch (err) {
    return { ...empty, error: `OAuth: ${(err as Error).message}` };
  }

  // 2 queries paralelas: agregado por canal + top paginas
  const startDate = `${dias - 1}daysAgo`;
  const endDate = 'today';

  const [resByChannel, resTopPages] = await Promise.all([
    fetch(`${GA4_API_BASE}/properties/${propertyId}:runReport`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'screenPageViews' },
        ],
      }),
    }),
    fetch(`${GA4_API_BASE}/properties/${propertyId}:runReport`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 5,
      }),
    }),
  ]);

  if (!resByChannel.ok) {
    const errBody = await resByChannel.text();
    return { ...empty, error: `GA4 by-channel HTTP ${resByChannel.status}: ${errBody.slice(0, 200)}` };
  }
  if (!resTopPages.ok) {
    const errBody = await resTopPages.text();
    return { ...empty, error: `GA4 top-pages HTTP ${resTopPages.status}: ${errBody.slice(0, 200)}` };
  }

  const byChannel = (await resByChannel.json()) as Ga4Response;
  const topPages = (await resTopPages.json()) as Ga4Response;

  const channels: GoogleAnalyticsSummary['channels'] = (byChannel.rows ?? []).map((row) => ({
    channel: row.dimensionValues?.[0]?.value ?? '(desconhecido)',
    sessions: parseInt(row.metricValues?.[0]?.value ?? '0', 10),
    users: parseInt(row.metricValues?.[1]?.value ?? '0', 10),
    pageviews: parseInt(row.metricValues?.[2]?.value ?? '0', 10),
  }));

  const top_pages: GoogleAnalyticsSummary['top_pages'] = (topPages.rows ?? []).map((row) => ({
    path: row.dimensionValues?.[0]?.value ?? '(desconhecido)',
    pageviews: parseInt(row.metricValues?.[0]?.value ?? '0', 10),
  }));

  const sessions = channels.reduce((s, c) => s + c.sessions, 0);
  const users = channels.reduce((s, c) => s + c.users, 0);
  const pageviews = channels.reduce((s, c) => s + c.pageviews, 0);
  const dias_com_dado = byChannel.rowCount ?? channels.length;

  return { sessions, users, pageviews, dias_com_dado, channels, top_pages };
}

interface Ga4Response {
  rowCount?: number;
  rows?: Array<{
    dimensionValues?: Array<{ value: string }>;
    metricValues?: Array<{ value: string }>;
  }>;
}
