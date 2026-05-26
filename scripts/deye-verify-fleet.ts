/**
 * deye-verify-fleet.ts — VERIFICAÇÃO READ-ONLY (não escreve nada)
 *
 * Usa o adapter JÁ CORRIGIDO (fluxo Business Member) contra a conta real.
 * Prova que o fix destrava a FROTA inteira (não só a 1 planta do diagnóstico):
 *   - listSites() -> quantas plantas a conta enxerga agora
 *   - fetchGeneration() numa planta empresarial -> lê histórico (antes 403)
 *
 * Rodar: cd Documents/ecosunpower-agente && npx tsx scripts/deye-verify-fleet.ts
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { deyeAdapter } from '../src/modules/monitoring/adapters/deye.js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function main() {
  const { data, error } = await supabase
    .from('sistemas_clientes')
    .select('api_credentials')
    .eq('marca_inversor', 'deye')
    .limit(1)
    .single();
  if (error || !data?.api_credentials) {
    console.error('Sem credenciais deye no banco:', error?.message);
    process.exit(1);
  }
  const creds = data.api_credentials as Record<string, unknown>;

  console.log('=== listSites (conta inteira) ===');
  const list = await deyeAdapter.listSites!(creds);
  if (!list.ok) {
    console.error('listSites FALHOU:', list.reason);
    process.exit(1);
  }
  console.log(`Plantas visíveis: ${list.sites.length}`);
  for (const s of list.sites.slice(0, 30)) {
    console.log(`  - ${s.externalId.padEnd(8)} ${s.apelido} | ${s.potencia_kwp ?? '?'} kWp | ${s.cidade ?? '?'}`);
  }

  // Pega uma planta empresarial (a 166879 era 403 garantido) pra ler histórico.
  const alvo = list.sites.find((s) => s.externalId === '166879') ?? list.sites[0];
  if (alvo) {
    console.log(`\n=== fetchGeneration station ${alvo.externalId} (${alvo.apelido}) ===`);
    const g = await deyeAdapter.fetchGeneration(alvo.credenciais, '2026-05-05', '2026-05-13');
    if (g.ok) {
      const total = g.geracoes.reduce((a, x) => a + x.geracao_kwh, 0);
      console.log(`OK: ${g.geracoes.length} dias, total ${total.toFixed(1)} kWh`);
      console.log('Amostra:', JSON.stringify(g.geracoes.slice(0, 3)));
    } else {
      console.log('FALHOU:', g.reason);
    }
  }
}
main().catch((e) => { console.error('Falha:', e); process.exit(1); });
