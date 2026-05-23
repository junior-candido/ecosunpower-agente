/**
 * backfill-channel-runner.ts — lógica compartilhada de backfill de leads.channel.
 *
 * Usado por:
 * - `scripts/backfill-channel.ts` (CLI via `npx tsx`)
 * - `POST /dashboard/admin/backfill-channels` (botão no dashboard)
 *
 * Idempotente: rodar 2x sem `--all` = no-op (filtra channel IS NULL).
 */

import type { SupabaseService } from '../supabase.js';
import { resolveChannel, type Channel } from './resolve-channel.js';
import { leadRowToChannelInput } from './channel-mapper.js';

export interface BackfillResult {
  processados: number;
  breakdown: Record<Channel, number>;
}

export async function runBackfillChannels(
  supabase: SupabaseService,
  opts: { recomputaTodos?: boolean } = {},
): Promise<BackfillResult> {
  const recomputaTodos = opts.recomputaTodos === true;

  let query = supabase.getClient().from('leads').select('*');
  if (!recomputaTodos) {
    query = query.is('channel', null);
  }

  const { data, error } = await query;
  if (error) throw new Error(`fetch leads: ${error.message}`);

  const leadList = (data ?? []) as Record<string, unknown>[];
  const breakdown: Record<Channel, number> = {
    meta: 0, google: 0, blog: 0, direto: 0, indicacao: 0, base_propria: 0, outro: 0,
  };

  if (leadList.length === 0) {
    return { processados: 0, breakdown };
  }

  const updates: Array<{ id: string; channel: Channel }> = [];
  for (const row of leadList) {
    const channel = resolveChannel(leadRowToChannelInput(row));
    updates.push({ id: row.id as string, channel });
    breakdown[channel]++;
  }

  const batchSize = 100;
  let processados = 0;

  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    const byChannel = new Map<Channel, string[]>();
    for (const { id, channel } of batch) {
      if (!byChannel.has(channel)) byChannel.set(channel, []);
      byChannel.get(channel)!.push(id);
    }

    for (const [channel, leadIds] of byChannel) {
      const { error: upErr } = await supabase
        .getClient()
        .from('leads')
        .update({ channel })
        .in('id', leadIds);
      if (upErr) throw new Error(`update ${channel}: ${upErr.message}`);
      processados += leadIds.length;
    }
  }

  return { processados, breakdown };
}
