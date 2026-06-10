// src/modules/financeiro/contas.ts
import { impostoDaVenda, resolverAnexo, fatorR } from './imposto.js';
import type { Anexo } from './anexos.js';

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
// Orquestração com banco (sem teste unitário — camada I/O)
// ---------------------------------------------------------------------------
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  competenciaAtual, getRBT12, getReceita12, getParametros, getAtividade,
  criarContaReceber, getContaReceber, somarReceitaNoMes, atualizarContaRecebida,
} from './repo.js';

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
  const [rbt12, receita12, params, atividade] = await Promise.all([
    getRBT12(client, comp), getReceita12(client, comp), getParametros(client), getAtividade(client, args.atividadeId),
  ]);
  if (!atividade) throw new Error('atividade não encontrada');
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
export async function registrarRecebimento(client: SupabaseClient, contaId: string, valorRecebido?: number)
: Promise<{ calc: ResultadoCalculoConta; total: boolean }> {
  const conta = await getContaReceber(client, contaId) as {
    valor: number; atividade_id: string; lead_id: string | null;
  };
  const valor = valorRecebido ?? Number(conta.valor);
  const comp = competenciaAtual();
  const [rbt12, receita12, params, atividade] = await Promise.all([
    getRBT12(client, comp), getReceita12(client, comp), getParametros(client), getAtividade(client, conta.atividade_id),
  ]);
  if (!atividade) throw new Error('atividade não encontrada');
  const calc = calcularImpostoDaConta({
    valor, rbt12, receita12,
    atividade: { anexo_padrao: atividade.anexo_padrao, sujeito_fator_r: atividade.sujeito_fator_r },
    proLabore12: params.pro_labore_mensal * 12, outrasFolhas12: params.outras_folhas_mensal * 12,
  });
  const total = valor >= Number(conta.valor);
  await somarReceitaNoMes(client, comp, conta.atividade_id, valor);
  await atualizarContaRecebida(client, contaId, {
    status: total ? 'recebido' : 'recebido_parcial', valorRecebido: valor, competencia: comp,
    impostoConfirmado: calc.imposto, anexoAplicado: calc.anexo, aliquotaEfetiva: calc.efetiva,
    faixa: calc.faixa, rbt12, fatorR: calc.fatorR,
  });
  return { calc, total };
}
