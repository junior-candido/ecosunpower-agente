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
import { deepMerge } from './closing-assistant.js';
import { contratoVigente, type ContratoCongelado } from './contrato-vigente.js';

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
/** Só aproveita o que é objeto de verdade — jsonb estragado não derruba o PDF. */
function obj<T>(v: unknown): Partial<T> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Partial<T>) : {};
}

function completarSistema(v: unknown): DadosFechamento['sistema'] {
  const s = obj<DadosFechamento['sistema']>(v);
  const mod = obj<{ marca: string; potencia_w: number; quantidade: number }>(s.modulos);
  const inv = obj<{ marca: string; modelo: string; potencia_kw: number; quantidade?: number }>(s.inversor);
  return {
    kwp: Number(s.kwp) || 0,
    modalidade: s.modalidade || 'autoconsumo_local',
    modulos: { marca: mod.marca || BRANCO, potencia_w: Number(mod.potencia_w) || 0, quantidade: Number(mod.quantidade) || 0 },
    inversor: { marca: inv.marca || BRANCO, modelo: inv.modelo || BRANCO, potencia_kw: Number(inv.potencia_kw) || 0, quantidade: inv.quantidade },
  };
}

export function completarComPlaceholders(p: Partial<DadosFechamento>): DadosFechamento {
  const titular = completarPessoa(obj<PessoaFisica>(p.titular_uc));
  const com = obj<DadosFechamento['comercial']>(p.comercial);
  return {
    titular_uc: titular,
    uc_numero: p.uc_numero || 'a confirmar',
    ligacao_nova: p.ligacao_nova,
    concessionaria: p.concessionaria || 'Neoenergia-DF',
    endereco_instalacao: completarEndereco(obj<Endereco>(p.endereco_instalacao)),
    // O texto do contrato imprime o CONTRATANTE (quem assina) — não o titular.
    // Quando é a mesma pessoa (o normal), o contratante TEM que ser o titular já
    // corrigido, senão o que o operador arruma no formulário não chega no PDF.
    contratante: p.contratante_eh_titular === false
      ? completarPessoa(obj<PessoaFisica>(p.contratante))
      : titular,
    contratante_eh_titular: p.contratante_eh_titular ?? true,
    relacao_contratante: p.relacao_contratante,
    observacao_partes: p.observacao_partes,
    sistema: completarSistema(p.sistema),
    comercial: {
      valor_total_brl: Number(com.valor_total_brl) || 0,
      forma_pagamento: com.forma_pagamento || BRANCO,
    },
    disposicoes_especiais: p.disposicoes_especiais,
    // O aditivo passa inteiro (o template dele decide o que fazer com cada campo
    // vazio). Se não é aditivo, nem existe.
    aditivo: p.aditivo ? obj<DadosFechamento['aditivo']>(p.aditivo) : undefined,
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
  /** Pronto pra virar PDF: completo, com brancos onde faltou. */
  dados: DadosFechamento;
  /** O mesmo, mas CRU (sem os "____") — é o que alimenta o formulário da tela. */
  cru: Partial<DadosFechamento>;
  faltando: string[];
  nome: string;
  temProposta: boolean;
  /** O contrato congelado ("este é o contrato que vale"). Null = nunca congelaram. */
  vigente?: ContratoCongelado | null;
}

/**
 * O rascunho que o Junior salvou no formulário da central de contratos, guardado
 * em `leads.contrato_dados` separado por tipo: { fv: {...}, procuracao: {...} }.
 * Best-effort: coluna nova/vazia/estragada → null, nunca lança.
 */
export function lerRascunho(lead: unknown, tipo: string): Partial<DadosFechamento> | null {
  const cd = (lead as { contrato_dados?: unknown } | null)?.contrato_dados;
  if (!cd || typeof cd !== 'object' || Array.isArray(cd)) return null;
  const r = (cd as Record<string, unknown>)[tipo];
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  return r as Partial<DadosFechamento>;
}

/**
 * Monta os dados do fechamento de um lead, prontos pra renderizar qualquer
 * contrato da central. Determinístico e best-effort: se não achar o lead, devolve
 * null; senão, SEMPRE devolve dados completos (com brancos onde faltar).
 *
 * Ordem de quem manda (o de baixo vence): cadastro do lead + proposta + o que a
 * IA leu da conta/CNH → POR CIMA, o rascunho que o operador digitou no formulário.
 */
export async function montarFechamentoAuto(
  sb: SupabaseClient,
  leadId: string,
  tipo = 'fv',
): Promise<FechamentoAutoResult | null> {
  const { lead, proposta } = await fetchByLeadId(sb, leadId);
  if (!lead) return null;
  const automatico = buildInitialData(lead, proposta);
  const rascunho = lerRascunho(lead, tipo);
  const cru = rascunho ? (deepMerge(automatico as any, rascunho as any) as Partial<DadosFechamento>) : automatico;

  // O contrato congelado ("este é o contrato que vale"). A tela usa pra mostrar o
  // carimbo; o ADITIVO usa pra saber o "antes" — que NÃO se digita, sai daqui.
  // Sem contrato congelado não existe "antes", e a tela manda congelar primeiro
  // em vez de deixar o operador inventar a data.
  const vigente = await contratoVigente(sb, leadId);
  if (tipo === 'aditivo' && vigente) {
    cru.aditivo = {
      ...(cru.aditivo ?? {}),
      contrato_data: vigente.congeladoEm,
      valor_anterior: vigente.dados.comercial?.valor_total_brl,
      forma_pagamento_anterior: vigente.dados.comercial?.forma_pagamento,
    };
  }

  const dados = completarComPlaceholders(cru);
  return {
    dados,
    cru,
    faltando: listarFaltando(dados, !!proposta),
    nome: lead.name || 'Cliente',
    temProposta: !!proposta,
    vigente,
  };
}
