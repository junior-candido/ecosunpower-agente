import Redis from 'ioredis';
const IORedis = (Redis as any).default ?? Redis;

/** Número da própria casa: quem digita ali é o dono, e some o dia inteiro. */
export const PAUSE_TTL_SECONDS = 24 * 60 * 60;

/**
 * Número de um cliente nosso (tenant). Ali o celular é de uma PESSOA — a
 * vendedora que atende, manda recado e conversa com fornecedor o dia inteiro.
 * Cada mensagem dela renovava 24 h de silêncio, então a assistente vivia
 * calada (Conquista Solar, 09/09/2026). Duas horas cobrem um atendimento
 * humano inteiro sem sequestrar o número até o dia seguinte — e quem quiser
 * devolver na hora tem o "clara on".
 */
export const PAUSE_TTL_TENANT_SECONDS = 2 * 60 * 60;

const BOT_ECHO_TTL_SECONDS = 120;

export class TakeoverService {
  private redis: any;

  /** `clienteRedis` só nos testes — em produção ele abre a conexão sozinho. */
  constructor(host: string, port: number, password?: string, clienteRedis?: unknown) {
    this.redis = clienteRedis ?? new IORedis({ host, port, password, maxRetriesPerRequest: null });
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

  /** `ttlSegundos` deixa o canal do tenant pausar por menos tempo. */
  async pauseFor(phone: string, ttlSegundos: number = PAUSE_TTL_SECONDS): Promise<void> {
    await this.redis.setex(`takeover:${phone}`, ttlSegundos, new Date().toISOString());
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
