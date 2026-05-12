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
 * GET /me/accounts — exercita `pages_show_list` (ja esta OK no review)
 * MAS o /accounts retorna pages que o user gerencia, o que dispara
 * tambem leitura cadastral. Util pra manter heartbeat geral.
 */
export async function exercisePagesList(accessToken: string): Promise<void> {
  try {
    const url = `${GRAPH}/me/accounts?fields=id,name,access_token&access_token=${accessToken}`;
    const r = await fetch(url);
    if (!r.ok) {
      const body = await r.text();
      console.warn(`[meta-heartbeat] pages_list falhou HTTP ${r.status}: ${body.slice(0, 200)}`);
      return;
    }
    const data = await r.json() as { data?: Array<{ id: string; name: string }> };
    console.log(`[meta-heartbeat] pages_list ok (${data.data?.length ?? 0} pages)`);
  } catch (err) {
    console.warn(`[meta-heartbeat] pages_list excecao:`, (err as Error).message);
  }
}

/**
 * Roda todos heartbeats em paralelo. Chamado no startup + cron de insights.
 * Failsafe: se uma falhar, as outras continuam.
 */
export async function runMetaPermissionsHeartbeat(accessToken: string): Promise<void> {
  await Promise.allSettled([
    exercisePublicProfile(accessToken),
    exercisePagesList(accessToken),
  ]);
}
