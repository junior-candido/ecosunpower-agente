// src/modules/dashboard/sla-rules.ts
// Regras de SLA do funil (v1 fixas no código; configuráveis numa fase futura). Puras.
export type TarefaTipo = 'ligar' | 'cobrar_proposta' | 'confirmar_visita' | 'follow_up' | 'custom';

export interface LeadSlaInput {
  status: string;
  last_contact_at: string | null;
  agendado_para: string | null; // data/hora da visita (se houver)
}
export interface RegraSla { tipo: TarefaTipo; titulo: string; due_at: string; prioridade: 'baixa'|'media'|'alta'; }

const H = 3600_000, D = 24 * 3600_000;
const ATIVAS_PARA_FOLLOWUP = ['novo','qualificando','qualificado','proposta_enviada','negociacao','agendado','transferido'];

export function regrasSlaParaLead(lead: LeadSlaInput, agora: number): RegraSla[] {
  if (lead.status === 'ganho' || lead.status === 'perdido') return [];
  const out: RegraSla[] = [];
  const base = lead.last_contact_at ? Date.parse(lead.last_contact_at) : agora;

  if (lead.status === 'novo' || lead.status === 'qualificando') {
    out.push({ tipo: 'ligar', titulo: 'Ligar pro lead (primeiro contato)', due_at: new Date(base + 24 * H).toISOString(), prioridade: 'alta' });
  }
  if (lead.status === 'proposta_enviada') {
    out.push({ tipo: 'cobrar_proposta', titulo: 'Cobrar retorno da proposta', due_at: new Date(base + 3 * D).toISOString(), prioridade: 'alta' });
  }
  if (lead.status === 'agendado' && lead.agendado_para) {
    out.push({ tipo: 'confirmar_visita', titulo: 'Confirmar a visita', due_at: new Date(Date.parse(lead.agendado_para) - 24 * H).toISOString(), prioridade: 'media' });
  }
  if (ATIVAS_PARA_FOLLOWUP.includes(lead.status)) {
    out.push({ tipo: 'follow_up', titulo: 'Dar andamento (sem atualização)', due_at: new Date(base + 48 * H).toISOString(), prioridade: 'media' });
  }
  return out;
}

export function seloSla(tarefas: Array<{ due_at: string | null; status: string }>, agora: number): 'verde'|'ambar'|'vermelho' {
  const pend = tarefas.filter(t => t.status === 'pendente' && t.due_at);
  if (pend.some(t => Date.parse(t.due_at!) < agora)) return 'vermelho';
  if (pend.some(t => Date.parse(t.due_at!) - agora < 12 * H)) return 'ambar';
  return 'verde';
}
