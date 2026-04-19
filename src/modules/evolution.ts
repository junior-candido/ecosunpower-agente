import type { Config } from '../config.js';

export interface IncomingMessage {
  type: 'text' | 'audio' | 'image' | 'location' | 'document';
  from: string;
  content: string;
  timestamp: Date;
  messageId: string;
  fromMe: boolean;
  pushName?: string;
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

  async sendText(to: string, text: string, delayMs?: number): Promise<{ messageId: string }> {
    const body: Record<string, unknown> = { number: to, text };
    if (delayMs && delayMs > 0) body.delay = delayMs;
    const response = await fetch(
      `${this.baseUrl}/message/sendText/${this.instance}`,
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

    // Ignorar mensagens de grupos (grupos terminam com @g.us)
    if (key.remoteJid?.endsWith('@g.us')) return null;

    const fromMe = Boolean(key.fromMe);
    const from = key.remoteJid?.replace('@s.whatsapp.net', '') ?? '';
    const messageId = key.id ?? '';
    const pushName = (data.pushName as string) || undefined;

    const base = { from, timestamp: new Date(timestamp * 1000), messageId, fromMe, pushName };

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
      return { ...base, type: 'image', content: image.url ?? '' };
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
        `${this.baseUrl}/message/sendMedia/${this.instance}`,
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
        `${this.baseUrl}/chat/getBase64FromMediaMessage/${this.instance}`,
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
}
