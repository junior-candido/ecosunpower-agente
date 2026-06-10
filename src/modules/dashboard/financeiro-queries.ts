// src/modules/dashboard/financeiro-queries.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { getBuckets, getParametros, competenciaAtual } from '../financeiro/repo.js';
import { calcularRBT12 } from '../financeiro/rbt12.js';
import { fatorR, proximoSalto, proLaboreMinimoParaAnexoIII, faixaPorRBT12 } from '../financeiro/imposto.js';

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
}

export async function getFinanceiroData(client: SupabaseClient): Promise<FinanceiroData> {
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
  };
}
