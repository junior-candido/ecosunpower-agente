// src/modules/rh/validacao.ts
// Validação PURA da candidatura pública (sem IO): campos, consentimento LGPD,
// honeypot anti-spam e PDF de verdade (magic bytes %PDF-), máx 5MB.
import { variantesTelefone } from '../phone.js';

export const CURRICULO_MAX_BYTES = 5 * 1024 * 1024;

export interface CandidaturaInput {
  nome: string;
  telefone: string;
  email: string;
  vagaId: string;           // '' = banco de talentos
  consentimento: string;    // '1' quando o candidato marcou o aceite
  website: string;          // honeypot: humano deixa vazio, robô preenche
}

export interface CandidaturaValidada {
  nome: string;
  telefone: string;         // normalizado 55 + DDD + número
  email: string;
  vagaId: string | null;    // null = banco de talentos
}

export type ResultadoValidacao =
  | { ok: true; dados: CandidaturaValidada }
  | { ok: false; erro: string; spam?: boolean };

export function validarCandidatura(
  input: CandidaturaInput,
  arquivo: Buffer | null | undefined,
  nomeArquivo: string,
): ResultadoValidacao {
  if ((input.website ?? '').trim() !== '') return { ok: false, erro: 'spam', spam: true };

  const nome = (input.nome ?? '').trim();
  if (nome.length < 3) return { ok: false, erro: 'Preencha seu nome completo.' };

  if ((input.consentimento ?? '') !== '1') {
    return { ok: false, erro: 'É preciso autorizar o uso dos dados pra candidatura.' };
  }

  const variantes = variantesTelefone(input.telefone ?? '');
  const telefone = variantes.find((v) => v.length === 13 || v.length === 12) ?? '';
  if (!telefone) return { ok: false, erro: 'Telefone inválido — use DDD + número.' };

  if (!arquivo || arquivo.length === 0) return { ok: false, erro: 'Anexe seu currículo em PDF.' };
  if (arquivo.length > CURRICULO_MAX_BYTES) {
    return { ok: false, erro: 'Currículo acima de 5 MB — diminua o arquivo.' };
  }
  if (arquivo.length < 5 || !arquivo.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    return { ok: false, erro: `O arquivo "${nomeArquivo}" não é um PDF.` };
  }

  // vaga_id vem do cliente: formato errado (não-uuid) é lixo/adulteração — recusa
  // antes de qualquer IO (senão o PDF subia pro bucket e o INSERT estourava).
  const vagaId = (input.vagaId ?? '').trim();
  if (vagaId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(vagaId)) {
    return { ok: false, erro: 'Vaga inválida — escolha uma vaga da lista.' };
  }
  return { ok: true, dados: { nome, telefone, email: (input.email ?? '').trim(), vagaId: vagaId || null } };
}
