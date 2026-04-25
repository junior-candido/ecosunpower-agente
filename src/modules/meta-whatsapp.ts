import crypto from 'crypto';
import type { Config } from '../config.js';
import type { IncomingMessage } from './evolution.js';

const GRAPH_API = 'https://graph.facebook.com/v21.0';

// Reaproveita IncomingMessage do EvolutionService pra o restante do codigo
// (router, brain, etc) nao precisar mudar nada — drop-in replacement.
export type { IncomingMessage } from './evolution.js';

export interface TemplateComponent {
  type: 'header' | 'body' | 'button' | 'footer';
  sub_type?: 'quick_reply' | 'url' | 'flow';
  index?: number;
  parameters?: Array<{
    type: 'text' | 'currency' | 'date_time' | 'image' | 'document' | 'video' | 'payload';
    text?: string;
    image?: { link: string };
    document?: { link: string; filename?: string };
    video?: { link: string };
    payload?: string;
  }>;
}

export interface MetaStatusUpdate {
  messageId: string;       // wamid do Meta
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: Date;
  recipientPhone: string;  // E.164 sem +
  errorCode?: number;
  errorTitle?: string;
}

export class MetaWhatsAppService {
  private phoneNumberId: string;
  private accessToken: string;
  private appSecret: string;
  private verifyToken: string;
  private businessAccountId: string;

  constructor(config: Pick<Config,
    | 'metaWabaPhoneNumberId'
    | 'metaWabaAccessToken'
    | 'metaWabaBusinessAccountId'
    | 'metaAppSecret'
    | 'metaWabaVerifyToken'
  >) {
    if (!config.metaWabaPhoneNumberId) throw new Error('META_WABA_PHONE_NUMBER_ID nao configurado');
    if (!config.metaWabaAccessToken) throw new Error('META_WABA_ACCESS_TOKEN nao configurado');
    if (!config.metaAppSecret) throw new Error('META_APP_SECRET nao configurado (necessario pra HMAC do webhook)');
    if (!config.metaWabaVerifyToken) throw new Error('META_WABA_VERIFY_TOKEN nao configurado');
    this.phoneNumberId = config.metaWabaPhoneNumberId;
    this.accessToken = config.metaWabaAccessToken;
    this.businessAccountId = config.metaWabaBusinessAccountId ?? '';
    this.appSecret = config.metaAppSecret;
    this.verifyToken = config.metaWabaVerifyToken;
  }

  // ===== Envio de mensagens =====

