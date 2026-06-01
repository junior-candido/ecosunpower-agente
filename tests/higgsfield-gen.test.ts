import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHiggsfieldClient } from '@higgsfield/client/v2';

vi.mock('@higgsfield/client/v2', () => ({ createHiggsfieldClient: vi.fn() }));

import { HiggsfieldImageGenerator } from '../src/modules/marketing/higgsfield-gen.js';

const mockCreate = vi.mocked(createHiggsfieldClient);

function clientReturning(jobSet: unknown) {
  const subscribe = vi.fn().mockResolvedValue(jobSet);
  mockCreate.mockReturnValue({ subscribe } as unknown as ReturnType<typeof createHiggsfieldClient>);
  return subscribe;
}

describe('HiggsfieldImageGenerator', () => {
  beforeEach(() => mockCreate.mockReset());

  it('extrai a url de images[0].url', async () => {
    const subscribe = clientReturning({ images: [{ url: 'https://cdn/img.png' }] });
    const gen = new HiggsfieldImageGenerator('id:secret');
    const { url } = await gen.generate({ prompt: 'casa com painel solar', aspectRatio: '4:5' });

    expect(url).toBe('https://cdn/img.png');
    expect(subscribe).toHaveBeenCalledWith(
      'flux-pro/kontext/max/text-to-image',
      expect.objectContaining({
        input: expect.objectContaining({ prompt: 'casa com painel solar', aspect_ratio: '4:5' }),
        withPolling: true,
      }),
    );
  });

  it('repassa o seed quando informado', async () => {
    const subscribe = clientReturning({ images: [{ url: 'https://cdn/x.png' }] });
    const gen = new HiggsfieldImageGenerator('id:secret');
    await gen.generate({ prompt: 'p', seed: 42 });
    expect(subscribe.mock.calls[0][1].input.seed).toBe(42);
  });

  it('lança erro quando não vem url (pra acionar o fallback FLUX)', async () => {
    clientReturning({ images: [] });
    const gen = new HiggsfieldImageGenerator('id:secret');
    await expect(gen.generate({ prompt: 'p' })).rejects.toThrow(/sem URL/);
  });
});
