import { describe, it, expect, vi } from 'vitest';
import { CreativeAgent } from '../../src/modules/marketing/creative-agent.js';

// vi.mock é hoisted ao topo, então as factories NÃO podem referenciar
// consts top-level (PERSONA_MOCK etc). Inlinamos os retornos aqui e
// reaproveitamos via dynamic import nos casos que precisam reescrever.
vi.mock('../../src/modules/marketing/personas.js', () => ({
  PersonasService: vi.fn(function (this: { getByCodigo: () => Promise<unknown> }) {
    this.getByCodigo = vi.fn().mockResolvedValue({
      id: 1,
      codigo: 'residencial_df_alto',
      nome: 'Residencial DF',
      categoria_portfolio: 'on_grid_residencial',
      descricao: '',
      conta_minima_brl: 700,
      consumo_minimo_kwh: 700,
      regiao_alvo: 'DF',
      palavras_proibidas: ['alugar terra'],
      contexto_marca: {},
    });
  }),
}));
vi.mock('../../src/modules/marketing/copy-generator.js', () => ({
  generateCopies: vi.fn().mockResolvedValue([
    { length: 'curto', headline: 'h1', body: 'b1', cta: 'CTA1' },
    { length: 'medio', headline: 'h2', body: 'b2', cta: 'CTA2' },
    { length: 'longo', headline: 'h3', body: 'b3', cta: 'CTA3' },
  ]),
}));
vi.mock('../../src/modules/marketing/image-generator.js', () => ({
  generate3StyledImages: vi.fn().mockResolvedValue([
    { url: 'https://replicate.com/img1.jpg', style: 'fotorealista', prompt_used: 'p1' },
    { url: 'https://replicate.com/img2.jpg', style: 'grafico', prompt_used: 'p2' },
    { url: 'https://replicate.com/img3.jpg', style: 'depoimento', prompt_used: 'p3' },
  ]),
}));
vi.mock('../../src/modules/marketing/creative-storage.js', () => ({
  CreativeStorage: vi.fn(function (this: {
    persistDraft: () => Promise<number>;
    logGeneration: () => Promise<void>;
    uploadImage: (url: string, id: number, i: number) => Promise<string>;
  }) {
    this.persistDraft = vi.fn().mockResolvedValue(42);
    this.logGeneration = vi.fn().mockResolvedValue(undefined);
    this.uploadImage = vi.fn().mockImplementation(async (_url: string, id: number, i: number) =>
      `https://supabase.co/creatives/${id}/img-${i}.png`);
  }),
}));

describe('CreativeAgent.generatePackage', () => {
  it('orquestra fluxo completo: persona + copy + imagens + filtros + persist + reupload', async () => {
    const agent = new CreativeAgent({} as never, 'fake-replicate-token');
    const result = await agent.generatePackage({
      briefing: 'casa Brasilia',
      persona_codigo: 'residencial_df_alto',
    });

    expect(result.creative_id).toBe(42);
    expect(result.persona.codigo).toBe('residencial_df_alto');
    expect(result.pkg.copies).toHaveLength(3);
    expect(result.pkg.imagens).toHaveLength(3);
    // URLs devem ser do Supabase agora (re-upload), não mais Replicate
    expect(result.pkg.imagens[0].url).toContain('supabase.co');
    expect(result.pkg.imagens[0].url).not.toContain('replicate.com');
    expect(result.pkg.cta_primario).toBe('CTA1');
  });

  it('throw quando persona nao existe', async () => {
    const { PersonasService } = await import('../../src/modules/marketing/personas.js');
    (PersonasService as ReturnType<typeof vi.fn>).mockImplementationOnce(function (
      this: { getByCodigo: () => Promise<null> },
    ) {
      this.getByCodigo = vi.fn().mockResolvedValue(null);
    });
    const agent = new CreativeAgent({} as never, 'fake-token');
    await expect(agent.generatePackage({
      briefing: 'x',
      persona_codigo: 'inexistente',
    })).rejects.toThrow('Persona inexistente nao encontrada');
  });
});
