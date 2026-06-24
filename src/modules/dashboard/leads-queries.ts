// leads-queries.ts
// Queries para a pagina /dashboard/leads (lista + detalhe).

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSignedUrls } from '../anexos/storage.js';
import type { DashUser } from './permissions.js';

export interface LeadRow {
  id: string;
  phone: string;
  name: string | null;
  status: string;
  acquisition_source: string | null;
  eva_active: boolean;
  opt_out: boolean;
  maintenance_client: boolean;
  created_at: string;
  updated_at: string;
  has_cadence_pending: boolean;
  alerta: 'silente_sem_cadencia' | 'silente_com_cadencia' | 'cliente_respondeu' | 'novo' | 'normal';
  archived_at: string | null;
  installation_status: string | null;
  loss_reason: string | null;
  loss_notes: string | null;
  lost_at: string | null;
}

export interface LeadDetail extends LeadRow {
  city: string | null;
  neighborhood: string | null;
  profile: string | null;
  email: string | null;
  energy_data: any;
  opportunities: any;
  conversation_messages: Array<{ role: string; content: string; timestamp: string }>;
  cadence_steps: Array<{ step: number; scheduled_for: string; status: string; sent_at: string | null }>;
  anexos: Array<{ id: string; tipo: string; descricao: string | null; url: string; mime_type: string | null; created_by: string; created_at: string }>;
}

// Statuses que indicam "já virou cliente" — esses NÃO aparecem em /leads.
// Aparecem em /clientes via mesmo filtro inverso (CLIENTE_STATUSES em clientes-queries.ts).
const CLIENTE_STATUSES = [
  'contrato_assinado', 'instalado', 'medidor_trocado',
  'operando', 'pos_venda_concluido',
];

export interface ListLeadsOptions {
  status?: string;
  eva_active?: boolean;
  only_alerts?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
  // visibilidade: quando setado e não-admin, filtra pool + os do próprio usuário
  viewerId?: string;
  viewerIsAdmin?: boolean;
}

export interface LeadsResult {
  rows: LeadRow[];
  total: number;
  countByStatus: Record<string, number>;
}

// Valores que existem no enum `lead_status` em Postgres. Migration 039 adiciona 'perdido'.
const STATUS_OPTIONS = ['novo', 'qualificando', 'qualificado', 'agendado', 'transferido', 'perdido'];

// Tabs especiais (nao sao status do enum — sao filtros derivados):
// - 'ganhos'   = installation_status IN CLIENTE_STATUSES (virou cliente)
// - 'perdidos' = status='perdido'
// - 'todos'    = todos os leads no funil (nao-clientes, nao-arquivados, nao-perdidos)

