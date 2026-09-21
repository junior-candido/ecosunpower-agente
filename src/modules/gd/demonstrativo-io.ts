// Entradas/saidas externas da ingestao do demonstrativo: baixar anexos do
// e-mail recebido na Resend e extrair o texto do PDF (unpdf, JS puro — sem
// binario nativo, roda igual no Windows e no container do EasyPanel).

import type { Anexo } from './demonstrativo-ingestao.js';

export async function baixarAnexosResend(apiKey: string, emailId: string): Promise<Anexo[]> {
  const { Resend } = await import('resend');
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.receiving.attachments.list({ emailId });
  if (error) throw new Error(`resend attachments.list: ${error.message ?? 'erro'}`);
  const lista = data?.data ?? [];
  const out: Anexo[] = [];
  for (const a of lista) {
    const r = await fetch(a.download_url);
    if (!r.ok) throw new Error(`download do anexo ${a.filename ?? a.id}: HTTP ${r.status}`);
    out.push({ nome: a.filename ?? null, tipo: a.content_type ?? null, bytes: new Uint8Array(await r.arrayBuffer()) });
  }
  return out;
}

export async function extrairTextoPdf(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}
