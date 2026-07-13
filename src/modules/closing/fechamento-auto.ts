// src/modules/closing/fechamento-auto.ts
//
// Gerador CONFIÁVEL de contrato + procuração. Ao contrário do /fechar
// conversacional (que trava coletando dado por IA), aqui é determinístico:
// pega o que já existe (proposta + cadastro do cliente via buildInitialData),
// PREENCHE os buracos com espaços em branco, e SEMPRE devolve dados válidos
// pra renderizar. Nunca falha por falta de dado — o que faltar vira uma linha
// pra preencher à mão no PDF, e a lista `faltando` avisa o Junior.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DadosFechamento, PessoaFisica, Endereco, UF } from './types.js';
import { fetchByLeadId, buildInitialData } from './closing-data-fetcher.js';

const BRANCO = '_______________________';

function completarEndereco(e?: Partial<Endereco>): Endereco {
  return {
    rua: e?.rua || BRANCO,
    numero: e?.numero || '____',
    complemento: e?.complemento,
    bairro: e?.bairro || BRANCO,
    cidade: e?.cidade || BRANCO,
    uf: (e?.uf as UF) || 'DF',
    cep: e?.cep || '_______-___',
  };
}

function completarPessoa(x?: Partial<PessoaFisica>): PessoaFisica {
  return {
    tipo: 'PF',
    nome: x?.nome || BRANCO,
    cpf: x?.cpf || '___.___.___-__',
    rg: x?.rg || BRANCO,
    orgao_emissor_rg: x?.orgao_emissor_rg || 'SSP',
    nacionalidade: x?.nacionalidade || 'Brasileiro(a)',
    estado_civil: x?.estado_civil || BRANCO,
    profissao: x?.profissao || BRANCO,
    data_nascimento: x?.data_nascimento,
    endereco: completarEndereco(x?.endereco),
    telefone: x?.telefone || BRANCO,
    email: x?.email || BRANCO,
  };
}

/**
 * Preenche um Partial<DadosFechamento> até virar um DadosFechamento COMPLETO e
 * válido, usando espaços em branco onde faltar. Nunca lança.
 */
export function completarComPlaceholders(p: Partial<DadosFechamento>): DadosFechamento {
  const titular = completarPessoa(p.titular_uc as Partial<PessoaFisica> | undefined);
  return {
    titular_uc: titular,
    uc_numero: p.uc_numero || 'a confirmar',
    ligacao_nova: p.ligacao_nova,
    concessionaria: p.concessionaria || 'Neoenergia-DF',
    endereco_instalacao: completarEndereco(p.endereco_instalacao),
    contratante: p.contratante ? completarPessoa(p.contratante as Partial<PessoaFisica>) : titular,
    contratante_eh_titular: p.contratante_eh_titular ?? true,
    relacao_contratante: p.relacao_contratante,
    observacao_partes: p.observacao_partes,
    sistema: p.sistema || {
      kwp: 0,
      modalidade: 'autoconsumo_local',
      modulos: { marca: BRANCO, potencia_w: 0, quantidade: 0 },
      inversor: { marca: BRANCO, modelo: BRANCO, potencia_kw: 0 },
    },
    comercial: p.comercial || { valor_total_brl: 0, forma_pagamento: BRANCO },
    disposicoes_especiais: p.disposicoes_especiais,
    docs_pedidos: ['contrato', 'procuracao'],
  };
}

/** Campos que ficaram em branco — pra avisar o Junior o que conferir/preencher. */
export function listarFaltando(dados: DadosFechamento, temProposta: boolean): string[] {
  const faltando: string[] = [];
  const t = dados.titular_uc as PessoaFisica;
  if (t.nome.includes('_')) faltando.push('nome');
  if (t.cpf.includes('_')) faltando.push('CPF');
  if (t.rg.includes('_')) faltando.push('RG');
  if (t.estado_civil?.includes('_')) faltando.push('estado civil');
  if (t.endereco.rua.includes('_')) faltando.push('endereço');
  if (!temProposta || dados.sistema.kwp === 0) faltando.push('dados do sistema (proposta)');
  if (dados.comercial.valor_total_brl === 0) faltando.push('valor');
  if (dados.comercial.forma_pagamento.includes('_')) faltando.push('forma de pagamento');
  return faltando;
}

export interface FechamentoAutoResult {
  dados: DadosFechamento;
  faltando: string[];
  nome: string;
}

/**
 * Monta os dados do fechamento de um lead, prontos pra renderizar contrato/
 * procuração. Determinístico e best-effort: se não achar o lead, devolve null;
 * senão, SEMPRE devolve dados completos (com brancos onde faltar).
 */
export async function montarFechamentoAuto(
  sb: SupabaseClient,
  leadId: string,
): Promise<FechamentoAutoResult | null> {
  const { lead, proposta } = await fetchByLeadId(sb, leadId);
  if (!lead) return null;
  const partial = buildInitialData(lead, proposta);
  const dados = completarComPlaceholders(partial);
  return {
    dados,
    faltando: listarFaltando(dados, !!proposta),
    nome: lead.name || 'Cliente',
  };
}
