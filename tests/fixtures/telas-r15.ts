// Onda 3 — R15: Quadro de Obras + vincular + contato. Telas renovadas com dados FICTÍCIOS em volume n
// (usadas pelo teste "telas leves" e por scripts/medir-telas-leves.ts).
import type { DashUser } from '../../src/modules/dashboard/permissions.js';
import { renderUsinasKanbanPage, type UsinaKanbanCard } from '../../src/modules/dashboard/usinas-kanban-views.js';
import { renderVincularUsinasPage } from '../../src/modules/dashboard/vincular-usinas-views.js';
import { ETAPAS_USINA } from '../../src/modules/usina-etapas.js';

/** Classes fora do padrão cc- que a tela usa de propósito (gancho de JS ou de teste antigo). */
export const CLASSES_R15: string[] = [
  // Quadro de Obras: ganchos do script (filtro, seleção em lote, contato) e dos testes antigos
  'kanban-check', 'kanban-info', 'kanban-count', 'sel-todas', 'contato-copiar', 'modo-selecao',
];

const uuid = (i: number) => `${String(i).padStart(8, '0')}-2222-4222-8222-222222222222`;
const diasAtras = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

/** n obras espalhadas pelas etapas. */
export function obrasR15(n: number): UsinaKanbanCard[] {
  return Array.from({ length: n }, (_, i) => ({
    id: uuid(i), apelido: `Usina Fictícia ${i}`, cidade: 'Cidade Exemplo', potencia_kwp: 4 + (i % 9) * 1.2,
    etapa_obra: ETAPAS_USINA[i % ETAPAS_USINA.length].slug, etapa_obra_updated_at: i % 7 === 0 ? null : diasAtras(i % 30),
  }));
}

export function telasR15(n: number, user: DashUser): Record<string, string> {
  const leads = Array.from({ length: n }, (_, i) => ({ id: `L${i}`, name: `Cliente Fictício ${i}` }));
  return {
    'r15-quadro-obras': renderUsinasKanbanPage(obrasR15(n), user),
    'r15-vincular': renderVincularUsinasPage({
      sugestoes: Array.from({ length: Math.min(n, 20) }, (_, i) => ({ usinaId: uuid(i), apelido: `Usina Fictícia ${i}`, leadSugeridoId: i % 2 ? `L${i}` : null, leadSugeridoNome: null })),
      leads, user,
    }),
  };
}
