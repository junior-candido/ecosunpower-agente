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

// ─────────────────────────────────────────────────────────────────────────────
// Prévia: o documento continua aparecendo, com os problemas numa faixa vermelha
// ─────────────────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Coloca o aviso no topo da PRÉVIA (só na prévia — nunca no PDF). Com problemas:
 * faixa vermelha "não pode sair assim" + a lista. Congelado: lembra que é a
 * versão congelada que sai. Estilo inline (a prévia roda com CSP sem CSS externo).
 */
export function inserirAvisoNaPrevia(
  html: string,
  info: { problemas: string[]; congelado: DocumentoFinal['congelado']; aviso?: string },
): string {
  const partes: string[] = [];
  const caixa = (cor: string, fundo: string, dentro: string) =>
    `<div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.4;margin:0 0 12px;padding:10px 14px;border:2px solid ${cor};background:${fundo};color:#111;border-radius:6px">${dentro}</div>`;

  if (info.problemas.length) {
    const itens = info.problemas.map((p) => `<li>${esc(p)}</li>`).join('');
    partes.push(caixa('#dc2626', '#fef2f2',
      `<strong style="color:#b91c1c">🚫 Este documento não pode sair assim.</strong> ` +
      `Gerar PDF, Mandar e Salvar no Drive ficam travados até corrigir:` +
      `<ul style="margin:6px 0 0 18px;padding:0">${itens}</ul>`));
  }
  if (info.congelado) {
    const d = dataIsoEmBrasilia(info.congelado.congeladoEm) ?? '';
    const br = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    const quando = br ? `${br[3]}/${br[2]}/${br[1]}` : esc(info.congelado.congeladoEm);
    partes.push(caixa('#059669', '#ecfdf5',
      `📌 Esta é a versão <strong>congelada em ${quando} (v${info.congelado.versao})</strong> — é ela que sai no PDF, no zap e no Drive.`));
  }
  if (info.aviso) partes.push(caixa('#d97706', '#fffbeb', esc(info.aviso)));

  if (!partes.length) return html;
  const aviso = partes.join('');
  const m = /<body[^>]*>/i.exec(html);
  if (!m) return aviso + html;
  const fim = m.index + m[0].length;
  return html.slice(0, fim) + aviso + html.slice(fim);
}
