import { describe, it, expect } from 'vitest';

describe('buildHealthStatus', () => {
  it('should return healthy when all services are up', async () => {
    const { buildHealthStatus } = await import('../src/health.js');

    const status = await buildHealthStatus({
      redis: async () => true,
      supabase: async () => true,
      evolution: async () => true,
    });

    expect(status.status).toBe('healthy');
    expect(status.services.redis).toBe('up');
    expect(status.services.supabase).toBe('up');
    expect(status.services.evolution).toBe('up');
  });

  it('should return degraded when a non-critical service is down', async () => {
    const { buildHealthStatus } = await import('../src/health.js');

    const status = await buildHealthStatus({
      redis: async () => true,
      supabase: async () => false,
      evolution: async () => true,
    });

    expect(status.status).toBe('degraded');
    expect(status.services.supabase).toBe('down');
  });

  it('should return unhealthy when redis is down', async () => {
    const { buildHealthStatus } = await import('../src/health.js');

    const status = await buildHealthStatus({
      redis: async () => false,
      supabase: async () => true,
      evolution: async () => true,
    });

    expect(status.status).toBe('unhealthy');
  });
});
