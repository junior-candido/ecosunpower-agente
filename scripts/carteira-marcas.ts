import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

async function main() {
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
  const { data } = await sb
    .from('sistemas_clientes')
    .select('marca_inversor,ativo,ultimo_erro,api_credentials');
  const rows = (data ?? []) as any[];

  const porMarca = new Map<string, { total: number; ativos: number; comErro: number; comCred: number }>();
  for (const r of rows) {
    const m = String(r.marca_inversor ?? '?');
    const a = porMarca.get(m) ?? { total: 0, ativos: 0, comErro: 0, comCred: 0 };
    a.total++;
    if (r.ativo) a.ativos++;
    if (r.ultimo_erro) a.comErro++;
    const c = r.api_credentials ?? {};
    if (Object.keys(c).length > 0) a.comCred++;
    porMarca.set(m, a);
  }
  console.log(`Total sistemas cadastrados: ${rows.length}\n`);
  console.log('marca       | total | ativos | c/erro | c/credencial');
  console.log('------------|-------|--------|--------|-------------');
  for (const [m, v] of [...porMarca.entries()].sort((a, b) => b[1].total - a[1].total)) {
    console.log(
      `${m.padEnd(11)} | ${String(v.total).padStart(5)} | ${String(v.ativos).padStart(6)} | ${String(v.comErro).padStart(6)} | ${String(v.comCred).padStart(11)}`,
    );
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
