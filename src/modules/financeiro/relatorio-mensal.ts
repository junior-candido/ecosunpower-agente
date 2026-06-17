// src/modules/financeiro/relatorio-mensal.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { getBuckets, getParametros } from './repo.js';
import { calcularRBT12 } from './rbt12.js';
import { fatorR, faixaPorRBT12 } from './imposto.js';
import { calcularKpisCaixa, type LancamentoKpi } from '../dashboard/caixa-kpis.js';

export interface RelatorioMensal {
  competencia: string;
  faturadoMesPj: number; entrouSemNotaPj: number; entrouMesPjCaixa: number;
  saiuMesPj: number; lucroMes: number; impostoMes: number;
  rbt12: number; faixa: number; anexoFatorR: 'III' | 'V' | string;
  aReceber: number; entrouMesPf: number; saiuMesPf: number;
  pizzaCategorias: Array<{ categoria: string; total: number }>;
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const MESES_EXT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

export function nomeMesAno(competencia: string): string {
  const [ano, mes] = competencia.split('-').map(Number);
  return `${MESES_EXT[mes - 1]}/${ano}`;
}

export function montarRelatorioMensal(d: RelatorioMensal): string {
  const linhas: string[] = [];
  linhas.push(`📊 *Relatório — ${nomeMesAno(d.competencia)}*`, '');
  linhas.push(`💰 *Entrou (caixa real): ${brl(d.entrouMesPjCaixa)}*`);
  linhas.push(`   🧾 Faturado (com nota): ${brl(d.faturadoMesPj)}`);
  if (d.entrouSemNotaPj > 0) linhas.push(`   📦 Por fora (sem nota): ${brl(d.entrouSemNotaPj)}`);
  linhas.push(`💸 *Saiu: ${brl(d.saiuMesPj)}*`);
  for (const c of d.pizzaCategorias.slice(0, 5)) linhas.push(`   • ${c.categoria}: ${brl(c.total)}`);
  linhas.push(`💰 *Lucro do mês: ${brl(d.lucroMes)}*`);
  linhas.push(`🧾 Imposto a separar (DAS): ${brl(d.impostoMes)} · faixa ${d.faixa} (Anexo ${d.anexoFatorR})`);
  linhas.push(`📥 A receber (em aberto agora): ${brl(d.aReceber)}`);
  linhas.push('', `👤 *Mundo PF (pessoal)*: entrou ${brl(d.entrouMesPf)} · saiu ${brl(d.saiuMesPf)}`);
  linhas.push('', `🔗 Detalhe: dashboard.ecosunpower.eng.br/dashboard/financeiro`);
  return linhas.join('\n');
}

export async function getRelatorioMensal(client: SupabaseClient, competencia: string): Promise<RelatorioMensal> {
  const [buckets, params] = await Promise.all([getBuckets(client), getParametros(client)]);
  const rbt12 = calcularRBT12(buckets, competencia);
  const receita12 = rbt12;
  const folha12 = params.pro_labore_mensal * 12 + params.outras_folhas_mensal * 12;
  const fr = fatorR(folha12, receita12);

  const { data: recRaw } = await client.from('financeiro_recebimentos')
    .select('valor, imposto').eq('competencia', competencia);
  const rec = (recRaw ?? []) as Array<{ valor: number; imposto: number }>;
  const faturadoMesPj = rec.reduce((s, l) => s + Number(l.valor), 0);
  const impostoMes = rec.reduce((s, l) => s + Number(l.imposto), 0);

  const { data: lancRaw } = await client.from('financeiro_lancamentos')
    .select('tipo, valor, pf_pj, tem_nota, financeiro_categorias(nome, slug)')
    .eq('status', 'confirmado').eq('competencia', competencia);
  const lancamentosMes: LancamentoKpi[] = (lancRaw ?? []).map((l) => {
    const x = l as unknown as { tipo: 'despesa' | 'entrada'; valor: number; pf_pj: 'PF' | 'PJ' | null; tem_nota: boolean; financeiro_categorias: { nome: string; slug: string } | null };
    return { tipo: x.tipo, valor: Number(x.valor), pf_pj: x.pf_pj, tem_nota: Boolean(x.tem_nota), categoriaNome: x.financeiro_categorias?.nome ?? null, categoriaSlug: x.financeiro_categorias?.slug ?? null };
  });
  const caixa = calcularKpisCaixa({ recebidoMesPj: faturadoMesPj, impostoMes, lancamentosMes });

  const { data: contasRaw } = await client.from('financeiro_contas_a_receber')
    .select('valor, valor_recebido, status');
  const contas = (contasRaw ?? []) as Array<{ valor: number; valor_recebido: number; status: string }>;
  const aReceber = contas.filter((c) => c.status === 'pendente' || c.status === 'recebido_parcial')
    .reduce((s, c) => s + (Number(c.valor) - Number(c.valor_recebido)), 0);

  return {
    competencia,
    faturadoMesPj: caixa.faturadoMesPj, entrouSemNotaPj: caixa.entrouSemNotaPj, entrouMesPjCaixa: caixa.entrouMesPjCaixa,
    saiuMesPj: caixa.saiuMesPj, lucroMes: caixa.lucroMes, impostoMes,
    rbt12, faixa: faixaPorRBT12(rbt12), anexoFatorR: fr.anexo,
    aReceber: Math.round(aReceber * 100) / 100, entrouMesPf: caixa.entrouMesPf, saiuMesPf: caixa.saiuMesPf,
    pizzaCategorias: caixa.pizzaCategorias,
  };
}
