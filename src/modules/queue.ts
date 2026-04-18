import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
const IORedis = Redis.default ?? Redis;

export interface QueueMessage {
  type: 'text' | 'audio' | 'image' | 'location';
  from: string;
  content: string;
  timestamp: string;
  messageId: string;
}

type MessageHandler = (message: QueueMessage) => Promise<void>;

const QUEUE_NAME = 'whatsapp-messages';

export class MessageQueue {
  private queue: Queue;
  private worker: Worker;
  private redis: any;
  private processedIds: Set<string> = new Set();

  constructor(redisHost: string, redisPort: number, handler: MessageHandler) {
    const connection = { host: redisHost, port: redisPort };

    this.redis = new IORedis({ host: redisHost, port: redisPort, maxRetriesPerRequest: null });

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
