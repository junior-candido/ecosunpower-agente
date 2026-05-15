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
import { sendAdminWithButtons, type MetaWabaLike } from './eva-admin-buttons.js';
import { formatPhoneBR } from './meta-leadgen.js';

type AlertKind =
  | 'cadence_replied'
  | 'new_lead_campaign'
  | 'status_agendado'
  | 'eva_error';

interface AlertContext {
  client: SupabaseClient;
  engineerPhone: string;
  sendText: (to: string, text: string) => Promise<void>;
  metaWaba?: MetaWabaLike | null;
}

function formatPhoneShort(phone: string): string {
  // Normaliza (wa_id BR vem sem o 9o digito) antes de formatar. Ver formatPhoneBR.
  return formatPhoneBR(phone);
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
    await sendAdminWithButtons(
      { metaWaba: ctx.metaWaba ?? null, sendText: ctx.sendText },
      ctx.engineerPhone,
      text,
      [
        { id: `evabt:lead-view:${leadId}`, title: '👤 Ver perfil' },
        { id: `evabt:lead-pause:${leadId}`, title: '✋ Assumir' },
      ],
    );
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
    await sendAdminWithButtons(
      { metaWaba: ctx.metaWaba ?? null, sendText: ctx.sendText },
      ctx.engineerPhone,
      text,
      [
        { id: `evabt:lead-view:${leadId}`, title: '👤 Ver perfil' },
        { id: `evabt:lead-pause:${leadId}`, title: '✋ Pausar Eva' },
        { id: `evabt:lead-optout:${leadId}`, title: '🚫 Marcar lixo' },
      ],
    );
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
    await sendAdminWithButtons(
      { metaWaba: ctx.metaWaba ?? null, sendText: ctx.sendText },
      ctx.engineerPhone,
      text,
      [
        { id: `evabt:lead-view:${leadId}`, title: '👤 Ver perfil' },
        { id: `evabt:lead-cad-cancel:${leadId}`, title: '✋ Cancelar cadência' },
      ],
    );
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

// ──────────────────────────────────────────────────────────────────────────
// Rede de proteção: lead quente pelos DADOS, independente da Eva fechar.
// Criterio minimo oficial Ecosunpower: conta >= R$700 OU consumo >= 700 kWh.
// Resolve o caso em que a Eva coleta tudo mas nunca emite
// qualification_complete (ex: travou pedindo CPF) e Junior fica cego.
// ──────────────────────────────────────────────────────────────────────────
const HOT_BILL_BRL = 700;
const HOT_KWH = 700;

function toNum(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

export function isHotLeadByEnergy(energyData: unknown): boolean {
  if (!energyData || typeof energyData !== 'object') return false;
  const e = energyData as Record<string, unknown>;
  const bill = toNum(e.monthly_bill);
  const kwh = toNum(e.consumption_kwh);
  return (Number.isFinite(bill) && bill >= HOT_BILL_BRL)
    || (Number.isFinite(kwh) && kwh >= HOT_KWH);
}

// Temperatura por R$ OU kWh. NAO pode olhar so bill: lead de 6000 kWh sem
// conta em R$ informada e uma baleia, nao 🔵 FRIO (bug real visto em prod).
export function hotLeadTier(
  bill: number | null | undefined,
  kwh?: number | null | undefined,
): string {
  const b = typeof bill === 'number' && Number.isFinite(bill) ? bill : 0;
  const k = typeof kwh === 'number' && Number.isFinite(kwh) ? kwh : 0;
  if (b >= 1500 || k >= 1500) return '🔥 QUENTE';
  if (b >= 700 || k >= 700) return '🟠 MORNO';
  return '🔵 FRIO';
}

interface HotLead {
  id: string;
  name: string | null;
  phone: string;
  energy_data?: unknown;
}

/**
 * 🔥 ALERTA (rede de proteção): lead qualificado pelos DADOS mas que a Eva
 * ainda nao fechou (nao emitiu qualification_complete). Idempotente 1x/lead
 * via lock COMPARTILHADO entre o gatilho imediato (update_lead) e a varredura
 * — Junior nunca recebe o mesmo lead 2x. Retorna true se realmente alertou.
 */
export async function alertHotLeadBackstop(
  ctx: AlertContext,
  lead: HotLead,
  mode: 'fresh' | 'stalled',
  stalledMinutes?: number,
): Promise<boolean> {
  if (!isHotLeadByEnergy(lead.energy_data)) return false;

  const lockKey = `alert_hotlead_${lead.id}`;
  if (!(await acquireAlertLock(ctx.client, lockKey))) return false;

  const e = (lead.energy_data ?? {}) as Record<string, unknown>;
  const bill = toNum(e.monthly_bill);
  const kwh = toNum(e.consumption_kwh);
  const tier = hotLeadTier(
    Number.isFinite(bill) ? bill : null,
    Number.isFinite(kwh) ? kwh : null,
  );
  const dados = [
    // So mostra R$ se houver valor real (>0) — evita "conta ~R$ 0" feio.
    Number.isFinite(bill) && bill > 0 ? `conta ~R$ ${Math.round(bill)}` : null,
    Number.isFinite(kwh) && kwh > 0 ? `${Math.round(kwh)} kWh/mes` : null,
  ].filter(Boolean).join(' · ') || 'consumo informado';

  const nome = lead.name ?? 'Lead sem nome';
  const tel = formatPhoneShort(lead.phone);
  const text = mode === 'stalled'
    ? [
        `🟠 *Lead quente PARADO* ${tier}`,
        ``,
        `${nome} — ${tel} — ${dados}`,
        ``,
        `Passou do criterio minimo mas a Eva nao fechou e parou ha ${stalledMinutes ?? '?'}+ min. Vale resgatar voce mesmo.`,
      ].join('\n')
    : [
        `🔥 *Lead quente — Eva ainda nao fechou* ${tier}`,
        ``,
        `${nome} — ${tel} — ${dados}`,
        ``,
        `Ja passou do criterio minimo. Eva esta conversando — voce pode assumir se quiser.`,
      ].join('\n');

  try {
    await sendAdminWithButtons(
      { metaWaba: ctx.metaWaba ?? null, sendText: ctx.sendText },
      ctx.engineerPhone,
      text,
      [
        { id: `evabt:lead-view:${lead.id}`, title: '👤 Ver perfil' },
        { id: `evabt:lead-pause:${lead.id}`, title: '✋ Assumir' },
      ],
    );
    console.log(`[alerts] hot_lead_backstop (${mode}) disparado pra lead ${lead.id}`);
    return true;
  } catch (err) {
    console.warn(`[alerts] falha ao enviar hot_lead_backstop:`, (err as Error).message);
    return false;
  }
}

/**
 * Varredura periodica (1x/h): pega o BACKLOG de leads quentes pelos dados,
 * presos em status 'qualificando', que a Eva nao fechou e estao parados ha
 * > staleMinutes. Idempotente pelo mesmo lock de alertHotLeadBackstop, entao
 * roda quantas vezes quiser sem spammar. Independente da Eva.
 */
export async function sweepStuckHotLeads(
  ctx: AlertContext,
  opts?: { staleMinutes?: number },
): Promise<number> {
  const staleMinutes = opts?.staleMinutes ?? 45;
  const cutoff = new Date(Date.now() - staleMinutes * 60 * 1000).toISOString();

  const LIMIT = 200;
  const { data, error } = await ctx.client
    .from('leads')
    .select('id, name, phone, energy_data, opt_out, updated_at')
    .eq('status', 'qualificando')
    .not('opt_out', 'is', true) // exclui opt_out=true (mantem null/false)
    .lt('updated_at', cutoff)
    .limit(LIMIT);

  if (error) {
    console.warn('[alerts] sweepStuckHotLeads query erro:', error.message);
    return 0;
  }
  if (!data || data.length === 0) return 0;
  if (data.length === LIMIT) {
    console.warn(`[alerts] sweepStuckHotLeads: teto de ${LIMIT} atingido — backlog grande, surplus pega na proxima rodada (1h)`);
  }

  let fired = 0;
  for (const row of data) {
    const r = row as Record<string, unknown>;
    if (r.opt_out === true) continue;
    if (!isHotLeadByEnergy(r.energy_data)) continue;
    const ok = await alertHotLeadBackstop(
      ctx,
      {
        id: String(r.id),
        name: (r.name as string | null) ?? null,
        phone: String(r.phone ?? ''),
        energy_data: r.energy_data,
      },
      'stalled',
      staleMinutes,
    );
    if (ok) fired++;
  }
  if (fired > 0) {
    console.log(`[alerts] sweepStuckHotLeads: ${fired} lead(s) quente(s) parado(s) alertado(s)`);
  }
  return fired;
}

export type { AlertKind, AlertContext };
