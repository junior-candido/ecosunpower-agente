// eva-alerts.ts
// Alertas URGENTES Eva -> WhatsApp do Junior (nao esperam digest 3x/dia).
// Disparados em tempo real quando evento critico acontece:
//   - cadence_replied: cliente respondeu apos toque frio (sinal QUENTE)
//   - new_lead_campaign: lead novo veio de campanha paga
//   - status_agendado: lead quer visita agendada
//   - eva_error: erro tecnico critico (timeout API, etc)
//
// Cada alerta eh idempotente: usa app_flags pra nao duplicar (importante
// pra new_lead — se Eva for chamada 2x pelo mesmo webhook Meta, alerta
// dispara so 1x).

import type { SupabaseClient } from '@supabase/supabase-js';

type AlertKind =
  | 'cadence_replied'
  | 'new_lead_campaign'
  | 'status_agendado'
  | 'eva_error';

interface AlertContext {
  client: SupabaseClient;
  engineerPhone: string;
  sendText: (to: string, text: string) => Promise<void>;
}

function formatPhoneShort(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 11) return phone;
  const ddd = digits.slice(-11, -9);
  const meio = digits.slice(-9, -4);
  const fim = digits.slice(-4);
  return `(${ddd}) ${meio}-${fim}`;
}

/**
 * Lock idempotente via app_flags. Retorna true se conseguiu o lock
 * (primeira vez), false se ja foi disparado pra essa chave.
 */
async function acquireAlertLock(client: SupabaseClient, key: string): Promise<boolean> {
  try {
    const { error } = await client.from('app_flags').insert({ key, value: 'fired' });
    if (error) {
      // Erro de duplicate key = ja foi disparado. Qualquer outro erro = nao bloqueia.
      const msg = error.message?.toLowerCase() ?? '';
      if (msg.includes('duplicate') || msg.includes('unique')) return false;
      console.warn(`[alerts] acquireAlertLock unexpected error for key=${key}:`, error.message);
      // Em erro inesperado, prefere disparar (nao bloquear alerta importante).
      return true;
    }
    return true;
  } catch (err) {
    console.warn(`[alerts] acquireAlertLock exception:`, (err as Error).message);
    return true;
  }
}

/**
 * 🔥 ALERTA: Cliente respondeu apos cadencia fria (sinal QUENTE).
 * Dispara quando cancelCadence detecta resposta do cliente.
 */
export async function alertCadenceReplied(
  ctx: AlertContext,
  leadId: string,
  leadName: string | null,
  leadPhone: string,
  cancelledCount: number,
): Promise<void> {
  const lockKey = `alert_cad_replied_${leadId}_${new Date().toISOString().slice(0, 10)}`;
  if (!(await acquireAlertLock(ctx.client, lockKey))) return;

  const text = [
    `🔥 *Cadência respondida*`,
    ``,
    `${leadName ?? 'Lead sem nome'} (${formatPhoneShort(leadPhone)}) voltou a responder após ${cancelledCount} toque(s) frio(s).`,
    ``,
    `Sinal quente — Eva ja esta conversando normalmente. Vale acompanhar de perto.`,
  ].join('\n');

  try {
    await ctx.sendText(ctx.engineerPhone, text);
    console.log(`[alerts] cadence_replied disparado pra lead ${leadId}`);
  } catch (err) {
    console.warn(`[alerts] falha ao enviar cadence_replied:`, (err as Error).message);
  }
}

/**
 * 🆕 ALERTA: Lead novo via campanha paga (Meta Ads). Dispara apenas se
 * acquisition_source ou origin indicar campanha — leads organicos NAO
 * disparam pra nao poluir.
 */
export async function alertNewLeadFromCampaign(
  ctx: AlertContext,
  leadId: string,
  leadName: string | null,
  leadPhone: string,
  source: string | null,
): Promise<void> {
  if (!source) return;
  const lowerSource = source.toLowerCase();
  const isFromCampaign =
    lowerSource.includes('campanha') ||
    lowerSource.includes('meta_ads') ||
    lowerSource.includes('meta_lead_ads') ||
    lowerSource.includes('referral');
  if (!isFromCampaign) return;

  const lockKey = `alert_new_camp_${leadId}`;
  if (!(await acquireAlertLock(ctx.client, lockKey))) return;

  const text = [
    `🆕 *Novo lead via campanha*`,
    ``,
    `${leadName ?? 'Sem nome ainda'} — ${formatPhoneShort(leadPhone)}`,
    `Origem: ${source}`,
    ``,
    `Eva ja respondeu — acompanhe pelo digest ou /dashboard/leads.`,
  ].join('\n');

  try {
    await ctx.sendText(ctx.engineerPhone, text);
    console.log(`[alerts] new_lead_campaign disparado pra lead ${leadId} (${source})`);
  } catch (err) {
    console.warn(`[alerts] falha ao enviar new_lead_campaign:`, (err as Error).message);
  }
}

/**
 * 📅 ALERTA: Lead virou status=agendado (cliente quer visita).
 */
export async function alertStatusAgendado(
  ctx: AlertContext,
  leadId: string,
  leadName: string | null,
  leadPhone: string,
): Promise<void> {
  const lockKey = `alert_agendado_${leadId}_${new Date().toISOString().slice(0, 10)}`;
  if (!(await acquireAlertLock(ctx.client, lockKey))) return;

  const text = [
    `📅 *Lead agendou visita*`,
    ``,
    `${leadName ?? 'Sem nome'} — ${formatPhoneShort(leadPhone)}`,
    ``,
    `Confirme logistica e equipamento de medicao.`,
  ].join('\n');

  try {
    await ctx.sendText(ctx.engineerPhone, text);
    console.log(`[alerts] status_agendado disparado pra lead ${leadId}`);
  } catch (err) {
    console.warn(`[alerts] falha ao enviar status_agendado:`, (err as Error).message);
  }
}

/**
 * ❌ ALERTA: Erro tecnico critico da Eva (timeout API, exception nao tratada).
 * Throttled: max 1 por hora pra mesma kind+phone, evita flood.
 */
export async function alertEvaError(
  ctx: AlertContext,
  errorKind: string,
  leadPhone: string | null,
  message: string,
): Promise<void> {
  // Throttle: 1 por hora por (kind, phone). Lock key inclui hora atual.
  const hourKey = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
  const lockKey = `alert_err_${errorKind}_${leadPhone ?? 'noPhone'}_${hourKey}`;
  if (!(await acquireAlertLock(ctx.client, lockKey))) return;

  const text = [
    `❌ *Erro Eva*`,
    ``,
    `Tipo: ${errorKind}`,
    leadPhone ? `Lead: ${formatPhoneShort(leadPhone)}` : `(sem lead associado)`,
    ``,
    `Detalhes: ${message.slice(0, 300)}`,
  ].join('\n');

  try {
    await ctx.sendText(ctx.engineerPhone, text);
    console.log(`[alerts] eva_error disparado: ${errorKind}`);
  } catch (err) {
    console.warn(`[alerts] falha ao enviar eva_error:`, (err as Error).message);
  }
}

export type { AlertKind, AlertContext };