export async function listLeads(
  client: SupabaseClient,
  filters: ListLeadsOptions = {},
): Promise<LeadsResult> {
  const search = filters.search?.trim() ?? '';
  const limit = Math.max(1, Math.min(200, filters.limit ?? 50));
  const offset = Math.max(0, filters.offset ?? 0);

  // baseFilter exclui clientes fechados. Usado em 'todos' e nos filtros por status normal.
  const baseFilter = `installation_status.is.null,installation_status.not.in.(${CLIENTE_STATUSES.join(',')})`;

  // Visibilidade pool+claim aplicada também nas contagens, pra os badges baterem com a lista.
  const visFilter = filters.viewerId && !filters.viewerIsAdmin
    ? `claimed_by.is.null,claimed_by.eq.${filters.viewerId}`
    : null;

  // Contagens — 6 status normais + ganhos + perdidos. Todas em paralelo.
  const countByStatus: Record<string, number> = {};
  const countQueries = await Promise.all([
    // Por status normal (5 valores do enum exceto perdido)
    ...STATUS_OPTIONS.filter((s) => s !== 'perdido').map((s) => {
      let cq = client.from('leads')
        .select('id', { count: 'exact', head: true })
        .or(baseFilter)
        .is('archived_at', null)
        .eq('status', s);
      if (visFilter) cq = cq.or(visFilter);
      return cq;
    }),
    // Perdidos (status='perdido', ignora installation_status)
    (() => {
      let cq = client.from('leads')
        .select('id', { count: 'exact', head: true })
        .is('archived_at', null)
        .eq('status', 'perdido');
      if (visFilter) cq = cq.or(visFilter);
      return cq;
    })(),
    // Ganhos (installation_status em CLIENTE_STATUSES)
    (() => {
      let cq = client.from('leads')
        .select('id', { count: 'exact', head: true })
        .is('archived_at', null)
        .in('installation_status', CLIENTE_STATUSES);
      if (visFilter) cq = cq.or(visFilter);
      return cq;
    })(),
  ]);
  const statusNormais = STATUS_OPTIONS.filter((s) => s !== 'perdido');
  statusNormais.forEach((s, i) => {
    countByStatus[s] = countQueries[i].count ?? 0;
  });
  countByStatus.perdido = countQueries[statusNormais.length].count ?? 0;
  countByStatus.ganhos = countQueries[statusNormais.length + 1].count ?? 0;
  countByStatus.todos = statusNormais.reduce((sum, s) => sum + (countByStatus[s] ?? 0), 0);

  // Query principal — depende da tab selecionada
  let q = client
    .from('leads')
    .select(
      'id, phone, name, status, acquisition_source, eva_active, opt_out, maintenance_client, created_at, updated_at, installation_status, archived_at, loss_reason, loss_notes, lost_at',
      { count: 'exact' },
    )
    .is('archived_at', null)
    .order('updated_at', { ascending: false });

  // Tabs especiais: ganhos e perdidos
  if (filters.status === 'ganhos') {
    q = q.in('installation_status', CLIENTE_STATUSES);
  } else if (filters.status === 'perdidos' || filters.status === 'perdido') {
    q = q.eq('status', 'perdido');
  } else {
    // Tab normal: aplica baseFilter (exclui clientes) E filtra por status se especificado
    q = q.or(baseFilter);
    if (filters.status && filters.status !== 'todos') q = q.eq('status', filters.status);
  }

  if (filters.eva_active !== undefined) q = q.eq('eva_active', filters.eva_active);
  if (search) q = q.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);

  // Visibilidade pool+claim: vendedor vê só balcão (claimed_by null) ou os seus.
  if (filters.viewerId && !filters.viewerIsAdmin) {
    q = q.or(`claimed_by.is.null,claimed_by.eq.${filters.viewerId}`);
  }

  // Quando only_alerts, precisa pegar até 500 pra filtrar em JS depois (alerta calculado
  // baseado em updated_at + cadence). Paginacao final acontece em JS no fim da funcao.
  // Sem only_alerts: paginacao SQL nativa via range.
  if (!filters.only_alerts) {
    q = q.range(offset, offset + limit - 1);
  } else {
    q = q.limit(500);
  }

  const { data: leads, error, count: total } = await q;
  if (error) throw new Error(`Failed to list leads: ${error.message}`);
  if (!leads || leads.length === 0) return { rows: [], total: total ?? 0, countByStatus };

  // Cruza com eva_cadence pra saber quem tem toques pendentes
  const ids = leads.map((l) => l.id);
  const { data: cads } = await client
    .from('eva_cadence')
    .select('lead_id')
    .in('lead_id', ids)
    .eq('status', 'pending');
  const pendingSet = new Set((cads ?? []).map((c: any) => c.lead_id));

  const now = Date.now();
  const rows: LeadRow[] = leads.map((l: any) => {
    const has_cadence_pending = pendingSet.has(l.id);
    const updatedAge = now - new Date(l.updated_at).getTime();
    const isSilent = updatedAge > 24 * 60 * 60_000 && ['novo', 'qualificando'].includes(l.status);
    const isNew = updatedAge < 60 * 60_000; // ultima 1h

    let alerta: LeadRow['alerta'] = 'normal';
    if (isSilent && !has_cadence_pending && !l.opt_out) alerta = 'silente_sem_cadencia';
    else if (isSilent && has_cadence_pending) alerta = 'silente_com_cadencia';
    else if (isNew) alerta = 'novo';

    return {
      id: l.id,
      phone: l.phone,
      name: l.name,
      status: l.status,
      acquisition_source: l.acquisition_source,
      eva_active: l.eva_active,
      opt_out: l.opt_out,
      maintenance_client: l.maintenance_client,
      created_at: l.created_at,
      updated_at: l.updated_at,
      has_cadence_pending,
      alerta,
      archived_at: l.archived_at ?? null,
      installation_status: l.installation_status ?? null,
      loss_reason: l.loss_reason ?? null,
      loss_notes: l.loss_notes ?? null,
      lost_at: l.lost_at ?? null,
    };
  });

  let finalRows: LeadRow[];
  let finalTotal: number;
  if (filters.only_alerts) {
    // Filtra alertas em JS (precisa do calculo de updated_at + cadence) e pagina em JS
    const filtered = rows.filter((r) => r.alerta !== 'normal' && r.alerta !== 'novo');
    finalTotal = filtered.length;
    finalRows = filtered.slice(offset, offset + limit);
  } else {
    finalRows = rows;
    finalTotal = total ?? rows.length;
  }

  return { rows: finalRows, total: finalTotal, countByStatus };
}

