// src/modules/dashboard/tarefas.ts
// CRUD de tarefas de lead + sincronização idempotente de tarefas de SLA.
import type { SupabaseClient } from '@supabase/supabase-js';
import { regrasSlaParaLead, type RegraSla } from './sla-rules.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface Tarefa {
  id: string;
  lead_id: string;
  titulo: string;
  tipo: string;
  due_at: string | null;
  prioridade: string;
  status: string;
  automatica: boolean;
  etapa_origem: string | null;
  assigned_to: string | null;
  completed_at: string | null;
  alert_sent_at: string | null;
  created_at: string;
}

export interface TarefaExistente {
  tipo: string;
  etapa_origem: string | null;
  status: string;
}

export interface CriarTarefaInput {
  company_id?: string;
  lead_id: string;
  titulo: string;
  tipo?: string;
  due_at?: string | null;
  prioridade?: string;
  automatica?: boolean;
  etapa_origem?: string | null;
  assigned_to?: string | null;
  created_by?: string | null;
}

// ─── Lógica pura ─────────────────────────────────────────────────────────────

/**
 * Das regras fornecidas, retorna apenas as que NÃO têm uma tarefa
 * pendente do mesmo (tipo, etapa_origem) entre as existentes.
 * Garante idempotência sem acessar o banco.
 */
export function tarefasFaltantes(
  regras: RegraSla[],
  existentes: TarefaExistente[],
  etapa: string,
): RegraSla[] {
  const pendentes = new Set(
    existentes
      .filter(t => t.status === 'pendente')
      .map(t => `${t.tipo}::${t.etapa_origem ?? ''}`),
  );
  return regras.filter(r => !pendentes.has(`${r.tipo}::${etapa}`));
}

// ─── Camada de dados (Supabase) ───────────────────────────────────────────────

/** Cria uma tarefa. Em conflito de UNIQUE parcial (tarefa automática duplicada) ignora silenciosamente. */
export async function criarTarefa(client: SupabaseClient, input: CriarTarefaInput): Promise<void> {
  try {
    const { error } = await client.from('lead_tarefas').insert({
      company_id: input.company_id ?? ECOSUN,
      lead_id: input.lead_id,
      titulo: input.titulo,
      tipo: input.tipo ?? 'custom',
      due_at: input.due_at ?? null,
      prioridade: input.prioridade ?? 'media',
      status: 'pendente',
      automatica: input.automatica ?? false,
      etapa_origem: input.etapa_origem ?? null,
      assigned_to: input.assigned_to ?? null,
      created_by: input.created_by ?? null,
    });
    // Conflito de UNIQUE parcial (code 23505) → ignora; outros erros relança.
    if (error && error.code !== '23505') throw error;
  } catch (err: unknown) {
    // Se o erro já for o 23505 vindo como exceção, também ignora.
    const pg = err as { code?: string };
    if (pg?.code === '23505') return;
    throw err;
  }
}

/** Lista todas as tarefas pendentes de um lead, ordenadas por due_at asc. */
export async function tarefasPendentes(client: SupabaseClient, leadId: string): Promise<Tarefa[]> {
  const { data } = await client
    .from('lead_tarefas')
    .select('*')
    .eq('lead_id', leadId)
    .eq('status', 'pendente')
    .order('due_at', { ascending: true });
  return (data ?? []) as Tarefa[];
}

/** Retorna a primeira tarefa pendente por due_at, ou null se não houver. */
export async function proximaTarefa(client: SupabaseClient, leadId: string): Promise<Tarefa | null> {
  const { data } = await client
    .from('lead_tarefas')
    .select('*')
    .eq('lead_id', leadId)
    .eq('status', 'pendente')
    .order('due_at', { ascending: true })
    .limit(1);
  return (data && data.length > 0) ? (data[0] as Tarefa) : null;
}

/** Marca uma tarefa como concluída. */
export async function concluirTarefa(
  client: SupabaseClient,
  id: string,
  userId?: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await client
    .from('lead_tarefas')
    .update({ status: 'concluida', completed_at: now, updated_at: now, ...(userId !== undefined ? { assigned_to: userId } : {}) })
    .eq('id', id);
  if (error) throw error;
}

/** Marca uma tarefa como cancelada. */
export async function cancelarTarefa(client: SupabaseClient, id: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await client
    .from('lead_tarefas')
    .update({ status: 'cancelada', updated_at: now })
    .eq('id', id);
  if (error) throw error;
}

/** Adia uma tarefa somando `dias` ao due_at atual e zerando alert_sent_at. */
export async function adiarTarefa(client: SupabaseClient, id: string, dias: number): Promise<void> {
  // Lê due_at atual
  const { data, error: errLer } = await client
    .from('lead_tarefas')
    .select('due_at')
    .eq('id', id)
    .single();
  if (errLer) throw errLer;

  const base = data?.due_at ? Date.parse(data.due_at) : Date.now();
  const novoDueAt = new Date(base + dias * 24 * 3_600_000).toISOString();
  const now = new Date().toISOString();

  const { error } = await client
    .from('lead_tarefas')
    .update({ due_at: novoDueAt, alert_sent_at: null, updated_at: now })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Lê as tarefas existentes do lead, calcula quais SLA rules se aplicam agora,
 * e cria apenas as que ainda não existem como pendentes (idempotente).
 * Retorna quantas tarefas foram criadas.
 */
export async function sincronizarTarefasSla(
  client: SupabaseClient,
  lead: {
    id: string;
    company_id?: string | null;
    status: string;
    last_contact_at: string | null;
    agendado_para?: string | null;
    claimed_by?: string | null;
  },
  agora: number = Date.now(),
): Promise<number> {
  // 1. Ler tarefas existentes (tipo, etapa_origem, status)
  const { data } = await client
    .from('lead_tarefas')
    .select('tipo, etapa_origem, status')
    .eq('lead_id', lead.id);
  const existentes: TarefaExistente[] = (data ?? []) as TarefaExistente[];

  // 2. Calcular regras de SLA para o estado atual do lead
  const regras = regrasSlaParaLead(
    { status: lead.status, last_contact_at: lead.last_contact_at, agendado_para: lead.agendado_para ?? null },
    agora,
  );

  // 3. Filtrar apenas as que faltam criar
  const faltantes = tarefasFaltantes(regras, existentes, lead.status);

  // 4. Criar cada uma
  for (const r of faltantes) {
    await criarTarefa(client, {
      company_id: lead.company_id ?? ECOSUN,
      lead_id: lead.id,
      titulo: r.titulo,
      tipo: r.tipo,
      due_at: r.due_at,
      prioridade: r.prioridade,
      automatica: true,
      etapa_origem: lead.status,
      assigned_to: lead.claimed_by ?? null,
    });
  }

  return faltantes.length;
}
