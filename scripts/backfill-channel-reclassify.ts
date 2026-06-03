// scripts/backfill-channel-reclassify.ts
// Recomputa `channel` nos leads que têm algum sinal de origem
// (lead_source / origin / utm_source / utm_campaign não-null).
//
// Uso:
//   npx tsx scripts/backfill-channel-reclassify.ts          (dry-run — só imprime)
//   npx tsx scripts/backfill-channel-reclassify.ts --apply  (grava no banco)
import 'dotenv/config';
import { SupabaseService } from '../src/modules/supabase.js';
import { resolveChannel } from '../src/modules/dashboard/resolve-channel.js';
import { leadRowToChannelInput } from '../src/modules/dashboard/channel-mapper.js';

const apply = process.argv.includes('--apply');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;

if (!url || !key) {
  console.error('Faltam SUPABASE_URL / SUPABASE_SERVICE_KEY no .env');
  process.exit(1);
}

const supabase = new SupabaseService({ supabaseUrl: url, supabaseServiceKey: key });

async function main() {
  // Só leads que têm algum sinal de origem.
  // Os leads sem nenhum sinal (~168 'direto') ficam de fora — são classificação correta.
  const { data, error } = await supabase.getClient()
    .from('leads')
    .select('id, channel, ad_campaign_id, lead_source, origin, utm_source, utm_campaign')
    .or('lead_source.not.is.null,origin.not.is.null,utm_source.not.is.null,utm_campaign.not.is.null');

  if (error) {
    console.error('query falhou:', error.message);
    process.exit(1);
  }

  const rows = data ?? [];
  let changed = 0;
  const resumo: Record<string, number> = {};

  for (const row of rows) {
    const novo = resolveChannel(leadRowToChannelInput(row as Record<string, unknown>));
    if (novo !== row.channel) {
      changed++;
      const k = `${row.channel ?? 'null'} -> ${novo}`;
      resumo[k] = (resumo[k] ?? 0) + 1;
      if (apply) {
        const { error: upErr } = await supabase.getClient()
          .from('leads')
          .update({ channel: novo, updated_at: new Date().toISOString() })
          .eq('id', row.id);
        if (upErr) {
          console.error(`  [ERRO] lead ${row.id as string}: ${upErr.message}`);
        }
      }
    }
  }

  console.log(
    `${rows.length} leads com sinal | ${changed} reclassificados${apply ? ' (GRAVADO)' : ' (dry-run)'}`,
  );
  if (Object.keys(resumo).length > 0) {
    console.table(resumo);
  } else {
    console.log('Nenhuma reclassificação necessária.');
  }
}

main().then(() => process.exit(0)).catch((e: unknown) => {
  console.error('Falha fatal:', (e as Error).message ?? e);
  process.exit(1);
});
