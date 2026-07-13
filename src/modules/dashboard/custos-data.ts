// src/modules/dashboard/custos-data.ts
// MOTOR que soma os custos do mês corrente pro Cofre de Custos do Elo.
// 4 fontes: Meta Ads (spend), Google Ads (spend), IA/Claude (custo) e custos
// fixos mensais. Best-effort TOTAL: cada soma roda isolada num try/catch —
// se uma fonte cai (tabela fora do ar, getClient explodindo, coluna sumindo),
// aquele campo vira 0 e as outras somas + a rota continuam de pé.
import type { SupabaseService } from '../supabase.js';

export type CustosMes = {
  metaCents: number;
  googleCents: number;
  iaCents: number;
  fixosCents: number;
  totalCents: number;
  // Receita e resultado do mês — o outro lado da conta (só o CEO vê, no cofre).
  faturamentoCents: number; // soma dos valores das vendas fechadas no mês
  vendasMes: number; // quantas vendas fecharam no mês (pela data de fechamento)
  lucroCents: number; // faturamento - custos (pode ser negativo)
  custoPorVendaCents: number; // custos do mês / nº de vendas do mês
};

// 1º dia do mês corrente em UTC, no formato YYYY-MM-DD — serve tanto pra colunas
// `date` (channel_daily_metrics), `date_start` (meta_ads_insights) quanto pra
// `created_at` timestamptz (custos_ia_uso): o Postgres compara o texto no `>=`.
function primeiroDiaDoMesUTC(): string {
  const agora = new Date();
  const ano = agora.getUTCFullYear();
  const mes = String(agora.getUTCMonth() + 1).padStart(2, '0');
  return `${ano}-${mes}-01`;
}

// Soma uma coluna numérica (em centavos) das linhas retornadas por uma query.
// Best-effort: qualquer falha (getClient, query, dados torto) vira 0 — nunca
// propaga, uma fonte fora do ar não pode derrubar o Cofre inteiro.
async function somar(
  supabase: SupabaseService,
  tabela: string,
  coluna: string,
  aplicarFiltros?: (q: any) => any,
): Promise<number> {
  try {
    const client = supabase.getClient();
    let q = client.from(tabela).select(coluna);
    if (aplicarFiltros) q = aplicarFiltros(q);
    const { data, error } = await q;
    if (error || !data) return 0;
    return (data as any[]).reduce((soma, linha) => soma + (Number(linha?.[coluna]) || 0), 0);
  } catch {
    return 0;
  }
}

/**
 * Soma os custos do mês corrente das 4 fontes do Cofre de Custos do Elo.
 * Cada soma é independente e best-effort (falhar → 0). Colunas/tabelas
 * confirmadas no código existente (não inventadas):
 * - meta_ads_insights.spend_cents / .date_start (src/modules/marketing/insights-collector.ts ~211).
 * - channel_daily_metrics.spend_cents / .date / .channel='google' (google-ads/sync.ts ~171).
 * - custos_ia_uso.custo_cents / .created_at (migration 071).
 * - custos_fixos.valor_cents / .ativo (migration 071 — mensal, sem filtro de data).
 */
export async function montarCustosMes(supabase: SupabaseService): Promise<CustosMes> {
  const inicioMes = primeiroDiaDoMesUTC();

  const [metaCents, googleCents, iaCents, fixosCents, faturamentoCents, vendasMes] = await Promise.all([
    somar(supabase, 'meta_ads_insights', 'spend_cents', (q) => q.gte('date_start', inicioMes)),
    somar(supabase, 'channel_daily_metrics', 'spend_cents', (q) =>
      q.eq('channel', 'google').gte('date', inicioMes),
    ),
    somar(supabase, 'custos_ia_uso', 'custo_cents', (q) => q.gte('created_at', inicioMes)),
    somar(supabase, 'custos_fixos', 'valor_cents', (q) => q.eq('ativo', true)),
    // Faturamento do mês: soma dos valores das vendas fechadas (Coração da Venda
    // grava venda_valor_cents; a data é contract_signed_at). Vendas sem valor
    // preenchido somam 0 — não distorcem.
    somar(supabase, 'leads', 'venda_valor_cents', (q) => q.gte('contract_signed_at', inicioMes)),
    contarVendasMes(supabase, inicioMes),
  ]);

  const totalCents = metaCents + googleCents + iaCents + fixosCents;
  const lucroCents = faturamentoCents - totalCents;
  const custoPorVendaCents = vendasMes > 0 ? Math.round(totalCents / vendasMes) : 0;

  return {
    metaCents,
    googleCents,
    iaCents,
    fixosCents,
    totalCents,
    faturamentoCents,
    vendasMes,
    lucroCents,
    custoPorVendaCents,
  };
}

// Conta quantas vendas fecharam no mês (pela data real do fechamento). Best-effort.
async function contarVendasMes(supabase: SupabaseService, inicioMes: string): Promise<number> {
  try {
    const client = supabase.getClient();
    const { count, error } = await client
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .gte('contract_signed_at', inicioMes);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}