export async function getLeadDetail(client: SupabaseClient, id: string): Promise<LeadDetail | null> {
  const { data: lead, error } = await client.from('leads').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Failed to load lead: ${error.message}`);
  if (!lead) return null;

  const { data: convo } = await client
    .from('conversations')
    .select('messages')
    .eq('lead_id', id)
    .order('created_at', { ascending: false })
    .limit(1);

  const conversation_messages = convo && convo.length > 0 ? (convo[0].messages ?? []) : [];

  const { data: cads } = await client
    .from('eva_cadence')
    .select('step, scheduled_for, status, sent_at')
    .eq('lead_id', id)
    .order('step', { ascending: true });

  const now = Date.now();
  const updatedAge = now - new Date(lead.updated_at).getTime();
  const isSilent = updatedAge > 24 * 60 * 60_000 && ['novo', 'qualificando'].includes(lead.status);
  const isNew = updatedAge < 60 * 60_000;
  const has_cadence_pending = (cads ?? []).some((c: any) => c.status === 'pending');

  let alerta: LeadRow['alerta'] = 'normal';
  if (isSilent && !has_cadence_pending && !lead.opt_out) alerta = 'silente_sem_cadencia';
  else if (isSilent && has_cadence_pending) alerta = 'silente_com_cadencia';
  else if (isNew) alerta = 'novo';

  // Anexos do lead (inclui midia que o cliente enviou pela Eva: conta, foto, etc.)
  const { data: anexosRaw } = await client
    .from('lead_anexos')
    .select('id, tipo, descricao, storage_path, mime_type, created_by, created_at')
    .eq('lead_id', id)
    .order('created_at', { ascending: false });
  const anexoPaths = (anexosRaw ?? []).map((a: any) => a.storage_path).filter(Boolean);
  const anexoUrls = anexoPaths.length > 0 ? await getSignedUrls(client, anexoPaths, 3600) : {};
  const anexos = (anexosRaw ?? []).map((a: any) => ({
    id: a.id, tipo: a.tipo, descricao: a.descricao,
    url: anexoUrls[a.storage_path] ?? '',
    mime_type: a.mime_type, created_by: a.created_by, created_at: a.created_at,
  }));

  return {
    id: lead.id,
    phone: lead.phone,
    name: lead.name,
    status: lead.status,
    acquisition_source: lead.acquisition_source,
    eva_active: lead.eva_active,
    opt_out: lead.opt_out,
    maintenance_client: lead.maintenance_client,
    created_at: lead.created_at,
    updated_at: lead.updated_at,
    has_cadence_pending,
    alerta,
    archived_at: lead.archived_at ?? null,
    installation_status: lead.installation_status ?? null,
    loss_reason: lead.loss_reason ?? null,
    loss_notes: lead.loss_notes ?? null,
    lost_at: lead.lost_at ?? null,
    city: lead.city,
    neighborhood: lead.neighborhood,
    profile: lead.profile,
    email: lead.email,
    energy_data: lead.energy_data ?? {},
    opportunities: lead.opportunities ?? {},
    conversation_messages,
    cadence_steps: cads ?? [],
    anexos,
  };
}

// Pode o usuário ver este lead? Admin vê tudo; vendedor vê balcão (sem dono) ou os seus.
export function podeVerLead(user: DashUser, lead: { claimed_by: string | null }): boolean {
  if (user.isAdmin) return true;
  return lead.claimed_by === null || lead.claimed_by === user.id;
}

// Claim automático: marca o lead como do usuário se ainda estiver no balcão.
// Retorna true se capturou agora (pra registrar auditoria). Idempotente.
export async function claimLead(
  client: SupabaseClient,
  leadId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await client
    .from('leads')
    .update({ claimed_by: userId, claimed_at: new Date().toISOString() })
    .eq('id', leadId)
    .is('claimed_by', null) // só captura se ainda estiver no balcão (evita corrida)
    .select('id');
  return Array.isArray(data) && data.length > 0;
}
