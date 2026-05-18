// src/modules/monitoring/relatorio/resolver.ts
// Lógica pura do /r/:slug (testável sem Express). Mesma regra de slug do /p/:slug.
const SLUG_RE = /^[A-Za-z0-9_-]{16,32}$/;

export interface ResolverDeps {
  getSlug: (slug: string) => Promise<{ sistema_id: string; expira_em: string } | null>;
}

export async function resolverRelatorioSlug(
  deps: ResolverDeps,
  slug: string,
): Promise<{ status: 'invalido' } | { status: 'expirado' } | { status: 'ok'; sistemaId: string }> {
  if (!SLUG_RE.test(slug)) return { status: 'invalido' };
  const row = await deps.getSlug(slug);
  if (!row) return { status: 'expirado' };
  return { status: 'ok', sistemaId: row.sistema_id };
}
