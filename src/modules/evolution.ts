import { instanciaEvolutionAtual } from './canal-contexto.js';
import type { Config } from '../config.js';

export interface IncomingMessage {
  type: 'text' | 'audio' | 'image' | 'video' | 'location' | 'document';
  from: string;
  /** Veio de grupo? O padrao continua sendo IGNORAR — quem decide o que fazer
   *  e o webhook. Existe pra assistente poder APRENDER do grupo da equipe. */
  deGrupo?: boolean;
  /** JID do grupo (so quando deGrupo). Em grupo, `from` e a PESSOA que falou. */
  grupoId?: string;
  content: string;
  timestamp: Date;
  messageId: string;
  fromMe: boolean;
  pushName?: string;
  caption?: string; // legenda em imagem/video
  mimeType?: string; // mime do anexo (preenchido em document; tambem populado em image/video se vier no payload)
  // ID do NÚMERO que RECEBEU a mensagem (value.metadata.phone_number_id no
  // webhook WABA). Base do multi-tenant: mapeia pro company_id via companies.
  // waba_phone_number_id (migration 081). So o canal WABA preenche.
  phoneNumberId?: string;
  // Click-to-WhatsApp Ad (CTWA) referral. Presente APENAS na 1a msg do lead
  // que veio clicando num anuncio Meta. Permite mapping ad_id -> template
  // pra A/B test sem precisar de tag no body do anuncio.
  // So o canal WABA preenche (Evolution nao expoe esse campo).
  referral?: {
    sourceId?: string;       // ad_id Meta (ex: '120249029179580385')
    sourceUrl?: string;
    sourceType?: string;     // 'ad' | 'post' etc
    headline?: string;
    body?: string;
    mediaType?: string;
    ctwaClid?: string;
  };
}

export class EvolutionService {
  private baseUrl: string;
  private apiKey: string;
  private instance: string;
  private webhookToken: string;

  constructor(config: Pick<Config, 'evolutionApiUrl' | 'evolutionApiKey' | 'evolutionInstance' | 'webhookToken'>) {
    this.baseUrl = config.evolutionApiUrl;
    this.apiKey = config.evolutionApiKey;
    this.instance = config.evolutionInstance;
    this.webhookToken = config.webhookToken;
  }

  // Instância usada AGORA: a do tenant em contexto (canal-contexto, tenant
  // conectado por QR numa instância própria) ou a padrão do env (Eva).
  private instanciaAtual(): string {
    return instanciaEvolutionAtual(this.instance);
  }

  async sendText(to: string, text: string, delayMs?: number): Promise<{ messageId: string }> {
    const body: Record<string, unknown> = { number: to, text };
    if (delayMs && delayMs > 0) body.delay = delayMs;
    const response = await fetch(
      `${this.baseUrl}/message/sendText/${this.instanciaAtual()}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.apiKey,
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Evolution API sendText failed: ${response.status} ${error}`);
    }

