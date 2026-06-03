// scripts/diag-nep.ts
// DIAGNÓSTICO (só-leitura) do fetch de geração NEP.
// Mostra, por planta NEP: se o fetchGeneration deu erro, e se deu certo,
// quantos dias de geração vieram e o total 7d. Não grava nada.
//
// Uso (local com .env de prod, ou no console do Easypanel):
//   npx tsx scripts/diag-nep.ts
import 'dotenv/config';
import { SupabaseService } from '../src/modules/supabase.js';
import { nepAdapter } from '../src/modules/monitoring/adapters/nep.js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
if (!url || !key) {
  console.error('Faltam SUPABASE_URL / SUPABASE_SERVICE_KEY no ambiente (.env).');
  process.exit(1);
}
const sb = new SupabaseService({ supabaseUrl: url, supabaseServiceKey: key });

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const { data, error } = await sb.getClient()
    .from('sistemas_clientes')
    .select('id, apelido, marca_inversor, ativo, ultimo_erro, ultima_sincronizacao, api_credentials')
    .eq('marca_inversor', 'nep')
    .limit(5);
  if (error) {
    console.error('query falhou:', error.message);
    process.exit(1);
  }
  const sistemas = data ?? [];
  const dataFim = isoDate(new Date());
  const dataInicio = isoDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  console.log(`NEP: ${sistemas.length} plantas (amostra) | janela ${dataInicio} ~ ${dataFim}\n`);

  for (const s of sistemas as any[]) {
    console.log(`=== ${s.apelido} ===`);
    console.log(`  ativo=${s.ativo} | ultimo_erro=${s.ultimo_erro ?? 'null'} | ultima_sync=${s.ultima_sincronizacao ?? 'nunca'}`);
    const creds = (s.api_credentials ?? {}) as Record<string, unknown>;
    console.log(`  creds: keys=[${Object.keys(creds).join(',')}] sid=${(creds as any).sid ?? 'AUSENTE'} jwt=${creds.jwt ? 'presente' : 'AUSENTE'}`);
    try {
      const r: any = await nepAdapter.fetchGeneration(creds, dataInicio, dataFim);
      if (!r.ok) {
        console.log(`  >> fetchGeneration ERRO: ${r.reason} (invalidCredentials=${r.invalidCredentials ?? false})`);
      } else {
        const ger: Array<{ data: string; geracao_kwh: number }> = r.geracoes ?? [];
        const total = ger.reduce((a, g) => a + (g.geracao_kwh ?? 0), 0);
        console.log(`  >> OK: ${ger.length} dias | total 7d = ${total.toFixed(1)} kWh | statusInversor=${r.statusInversor ?? 'n/a'}`);
        console.log(`     últimos: ${ger.slice(-4).map((g) => `${g.data}=${g.geracao_kwh}`).join('  ') || '(vazio)'}`);
      }
    } catch (e) {
      console.log(`  >> EXCEÇÃO: ${(e as Error).message}`);
    }
    console.log('');
  }
}

main().then(() => process.exit(0)).catch((e: unknown) => {
  console.error('Falha fatal:', (e as Error).message ?? e);
  process.exit(1);
});
