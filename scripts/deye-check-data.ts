import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

async function main() {
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
  const { data: sis } = await sb
    .from('sistemas_clientes')
    .select('id,apelido')
    .eq('marca_inversor', 'deye')
    .eq('ativo', true);
  const ids = (sis ?? []).map((s: any) => s.id);
  const { data: g } = await sb
    .from('geracao_diaria')
    .select('sistema_id,data,geracao_kwh')
    .in('sistema_id', ids);

  const porSis = new Map<string, { n: number; kwh: number; ult: string }>();
  for (const r of (g ?? []) as any[]) {
    const a = porSis.get(r.sistema_id) ?? { n: 0, kwh: 0, ult: '' };
    a.n++; a.kwh += Number(r.geracao_kwh); if (r.data > a.ult) a.ult = r.data;
    porSis.set(r.sistema_id, a);
  }
  let tot = 0;
  for (const v of porSis.values()) tot += v.kwh;
  console.log(`Sistemas deye ativos: ${ids.length}`);
  console.log(`Com geração no banco: ${porSis.size}`);
  console.log(`Linhas geracao_diaria (deye): ${(g ?? []).length} | soma: ${tot.toFixed(1)} kWh`);
  for (const s of (sis ?? []).slice(0, 6) as any[]) {
    const a = porSis.get(s.id);
    console.log(`  ${s.apelido}: ${a ? `${a.n}d, ${a.kwh.toFixed(0)} kWh, último ${a.ult}` : 'SEM DADO'}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
