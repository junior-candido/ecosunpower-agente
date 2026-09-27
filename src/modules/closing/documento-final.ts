// src/modules/closing/documento-final.ts
//
// 📄 O documento que SAI de verdade — PDF, zap do cliente, Drive. Um lugar só,
// pra "Gerar", "Mandar" e "Salvar no Drive" nunca divergirem.
//
//  • Contrato/procuração CONGELADOS ("este é o contrato que vale") saem do RETRATO
//    congelado, com a data do congelamento. Reimprimir não remonta nada a partir
//    do cadastro/proposta de hoje — senão o "contrato original" mudaria sozinho.
//  • Sem congelar (ou aditivo, que é documento novo): monta agora, com a data de
//    hoje em Brasília.
//  • Sempre devolve os `problemas` (validar-documento.ts). Lista não vazia = a saída
//    é BLOQUEADA; o HTML volta mesmo assim, só pra prévia mostrar.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DadosFechamento } from './types.js';
import { getContrato, type DefinicaoContrato } from './contratos-registry.js';
import { montarFechamentoAuto } from './fechamento-auto.js';
import { contarVersoesCongeladas } from './contrato-vigente.js';
import { dataIsoEmBrasilia, hojeEmBrasilia } from './data-documento.js';
import { validarDocumento } from './validar-documento.js';

/** Os documentos que saem do retrato congelado. O aditivo NÃO: ele é o documento novo. */
const TIPOS_DO_RETRATO = new Set(['fv', 'procuracao']);

export interface DocumentoFinal {
  def: DefinicaoContrato;
  /** Os dados que foram pro documento (já com data_documento). */
  dados: DadosFechamento;
  html: string;
  nome: string;
  ok: boolean;
  problemas: string[];
  /** Saiu do retrato congelado? Então, de quando e qual versão. */
  congelado: { congeladoEm: string; versao: number } | null;
}

export async function montarDocumentoFinal(
  sb: SupabaseClient,
  leadId: string,
  tipo: string,
): Promise<DocumentoFinal | null> {
  const def = getContrato(tipo);
  if (!def) return null;
  const r = await montarFechamentoAuto(sb, leadId, def.tipo);
  if (!r) return null;

  const vigente = TIPOS_DO_RETRATO.has(def.tipo) ? r.vigente : null;

  let dados: DadosFechamento;
  let paraValidar: Partial<DadosFechamento>;
  let congelado: DocumentoFinal['congelado'] = null;

  if (vigente) {
    dados = {
      ...vigente.dados,
      data_documento: vigente.dados.data_documento
        || dataIsoEmBrasilia(vigente.congeladoEm)
        || hojeEmBrasilia(),
    };
    // O retrato já vem completado (com "____" onde faltava) — o validador trata
    // "____" como vazio, então lacuna congelada continua travada.
    paraValidar = dados;
    congelado = { congeladoEm: vigente.congeladoEm, versao: await contarVersoesCongeladas(sb, leadId) };
  } else {
    dados = { ...r.dados, data_documento: hojeEmBrasilia() };
    // Valida o CRU: o autopreenchimento inventa padrões que não são "____"
    // (concessionária "Neoenergia-DF", UF "DF"), e eles não podem passar por dado.
    paraValidar = r.cru;
  }

  const html = def.render(dados);
  const { ok, problemas } = validarDocumento({ tipo: def.tipo, dados: paraValidar, html });
  return { def, dados, html, nome: r.nome || 'cliente', ok, problemas, congelado };
}
