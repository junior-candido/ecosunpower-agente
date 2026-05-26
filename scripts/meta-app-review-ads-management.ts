/**
 * meta-app-review-ads-management.ts
 *
 * So o bloco ads_management corrigido (com is_adset_budget_optimization).
 * Cria campanha PAUSED -> adset PAUSED -> ad PAUSED -> deleta tudo.
 */

import 'dotenv/config';

const GRAPH = 'https://graph.facebook.com/v22.0';
const TOKEN = process.env.META_MARKETING_TOKEN!;
const AD_ACCOUNT = process.env.META_AD_ACCOUNT_ID!;

if (!TOKEN || !AD_ACCOUNT) {
  console.error('Faltam env vars: META_MARKETING_TOKEN, META_AD_ACCOUNT_ID');
  process.exit(1);
}

async function call(action: string, opts: { path: string; method?: string; body?: Record<string, any> }) {
  const url = `${GRAPH}/${opts.path}`;
  const method = opts.method ?? 'GET';

  let r: Response;
  if (method === 'POST') {
    const params = new URLSearchParams({ ...(opts.body ?? {}), access_token: TOKEN });
    r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
  } else if (method === 'DELETE') {
    r = await fetch(`${url}?access_token=${TOKEN}`, { method: 'DELETE' });
  } else {
    r = await fetch(`${url}?access_token=${TOKEN}`);
  }

  const body = await r.text();
  const parsed = (() => { try { return JSON.parse(body); } catch { return body.slice(0, 400); } })();
  console.log(`[${action}] HTTP ${r.status} ${r.ok ? 'OK' : 'FAIL'}`);
  if (!r.ok) console.log(`  body: ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed).slice(0, 300)}`);
  return { ok: r.ok, status: r.status, body: parsed };
}

async function main() {
  const ts = Date.now();
  console.log('=== ads_management trigger ===\n');

  // 1. CRIAR CAMPANHA
  const campRes = await call('POST create campaign PAUSED', {
    path: `${AD_ACCOUNT}/campaigns`,
    method: 'POST',
    body: {
      name: `AppReview Test Campaign ${ts}`,
      objective: 'OUTCOME_TRAFFIC',
      status: 'PAUSED',
      special_ad_categories: JSON.stringify([]),
      buying_type: 'AUCTION',
      is_adset_budget_optimization: 'true',
      daily_budget: '1000',
    },
  });

  const campaignId = (campRes.body as any)?.id;
  if (!campaignId) {
    console.log('\nNao deu pra criar campanha. Tentando sem CBO...');
    const camp2 = await call('POST create campaign PAUSED (sem CBO)', {
      path: `${AD_ACCOUNT}/campaigns`,
      method: 'POST',
      body: {
        name: `AppReview Test Campaign B ${ts}`,
        objective: 'OUTCOME_TRAFFIC',
        status: 'PAUSED',
        special_ad_categories: JSON.stringify([]),
        buying_type: 'AUCTION',
        is_adset_budget_optimization: 'false',
      },
    });
    const camp2Id = (camp2.body as any)?.id;
    if (camp2Id) {
      console.log(`  -> campaign_id: ${camp2Id}`);
      await call('POST update campaign', { path: camp2Id, method: 'POST', body: { name: `AppReview Test B updated ${ts}` } });
      await call('DELETE campaign', { path: camp2Id, method: 'DELETE' });
    }
    return;
  }

  console.log(`  -> campaign_id: ${campaignId}`);

  // 2. UPDATE campaign
  await call('POST update campaign', {
    path: campaignId,
    method: 'POST',
    body: { name: `AppReview Test Campaign ${ts} (updated)` },
  });

  // 3. CRIAR ADSET (com CBO ligado na campanha, adset NAO precisa daily_budget)
  const adsetRes = await call('POST create adset', {
    path: `${AD_ACCOUNT}/adsets`,
    method: 'POST',
    body: {
      name: `AppReview Test Adset ${ts}`,
      campaign_id: campaignId,
      status: 'PAUSED',
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'LINK_CLICKS',
      bid_amount: '100',
      targeting: JSON.stringify({
        geo_locations: { countries: ['BR'] },
        age_min: 25,
        age_max: 55,
        publisher_platforms: ['facebook'],
        facebook_positions: ['feed'],
        targeting_automation: { advantage_audience: 0 },
      }),
      start_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
  });

  const adsetId = (adsetRes.body as any)?.id;
  if (adsetId) {
    console.log(`  -> adset_id: ${adsetId}`);

    // criar ad (vai falhar sem criativo de verdade, mas dispara permission)
    await call('POST create ad (sem criativo, espera falhar mas dispara perm)', {
      path: `${AD_ACCOUNT}/ads`,
      method: 'POST',
      body: {
        name: `AppReview Test Ad ${ts}`,
        adset_id: adsetId,
        status: 'PAUSED',
      },
    });

    await call('DELETE adset', { path: adsetId, method: 'DELETE' });
  }

  await call('DELETE campaign', { path: campaignId, method: 'DELETE' });

  console.log('\n=== fim ===');
}

main().catch((e) => {
  console.error('FALHA:', e?.message ?? e);
  process.exit(1);
});
