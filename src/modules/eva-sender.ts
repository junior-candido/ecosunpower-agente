// Envia proposta gerada direto pro cliente (modo eva_envia).
// Manda 3 mensagens em sequencia: saudacao -> link web -> PDF.

import type { MetaWhatsAppService } from './meta-whatsapp.js';

export interface EnviarPropostaInput {
  telefoneCliente: string;       // E.164 sem + ou formato BR (sera normalizado)
  nomeCliente: string;
  linkWebPublico: string;
  pdfBuffer: Buffer;
  pdfFilename: string;
}

const SAUDACAO = (nomeCliente: string) =>
  `Olá, ${nomeCliente}! 👋\n\n` +
  `Sou a Eva, consultora da EcoSunPower Energia Solar.\n\n` +
  `Junior preparou uma proposta personalizada de energia solar pra você. Vou te mandar agora pra dar uma olhada com calma.\n\n` +
  `Qualquer dúvida, é só me perguntar aqui mesmo. 😊`;

const LINK_WEB = (link: string) =>
  `🔗 Versão online (recomendada — abre no celular):\n${link}\n\n_(Link válido por 60 dias)_`;

const PDF_CAPTION = `📎 Versão em PDF pra arquivar ou imprimir.`;

// Normaliza telefone pra E.164 sem +. Aceita "(61) 99697-8781", "+5561996978781", "5561996978781", "61996978781".
function normalizePhone(raw: string): string {
  const onlyDigits = raw.replace(/\D/g, '');
  if (onlyDigits.length === 11 && /^[1-9]/.test(onlyDigits)) {
    return `55${onlyDigits}`;
  }
  if (onlyDigits.length === 13 && onlyDigits.startsWith('55')) {
    return onlyDigits;
  }
  if (onlyDigits.length === 12 && onlyDigits.startsWith('55')) {
    // 12 digitos = sem o 9 do celular (telefone fixo ou cel antigo). Aceita.
    return onlyDigits;
  }
  // Fallback: retorna o que tem, com cara que vai dar erro mais claro no Meta
  return onlyDigits;
}

export async function enviarPropostaParaCliente(
  meta: MetaWhatsAppService,
  input: EnviarPropostaInput,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const to = normalizePhone(input.telefoneCliente);

  try {
    await meta.sendText(to, SAUDACAO(input.nomeCliente));
    await new Promise((r) => setTimeout(r, 800));

    await meta.sendText(to, LINK_WEB(input.linkWebPublico));
    await new Promise((r) => setTimeout(r, 800));

    const upload = await meta.uploadMedia(input.pdfBuffer, 'application/pdf', input.pdfFilename);
    await meta.sendDocumentById(to, upload.mediaId, input.pdfFilename, PDF_CAPTION);

    return { ok: true };
  } catch (err) {
    const msg = (err as Error).message ?? 'erro desconhecido';
    return { ok: false, reason: msg };
  }
}
