import type { SupabaseClient } from '@supabase/supabase-js';

export interface MarketingKpis {
  spend7d_brl: number;
  leads7d: number;
  cpl7d_brl: number | null;
  impressions7d: number;
  ctr7d_pct: number | null;
  activeCampaigns: number;
  creativesEmUso: number;
  alertasPendentes: number;
}

interface InsightAgg {
  spend_cents: number;
  leads: number | null;
  impressions: number;
  clicks: number;
  date_start: string;
}

export interface CampaignRow {
  id: number;
  codigo_portfolio: string;
  name: string;
  status: string;
  daily_budget_cents: number | null;
  cpl_alerta_brl: number | null;
  cpl_critico_brl: number | null;
  last_synced_at: string | null;
  spend7d_brl: number;
  leads7d: number;
  cpl7d_brl: number | null;
}

export interface CreativeRow {
  id: number;
  briefing: string | null;
  status: string;
  created_at: string;
}

export interface AlertRow {
  id: number;
  agent: string;
  severity: string;
  subject: string;
  body: string;
  action_required: string | null;
  status: string;
  created_at: string;
}

function isoNDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export async function fetchMarketingKpis(supabase: SupabaseClient): Promise<MarketingKpis> {
  const since = isoNDaysAgo(7);

  const { data: insights } = await supabase
    .from('meta_ads_insights')
    .select('spend_cents, leads, impressions, clicks, date_start')
    .gte('date_start', since);

  const rows = (insights ?? []) as InsightAgg[];
  const spend_cents = rows.reduce((s, i) => s + (i.spend_cents ?? 0), 0);
  const leads = rows.reduce((s, i) => s + (i.leads ?? 0), 0);
  const impressions = rows.reduce((s, i) => s + (i.impressions ?? 0), 0);
  const clicks = rows.reduce((s, i) => s + (i.clicks ?? 0), 0);

  const spend7d_brl = spend_cents / 100;
  const cpl7d_brl = leads > 0 ? spend7d_brl / leads : null;
  const ctr7d_pct = impressions > 0 ? (clicks / impressions) * 100 : null;

  const { count: activeCampaigns } = await supabase
    .from('marketing_campaigns').select('*', { count: 'exact', head: true }).eq('status', 'active');
  const { count: creativesEmUso } = await supabase
    .from('marketing_creatives').select('*', { count: 'exact', head: true }).eq('status', 'em_uso');
  const { count: alertasPendentes } = await supabase
    .from('marketing_alerts').select('*', { count: 'exact', head: true }).eq('status', 'pending');

  return {
    spend7d_brl,
    leads7d: leads,
    cpl7d_brl,
    impressions7d: impressions,
    ctr7d_pct,
    activeCampaigns: activeCampaigns ?? 0,
    creativesEmUso: creativesEmUso ?? 0,
    alertasPendentes: alertasPendentes ?? 0,
  };
}

export async function listActiveCampaigns(supabase: SupabaseClient): Promise<CampaignRow[]> {
  const since = isoNDaysAgo(7);
  const { data: camps } = await supabase
    .from('marketing_campaigns')
    .select('id, codigo_portfolio, name, status, daily_budget_cents, cpl_alerta_brl, cpl_critico_brl, last_synced_at')
    .eq('status', 'active')
    .order('id', { ascending: true });

  if (!camps || camps.length === 0) return [];

  const ids = camps.map((c) => c.id);
  const { data: ins } = await supabase
    .from('meta_ads_insights')
    .select('campaign_id, spend_cents, leads')
    .in('campaign_id', ids)
    .gte('date_start', since);

  const agg = new Map<number, { spend: number; leads: number }>();
  for (const i of (ins ?? []) as Array<{ campaign_id: number; spend_cents: number; leads: number | null }>) {
    const a = agg.get(i.campaign_id) ?? { spend: 0, leads: 0 };
    a.spend += i.spend_cents ?? 0;
    a.leads += i.leads ?? 0;
    agg.set(i.campaign_id, a);
  }

  return camps.map((c) => {
    const a = agg.get(c.id) ?? { spend: 0, leads: 0 };
    const spend7d_brl = a.spend / 100;
    return {
      id: c.id,
      codigo_portfolio: c.codigo_portfolio,
      name: c.name,
      status: c.status,
      daily_budget_cents: c.daily_budget_cents,
      cpl_alerta_brl: c.cpl_alerta_brl,
      cpl_critico_brl: c.cpl_critico_brl,
      last_synced_at: c.last_synced_at,
      spend7d_brl,
      leads7d: a.leads,
      cpl7d_brl: a.leads > 0 ? spend7d_brl / a.leads : null,
    };
  });
}

export async function listRecentCreatives(supabase: SupabaseClient, limit = 8): Promise<CreativeRow[]> {
  const { data } = await supabase
    .from('marketing_creatives')
    .select('id, briefing, status, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as CreativeRow[];
}

export async function listPendingAlerts(supabase: SupabaseClient): Promise<AlertRow[]> {
  const { data } = await supabase
    .from('marketing_alerts')
    .select('id, agent, severity, subject, body, action_required, status, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(20);
  return (data ?? []) as AlertRow[];
}
