import type { SupabaseClient } from '@supabase/supabase-js';

const GRAPH = 'https://graph.facebook.com/v22.0';

interface MetaCampaignMeta {
  id: string;
  name?: string;
  status?: string;             // 'ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED'
  objective?: string;
  daily_budget?: string;       // string com valor em cents
  lifetime_budget?: string;
}

/**
 * Sincroniza status/name/objective/budget de cada campanha do DB com o estado
 * real no Meta. Roda antes do collectInsights pra garantir que campanhas
 * pausadas no Meta nao recebam chamada de /insights (e que dashboard reflita
 * estado real). NAO cria nem deleta — apenas atualiza o que existe.
 */
export async function syncCampaignStatuses(
  supabase: SupabaseClient,
  accessToken: string,
): Promise<{ synced: number; changed: number }> {
  const { data: campaigns } = await supabase
    .from('marketing_campaigns')
    .select('id, meta_campaign_id, status, name, objective, daily_budget_cents');

  if (!campaigns || campaigns.length === 0) return { synced: 0, changed: 0 };

  let synced = 0;
  let changed = 0;

  for (const camp of campaigns) {
    if (!camp.meta_campaign_id) continue;
    try {
      const url = `${GRAPH}/${camp.meta_campaign_id}?fields=id,name,status,objective,daily_budget,lifetime_budget&access_token=${accessToken}`;
      const r = await fetch(url);
      if (!r.ok) {
        console.warn(`[sync-campaigns] camp=${camp.id} HTTP ${r.status}`);
        continue;
      }
      const meta = (await r.json()) as MetaCampaignMeta;
      const newStatus = (meta.status ?? '').toLowerCase(); // ACTIVE -> active
      const newBudget = meta.daily_budget ? parseInt(meta.daily_budget, 10) : null;

      const patch: Record<string, unknown> = {};
      if (newStatus && newStatus !== camp.status) patch.status = newStatus;
      if (meta.name && meta.name !== camp.name) patch.name = meta.name;
      if (meta.objective && meta.objective !== camp.objective) patch.objective = meta.objective;
      if (newBudget != null && newBudget !== camp.daily_budget_cents) patch.daily_budget_cents = newBudget;

      synced++;
      if (Object.keys(patch).length > 0) {
        await supabase.from('marketing_campaigns').update(patch).eq('id', camp.id);
        changed++;
        console.log(`[sync-campaigns] camp=${camp.id} updated:`, Object.keys(patch).join(','));
      }
    } catch (err) {
      console.error(`[sync-campaigns] camp=${camp.id} error:`, (err as Error).message);
    }
  }

  if (synced > 0) console.log(`[sync-campaigns] ${synced} sincronizadas, ${changed} mudaram`);
  return { synced, changed };
}

interface InsightAction {
  action_type: string;
  value: string;
}

interface InsightRow {
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  actions?: InsightAction[];
  cost_per_action_type?: InsightAction[];
  date_start?: string;
  date_stop?: string;
}

/**
 * Para cada campaign em marketing_campaigns com status='active', busca os
 * insights de hoje na Meta Ads API e grava 1 linha em meta_ads_insights.
 * Roda em cron 2h. Erro em uma campanha nao bloqueia as outras.
 */
