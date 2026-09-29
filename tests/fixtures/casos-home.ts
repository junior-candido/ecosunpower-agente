// Casos da Visão geral /home (renovação do miolo, R24 — D5 = a: renovar e
// manter). Só da casa (tenant vai pro Command Center). Dados fictícios.
import { renderHomePage } from '../../src/modules/dashboard/views.js';
import type { DashboardKpi, GraficoMensal } from '../../src/modules/dashboard/queries.js';
import { USER_CASA } from './miolo-leads.js';

export const KPIS_HOME: DashboardKpi = {
  totalPropostas: 480, propostasMesAtual: 47, propostasAnoAtual: 390, totalLeads: 2120, leadsMesAtual: 212,
  leadsQualificando: 38, clientesInstalados: 196, manutencaoPendente: 5, ticketMedio: 28450.5,
  vendasTotal: 210, vendasMesAtual: 9, vendasAnoAtual: 71, usinasMesAtual: 3,
};
const meses = (base: number): GraficoMensal[] => Array.from({ length: 12 }, (_, i) => ({ mes: `2025-${String(((i + 9) % 12) + 1).padStart(2, '0')}`, total: base + ((i * 7) % 11) }));

export const CASOS_HOME: Record<string, () => string> = {
  'home': () => renderHomePage(KPIS_HOME, meses(30), meses(5), 'Este mês', '2026-09', USER_CASA),
  'home-mes-passado': () => renderHomePage({ ...KPIS_HOME, manutencaoPendente: 0, ticketMedio: 0 }, meses(10), [], 'agosto de 2026', '2026-08', USER_CASA),
  'home-vazio': () => renderHomePage({ ...KPIS_HOME, totalPropostas: 0, propostasMesAtual: 0, propostasAnoAtual: 0, totalLeads: 0, leadsMesAtual: 0, vendasMesAtual: 0, vendasTotal: 0, vendasAnoAtual: 0 }, [], [], 'Este mês', '2026-09', USER_CASA),
};
