import Redis from 'ioredis';
const IORedis = (Redis as any).default ?? Redis;

const PAUSE_TTL_SECONDS = 24 * 60 * 60;
const BOT_ECHO_TTL_SECONDS = 120;

export class TakeoverService {
  private redis: any;

  constructor(host: string, port: number, password?: string) {
    this.redis = new IORedis({ host, port, password, maxRetriesPerRequest: null });
  }

  async markBotSent(messageId: string): Promise<void> {
    if (!messageId) return;
    await this.redis.setex(`bot_sent:${messageId}`, BOT_ECHO_TTL_SECONDS, '1');
  }

  async isBotSent(messageId: string): Promise<boolean> {
    if (!messageId) return false;
    const result = await this.redis.get(`bot_sent:${messageId}`);
    return result !== null;
  }

  async pauseFor(phone: string): Promise<void> {
    await this.redis.setex(`takeover:${phone}`, PAUSE_TTL_SECONDS, new Date().toISOString());
  }

  async resumeFor(phone: string): Promise<void> {
    await this.redis.del(`takeover:${phone}`);
  }

  async isPaused(phone: string): Promise<boolean> {
    const result = await this.redis.get(`takeover:${phone}`);
    return result !== null;
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}
