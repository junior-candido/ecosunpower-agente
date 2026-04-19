// Image-to-video generator using Replicate (Luma Ray Flash 2 — 720p, 5s).
// Takes a static image URL, returns a URL to a generated MP4 video.

const REPLICATE_API = 'https://api.replicate.com/v1';
const MODEL = 'luma/ray-flash-2-720p';

export type VideoAspectRatio = '9:16' | '1:1' | '16:9' | '4:3' | '3:4';

export interface GenerateVideoOptions {
  imageUrl: string;
  prompt?: string; // motion description (optional)
  aspectRatio?: VideoAspectRatio;
  duration?: 5 | 9;
  loop?: boolean;
}

interface Prediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[];
  error?: string;
  urls: { get: string };
}

export class VideoGenerator {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  async generate(opts: GenerateVideoOptions): Promise<{ url: string }> {
    const input: Record<string, unknown> = {
      start_image_url: opts.imageUrl,
      aspect_ratio: opts.aspectRatio ?? '9:16',
      duration: String(opts.duration ?? 5),
      loop: opts.loop ?? false,
    };
    if (opts.prompt) input.prompt = opts.prompt;

    const res = await fetch(`${REPLICATE_API}/models/${MODEL}/predictions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        Prefer: 'wait=60',
      },
      body: JSON.stringify({ input }),
    });

    let prediction = await res.json() as Prediction;
    if (!res.ok) {
      throw new Error(`Replicate video create failed: ${prediction.error ?? res.statusText}`);
    }

    const deadline = Date.now() + 300000; // 5 min
    while (prediction.status !== 'succeeded' && prediction.status !== 'failed' && prediction.status !== 'canceled') {
      if (Date.now() > deadline) {
        throw new Error('Replicate video timed out after 5 minutes');
      }
      await new Promise((r) => setTimeout(r, 2500));
      const pollRes = await fetch(prediction.urls.get, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      prediction = await pollRes.json() as Prediction;
    }

    if (prediction.status !== 'succeeded') {
      throw new Error(`Replicate video ${prediction.status}: ${prediction.error ?? 'unknown'}`);
    }

    const url = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    if (!url) throw new Error('Replicate returned no video URL');
    return { url };
  }

  async downloadVideo(url: string): Promise<{ bytes: Buffer; contentType: string }> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download video: HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') ?? 'video/mp4';
    return { bytes, contentType };
  }
}
