// src/modules/dashboard/financeiro-queries.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { getBuckets, getParametros, competenciaAtual } from '../financeiro/repo.js';
import { calcularRBT12 } from '../financeiro/rbt12.js';
import { fatorR, proximoSalto, proLaboreMinimoParaAnexoIII, faixaPorRBT12 } from '../financeiro/imposto.js';
import { calcularKpisCaixa, type KpisCaixa } from './caixa-kpis.js';
import { getComprovanteUrls } from '../financeiro/comprovantes.js';

export interface LancamentoLista {
  id: string;
  tipo: 'despesa' | 'entrada';
  valor: number;
  data_evento: string;
  contraparte: string | null;
  categoriaNome: string | null;
  pf_pj: 'PF' | 'PJ' | null;
  comprovanteUrl: string | null;
}

export interface FiltrosLancamentos {
  competencia?: string;       // YYYY-MM
  categoria?: string;         // slug
  pfpj?: 'PF' | 'PJ';
  tipo?: 'despesa' | 'entrada';
}

export interface FinanceiroData {
  geradoEm: string;
  competencia: string;
  faturamentoMes: number;
  rbt12: number;
  faixa: number;
  impostoASeparar: number;
  aReceber: number;
  fatorR: { ratio: number; anexo: string; proLaboreMin: number };
  salto: { limite: number; distancia: number } | null;
  faturamentoMensal: Array<{ competencia: string; receita: number }>;
  contas: Array<{ descricao: string | null; valor: number; status: string; imposto: number | null }>;
  caixa: KpisCaixa;
  despesasMensal: Array<{ competencia: string; total: number }>;
  lancamentos: LancamentoLista[];
  filtros: FiltrosLancamentos;
}

