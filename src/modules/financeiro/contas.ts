// src/modules/financeiro/contas.ts
import { impostoDaVenda, resolverAnexo, fatorR } from './imposto.js';
import type { Anexo } from './anexos.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  competenciaAtual, getBuckets, getParametros, getAtividade,
  criarContaReceber, getContaReceber, somarReceitaNoMes, atualizarContaRecebida,
} from './repo.js';
import { calcularRBT12 } from './rbt12.js';

export interface EntradaCalculoConta {
  valor: number;
  rbt12: number;
  receita12: number;
  atividade: { anexo_padrao: Anexo; sujeito_fator_r: boolean };
  proLabore12: number;
  outrasFolhas12: number;
}

export interface ResultadoCalculoConta {
  anexo: Anexo;
  imposto: number;
  efetiva: number;
  faixa: number;
  fatorR: number;
}

export function calcularImpostoDaConta(e: EntradaCalculoConta): ResultadoCalculoConta {
  const folha12 = e.proLabore12 + e.outrasFolhas12;
  const fr = fatorR(folha12, e.receita12);
  const anexo = resolverAnexo(e.atividade.anexo_padrao, e.atividade.sujeito_fator_r, folha12, e.receita12);
  const imp = impostoDaVenda(e.valor, e.rbt12, anexo);
  return { anexo, imposto: imp.imposto, efetiva: imp.efetiva, faixa: imp.faixa, fatorR: fr.ratio };
}

// ---------------------------------------------------------------------------
// Regra pura de acumulação de recebimento (testável sem banco).
// Modela o fluxo PIX 50/50: 1ª parcela → recebido_parcial; 2ª → recebido.
// ---------------------------------------------------------------------------
export interface EstadoConta { valor: number; valorRecebido: number; impostoConfirmado: number; status: string }

export function calcularParcelaRecebimento(conta: EstadoConta, valorParcela?: number): {
  parcela: number; acumulado: number; total: boolean;
} {
  if (conta.status !== 'pendente' && conta.status !== 'recebido_parcial') {
    throw new Error(`conta já está ${conta.status}`);
  }
  const saldo = conta.valor - conta.valorRecebido;
  const parcela = valorParcela ?? saldo; // "recebido total" = saldo restante
  if (!(parcela > 0)) throw new Error('valor recebido deve ser maior que zero');
  if (parcela > saldo + 0.01) throw new Error(`parcela (${parcela}) maior que o saldo restante (${saldo})`);
  const acumulado = conta.valorRecebido + parcela;
  return { parcela, acumulado, total: acumulado >= conta.valor - 0.01 };
}

// ---------------------------------------------------------------------------
// Orquestração com banco (sem teste unitário — camada I/O)
// ---------------------------------------------------------------------------

// Cria a conta a receber a partir de uma venda fechada (imposto PROVISÓRIO).
export async function criarContaDeFechamento(client: SupabaseClient, args: {
  fechamentoId: string | null;
  leadId: string | null;
  atividadeId: string;
  descricao: string;
  valor: number;
  createdBy: string;
}): Promise<{ contaId: string; calc: ResultadoCalculoConta }> {
  const comp = competenciaAtual();
  const [buckets, params, atividade] = await Promise.all([
    getBuckets(client), getParametros(client), getAtividade(client, args.atividadeId),
  ]);
  if (!atividade) throw new Error('atividade não encontrada');
  const rbt12 = calcularRBT12(buckets, comp);
  const receita12 = rbt12; // mesma base (evita baixar a tabela 2x)
  const calc = calcularImpostoDaConta({
    valor: args.valor, rbt12, receita12,
    atividade: { anexo_padrao: atividade.anexo_padrao, sujeito_fator_r: atividade.sujeito_fator_r },
    proLabore12: params.pro_labore_mensal * 12, outrasFolhas12: params.outras_folhas_mensal * 12,
  });
  const contaId = await criarContaReceber(client, {
    fechamentoId: args.fechamentoId, leadId: args.leadId, atividadeId: args.atividadeId,
    descricao: args.descricao, valor: args.valor, impostoProvisorio: calc.imposto,
    anexoAplicado: calc.anexo, aliquotaEfetiva: calc.efetiva, faixa: calc.faixa,
    rbt12, fatorR: calc.fatorR, createdBy: args.createdBy,
  });
  return { contaId, calc };
}

// Marca recebido (total ou parcial); recalcula imposto CONFIRMADO e soma no bucket.
// Ordem: 1º marca a conta (guard otimista barra re-clique); 2º soma no bucket.
// Crash entre os dois deixa receita FALTANDO (detectável), nunca duplicada.
export async function registrarRecebimento(client: SupabaseClient, contaId: string, valorRecebido?: number)
: Promise<{ calc: ResultadoCalculoConta; total: boolean; parcela: number; acumulado: number; saldoRestante: number }> {
  const conta = await getContaReceber(client, contaId);
  const { parcela, acumulado, total } = calcularParcelaRecebimento({
    valor: Number(conta.valor), valorRecebido: Number(conta.valor_recebido),
    impostoConfirmado: Number(conta.imposto_confirmado ?? 0), status: conta.status,
  }, valorRecebido);
  const comp = competenciaAtual();
  const buckets = await getBuckets(client);
  const rbt12 = calcularRBT12(buckets, comp);
  const receita12 = rbt12; // mesma base (evita baixar a tabela 2x)
  const [params, atividade] = await Promise.all([getParametros(client), getAtividade(client, conta.atividade_id)]);
  if (!atividade) throw new Error('atividade não encontrada');
  const calc = calcularImpostoDaConta({
    valor: parcela, rbt12, receita12,
    atividade: { anexo_padrao: atividade.anexo_padrao, sujeito_fator_r: atividade.sujeito_fator_r },
    proLabore12: params.pro_labore_mensal * 12, outrasFolhas12: params.outras_folhas_mensal * 12,
  });
  // 1º marca a conta (guard otimista barra re-clique); só então soma no bucket
  await atualizarContaRecebida(client, contaId, {
    status: total ? 'recebido' : 'recebido_parcial', valorRecebido: acumulado, competencia: comp,
    impostoConfirmado: Number(conta.imposto_confirmado ?? 0) + calc.imposto,
    anexoAplicado: calc.anexo, aliquotaEfetiva: calc.efetiva,
    faixa: calc.faixa, rbt12, fatorR: calc.fatorR,
  });
  await somarReceitaNoMes(client, comp, conta.atividade_id, parcela);
  const saldoRestante = Math.round((Number(conta.valor) - acumulado) * 100) / 100;
  return { calc, total, parcela, acumulado, saldoRestante };
}
