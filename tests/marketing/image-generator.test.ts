import { describe, it, expect, vi } from 'vitest';
import { generate3StyledImages } from '../../src/modules/marketing/image-generator.js';

const mockGenerate = vi.fn().mockResolvedValue({ url: 'https://fake.com/img.jpg' });

vi.mock('../../src/modules/image-gen.js', () => ({
  ImageGenerator: vi.fn(function (this: { generate: typeof mockGenerate }) {
    this.generate = mockGenerate;
  }),
}));

describe('generate3StyledImages', () => {
  it('retorna 3 imagens com estilos diferentes', async () => {
    mockGenerate.mockClear();
    const imgs = await generate3StyledImages({
      briefing: 'casa em Aguas Claras',
      categoria: 'on_grid_residencial',
      replicateToken: 'fake-token',
    });
    expect(imgs).toHaveLength(3);
    expect(imgs.map((i) => i.style).sort()).toEqual([
      'depoimento',
      'fotorealista',
      'grafico',
    ]);
    expect(mockGenerate).toHaveBeenCalledTimes(3);
  });

  it('prompt contem base da categoria + briefing + style suffix', async () => {
    mockGenerate.mockClear();
    const imgs = await generate3StyledImages({
      briefing: 'casa em Aguas Claras',
      categoria: 'on_grid_residencial',
      replicateToken: 'fake-token',
    });
    const fotoImg = imgs.find((i) => i.style === 'fotorealista');
    expect(fotoImg?.prompt_used).toContain('family-friendly residential house');
    expect(fotoImg?.prompt_used).toContain('casa em Aguas Claras');
    expect(fotoImg?.prompt_used).toContain('professional photo');
  });
});
