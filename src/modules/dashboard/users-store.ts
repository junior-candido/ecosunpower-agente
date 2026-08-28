// src/modules/dashboard/users-store.ts
// Acesso a dashboard_users e dashboard_roles. Monta o DashUser (com papel+permissoes)
// usado pelo auth e pelas telas de /usuarios.
import type { SupabaseClient } from '@supabase/supabase-js';
import { telefoneParaEnvio } from '../phone.js';
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
  // Sempre na forma pronta pro sendText (com o 55) — número digitado sem o
  // país no cadastro deixava o aviso de serviço morrer em silêncio (05/08).
  return telefoneParaEnvio((data as { telefone?: string | null } | null)?.telefone);
}

/** Acha usuário da empresa pelo telefone (📤 enviar serviço pelo zap sem duplicar gente). */
export async function usuarioPorTelefone(
  client: SupabaseClient,
  companyId: string,
  telefone: string,
): Promise<{ id: string; nome: string; ativo: boolean } | null> {
  const { data } = await client.from('dashboard_users')
    .select('id, nome, ativo')
    .eq('company_id', companyId)
    .eq('telefone', telefone)
    .maybeSingle();
  return (data as { id: string; nome: string; ativo: boolean } | null) ?? null;
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

/**
 * Excluir usuário TRANSFERINDO o histórico pra outra pessoa da MESMA empresa
 * (pedido do Junior 05/08 — clones de instalador com serviços amarrados).
 * Serviços e posse de lead vão pro destinatário; auditoria NÃO transfere
 * (é registro de quem fez) — só desamarra (user_id = null).
 */
export async function excluirTransferindoHistorico(
  client: SupabaseClient,
  id: string,
  paraId: string,
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  if (!paraId) return { ok: false, motivo: 'escolha pra quem transferir o histórico' };
  if (paraId === id) return { ok: false, motivo: 'não dá pra transferir o histórico pra própria pessoa' };
  const { data: origem } = await client.from('dashboard_users').select('id, company_id').eq('id', id).maybeSingle();
  if (!origem) return { ok: false, motivo: 'usuário não encontrado' };
  const { data: destino } = await client.from('dashboard_users').select('id, company_id').eq('id', paraId).maybeSingle();
  if (!destino) return { ok: false, motivo: 'destinatário não encontrado' };
  if ((destino as { company_id: string }).company_id !== (origem as { company_id: string }).company_id) {
    return { ok: false, motivo: 'o destinatário é de outra empresa' };
  }

  const transferencias: Array<[string, string]> = [
    ['servicos', 'atribuido_a'],
    ['servicos', 'criado_por'],
    ['leads', 'claimed_by'],
  ];
  for (const [tabela, coluna] of transferencias) {
    const { error } = await client.from(tabela).update({ [coluna]: paraId }).eq(coluna, id);
    if (error) return { ok: false, motivo: `transferindo ${tabela}.${coluna}: ${error.message}` };
  }
  const { error: eAudit } = await client.from('audit_log').update({ user_id: null }).eq('user_id', id);
  if (eAudit) return { ok: false, motivo: `desamarrando auditoria: ${eAudit.message}` };

  const { error } = await client.from('dashboard_users').delete().eq('id', id);
  if (error) {
    if (error.code === '23503') return { ok: false, motivo: 'sobrou uma amarração que eu não conhecia — deixe a pessoa como inativa e avise o suporte' };
    return { ok: false, motivo: error.message };
  }
  return { ok: true };
}

/**
 * O telefone é de alguém da EQUIPE (dashboard_users)? A Eva usa isso pra NUNCA
 * tratar instalador/equipe como lead (B.O. 06/08: Jota virou "lead quente").
 * Compara pelas variantes BR (com/sem 55, com/sem 9º dígito).
 */
export async function ehTelefoneDaEquipe(client: SupabaseClient, phone: string): Promise<boolean> {
  const { variantesTelefone } = await import('../phone.js');
  const variantes = variantesTelefone(phone);
  if (variantes.length === 0) return false;
  const { data } = await client.from('dashboard_users')
    .select('id').in('telefone', variantes).limit(1);
  return !!(data && data.length > 0);
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

/** "Esqueci minha senha": usuários ATIVOS cujo login OU e-mail bate com o que
 *  a pessoa digitou e que TÊM e-mail cadastrado (sem e-mail não há pra onde mandar).
 *  Pode devolver mais de um (mesmo login em empresas diferentes) — cada um recebe o seu link. */
export async function usuariosParaReset(
  client: SupabaseClient,
  identificacao: string,
): Promise<Array<{ id: string; companyId: string; nome: string; email: string }>> {
  const ident = identificacao.trim().toLowerCase().replace(/[^a-z0-9@._+\-]/g, '');
  if (!ident) return [];
  const { data } = await client
    .from('dashboard_users')
    .select('id, company_id, nome, email, ativo')
    .eq('ativo', true)
    .or(`login.eq.${ident},email.ilike.${ident}`); // ilike sem curinga = igualdade sem caixa
  return ((data as Array<{ id: string; company_id: string; nome: string; email: string | null }> | null) ?? [])
    .filter((u) => Boolean(u.email))
    .map((u) => ({ id: u.id, companyId: u.company_id, nome: u.nome, email: String(u.email).trim().toLowerCase() }));
}

/** Grava a senha escolhida pelo próprio usuário (convite / reset). NÃO mexe em `ativo`:
 *  usuário desativado pelo admin não se reativa sozinho pelo link. */
export async function definirSenhaUsuario(client: SupabaseClient, id: string, senhaHash: string): Promise<void> {
  const { error } = await client.from('dashboard_users').update({ senha_hash: senhaHash }).eq('id', id).eq('ativo', true);
  if (error) throw new Error(`senha não gravada: ${error.message}`);
}

export async function touchLastLogin(client: SupabaseClient, id: string): Promise<void> {
  await client.from('dashboard_users').update({ last_login_at: new Date().toISOString() }).eq('id', id);
}
