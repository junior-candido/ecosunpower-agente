/**
 * meta-app-review-trigger.ts
 *
 * Dispara chamadas API agressivas pras 3 permissions pendentes no App Review:
 *  - ads_management (criar/atualizar/deletar campanha, adset, ad)
 *  - ads_read (GET campaigns, adsets, ads, insights, breakdowns)
 *  - pages_manage_posts (POST feed unpublished, atualizar, deletar)
 *
 * Cada bloco mostra HTTP status. Sem expor token nos logs.
 *
 * Uso: tsx scripts/meta-app-review-trigger.ts
 */

import 'dotenv/config';

const GRAPH = 'https://graph.facebook.com/v22.0';
const TOKEN = process.env.META_MARKETING_TOKEN!;
const AD_ACCOUNT = process.env.META_AD_ACCOUNT_ID!;
const PAGE_ID = process.env.META_PAGE_ID!;

if (!TOKEN || !AD_ACCOUNT || !PAGE_ID) {
  console.error('Faltam env vars: META_MARKETING_TOKEN, META_AD_ACCOUNT_ID, META_PAGE_ID');
  process.exit(1);
}

interface Result {
  group: string;
  action: string;
  status: number;
  ok: boolean;
  body?: any;
}

const results: Result[] = [];

async function call(group: string, action: string, opts: { path: string; method?: string; body?: Record<string, any>; token?: string }) {
  const tk = opts.token ?? TOKEN;
  const url = `${GRAPH}/${opts.path}`;
  const init: RequestInit = { method: opts.method ?? 'GET' };

  if (opts.method === 'POST' || opts.method === 'DELETE') {
    const params = new URLSearchParams({ ...(opts.body ?? {}), access_token: tk });
    init.method = opts.method;
    if (opts.method === 'POST') {
      init.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
      init.body = params.toString();
    } else {
      // DELETE com access_token na query
      const finalUrl = `${url}?access_token=${tk}`;
      const r = await fetch(finalUrl, { method: 'DELETE' });
      const body = await r.text();
      const parsed = (() => { try { return JSON.parse(body); } catch { return body.slice(0, 300); } })();
      const res: Result = { group, action, status: r.status, ok: r.ok, body: parsed };
      results.push(res);
      console.log(`[${group}] ${action}: HTTP ${r.status} ${r.ok ? 'OK' : 'FAIL'}`);
      if (!r.ok) console.log(`  body: ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed).slice(0, 200)}`);
      return res;
    }
  } else {
    const finalUrl = `${url}${url.includes('?') ? '&' : '?'}access_token=${tk}`;
    init.method = 'GET';
    const r = await fetch(finalUrl);
    const body = await r.text();
    const parsed = (() => { try { return JSON.parse(body); } catch { return body.slice(0, 300); } })();
    const res: Result = { group, action, status: r.status, ok: r.ok, body: parsed };
    results.push(res);
    console.log(`[${group}] ${action}: HTTP ${r.status} ${r.ok ? 'OK' : 'FAIL'}`);
    if (!r.ok) console.log(`  body: ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed).slice(0, 200)}`);
    return res;
  }

  // POST flow (cai aqui se chegou no init.body)
  const r = await fetch(url, init);
  const body = await r.text();
  const parsed = (() => { try { return JSON.parse(body); } catch { return body.slice(0, 300); } })();
  const res: Result = { group, action, status: r.status, ok: r.ok, body: parsed };
  results.push(res);
  console.log(`[${group}] ${action}: HTTP ${r.status} ${r.ok ? 'OK' : 'FAIL'}`);
  if (!r.ok) console.log(`  body: ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed).slice(0, 200)}`);
  return res;
}

