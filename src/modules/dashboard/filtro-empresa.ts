// src/modules/dashboard/filtro-empresa.ts
// Filtro de empresa ÚNICO das consultas do Marketing/Cadência (R17), na mesma
// regra das outras fatias (usinaPertenceAoOperador / leadEhDaEmpresa):
//  - EcoSun (a casa): company_id = casa OU null (linha antiga sem empresa é da casa);
//  - tenant: só company_id = o dele;
//  - sem empresa (ou valor estranho): nada — filtra por um id que não existe.
// Devolve a expressão do `.or(...)` do PostgREST. Só aceita UUID, pra ninguém
// injetar vírgula/parêntese na expressão.
import { ECOSUN_COMPANY_ID } from '../tenant-resolver.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** UUID nulo: nenhuma empresa tem esse id. */
export const EMPRESA_NENHUMA = '00000000-0000-0000-0000-000000000000';

export function filtroEmpresa(companyId: string | null | undefined): string {
  if (!companyId || !UUID.test(companyId) || companyId === EMPRESA_NENHUMA) return `company_id.eq.${EMPRESA_NENHUMA}`;
  if (companyId === ECOSUN_COMPANY_ID) return `company_id.eq.${ECOSUN_COMPANY_ID},company_id.is.null`;
  return `company_id.eq.${companyId.toLowerCase()}`;
}
