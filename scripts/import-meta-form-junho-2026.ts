/**
 * import-meta-form-junho-2026.ts
 *
 * Importa os leads da campanha de FORMULÁRIO Meta "META_Leads_Solar_DF-Entorno_2026-06"
 * pra tabela `leads`. A lógica e os dados vivem em src/modules/leads-import-meta-junho.ts
 * (MESMO código usado pelo botão do dashboard /dashboard/import-leads-junho).
 *
 * Uso:
 *   npx tsx scripts/import-meta-form-junho-2026.ts            (DRY-RUN: só mostra)
 *   npx tsx scripts/import-meta-form-junho-2026.ts --apply    (grava)
 */

import 'dotenv/config';
import { SupabaseService } from '../src/modules/supabase.js';
import { importarLeadsMetaJunho, CAMPANHA } from '../src/modules/leads-import-meta-junho.js';

const APPLY = process.argv.includes('--apply');

async function main() {
  console.log(`\n=== Import Meta Form — ${CAMPANHA} ===`);
  console.log(APPLY ? '⚠️  MODO APPLY — vai ESCREVER no banco\n' : '🔍 DRY-RUN — só mostra (use --apply pra escrever)\n');

  let supabase: SupabaseService | null = null;
  if (APPLY) {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_KEY — rode onde tem as credenciais de produção (ou use o botão em /dashboard/import-leads-junho).');
    supabase = new SupabaseService({ supabaseUrl: url, supabaseServiceKey: key });
  }

  const r = await importarLeadsMetaJunho(supabase, APPLY);

  for (const l of r.linhas) {
    const icone = l.status === 'ok' ? '  ' : l.status === 'pulado' ? '⏭️ ' : '❌';
    console.log(`${icone} ${l.nome.padEnd(32)} ${l.phone.padEnd(14)} ${l.faixa.padEnd(18)} → ${l.destino}${l.erro ? ` (${l.erro})` : ''}`);
  }

  console.log(`\n=== Resultado ===`);
  console.log(`${APPLY ? 'Gravados' : 'Prontos (dry-run)'}: ${r.gravados} · Pulados: ${r.pulados} · Erros: ${r.erros}`);
  if (!APPLY) console.log('Rode de novo com --apply pra gravar (ou use o botão no /dashboard/import-leads-junho).');
}

main().catch((e) => { console.error('FALHA:', e); process.exit(1); });
