// src/modules/financeiro/comprovantes.ts
// Comprovantes da Caixa de Entrada — bucket PRÓPRIO (separado das mídias de
// cliente, que são PII). Upload best-effort: falha NÃO bloqueia o lançamento.
import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'financeiro-comprovantes';

const extDoMime = (mime: string): string =>
  mime.includes('pdf') ? 'pdf' : mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' :
  mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : 'jpg';

export async function uploadComprovante(
  client: SupabaseClient, base64: string, mimeType: string, competencia: string,
): Promise<string | null> {
  try {
    const path = `${competencia}/${randomUUID()}.${extDoMime(mimeType)}`;
    const { error } = await client.storage.from(BUCKET).upload(path, Buffer.from(base64, 'base64'), {
      contentType: mimeType, upsert: false,
    });
    if (error) {
      console.warn('[caixa-entrada] upload comprovante falhou:', error.message);
      return null;
    }
    return path;
  } catch (err) {
    console.warn('[caixa-entrada] upload comprovante exception:', (err as Error).message);
    return null;
  }
}

export async function getComprovanteUrls(
  client: SupabaseClient, paths: string[], ttlSeconds = 3600,
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await client.storage.from(BUCKET).createSignedUrls(paths, ttlSeconds);
  if (error || !data) {
    if (error) console.warn('[caixa-entrada] signed urls falhou:', error.message);
    return {};
  }
  const out: Record<string, string> = {};
  for (const r of data) if (r.signedUrl && r.path) out[r.path] = r.signedUrl;
  return out;
}
