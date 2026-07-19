import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
const IORedis = Redis.default ?? Redis;

export interface QueueMessage {
  type: 'text' | 'audio' | 'image' | 'video' | 'location' | 'document';
  from: string;
  content: string;
  timestamp: string;
  messageId: string;
  pushName?: string;
  caption?: string;
  mimeType?: string;
  // Empresa dona da mensagem (multi-tenant fatia 1). Resolvida no webhook a
  // partir do phone_number_id que recebeu a msg. Opcional: jobs antigos na
  // fila (sem esse campo) continuam parseando → o consumidor cai em EcoSun.
  companyId?: string;
  // CTWA referral (Click-to-WhatsApp Ad) — preenchido apenas na 1a msg do
  // lead que veio clicando num anuncio Meta. Permite mapping ad_id->template.
  referral?: {
    sourceId?: string;
    sourceUrl?: string;
    sourceType?: string;
    headline?: string;
    body?: string;
    mediaType?: string;
    ctwaClid?: string;
  };
}

type MessageHandler = (message: QueueMessage) => Promise<void>;

const QUEUE_NAME = 'whatsapp-messages';

export class MessageQueue {
  private queue: Queue;
  private worker: Worker;
  private redis: any;
  private processedIds: Set<string> = new Set();

  constructor(redisHost: string, redisPort: number, handler: MessageHandler, redisPassword?: string) {
    const connection = { host: redisHost, port: redisPort, password: redisPassword };

    this.redis = new IORedis({ host: redisHost, port: redisPort, password: redisPassword, maxRetriesPerRequest: null });

    this.queue = new Queue(QUEUE_NAME, { connection });

    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<QueueMessage>) => {
        if (this.processedIds.has(job.data.messageId)) return;
        this.processedIds.add(job.data.messageId);

        if (this.processedIds.size > 10000) {
          const entries = [...this.processedIds];
          this.processedIds = new Set(entries.slice(-5000));
        }

        await handler(job.data);
      },
      { connection, concurrency: 1 }
    );

    this.worker.on('failed', (job, err) => {
      console.error(`[queue] Job ${job?.id} failed:`, err.message);
    });
  }

  async addMessage(message: QueueMessage): Promise<void> {
    await this.queue.add('message', message, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });
  }

  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
    await this.redis.quit();
  }
}
