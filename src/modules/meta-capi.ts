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
}

export interface CapiEvent {
  event_name: string;
  event_time: number; // UNIX em segundos
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

  if (params.phone) {
    event.user_data.ph = [hashSha256(normalizePhone(params.phone))];
  }

  if (typeof params.value === 'number') {
    event.custom_data = { value: params.value, currency: params.currency ?? 'BRL' };
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
  async sendEvents(events: CapiEvent[], opts?: { testEventCode?: string }): Promise<SendResult> {
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
