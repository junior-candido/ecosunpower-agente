// One-time script to fetch Meta Page ID + Instagram Business Account ID
// Run: set env vars then `node scripts/get-meta-ids.mjs`
// Requires: META_ACCESS_TOKEN

const TOKEN = process.env.META_ACCESS_TOKEN;
if (!TOKEN) {
  console.error('Defina META_ACCESS_TOKEN no .env antes de rodar.');
  process.exit(1);
}

const API = 'https://graph.facebook.com/v21.0';

async function main() {
  // 1) List Pages this token can access
  const pagesRes = await fetch(`${API}/me/accounts?access_token=${TOKEN}`);
  const pagesData = await pagesRes.json();
  if (pagesData.error) {
    console.error('Erro ao buscar paginas:', pagesData.error);
    process.exit(1);
  }

  if (!pagesData.data?.length) {
    console.log('Nenhuma pagina encontrada. Confirme que o usuario do sistema tem acesso a pagina.');
    return;
  }

  console.log('\n================================================================');
  console.log('  META IDs PARA O AGENTE DE MARKETING');
  console.log('================================================================\n');

  for (const page of pagesData.data) {
    console.log(`Pagina: ${page.name}`);
    console.log(`  META_FACEBOOK_PAGE_ID = ${page.id}`);

    // 2) For each page, fetch linked Instagram Business Account
    const igRes = await fetch(`${API}/${page.id}?fields=instagram_business_account{id,username}&access_token=${TOKEN}`);
    const igData = await igRes.json();
    if (igData.instagram_business_account) {
      console.log(`  Instagram: @${igData.instagram_business_account.username}`);
      console.log(`  META_INSTAGRAM_BUSINESS_ID = ${igData.instagram_business_account.id}`);
    } else {
      console.log(`  (Sem Instagram Business vinculado a esta pagina)`);
    }
    console.log('');
  }

  console.log('================================================================\n');
  console.log('Copie os IDs acima e adicione no Easypanel quando formos subir o agente.');
}

main().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
