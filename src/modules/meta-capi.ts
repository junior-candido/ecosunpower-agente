// src/modules/meta-capi.ts
//
// Meta Conversions API (CAPI) — devolve eventos de funil pra Meta otimizar
// anuncios Click-to-WhatsApp (CTWA).
//
// CONTEXTO: lead clica num anuncio CTWA -> WhatsApp abre -> Meta manda
// `ctwa_clid` (click id) no `referral` da 1a mensagem (parseado em
// meta-whatsapp.ts). A Eva guarda esse clid no lead (coluna `ctwa_clid`,
// migration 044) e, quando o lead avanca de estagio, devolve um evento
// pra Meta. A Meta casa o evento com o clique original via ctwa_clid e
// aprende a buscar mais gente parecida com quem converte.
//
// Formato CTWA (action_source=business_messaging) — confirmado na doc
// oficial Meta "Conversions API for Business Messaging". DIFERENTE do
// fluxo CRM (system_generated), que e pra leads de formulario instantaneo.
//
// FILOSOFIA: fire-and-forget. Erro de rede/token NUNCA pode quebrar o
// atendimento da Eva. sendEvents() nunca lanca — retorna { ok: false }.

import crypto from 'crypto';

const DEFAULT_API_VERSION = 'v21.0';

export interface CtwaEventParams {
  /** Nome do estagio do funil. Ex: 'Lead', 'lead_qualificado'. */
  eventName: string;
  /** Quando o estagio aconteceu, em ms (Date.now()). Convertido pra segundos. */
  eventTimeMs: number;
  /** Click id do anuncio CTWA (referral.ctwa_clid). Chave de match. */
  ctwaClid: string;
  /** ID da conta WhatsApp Business (META_WABA_BUSINESS_ACCOUNT_ID). */
  wabaId: string;
  /** Telefone cru do cliente; embaralhado (SHA256) antes de mandar. Opcional. */
  phone?: string;
  /** Valor do negocio (ex: ticket da proposta). Opcional. */
  value?: number;
  /** Moeda do value. Default BRL quando value presente. */
  currency?: string;
  /** Chave de dedup na Meta (ex: `${leadId}:${eventName}`). Mensagens em
   *  rajada disparam o mesmo estagio antes do recordCapiStage gravar — com
   *  event_id igual, a Meta descarta a duplicata sozinha. Opcional. */
  eventId?: string;
}

export interface CapiEvent {
  event_name: string;
  event_time: number; // UNIX em segundos
  event_id?: string;
  action_source: 'business_messaging';
  messaging_channel: 'whatsapp';
  user_data: {
    whatsapp_business_account_id: string;
    ctwa_clid: string;
    ph?: string[];
  };
  custom_data?: { value?: number; currency?: string };
}

export interface SendResult {
  ok: boolean;
  eventsReceived?: number;
  error?: string;
}

