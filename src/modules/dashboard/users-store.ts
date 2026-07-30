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

// [Fatia 3a assinaturas] Empresa travada por falta de pagamento (companies.
// ativo = false) barra TODOS os usuários dela — no login e a cada request
// (getUserById roda por request → travou, o tenant cai na hora). Sem embed
// (mock antigo) ou ativo = true → passa (compat; a EcoSun está sempre ativa).
function companyTravada(u: unknown): boolean {
  return (u as { companies?: { ativo?: boolean } }).companies?.ativo === false;
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
    // [Fase 2 A2] embed companies(nome) — ausente (mock/linha órfã) fica undefined
    // e o layout cai no visual EcoSun de sempre.
    companyNome: (u as any).companies?.nome ?? undefined,
  };
}

export async function getUserByLogin(
  client: SupabaseClient,
  companyId: string,
  login: string,
): Promise<{ user: DashUser; senhaHash: string | null } | null> {
  const { data: u } = await client
    .from('dashboard_users')
    .select('id, company_id, nome, login, senha_hash, role_id, ativo, companies:company_id (nome)')
    .eq('company_id', companyId)
    .eq('login', login)
    .eq('ativo', true)
    .maybeSingle();
  if (!u) return null;
  const role = u.role_id ? await getRole(client, u.role_id) : null;
  return { user: montarDashUser(u as UserRow, role), senhaHash: (u as UserRow).senha_hash };
}

// [Fase 2 A1] Login MULTI-EMPRESA: mesmo login pode existir em empresas
// diferentes (unique é por (company_id, login)). Devolve TODOS os candidatos
// ativos, EcoSun PRIMEIRO — o POST /login testa a senha na ordem, então o
// login da EcoSun se comporta exatamente como antes; a senha desempata.
const ECOSUN_ID = '00000000-0000-0000-0000-000000000001';
export async function getUserByLoginTodasEmpresas(
  client: SupabaseClient,
  login: string,
): Promise<Array<{ user: DashUser; senhaHash: string | null }>> {
  const { data } = await client
    .from('dashboard_users')
    .select('id, company_id, nome, login, senha_hash, role_id, ativo, companies:company_id (nome, ativo)')
    .eq('login', login)
    .eq('ativo', true);
  const rows = ((data as UserRow[] | null) ?? []).slice()
    .filter((u) => !companyTravada(u))
    .sort((a, b) => Number(b.company_id === ECOSUN_ID) - Number(a.company_id === ECOSUN_ID));
  const out: Array<{ user: DashUser; senhaHash: string | null }> = [];
  for (const u of rows) {
    const role = u.role_id ? await getRole(client, u.role_id) : null;
    out.push({ user: montarDashUser(u, role), senhaHash: u.senha_hash });
  }
  return out;
}

export async function getUserById(client: SupabaseClient, id: string): Promise<DashUser | null> {
  const { data: u } = await client
    .from('dashboard_users')
    .select('id, company_id, nome, login, senha_hash, role_id, ativo, companies:company_id (nome, ativo)')
    .eq('id', id)
    .eq('ativo', true)
    .maybeSingle();
  if (!u) return null;
  if (companyTravada(u)) return null; // empresa suspensa por falta de pagamento
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
  input: { companyId: string; nome: string; login: string; senhaHash: string; roleId: string; telefone?: string | null; acessoTemporario?: boolean; email?: string | null },
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await client.from('dashboard_users').insert({
    company_id: input.companyId, nome: input.nome, login: input.login,
    senha_hash: input.senhaHash, role_id: input.roleId, ativo: true,
    telefone: input.telefone ?? null,
    acesso_temporario: input.acessoTemporario ?? false,
    email: input.email ?? null,
  }).select('id').single();
  if (error) return { error: error.code === '23505' ? 'login_em_uso' : error.message };
  return { id: (data as { id: string }).id };
}

