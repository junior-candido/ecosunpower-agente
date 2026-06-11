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
import { empresa } from './empresa-config.js';

type AlertKind =
  | 'cadence_replied'
  | 'new_lead_campaign'
  | 'new_lead_google_ads'
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
 * 🎯 ALERTA: Lead novo vindo do GOOGLE ADS Search (canal=google).
 * Texto rico parseando cidade/conta da mensagem inicial (landing /cotacao
 * pré-preenche `📍 Cidade:` e `⚡ Conta de luz:` no wa.me). Inclui botões
 * pra Junior assumir conversa rapidinho se for lead quente.
 *
 * Dispara só na PRIMEIRA mensagem do lead, idempotente via app_flags.
 */
export async function alertNewLeadGoogleAds(
  ctx: AlertContext,
  leadId: string,
  leadName: string | null,
  leadPhone: string,
  firstMessageText: string,
  utmCampaign: string | null,
): Promise<void> {
  const lockKey = `alert_new_gads_${leadId}`;
  if (!(await acquireAlertLock(ctx.client, lockKey))) return;

  // Parseia cidade e conta do texto pré-preenchido da landing /cotacao
  const cidadeMatch = firstMessageText.match(/📍\s*Cidade:\s*([^\n]+)/i);
  const contaMatch = firstMessageText.match(/⚡\s*Conta de luz:\s*([^\n]+)/i);
  const cidade = cidadeMatch ? cidadeMatch[1].trim() : null;
  const conta = contaMatch ? contaMatch[1].trim() : null;

  const lines: string[] = [
    `🎯 *LEAD GOOGLE ADS*`,
    ``,
    `${leadName ?? 'Sem nome ainda'} — ${formatPhoneShort(leadPhone)}`,
  ];
  if (cidade) lines.push(`📍 ${cidade}`);
  if (conta) lines.push(`⚡ Conta: ${conta}`);
  if (utmCampaign) lines.push(`📣 Campanha: ${utmCampaign}`);
  lines.push(``);
  lines.push(`Eva ja respondeu. Assumir agora se for quente.`);
  const text = lines.join('\n');

  try {
    await sendAdminWithButtons(
      { metaWaba: ctx.metaWaba ?? null, sendText: ctx.sendText },
      ctx.engineerPhone,
      text,
      [
        { id: `evabt:lead-view:${leadId}`, title: '👤 Ver perfil' },
        { id: `evabt:lead-pause:${leadId}`, title: '✋ Assumir' },
        { id: `evabt:lead-optout:${leadId}`, title: '🚫 Marcar lixo' },
      ],
    );
    console.log(`[alerts] new_lead_google_ads disparado pra lead ${leadId} (cidade=${cidade ?? 'n/a'}, conta=${conta ?? 'n/a'})`);
  } catch (err) {
    console.warn(`[alerts] falha ao enviar new_lead_google_ads:`, (err as Error).message);
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
// Criterio minimo oficial da empresa (empresa_config: criterio_lead_valor /
// criterio_lead_kwh — seed EcoSun: R$700 / 700 kWh), lido em RUNTIME dentro
// das funções (nunca em const de módulo, senão /recarregar-config não pega).
// Resolve o caso em que a Eva coleta tudo mas nunca emite
// qualification_complete (ex: travou pedindo CPF) e Junior fica cego.
// ──────────────────────────────────────────────────────────────────────────

function toNum(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

export function isHotLeadByEnergy(energyData: unknown): boolean {
  if (!energyData || typeof energyData !== 'object') return false;
  const e = energyData as Record<string, unknown>;
  const bill = toNum(e.monthly_bill);
  const kwh = toNum(e.consumption_kwh);
  return (Number.isFinite(bill) && bill >= empresa().criterioLeadValor)
    || (Number.isFinite(kwh) && kwh >= empresa().criterioLeadKwh);
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
  if (b >= empresa().criterioLeadValor || k >= empresa().criterioLeadKwh) return '🟠 MORNO';
  return '🔵 FRIO';
}

// 'estrategico' reservado p/ marcacao manual do caller (lead estrategico) —
// motivoEscalonamento NAO o emite (nao ha heuristica de texto confiavel).
export type MotivoEscalonamento =
  | 'urgencia' | 'conta_alta' | 'concorrente' | 'hostilidade' | 'estrategico';

/**
 * Gatilhos do Sub-projeto 1 (spec 2026-05-17): a Eva deve interromper o fluxo
 * e notificar o Junior imediatamente. Complementa a rede de hot-lead por dados
 * (não substitui). Retorna o motivo ou null.
 */
export function motivoEscalonamento(args: { text: string; contaMensal?: number }): MotivoEscalonamento | null {
  const t = (args.text ?? '').toLowerCase();
  // Heuristica PROPOSITALMENTE larga: falso-positivo custa so 1 ping extra
  // contextualizado pro Junior (com o trecho do cliente) — preferimos isso a
  // PERDER sinal de venda. Nao apertar pra "precisao" sem dado real.
  // NB: o stem `decidid` (decidido/decidida) NAO pode ter \b no fim — `decidido`
  // continua com `o` (word char), entao \b apos `decidid` nunca casaria. Por isso
  // o grupo nao usa \b final (o leading \b basta pra evitar match no meio de palavra).
  if (/\b(quero fechar|fechar hoje|fechar agora|j[áa] (t[ôo]|estou) decidid|decidir essa semana|bora fechar)/.test(t)) return 'urgencia';
  if ((args.contaMensal ?? 0) >= 15000 || /\bm[úu]ltiplas? (unidades|ucs|filiais|lojas)\b/.test(t)) return 'conta_alta';
  if (/\b(proposta|or[çc]amento) (da|de) (outra|concorrente|empresa)\b|j[áa] tenho (uma )?proposta\b/.test(t)) return 'concorrente';
  if (/\b(golpe|enganaç|enrola[çr]|para de me encher|n[ãa]o me perturb|absurdo|palha[çc]ada)\b/.test(t)) return 'hostilidade';
  return null;
}

/**
 * Guard cross-layer: lead já desqualificado/encerrado (disqualify_lead seta
 * eva_active=false / status='descartado' / contact_type='inviavel') NÃO deve
 * gerar alerta de escalonamento — senão o Junior recebe "Eva pediu reforço"
 * contraditório logo após "Eva encerrou lead inviável com dignidade".
 * Espelha o gate eva_active do index.ts. lead ausente => não bloqueia.
 */
export function leadEncerrado(
  lead: { eva_active?: boolean | null; status?: string | null; contact_type?: string | null } | null | undefined,
): boolean {
  if (!lead) return false;
  return lead.eva_active === false
    || lead.status === 'descartado'
    || lead.contact_type === 'inviavel';
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

const MOTIVO_LABEL: Record<MotivoEscalonamento, string> = {
  urgencia: '⏰ Cliente com URGÊNCIA — quer fechar agora',
  conta_alta: '🐋 Conta ALTA / múltiplas unidades — baleia',
  concorrente: '⚔️ Cliente cotou com CONCORRENTE',
  hostilidade: '🛑 Cliente HOSTIL / desconfiado',
  estrategico: '🎯 Lead ESTRATÉGICO',
};

/**
 * 🚨 ALERTA imediato de ESCALONAMENTO (Sub-projeto 1 — Eva Vendedora DNA).
 * Reusa o MESMO canal de notificação do hot-lead backstop (sendAdminWithButtons
 * pro engineerPhone, mesmos botões Ver perfil / Assumir). Idempotente 1x por
 * lead+motivo+dia pra nao spammar. Best-effort: nunca quebra o fluxo.
 */
export async function alertEscalonamento(
  ctx: AlertContext,
  lead: { id: string; name: string | null; phone: string },
  motivo: MotivoEscalonamento,
  trechoMensagem?: string,
): Promise<boolean> {
  const dia = new Date().toISOString().slice(0, 10);
  const lockKey = `alert_escal_${lead.id}_${motivo}_${dia}`;
  if (!(await acquireAlertLock(ctx.client, lockKey))) return false;

  const nome = lead.name ?? 'Lead sem nome';
  const tel = formatPhoneShort(lead.phone);
  const trecho = (trechoMensagem ?? '').trim();
  const text = [
    `🚨 *Escalonamento — Eva pediu reforço*`,
    ``,
    MOTIVO_LABEL[motivo],
    ``,
    `${nome} — ${tel}`,
    trecho ? `\n_"${trecho.slice(0, 200)}"_` : ``,
    ``,
    `Eva continua atendendo, mas esse caso pede sua atenção agora.`,
  ].filter(l => l !== ``).join('\n');

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
    console.log(`[escal] escalonamento (${motivo}) disparado pra lead ${lead.id}`);
    return true;
  } catch (err) {
    console.warn(`[escal] falha ao enviar escalonamento:`, (err as Error).message);
    return false;
  }
}

export type { AlertKind, AlertContext };