export async function getFinanceiroData(client: SupabaseClient, filtros: FiltrosLancamentos = {}): Promise<FinanceiroData> {
  const comp = competenciaAtual();
  const [buckets, params] = await Promise.all([getBuckets(client), getParametros(client)]);
  const rbt12 = calcularRBT12(buckets, comp);
  const receita12 = rbt12; // mesma base

  const { data: contasRaw, error: contasErr } = await client
    .from('financeiro_contas_a_receber')
    .select('descricao, valor, status, imposto_confirmado, imposto_provisorio, competencia_recebimento, valor_recebido')
    .order('created_at', { ascending: false })
    .limit(50);
  if (contasErr) throw new Error(`getFinanceiroData: ${contasErr.message}`);
  const contas = (contasRaw ?? []) as Array<{
    descricao: string | null; valor: number; status: string;
    imposto_confirmado: number | null; imposto_provisorio: number | null;
    competencia_recebimento: string | null; valor_recebido: number;
  }>;

  // Recebido no mês = soma dos LANÇAMENTOS da competência (rastro por parcela).
  // Um recebimento 50/50 que atravessa meses grava 2 lançamentos em competências distintas,
  // garantindo que cada mês receba apenas o que de fato caiu nele.
  const { data: lancRaw, error: lancErr } = await client
    .from('financeiro_recebimentos')
    .select('valor, imposto')
    .eq('competencia', comp);
  if (lancErr) throw new Error(`getFinanceiroData: ${lancErr.message}`);
  const lanc = (lancRaw ?? []) as Array<{ valor: number; imposto: number }>;
  const faturamentoMes = lanc.reduce((s, l) => s + Number(l.valor), 0);
  const impostoASeparar = lanc.reduce((s, l) => s + Number(l.imposto), 0);
  // aReceber usa o SALDO — valor menos já recebido — pra conta parcial não inflar
  const aReceber = contas
    .filter((c) => c.status === 'pendente' || c.status === 'recebido_parcial')
    .reduce((s, c) => s + (Number(c.valor) - Number(c.valor_recebido)), 0);

  const folha12 = params.pro_labore_mensal * 12 + params.outras_folhas_mensal * 12;
  const fr = fatorR(folha12, receita12);

  // ---- Caixa de Entrada (Fatia 3) ----
  const { data: lancMesRaw, error: lancMesErr } = await client
    .from('financeiro_lancamentos')
    .select('tipo, valor, pf_pj, financeiro_categorias(nome, slug)')
    .eq('status', 'confirmado').eq('competencia', comp);
  if (lancMesErr) throw new Error(`getFinanceiroData lancamentos: ${lancMesErr.message}`);
  const lancMes = (lancMesRaw ?? []).map((l) => {
    const x = l as unknown as { tipo: 'despesa' | 'entrada'; valor: number; pf_pj: 'PF' | 'PJ' | null; financeiro_categorias: { nome: string; slug: string } | null };
    return { tipo: x.tipo, valor: Number(x.valor), pf_pj: x.pf_pj, categoriaNome: x.financeiro_categorias?.nome ?? null, categoriaSlug: x.financeiro_categorias?.slug ?? null };
  });
  const caixa = calcularKpisCaixa({ recebidoMesPj: faturamentoMes, impostoMes: impostoASeparar, lancamentosMes: lancMes });

  // série mensal de despesas PJ (gráfico entrou × saiu)
  // TODO: agregar no banco quando passar de ~1000 linhas (teto default do PostgREST)
  const { data: despSerieRaw, error: despSerieErr } = await client
    .from('financeiro_lancamentos')
    .select('competencia, valor')
    .eq('status', 'confirmado').eq('tipo', 'despesa').eq('pf_pj', 'PJ');
  if (despSerieErr) throw new Error(`getFinanceiroData despesas: ${despSerieErr.message}`);
  const porMesDesp = new Map<string, number>();
  for (const r of (despSerieRaw ?? []) as Array<{ competencia: string; valor: number }>) {
    porMesDesp.set(r.competencia, (porMesDesp.get(r.competencia) ?? 0) + Number(r.valor));
  }
  const despesasMensal = [...porMesDesp].map(([competencia, total]) => ({ competencia, total }))
    .sort((a, b) => a.competencia.localeCompare(b.competencia));

  // lista de lançamentos (últimos 50, com filtros via querystring)
  let q = client.from('financeiro_lancamentos')
    .select(filtros.categoria
      ? 'id, tipo, valor, data_evento, contraparte, pf_pj, storage_path, financeiro_categorias!inner(nome, slug)'
      : 'id, tipo, valor, data_evento, contraparte, pf_pj, storage_path, financeiro_categorias(nome, slug)')
    .eq('status', 'confirmado')
    .order('data_evento', { ascending: false }).limit(50);
  if (filtros.competencia) q = q.eq('competencia', filtros.competencia);
  if (filtros.pfpj) q = q.eq('pf_pj', filtros.pfpj);
  if (filtros.tipo) q = q.eq('tipo', filtros.tipo);
  if (filtros.categoria) q = q.eq('financeiro_categorias.slug', filtros.categoria);
  const { data: listaRaw, error: listaErr } = await q;
  if (listaErr) throw new Error(`getFinanceiroData lista: ${listaErr.message}`);
  const lista = (listaRaw ?? []).map((l) => {
    const x = l as unknown as { id: string; tipo: 'despesa' | 'entrada'; valor: number; data_evento: string; contraparte: string | null; pf_pj: 'PF' | 'PJ' | null; storage_path: string | null; financeiro_categorias: { nome: string; slug: string } | null };
    return { ...x, categoriaNome: x.financeiro_categorias?.nome ?? null, categoriaSlug: x.financeiro_categorias?.slug ?? null };
  });
  const urls = await getComprovanteUrls(client, lista.map((l) => l.storage_path).filter((p): p is string => Boolean(p)));
  const lancamentos: LancamentoLista[] = lista.map((l) => ({
    id: l.id, tipo: l.tipo, valor: Number(l.valor), data_evento: l.data_evento,
    contraparte: l.contraparte, categoriaNome: l.categoriaNome, pf_pj: l.pf_pj,
    comprovanteUrl: l.storage_path ? (urls[l.storage_path] ?? null) : null,
  }));

  return {
    geradoEm: new Date().toISOString(),
    competencia: comp,
    faturamentoMes,
    rbt12,
    faixa: faixaPorRBT12(rbt12),
    impostoASeparar,
    aReceber,
    fatorR: {
      ratio: fr.ratio,
      anexo: fr.anexo,
      proLaboreMin: proLaboreMinimoParaAnexoIII(receita12, params.outras_folhas_mensal * 12),
    },
    salto: proximoSalto(rbt12),
    faturamentoMensal: [...buckets].sort((a, b) => a.competencia.localeCompare(b.competencia)),
    contas: contas.map((c) => ({
      descricao: c.descricao, valor: Number(c.valor), status: c.status,
      imposto: c.imposto_confirmado ?? c.imposto_provisorio,
    })),
    caixa, despesasMensal, lancamentos, filtros,
  };
}
