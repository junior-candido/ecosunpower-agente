// Painel de contato no Kanban de Obras: cada card ganha um botão ℹ️ que abre
// um painel lateral (drawer) com os dados do cliente, buscados sob demanda na
// rota GET /dashboard/usinas/:id/contato (não infla a query do board).
import { describe, it, expect } from 'vitest';
import { renderUsinasKanbanPage } from '../src/modules/dashboard/usinas-kanban-views.js';

const card = {
  id: '11111111-1111-1111-1111-111111111111',
  apelido: 'Usina Silva',
  cidade: 'Campinas',
  potencia_kwp: 8,
  etapa_obra: 'instalacao',
  etapa_obra_updated_at: null,
};

describe('kanban de obras — botão de contato + painel', () => {
  const html = renderUsinasKanbanPage([card]);

  it('cada card tem o botão de contato (classe kanban-info)', () => {
    expect(html).toContain('kanban-info');
  });

  it('a página inclui o painel lateral (drawer) de contato', () => {
    expect(html).toContain('contato-drawer');
  });

  it('o painel busca os dados sob demanda na rota /contato', () => {
    expect(html).toContain('/contato');
  });
});
