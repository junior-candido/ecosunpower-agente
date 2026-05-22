import type { SupabaseClient } from '@supabase/supabase-js';
import type { Channel } from './resolve-channel.js';

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

export interface ListCampaignsOptions {
  status?: 'active' | 'paused' | 'all';
  search?: string;
  limit?: number;
  offset?: number;
}

export interface CampaignsResult {
  rows: CampaignRow[];
  total: number;
  countByStatus: { active: number; paused: number; total: number };
}

export async function listActiveCampaigns(
  supabase: SupabaseClient,
  options: ListCampaignsOptions = {},
): Promise<CampaignsResult> {
  const status = options.status ?? 'active';
  const search = options.search?.trim() ?? '';
  const limit = Math.max(1, Math.min(200, options.limit ?? 20));
  const offset = Math.max(0, options.offset ?? 0);
  const since = isoNDaysAgo(7);

  // 1) Contagens por status (sempre todas, pra mostrar badges das tabs)
  const [activeCount, pausedCount] = await Promise.all([
    supabase.from('marketing_campaigns').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('marketing_campaigns').select('id', { count: 'exact', head: true }).eq('status', 'paused'),
  ]);
  const countByStatus = {
    active: activeCount.count ?? 0,
    paused: pausedCount.count ?? 0,
    total: (activeCount.count ?? 0) + (pausedCount.count ?? 0),
  };

  // 2) Lista filtrada
  let query = supabase
    .from('marketing_campaigns')
    .select('id, codigo_portfolio, name, status, daily_budget_cents, cpl_alerta_brl, cpl_critico_brl, last_synced_at', { count: 'exact' });

  if (status === 'active') query = query.eq('status', 'active');
  else if (status === 'paused') query = query.eq('status', 'paused');
  else query = query.in('status', ['active', 'paused']);

  if (search) query = query.ilike('name', `%${search}%`);

  query = query
    .order('status', { ascending: true })
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1);

  const { data: camps, count: total } = await query;

  if (!camps || camps.length === 0) {
    return { rows: [], total: total ?? 0, countByStatus };
  }

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

  const rows = camps.map((c) => {
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

  return { rows, total: total ?? 0, countByStatus };
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

// ─── Channel Funnel (S1 Dashboard Unificado) ────────────────────────────────

/** Janela de período para consultas do funil por canal. */
export interface ChannelFunnelPeriodo {
  /** Data de início inclusive, formato YYYY-MM-DD */
  start: string;
  /** Data de fim inclusive, formato YYYY-MM-DD */
  end: string;
}

/** Uma linha do funil por canal, retornada por aggregateChannelFunnel / fetchChannelFunnel. */
export interface ChannelFunnelRow {
  channel: Channel;
  /** Total de leads no período */
  total: number;
  /** Leads com status 'qualificado' (espelha funil existente) */
  qualificado: number;
  /** Leads com status 'agendado' (espelha funil existente) */
  agendado: number;
  /** Gasto total em centavos somado do channel_daily_metrics no período */
  spend_cents: number;
  /** Custo por lead (spend_cents / total). null quando total = 0 */
  cpl: number | null;
  /** Custo por agendamento (spend_cents / agendado). null quando agendado = 0 */
  custo_por_agendamento: number | null;
}

const ALL_CHANNELS: Channel[] = ['meta', 'google', 'blog', 'direto', 'indicacao', 'outro'];

interface LeadSlim {
  channel: string | null | undefined;
  status: string;
}

interface MetricSlim {
  channel: string;
  spend_cents: number;
}

/**
 * Função PURA (sem I/O): agrega funil por canal e junta gasto do channel_daily_metrics.
 *
 * Regras de contagem espelham o funil existente no cockpit:
 *  - qualificado = status === 'qualificado'
 *  - agendado    = status === 'agendado'
 * channel null/'' → 'direto'.
 * Garante slot para todos os 6 canais canônicos.
 */
export function aggregateChannelFunnel(
  leads: LeadSlim[],
  metrics: MetricSlim[],
): ChannelFunnelRow[] {
  // Inicializa mapa com zeros para todos os 6 canais
  const map = new Map<Channel, { total: number; qualificado: number; agendado: number }>();
  for (const ch of ALL_CHANNELS) {
    map.set(ch, { total: 0, qualificado: 0, agendado: 0 });
  }

  // Agrega leads
  for (const lead of leads) {
    const raw = lead.channel;
    const ch: Channel = (raw && ALL_CHANNELS.includes(raw as Channel))
      ? (raw as Channel)
      : 'direto';
    const slot = map.get(ch)!;
    slot.total++;
    if (lead.status === 'qualificado') slot.qualificado++;
    if (lead.status === 'agendado') slot.agendado++;
  }

  // Agrega spend por canal
  const spendMap = new Map<string, number>();
  for (const m of metrics) {
    spendMap.set(m.channel, (spendMap.get(m.channel) ?? 0) + (m.spend_cents ?? 0));
  }

  // Monta resultado mantendo ordem canônica
  return ALL_CHANNELS.map((ch) => {
    const slot = map.get(ch)!;
    const spend_cents = spendMap.get(ch) ?? 0;
    const cpl = slot.total > 0 ? spend_cents / slot.total : null;
    const custo_por_agendamento = slot.agendado > 0 ? spend_cents / slot.agendado : null;
    return {
      channel: ch,
      total: slot.total,
      qualificado: slot.qualificado,
      agendado: slot.agendado,
      spend_cents,
      cpl,
      custo_por_agendamento,
    };
  });
}

/**
 * I/O fino: busca leads do período + channel_daily_metrics do período,
 * chama aggregateChannelFunnel (pura) e retorna as linhas.
 *
 * Janela: leads.created_at >= start AND <= end (dia completo, mesmo critério
 * do funil existente que usa gte/lte em datas YYYY-MM-DD).
 * channel_daily_metrics.date >= start AND <= end.
 */
export async function fetchChannelFunnel(
  supabase: SupabaseClient,
  periodo: ChannelFunnelPeriodo,
): Promise<ChannelFunnelRow[]> {
  const [leadsRes, metricsRes] = await Promise.all([
    supabase
      .from('leads')
      .select('channel, status')
      .gte('created_at', periodo.start)
      .lte('created_at', periodo.end + 'T23:59:59.999Z')
      .limit(10000),
    supabase
      .from('channel_daily_metrics')
      .select('channel, spend_cents')
      .gte('date', periodo.start)
      .lte('date', periodo.end),
  ]);

  const leads = (leadsRes.data ?? []) as LeadSlim[];
  const metrics = (metricsRes.data ?? []) as MetricSlim[];

  return aggregateChannelFunnel(leads, metrics);
}
