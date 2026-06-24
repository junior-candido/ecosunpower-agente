// src/modules/dashboard/users-store.ts
// Acesso a dashboard_users e dashboard_roles. Monta o DashUser (com papel+permissoes)
// usado pelo auth e pelas telas de /usuarios.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DashUser, Permissoes } from './permissions.js';

export interface RoleRow {
  id: string;
  company_id: string;
  nome: string;
  permissoes: Permissoes;
  is_admin: boolean;
}

interface UserRow {
  id: string;
  company_id: string;
  nome: string;
  login: string;
  senha_hash: string | null;
  role_id: string | null;
  ativo: boolean;
}

function montarDashUser(u: UserRow, role: RoleRow | null): DashUser {
  return {
    id: u.id,
    companyId: u.company_id,
    nome: u.nome,
    login: u.login,
    isAdmin: role?.is_admin ?? false,
    roleNome: role?.nome ?? '(sem papel)',
    permissoes: role?.permissoes ?? {},
  };
}

export async function getUserByLogin(
  client: SupabaseClient,
  companyId: string,
  login: string,
): Promise<{ user: DashUser; senhaHash: string | null } | null> {
  const { data: u } = await client
    .from('dashboard_users')
    .select('id, company_id, nome, login, senha_hash, role_id, ativo')
    .eq('company_id', companyId)
    .eq('login', login)
    .eq('ativo', true)
    .maybeSingle();
  if (!u) return null;
  const role = u.role_id ? await getRole(client, u.role_id) : null;
  return { user: montarDashUser(u as UserRow, role), senhaHash: (u as UserRow).senha_hash };
}

export async function getUserById(client: SupabaseClient, id: string): Promise<DashUser | null> {
  const { data: u } = await client
    .from('dashboard_users')
    .select('id, company_id, nome, login, senha_hash, role_id, ativo')
    .eq('id', id)
    .eq('ativo', true)
    .maybeSingle();
  if (!u) return null;
  const role = (u as UserRow).role_id ? await getRole(client, (u as UserRow).role_id!) : null;
  return montarDashUser(u as UserRow, role);
}

export async function getRole(client: SupabaseClient, id: string): Promise<RoleRow | null> {
  const { data } = await client
    .from('dashboard_roles')
    .select('id, company_id, nome, permissoes, is_admin')
    .eq('id', id)
    .maybeSingle();
  return (data as RoleRow) ?? null;
}

export async function listRoles(client: SupabaseClient, companyId: string): Promise<RoleRow[]> {
  const { data } = await client
    .from('dashboard_roles')
    .select('id, company_id, nome, permissoes, is_admin')
    .eq('company_id', companyId)
    .order('nome');
  return (data as RoleRow[]) ?? [];
}

export interface UserListItem {
  id: string; nome: string; login: string; ativo: boolean; role_nome: string | null;
}

export async function listUsers(client: SupabaseClient, companyId: string): Promise<UserListItem[]> {
  const { data } = await client
    .from('dashboard_users')
    .select('id, nome, login, ativo, dashboard_roles(nome)')
    .eq('company_id', companyId)
    .order('nome');
  return (data ?? []).map((u: any) => ({
    id: u.id, nome: u.nome, login: u.login, ativo: u.ativo,
    role_nome: u.dashboard_roles?.nome ?? null,
  }));
}

export async function createUser(
  client: SupabaseClient,
  input: { companyId: string; nome: string; login: string; senhaHash: string; roleId: string },
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await client.from('dashboard_users').insert({
    company_id: input.companyId, nome: input.nome, login: input.login,
    senha_hash: input.senhaHash, role_id: input.roleId, ativo: true,
  }).select('id').single();
  if (error) return { error: error.code === '23505' ? 'login_em_uso' : error.message };
  return { id: (data as { id: string }).id };
}

export async function updateUser(
  client: SupabaseClient,
  id: string,
  patch: { nome?: string; roleId?: string; ativo?: boolean; senhaHash?: string },
): Promise<void> {
  const upd: Record<string, unknown> = {};
  if (patch.nome !== undefined) upd.nome = patch.nome;
  if (patch.roleId !== undefined) upd.role_id = patch.roleId;
  if (patch.ativo !== undefined) upd.ativo = patch.ativo;
  if (patch.senhaHash !== undefined) upd.senha_hash = patch.senhaHash;
  if (Object.keys(upd).length === 0) return;
  await client.from('dashboard_users').update(upd).eq('id', id);
}

export async function touchLastLogin(client: SupabaseClient, id: string): Promise<void> {
  await client.from('dashboard_users').update({ last_login_at: new Date().toISOString() }).eq('id', id);
}
