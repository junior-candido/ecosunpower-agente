// src/modules/financeiro/repo.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { calcularRBT12, type BucketReceita } from './rbt12.js';
import type { Anexo } from './anexos.js';

export interface Atividade {
  id: string;
  nome: string;
  cnae: string | null;
  anexo_padrao: Anexo;
  sujeito_fator_r: boolean;
}

export interface ParametrosFinanceiro {
  pro_labore_mensal: number;
  outras_folhas_mensal: number;
  dia_alerta_das: number;
  dia_vencimento_das: number;
  margem_alerta_faixa: number;
  fator_r_alerta: number;
}

// competência 'YYYY-MM' do mês atual em BRT (UTC-3).
export function competenciaAtual(now: Date = new Date()): string {
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return `${brt.getUTCFullYear()}-${String(brt.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function getBuckets(client: SupabaseClient): Promise<BucketReceita[]> {
  const { data, error } = await client
    .from('financeiro_receita_mensal')
    .select('competencia, receita');
  if (error) throw new Error(`getBuckets: ${error.message}`);
  // Soma por competência (pode haver várias atividades no mesmo mês).
  const porMes = new Map<string, number>();
  for (const r of (data ?? []) as Array<{ competencia: string; receita: number }>) {
    porMes.set(r.competencia, (porMes.get(r.competencia) ?? 0) + Number(r.receita));
  }
  return [...porMes].map(([competencia, receita]) => ({ competencia, receita }));
}

export async function getRBT12(client: SupabaseClient, competenciaRef: string): Promise<number> {
  const buckets = await getBuckets(client);
  return calcularRBT12(buckets, competenciaRef);
}

export async function getReceita12(client: SupabaseClient, competenciaRef: string): Promise<number> {
  // mesma base do RBT12 (receita bruta dos últimos 12 meses)
  return getRBT12(client, competenciaRef);
}

export async function getParametros(client: SupabaseClient): Promise<ParametrosFinanceiro> {
  const { data, error } = await client
    .from('financeiro_parametros')
    .select('pro_labore_mensal, outras_folhas_mensal, dia_alerta_das, dia_vencimento_das, margem_alerta_faixa, fator_r_alerta')
    .eq('id', 1)
    .single();
  if (error) throw new Error(`getParametros: ${error.message}`);
  return data as ParametrosFinanceiro;
}

export async function getAtividades(client: SupabaseClient): Promise<Atividade[]> {
  const { data, error } = await client
    .from('financeiro_atividades')
    .select('id, nome, cnae, anexo_padrao, sujeito_fator_r')
    .eq('ativo', true)
    .order('nome');
  if (error) throw new Error(`getAtividades: ${error.message}`);
  return (data ?? []) as Atividade[];
}

export async function getAtividade(client: SupabaseClient, id: string): Promise<Atividade | null> {
  const { data, error } = await client
    .from('financeiro_atividades')
    .select('id, nome, cnae, anexo_padrao, sujeito_fator_r')
    .eq('id', id)
    .single();
  if (error && error.code !== 'PGRST116') throw new Error(`getAtividade: ${error.message}`);
  return (data as Atividade) ?? null;
}

export interface NovaContaReceber {
  fechamentoId: string | null;
  leadId: string | null;
  atividadeId: string;
  descricao: string;
  valor: number;
  impostoProvisorio: number;
  anexoAplicado: Anexo;
  aliquotaEfetiva: number;
  faixa: number;
  rbt12: number;
  fatorR: number;
  createdBy: string;
}

export async function criarContaReceber(client: SupabaseClient, c: NovaContaReceber): Promise<string> {
  const { data, error } = await client
    .from('financeiro_contas_a_receber')
    .insert({
      fechamento_id: c.fechamentoId,
      lead_id: c.leadId,
      atividade_id: c.atividadeId,
      descricao: c.descricao,
      valor: c.valor,
      status: 'pendente',
      imposto_provisorio: c.impostoProvisorio,
      anexo_aplicado: c.anexoAplicado,
      aliquota_efetiva: c.aliquotaEfetiva,
      faixa: c.faixa,
      rbt12_no_calculo: c.rbt12,
      fator_r_no_calculo: c.fatorR,
      created_by: c.createdBy,
    })
    .select('id')
    .single();
  if (error) throw new Error(`criarContaReceber: ${error.message}`);
  return (data as { id: string }).id;
}

export interface ContaReceber {
  id: string;
  fechamento_id: string | null;
  lead_id: string | null;
  atividade_id: string;
  descricao: string | null;
  valor: number;
  status: 'pendente' | 'recebido_parcial' | 'recebido' | 'cancelado';
  valor_recebido: number;
  imposto_provisorio: number | null;
  imposto_confirmado: number | null;
}

export async function getContaReceber(client: SupabaseClient, id: string): Promise<ContaReceber> {
  const { data, error } = await client
    .from('financeiro_contas_a_receber')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw new Error(`getContaReceber: ${error.message}`);
  return data as ContaReceber;
}

// soma receita no bucket do mês — atômica via função SQL (corrida e erro silencioso eliminados)
export async function somarReceitaNoMes(
  client: SupabaseClient,
  competencia: string,
  atividadeId: string | null,
  valor: number,
): Promise<void> {
  const { error } = await client.rpc('fin_somar_receita_mes', {
    p_competencia: competencia,
    p_atividade_id: atividadeId,
    p_valor: valor,
  });
  if (error) throw new Error(`somarReceitaNoMes: ${error.message}`);
}

export async function criarLancamentoRecebimento(client: SupabaseClient, l: {
  contaId: string; valor: number; imposto: number;
  anexoAplicado: Anexo; aliquotaEfetiva: number; competencia: string;
}): Promise<void> {
  const { error } = await client.from('financeiro_recebimentos').insert({
    conta_id: l.contaId, valor: l.valor, imposto: l.imposto,
    anexo_aplicado: l.anexoAplicado, aliquota_efetiva: l.aliquotaEfetiva, competencia: l.competencia,
  });
  if (error) throw new Error(`criarLancamentoRecebimento: ${error.message}`);
}

export async function atualizarContaRecebida(
  client: SupabaseClient,
  id: string,
  patch: {
    status: 'recebido' | 'recebido_parcial';
    valorRecebido: number;
    valorRecebidoAnterior: number;
    competencia: string;
    impostoConfirmado: number;
    anexoAplicado: Anexo;
    aliquotaEfetiva: number;
    faixa: number;
    rbt12: number;
    fatorR: number;
  },
): Promise<void> {
  const { data: updated, error } = await client
    .from('financeiro_contas_a_receber')
    .update({
      status: patch.status,
      valor_recebido: patch.valorRecebido,
      data_recebimento: new Date().toISOString().slice(0, 10),
      competencia_recebimento: patch.competencia,
      imposto_confirmado: patch.impostoConfirmado,
      anexo_aplicado: patch.anexoAplicado,
      aliquota_efetiva: patch.aliquotaEfetiva,
      faixa: patch.faixa,
      rbt12_no_calculo: patch.rbt12,
      fator_r_no_calculo: patch.fatorR,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .in('status', ['pendente', 'recebido_parcial'])
    .eq('valor_recebido', patch.valorRecebidoAnterior)
    .select('id');
  if (error) throw new Error(`atualizarContaRecebida: ${error.message}`);
  if (!updated || updated.length === 0) throw new Error('conta já processada (recebida ou cancelada)');
}

export async function cancelarConta(client: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await client
    .from('financeiro_contas_a_receber')
    .update({ status: 'cancelado', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pendente')
    .select('id');
  if (error) throw new Error(`cancelarConta: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error('conta já tem recebimento lançado — estorno é manual por enquanto');
  }
}

