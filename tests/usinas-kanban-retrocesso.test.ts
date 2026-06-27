// Confirmação ao retroceder etapa no kanban de obras.
// Pré-requisito server-side: cada coluna precisa expor a ORDEM da etapa
// (data-ordem), derivada de ordemEtapa() do módulo usina-etapas. É com esse
// número que o JS do navegador decide se um arraste é avanço (salva direto)
// ou retrocesso (pede confirmação). A ordem continua vindo de um lugar só.
import { describe, it, expect } from 'vitest';
import { renderUsinasKanbanPage } from '../src/modules/dashboard/usinas-kanban-views.js';
import { ETAPAS_USINA } from '../src/modules/usina-etapas.js';

describe('kanban de obras — coluna expõe a ordem da etapa (base do retrocesso)', () => {
  const html = renderUsinasKanbanPage([]);

  for (const etapa of ETAPAS_USINA) {
    it(`coluna "${etapa.slug}" tem data-ordem="${etapa.ordem}" na lista de drop`, () => {
      expect(html).toContain(`data-etapa="${etapa.slug}" data-ordem="${etapa.ordem}"`);
    });
  }
});
