// Casos do Funil (Kanban) — renovação do miolo, R4. Dados FICTÍCIOS.
import { renderKanbanPage } from '../../src/modules/dashboard/kanban-views.js';
import { USER_CASA } from './miolo-leads.js';

const hora = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const c = (id: string, name: string | null, status: string, seloSla: 'verde' | 'ambar' | 'vermelho', h: number) =>
  ({ id, name, phone: '5561999990000', status, claimed_by: null, updated_at: hora(h), seloSla });

export const GRUPOS_FUNIL = {
  novo: [c('n1', 'Ana Exemplo', 'novo', 'verde', 2), c('n2', 'Bruno <script>x</script>', 'novo', 'vermelho', 30)],
  qualificando: [c('q1', 'Carla Fictícia', 'qualificando', 'ambar', 5)],
  qualificado: [],
  proposta_enviada: [c('p1', null, 'proposta_enviada', 'verde', 50)],
  negociacao: [c('g1', 'Diego Modelo', 'negociacao', 'verde', 1)],
  agendado: [],
  transferido: [],
  ganho: [c('w1', 'Elisa Amostra', 'ganho', 'verde', 100)],
};

export const CASOS_FUNIL = {
  cheio: () => renderKanbanPage(GRUPOS_FUNIL as any, USER_CASA),
  vazio: () => renderKanbanPage({} as any, USER_CASA),
};
