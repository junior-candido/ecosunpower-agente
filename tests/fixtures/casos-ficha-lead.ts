// Casos da ficha do lead usados no contrato e no visual (renovação do miolo, R3).
import { renderLeadDetailPage } from '../../src/modules/dashboard/leads-views.js';
import { USER_CASA, leadDetalhe, SERVICOS_LEAD, CONVERSA_COPILOTO } from './miolo-leads.js';

const ontem = new Date(Date.now() - 86400_000).toISOString();

export const CASOS_FICHA = {
  normal: () => renderLeadDetailPage(leadDetalhe(), CONVERSA_COPILOTO, '', '', SERVICOS_LEAD, USER_CASA),
  pausada: () => renderLeadDetailPage(leadDetalhe({ eva_active: false, has_cadence_pending: true, opt_out: true, archived_at: ontem }), [], '', '', [], USER_CASA),
  semCadencia: () => renderLeadDetailPage(leadDetalhe({ eva_active: false, has_cadence_pending: false, opt_out: false }), [], '', '', [], USER_CASA),
  perdido: () => renderLeadDetailPage(leadDetalhe({ status: 'perdido', loss_reason: 'concorrente', loss_notes: 'proposta 15% mais barata', lost_at: ontem, conversation_messages: [], tarefas: [], timeline: [] }), [], '', '', [], USER_CASA),
  venda: () => renderLeadDetailPage(leadDetalhe({ installation_status: 'operando', contract_signed_at: ontem }), [], '', '', [], USER_CASA),
  vazio: () => renderLeadDetailPage(leadDetalhe({ name: null, email: null, city: null, energy_data: {}, opportunities: {}, conversation_messages: [], cadence_steps: [], anexos: [], timeline: [], tarefas: [] }), [], '', '', [], USER_CASA),
};
