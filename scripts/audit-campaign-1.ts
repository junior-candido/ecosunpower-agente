/**
 * audit-campaign-1.ts
 *
 * Script standalone pra puxar diagnostico completo de uma campanha Meta Ads.
 *
 * Uso:
 *   tsx scripts/audit-campaign-1.ts <campaign_id>
 *
 * Output: JSON via stdout (redirecionar pra arquivo se quiser salvar).
 *
 * Requer env META_WABA_ACCESS_TOKEN com permissoes ads_read no app Meta.
 */

import 'dotenv/config';

const CAMPAIGN_ID = process.argv[2];
const TOKEN = process.env.META_WABA_ACCESS_TOKEN;
const GRAPH = 'https://graph.facebook.com/v22.0';

if (!CAMPAIGN_ID) {
  console.error('Uso: tsx scripts/audit-campaign-1.ts <campaign_id>');
  process.exit(1);
}

if (!TOKEN) {
  console.error('META_WABA_ACCESS_TOKEN nao encontrado no .env');
  process.exit(1);
}

interface MetaError {
  status: number;
  body: string;
  url: string;
}

async function gql<T = any>(path: string, fields: string): Promise<T> {
  const url = `${GRAPH}/${path}?fields=${encodeURIComponent(fields)}&access_token=${TOKEN}`;
  const safeUrl = url.replace(TOKEN!, '***');
  try {
    const r = await fetch(url);
    if (!r.ok) {
      const body = await r.text();
      const err: MetaError = { status: r.status, body, url: safeUrl };
      throw new Error(`Meta API ${r.status} em ${safeUrl}\n${body}`);
    }
    return (await r.json()) as T;
  } catch (e: any) {
    if (e?.message?.startsWith('Meta API')) throw e;
    throw new Error(`Falha de rede em ${safeUrl}: ${e?.message ?? e}`);
  }
}

interface Campaign {
  id: string;
  name?: string;
  objective?: string;
  status?: string;
  effective_status?: string;
  created_time?: string;
  start_time?: string;
  stop_time?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  buying_type?: string;
  special_ad_categories?: string[];
}

interface Adset {
  id: string;
  name?: string;
  status?: string;
  effective_status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  optimization_goal?: string;
  billing_event?: string;
  bid_strategy?: string;
  targeting?: any;
  start_time?: string;
  end_time?: string;
}

interface Creative {
  id: string;
  name?: string;
  title?: string;
  body?: string;
  image_url?: string;
  thumbnail_url?: string;
  object_story_spec?: any;
  call_to_action_type?: string;
}

interface Ad {
  id: string;
  name?: string;
  status?: string;
  effective_status?: string;
  adset_id?: string;
  creative?: Creative | { id: string };
}

interface InsightAction {
  action_type: string;
  value: string;
}

interface Insight {
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  cpp?: string;
  actions?: InsightAction[];
  cost_per_action_type?: InsightAction[];
  date_start?: string;
  date_stop?: string;
}

