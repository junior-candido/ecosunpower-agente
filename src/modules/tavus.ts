// Tavus API client — gera videos fotorrealistas do Junior a partir de script/audio.
// Usado pra criar anuncios Meta (Stories/Reels/Feed) com o rosto do dono.
//
// Docs: https://docs.tavus.io/api-reference/video-request/create-video
// Auth: header `x-api-key: <TAVUS_API_KEY>`.

export type VideoStatus = 'queued' | 'generating' | 'ready' | 'error' | 'deleted';

export interface GenerateVideoInput {
  script: string;
  replicaId?: string;           // override do replica padrao (config.tavusReplicaId)
  videoName?: string;           // nome pra achar no dashboard
  backgroundUrl?: string;       // URL publica de imagem/video de fundo
  audioUrl?: string;            // URL de audio pronto (substitui o script — TTS skip)
  callbackUrl?: string;         // webhook que o Tavus chama quando fica ready
}

export interface TavusVideo {
  video_id: string;
  video_name?: string;
  status: VideoStatus;
  hosted_url?: string;         // URL pra assistir embed
  download_url?: string;       // MP4 direto pra baixar
  stream_url?: string;         // HLS pra player
  created_at?: string;
  updated_at?: string;
  error_message?: string;
}

export interface TavusReplica {
  replica_id: string;
  replica_name?: string;
  status: 'training' | 'ready' | 'error';
  model_name?: string;
  created_at?: string;
  training_progress?: string;  // ex: '6%'
  error_message?: string;
}

export class TavusService {
  private apiKey: string;
  private baseUrl: string;
  private defaultReplicaId?: string;

  constructor(opts: { apiKey: string; baseUrl?: string; defaultReplicaId?: string }) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? 'https://tavusapi.com';
    this.defaultReplicaId = opts.defaultReplicaId;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });

    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }

    if (!res.ok) {
      const msg =
        body && typeof body === 'object' && 'message' in (body as Record<string, unknown>)
          ? String((body as Record<string, unknown>).message)
          : res.statusText;
      throw new Error(`Tavus ${init.method ?? 'GET'} ${path} failed: HTTP ${res.status} — ${msg}`);
    }

    return body as T;
  }

  // =========================================================================
  // Replicas
  // =========================================================================

  async getReplica(replicaId: string): Promise<TavusReplica> {
    return this.request<TavusReplica>(`/v2/replicas/${replicaId}`);
  }

  async listReplicas(): Promise<{ data: TavusReplica[] }> {
    return this.request(`/v2/replicas`);
  }

  // =========================================================================
  // Videos
  // =========================================================================

  async generateVideo(input: GenerateVideoInput): Promise<TavusVideo> {
    const replicaId = input.replicaId ?? this.defaultReplicaId;
    if (!replicaId) throw new Error('Tavus: replicaId nao setado (passa no input ou defina TAVUS_REPLICA_ID)');
    if (!input.script && !input.audioUrl) {
      throw new Error('Tavus: forneca "script" ou "audioUrl"');
    }

    const payload: Record<string, unknown> = { replica_id: replicaId };
    if (input.script) payload.script = input.script;
    if (input.audioUrl) payload.audio_url = input.audioUrl;
    if (input.videoName) payload.video_name = input.videoName;
    if (input.backgroundUrl) payload.background_url = input.backgroundUrl;
    if (input.callbackUrl) payload.callback_url = input.callbackUrl;

    return this.request<TavusVideo>(`/v2/videos`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getVideo(videoId: string): Promise<TavusVideo> {
    return this.request<TavusVideo>(`/v2/videos/${videoId}`);
  }

  async deleteVideo(videoId: string): Promise<void> {
    await this.request(`/v2/videos/${videoId}`, { method: 'DELETE' });
  }

  /**
   * Polling sincrono: aguarda o video ficar ready (ou falhar).
   * Para videos curtos (~15s), Tavus costuma terminar em 1-3 min.
   * Nao use em handlers de webhook — use callbackUrl ou dispara sem bloquear.
   */
  async waitForVideo(videoId: string, opts: { timeoutMs?: number; pollMs?: number } = {}): Promise<TavusVideo> {
    const timeout = opts.timeoutMs ?? 10 * 60 * 1000; // 10 min default
    const poll = opts.pollMs ?? 5000;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      const video = await this.getVideo(videoId);
      if (video.status === 'ready') return video;
      if (video.status === 'error') {
        throw new Error(`Tavus video ${videoId} failed: ${video.error_message ?? 'unknown'}`);
      }
      if (video.status === 'deleted') {
        throw new Error(`Tavus video ${videoId} foi deletado antes de ficar ready`);
      }
      await new Promise((r) => setTimeout(r, poll));
    }

    throw new Error(`Tavus video ${videoId} timeout apos ${timeout}ms (status ainda pending)`);
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  async downloadVideo(url: string): Promise<Buffer> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Tavus downloadVideo HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
}
