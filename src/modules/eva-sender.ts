// Envia proposta gerada direto pro cliente (modo eva_envia).
// Manda 2 mensagens: botão pra ver a proposta web -> PDF anexado.

import type { MetaWhatsAppService } from './meta-whatsapp.js';
import { empresa } from './empresa-config.js';

export interface EnviarPropostaInput {
  telefoneCliente: string;       // E.164 sem + ou formato BR (sera normalizado)
  nomeCliente: string;
  linkWebPublico: string;
  pdfBuffer: Buffer;
  pdfFilename: string;
  economiaMensal?: number | null; // pra linha persuasiva; null em só-serviço
}

const fmtRs = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

// [ECOSOF] empresa() avaliada na CHAMADA (arrow function) — runtime, não load.
const SAUDACAO = (nomeCliente: string, economiaMensal?: number | null) => {
  const primeiro = nomeCliente.trim().split(/\s+/)[0] || nomeCliente;
  const linhaEconomia =
    typeof economiaMensal === 'number' && economiaMensal > 0
      ? `Sua conta de luz fica cerca de ${fmtRs(economiaMensal)} mais barata por mês ☀️\n\n`
      : '';
  return (
    `Olá, ${primeiro}! 👋\n\n` +
    `Sou a ${empresa().nomeAtendente}, consultora da ${empresa().nomeFantasia} Energia Solar.\n\n` +
    `Junior preparou uma proposta personalizada de energia solar pra você. ${linhaEconomia}` +
    `Vou te mandar agora — é só tocar no botão pra ver. Qualquer dúvida, é só me perguntar aqui mesmo. 😊`
  );
};

const BOTAO_VER = '🌐 Ver minha proposta';
const PDF_CAPTION = `📄 Sua proposta em PDF — toque pra baixar, guardar ou imprimir.`;

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
    // 1) Saudação + botão clicável que ABRE a proposta web (URL escondida atrás do botão).
    await meta.sendCtaUrlButton(
      to,
      SAUDACAO(input.nomeCliente, input.economiaMensal),
      BOTAO_VER,
      input.linkWebPublico,
    );
    await new Promise((r) => setTimeout(r, 800));

    // 2) PDF como documento nativo (sem link, sem Drive) — é o "baixe o PDF".
    const upload = await meta.uploadMedia(input.pdfBuffer, 'application/pdf', input.pdfFilename);
    await meta.sendDocumentById(to, upload.mediaId, input.pdfFilename, PDF_CAPTION);

    return { ok: true };
  } catch (err) {
    const msg = (err as Error).message ?? 'erro desconhecido';
    return { ok: false, reason: msg };
  }
}
