import { describe, it, expect, vi } from 'vitest';

describe('Router', () => {
  it('should route text messages to brain handler', async () => {
    const { Router } = await import('../src/modules/router.js');
    const brainHandler = vi.fn().mockResolvedValue(undefined);
    const router = new Router({ onTextMessage: brainHandler });

    await router.handle({
      type: 'text',
      from: '5561999999999',
      content: 'Ola',
      timestamp: new Date().toISOString(),
      messageId: 'msg-1',
    });

    expect(brainHandler).toHaveBeenCalledWith('5561999999999', 'Ola');
  });

  it('should call onUnsupported for audio messages', async () => {
    const { Router } = await import('../src/modules/router.js');
    const brainHandler = vi.fn();
    const logHandler = vi.fn();
    const router = new Router({ onTextMessage: brainHandler, onUnsupported: logHandler });

    await router.handle({
      type: 'audio',
      from: '5561999999999',
      content: 'https://audio.url',
      timestamp: new Date().toISOString(),
      messageId: 'msg-2',
    });

    expect(brainHandler).not.toHaveBeenCalled();
    expect(logHandler).toHaveBeenCalledWith('5561999999999', 'audio');
  });

  it('should detect spam (same message 5+ times)', async () => {
    const { Router } = await import('../src/modules/router.js');
    const brainHandler = vi.fn().mockResolvedValue(undefined);
    const router = new Router({ onTextMessage: brainHandler });

    const msg = {
      type: 'text' as const,
      from: '5561999999999',
      content: 'GANHE DINHEIRO FACIL',
      timestamp: new Date().toISOString(),
      messageId: '',
    };

    for (let i = 0; i < 6; i++) {
      await router.handle({ ...msg, messageId: `msg-${i}` });
    }

    expect(brainHandler).toHaveBeenCalledTimes(5);
  });
});
