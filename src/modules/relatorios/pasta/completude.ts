// src/modules/relatorios/pasta/completude.ts
// Regra R2 da automação de envio: a pasta só publica COMPLETA — as 7 seções
// obrigatórias com pelo menos 1 arquivo. "monitoramento" é opcional.
import { SECOES, type ArquivoPasta, type SecaoId } from './types.js';

export const SECOES_OBRIGATORIAS: ReadonlyArray<SecaoId> = [
  'fotos', 'projeto', 'art', 'homologacao', 'manuais', 'garantia', 'contrato',
];

/** Seções obrigatórias sem nenhum arquivo, na ordem de exibição. */
export function secoesFaltando(arquivos: ReadonlyArray<Pick<ArquivoPasta, 'secao'>> | null | undefined): SecaoId[] {
  const presentes = new Set((arquivos ?? []).map((a) => a.secao));
  return SECOES_OBRIGATORIAS.filter((s) => !presentes.has(s));
}

export function pastaCompleta(arquivos: ReadonlyArray<Pick<ArquivoPasta, 'secao'>> | null | undefined): boolean {
  return secoesFaltando(arquivos).length === 0;
}

/** Texto curto pro botão travado / erro: "falta: 📋 ART, 📄 Contrato". */
export function textoFaltando(faltando: ReadonlyArray<SecaoId>): string {
  if (faltando.length === 0) return '';
  const titulo = (id: SecaoId) => SECOES.find((s) => s.id === id)?.titulo ?? id;
  return `falta: ${faltando.map(titulo).join(', ')}`;
}
