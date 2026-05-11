import type { SupabaseClient } from '@supabase/supabase-js';

export type CadenciaStatus =
  | 'aguardando'
  | 'enviado_sem_resposta'
  | 'respondeu'
  | 'qualificando'
  | 'proposta_enviada'
  | 'cliente'
  | 'sem_resposta_7d'
  | 'opt_out';

export interface LeadCadenciaRow {
  id: string;
  name: string;
  phone: string;
  status_db: string;
  cadencia_status: CadenciaStatus;
  last_reactivation_sent_at: string | null;
  last_message_at: string | null;
  ultima_etapa_anterior: string | null;
  temperatura_anterior: string | null;
  motivo_perda_anterior: string | null;
  consumo_kwh: number | null;
  atendente_anterior: string | null;
  contato_criado_em_original: string | null;
  has_proposal: boolean;
  has_inbound_after_template: boolean;
}

export interface CadenciaKpis {
  total_leads: number;
  templates_disparados: number;
  responderam: number;
  qualificando: number;
  proposta_enviada: number;
  clientes: number;
  taxa_resposta_pct: number | null;
  taxa_qualificacao_pct: number | null;
  taxa_proposta_pct: number | null;
}

interface LeadJoined {
  id: string;
  name: string;
  phone: string;
  status: string;
  opportunities: Record<string, unknown> | null;
  energy_data: Record<string, unknown> | null;
  conversations?: { last_message_at: string | null; messages: Array<{ role: string; created_at?: string }> | null }[] | null;
  opt_out: boolean | null;
}

export async function listCadenciaLeads(supabase: SupabaseClient): Promise<LeadCadenciaRow[]> {
  const { data: leads, error } = await supabase
    .from('leads')
    .select(`
      id, name, phone, status, opportunities, energy_data, opt_out,
      conversations:conversations(last_message_at, messages)
    `)
    .eq('acquisition_source', 'terceirizada_recovered')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('[cadencia-queries] erro list:', error.message);
    return [];
  }
  if (!leads) return [];

  const now = Date.now();
  return (leads as unknown as LeadJoined[]).map((l): LeadCadenciaRow => {
    const opps = (l.opportunities ?? {}) as Record<string, unknown>;
    const sent_at = (opps.last_reactivation_sent_at as string | undefined) ?? null;
    const conv = l.conversations?.[0];
    const last_msg = conv?.last_message_at ?? null;
    const messages = conv?.messages ?? [];
    const has_proposal = false; // TODO: cruzar com tabela proposals quando relationship existir

    // Inbound messages = client respondeu (role='user')
    const inbounds = messages.filter((m) => m.role === 'user');
    const has_inbound_after_template = sent_at
      ? inbounds.some((m) => m.created_at && new Date(m.created_at).getTime() > new Date(sent_at).getTime())
      : inbounds.length > 0;

    // Calcula cadencia_status
    let cadencia_status: CadenciaStatus = 'aguardando';
    if (l.opt_out) cadencia_status = 'opt_out';
    else if (has_proposal) cadencia_status = 'proposta_enviada';
    else if (l.status === 'transferido') cadencia_status = 'cliente';
    else if (l.status === 'qualificado') cadencia_status = 'qualificando';
    else if (has_inbound_after_template) {
      const lastInbound = inbounds[inbounds.length - 1];
      const lastTime = lastInbound?.created_at ? new Date(lastInbound.created_at).getTime() : 0;
      const isQualifying = l.status === 'qualificando' && (now - lastTime) < 7 * 24 * 60 * 60 * 1000;
      cadencia_status = isQualifying ? 'qualificando' : 'respondeu';
    } else if (sent_at) {
      const daysSince = (now - new Date(sent_at).getTime()) / (1000 * 60 * 60 * 24);
      cadencia_status = daysSince > 7 ? 'sem_resposta_7d' : 'enviado_sem_resposta';
    }

    return {
      id: l.id,
      name: l.name ?? '(sem nome)',
      phone: l.phone,
      status_db: l.status,
      cadencia_status,
      last_reactivation_sent_at: sent_at,
      last_message_at: last_msg,
      ultima_etapa_anterior: (opps.etapa_anterior as string | undefined) ?? null,
      temperatura_anterior: (opps.temperatura_anterior as string | undefined) ?? null,
      motivo_perda_anterior: (opps.motivo_perda_anterior as string | undefined) ?? null,
      consumo_kwh: ((l.energy_data ?? {}) as { consumption_kwh?: number }).consumption_kwh ?? null,
      atendente_anterior: (opps.atendente_anterior as string | undefined) ?? null,
      contato_criado_em_original: (opps.contato_criado_em_original as string | undefined) ?? null,
      has_proposal,
      has_inbound_after_template,
    };
  });
}

export function calcKpis(rows: LeadCadenciaRow[]): CadenciaKpis {
  const total_leads = rows.length;
  const templates_disparados = rows.filter((r) => r.last_reactivation_sent_at).length;
  const responderam = rows.filter((r) => r.has_inbound_after_template).length;
  const qualificando = rows.filter((r) => r.cadencia_status === 'qualificando').length;
  const proposta_enviada = rows.filter((r) => r.cadencia_status === 'proposta_enviada').length;
  const clientes = rows.filter((r) => r.cadencia_status === 'cliente').length;

  return {
    total_leads,
    templates_disparados,
    responderam,
    qualificando,
    proposta_enviada,
    clientes,
    taxa_resposta_pct: templates_disparados > 0 ? (responderam / templates_disparados) * 100 : null,
    taxa_qualificacao_pct: responderam > 0 ? (qualificando / responderam) * 100 : null,
    taxa_proposta_pct: qualificando > 0 ? (proposta_enviada / qualificando) * 100 : null,
  };
}
