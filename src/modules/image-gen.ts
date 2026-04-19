// Image generator using Replicate (FLUX 1.1 Pro).
// More photorealistic than DALL-E 3 and cheaper (~R$0.20 vs R$0.40).

const REPLICATE_API = 'https://api.replicate.com/v1';
const MODEL = 'black-forest-labs/flux-1.1-pro';

export type AspectRatio = '1:1' | '4:5' | '9:16' | '16:9' | '3:2' | '2:3';

export interface GenerateImageOptions {
  prompt: string;
  aspectRatio?: AspectRatio;
  outputFormat?: 'webp' | 'jpg' | 'png';
  outputQuality?: number; // 1-100
}

interface Prediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[];
  error?: string;
  urls: { get: string };
}

export class ImageGenerator {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  async generate(opts: GenerateImageOptions): Promise<{ url: string; revisedPrompt?: string }> {
    // Use the sync endpoint: Prefer: wait=60 tells Replicate to wait up to 60s for completion
    const res = await fetch(`${REPLICATE_API}/models/${MODEL}/predictions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        Prefer: 'wait=60',
      },
      body: JSON.stringify({
        input: {
          prompt: opts.prompt,
          aspect_ratio: opts.aspectRatio ?? '1:1',
          output_format: opts.outputFormat ?? 'jpg',
          output_quality: opts.outputQuality ?? 90,
          safety_tolerance: 2,
          prompt_upsampling: true,
        },
      }),
    });

    let prediction = await res.json() as Prediction;
    if (!res.ok) {
      throw new Error(`Replicate prediction create failed: ${prediction.error ?? res.statusText}`);
    }

    // Poll if not yet complete (in case Prefer: wait=60 timed out)
    const deadline = Date.now() + 120000;
    while (prediction.status !== 'succeeded' && prediction.status !== 'failed' && prediction.status !== 'canceled') {
      if (Date.now() > deadline) {
        throw new Error('Replicate prediction timed out after 2 minutes');
      }
      await new Promise((r) => setTimeout(r, 1500));
      const pollRes = await fetch(prediction.urls.get, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      prediction = await pollRes.json() as Prediction;
    }

    if (prediction.status !== 'succeeded') {
      throw new Error(`Replicate prediction ${prediction.status}: ${prediction.error ?? 'unknown error'}`);
    }

    const url = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    if (!url) throw new Error('Replicate returned no output URL');

    return { url };
  }

  async downloadImage(url: string): Promise<{ bytes: Buffer; contentType: string }> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download image: HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    return { bytes, contentType };
  }
}
