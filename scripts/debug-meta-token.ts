/**
 * debug-meta-token.ts
 *
 * Mostra app_id, expires_at, scopes do token atual.
 * Crucial pra saber se o token pertence ao app sob review (ecosunpower-marketing).
 */

import 'dotenv/config';

const GRAPH = 'https://graph.facebook.com/v22.0';
const TOKEN = process.env.META_MARKETING_TOKEN!;

if (!TOKEN) {
  console.error('META_MARKETING_TOKEN faltando');
  process.exit(1);
}

async function main() {
  // 1. debug_token (usa o proprio token como app token de validacao)
  const url = `${GRAPH}/debug_token?input_token=${TOKEN}&access_token=${TOKEN}`;
  const r = await fetch(url);
  const data = await r.json();
  console.log('--- debug_token ---');
  console.log(JSON.stringify(data, null, 2));

  // 2. /me — identidade do dono do token
  const r2 = await fetch(`${GRAPH}/me?fields=id,name&access_token=${TOKEN}`);
  console.log('\n--- /me ---');
  console.log(JSON.stringify(await r2.json(), null, 2));

  // 3. /me/applications — Business Apps que o System User pode acessar
  const r3 = await fetch(`${GRAPH}/me?fields=id,name,accounts.limit(2){id,name},business_users&access_token=${TOKEN}`);
  console.log('\n--- /me com business_users ---');
  console.log(JSON.stringify(await r3.json(), null, 2));
}

main().catch((e) => {
  console.error('FALHA:', e?.message ?? e);
  process.exit(1);
});
