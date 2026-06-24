// src/modules/dashboard/sla-notifier.ts
// Eva avisa o Junior no WhatsApp quando uma tarefa de SLA VENCE.
// Anti-spam: 1 aviso por tarefa (grava alert_sent_at). Best-effort: uma tarefa
// que falhar nunca derruba o ciclo nem o scheduler.
import type { SupabaseClient } from '@supabase/supabase-js';

export interface AvisoBotao {
  id: string;
  title: string;
}
export interface Aviso {
  texto: string;
  botoes: AvisoBotao[];
}

/**
 * Monta o aviso de SLA vencido (texto + 3 botões). PURA e testável.
 * ids no formato sla_<acao>:<tarefaId> (a Task 11 trata os cliques).
 */
export function montarAvisoSla(leadNome: string, tarefa: { id: string; titulo: string }): Aviso {
  return {
    texto: `⏰ *${leadNome}* está com uma tarefa vencida: "${tarefa.titulo}". O que fazer?`,
    botoes: [
      { id: `sla_cobrar:${tarefa.id}`, title: 'Cobrar agora' },
      { id: `sla_eufalo:${tarefa.id}`, title: 'Eu falo' },
      { id: `sla_adiar:${tarefa.id}`, title: 'Adiar 2 dias' },
    ],
  };
}

/**
 * Varre tarefas pendentes, vencidas e ainda não avisadas (alert_sent_at null),
 * dispara o aviso via `enviar` (injetada) e marca alert_sent_at pra não repetir.
 * Best-effort: cada tarefa tem try/catch próprio. Retorna quantos avisos saíram.
 */
export async function notificarSlaVencidos(
  client: SupabaseClient,
  enviar: (aviso: Aviso) => Promise<void>,
  agora: number = Date.now(),
): Promise<number> {
  const nowIso = new Date(agora).toISOString();
  // tarefas pendentes, vencidas e ainda não avisadas
  const { data } = await client.from('lead_tarefas')
    .select('id, lead_id, titulo, due_at, alert_sent_at, status')
    .eq('status', 'pendente').is('alert_sent_at', null).lt('due_at', nowIso)
    .limit(50);
  const tarefas = (data ?? []) as Array<{ id: string; lead_id: string; titulo: string }>;
  let enviados = 0;
  for (const t of tarefas) {
    try {
      const { data: lead } = await client.from('leads').select('name').eq('id', t.lead_id).maybeSingle();
      const nome = (lead as { name?: string | null } | null)?.name ?? 'Lead';
      await enviar(montarAvisoSla(nome, t));
      await client.from('lead_tarefas').update({ alert_sent_at: nowIso }).eq('id', t.id);
      enviados++;
    } catch (e) {
      console.warn('[sla-notifier] tarefa', t.id, 'falhou:', (e as Error).message);
    }
  }
  return enviados;
}
