// src/modules/marketing/campaign-quality-data.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CampaignSpend, CampaignLeads } from './campaign-quality.js';

const MS_DIA = 24 * 60 * 60 * 1000;

export async function fetchCampaignQualityInputs(
  client: SupabaseClient,
  janelaDias: number,
  agora: Date = new Date(),
): Promise<{ spends: CampaignSpend[]; leads: CampaignLeads[] }> {
  const desde = new Date(agora.getTime() - janelaDias * MS_DIA).toISOString();
  const corte48h = new Date(agora.getTime() - 2 * MS_DIA).toISOString();

  const { data: camps } = await client
    .from('marketing_campaigns')
    .select('id, meta_campaign_id, name');
  const campById = new Map((camps ?? []).map((c: any) => [c.id, { metaId: c.meta_campaign_id as string, name: c.name as string }]));

  const { data: insights } = await client
    .from('meta_ads_insights')
    .select('campaign_id, spend_cents, date_start')
    .gte('date_start', desde.slice(0, 10));
  const spendByMetaId = new Map<string, { name: string; cents: number }>();
  for (const row of (insights ?? []) as any[]) {
    const camp = campById.get(row.campaign_id);
    if (!camp) continue;
    const cur = spendByMetaId.get(camp.metaId) ?? { name: camp.name, cents: 0 };
    cur.cents += row.spend_cents ?? 0;
    spendByMetaId.set(camp.metaId, cur);
  }
  const spends: CampaignSpend[] = [...spendByMetaId.entries()].map(([campaignId, v]) => ({
    campaignId, name: v.name, spendBrl: v.cents / 100,
  }));

  const { data: leadsRows } = await client
    .from('leads')
    .select('ad_campaign_id, status, created_at')
    .gte('created_at', desde)
    .not('ad_campaign_id', 'is', null);
  const leadAgg = new Map<string, { qualified: number; totalLeads: number }>();
  for (const l of (leadsRows ?? []) as any[]) {
    // leads.ad_campaign_id guarda o ID Meta (string) da campanha — MESMO espaço
    // de chave que marketing_campaigns.meta_campaign_id usado em `spends`. Por
    // isso o join na calculadora (campaignId == campaignId) alinha. Não converter.
    const id = l.ad_campaign_id as string;
    const isQualified = l.status === 'qualificado';
    const isFresh = l.created_at > corte48h;
    // Janela justa: lead novo (<48h) ainda nao qualificado nao conta no total
    // (ainda pode responder; nao penaliza a campanha cedo demais).
    if (isFresh && !isQualified) continue;
    const cur = leadAgg.get(id) ?? { qualified: 0, totalLeads: 0 };
    cur.totalLeads += 1;
    if (isQualified) cur.qualified += 1;
    leadAgg.set(id, cur);
  }
  const leads: CampaignLeads[] = [...leadAgg.entries()].map(([campaignId, v]) => ({
    campaignId, qualified: v.qualified, totalLeads: v.totalLeads,
  }));

  return { spends, leads };
}
