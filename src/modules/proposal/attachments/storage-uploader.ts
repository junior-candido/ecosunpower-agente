// Sobe buffer pro bucket Supabase 'estudos-personalizados' e gera signed URL.

import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'estudos-personalizados';
const SIGNED_URL_DEFAULT_TTL_SECONDS = 60 * 24 * 60 * 60; // 60 dias

export interface UploadResult {
  storagePath: string;
  signedUrl: string;
}

export async function uploadToStorage(
  supabase: SupabaseClient,
  input: {
    buffer: Buffer;
    propostaSlug: string;
    filename: string;
    mimeType: string;
    expiresInSeconds?: number;
  },
): Promise<UploadResult> {
  const path = `${input.propostaSlug}/${input.filename}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, input.buffer, {
      contentType: input.mimeType,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Storage upload falhou: ${uploadError.message}`);
  }

  const expires = input.expiresInSeconds ?? SIGNED_URL_DEFAULT_TTL_SECONDS;

  const { data: signed, error: signedError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expires);

  if (signedError || !signed) {
    throw new Error(`Signed URL falhou: ${signedError?.message ?? 'unknown'}`);
  }

  return { storagePath: path, signedUrl: signed.signedUrl };
}

export async function getSignedUrlFromPath(
  supabase: SupabaseClient,
  storagePath: string,
  expiresInSeconds = SIGNED_URL_DEFAULT_TTL_SECONDS,
): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data) throw new Error(`Signed URL falhou: ${error?.message ?? 'unknown'}`);
  return data.signedUrl;
}
