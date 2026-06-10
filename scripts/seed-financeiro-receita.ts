// scripts/seed-financeiro-receita.ts
// Semeia financeiro_receita_mensal com o faturamento 2025 real (relação assinada).
// Rodar 1x: npx tsx scripts/seed-financeiro-receita.ts [--apply]
// Sem --apply: só mostra o que faria (dry-run) e confere o total.
import { createClient } from '@supabase/supabase-js';

// PREENCHER com os valores reais mês a mês (R$). Total esperado: 355091.99
const FATURAMENTO_2025: Record<string, number> = {
  '2025-01': 0, '2025-02': 0, '2025-03': 0, '2025-04': 0,
  '2025-05': 0, '2025-06': 0, '2025-07': 0, '2025-08': 0,
  '2025-09': 0, '2025-10': 0, '2025-11': 0, '2025-12': 0,
};

async function main() {
  const apply = process.argv.includes('--apply');
  const total = Object.values(FATURAMENTO_2025).reduce((a, b) => a + b, 0);
  console.log('Total semente:', total.toLocaleString('pt-BR'), '(esperado ~355.091,99)');
  if (Math.abs(total - 355091.99) > 1) {
    console.warn('⚠️ Total não bate com a relação assinada — confira os meses antes de aplicar.');
  }
  if (!apply) { console.log('Dry-run. Rode com --apply pra gravar.'); return; }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) { console.error('Env do Supabase faltando (SUPABASE_URL e SUPABASE_SERVICE_KEY).'); process.exit(1); }
  const client = createClient(url, key);
  for (const [competencia, receita] of Object.entries(FATURAMENTO_2025)) {
    if (receita <= 0) continue;
    const { error } = await client.from('financeiro_receita_mensal')
      .insert({ competencia, atividade_id: null, receita, origem: 'seed' });
    if (error) { console.error('ERRO', competencia, error.message); process.exit(1); }
    console.log('seed', competencia, receita);
  }
  console.log('✅ Semente aplicada.');
}
main().catch((e) => { console.error(e); process.exit(1); });
