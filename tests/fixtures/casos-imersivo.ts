// Casos do Prédio Vivo e do Cérebro (renovação do miolo, R23 — dentro da
// casca, modo imersivo). Só da casa (as rotas barram o tenant). Dados fictícios.
import { renderPredioPage } from '../../src/modules/dashboard/predio-views.js';
import { renderCerebroPage } from '../../src/modules/dashboard/cerebro-views.js';
import { USER_CASA } from './miolo-leads.js';

export const SNAP_CEREBRO: any = {
  comercial: { leads: 42, negociacao: 8, ganhos: 5, propostas: 12 }, atendimento: { conversas: 15 },
  marketing: { emailsEnviados: 3, emailsAbertos: 1, leadsQuentes: 0, anuncios: 7, blog: 4 }, externos: { calculadora: 9, site: 21 },
  operacao: { usinas: 30 }, relacionamento: { clientes: 24, manutencoes: 2 }, financeiro: { vendas: 5 }, elo: { totalEventos: 120 },
};

export const CASOS_IMERSIVO: Record<string, () => string> = {
  'predio': () => renderPredioPage(USER_CASA),
  'cerebro': () => renderCerebroPage(SNAP_CEREBRO, ['Oi, eu sou o Elo. </script><script>alert(1)</script>', 'Segunda fala.'], USER_CASA),
};