// Recebimentos de uma conta (pro estorno saber o que reverter).
export async function getRecebimentosDaConta(
  client: SupabaseClient, contaId: string,
): Promise<Array<{ id: string; valor: number; imposto: number; competencia: string }>> {
  const { data, error } = await client.from('financeiro_recebimentos')
    .select('id, valor, imposto, competencia').eq('conta_id', contaId);
  if (error) throw new Error(`getRecebimentosDaConta: ${error.message}`);
  return (data ?? []) as Array<{ id: string; valor: number; imposto: number; competencia: string }>;
}

export async function apagarRecebimento(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from('financeiro_recebimentos').delete().eq('id', id);
  if (error) throw new Error(`apagarRecebimento: ${error.message}`);
}

// Reverte a conta no estorno: avulsa → 'cancelado'; venda real → 'pendente'
// (volta a "a receber"). Zera recebido + imposto + datas do recebimento.
export async function reverterConta(
  client: SupabaseClient, id: string, opts: { avulsa: boolean },
): Promise<void> {
  const { error } = await client.from('financeiro_contas_a_receber')
    .update({
      status: opts.avulsa ? 'cancelado' : 'pendente',
      valor_recebido: 0,
      imposto_confirmado: 0,
      data_recebimento: null,
      competencia_recebimento: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(`reverterConta: ${error.message}`);
}
