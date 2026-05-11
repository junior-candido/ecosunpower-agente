/**
 * schedule-reengagement-terceirizada.ts
 *
 * Pra cada lead com acquisition_source='terceirizada_recovered' que ainda
 * NAO tem touches pendentes, agenda os 5 toques da cadencia de reengajamento.
 * Cron processDueTouches (roda a cada 2h em index.ts) vai disparar conforme
 * agendado.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { ReengagementCadence } from '../src/modules/reengagement-cadence.js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
const cadence = new ReengagementCadence(
  supabase,
  new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! }),
  async () => {}, // sendText nao eh usado aqui (so agenda, nao envia)
  () => '',       // knowledge base vazia (so agenda)
);

async function main() {
  console.log('=== Agendando cadencia pros leads terceirizada ===\n');
  const { data: leads, error } = await supabase
    .from('leads')
    .select('id, phone, name')
    .eq('acquisition_source', 'terceirizada_recovered');

  if (error) { console.error('erro list:', error.message); process.exit(1); }
  if (!leads || leads.length === 0) { console.log('nenhum lead encontrado'); return; }

  console.log(`Total leads terceirizada_recovered: ${leads.length}\n`);

  let scheduled = 0;
  let already = 0;
  for (const lead of leads) {
    const has = await cadence.hasPendingTouches(lead.id);
    if (has) {
      already++;
      continue;
    }
    await cadence.scheduleAllTouches(lead.id);
    scheduled++;
  }

  console.log(`\n=== Resultado ===`);
  console.log(`  ${scheduled} cadencias novas agendadas`);
  console.log(`  ${already} ja tinham touches pendentes`);
  console.log(`\nCron processDueTouches (a cada 2h) vai disparar os toques.`);
}

main().catch((e) => { console.error('FALHA:', e); process.exit(1); });
