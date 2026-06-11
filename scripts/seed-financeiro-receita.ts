// scripts/seed-financeiro-receita.ts
// Semeia financeiro_receita_mensal com o faturamento 2025 real (relação assinada).
// Rodar 1x: npx tsx scripts/seed-financeiro-receita.ts [--apply]
// Sem --apply: só mostra o que faria (dry-run) e confere o total.
import { createClient } from '@supabase/supabase-js';

// Valores reais da Relação de Faturamento assinada (contador, 14/01/2026).
// Fonte: Documents/EcoSunPower/Financeiro/Faturamento-Declarado/Faturamento-2025-relacao-12-meses-assinado.pdf
const FATURAMENTO_2025: Record<string, number> = {
  '2025-01': 26885.06, '2025-02': 1536.00, '2025-03': 23885.06, '2025-04': 68134.03,
  '2025-05': 32549.74, '2025-06': 11566.84, '2025-07': 63000.00, '2025-08': 34000.00,
  '2025-09': 59350.00, '2025-10': 4706.21, '2025-11': 11800.00, '2025-12': 17679.05,
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
