/**
 * backfill-channel.ts — Backfill idempotente do canal de cada lead (resolveChannel).
 *
 * Lê todos os leads sem `channel` (ou com flag --all para recomputa tudo),
 * aplica resolveChannel(leadRowToChannelInput(row)), e atualiza o banco.
 *
 * Idempotente: rodar 2x = mesmo resultado (skip leads que já têm channel).
 * Log: quantidade processada + breakdown por canal.
 *
 * Uso:
 *   npx tsx scripts/backfill-channel.ts         # processa só leads sem channel
 *   npx tsx scripts/backfill-channel.ts --all   # recomputa todos
 */

import 'dotenv/config';
import { SupabaseService } from '../src/modules/supabase.js';
import { resolveChannel } from '../src/modules/dashboard/resolve-channel.js';
import { leadRowToChannelInput } from '../src/modules/dashboard/channel-mapper.js';
import type { Channel } from '../src/modules/dashboard/resolve-channel.js';

async function main() {
  const shouldRecomputeAll = process.argv.includes('--all');

  const supabase = new SupabaseService({
    supabaseUrl: process.env.SUPABASE_URL!,
    supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY!,
  });

  // 1) Fetch leads (sem channel, ou todos se --all)
  let query = supabase.getClient().from('leads').select('*');
  if (!shouldRecomputeAll) {
    query = query.is('channel', null);
  }

  const { data: leads, error } = await query;
  if (error) {
    console.error('[backfill-channel] Erro ao buscar leads:', error.message);
    process.exit(1);
  }

  const leadList = (leads ?? []) as Record<string, unknown>[];
  if (leadList.length === 0) {
    console.log('[backfill-channel] Nenhum lead para processar.');
    process.exit(0);
  }

  console.log(`[backfill-channel] Processando ${leadList.length} leads...`);

  // 2) Calcular channel para cada lead
  const updates: Array<{ id: string; channel: Channel }> = [];
  const breakdown: Record<Channel, number> = {
    meta: 0,
    google: 0,
    blog: 0,
    direto: 0,
    indicacao: 0,
    outro: 0,
  };

  for (const row of leadList) {
    const channelInput = leadRowToChannelInput(row);
    const channel = resolveChannel(channelInput);
    updates.push({
      id: row.id as string,
      channel,
    });
    breakdown[channel]++;
  }

  // 3) Batch updates (upsert seria ideal, mas simples UPDATE com ID é seguro)
  const batchSize = 100;
  let updated = 0;

  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    const ids = batch.map((u) => u.id);

    // Para cada channel, filtrar batch e fazer update
    const byChannel = new Map<Channel, string[]>();
    for (const { id, channel } of batch) {
      if (!byChannel.has(channel)) {
        byChannel.set(channel, []);
      }
      byChannel.get(channel)!.push(id);
    }

    for (const [channel, leadIds] of byChannel) {
      const { error: upErr } = await supabase
        .getClient()
        .from('leads')
        .update({ channel })
        .in('id', leadIds);

      if (upErr) {
        console.error(
          `[backfill-channel] Erro ao atualizar batch de ${channel}:`,
          upErr.message
        );
        process.exit(1);
      }

      updated += leadIds.length;
    }
  }

  // 4) Log final
  console.log(`[backfill-channel] Processados ${updated} leads. Breakdown:`);
  const totalByChannel = Object.entries(breakdown)
    .map(([chan, count]) => `${chan}: ${count}`)
    .join(', ');
  console.log(`  ${totalByChannel}, total: ${updated}`);
  console.log('[backfill-channel] Sucesso!');
}

main().catch((e) => {
  console.error('[backfill-channel] Falha:', e?.message ?? e);
  process.exit(1);
});
