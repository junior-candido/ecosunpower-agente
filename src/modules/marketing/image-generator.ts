import { ImageGenerator } from '../image-gen.js';
import type { CreativeImage, CategoriaPortfolio } from './types.js';

const BASE_BY_CATEGORIA: Record<CategoriaPortfolio, string> = {
  on_grid_residencial: 'family-friendly residential house with solar panels on roof',
  on_grid_comercial: 'small business owner storefront with solar panels on roof',
  hibrido: 'modern house with solar panels and wall-mounted home battery',
  off_grid: 'rural property with off-grid solar system',
  ev_charger: 'EV wallbox installed at home garage, electric car charging',
  manutencao: 'technician inspecting solar panels on roof',
};

const STYLE_SUFFIX: Record<CreativeImage['style'], string> = {
  fotorealista: ', professional photo, golden hour lighting, photorealistic, EcoSunPower brand',
  grafico: ', flat infographic illustration, brand colors orange and blue, EcoSunPower',
  depoimento: ', documentary photo, candid, natural light, customer testimonial style',
};

function buildPrompt(briefing: string, categoria: CategoriaPortfolio, style: CreativeImage['style']): string {
  return `${BASE_BY_CATEGORIA[categoria]}, ${briefing}${STYLE_SUFFIX[style]}`;
}

function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('429') || msg.toLowerCase().includes('too many requests') || msg.toLowerCase().includes('rate limit');
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateOneWithRetry(
  imgGen: ImageGenerator,
  prompt: string,
  maxRetries = 3,
): Promise<{ url: string }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await imgGen.generate({ prompt, aspectRatio: '1:1', outputFormat: 'jpg' });
    } catch (err) {
      lastErr = err;
      if (!isRateLimitError(err) || attempt === maxRetries) throw err;
      const waitMs = 2000 * Math.pow(2, attempt); // 2s, 4s, 8s
      console.warn(`[image-generator] Rate limit (attempt ${attempt + 1}/${maxRetries + 1}), aguardando ${waitMs}ms...`);
      await sleep(waitMs);
    }
  }
  throw lastErr;
}

export async function generate3StyledImages(params: {
  briefing: string;
  categoria: CategoriaPortfolio;
  replicateToken: string;
}): Promise<CreativeImage[]> {
  const imgGen = new ImageGenerator(params.replicateToken);
  const styles: CreativeImage['style'][] = ['fotorealista', 'grafico', 'depoimento'];
  const results: CreativeImage[] = [];

  for (let i = 0; i < styles.length; i++) {
    const style = styles[i];
    const prompt = buildPrompt(params.briefing, params.categoria, style);
    const { url } = await generateOneWithRetry(imgGen, prompt);
    results.push({ url, style, prompt_used: prompt });
    // Pausa entre chamadas (não na última) pra suavizar rate limit
    if (i < styles.length - 1) {
      await sleep(800);
    }
  }

  return results;
}
