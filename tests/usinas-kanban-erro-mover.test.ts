// Falha ao mover etapa não pode ser silenciosa.
// Regressão do bug "arrastei a usina e nada aconteceu": o POST voltava 403
// (sem permissão) mas o front engolia no .then vazio — o card só "voltava" ao
// recarregar, sem nenhum aviso. Agora a página checa o status da resposta,
// avisa o usuário (mensagem específica pra 403) e recarrega pra devolver o card.
import { describe, it, expect } from 'vitest';
import { renderUsinasKanbanPage } from '../src/modules/dashboard/usinas-kanban-views.js';

describe('kanban de obras — falha ao mover não pode ser silenciosa', () => {
  const html = renderUsinasKanbanPage([]);

  it('verifica o status da resposta (res.ok) em vez de ignorar', () => {
    expect(html).toContain('res.ok');
  });

  it('mostra mensagem clara de permissão quando o servidor recusa (403)', () => {
    expect(html).toMatch(/permiss[aã]o/i);
  });
});
