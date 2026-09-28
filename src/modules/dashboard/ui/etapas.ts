// src/modules/dashboard/ui/etapas.ts
// Pílula de ETAPA (renovação do miolo, R1): cor por etapa do funil de leads
// (pipeline.ts) e por etapa da obra (usina-etapas.ts). Só LÊ as etapas que já
// existem — não cria etapa nenhuma. Etapa desconhecida vira pílula neutra com o
// texto escapado (nunca quebra a tela). CSS em estilo.ts (CSS_ETAPAS).

import { escapeHtml, SEM_DADO } from './html.js';
import { ORDEM_ETAPAS, etapaLabel } from '../pipeline.js';
import { ETAPAS_USINA } from '../../usina-etapas.js';

const ETAPAS_LEAD = new Set<string>([...ORDEM_ETAPAS, 'perdido']);
const ETAPAS_OBRA = new Map<string, string>(ETAPAS_USINA.map((e) => [e.slug, e.label]));

/** Pílula da etapa do funil (novo, qualificando… ganho, perdido). */
export function pilulaEtapa(etapa: string | null | undefined): string {
  if (!etapa) return `<span class="cc-pill cc-et cc-et-outra">${SEM_DADO}</span>`;
  if (ETAPAS_LEAD.has(etapa)) {
    return `<span class="cc-pill cc-et cc-et-${etapa}">${escapeHtml(etapaLabel(etapa))}</span>`;
  }
  return `<span class="cc-pill cc-et cc-et-outra">${escapeHtml(etapa)}</span>`;
}

/** Pílula da etapa da obra (projeto, aprovação… operação). */
export function pilulaEtapaObra(etapa: string | null | undefined): string {
  if (!etapa) return `<span class="cc-pill cc-et cc-et-outra">${SEM_DADO}</span>`;
  const rotulo = ETAPAS_OBRA.get(etapa);
  if (rotulo) return `<span class="cc-pill cc-et cc-eo-${etapa}">${escapeHtml(rotulo)}</span>`;
  return `<span class="cc-pill cc-et cc-et-outra">${escapeHtml(etapa)}</span>`;
}

/** Cor (token CSS) da etapa do funil — cabeçalho da coluna do Kanban. */
export function corEtapa(etapa: string): string {
  return ETAPAS_LEAD.has(etapa) ? `var(--cc-et-${etapa})` : 'var(--cc-off)';
}
