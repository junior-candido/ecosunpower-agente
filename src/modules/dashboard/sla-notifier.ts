// src/modules/dashboard/sla-notifier.ts
// Eva avisa o Junior no WhatsApp quando uma tarefa de SLA VENCE.
// Anti-spam: 1 aviso por tarefa (grava alert_sent_at). Best-effort: uma tarefa
// que falhar nunca derruba o ciclo nem o scheduler.
import type { SupabaseClient } from '@supabase/supabase-js';
import { concluirTarefa, adiarTarefa } from './tarefas.js';
import { registrarAtividade } from './atividades.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';

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

// ─── Roteamento dos cliques (Task 11) ────────────────────────────────────────

export type SlaAcao = 'cobrar' | 'eufalo' | 'adiar';

/**
 * Faz o parse de um id de botão de SLA. PURA e testável.
 * Reconhece `sla_cobrar:<tid>`, `sla_eufalo:<tid>`, `sla_adiar:<tid>`.
 * Retorna null se o id não for de SLA (ex.: `evabt:...`).
 */
export function parseSlaButton(buttonId: string): { acao: SlaAcao; tid: string } | null {
  const [prefixo, ...resto] = buttonId.trim().split(':');
  const tid = resto.join(':'); // defensivo se o id tiver ':'
  if (!tid) return null;
  switch (prefixo) {
    case 'sla_cobrar': return { acao: 'cobrar', tid };
    case 'sla_eufalo': return { acao: 'eufalo', tid };
    case 'sla_adiar':  return { acao: 'adiar', tid };
    default: return null;
  }
}

/**
 * Trata os cliques dos botões do aviso de SLA. Best-effort: cada ação em
 * try/catch e SEMPRE responde algo pro Junior. Retorna true se tratou o id
 * (mesmo em erro), false se o id não é `sla_*` (caller segue roteando).
 */
export async function handleSlaButton(
  client: SupabaseClient,
  buttonId: string,
  sendReply: (texto: string) => Promise<void>,
): Promise<boolean> {
  const parsed = parseSlaButton(buttonId);
  if (!parsed) return false;
  const { acao, tid } = parsed;

  try {
    // Busca lead_id/company_id da tarefa pra registrar a atividade na timeline.
    const { data: tar } = await client.from('lead_tarefas')
      .select('lead_id, company_id').eq('id', tid).maybeSingle();
    const leadId = (tar as { lead_id?: string } | null)?.lead_id ?? null;
    const companyId = (tar as { company_id?: string } | null)?.company_id ?? ECOSUN;

    const reg = async (
      tipo: 'nota' | 'tarefa_concluida',
      titulo: string,
    ): Promise<void> => {
      if (!leadId) return;
      await registrarAtividade(client, {
        company_id: companyId,
        lead_id: leadId,
        tipo,
        titulo,
        automatica: true,
      });
    };

    if (acao === 'adiar') {
      await adiarTarefa(client, tid, 2);
      await reg('nota', 'Tarefa adiada 2 dias (SLA)');
      await sendReply('⏳ Adiado 2 dias.');
      return true;
    }

    if (acao === 'eufalo') {
      // Junior assume. Sem um mapeamento simples telefone→user, o mínimo seguro
      // é garantir alert_sent_at preenchido pra não re-alertar dessa tarefa.
      await client.from('lead_tarefas')
        .update({ alert_sent_at: new Date().toISOString() })
        .eq('id', tid).is('alert_sent_at', null);
      await reg('nota', 'Junior vai falar (SLA)');
      await sendReply('👍 Beleza, você assume. Não te aviso mais dessa.');
      return true;
    }

    // acao === 'cobrar' — ação conservadora: NÃO manda mensagem automática pro
    // cliente (sensível). Só marca a tarefa como feita.
    // TODO Fase 2+: opção de disparar a cobrança automática pro cliente (reusar cadência)
    await concluirTarefa(client, tid);
    await reg('tarefa_concluida', 'Cobrança marcada como feita (SLA)');
    await sendReply('✅ Marquei como feito. (Se quiser que eu mande a cobrança pro cliente automaticamente, a gente liga isso depois.)');
    return true;
  } catch (e) {
    console.warn('[sla-notifier] botão', buttonId, 'falhou:', (e as Error).message);
    try { await sendReply('⚠️ Deu erro ao processar. Tenta de novo ou faz pelo dashboard.'); } catch { /* noop */ }
    return true;
  }
}
