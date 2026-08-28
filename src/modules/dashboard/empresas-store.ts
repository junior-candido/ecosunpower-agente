// src/modules/dashboard/empresas-store.ts
// Fase 2 fatia A1 (docs/ecosof/07): provisionar TENANT — empresa + papel
// Administrador + 1º usuário. Roda SEMPRE no client de SERVIÇO: é operação
// cross-tenant do admin da EcoSun, e companies/dashboard_* são identidade
// (fora do crachá de propósito, mesma regra do /usuarios).
import type { SupabaseClient } from '@supabase/supabase-js';

export interface EmpresaListItem {
  id: string;
  nome: string;
  ativo: boolean;
  createdAt: string;
  usuarios: number;
}

export async function listCompaniesComUsuarios(client: SupabaseClient): Promise<EmpresaListItem[]> {
  const { data } = await client
    .from('companies')
    .select('id, nome, ativo, created_at, dashboard_users(count)')
    .order('created_at', { ascending: true });
  return ((data as any[]) ?? []).map((c) => ({
    id: c.id,
    nome: c.nome,
    ativo: c.ativo,
    createdAt: c.created_at,
    usuarios: c.dashboard_users?.[0]?.count ?? 0,
  }));
}

/** 1º usuário com e-mail da empresa (o administrador) — alvo do "Reenviar convite". */
export async function adminComEmailDaEmpresa(
  client: SupabaseClient,
  companyId: string,
): Promise<{ id: string; companyId: string; nome: string; email: string } | null> {
  const { data } = await client
    .from('dashboard_users')
    .select('id, nome, email')
    .eq('company_id', companyId)
    .eq('ativo', true)
    .not('email', 'is', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const u = data as { id: string; nome: string; email: string } | null;
  return u ? { id: u.id, companyId, nome: u.nome, email: String(u.email).trim().toLowerCase() } : null;
}

export interface CriarEmpresaInput {
  nome: string;
  adminNome: string;
  adminLogin: string;
  adminEmail?: string | null;
  senhaHash: string;
}

export type CriarEmpresaResult =
  | { companyId: string; roleId: string; userId: string }
  | { error: string };

/**
 * Cria empresa → papel "Administrador" (is_admin) → 1º usuário, nessa ordem.
 * PostgREST não tem transação: se falhar no MEIO, devolve o erro COM o que já
 * foi criado no texto (o admin retoma pela tela de usuários do tenant ou apaga
 * a empresa no SQL Editor) — melhor erro honesto que rollback fingido.
 */
export async function criarEmpresaComAdmin(
  client: SupabaseClient,
  input: CriarEmpresaInput,
): Promise<CriarEmpresaResult> {
  const { data: comp, error: e1 } = await client
    .from('companies')
    .insert({ nome: input.nome, ativo: true })
    .select('id')
    .single();
  if (e1 || !comp) return { error: `empresa não criada: ${e1?.message ?? 'sem id'}` };
  const companyId = (comp as { id: string }).id;

  const { data: role, error: e2 } = await client
    .from('dashboard_roles')
    .insert({ company_id: companyId, nome: 'Administrador', is_admin: true, permissoes: {} })
    .select('id')
    .single();
  if (e2 || !role) {
    return { error: `empresa ${companyId} criada, mas o papel falhou: ${e2?.message ?? 'sem id'} — apagar a empresa no SQL Editor e tentar de novo` };
  }
  const roleId = (role as { id: string }).id;

  const { data: user, error: e3 } = await client
    .from('dashboard_users')
    .insert({
      company_id: companyId,
      nome: input.adminNome,
      login: input.adminLogin,
      email: input.adminEmail ?? null,
      senha_hash: input.senhaHash,
      role_id: roleId,
      ativo: true,
    })
    .select('id')
    .single();
  if (e3 || !user) {
    const motivo = e3?.code === '23505' ? 'login já existe nessa empresa' : (e3?.message ?? 'sem id');
    return { error: `empresa ${companyId} e papel criados, mas o usuário falhou (login): ${motivo}` };
  }

  return { companyId, roleId, userId: (user as { id: string }).id };
}
