import type { Config } from '../config.js';

export interface IncomingMessage {
  type: 'text' | 'audio' | 'image' | 'location';
  from: string;
  content: string;
  timestamp: Date;
  messageId: string;
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

  async sendText(to: string, text: string): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/message/sendText/${this.instance}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.apiKey,
        },
        body: JSON.stringify({ number: to, text }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Evolution API sendText failed: ${response.status} ${error}`);
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

    // Ignorar mensagens enviadas por mim (fromMe)
    if (key.fromMe) return null;

    const from = key.remoteJid?.replace('@s.whatsapp.net', '') ?? '';
    const messageId = key.id ?? '';

    if (message.conversation || message.extendedTextMessage) {
      const text = (message.conversation as string)
        ?? (message.extendedTextMessage as Record<string, string>)?.text
        ?? '';
      return { type: 'text', from, content: text, timestamp: new Date(timestamp * 1000), messageId };
    }

    if (message.audioMessage) {
      const audio = message.audioMessage as Record<string, string>;
      return { type: 'audio', from, content: audio.url ?? '', timestamp: new Date(timestamp * 1000), messageId };
    }

    if (message.imageMessage) {
      const image = message.imageMessage as Record<string, string>;
      return { type: 'image', from, content: image.url ?? '', timestamp: new Date(timestamp * 1000), messageId };
    }

    if (message.locationMessage) {
      const loc = message.locationMessage as Record<string, number>;
      return { type: 'location', from, content: JSON.stringify({ lat: loc.degreesLatitude, lng: loc.degreesLongitude }), timestamp: new Date(timestamp * 1000), messageId };
    }

    return null;
  }

  validateWebhookToken(token: string): boolean {
    return token === this.webhookToken;
  }
}
