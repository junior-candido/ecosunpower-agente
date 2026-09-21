// Entradas/saidas externas da ingestao do demonstrativo: anexos e cabecalhos
// do e-mail recebido na Resend, e o texto do PDF (unpdf, JS puro — sem
// binario nativo, roda igual no Windows e no container do EasyPanel).

import type { AnexoMeta } from './demonstrativo-ingestao.js';
import { interpretarDkim, type ResultadoDkim } from './demonstrativo-email.js';

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

/**
 * Confere o DKIM no e-mail BRUTO: baixa o .eml pela Resend e o mailauth busca
 * a chave publica no DNS do dominio que assinou. Cabecalho de texto se forja;
 * isto nao. Sem bruto disponivel → 'desconhecido' (nao acusa golpe).
 */
export async function verificarOrigemResend(apiKey: string, emailId: string): Promise<ResultadoDkim> {
  const r = await resend(apiKey);
  const { data, error } = await r.emails.receiving.get(emailId);
  if (error) throw new Error(`resend receiving.get: ${error.message ?? 'erro'}`);
  const url = data?.raw?.download_url;
  if (!url) return 'desconhecido';
  const resp = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!resp.ok) throw new Error(`download do e-mail bruto: HTTP ${resp.status}`);
  const bruto = Buffer.from(await resp.arrayBuffer());
  const { dkimVerify } = await import('mailauth');
  const res = await dkimVerify(bruto);
  return interpretarDkim(res.results);
}

export async function extrairTextoPdf(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}