export async function collectInsights(
  supabase: SupabaseClient,
  accessToken: string,
): Promise<{ ok: number; failed: number }> {
  const { data: campaigns, error: listErr } = await supabase
    .from('marketing_campaigns')
    .select('id, meta_campaign_id, name')
    .eq('status', 'active');

  if (listErr) {
    console.error('[insights] listing campaigns failed:', listErr.message);
    return { ok: 0, failed: 0 };
  }
  if (!campaigns || campaigns.length === 0) return { ok: 0, failed: 0 };

  let ok = 0;
  let failed = 0;
  const fields = 'spend,impressions,reach,clicks,ctr,cpc,cpm,actions,cost_per_action_type,date_start,date_stop';

  // Acumulador para agregação diária cross-campaign (alimenta channel_daily_metrics)
  const dailyRows: { date_start: string; spend_cents: number; clicks: number; impressions: number }[] = [];

  for (const camp of campaigns) {
    if (!camp.meta_campaign_id) {
      console.warn(`[insights] camp=${camp.id} sem meta_campaign_id, pulando`);
      continue;
    }
    try {
      const url = `${GRAPH}/${camp.meta_campaign_id}/insights?fields=${fields}&date_preset=today&access_token=${accessToken}`;
      const r = await fetch(url);
      if (!r.ok) {
        const body = await r.text();
        console.warn(`[insights] camp=${camp.id} HTTP ${r.status}: ${body.slice(0, 200)}`);
        failed++;
        continue;
      }
      const json = (await r.json()) as { data?: InsightRow[] };
      const rows = json.data ?? [];

      for (const i of rows) {
        const leads = parseInt(i.actions?.find((a) => a.action_type === 'lead')?.value ?? '0', 10);
        const spend_cents = Math.round(parseFloat(i.spend ?? '0') * 100);
        const cpl_cents = leads > 0 ? Math.round(spend_cents / leads) : null;

        // Acumula para agregação diária cross-campaign (channel_daily_metrics)
        if (i.date_start) {
          dailyRows.push({
            date_start: i.date_start,
            spend_cents,
            clicks: parseInt(i.clicks ?? '0', 10),
            impressions: parseInt(i.impressions ?? '0', 10),
          });
        }

        // Dedup: cada run de 2h reescreve o snapshot daquele (campaign_id, date_start).
        // Sem isso, KPIs do dashboard somariam o mesmo dia 12x. Schema nao tem UNIQUE,
        // entao usamos DELETE+INSERT em vez de upsert.
        if (i.date_start) {
          await supabase.from('meta_ads_insights')
            .delete()
            .eq('campaign_id', camp.id)
            .eq('date_start', i.date_start);
        }

        const { error: insErr } = await supabase.from('meta_ads_insights').insert({
          campaign_id: camp.id,
          spend_cents,
          impressions: parseInt(i.impressions ?? '0', 10),
          reach: parseInt(i.reach ?? '0', 10),
          clicks: parseInt(i.clicks ?? '0', 10),
          ctr_pct: parseFloat(i.ctr ?? '0'),
          cpc_cents: Math.round(parseFloat(i.cpc ?? '0') * 100),
          cpm_cents: Math.round(parseFloat(i.cpm ?? '0') * 100),
          leads,
          cpl_cents,
          raw_payload: i,
          date_start: i.date_start,
          date_stop: i.date_stop,
        });
        if (insErr) {
          console.error(`[insights] insert camp=${camp.id} failed: ${insErr.message}`);
          failed++;
        } else {
          ok++;
        }
      }

      await supabase
        .from('marketing_campaigns')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', camp.id);
    } catch (err) {
      console.error(`[insights] error camp=${camp.id}:`, (err as Error).message);
      failed++;
    }
  }

  // Aditivo: agrega por dia e grava em channel_daily_metrics (best-effort, nao bloqueia cron)
  try {
    const aggregated = aggregateMetaDaily(dailyRows);
    if (aggregated.length > 0) {
      const { error: chErr } = await supabase
        .from('channel_daily_metrics')
        .upsert(
          aggregated.map((row) => ({
            channel: 'meta',
            date: row.date,
            spend_cents: row.spend_cents,
            clicks: row.clicks,
            impressions: row.impressions,
            source: 'meta_insights',
            updated_at: new Date().toISOString(),
          })),
          { onConflict: 'channel,date' },
        );
      if (chErr) {
        console.warn(`[channel-metrics] upsert channel_daily_metrics failed: ${chErr.message}`);
      } else {
        console.log(`[channel-metrics] ${aggregated.length} dia(s) gravados em channel_daily_metrics`);
      }
    }
  } catch (err) {
    console.warn(`[channel-metrics] erro inesperado ao gravar channel_daily_metrics: ${(err as Error).message}`);
  }

  console.log(`[insights] collector done: ${ok} ok, ${failed} failed (${campaigns.length} campaigns)`);
  return { ok, failed };
}

// ---------- helper puro exportado (usado por collectInsights + testes) ----------

/**
 * Agrega rows Meta por dia, somando spend_cents, clicks e impressions.
 * Funcao pura: sem I/O, sem efeitos colaterais.
 */
export function aggregateMetaDaily(
  rows: { date_start: string; spend_cents: number; clicks: number; impressions: number }[],
): { date: string; spend_cents: number; clicks: number; impressions: number }[] {
  if (rows.length === 0) return [];

  const map = new Map<string, { spend_cents: number; clicks: number; impressions: number }>();
  for (const row of rows) {
    const existing = map.get(row.date_start);
    if (existing) {
      existing.spend_cents += row.spend_cents;
      existing.clicks += row.clicks;
      existing.impressions += row.impressions;
    } else {
      map.set(row.date_start, {
        spend_cents: row.spend_cents,
        clicks: row.clicks,
        impressions: row.impressions,
      });
    }
  }

  return Array.from(map.entries()).map(([date, totals]) => ({ date, ...totals }));
}
