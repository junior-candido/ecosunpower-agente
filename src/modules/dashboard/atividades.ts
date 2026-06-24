// src/modules/dashboard/atividades.ts
// Timeline do lead: registra eventos (automáticos ou manuais) e lê a linha do tempo.
import type { SupabaseClient } from '@supabase/supabase-js';

export type AtividadeTipo =
  | 'contato' | 'whatsapp' | 'ligacao' | 'email' | 'visita'
  | 'proposta_enviada' | 'proposta_aberta' | 'etapa_mudou'
  | 'cadencia' | 'tarefa_criada' | 'tarefa_concluida' | 'nota' | 'ganho' | 'perdido';

export interface AtividadeInput {
  company_id: string;
  lead_id: string;
  tipo: AtividadeTipo;
  titulo: string;
  descricao?: string;
  automatica?: boolean;
  user_id?: string | null;
  payload?: Record<string, unknown>;
}

export interface Atividade extends AtividadeInput { id: string; created_at: string; }

// Dois eventos automáticos do mesmo tipo/lead dentro da janela (ms) = duplicado.
export function mesmoEvento(a: AtividadeInput, b: AtividadeInput, janelaMs: number, deltaMs: number): boolean {
  return a.lead_id === b.lead_id && a.tipo === b.tipo && deltaMs <= janelaMs;
}

export async function registrarAtividade(client: SupabaseClient, input: AtividadeInput): Promise<void> {
  // Dedupe: pra tipos automáticos voláteis (proposta_aberta, cadencia), evita repetir na mesma hora.
  if (input.automatica !== false && (input.tipo === 'proposta_aberta' || input.tipo === 'cadencia')) {
    const desde = new Date(Date.now() - 60 * 60_000).toISOString();
    const { data } = await client.from('lead_atividades')
      .select('id').eq('lead_id', input.lead_id).eq('tipo', input.tipo)
      .gte('created_at', desde).limit(1);
    if (Array.isArray(data) && data.length > 0) return;
  }
  await client.from('lead_atividades').insert({
    company_id: input.company_id, lead_id: input.lead_id, tipo: input.tipo,
    titulo: input.titulo, descricao: input.descricao ?? null,
    automatica: input.automatica ?? true, user_id: input.user_id ?? null,
    payload: input.payload ?? null,
  });
}

export async function listarTimeline(client: SupabaseClient, leadId: string, limite = 50): Promise<Atividade[]> {
  const { data } = await client.from('lead_atividades')
    .select('*').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(limite);
  return (data ?? []) as Atividade[];
}
