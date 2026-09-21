// Entradas/saidas externas da ingestao do demonstrativo: anexos e cabecalhos
// do e-mail recebido na Resend, e o texto do PDF (unpdf, JS puro — sem
// binario nativo, roda igual no Windows e no container do EasyPanel).

import type { AnexoMeta } from './demonstrativo-ingestao.js';

const TIMEOUT_MS = 20_000;

async function resend(apiKey: string) {
  const { Resend } = await import('resend');
  return new Resend(apiKey);
}

/** So os metadados — o download fica pra depois de escolher o PDF. */
export async function listarAnexosResend(apiKey: string, emailId: string): Promise<AnexoMeta[]> {
  const r = await resend(apiKey);
  const { data, error } = await r.emails.receiving.attachments.list({ emailId });
  if (error) throw new Error(`resend attachments.list: ${error.message ?? 'erro'}`);
  return (data?.data ?? []).map((a) => ({ id: a.id, nome: a.filename ?? null, tipo: a.content_type ?? null }));
}

export async function baixarAnexoResend(apiKey: string, emailId: string, anexo: AnexoMeta): Promise<Uint8Array> {
  const r = await resend(apiKey);
  const { data, error } = await r.emails.receiving.attachments.get({ emailId, id: anexo.id });
  if (error || !data) throw new Error(`resend attachments.get: ${error?.message ?? 'sem dados'}`);
  const resp = await fetch(data.download_url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!resp.ok) throw new Error(`download do anexo ${anexo.nome ?? anexo.id}: HTTP ${resp.status}`);
  return new Uint8Array(await resp.arrayBuffer());
}

export async function buscarCabecalhosResend(apiKey: string, emailId: string): Promise<Record<string, unknown> | null> {
  const r = await resend(apiKey);
  const { data, error } = await r.emails.receiving.get(emailId);
  if (error) throw new Error(`resend receiving.get: ${error.message ?? 'erro'}`);
  return (data?.headers as Record<string, unknown> | null) ?? null;
}

export async function extrairTextoPdf(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}
