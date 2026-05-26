/**
 * identify-meta-token.ts
 *
 * Le tokens orfaos do .env (linhas sem KEY=), chama GET /me/permissions
 * em cada um, mostra qual tem mais permissions e quais sao. Nao loga
 * o valor do token, so prefixo curto pra debug.
 */

import fs from 'fs';

const GRAPH = 'https://graph.facebook.com/v22.0';

interface PermissionRow {
  permission: string;
  status: 'granted' | 'declined' | 'expired';
}

async function checkToken(token: string, idx: number) {
  const prefix = token.slice(0, 10) + '...' + token.slice(-6);
  try {
    const r = await fetch(`${GRAPH}/me/permissions?access_token=${token}`);
    if (!r.ok) {
      const body = await r.text();
      console.log(`Token #${idx} (${prefix}): HTTP ${r.status}\n  body: ${body.slice(0, 200)}`);
      return null;
    }
    const data = (await r.json()) as { data: PermissionRow[] };
    const granted = data.data.filter((p) => p.status === 'granted').map((p) => p.permission);
    return { idx, prefix, granted, total: granted.length };
  } catch (e: any) {
    console.log(`Token #${idx} (${prefix}): erro de rede ${e?.message ?? e}`);
    return null;
  }
}

async function main() {
  const env = fs.readFileSync('.env', 'utf8');
  const tokens = env
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('EAA') && l.length > 100);

  if (tokens.length === 0) {
    console.error('Nenhum token EAA encontrado no .env');
    process.exit(1);
  }

  console.log(`Achei ${tokens.length} tokens orfaos. Testando cada um...\n`);

  const wanted = ['ads_management', 'ads_read', 'pages_manage_posts', 'business_management', 'instagram_basic', 'instagram_manage_messages', 'whatsapp_business_messaging', 'whatsapp_business_management'];

  const results = [];
  for (let i = 0; i < tokens.length; i++) {
    const res = await checkToken(tokens[i], i + 1);
    if (res) {
      const hasWanted = wanted.filter((p) => res.granted.includes(p));
      console.log(`Token #${res.idx} (${res.prefix}): ${res.total} perms granted`);
      console.log(`  Perms criticas: ${hasWanted.join(', ') || 'NENHUMA'}`);
      console.log(`  Todas: ${res.granted.join(', ')}\n`);
      results.push({ ...res, criticas: hasWanted });
    }
  }

  // identifica o vencedor
  results.sort((a, b) => b.criticas.length - a.criticas.length || b.total - a.total);
  if (results.length > 0) {
    const winner = results[0];
    console.log(`\n=== VENCEDOR ===`);
    console.log(`Token #${winner.idx} (${winner.prefix})`);
    console.log(`${winner.total} perms total, ${winner.criticas.length} criticas`);
    console.log(`Indice 0-based no array: ${winner.idx - 1}`);
  }
}

main().catch((e) => {
  console.error('FALHA:', e?.message ?? e);
  process.exit(1);
});
