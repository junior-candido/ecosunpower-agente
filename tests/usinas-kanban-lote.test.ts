// Mover em lote no Kanban de Obras (modo seleção): botão liga/desliga, caixinhas
// nos cards, "selecionar todas" por coluna e uma barra de ação que move as
// selecionadas via POST /dashboard/usinas/set-etapa-obra-lote.
import { describe, it, expect } from 'vitest';
import { renderUsinasKanbanPage } from '../src/modules/dashboard/usinas-kanban-views.js';

const card = {
  id: '11111111-1111-1111-1111-111111111111',
  apelido: 'Usina Silva',
  cidade: 'Campinas',
  potencia_kwp: 8,
  etapa_obra: 'projeto',
  etapa_obra_updated_at: null,
};

describe('kanban de obras — mover em lote (modo seleção)', () => {
  const html = renderUsinasKanbanPage([card]);

  it('tem o botão de ligar/desligar o modo seleção', () => {
    expect(html).toContain('btn-selecionar');
  });

  it('cada card tem uma caixinha de seleção (kanban-check)', () => {
    expect(html).toContain('kanban-check');
  });

  it('tem a barra de ação de mover em lote', () => {
    expect(html).toContain('lote-bar');
  });

  it('o mover em lote chama a rota set-etapa-obra-lote', () => {
    expect(html).toContain('set-etapa-obra-lote');
  });
});
