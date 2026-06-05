import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'client-attachments';

export interface UploadResult { ok: boolean; storage_path?: string; error?: string }

export async function uploadAnexo(
  client: SupabaseClient,
  leadId: string,
  tipo: string,
  buffer: Buffer,
  mimeType: string,
  ext: string,
): Promise<UploadResult> {
  const path = `${leadId}/${tipo}/${randomUUID()}.${ext}`;
  const { error } = await client.storage.from(BUCKET).upload(path, buffer, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, storage_path: path };
}

export async function deleteAnexoFile(client: SupabaseClient, storagePath: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await client.storage.from(BUCKET).remove([storagePath]);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function getSignedUrls(
  client: SupabaseClient,
  storagePaths: string[],
  ttlSeconds: number,
): Promise<Record<string, string>> {
  if (storagePaths.length === 0) return {};
  const { data, error } = await client.storage.from(BUCKET).createSignedUrls(storagePaths, ttlSeconds);
  if (error || !data) {
    if (error) console.warn('[anexos] createSignedUrls falhou:', error.message);
    return {};
  }
  const out: Record<string, string> = {};
  for (const r of data) if (r.signedUrl && r.path) out[r.path] = r.signedUrl;
  return out;
}
