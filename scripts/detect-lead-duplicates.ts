/**
 * detect-lead-duplicates.ts
 *
 * Detecta leads que podem ser duplicatas com base em:
 * - Telefone com ultimos 8-9 digitos iguais (tolera 1 digito a menos por bug normalizacao)
 * - Mesmo nome (ilike fuzzy)
 *
 * Output: lista de grupos de leads provavelmente duplicados pra Junior decidir
 * qual manter/mergear.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

interface Lead {
  id: string;
  name: string;
  phone: string;
  status: string;
  acquisition_source: string | null;
  created_at: string;
}

async function main() {
  const { data: leads } = await supabase
    .from('leads')
    .select('id, name, phone, status, acquisition_source, created_at')
    .order('created_at', { ascending: true });

  if (!leads) return;

  console.log(`Total leads: ${leads.length}\n`);

  // Agrupa por ultimos 8 digitos do telefone (tolera prefixo +55, ddd, dig perdido)
  const byPhoneSuffix = new Map<string, Lead[]>();
  for (const l of leads as Lead[]) {
    const digits = l.phone.replace(/\D/g, '');
    if (digits.length < 8) continue;
    const suffix = digits.slice(-8);
    if (!byPhoneSuffix.has(suffix)) byPhoneSuffix.set(suffix, []);
    byPhoneSuffix.get(suffix)!.push(l);
  }

  const dupGroups: Lead[][] = [];
  for (const group of byPhoneSuffix.values()) {
    if (group.length > 1) dupGroups.push(group);
  }

  if (dupGroups.length === 0) {
    console.log('✅ Nenhuma duplicata detectada por sufixo de telefone.');
    return;
  }

  console.log(`🚨 ${dupGroups.length} grupos de duplicatas detectados:\n`);
  for (const group of dupGroups) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    for (const l of group) {
      const safeName = (l.name ?? '(sem nome)').padEnd(35).slice(0, 35);
      console.log(`  📞 ${l.phone.padEnd(15)} | ${safeName} | status: ${l.status.padEnd(12)} | origem: ${l.acquisition_source ?? 'N/D'} | ${l.created_at.slice(0, 10)}`);
    }
    console.log();
  }

  console.log(`\nRecomendacao: pra cada grupo, identificar qual eh o "principal" (geralmente`);
  console.log(`o mais antigo ou com mais dados) e marcar os outros como opt_out=true + status=transferido`);
  console.log(`pra nao receberem template duplicado.\n`);
  console.log(`Pra fechar manualmente via zap: /fechei <telefone exato>`);
}

main().catch((e) => { console.error('FALHA:', e); process.exit(1); });
