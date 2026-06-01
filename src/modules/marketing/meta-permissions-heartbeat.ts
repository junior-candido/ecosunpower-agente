// meta-permissions-heartbeat.ts
// Exercita permissions Meta que tem poucas chamadas pra destravar checks
// do App Review. Cada funcao aqui invoca um endpoint Graph API que
// CONSUME a permission alvo. Meta conta no painel "Analisar > Teste".
//
// Roda no startup do app + a cada cron de insights (30min) pra garantir
// que o contador sobe naturalmente sem inflar custo.

const GRAPH = 'https://graph.facebook.com/v22.0';

/**
 * GET /me?fields=id,name — exercita permission `public_profile`.
 * Endpoint mais barato + sempre funciona com qualquer token.
 */
export async function exercisePublicProfile(accessToken: string): Promise<void> {
  try {
    const url = `${GRAPH}/me?fields=id,name&access_token=${accessToken}`;
    const r = await fetch(url);
    if (!r.ok) {
      const body = await r.text();
      console.warn(`[meta-heartbeat] public_profile falhou HTTP ${r.status}: ${body.slice(0, 200)}`);
      return;
    }
    const data = await r.json() as { id?: string; name?: string };
    console.log(`[meta-heartbeat] public_profile ok (me=${data.id ?? '?'})`);
  } catch (err) {
    console.warn(`[meta-heartbeat] public_profile excecao:`, (err as Error).message);
  }
}

/**
 * GET /me/accounts com fan_count/followers_count — exercita pages_show_list
 * + pages_read_engagement (campos cadastrais de leitura/engagement).
 * Util pra manter heartbeat geral E destravar a permission pages_read_engagement.
 */
export async function exercisePagesList(accessToken: string): Promise<void> {
  try {
    // fan_count e followers_count consomem pages_read_engagement.
    const url = `${GRAPH}/me/accounts?fields=id,name,fan_count,followers_count,access_token&access_token=${accessToken}`;
    const r = await fetch(url);
    if (!r.ok) {
      const body = await r.text();
      console.warn(`[meta-heartbeat] pages_list falhou HTTP ${r.status}: ${body.slice(0, 200)}`);
      return;
    }
    const data = await r.json() as { data?: Array<{ id: string; name: string; fan_count?: number }> };
    const pages = data.data ?? [];
    console.log(`[meta-heartbeat] pages_list ok (${pages.length} pages, fan_count=${pages[0]?.fan_count ?? '-'})`);
  } catch (err) {
    console.warn(`[meta-heartbeat] pages_list excecao:`, (err as Error).message);
  }
}

/**
 * GET /{page-id}/insights — exercita pages_read_engagement explicitamente
 * com endpoint dedicado. Mais robusto que so o fan_count, porque
 * /insights eh endpoint que Meta marca claramente como uso da permission.
 */
export async function exercisePageInsights(accessToken: string): Promise<void> {
  try {
    // 1) Pega primeira page do user
    const pagesUrl = `${GRAPH}/me/accounts?fields=id,access_token&limit=1&access_token=${accessToken}`;
    const r1 = await fetch(pagesUrl);
    if (!r1.ok) {
      console.warn(`[meta-heartbeat] page_insights: falha ao listar pages HTTP ${r1.status}`);
      return;
    }
    const d1 = await r1.json() as { data?: Array<{ id: string; access_token?: string }> };
    const page = d1.data?.[0];
    if (!page?.id) {
      console.warn('[meta-heartbeat] page_insights: nenhuma page disponivel');
      return;
    }
    // 2) Usa page_access_token se disponivel; senao user token (algumas perms
    //    so funcionam com page_access_token, mas pra heartbeat tudo serve)
    const pageToken = page.access_token ?? accessToken;
    // 3) Chama /insights com metric basica
    const insUrl = `${GRAPH}/${page.id}/insights?metric=page_impressions&period=day&access_token=${pageToken}`;
    const r2 = await fetch(insUrl);
    if (!r2.ok) {
      const body = await r2.text();
      console.warn(`[meta-heartbeat] page_insights HTTP ${r2.status}: ${body.slice(0, 200)}`);
      return;
    }
    console.log(`[meta-heartbeat] pages_read_engagement ok (page=${page.id})`);
  } catch (err) {
    console.warn(`[meta-heartbeat] page_insights excecao:`, (err as Error).message);
  }
}

/**
 * Roda todos heartbeats em paralelo. Chamado no startup + cron de insights.
 * Failsafe: se uma falhar, as outras continuam.
 */
export async function runMetaPermissionsHeartbeat(accessToken: string): Promise<void> {
  // NOTA: exercisePageInsights foi REMOVIDA daqui — usava a métrica `page_impressions`,
  // deprecada na Graph API v22 (gerava "page_insights HTTP 400" repetido no log). Era
  // redundante: exercisePagesList (fan_count/followers_count) já consome
  // pages_read_engagement, e o App Review já está aprovado. Sem perda de função.
  await Promise.allSettled([
    exercisePublicProfile(accessToken),
    exercisePagesList(accessToken),
  ]);
}
