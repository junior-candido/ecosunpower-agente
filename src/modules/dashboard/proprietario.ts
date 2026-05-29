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
