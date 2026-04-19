const OPENAI_IMAGES_URL = 'https://api.openai.com/v1/images/generations';

export type ImageSize = '1024x1024' | '1024x1792' | '1792x1024';

export interface GenerateImageOptions {
  prompt: string;
  size?: ImageSize;
  quality?: 'standard' | 'hd';
}

export class ImageGenerator {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  // Generates an image via DALL-E 3. Returns a temporary URL valid for 1 hour.
  async generate(opts: GenerateImageOptions): Promise<{ url: string; revisedPrompt?: string }> {
    const res = await fetch(OPENAI_IMAGES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: opts.prompt,
        n: 1,
        size: opts.size ?? '1024x1024',
        quality: opts.quality ?? 'standard',
      }),
    });

    const data = await res.json() as {
      data?: Array<{ url: string; revised_prompt?: string }>;
      error?: { message: string };
    };

    if (!res.ok || data.error) {
      throw new Error(`DALL-E generation failed: ${data.error?.message ?? res.statusText}`);
    }

    const image = data.data?.[0];
    if (!image?.url) throw new Error('DALL-E returned no image URL');

    return { url: image.url, revisedPrompt: image.revised_prompt };
  }

  // Downloads a remote image URL and returns the raw bytes plus content type.
  async downloadImage(url: string): Promise<{ bytes: Buffer; contentType: string }> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download image: HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') ?? 'image/png';
    return { bytes, contentType };
  }
}