/** SHA256 hex (minusculo) do valor normalizado (trim + lowercase). */
export function hashSha256(value: string): string {
  const normalized = value.trim().toLowerCase();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/** Remove tudo que nao for digito (Meta quer telefone so com numeros). */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

/** Monta um evento CTWA pronto pro endpoint /events. */
export function buildCtwaEvent(params: CtwaEventParams): CapiEvent {
  const event: CapiEvent = {
    event_name: params.eventName,
    event_time: Math.floor(params.eventTimeMs / 1000),
    action_source: 'business_messaging',
    messaging_channel: 'whatsapp',
    user_data: {
      whatsapp_business_account_id: params.wabaId,
      ctwa_clid: params.ctwaClid,
    },
  };

  if (params.eventId) {
    event.event_id = params.eventId;
  }

  if (params.phone) {
    event.user_data.ph = [hashSha256(normalizePhone(params.phone))];
  }

  if (typeof params.value === 'number') {
    event.custom_data = { value: params.value, currency: params.currency ?? 'BRL' };
  }

  return event;
}

// ---- Leads de FORMULARIO instantaneo (CRM integration) ----
//
// Lead de formulario NAO tem ctwa_clid. A Meta casa o evento pelo `lead_id`
// (o leadgen_id que chega no webhook) com action_source=system_generated.
// Formato do guia oficial "Conversions API for CRM integration" — e o que a
// otimizacao "Leads de conversao" (Conversion Leads) do Gerenciador consome.

/** Nome do CRM mostrado na Meta como origem do evento (lead_event_source). */
export const CRM_LEAD_EVENT_SOURCE = 'EcoSunPower CRM';

export interface CrmLeadEventParams {
  /** Nome do estagio do funil. Ex: 'Lead', 'lead_respondeu', 'lead_qualificado'. */
  eventName: string;
  /** Quando o estagio aconteceu, em ms (Date.now()). Convertido pra segundos. */
  eventTimeMs: number;
  /** leadgen_id do webhook do formulario. Chave de match na Meta. */
  leadgenId: string;
  /** Telefone cru do cliente; embaralhado (SHA256) antes de mandar. Opcional. */
  phone?: string;
  /** Valor do negocio (ex: ticket da proposta). Opcional. */
  value?: number;
  /** Moeda do value. Default BRL quando value presente. */
  currency?: string;
  /** Chave de dedup na Meta (ex: `${leadId}:${eventName}`). Opcional. */
  eventId?: string;
}

export interface CapiCrmEvent {
  event_name: string;
  event_time: number; // UNIX em segundos
  event_id?: string;
  action_source: 'system_generated';
  user_data: {
    /** Numerico quando cabe em inteiro seguro; string acima disso (nunca corrompe). */
    lead_id: number | string;
    ph?: string[];
  };
  custom_data: {
    event_source: 'crm';
    lead_event_source: string;
    value?: number;
    currency?: string;
  };
}

/** Monta um evento CRM (lead de formulario) pronto pro endpoint /events. */
export function buildCrmLeadEvent(params: CrmLeadEventParams): CapiCrmEvent {
  // Number('99999999999999999') perde precisao EM SILENCIO acima de 2^53-1 e
  // o evento nunca casaria com o lead. Acima do inteiro seguro, mantem string.
  const asNumber = Number(params.leadgenId);
  const leadId = Number.isSafeInteger(asNumber) ? asNumber : params.leadgenId;

  const event: CapiCrmEvent = {
    event_name: params.eventName,
    event_time: Math.floor(params.eventTimeMs / 1000),
    action_source: 'system_generated',
    user_data: { lead_id: leadId },
    custom_data: { event_source: 'crm', lead_event_source: CRM_LEAD_EVENT_SOURCE },
  };

  if (params.eventId) {
    event.event_id = params.eventId;
  }

  if (params.phone) {
    event.user_data.ph = [hashSha256(normalizePhone(params.phone))];
  }

  if (typeof params.value === 'number') {
    event.custom_data.value = params.value;
    event.custom_data.currency = params.currency ?? 'BRL';
  }

  return event;
}

export interface MetaCapiOptions {
  datasetId: string;
  token: string;
  apiVersion?: string;
  /** Injetavel pra teste. Default: fetch global. */
  fetchImpl?: typeof fetch;
}

export class MetaCapi {
  private readonly datasetId: string;
  private readonly token: string;
  private readonly apiVersion: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: MetaCapiOptions) {
    this.datasetId = opts.datasetId;
    this.token = opts.token;
    this.apiVersion = opts.apiVersion ?? DEFAULT_API_VERSION;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private get endpoint(): string {
    return `https://graph.facebook.com/${this.apiVersion}/${this.datasetId}/events?access_token=${this.token}`;
  }

  /**
   * Manda os eventos pra Meta. NUNCA lanca — devolve { ok: false, error }
   * em qualquer falha (rede, token, resposta de erro). Lista vazia = no-op.
   */
  async sendEvents(
    events: Array<CapiEvent | CapiCrmEvent>,
    opts?: { testEventCode?: string },
  ): Promise<SendResult> {
    if (events.length === 0) return { ok: true, eventsReceived: 0 };

    const payload: Record<string, unknown> = { data: events };
    if (opts?.testEventCode) payload.test_event_code = opts.testEventCode;

    try {
      const res = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as {
        events_received?: number;
        error?: { message?: string };
      };
      if (!res.ok) {
        return { ok: false, error: data.error?.message ?? `HTTP ${res.status}` };
      }
      return { ok: true, eventsReceived: data.events_received };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}
