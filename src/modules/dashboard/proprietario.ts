// src/modules/dashboard/proprietario.ts

export interface ClienteSearchFilter {
  valid: boolean;
  /** termo normalizado para name.ilike */
  termo: string;
  /** cláusula pronta pro .or() do supabase */
  or: string;
}

/**
 * Constrói o filtro de busca de clientes (leads) por nome OU telefone.
 * Sanitiza o termo e exige no mínimo 2 chars. Quando há >=3 dígitos,
 * adiciona busca por telefone com os dígitos normalizados.
 */
export function buildClienteSearchFilter(raw: string): ClienteSearchFilter {
  const termo = String(raw ?? '').trim();
  if (termo.length < 2) return { valid: false, termo, or: '' };
  const digits = termo.replace(/\D/g, '');
  const clauses = [`name.ilike.%${termo}%`];
  if (digits.length >= 3) clauses.push(`phone.ilike.%${digits}%`);
  return { valid: true, termo, or: clauses.join(',') };
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

export type ProprietarioAcao =
  | { acao: 'manter' }
  | { acao: 'desvincular' }
  | { acao: 'vincular'; lead_id: string }
  | { acao: 'erro'; motivo: string };

/**
 * Interpreta os campos do form de editar usina ligados ao proprietário.
 * - desvincular=1            -> { acao: 'desvincular' }   (prioridade máxima)
 * - lead_id = UUID válido    -> { acao: 'vincular', lead_id }
 * - lead_id vazio/ausente    -> { acao: 'manter' }
 * - lead_id presente inválido-> { acao: 'erro' }
 */
export function parseProprietarioInput(body: Record<string, unknown>): ProprietarioAcao {
  if (String(body?.desvincular ?? '') === '1') return { acao: 'desvincular' };
  const raw = String(body?.lead_id ?? '').trim();
  if (raw === '') return { acao: 'manter' };
  if (!UUID_RE.test(raw)) return { acao: 'erro', motivo: 'lead_id inválido' };
  return { acao: 'vincular', lead_id: raw };
}
