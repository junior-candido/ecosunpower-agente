/**
 * backfill-channel.ts — CLI wrapper do backfill-channel-runner.
 *
 * Uso:
 *   npx tsx scripts/backfill-channel.ts         # processa só leads sem channel
 *   npx tsx scripts/backfill-channel.ts --all   # recomputa todos
 *
 * (Alternativa via dashboard: POST /dashboard/admin/backfill-channels)
 */

import 'dotenv/config';
import { SupabaseService } from '../src/modules/supabase.js';
import { runBackfillChannels } from '../src/modules/dashboard/backfill-channel-runner.js';

async function main() {
  const recomputaTodos = process.argv.includes('--all');

  const supabase = new SupabaseService({
    supabaseUrl: process.env.SUPABASE_URL!,
    supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY!,
  });

  console.log(`[backfill-channel] ${recomputaTodos ? 'recomputando todos' : 'apenas leads sem channel'}...`);
  const { processados, breakdown } = await runBackfillChannels(supabase, { recomputaTodos });

  const breakdownStr = Object.entries(breakdown).map(([c, n]) => `${c}: ${n}`).join(', ');
  console.log(`[backfill-channel] Processados ${processados}. Breakdown: ${breakdownStr}`);
}

main().catch((e) => {
  console.error('[backfill-channel] Falha:', e?.message ?? e);
  process.exit(1);
});
