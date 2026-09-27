// Pasta Digital: de QUAL empresa ela é? (27/09/2026)
//
// As rotas /dashboard/pastas/:id carregavam a pasta pelo id com o cliente
// mestre e nunca olhavam a empresa — um tenant logado que soubesse um id
// via/editava/enviava a pasta de outra empresa.
//
// Cuidado: pastas_cliente.company_id nasce com o id da EcoSun por DEFAULT
// (migration 098), então ele sozinho não prova dono. Regra:
//   - company_id da pasta diferente do padrão → é ele o dono;
//   - senão, o dono é a empresa do LEAD da pasta;
//   - sem nada → EcoSun (legado).
import type { SupabaseClient } from '@supabase/supabase-js';
import { EMPRESA_CASA } from './canal-envio.js';

type LinhaPasta = { company_id?: string | null; leads?: { company_id?: string | null } | null };

export function donoDaPasta(p: LinhaPasta): string {
  if (p.company_id && p.company_id !== EMPRESA_CASA) return p.company_id;
  return p.leads?.company_id ?? p.company_id ?? EMPRESA_CASA;
}

export function filtrarPastasDaEmpresa<T extends LinhaPasta>(rows: T[], companyId: string): T[] {
  return rows.filter((r) => donoDaPasta(r) === companyId);
}

/** A pasta, se ela for da empresa; senão null (inexistente e alheia são iguais pra quem chama). */
export async function pastaDaEmpresa(
  db: SupabaseClient,
  pastaId: string,
  companyId: string,
): Promise<any | null> {
  const { data, error } = await db
    .from('pastas_cliente')
    .select('*, leads(company_id)')
    .eq('id', pastaId)
    .maybeSingle();
  if (error || !data) return null;
  if (donoDaPasta(data as LinhaPasta) !== companyId) return null;
  const { leads: _lead, ...pasta } = data as Record<string, unknown>;
  return pasta;
}
