// Gerador de imagem via Higgsfield Cloud API (qualidade top pros posts de marketing).
// Mesma interface do ImageGenerator (FLUX) em ../image-gen.ts → drop-in com fallback.
import { createHiggsfieldClient } from '@higgsfield/client/v2';

export type HiggsfieldAspectRatio = '1:1' | '4:5' | '9:16' | '16:9' | '3:2' | '2:3';

export interface HiggsfieldGenerateOptions {
  prompt: string;
  aspectRatio?: HiggsfieldAspectRatio;
  seed?: number;
}

// Modelo flux-pro servido pela API do Higgsfield (validado em 01/06).
const MODEL = 'flux-pro/kontext/max/text-to-image';

export class HiggsfieldImageGenerator {
  private client: ReturnType<typeof createHiggsfieldClient>;

  // credentials no formato "KEY_ID:KEY_SECRET" (env HIGGSFIELD_CREDENTIALS).
  constructor(credentials: string) {
    this.client = createHiggsfieldClient({ credentials });
  }

  async generate(opts: HiggsfieldGenerateOptions): Promise<{ url: string }> {
    const jobSet = await this.client.subscribe(MODEL, {
      input: {
        prompt: opts.prompt,
        aspect_ratio: opts.aspectRatio ?? '4:5',
        safety_tolerance: 2,
        ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
      },
      withPolling: true,
    });

    // A resposta real traz images[].url. Mantém fallback pro shape do README (jobs[].results).
    const j = jobSet as {
      images?: Array<{ url?: string }>;
      jobs?: Array<{ results?: { raw?: { url?: string } } }>;
    };
    const url = j.images?.[0]?.url ?? j.jobs?.[0]?.results?.raw?.url;
    if (!url) {
      throw new Error(`Higgsfield retornou sem URL: ${JSON.stringify(jobSet).slice(0, 200)}`);
    }
    return { url };
  }

  // Idêntico ao ImageGenerator.downloadImage pra ser intercambiável no fluxo de upload.
  async downloadImage(url: string): Promise<{ bytes: Buffer; contentType: string }> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download image: HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    return { bytes, contentType };
  }
}