async function main() {
  // 1) Campanha
  const campaign = await gql<Campaign>(
    CAMPAIGN_ID!,
    'id,name,objective,status,effective_status,created_time,start_time,stop_time,daily_budget,lifetime_budget,buying_type,special_ad_categories'
  );

  // 2) Adsets
  const adsetsRes = await gql<{ data: Adset[] }>(
    `${CAMPAIGN_ID}/adsets`,
    'id,name,status,effective_status,daily_budget,lifetime_budget,optimization_goal,billing_event,bid_strategy,targeting,start_time,end_time'
  );
  const adsets = adsetsRes.data ?? [];

  // 3) Ads + creatives (creative inline com sub-fields)
  const adsRes = await gql<{ data: Ad[] }>(
    `${CAMPAIGN_ID}/ads`,
    'id,name,status,effective_status,adset_id,creative{id,name,title,body,image_url,thumbnail_url,object_story_spec,call_to_action_type}'
  );
  const ads = adsRes.data ?? [];

  // 4) Insights da campanha (lifetime)
  let campaignInsights: Insight[] = [];
  try {
    const insRes = await gql<{ data: Insight[] }>(
      `${CAMPAIGN_ID}/insights`,
      'spend,impressions,reach,clicks,ctr,cpc,cpm,cpp,actions,cost_per_action_type,date_start,date_stop'
    );
    campaignInsights = insRes.data ?? [];
  } catch (e: any) {
    campaignInsights = [];
    console.error(`[warn] insights da campanha falhou: ${e?.message ?? e}`);
  }

  // 5) Insights por adset (pra granularidade)
  const adsetInsights: Record<string, Insight[]> = {};
  for (const as of adsets) {
    try {
      const r = await gql<{ data: Insight[] }>(
        `${as.id}/insights`,
        'spend,impressions,reach,clicks,ctr,cpc,cpm,cpp,actions,cost_per_action_type,date_start,date_stop'
      );
      adsetInsights[as.id] = r.data ?? [];
    } catch (e: any) {
      adsetInsights[as.id] = [];
      console.error(`[warn] insights do adset ${as.id} falhou: ${e?.message ?? e}`);
    }
  }

  // 6) Insights por ad
  const adInsights: Record<string, Insight[]> = {};
  for (const ad of ads) {
    try {
      const r = await gql<{ data: Insight[] }>(
        `${ad.id}/insights`,
        'spend,impressions,reach,clicks,ctr,cpc,cpm,cpp,actions,cost_per_action_type,date_start,date_stop'
      );
      adInsights[ad.id] = r.data ?? [];
    } catch (e: any) {
      adInsights[ad.id] = [];
      console.error(`[warn] insights do ad ${ad.id} falhou: ${e?.message ?? e}`);
    }
  }

  // 7) Diagnostico basico
  const totalSpend = campaignInsights.reduce((s, i) => s + parseFloat(i.spend ?? '0'), 0);
  const totalImpressions = campaignInsights.reduce((s, i) => s + parseInt(i.impressions ?? '0', 10), 0);
  const totalClicks = campaignInsights.reduce((s, i) => s + parseInt(i.clicks ?? '0', 10), 0);
  const avgCtr = campaignInsights.length
    ? campaignInsights.reduce((s, i) => s + parseFloat(i.ctr ?? '0'), 0) / campaignInsights.length
    : 0;
  const avgCpc = campaignInsights.length
    ? campaignInsights.reduce((s, i) => s + parseFloat(i.cpc ?? '0'), 0) / campaignInsights.length
    : 0;
  const avgCpm = campaignInsights.length
    ? campaignInsights.reduce((s, i) => s + parseFloat(i.cpm ?? '0'), 0) / campaignInsights.length
    : 0;

  const obs: string[] = [];
  if (campaign.objective) obs.push(`Objetivo da campanha: ${campaign.objective}`);
  obs.push(`Quantidade de adsets: ${adsets.length}`);
  obs.push(`Quantidade de ads: ${ads.length}`);
  if (adsets.length === 0) obs.push('ALERTA: campanha sem adsets — nada vai rodar.');
  if (ads.length === 0) obs.push('ALERTA: campanha sem ads — nada vai rodar.');
  if (totalSpend > 0 && totalClicks === 0) obs.push('ALERTA: gastou mas nao gerou cliques — problema de criativo/segmentacao.');
  const distinctOptGoals = Array.from(new Set(adsets.map((a) => a.optimization_goal).filter(Boolean)));
  if (distinctOptGoals.length > 1) obs.push(`Multiplos optimization_goal entre adsets: ${distinctOptGoals.join(', ')}`);

  const diagnostico = {
    gasto_total_brl: Number(totalSpend.toFixed(2)),
    impressoes_totais: totalImpressions,
    cliques_totais: totalClicks,
    ctr_medio_pct: Number(avgCtr.toFixed(3)),
    cpc_medio_brl: Number(avgCpc.toFixed(2)),
    cpm_medio_brl: Number(avgCpm.toFixed(2)),
    observacoes: obs,
  };

  const output = {
    audited_at: new Date().toISOString(),
    campaign_id: CAMPAIGN_ID,
    campaign,
    adsets,
    ads,
    campaign_insights: campaignInsights,
    adset_insights: adsetInsights,
    ad_insights: adInsights,
    diagnostico,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((e) => {
  console.error('FALHA:', e?.message ?? e);
  process.exit(1);
});