    try {
      const data = await response.json() as Record<string, unknown>;
      const key = (data.key ?? (data as { data?: { key?: Record<string, string> } }).data?.key) as
        | Record<string, string>
        | undefined;
      return { messageId: key?.id ?? '' };
    } catch {
      return { messageId: '' };
    }
  }

  parseWebhook(payload: Record<string, unknown>): IncomingMessage | null {
    const data = payload.data as Record<string, unknown> | undefined;
    if (!data) return null;

    const key = data.key as Record<string, string> | undefined;
    const message = data.message as Record<string, unknown> | undefined;
    const timestamp = data.messageTimestamp as number;

    if (!key || !message) return null;

    // GRUPO: nao descarta mais aqui. Em grupo o remoteJid e o GRUPO e quem
    // falou vem em key.participant — sem participante nao da pra saber se e
    // gente da equipe, entao ai sim descarta.
    const deGrupo = Boolean(key.remoteJid?.endsWith('@g.us'));
    const grupoId = deGrupo ? key.remoteJid : undefined;
    if (deGrupo && !key.participant) return null;

    const fromMe = Boolean(key.fromMe);
    const from = (deGrupo ? key.participant : key.remoteJid)?.replace('@s.whatsapp.net', '') ?? '';
    const messageId = key.id ?? '';
    const pushName = (data.pushName as string) || undefined;

    const base = { from, timestamp: new Date(timestamp * 1000), messageId, fromMe, pushName, deGrupo, grupoId };

    if (message.conversation || message.extendedTextMessage) {
      const text = (message.conversation as string)
        ?? (message.extendedTextMessage as Record<string, string>)?.text
        ?? '';
      return { ...base, type: 'text', content: text };
    }

    if (message.audioMessage) {
      const audio = message.audioMessage as Record<string, string>;
      return { ...base, type: 'audio', content: audio.url ?? '' };
    }

    if (message.imageMessage) {
      const image = message.imageMessage as Record<string, string>;
      return {
        ...base,
        type: 'image',
        content: image.url ?? '',
        caption: image.caption ?? undefined,
      };
    }

    if (message.videoMessage) {
      const video = message.videoMessage as Record<string, string>;
      return {
        ...base,
        type: 'video',
        content: video.url ?? '',
        caption: video.caption ?? undefined,
      };
    }

    if (message.documentMessage) {
      const doc = message.documentMessage as Record<string, string>;
      return { ...base, type: 'document', content: doc.mimetype ?? '' };
    }

    if (message.locationMessage) {
      const loc = message.locationMessage as Record<string, number>;
      return { ...base, type: 'location', content: JSON.stringify({ lat: loc.degreesLatitude, lng: loc.degreesLongitude }) };
    }

    return null;
  }

  async sendMedia(to: string, mediaUrl: string, caption: string, mediatype: 'image' | 'video' = 'image'): Promise<{ messageId: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(
        `${this.baseUrl}/message/sendMedia/${this.instanciaAtual()}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: this.apiKey,
          },
          body: JSON.stringify({
            number: to,
            mediatype,
            media: mediaUrl,
            caption,
            fileName: mediatype === 'video' ? 'post.mp4' : 'post.jpg',
          }),
          signal: controller.signal,
        },
      );
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Evolution sendMedia ${res.status}: ${err}`);
      }
      const data = await res.json() as Record<string, unknown>;
      const key = (data.key ?? (data as { data?: { key?: Record<string, string> } }).data?.key) as
        | Record<string, string>
        | undefined;
      return { messageId: key?.id ?? '' };
    } finally {
      clearTimeout(timer);
    }
  }

  async getMediaBase64(messageId: string): Promise<{ base64: string; mimetype: string } | null> {
    try {
      const response = await fetch(
        `${this.baseUrl}/chat/getBase64FromMediaMessage/${this.instanciaAtual()}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': this.apiKey,
          },
          body: JSON.stringify({
            message: { key: { id: messageId } },
            convertToMp4: false,
          }),
        }
      );

      if (!response.ok) {
        console.error(`[evolution] getMediaBase64 failed: ${response.status}`);
        return null;
      }

      const data = await response.json() as { base64: string; mimetype: string };
      return data;
    } catch (error) {
      console.error('[evolution] getMediaBase64 error:', error);
      return null;
    }
  }

  validateWebhookToken(token: string): boolean {
    return token === this.webhookToken;
  }

  /**
   * Lista todos os contatos sincronizados do WhatsApp do Junior via Evolution API.
   * Retorna JID (numero@s.whatsapp.net), pushName (nome de perfil do contato) e,
   * quando disponivel, o 'name' salvo na agenda do telefone do Junior.
   *
   * Usado pro comando "eva ativar nome <termo>" que ativa Eva em massa pra um
   * grupo de contatos identificados pelo nome salvo na agenda.
   */
  async findContacts(): Promise<Array<{
    jid: string;
    phone: string;
    pushName?: string;
    name?: string;
  }>> {
    try {
      const response = await fetch(
        `${this.baseUrl}/chat/findContacts/${this.instanciaAtual()}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': this.apiKey,
          },
          body: JSON.stringify({ where: {} }),
        }
      );

      if (!response.ok) {
        const err = await response.text();
        console.error(`[evolution] findContacts failed: ${response.status} ${err}`);
        return [];
      }

      const data = await response.json() as Array<Record<string, unknown>>;
      if (!Array.isArray(data)) {
        console.warn('[evolution] findContacts: response nao eh array');
        return [];
      }

      return data
        .map((raw) => {
          const jid = String(raw.id ?? raw.remoteJid ?? raw.jid ?? '');
          if (!jid) return null;
          // Ignora grupos e status
          if (jid.includes('-') || jid.endsWith('@g.us') || jid.endsWith('@broadcast')) return null;
          const phone = jid.replace(/@.*$/, '');
          return {
            jid,
            phone,
            pushName: raw.pushName ? String(raw.pushName) : undefined,
            name: raw.name ? String(raw.name) : (raw.verifiedName ? String(raw.verifiedName) : undefined),
          };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);
    } catch (error) {
      console.error('[evolution] findContacts error:', error);
      return [];
    }
  }
}
