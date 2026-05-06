import { ATTACHMENT_LIMITS } from './types.js';

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

export function validateFotoUpload(input: { mimeType: string; sizeBytes: number }): ValidationResult {
  if (!ATTACHMENT_LIMITS.ALLOWED_FOTO_MIMES.includes(input.mimeType as any)) {
    return { ok: false, reason: `Formato não suportado. Aceito: JPG, PNG, WEBP. Recebido: ${input.mimeType}.` };
  }
  if (input.sizeBytes > ATTACHMENT_LIMITS.FOTO_MAX_BYTES) {
    return { ok: false, reason: `Tamanho excede 10MB. Recebido: ${(input.sizeBytes / 1024 / 1024).toFixed(1)}MB.` };
  }
  return { ok: true };
}

export function validateVideoUpload(input: {
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number;
}): ValidationResult {
  if (!ATTACHMENT_LIMITS.ALLOWED_VIDEO_MIMES.includes(input.mimeType as any)) {
    return { ok: false, reason: `Formato não suportado. Aceito: MP4. Recebido: ${input.mimeType}.` };
  }
  if (input.sizeBytes > ATTACHMENT_LIMITS.VIDEO_MAX_BYTES) {
    return { ok: false, reason: `Tamanho excede 30MB. Recebido: ${(input.sizeBytes / 1024 / 1024).toFixed(1)}MB.` };
  }
  if (input.durationSeconds > ATTACHMENT_LIMITS.VIDEO_MAX_DURATION_SECONDS) {
    return { ok: false, reason: `Duração ${input.durationSeconds.toFixed(0)}s excede 60s. Edita e reenvia.` };
  }
  return { ok: true };
}

export function validateAttachmentCount(input: {
  fotoCount: number;
  videoCount: number;
  novoTipo: 'foto' | 'video';
}): ValidationResult {
  if (input.novoTipo === 'foto' && input.fotoCount >= ATTACHMENT_LIMITS.MAX_FOTOS) {
    return { ok: false, reason: `Limite de ${ATTACHMENT_LIMITS.MAX_FOTOS} fotos atingido. Quer substituir alguma?` };
  }
  if (input.novoTipo === 'video' && input.videoCount >= ATTACHMENT_LIMITS.MAX_VIDEOS) {
    return { ok: false, reason: 'Já tem 1 vídeo. Quer substituir?' };
  }
  return { ok: true };
}
