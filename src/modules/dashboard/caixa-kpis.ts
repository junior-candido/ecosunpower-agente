// src/modules/dashboard/caixa-kpis.ts
// Agregação PURA dos KPIs da Caixa de Entrada (entrou × saiu × lucro).
// IMPORTANTE: o "entrou PJ" oficial vem de financeiro_recebimentos (motor da
// Fatia 2) — entrada avulsa PJ confirmada já virou recebimento lá, então os
// lançamentos tipo 'entrada' PJ NÃO somam de novo aqui (senão dobraria).

export interface LancamentoKpi {
  tipo: 'despesa' | 'entrada';
  valor: number;
  pf_pj: 'PF' | 'PJ' | null;
  categoriaNome: string | null;
  categoriaSlug: string | null;
}

export interface KpisCaixa {
  saiuMesPj: number;
  lucroMes: number;
  entrouMesPf: number;
  saiuMesPf: number;
  pizzaCategorias: Array<{ categoria: string; total: number }>;
}

export function calcularKpisCaixa(args: {
  recebidoMesPj: number;
  impostoMes: number;
  lancamentosMes: LancamentoKpi[];
}): KpisCaixa {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const despesasPj = args.lancamentosMes.filter((l) => l.tipo === 'despesa' && l.pf_pj === 'PJ');
  const saiuMesPj = r2(despesasPj.reduce((s, l) => s + Number(l.valor), 0));
  // DAS pago entra no "saiu" exibido, mas NÃO desconta de novo no lucro — o imposto do mês já está na fórmula (senão contaria 2×).
  const saiuParaLucro = r2(despesasPj.filter((l) => l.categoriaSlug !== 'imposto_das')
    .reduce((s, l) => s + Number(l.valor), 0));
  const entrouMesPf = r2(args.lancamentosMes.filter((l) => l.tipo === 'entrada' && l.pf_pj === 'PF')
    .reduce((s, l) => s + Number(l.valor), 0));
  const saiuMesPf = r2(args.lancamentosMes.filter((l) => l.tipo === 'despesa' && l.pf_pj === 'PF')
    .reduce((s, l) => s + Number(l.valor), 0));

  const porCategoria = new Map<string, number>();
  for (const l of despesasPj) {
    const nome = l.categoriaNome ?? 'Outros';
    porCategoria.set(nome, (porCategoria.get(nome) ?? 0) + Number(l.valor));
  }
  const pizzaCategorias = [...porCategoria]
    .map(([categoria, total]) => ({ categoria, total: r2(total) }))
    .sort((a, b) => b.total - a.total);

  return {
    saiuMesPj,
    lucroMes: r2(args.recebidoMesPj - saiuParaLucro - args.impostoMes),
    entrouMesPf, saiuMesPf, pizzaCategorias,
  };
}
