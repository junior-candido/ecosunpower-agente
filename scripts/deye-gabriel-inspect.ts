import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

async function main() {
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
  const { data } = await sb
    .from('sistemas_clientes')
    .select('id,apelido,marca_inversor,ativo,ultimo_erro,ultima_sincronizacao,api_credentials,cidade')
    .eq('marca_inversor', 'deye')
    .order('apelido', { ascending: true });

  const rows = (data ?? []) as any[];
  console.log(`Total sistemas deye: ${rows.length}`);
  // Procura "Gabriel" no apelido OU site_id/stationId 11206
  const gabriel = rows.filter((r) => {
    const ap = String(r.apelido ?? '').toLowerCase();
    const sid = String(r.api_credentials?.site_id ?? r.api_credentials?.stationId ?? '');
    return ap.includes('gabriel') || sid === '11206';
  });
  console.log(`\nCandidatos "Gabriel"/11206: ${gabriel.length}`);
  for (const r of gabriel) {
    console.log(JSON.stringify({
      id: r.id,
      apelido: r.apelido,
      ativo: r.ativo,
      site_id: r.api_credentials?.site_id ?? r.api_credentials?.stationId,
      cidade: r.cidade,
      ultima_sync: r.ultima_sincronizacao,
      ultimo_erro: r.ultimo_erro ? String(r.ultimo_erro).slice(0, 120) : null,
    }, null, 2));
  }
  // Confere se há OUTRA planta com nome Gabriel que NÃO seja 11206 (a "lá de cima")
  console.log('\nTodas as ativas (apelido | site_id | erro?):');
  for (const r of rows.filter((x) => x.ativo)) {
    const sid = String(r.api_credentials?.site_id ?? r.api_credentials?.stationId ?? '?');
    const err = r.ultimo_erro ? ' ⚠️' : '';
    if (String(r.apelido ?? '').toLowerCase().includes('gabriel') || sid === '11206') {
      console.log(`  >>> ${r.apelido} | ${sid}${err}`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