export async function updateUser(
  client: SupabaseClient,
  id: string,
  patch: { nome?: string; roleId?: string; ativo?: boolean; senhaHash?: string; telefone?: string | null; acessoTemporario?: boolean; email?: string | null },
): Promise<void> {
  const upd: Record<string, unknown> = {};
  if (patch.nome !== undefined) upd.nome = patch.nome;
  if (patch.roleId !== undefined) upd.role_id = patch.roleId;
  if (patch.ativo !== undefined) upd.ativo = patch.ativo;
  if (patch.senhaHash !== undefined) upd.senha_hash = patch.senhaHash;
  if (patch.telefone !== undefined) upd.telefone = patch.telefone;
  if (patch.acessoTemporario !== undefined) upd.acesso_temporario = patch.acessoTemporario;
  if (patch.email !== undefined) upd.email = patch.email;
  if (Object.keys(upd).length === 0) return;
  await client.from('dashboard_users').update(upd).eq('id', id);
}

/** Telefone (zap) do usuário — pro aviso de serviço atribuído. */
export async function telefoneDoUsuario(client: SupabaseClient, id: string): Promise<string | null> {
  const { data } = await client.from('dashboard_users').select('telefone').eq('id', id).maybeSingle();
  return (data as { telefone?: string | null } | null)?.telefone ?? null;
}

/** Excluir DE VEZ um usuário SEM histórico. As chaves estrangeiras do banco
 *  (servicos.criado_por/atribuido_a, auditoria...) barram quem já fez algo —
 *  nesse caso devolvemos o motivo e a pessoa fica como inativa. */
export async function deleteUserSemHistorico(
  client: SupabaseClient,
  id: string,
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const { error } = await client.from('dashboard_users').delete().eq('id', id);
  if (error) {
    if (error.code === '23503') return { ok: false, motivo: 'a pessoa tem histórico (serviços/registros amarrados a ela)' };
    return { ok: false, motivo: error.message };
  }
  return { ok: true };
}

/** Nome + ativo + temporário — pro juízo da expiração do acesso (Diário F2). */
export async function dadosAcessoUsuario(
  client: SupabaseClient,
  id: string,
): Promise<{ nome: string; ativo: boolean; acessoTemporario: boolean } | null> {
  const { data } = await client.from('dashboard_users')
    .select('nome, ativo, acesso_temporario').eq('id', id).maybeSingle();
  if (!data) return null;
  const u = data as { nome: string; ativo: boolean; acesso_temporario?: boolean };
  return { nome: u.nome, ativo: u.ativo, acessoTemporario: u.acesso_temporario ?? false };
}

/** Zap de boas-vindas do usuário novo: acesso + login + senha inicial.
 *  A senha viaja UMA vez, na criação, com o pedido de troca no 1º acesso. */
export function textoBoasVindas(nome: string, login: string, senhaInicial: string, urlDashboard: string | null): string {
  return `👋 Olá, ${nome}! Seu acesso ao sistema da EcoSunPower está pronto:\n\n` +
    (urlDashboard ? `🌐 Endereço: ${urlDashboard}\n` : '') +
    `👤 Login: ${login}\n🔑 Senha inicial: ${senhaInicial}\n\n` +
    `Entre e TROQUE a senha no primeiro acesso, combinado? Qualquer dúvida, fala com a gente.`;
}

/** Miolo do E-MAIL de boas-vindas (usuários de TENANT) — vai dentro da
 *  moldura bonita (montarMolduraEmail) com o botão "Acessar o sistema". */
export function corpoEmailBoasVindas(nome: string, login: string, senhaInicial: string): string {
  return `<p>Olá, <b>${nome}</b>!</p>` +
    `<p>Seu acesso à plataforma está pronto. Suas credenciais:</p>` +
    `<p style="background:#f1f5f9;border-radius:8px;padding:12px 16px;font-size:15px">` +
    `👤 <b>Login:</b> ${login}<br>🔑 <b>Senha inicial:</b> ${senhaInicial}</p>` +
    `<p>Por segurança, <b>troque a senha no primeiro acesso</b>.</p>` +
    `<p>Qualquer dúvida, é só responder este e-mail.</p>`;
}

export async function touchLastLogin(client: SupabaseClient, id: string): Promise<void> {
  await client.from('dashboard_users').update({ last_login_at: new Date().toISOString() }).eq('id', id);
}
