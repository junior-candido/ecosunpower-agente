// Regressão do bug "card duplica ao arrastar" no kanban.
// Causa: link <a> dentro do card era arrastável nativamente (conflitava com o
// SortableJS) e o placeholder "vazio" contava como item. Hardening:
//  - draggable="false" no link do nome
//  - draggable: '.kanban-card' no SortableJS (só cards são arrastáveis)
import { describe, it, expect } from 'vitest';
import { renderKanbanPage } from '../src/modules/dashboard/kanban-views.js';

const card = {
  id: 'a1b2c3', name: 'Fulano', phone: '5561999998888',
  status: 'novo', claimed_by: null, updated_at: new Date(0).toISOString(),
  seloSla: 'verde' as const,
};

describe('kanban — hardening contra duplicar ao arrastar', () => {
  const html = renderKanbanPage({ novo: [card] } as any);

  it('o link do nome do card tem draggable="false" (sem arraste nativo)', () => {
    expect(html).toMatch(/<a href="\/dashboard\/leads\/a1b2c3" draggable="false"/);
  });

  it('o SortableJS só arrasta .kanban-card (placeholder "vazio" não conta)', () => {
    expect(html).toContain("draggable: '.kanban-card'");
  });
});
