// src/modules/marketing/image-generator.ts
// Wrapper sobre src/modules/image-gen.ts (Replicate Flux 1.1 Pro).
// Gera 3 imagens em paralelo (fotorealista/grafico/depoimento) com
// prompts adaptados por categoria do portfolio EcoSunPower.

import { ImageGenerator } from '../image-gen.js';
import type { CreativeImage, CategoriaPortfolio } from './types.js';

const BASE_BY_CATEGORIA: Record<CategoriaPortfolio, string> = {
  on_grid_residencial: 'family-friendly residential house with solar panels on roof',
  on_grid_comercial: 'small business owner storefront with solar panels on roof',
  hibrido: 'modern house with solar panels and wall-mounted home battery',
  off_grid: 'rural property with off-grid solar system, sítio brasileiro',
  ev_charger: 'EV wallbox installed at home garage, electric car charging',
  manutencao: 'technician inspecting solar panels on roof',
};

const STYLE_SUFFIX: Record<CreativeImage['style'], string> = {
  fotorealista: ', professional photo, golden hour lighting, photorealistic, EcoSunPower brand context',
  grafico: ', flat infographic illustration, brand colors orange and blue, EcoSunPower',
  depoimento: ', documentary photo, candid, natural light, customer testimonial style',
};

function buildPrompt(
  briefing: string,
  categoria: CategoriaPortfolio,
  style: CreativeImage['style'],
): string {
  const base = BASE_BY_CATEGORIA[categoria];
  const suffix = STYLE_SUFFIX[style];
  return `${base}, ${briefing}${suffix}`;
}

export async function generate3StyledImages(params: {
  briefing: string;
  categoria: CategoriaPortfolio;
  replicateToken: string;
}): Promise<CreativeImage[]> {
  const imgGen = new ImageGenerator(params.replicateToken);
  const styles: CreativeImage['style'][] = ['fotorealista', 'grafico', 'depoimento'];

  const results = await Promise.all(
    styles.map(async (style) => {
      const prompt = buildPrompt(params.briefing, params.categoria, style);
      const { url } = await imgGen.generate({
        prompt,
        aspectRatio: '1:1',
        outputFormat: 'jpg',
      });
      return { url, style, prompt_used: prompt } as CreativeImage;
    }),
  );

  return results;
}
