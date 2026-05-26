/**
 * meta-app-review-user-token.ts
 *
 * Roda chamadas pras 3 permissions pendentes (ads_management, ads_read,
 * pages_manage_posts) usando User Access Token gerado via Graph API Explorer.
 *
 * Hipotese: System User tokens nao contam pro App Review.
 * Test: com User Token, Meta deve detectar e marcar checkboxes verdes.
 */

import 'dotenv/config';

const GRAPH = 'https://graph.facebook.com/v22.0';
const TOKEN = process.env.META_USER_TOKEN!;
const AD_ACCOUNT = process.env.META_AD_ACCOUNT_ID!;
const PAGE_ID = process.env.META_PAGE_ID!;

if (!TOKEN || !AD_ACCOUNT || !PAGE_ID) {
  console.error('Faltam env vars');
  process.exit(1);
}

interface Result { group: string; action: string; status: number; ok: boolean; body?: any; }
const results: Result[] = [];

async function call(group: string, action: string, opts: { path: string; method?: string; body?: Record<string, any>; token?: string }) {
  const tk = opts.token ?? TOKEN;
  const url = `${GRAPH}/${opts.path}`;
  const method = opts.method ?? 'GET';

  let r: Response;
  if (method === 'POST') {
    const params = new URLSearchParams({ ...(opts.body ?? {}), access_token: tk });
    r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
  } else if (method === 'DELETE') {
    r = await fetch(`${url}?access_token=${tk}`, { method: 'DELETE' });
  } else {
    r = await fetch(`${url}${url.includes('?') ? '&' : '?'}access_token=${tk}`);
  }
  const body = await r.text();
  const parsed = (() => { try { return JSON.parse(body); } catch { return body.slice(0, 300); } })();
  const res: Result = { group, action, status: r.status, ok: r.ok, body: parsed };
  results.push(res);
  console.log(`[${group}] ${action}: HTTP ${r.status} ${r.ok ? 'OK' : 'FAIL'}`);
  if (!r.ok) console.log(`  body: ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed).slice(0, 250)}`);
  return res;
}

async function main() {
  const ts = Date.now();
  console.log(`=== Trigger com User Token (User ID 26333084296383470) ===\n`);

  // --- ads_read ---
  console.log('--- ads_read ---');
  await call('ads_read', 'GET ad account', { path: `${AD_ACCOUNT}?fields=id,name,account_status,balance,amount_spent,currency,business` });
  await call('ads_read', 'GET campaigns', { path: `${AD_ACCOUNT}/campaigns?fields=id,name,status,objective&limit=10` });
  await call('ads_read', 'GET adsets', { path: `${AD_ACCOUNT}/adsets?fields=id,name,status&limit=10` });
  await call('ads_read', 'GET ads', { path: `${AD_ACCOUNT}/ads?fields=id,name,status&limit=10` });
  await call('ads_read', 'GET insights last_30d', { path: `${AD_ACCOUNT}/insights?level=campaign&date_preset=last_30d&fields=spend,impressions,clicks&limit=10` });
  await call('ads_read', 'GET adcreatives', { path: `${AD_ACCOUNT}/adcreatives?fields=id,name&limit=5` });

  // --- ads_management ---
  console.log('\n--- ads_management ---');
  const camp = await call('ads_management', 'POST create campaign PAUSED', {
    path: `${AD_ACCOUNT}/campaigns`,
    method: 'POST',
    body: {
      name: `AppReview UserToken Camp ${ts}`,
      objective: 'OUTCOME_TRAFFIC',
      status: 'PAUSED',
      special_ad_categories: JSON.stringify([]),
      buying_type: 'AUCTION',
      is_adset_budget_optimization: 'true',
      daily_budget: '1000',
    },
  });
  const campId = (camp.body as any)?.id;
  if (campId) {
    console.log(`  -> campaign_id: ${campId}`);
    await call('ads_management', 'POST update campaign', { path: campId, method: 'POST', body: { name: `AppReview UserToken Camp ${ts} (upd)` } });

    const adset = await call('ads_management', 'POST create adset', {
      path: `${AD_ACCOUNT}/adsets`,
      method: 'POST',
      body: {
        name: `AppReview UserToken Adset ${ts}`,
        campaign_id: campId,
        status: 'PAUSED',
        billing_event: 'IMPRESSIONS',
        optimization_goal: 'LINK_CLICKS',
        bid_amount: '100',
        targeting: JSON.stringify({
          geo_locations: { countries: ['BR'] },
          age_min: 25, age_max: 55,
          publisher_platforms: ['facebook'],
          facebook_positions: ['feed'],
          targeting_automation: { advantage_audience: 0 },
        }),
        start_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    });
    const adsetId = (adset.body as any)?.id;
    if (adsetId) {
      console.log(`  -> adset_id: ${adsetId}`);
      await call('ads_management', 'POST update adset', { path: adsetId, method: 'POST', body: { name: `AppReview UserToken Adset ${ts} (upd)` } });
      await call('ads_management', 'DELETE adset', { path: adsetId, method: 'DELETE' });
    }
    await call('ads_management', 'DELETE campaign', { path: campId, method: 'DELETE' });
  }

  // --- pages_manage_posts ---
  console.log('\n--- pages_manage_posts ---');
  const accounts = await call('pages_manage_posts', 'GET me/accounts', { path: 'me/accounts?fields=id,name,access_token' });
  const pageEntry = (accounts.body as any)?.data?.find((p: any) => p.id === PAGE_ID);
  const pageToken = pageEntry?.access_token;

  if (pageToken) {
    console.log(`  -> Page Access Token capturado`);
    const post1 = await call('pages_manage_posts', 'POST page/feed unpublished', {
      path: `${PAGE_ID}/feed`,
      method: 'POST',
      body: { message: `App Review user-token test ${ts}`, published: 'false' },
      token: pageToken,
    });
    const post1Id = (post1.body as any)?.id;
    if (post1Id) {
      console.log(`  -> post_id: ${post1Id}`);
      await call('pages_manage_posts', 'POST update post', { path: post1Id, method: 'POST', body: { message: `App Review user-token ${ts} (upd)` }, token: pageToken });
      await call('pages_manage_posts', 'DELETE post', { path: post1Id, method: 'DELETE', token: pageToken });
    }
    const post2 = await call('pages_manage_posts', 'POST page/feed link', {
      path: `${PAGE_ID}/feed`,
      method: 'POST',
      body: { message: `App Review user-token test 2 ${ts}`, link: 'https://ecosunpower.eng.br/', published: 'false' },
      token: pageToken,
    });
    const post2Id = (post2.body as any)?.id;
    if (post2Id) {
      await call('pages_manage_posts', 'DELETE post 2', { path: post2Id, method: 'DELETE', token: pageToken });
    }
  } else {
    console.log('  AVISO: nao consegui Page Token');
  }

  console.log('\n=== SUMARIO ===');
  const byGroup: Record<string, { ok: number; fail: number }> = {};
  for (const r of results) {
    byGroup[r.group] ??= { ok: 0, fail: 0 };
    if (r.ok) byGroup[r.group].ok++; else byGroup[r.group].fail++;
  }
  for (const [g, s] of Object.entries(byGroup)) console.log(`  ${g}: ${s.ok} OK, ${s.fail} FAIL`);
  console.log(`\nTotal: ${results.length} chamadas`);
}

main().catch(e => { console.error('FALHA:', e?.message ?? e); process.exit(1); });
