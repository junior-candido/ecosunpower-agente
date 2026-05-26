/**
 * deye-seed-prod.ts — SEED PROD (idempotente). Junior pediu "sync agora".
 *
 * Mesmo code-path do botão de import em massa do dashboard, via CLI:
 *   1. importarSitesEmMassa('deye') -> cria/atualiza as 22 plantas
 *   2. syncOne em cada uma -> 30 dias de geração (acende o dashboard HOJE)
 *
 * UPSERT idempotente (onConflict sistema_id,data) — rodar 2x não duplica.
 * Histórico completo de cada planta = botão "Carregar histórico" no dashboard
 * (ou cron pós-Implantar). Aqui só os 30d pra ter dado imediato.
 *
 * Rodar: cd Documents/ecosunpower-agente && npx tsx scripts/deye-seed-prod.ts
 */
import 'dotenv/config';
import { SupabaseService } from '../src/modules/supabase.js';
import { MonitoringService } from '../src/modules/monitoring/service.js';
import type { SistemaCliente } from '../src/modules/monitoring/types.js';

async function main() {
  const supabase = new SupabaseService({
    supabaseUrl: process.env.SUPABASE_URL!,
    supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY!,
  });
  const mon = new MonitoringService(supabase);

  // Credenciais da conta (qualquer row deye serve — a CONTA é a mesma)
  const { data: row, error } = await supabase.getClient()
    .from('sistemas_clientes')
    .select('api_credentials')
    .eq('marca_inversor', 'deye')
    .limit(1)
    .single();
  if (error || !row?.api_credentials) {
    console.error('Sem credenciais deye no banco:', error?.message);
    process.exit(1);
  }

  console.log('=== 1. Import em massa (cria/atualiza as plantas) ===');
  const imp = await mon.importarSitesEmMassa('deye', row.api_credentials as Record<string, unknown>);
  if (!imp.ok) {
    console.error('Import FALHOU:', imp.reason);
    process.exit(1);
  }
  console.log(`Total ${imp.total} | novos ${imp.novos} | atualizados ${imp.atualizados}`);

  console.log('\n=== 2. Sync 30d em cada planta deye ativa ===');
  const { data: sistemas } = await supabase.getClient()
    .from('sistemas_clientes')
    .select('*')
    .eq('marca_inversor', 'deye')
    .eq('ativo', true);
  const lista = (sistemas ?? []) as SistemaCliente[];

  let ok = 0, fail = 0;
  for (const s of lista) {
    const r = await mon.syncOne(s.id);
    if (r.ok) { ok++; console.log(`  ✓ ${s.apelido}`); }
    else { fail++; console.log(`  ✗ ${s.apelido}: ${r.reason}`); }
  }
  console.log(`\nResultado: ${ok} OK, ${fail} falha(s) de ${lista.length} plantas deye.`);
}
main().catch((e) => { console.error('Falha:', e); process.exit(1); });
