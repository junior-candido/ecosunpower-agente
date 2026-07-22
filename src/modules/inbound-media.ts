// Arquiva TUDO que o cliente envia (foto, PDF, video, audio) no cofre de anexos
// do lead, pra o Junior SEMPRE ter o original em maos (regra 04/06/2026).
// Reusa o bucket privado client-attachments + tabela lead_anexos (signed URL,
// PII protegida). NAO-FATAL: se falhar, loga e segue — nunca quebra o atendimento.

import type { SupabaseClient } from '@supabase/supabase-js';
import { uploadAnexo } from './anexos/storage.js';

export type InboundKind = 'imagem' | 'pdf' | 'video' | 'audio';

// PDF do cliente quase sempre e conta de luz; resto fica como midia recebida.
const TIPO_POR_KIND: Record<InboundKind, string> = {
  pdf: 'conta_luz',
  imagem: 'recebido_cliente',
  video: 'recebido_cliente',
  audio: 'recebido_cliente',
};

const EXT_FALLBACK: Record<InboundKind, string> = {
  imagem: 'jpg', pdf: 'pdf', video: 'mp4', audio: 'ogg',
};

function extFromMime(mime: string, kind: InboundKind): string {
  const m = (mime || '').toLowerCase();
  if (m.includes('pdf')) return 'pdf';
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('mp4')) return 'mp4';
  if (m.includes('ogg') || m.includes('opus')) return 'ogg';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  return EXT_FALLBACK[kind];
}

interface SupabaseLike {
  getClient(): SupabaseClient;
  insertAnexo(input: {
    lead_id: string; tipo: string; descricao: string | null;
    storage_path: string; mime_type: string | null; size_bytes: number | null;
    created_by: string;
    // [MT 3e] carimbo da empresa dona do anexo (lead_anexos está na 079)
    company_id?: string;
  }): Promise<{ ok: boolean; id?: string; error?: string }>;
}

// Salva o original e registra na tabela. messageId vai na descricao pra
// permitir recuperacao/auditoria futura (a Eva nao salvava isso antes).
export async function archiveInboundMedia(
  supabase: SupabaseLike,
  leadId: string,
  kind: InboundKind,
  base64: string,
  mimeType: string,
  messageId?: string,
  // [MT 3e] db = SupabaseService do crachá da mensagem (a LINHA do anexo vai
  // por ele + carimbo); o STORAGE fica SEMPRE no serviço (1º arg) — a 079 não
  // cobre storage.objects (mesma lição do currículo do RH, 18/07).
  opts?: { db?: SupabaseLike; companyId?: string },
): Promise<{ ok: boolean; storage_path?: string }> {
  try {
    if (!leadId || !base64) return { ok: false };
    const buffer = Buffer.from(base64, 'base64');
    const tipo = TIPO_POR_KIND[kind];
    const ext = extFromMime(mimeType, kind);

    const up = await uploadAnexo(supabase.getClient(), leadId, tipo, buffer, mimeType, ext);
    if (!up.ok || !up.storage_path) {
      console.warn(`[inbound-media] upload falhou (${kind}):`, up.error);
      return { ok: false };
    }

    const descricao = `Recebido do cliente via WhatsApp (${kind})${messageId ? ` · msg:${messageId}` : ''}`;
    const ins = await (opts?.db ?? supabase).insertAnexo({
      lead_id: leadId, tipo, descricao,
      storage_path: up.storage_path, mime_type: mimeType, size_bytes: buffer.byteLength,
      created_by: 'cliente',
      ...(opts?.companyId ? { company_id: opts.companyId } : {}),
    });
    if (!ins.ok) {
      console.warn(`[inbound-media] insertAnexo falhou (${kind}):`, ins.error);
      return { ok: false, storage_path: up.storage_path };
    }
    console.log(`[inbound-media] arquivado ${kind} do lead ${leadId} (${(buffer.byteLength / 1024).toFixed(0)}KB)`);
    return { ok: true, storage_path: up.storage_path };
  } catch (e) {
    console.warn(`[inbound-media] erro ao arquivar (${kind}):`, (e as Error).message);
    return { ok: false };
  }
}
