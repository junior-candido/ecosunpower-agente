import { describe, it, expect, vi } from 'vitest';

global.fetch = vi.fn();

describe('EvolutionService', () => {
  it('should send text message', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ key: { id: 'msg-123' } }),
    });

    const { EvolutionService } = await import('../src/modules/evolution.js');
    const service = new EvolutionService({
      evolutionApiUrl: 'http://localhost:8080',
      evolutionApiKey: 'test-key',
      evolutionInstance: 'ecosunpower',
      webhookToken: 'test-token',
    });

    await service.sendText('5561999999999', 'Ola!');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8080/message/sendText/ecosunpower',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'apikey': 'test-key' }),
      })
    );
  });

  it('should parse text webhook', async () => {
    const { EvolutionService } = await import('../src/modules/evolution.js');
    const service = new EvolutionService({
      evolutionApiUrl: 'http://localhost:8080',
      evolutionApiKey: 'k',
      evolutionInstance: 'i',
      webhookToken: 't',
    });

    const parsed = service.parseWebhook({
      data: {
        key: { remoteJid: '5561999999999@s.whatsapp.net', id: 'msg-456' },
        message: { conversation: 'Ola, quero saber sobre energia solar' },
        messageTimestamp: 1713470400,
      },
    });

    expect(parsed?.type).toBe('text');
    expect(parsed?.from).toBe('5561999999999');
    expect(parsed?.content).toBe('Ola, quero saber sobre energia solar');
    expect(parsed?.messageId).toBe('msg-456');
  });

  it('should parse audio webhook', async () => {
    const { EvolutionService } = await import('../src/modules/evolution.js');
    const service = new EvolutionService({
      evolutionApiUrl: 'http://localhost:8080',
      evolutionApiKey: 'k',
      evolutionInstance: 'i',
      webhookToken: 't',
    });

    const parsed = service.parseWebhook({
      data: {
        key: { remoteJid: '5561999999999@s.whatsapp.net', id: 'msg-789' },
        message: { audioMessage: { url: 'https://example.com/audio.ogg' } },
        messageTimestamp: 1713470400,
      },
    });

    expect(parsed?.type).toBe('audio');
    expect(parsed?.content).toBe('https://example.com/audio.ogg');
  });

  it('should validate webhook token', async () => {
    const { EvolutionService } = await import('../src/modules/evolution.js');
    const service = new EvolutionService({
      evolutionApiUrl: 'http://localhost:8080',
      evolutionApiKey: 'k',
      evolutionInstance: 'i',
      webhookToken: 'secret',
    });

    expect(service.validateWebhookToken('secret')).toBe(true);
    expect(service.validateWebhookToken('wrong')).toBe(false);
  });
});
