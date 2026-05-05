// Tipos compartilhados entre proposal-assistant, template, eva-sender e attachments.

export type ModoEnvio = 'junior_envia' | 'eva_envia';
export type TipoProposta = 'basica' | 'personalizada';

export interface AttachmentInput {
  tipo: 'foto' | 'video';
  legenda: string;
  mediaIdWaba: string;
  mimeType?: string;
  storagePath?: string;
  thumbnailPath?: string;
  sizeBytes?: number;
}

export interface AttachmentRecord {
  id: string;
  propostaSlug: string;
  tipo: 'foto' | 'video';
  ordem: number;
  legenda: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  thumbnailPath: string | null;
  createdAt: string;
}

export const ATTACHMENT_LIMITS = {
  MAX_FOTOS: 3,
  MAX_VIDEOS: 1,
  FOTO_MAX_BYTES: 10 * 1024 * 1024,
  VIDEO_MAX_BYTES: 30 * 1024 * 1024,
  VIDEO_MAX_DURATION_SECONDS: 60,
  ALLOWED_FOTO_MIMES: ['image/jpeg', 'image/png', 'image/webp'] as const,
  ALLOWED_VIDEO_MIMES: ['video/mp4'] as const,
} as const;
