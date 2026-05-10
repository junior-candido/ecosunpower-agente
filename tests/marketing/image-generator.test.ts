import { describe, it, expect, vi } from 'vitest';
import { generate3StyledImages } from '../../src/modules/marketing/image-generator.js';

const mockGenerate = vi.fn();

vi.mock('../../src/modules/image-gen.js', () => ({
  ImageGenerator: vi.fn(function (this: { generate: typeof mockGenerate }) {
    this.generate = mockGenerate;
  }),
}));

describe('generate3StyledImages', () => {
  it('retorna 3 imagens sequencialmente com estilos diferentes', async () => {
    mockGenerate.mockReset();
    mockGenerate.mockResolvedValue({ url: 'https://fake.com/img.jpg' });
    const imgs = await generate3StyledImages({
      briefing: 'casa em Aguas Claras',
      categoria: 'on_grid_residencial',
      replicateToken: 'fake-token',
    });
    expect(imgs).toHaveLength(3);
    expect(imgs.map(i => i.style).sort()).toEqual(['depoimento', 'fotorealista', 'grafico']);
    expect(mockGenerate).toHaveBeenCalledTimes(3);
  });

  it('prompt contem base da categoria + briefing + style suffix', async () => {
    mockGenerate.mockReset();
    mockGenerate.mockResolvedValue({ url: 'https://fake.com/img.jpg' });
    const imgs = await generate3StyledImages({
      briefing: 'casa em Aguas Claras',
      categoria: 'on_grid_residencial',
      replicateToken: 'fake-token',
    });
    const fotoImg = imgs.find(i => i.style === 'fotorealista');
    expect(fotoImg?.prompt_used).toContain('family-friendly residential house');
    expect(fotoImg?.prompt_used).toContain('casa em Aguas Claras');
    expect(fotoImg?.prompt_used).toContain('professional photo');
  });

  it('retry em 429 e sucesso na 2a tentativa', async () => {
    mockGenerate.mockReset();
    // 1a chamada: falha 429. 2a (retry): sucesso. 3a e 4a (proximas styles): sucesso direto.
    mockGenerate
      .mockRejectedValueOnce(new Error('Replicate prediction create failed: Too Many Requests'))
      .mockResolvedValue({ url: 'https://fake.com/img.jpg' });

    const imgs = await generate3StyledImages({
      briefing: 'teste',
      categoria: 'on_grid_residencial',
      replicateToken: 'fake-token',
    });
    expect(imgs).toHaveLength(3);
    expect(mockGenerate).toHaveBeenCalledTimes(4); // 1 falha + 3 sucessos
  }, 15000); // timeout maior pq retry tem sleep 2s

  it('falha apos 3 retries em 429', async () => {
    mockGenerate.mockReset();
    mockGenerate.mockRejectedValue(new Error('Too Many Requests'));

    await expect(generate3StyledImages({
      briefing: 'teste',
      categoria: 'on_grid_residencial',
      replicateToken: 'fake-token',
    })).rejects.toThrow('Too Many Requests');
    // Tentou 4 vezes (1 + 3 retries) na primeira imagem antes de desistir
    expect(mockGenerate).toHaveBeenCalledTimes(4);
  }, 30000); // timeout grande pq retries somam 2+4+8=14s sleep
});
