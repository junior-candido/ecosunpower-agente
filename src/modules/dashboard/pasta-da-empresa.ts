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

const CAMPOS_LISTA =
  'id, lead_id, company_id, slug, status, arquivos, acessos, ultimo_acesso_em, enviado_em, updated_at';

async function consultaLista(q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<any[]> {
  const { data, error } = await q;
  if (error) {
    console.warn('[pasta] lista da empresa:', error.message);
    return [];
  }
  return (data as any[] | null) ?? [];
}

/**
 * Lista de pastas da empresa, mais nova primeiro, até `limite`.
 * 27/09/2026: antes era "as 400 mais novas da plataforma" + filtro em memória
 * — pastas mais velhas do tenant sumiam. Agora a empresa entra na consulta:
 *   - EcoSun: igual a sempre (as mais novas + filtro pelo dono);
 *   - tenant: pastas com company_id dele + pastas com o company_id PADRÃO
 *     (EcoSun, migration 098) cujo LEAD é dele.
 */
export async function listarPastasDaEmpresa(db: SupabaseClient, companyId: string, limite = 400): Promise<any[]> {
  if (companyId === EMPRESA_CASA) {
    const todas = await consultaLista(db.from('pastas_cliente')
      .select(`${CAMPOS_LISTA}, leads(name, company_id)`)
      .order('updated_at', { ascending: false })
      .limit(limite));
    return filtrarPastasDaEmpresa(todas, companyId);
  }
  const [proprias, peloLead] = await Promise.all([
    consultaLista(db.from('pastas_cliente')
      .select(`${CAMPOS_LISTA}, leads(name, company_id)`)
      .eq('company_id', companyId)
      .order('updated_at', { ascending: false })
      .limit(limite)),
    consultaLista(db.from('pastas_cliente')
      .select(`${CAMPOS_LISTA}, leads!inner(name, company_id)`)
      .eq('company_id', EMPRESA_CASA)
      .eq('leads.company_id', companyId)
      .order('updated_at', { ascending: false })
      .limit(limite)),
  ]);
  const porId = new Map<string, any>();
  for (const p of [...proprias, ...peloLead]) if (!porId.has(p.id)) porId.set(p.id, p);
  return filtrarPastasDaEmpresa([...porId.values()], companyId)
    .sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')))
    .slice(0, limite);
}
