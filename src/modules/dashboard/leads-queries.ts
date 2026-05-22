// leads-queries.ts
// Queries para a pagina /dashboard/leads (lista + detalhe).

import type { SupabaseClient } from '@supabase/supabase-js';

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
}

export interface LeadsResult {
  rows: LeadRow[];
  total: number;
  countByStatus: Record<string, number>;
}

const STATUS_OPTIONS = ['novo', 'qualificando', 'qualificado', 'agendado', 'transferido', 'perdido'];

export async function listLeads(
  client: SupabaseClient,
  filters: ListLeadsOptions = {},
): Promise<LeadsResult> {
  const search = filters.search?.trim() ?? '';
  const limit = Math.max(1, Math.min(200, filters.limit ?? 50));
  const offset = Math.max(0, filters.offset ?? 0);

  // Contagens por status (sempre todas, pra mostrar nas tabs)
  const baseFilter = `installation_status.is.null,installation_status.not.in.(${CLIENTE_STATUSES.join(',')})`;
  const countByStatus: Record<string, number> = {};
  const countQueries = await Promise.all(
    STATUS_OPTIONS.map((s) =>
      client.from('leads')
        .select('id', { count: 'exact', head: true })
        .or(baseFilter)
        .is('archived_at', null)
        .eq('status', s),
    ),
  );
  STATUS_OPTIONS.forEach((s, i) => {
    countByStatus[s] = countQueries[i].count ?? 0;
  });
  countByStatus.todos = Object.values(countByStatus).reduce((a, b) => a + b, 0);

  let q = client
    .from('leads')
    .select(
      'id, phone, name, status, acquisition_source, eva_active, opt_out, maintenance_client, created_at, updated_at, installation_status, archived_at',
      { count: 'exact' },
    )
    .or(baseFilter)
    .is('archived_at', null)
    .order('updated_at', { ascending: false });

  if (filters.status && filters.status !== 'todos') q = q.eq('status', filters.status);
  if (filters.eva_active !== undefined) q = q.eq('eva_active', filters.eva_active);
  if (search) q = q.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);

  // Quando only_alerts, precisa pegar TODOS (até 200) pra filtrar em JS — não dá range.
  // Sem only_alerts, faz paginação real.
  if (!filters.only_alerts) {
    q = q.range(offset, offset + limit - 1);
  } else {
    q = q.limit(200);
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
    };
  });

  const finalRows = filters.only_alerts
    ? rows.filter((r) => r.alerta !== 'normal' && r.alerta !== 'novo')
    : rows;

  return { rows: finalRows, total: total ?? finalRows.length, countByStatus };
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
    city: lead.city,
    neighborhood: lead.neighborhood,
    profile: lead.profile,
    email: lead.email,
    energy_data: lead.energy_data ?? {},
    opportunities: lead.opportunities ?? {},
    conversation_messages,
    cadence_steps: cads ?? [],
  };
}
