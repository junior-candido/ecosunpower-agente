import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('loadConfig', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('should return valid config when all env vars are set', async () => {
    vi.stubEnv('PORT', '3000');
    vi.stubEnv('NODE_ENV', 'sandbox');
    vi.stubEnv('EVOLUTION_API_URL', 'http://localhost:8080');
    vi.stubEnv('EVOLUTION_API_KEY', 'test-key');
    vi.stubEnv('EVOLUTION_INSTANCE', 'test');
    vi.stubEnv('WEBHOOK_TOKEN', 'test-token');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test');
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'test-service-key');
    vi.stubEnv('REDIS_HOST', '127.0.0.1');
    vi.stubEnv('REDIS_PORT', '6379');
    vi.stubEnv('ENGINEER_PHONE', '5561999999999');
    vi.stubEnv('ENGINEER_NAME', 'Test Engineer');

    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig();

    expect(config.port).toBe(3000);
    expect(config.nodeEnv).toBe('sandbox');
    expect(config.anthropicApiKey).toBe('sk-ant-test');
  });

  it('should throw if required env vars are missing', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('EVOLUTION_API_URL', '');

    const { loadConfig } = await import('../src/config.js');
    expect(() => loadConfig()).toThrow();
  });
});
