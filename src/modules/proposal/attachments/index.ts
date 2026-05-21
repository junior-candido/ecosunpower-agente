// Orquestra: download WABA -> validacao -> upload Supabase -> thumbnail (se video) -> persistencia.
// processAttachment (com WABA media_id): usado pelo /proposta zap.
// processAttachmentFromBuffer (com buffer ja em maos): usado pela tela admin A4.

import type { SupabaseClient } from '@supabase/supabase-js';
import { downloadWabaMedia } from './whatsapp-media-downloader.js';
import { uploadToStorage } from './storage-uploader.js';
import { extractFirstFrame, getVideoDuration } from './video-thumbnail.js';
import {
  validateFotoUpload,
  validateVideoUpload,
  validateAttachmentCount,
} from './attachment-validator.js';

export interface ProcessAttachmentInput {
  mediaIdWaba: string;
  accessToken: string;
  proposalSlug: string;
  legenda: string;
  fotoCount: number;
  videoCount: number;
}

export interface ProcessAttachmentFromBufferInput {
  buffer: Buffer;
  mimeType: string;
  proposalSlug: string;
  legenda: string;
  fotoCount: number;
  videoCount: number;
}

export type ProcessAttachmentResult =
  | {
      ok: true;
      record: {
        tipo: 'foto' | 'video';
        ordem: number;
        legenda: string;
        storagePath: string;
        thumbnailPath: string | null;
        mimeType: string;
        sizeBytes: number;
      };
    }
  | { ok: false; reason: string };

export async function processAttachment(
  supabase: SupabaseClient,
  input: ProcessAttachmentInput,
): Promise<ProcessAttachmentResult> {
  const dl = await downloadWabaMedia({ mediaId: input.mediaIdWaba, accessToken: input.accessToken });
  return processAttachmentFromBuffer(supabase, {
    buffer: dl.buffer,
    mimeType: dl.mimeType,
    proposalSlug: input.proposalSlug,
    legenda: input.legenda,
    fotoCount: input.fotoCount,
    videoCount: input.videoCount,
  });
}

export async function processAttachmentFromBuffer(
  supabase: SupabaseClient,
  input: ProcessAttachmentFromBufferInput,
): Promise<ProcessAttachmentResult> {
  const sizeBytes = input.buffer.length;
  const isVideo = input.mimeType.startsWith('video/');
  const tipo: 'foto' | 'video' = isVideo ? 'video' : 'foto';

  const countCheck = validateAttachmentCount({
    fotoCount: input.fotoCount,
    videoCount: input.videoCount,
    novoTipo: tipo,
  });
  if (!countCheck.ok) return { ok: false, reason: countCheck.reason! };

  if (tipo === 'foto') {
    const v = validateFotoUpload({ mimeType: input.mimeType, sizeBytes });
    if (!v.ok) return { ok: false, reason: v.reason! };
  } else {
    const duration = await getVideoDuration(input.buffer);
    const v = validateVideoUpload({ mimeType: input.mimeType, sizeBytes, durationSeconds: duration });
    if (!v.ok) return { ok: false, reason: v.reason! };
  }

  const ordem = tipo === 'foto' ? input.fotoCount + 1 : 1;
  const ext =
    input.mimeType === 'image/png' ? 'png'
    : input.mimeType === 'image/webp' ? 'webp'
    : tipo === 'video' ? 'mp4'
    : 'jpg';
  const filename = tipo === 'foto' ? `foto-${ordem}.${ext}` : 'video.mp4';

  const upload = await uploadToStorage(supabase, {
    buffer: input.buffer,
    propostaSlug: input.proposalSlug,
    filename,
    mimeType: input.mimeType,
  });

  let thumbnailPath: string | null = null;
  if (tipo === 'video') {
    try {
      const { thumbnailBuffer } = await extractFirstFrame(input.buffer);
      const thumbUpload = await uploadToStorage(supabase, {
        buffer: thumbnailBuffer,
        propostaSlug: input.proposalSlug,
        filename: 'video-thumb.jpg',
        mimeType: 'image/jpeg',
      });
      thumbnailPath = thumbUpload.storagePath;
    } catch (err) {
      console.warn('[attachments] Thumbnail falhou:', (err as Error).message);
    }
  }

  const { error: insertErr } = await supabase
    .from('proposta_attachments')
    .insert({
      proposta_slug: input.proposalSlug,
      tipo,
      ordem,
      legenda: input.legenda,
      storage_path: upload.storagePath,
      mime_type: input.mimeType,
      size_bytes: sizeBytes,
      thumbnail_path: thumbnailPath,
    });

  if (insertErr) return { ok: false, reason: `DB insert falhou: ${insertErr.message}` };

  return {
    ok: true,
    record: {
      tipo,
      ordem,
      legenda: input.legenda,
      storagePath: upload.storagePath,
      thumbnailPath,
      mimeType: input.mimeType,
      sizeBytes,
    },
  };
}