  async sendText(to: string, text: string, _delayMs?: number): Promise<{ messageId: string }> {
    // delayMs do Evolution nao tem equivalente direto na Cloud API. Mantemos
    // a assinatura compativel mas ignoramos. Quem quiser delay simula com
    // setTimeout antes de chamar.
    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text, preview_url: false },
    };
    return this.postMessage(body);
  }

  async sendMedia(
    to: string,
    mediaUrl: string,
    caption: string,
    mediatype: 'image' | 'video' = 'image',
  ): Promise<{ messageId: string }> {
    const body: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to,
      type: mediatype,
    };
    body[mediatype] = { link: mediaUrl, caption };
    return this.postMessage(body);
  }

  async sendDocument(
    to: string,
    mediaUrl: string,
    filename: string,
    caption?: string,
  ): Promise<{ messageId: string }> {
    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'document',
      document: { link: mediaUrl, filename, ...(caption ? { caption } : {}) },
    };
    return this.postMessage(body);
  }

  async sendAudio(to: string, mediaUrl: string): Promise<{ messageId: string }> {
    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'audio',
      audio: { link: mediaUrl },
    };
    return this.postMessage(body);
  }

  // Template messages — necessario pra iniciar conversa apos 24h sem interacao
  // ou pra contatos novos (cadencia, leadgen reengajamento, etc).
  async sendTemplate(
    to: string,
    templateName: string,
    languageCode: string,
    components: TemplateComponent[] = [],
  ): Promise<{ messageId: string }> {
    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components.length ? { components } : {}),
      },
    };
    return this.postMessage(body);
  }

  // Marca mensagem recebida como lida (boa pratica de UX, opcional).
  async markAsRead(messageId: string): Promise<void> {
    await this.postMessage({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    });
  }

  // ===== Webhook =====

  // Validacao do challenge GET inicial (subscribe do webhook).
  // Meta chama: GET /webhook?hub.mode=subscribe&hub.verify_token=X&hub.challenge=Y
  validateChallenge(mode: string, token: string): boolean {
    return mode === 'subscribe' && token === this.verifyToken;
  }

  // Validacao HMAC-SHA256 dos webhooks recebidos. Identica a do meta-leadgen
  // mas duplicada aqui pra encapsular — assim o handler nao precisa importar
  // de outro modulo so pra validar.
  validateSignature(rawBody: string, signatureHeader: string | undefined): boolean {
    if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
    const expected = signatureHeader.slice(7);
    if (!/^[0-9a-f]{64}$/i.test(expected)) return false;
    const computed = crypto
      .createHmac('sha256', this.appSecret)
      .update(rawBody)
      .digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(computed, 'hex'),
    );
  }

  // Parse do payload de mensagens recebidas (formato WABA Cloud API). Retorna
  // null pra payloads que nao sao mensagens (ex: status updates, account_update).
  // Use parseStatusUpdates() em separado pra status (delivered/read/failed).
  //
  // Estrutura WABA:
  //   { object: 'whatsapp_business_account',
  //     entry: [{ id, changes: [{ field: 'messages', value: { messages: [...], contacts: [...] } }] }] }
  parseWebhook(payload: Record<string, unknown>): IncomingMessage | null {
    const entry = (payload.entry as Array<Record<string, unknown>> | undefined) ?? [];
    for (const e of entry) {
      const changes = (e.changes as Array<Record<string, unknown>> | undefined) ?? [];
      for (const ch of changes) {
        if (ch.field !== 'messages') continue;
        const value = ch.value as Record<string, unknown> | undefined;
        if (!value) continue;
        const messages = (value.messages as Array<Record<string, unknown>> | undefined) ?? [];
        if (messages.length === 0) continue;
        // Pegamos a primeira mensagem do batch. Webhook normalmente entrega
        // 1 mensagem por evento, mas Meta pode bufferar — o handler que chama
        // pode iterar manualmente se precisar de todas.
        const msg = messages[0];
        if (!msg) continue;
        const contacts = (value.contacts as Array<Record<string, unknown>> | undefined) ?? [];
        const contact = contacts[0];
        const profile = contact?.profile as Record<string, string> | undefined;
        return this.parseMessage(msg, profile?.name);
      }
    }
    return null;
  }

  // Parse de UM evento de mensagem (entry.changes[].value.messages[i]).
  private parseMessage(msg: Record<string, unknown>, pushName?: string): IncomingMessage | null {
    const from = (msg.from as string) ?? '';
    const messageId = (msg.id as string) ?? '';
    const timestampSec = Number(msg.timestamp ?? 0);
    const timestamp = new Date(timestampSec * 1000);
    const type = (msg.type as string) ?? '';

    const base = { from, timestamp, messageId, fromMe: false, pushName };

    switch (type) {
      case 'text': {
        const text = (msg.text as { body?: string } | undefined)?.body ?? '';
        return { ...base, type: 'text', content: text };
      }
      case 'image': {
        const img = msg.image as { id?: string; caption?: string } | undefined;
        return {
          ...base,
          type: 'image',
          // No WABA o conteudo e media_id (nao URL direta). Pra baixar chamar
          // getMediaBase64(media_id) — ele faz GET /v21.0/{media-id} e depois
          // GET na URL retornada.
          content: img?.id ?? '',
          caption: img?.caption,
        };
      }
      case 'video': {
        const vid = msg.video as { id?: string; caption?: string } | undefined;
        return {
          ...base,
          type: 'video',
          content: vid?.id ?? '',
          caption: vid?.caption,
        };
      }
      case 'audio': {
        const aud = msg.audio as { id?: string } | undefined;
        return { ...base, type: 'audio', content: aud?.id ?? '' };
      }
      case 'document': {
        const doc = msg.document as { id?: string; mime_type?: string; filename?: string } | undefined;
        return {
          ...base,
          type: 'document',
          content: doc?.mime_type ?? '',
          caption: doc?.filename,
        };
      }
      case 'location': {
        const loc = msg.location as { latitude?: number; longitude?: number } | undefined;
        return {
          ...base,
          type: 'location',
          content: JSON.stringify({ lat: loc?.latitude, lng: loc?.longitude }),
        };
      }
      // Tipos nao suportados (interactive, button, contacts, sticker, system...)
      // sao ignorados por enquanto. Adicionar conforme necessidade.
      default:
        return null;
    }
  }

  // Parse separado pra status updates (sent/delivered/read/failed). Util pra
  // tracking de entrega da cadencia. Retorna array porque um webhook pode
  // trazer varios updates de uma vez.
  parseStatusUpdates(payload: Record<string, unknown>): MetaStatusUpdate[] {
    const updates: MetaStatusUpdate[] = [];
    const entry = (payload.entry as Array<Record<string, unknown>> | undefined) ?? [];
    for (const e of entry) {
      const changes = (e.changes as Array<Record<string, unknown>> | undefined) ?? [];
      for (const ch of changes) {
        if (ch.field !== 'messages') continue;
        const value = ch.value as Record<string, unknown> | undefined;
        const statuses = (value?.statuses as Array<Record<string, unknown>> | undefined) ?? [];
        for (const s of statuses) {
          const errors = (s.errors as Array<Record<string, unknown>> | undefined) ?? [];
          const firstErr = errors[0];
          updates.push({
            messageId: (s.id as string) ?? '',
            status: (s.status as MetaStatusUpdate['status']) ?? 'sent',
            timestamp: new Date(Number(s.timestamp ?? 0) * 1000),
            recipientPhone: (s.recipient_id as string) ?? '',
            errorCode: firstErr ? Number(firstErr.code) : undefined,
            errorTitle: firstErr ? String(firstErr.title) : undefined,
          });
        }
      }
    }
    return updates;
  }

  // ===== Download de midia =====

  // Baixa midia recebida em base64. Espelha a interface do EvolutionService
  // pra os modulos que ja usam (transcriber, vision) nao precisarem mudar.
  // Implementacao WABA: 2 chamadas (GET /v21.0/{media-id} → URL; depois GET na URL).
  async getMediaBase64(mediaId: string): Promise<{ base64: string; mimetype: string } | null> {
    try {
      // Passo 1: pegar URL temporaria da midia
      const metaRes = await fetch(`${GRAPH_API}/${mediaId}`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      if (!metaRes.ok) {
        console.error(`[meta-whatsapp] getMediaBase64 metadata failed: ${metaRes.status}`);
        return null;
      }
      const meta = await metaRes.json() as { url?: string; mime_type?: string };
      if (!meta.url || !meta.mime_type) {
        console.error('[meta-whatsapp] getMediaBase64: metadata sem url/mime_type');
        return null;
      }
      // Passo 2: baixar bytes da midia
      const binRes = await fetch(meta.url, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      if (!binRes.ok) {
        console.error(`[meta-whatsapp] getMediaBase64 download failed: ${binRes.status}`);
        return null;
      }
      const buf = Buffer.from(await binRes.arrayBuffer());
      return { base64: buf.toString('base64'), mimetype: meta.mime_type };
    } catch (error) {
      console.error('[meta-whatsapp] getMediaBase64 error:', error);
      return null;
    }
  }

  // ===== Compatibilidade com EvolutionService =====

  // EvolutionService.validateWebhookToken — WABA usa HMAC, nao token simples.
  // Mantemos o metodo retornando true pra nao quebrar quem chama, mas a
  // validacao real e via validateSignature() acima. O handler do webhook
  // deve usar validateSignature(), nao esse aqui.
  validateWebhookToken(_token: string): boolean {
    return true;
  }

  // Cloud API nao expoe lista de contatos da agenda do telefone (so contatos
  // que ja conversaram com o numero). Retorna array vazio pra manter
  // compatibilidade. Quem precisar de "todos os contatos" tem que migrar pra
  // outra fonte (lista propria no Supabase, importada do Evolution antes da
  // migracao).
  async findContacts(): Promise<Array<{
    jid: string;
    phone: string;
    pushName?: string;
    name?: string;
  }>> {
    return [];
  }

  // ===== Helpers privados =====

  private async postMessage(body: Record<string, unknown>): Promise<{ messageId: string }> {
    const url = `${GRAPH_API}/${this.phoneNumberId}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Meta WABA API ${res.status}: ${errText}`);
    }
    const data = await res.json() as {
      messages?: Array<{ id: string }>;
    };
    const messageId = data.messages?.[0]?.id ?? '';
    return { messageId };
  }

  // ===== Util pra setup inicial =====

  // Lista templates aprovados na WABA. Usar em scripts/admin pra ver o que
  // ja ta liberado pra envio. Requer business account ID configurado.
  async listTemplates(): Promise<Array<{ name: string; status: string; language: string; category: string }>> {
    if (!this.businessAccountId) {
      throw new Error('META_WABA_BUSINESS_ACCOUNT_ID nao configurado — necessario pra listar templates');
    }
    const url = `${GRAPH_API}/${this.businessAccountId}/message_templates?limit=100`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`listTemplates ${res.status}: ${await res.text()}`);
    }
    const data = await res.json() as {
      data?: Array<{ name: string; status: string; language: string; category: string }>;
    };
    return data.data ?? [];
  }
}
