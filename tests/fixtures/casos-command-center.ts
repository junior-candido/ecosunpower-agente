// Casos do Command Center e da Central de Atenção (renovação do miolo, R5 —
// nova entrada). Dados FICTÍCIOS (tests/fixtures/telas-renovadas.ts#dadosCC).
import { renderCommandCenterPage, renderCentralAtencaoPage } from '../../src/modules/dashboard/command-center-views.js';
import { dadosCC } from './telas-renovadas.js';
import { USER_CASA, USER_TENANT } from './miolo-leads.js';

const AGORA = new Date('2026-09-28T15:00:00Z');

export const CASOS_COMMAND_CENTER: Record<string, () => string> = {
  'cc-casa': () => renderCommandCenterPage({ agora: AGORA, nomeUsuario: 'Junior', dados: dadosCC(6) }, USER_CASA),
  'cc-casa-sem-dado': () => renderCommandCenterPage({ agora: AGORA, nomeUsuario: 'Junior', dados: null }, USER_CASA),
  'cc-tenant': () => renderCommandCenterPage({ agora: AGORA, nomeUsuario: 'Bia', dados: dadosCC(6) }, USER_TENANT),
  'atencao-casa': () => renderCentralAtencaoPage({ agora: AGORA, dados: dadosCC(6), filtro: {} }, USER_CASA),
  'atencao-tenant': () => renderCentralAtencaoPage({ agora: AGORA, dados: dadosCC(6), filtro: { area: 'comercial' } }, USER_TENANT),
};
