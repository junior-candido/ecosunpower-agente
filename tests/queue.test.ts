import { describe, it, expect, vi } from 'vitest';

vi.mock('bullmq', () => {
  return {
    Queue: class MockQueue {
      add = vi.fn().mockResolvedValue({ id: 'job-1' });
      close = vi.fn().mockResolvedValue(undefined);
    },
    Worker: class MockWorker {
      on = vi.fn();
      close = vi.fn().mockResolvedValue(undefined);
      constructor(_name: string, _handler: unknown, _opts: unknown) {}
    },
  };
});

vi.mock('ioredis', () => {
  return {
    default: class MockRedis {
      status = 'ready';
      ping = vi.fn().mockResolvedValue('PONG');
      quit = vi.fn().mockResolvedValue(undefined);
    },
  };
});

describe('MessageQueue', () => {
  it('should create queue and worker', async () => {
    const { MessageQueue } = await import('../src/modules/queue.js');
    const queue = new MessageQueue('127.0.0.1', 6379, async () => {});
    expect(queue).toBeDefined();
  });

  it('should add message to queue', async () => {
    const { MessageQueue } = await import('../src/modules/queue.js');
    const queue = new MessageQueue('127.0.0.1', 6379, async () => {});
    await queue.addMessage({
      type: 'text',
      from: '5561999999999',
      content: 'Ola',
      timestamp: new Date().toISOString(),
      messageId: 'msg-1',
    });
    expect(queue).toBeDefined();
  });

  it('carrega companyId no job (multi-tenant fatia 1)', async () => {
    const { MessageQueue } = await import('../src/modules/queue.js');
    const queue = new MessageQueue('127.0.0.1', 6379, async () => {});
    // Campo opcional: enfileira sem quebrar tipo/runtime e chega no add da fila.
    await queue.addMessage({
      type: 'text',
      from: '5561999999999',
      content: 'Ola',
      timestamp: new Date().toISOString(),
      messageId: 'msg-mt',
      companyId: '00000000-0000-0000-0000-000000000002',
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const addMock = (queue as any).queue.add as ReturnType<typeof vi.fn>;
    const jobData = addMock.mock.calls.at(-1)?.[1];
    expect(jobData.companyId).toBe('00000000-0000-0000-0000-000000000002');
  });

  it('should check Redis health', async () => {
    const { MessageQueue } = await import('../src/modules/queue.js');
    const queue = new MessageQueue('127.0.0.1', 6379, async () => {});
    const isHealthy = await queue.isHealthy();
    expect(isHealthy).toBe(true);
  });
});
