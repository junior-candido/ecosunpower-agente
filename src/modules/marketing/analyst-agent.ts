import type { SupabaseClient } from '@supabase/supabase-js';
import { detectPatterns, type WeeklyData, type Pattern } from './analyst-correlations.js';

interface InsightRow {
  id: number;
  campaign_id: number;
  spend_cents: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr_pct: number;
  cpc_cents: number;
  cpm_cents: number;
  leads: number | null;
  cpl_cents: number | null;
  date_start: string;
  date_stop: string;
}

/**
 * Relatório matinal: ontem em numeros (gasto, leads, CPL, melhor/pior campanha).
 * Roda diariamente as 9h BRT. Mensagem curta pra Junior consumir antes do café.
 */
export async function buildDailyReport(supabase: SupabaseClient): Promise<string> {
  const yday = new Date();
  yday.setUTCDate(yday.getUTCDate() - 1);
  const ystr = yday.toISOString().slice(0, 10);

  const { data: insightsYday } = await supabase
    .from('meta_ads_insights')
    .select('*, marketing_campaigns(name)')
    .eq('date_start', ystr);

  const rows = (insightsYday ?? []) as Array<InsightRow & { marketing_campaigns?: { name?: string } }>;

  if (rows.length === 0) {
    return `📊 *Marketing ${ystr}*\n\nNenhuma campanha ativa registrou movimento ontem.`;
  }

  const spend = rows.reduce((s, i) => s + (i.spend_cents ?? 0), 0) / 100;
  const leads = rows.reduce((s, i) => s + (i.leads ?? 0), 0);
  const clicks = rows.reduce((s, i) => s + (i.clicks ?? 0), 0);
  const impressions = rows.reduce((s, i) => s + (i.impressions ?? 0), 0);
  const cpl = leads > 0 ? spend / leads : null;
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : null;

  // Filtra so campanhas com leads suficientes pra ranking ter significado
  // (uma campanha com 1 lead barato nao deve ganhar de uma com 20 leads + CPL maior).
  const ranked = rows.filter((i) => i.cpl_cents != null && (i.cpl_cents ?? 0) > 0 && (i.leads ?? 0) >= 3);
  ranked.sort((a, b) => (a.cpl_cents ?? 0) - (b.cpl_cents ?? 0));
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];

  let msg = `📊 *Marketing ${ystr}*\n\n`;
  msg += `💰 Gasto: R$ ${spend.toFixed(2)}\n`;
  msg += `👥 Leads: ${leads}`;
  if (cpl) msg += `  •  CPL R$ ${cpl.toFixed(2)}`;
  msg += `\n👁️ Impressões: ${impressions.toLocaleString('pt-BR')}`;
  if (ctr) msg += `  •  CTR ${ctr.toFixed(2)}%`;
  msg += `\n`;

  if (best) {
    msg += `\n🥇 Melhor: ${best.marketing_campaigns?.name ?? `camp #${best.campaign_id}`} (CPL R$ ${((best.cpl_cents ?? 0) / 100).toFixed(2)})`;
  }
  if (worst && worst.id !== best?.id) {
    msg += `\n⚠️ Pior: ${worst.marketing_campaigns?.name ?? `camp #${worst.campaign_id}`} (CPL R$ ${((worst.cpl_cents ?? 0) / 100).toFixed(2)})`;
  }

  return msg;
}

/**
 * Relatório semanal: ultimos 7 dias agregados + detectPatterns aplicado.
 * Roda 1x na segunda 8h BRT.
 */
export async function buildWeeklyReport(supabase: SupabaseClient): Promise<{ message: string; patterns: Pattern[] }> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 7);
  const sinceStr = since.toISOString().slice(0, 10);

  const { data: insights } = await supabase
    .from('meta_ads_insights')
    .select('*, marketing_campaigns(id, codigo_portfolio, name)')
    .gte('date_start', sinceStr);

  const rows = (insights ?? []) as Array<InsightRow & { marketing_campaigns?: { id: number; codigo_portfolio?: string; name?: string } }>;

  // Agrega por campaign_id
  type Agg = { id: number; name: string; codigo_portfolio: string; leads: number; spend_cents: number; ctr_sum: number; ctr_count: number };
  const byCamp = new Map<number, Agg>();
  for (const r of rows) {
    const id = r.campaign_id;
    const a = byCamp.get(id) ?? {
      id,
      name: r.marketing_campaigns?.name ?? `camp #${id}`,
      codigo_portfolio: r.marketing_campaigns?.codigo_portfolio ?? '',
      leads: 0, spend_cents: 0, ctr_sum: 0, ctr_count: 0,
    };
    a.leads += r.leads ?? 0;
    a.spend_cents += r.spend_cents ?? 0;
    if (r.ctr_pct > 0) { a.ctr_sum += r.ctr_pct; a.ctr_count++; }
    byCamp.set(id, a);
  }

  // Leads por dia da semana (a partir do que existe em conversations/lead_status,
  // mas pra v1 usamos os leads agregados dos insights por date_start)
  const byDow = new Map<number, number>();
  for (const r of rows) {
    if (!r.date_start || !r.leads) continue;
    const dow = new Date(r.date_start + 'T12:00:00Z').getUTCDay();
    byDow.set(dow, (byDow.get(dow) ?? 0) + r.leads);
  }

  const data: WeeklyData = {
    creatives: [], // TODO próximo PR: cruzar com marketing_creatives + dm_threads pra conversations
    campaigns: Array.from(byCamp.values()).map((a) => ({
      id: a.id, codigo_portfolio: a.codigo_portfolio, name: a.name,
      leads: a.leads, spend_cents: a.spend_cents,
    })),
    leads_by_day: Array.from(byDow.entries()).map(([day_of_week, count]) => ({ day_of_week, count })),
    leads_by_persona: {},
  };

  const patterns = detectPatterns(data);

  const totalSpend = data.campaigns.reduce((s, c) => s + c.spend_cents, 0) / 100;
  const totalLeads = data.campaigns.reduce((s, c) => s + c.leads, 0);
  const cpl = totalLeads > 0 ? totalSpend / totalLeads : null;

  let message = `📊 *Marketing — última semana*\n\n`;
  message += `💰 Gasto total: R$ ${totalSpend.toFixed(2)}\n`;
  message += `👥 Leads: ${totalLeads}`;
  if (cpl) message += `  •  CPL médio R$ ${cpl.toFixed(2)}`;
  message += `\n📌 Campanhas ativas: ${data.campaigns.length}\n`;

  if (patterns.length === 0) {
    message += `\n✅ Nenhum padrão crítico detectado — tudo dentro do esperado.`;
  } else {
    message += `\n🔍 *${patterns.length} padrões detectados:*\n`;
    for (const p of patterns) {
      const icon = p.severity === 'critical' ? '🚨' : p.severity === 'warning' ? '⚠️' : 'ℹ️';
      message += `\n${icon} ${p.message}\n💡 ${p.recommendation}\n`;
    }
  }

  return { message, patterns };
}
