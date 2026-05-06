// Baixa midia (foto/video/documento) via WABA Cloud API.
// Fluxo: GET /v18.0/{media_id} -> {url, mime_type} -> GET nessa url -> bytes.

const WABA_API_BASE = 'https://graph.facebook.com/v18.0';

export interface DownloadedMedia {
  buffer: Buffer;
  mimeType: string;
  sizeBytes: number;
}

export async function downloadWabaMedia(input: {
  mediaId: string;
  accessToken: string;
}): Promise<DownloadedMedia> {
  const metaResp = await fetch(`${WABA_API_BASE}/${input.mediaId}`, {
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (!metaResp.ok) {
    const body = await metaResp.text();
    throw new Error(`WABA media metadata failed (${metaResp.status}): ${body.slice(0, 200)}`);
  }

  const meta = await metaResp.json() as { url: string; mime_type: string };

  const fileResp = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (!fileResp.ok) {
    const body = await fileResp.text();
    throw new Error(`WABA media download failed (${fileResp.status}): ${body.slice(0, 200)}`);
  }

  const arrayBuf = await fileResp.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);

  return {
    buffer,
    mimeType: meta.mime_type,
    sizeBytes: buffer.length,
  };
}
