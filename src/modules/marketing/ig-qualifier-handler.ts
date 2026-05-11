import type { SupabaseClient } from '@supabase/supabase-js';
import type { InstagramDirectService } from '../messaging/instagram-direct.js';
import { nextStep, type QualifyState } from './ig-qualifier-brain.js';

/**
 * Handler de mensagens IG DM. Carrega/cria thread em dm_threads, persiste mensagens
 * em dm_messages, roda a state machine do brain e envia resposta via IG Direct API.
 *
 * Em estados terminais (qualified_handed_off, escalated_human) dispara alerta no
 * WhatsApp do Junior pra ele assumir o lead.
 */
export async function handleIgMessage(params: {
  supabase: SupabaseClient;
  igDirect: InstagramDirectService;
  senderId: string;
  text: string;
  sendZapAlert: (msg: string) => Promise<void>;
}): Promise<void> {
  const { supabase, igDirect, senderId, text, sendZapAlert } = params;

  // Carrega thread ATIVA do user (se existir).
  let { data: thread } = await supabase
    .from('dm_threads')
    .select('*')
    .eq('ig_user_id', senderId)
    .eq('status', 'active')
    .maybeSingle();

  // Se nao existir, cria. ig_thread_id eh UNIQUE no schema entao usamos
  // <ig_user_id>:<timestamp> pra permitir multiplas threads (1 ativa por vez,
  // antigas viram disqualified/handed_off/escalated).
  if (!thread) {
    const { data: newThread, error } = await supabase
      .from('dm_threads')
      .insert({
        ig_user_id: senderId,
        ig_thread_id: `${senderId}:${Date.now()}`,
        status: 'active',
      })
      .select('*')
      .single();
    if (error) throw error;
    thread = newThread;
  }

  // Persist mensagem inbound.
  await supabase.from('dm_messages').insert({
    thread_id: thread.id,
    direction: 'inbound',
    content: text,
  });

  // Carrega state da conversa (default: start).
  const state: QualifyState =
    (thread.qualified_data && (thread.qualified_data as { state?: QualifyState }).state) ??
    { step: 'start', data: {} };

  // Se primeiro contato (state=start), processa primeiro com input vazio (gera
  // saudacao) e depois reentra com o input real pra avancar pro await_tipo.
  const isFirstContact = state.step === 'start';
  const result = nextStep(state, isFirstContact ? '' : text);

  // Envia resposta.
  if (result.quickReplies && result.quickReplies.length > 0) {
    await igDirect.sendQuickReplies(senderId, result.message, result.quickReplies);
  } else {
    await igDirect.sendText(senderId, result.message);
  }

  // Persist mensagem outbound.
  await supabase.from('dm_messages').insert({
    thread_id: thread.id,
    direction: 'outbound',
    content: result.message,
    buttons: result.quickReplies ?? null,
  });

  // Atualiza thread (status + qualified_data).
  const newStatus =
    result.next.step === 'handed_off' ? 'qualified_handed_off' :
    result.next.step === 'disqualified' ? 'disqualified' :
    result.next.step === 'escalated_human' ? 'escalated_human' : 'active';

  const isTerminal = ['qualified_handed_off', 'disqualified', 'escalated_human'].includes(newStatus);

  await supabase
    .from('dm_threads')
    .update({
      status: newStatus,
      qualified_data: { state: result.next, ...result.next.data },
      ended_at: isTerminal ? new Date().toISOString() : null,
    })
    .eq('id', thread.id);

  // Se primeiro contato, re-entra com o texto real pra avancar a conversa
  // (state agora ja eh await_tipo, entao a recursao processa o input real).
  if (isFirstContact && text.length > 0) {
    return handleIgMessage(params);
  }

  // Alerta Junior em estados terminais relevantes.
  if (newStatus === 'escalated_human') {
    await sendZapAlert(
      `🚨 Lead IG pediu humano. Thread #${thread.id}, IG user ${senderId}\nTexto: "${text}"\nResponda direto pelo Inbox do Instagram.`,
    );
  }
  if (newStatus === 'qualified_handed_off') {
    await sendZapAlert(
      `✅ Lead IG qualificado! Tipo: ${result.next.data.tipo}, Cidade: ${result.next.data.cidade}, Faixa: ${result.next.data.faixa_conta}\nLink wa.me enviado pra ele clicar.`,
    );
  }
}