async function main() {
  console.log('=== Disparando chamadas pra trigger App Review ===\n');
  console.log(`Token len: ${TOKEN.length}, Ad Account: ${AD_ACCOUNT}, Page: ${PAGE_ID}\n`);

  // -----------------------------------------------------------------
  // BLOCO 1: ads_read — GETs variados
  // -----------------------------------------------------------------
  console.log('--- ads_read ---');
  await call('ads_read', 'GET ad account info', { path: `${AD_ACCOUNT}?fields=id,name,account_status,balance,amount_spent,currency,timezone_name,business` });
  await call('ads_read', 'GET campaigns', { path: `${AD_ACCOUNT}/campaigns?fields=id,name,status,objective,daily_budget,lifetime_budget,created_time&limit=10` });
  await call('ads_read', 'GET adsets', { path: `${AD_ACCOUNT}/adsets?fields=id,name,status,optimization_goal,daily_budget&limit=10` });
  await call('ads_read', 'GET ads', { path: `${AD_ACCOUNT}/ads?fields=id,name,status,adset_id,creative&limit=10` });
  await call('ads_read', 'GET insights campaign last_30d', { path: `${AD_ACCOUNT}/insights?level=campaign&date_preset=last_30d&fields=spend,impressions,clicks,ctr,cpc,reach&limit=10` });
  await call('ads_read', 'GET insights adset breakdown age', { path: `${AD_ACCOUNT}/insights?level=adset&date_preset=last_30d&breakdowns=age&limit=5` });
  await call('ads_read', 'GET insights ad breakdown publisher_platform', { path: `${AD_ACCOUNT}/insights?level=ad&date_preset=last_30d&breakdowns=publisher_platform&limit=5` });
  await call('ads_read', 'GET adcreatives', { path: `${AD_ACCOUNT}/adcreatives?fields=id,name,title,body,thumbnail_url&limit=5` });
  await call('ads_read', 'GET adimages', { path: `${AD_ACCOUNT}/adimages?limit=5` });
  await call('ads_read', 'GET customaudiences', { path: `${AD_ACCOUNT}/customaudiences?fields=id,name,subtype,approximate_count&limit=5` });

  // -----------------------------------------------------------------
  // BLOCO 2: ads_management — criar campanha PAUSED, adset, ad, depois deletar
  // -----------------------------------------------------------------
  console.log('\n--- ads_management ---');
  const ts = Date.now();
  const campRes = await call('ads_management', 'POST create campaign PAUSED', {
    path: `${AD_ACCOUNT}/campaigns`,
    method: 'POST',
    body: {
      name: `AppReview Test Campaign ${ts}`,
      objective: 'OUTCOME_TRAFFIC',
      status: 'PAUSED',
      special_ad_categories: JSON.stringify([]),
      buying_type: 'AUCTION',
    },
  });

  const campaignId = (campRes.body as any)?.id;
  if (campaignId) {
    console.log(`  -> campaign_id criada: ${campaignId}`);

    // atualizar campanha (PATCH via POST com mesmo path)
    await call('ads_management', 'POST update campaign name', {
      path: `${campaignId}`,
      method: 'POST',
      body: { name: `AppReview Test Campaign ${ts} (updated)` },
    });

    // criar adset (vai falhar provavelmente por falta de promoted_object/targeting completo, mas dispara a perm)
    const adsetRes = await call('ads_management', 'POST create adset', {
      path: `${AD_ACCOUNT}/adsets`,
      method: 'POST',
      body: {
        name: `AppReview Test Adset ${ts}`,
        campaign_id: campaignId,
        status: 'PAUSED',
        daily_budget: '500',
        billing_event: 'IMPRESSIONS',
        optimization_goal: 'LINK_CLICKS',
        bid_amount: '100',
        targeting: JSON.stringify({ geo_locations: { countries: ['BR'] }, age_min: 25, age_max: 55 }),
        start_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    });

    const adsetId = (adsetRes.body as any)?.id;
    if (adsetId) {
      console.log(`  -> adset_id criado: ${adsetId}`);

      // criar ad (vai falhar sem criativo, mas dispara)
      await call('ads_management', 'POST create ad (sem criativo, vai falhar mas dispara perm)', {
        path: `${AD_ACCOUNT}/ads`,
        method: 'POST',
        body: {
          name: `AppReview Test Ad ${ts}`,
          adset_id: adsetId,
          status: 'PAUSED',
        },
      });

      // deletar adset
      await call('ads_management', 'DELETE adset', { path: adsetId, method: 'DELETE' });
    }

    // deletar campanha
    await call('ads_management', 'DELETE campaign', { path: campaignId, method: 'DELETE' });
  }

  // -----------------------------------------------------------------
  // BLOCO 3: pages_manage_posts — precisa Page Access Token
  // -----------------------------------------------------------------
  console.log('\n--- pages_manage_posts ---');
  // Pega Page Access Token via /me/accounts
  const accountsRes = await call('pages_manage_posts', 'GET me/accounts (pegar Page Token)', { path: 'me/accounts?fields=id,name,access_token,tasks' });
  const pageEntry = (accountsRes.body as any)?.data?.find((p: any) => p.id === PAGE_ID);
  const pageToken = pageEntry?.access_token;

  if (!pageToken) {
    console.log('  AVISO: nao consegui pegar Page Access Token. Pages calls vao falhar.');
  } else {
    console.log(`  -> Page Access Token capturado (len ${pageToken.length})`);

    // criar unpublished post
    const postRes = await call('pages_manage_posts', 'POST page/feed unpublished', {
      path: `${PAGE_ID}/feed`,
      method: 'POST',
      body: {
        message: `App Review test post ${ts} — energia solar premium na Ecosunpower`,
        published: 'false',
      },
      token: pageToken,
    });

    const postId = (postRes.body as any)?.id;
    if (postId) {
      console.log(`  -> post_id criado: ${postId}`);

      // atualizar post
      await call('pages_manage_posts', 'POST update post (alterar mensagem)', {
        path: postId,
        method: 'POST',
        body: { message: `App Review test post ${ts} (updated)` },
        token: pageToken,
      });

      // deletar post
      await call('pages_manage_posts', 'DELETE post', { path: postId, method: 'DELETE', token: pageToken });
    }

    // segundo post pra reforcar
    const post2Res = await call('pages_manage_posts', 'POST 2 page/feed unpublished link', {
      path: `${PAGE_ID}/feed`,
      method: 'POST',
      body: {
        message: `App Review test 2 ${ts}`,
        link: 'https://ecosunpower.eng.br/',
        published: 'false',
      },
      token: pageToken,
    });

    const post2Id = (post2Res.body as any)?.id;
    if (post2Id) {
      await call('pages_manage_posts', 'DELETE post 2', { path: post2Id, method: 'DELETE', token: pageToken });
    }
  }

  // -----------------------------------------------------------------
  // SUMARIO
  // -----------------------------------------------------------------
  console.log('\n=== SUMARIO ===');
  const byGroup: Record<string, { ok: number; fail: number }> = {};
  for (const r of results) {
    byGroup[r.group] ??= { ok: 0, fail: 0 };
    if (r.ok) byGroup[r.group].ok++;
    else byGroup[r.group].fail++;
  }
  for (const [g, s] of Object.entries(byGroup)) {
    console.log(`  ${g}: ${s.ok} OK, ${s.fail} FAIL`);
  }
  console.log(`\nTotal chamadas: ${results.length}`);
  console.log('Aguarde 1-24h pra Meta detectar as chamadas e marcar checkboxes verdes no App Review.');
}

main().catch((e) => {
  console.error('FALHA:', e?.message ?? e);
  process.exit(1);
});
