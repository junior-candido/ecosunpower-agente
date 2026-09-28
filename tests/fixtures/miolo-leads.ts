// Fixtures FICTÍCIAS da renovação do miolo (lista e ficha de leads).
// Nomes inventados — nunca dado real de cliente.
import type { DashUser } from '../../src/modules/dashboard/permissions.js';

export const USER_CASA: DashUser = {
  id: 'u-casa', companyId: '00000000-0000-0000-0000-000000000001', nome: 'Junior', login: 'junior',
  isAdmin: true, roleNome: 'Administrador', permissoes: {},
};
export const USER_TENANT: DashUser = {
  id: 'u-ten', companyId: 'aaaa1111-2222-3333-4444-555566667777', nome: 'Bia Teste', login: 'bia',
  isAdmin: true, roleNome: 'Administrador', permissoes: { leads: ['visualizar', 'editar'] }, companyNome: 'Solar Aurora Teste',
};

const hora = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

export function leadRow(over: Record<string, unknown> = {}): any {
  return {
    id: '11111111-1111-1111-1111-111111111111', phone: '5561999990001', name: 'Ana Exemplo',
    status: 'novo', acquisition_source: 'campanha_1_meta_lead_ads', eva_active: true, opt_out: false,
    maintenance_client: false, created_at: hora(30), updated_at: hora(2), has_cadence_pending: false,
    alerta: 'novo', archived_at: null, installation_status: null, loss_reason: null, loss_notes: null,
    lost_at: null, claimed_by: null, seloSla: 'verde', ...over,
  };
}

export const LINHAS_LEADS = [
  leadRow(),
  leadRow({ id: '22222222-2222-2222-2222-222222222222', name: 'Bruno <script>alert(1)</script>', phone: '5561988887777', status: 'negociacao', alerta: 'silente_sem_cadencia', seloSla: 'vermelho', eva_active: false, acquisition_source: 'indicacao' }),
  leadRow({ id: '33333333-3333-3333-3333-333333333333', name: 'Carla Fictícia', status: 'perdido', loss_reason: 'concorrente', loss_notes: 'fechou com outro', seloSla: 'ambar', opt_out: true, has_cadence_pending: true, acquisition_source: null }),
  leadRow({ id: '44444444-4444-4444-4444-444444444444', name: null, status: 'ganho', installation_status: 'operando', alerta: 'cliente_respondeu' }),
];

export const FILTROS_CHEIOS = {
  status: 'negociacao', search: 'ana & cia', limit: 10, offset: 10, total: 45,
  countByStatus: { todos: 45, novo: 12, qualificando: 5, qualificado: 3, proposta_enviada: 7, negociacao: 4, agendado: 2, transferido: 1, ganho: 3, ganhos: 6, perdido: 9 },
  atencaoCount: 3,
  insights: [
    { text: '3 leads sem resposta há mais de 24 h.', severity: 'critical' as const, emoji: '🚨' },
    { text: 'Taxa de resposta subiu esta semana.', severity: 'info' as const, emoji: '📈' },
  ],
};

export const FILTROS_ALERTAS = { only_alerts: true, total: 4, countByStatus: { todos: 4 }, atencaoCount: 0 };
export const FILTROS_ATENCAO = { atencao: true, total: 4, atencaoCount: 2 };
