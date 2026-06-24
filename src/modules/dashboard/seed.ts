// src/modules/dashboard/seed.ts
// Garante (idempotente) os usuários iniciais no boot. Hash de senha é feito aqui
// (não dá pra pôr hash bcrypt no SQL). Reusa DASHBOARD_PASSWORD como senha inicial
// do admin; comerciais recebem DASHBOARD_SEED_PASSWORD (default trocavel).
import type { SupabaseClient } from '@supabase/supabase-js';
import { hashSenha } from './password.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';

async function roleId(client: SupabaseClient, nome: string): Promise<string | null> {
  const { data } = await client.from('dashboard_roles')
    .select('id').eq('company_id', ECOSUN).eq('nome', nome).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

async function ensureUser(
  client: SupabaseClient,
  login: string, nome: string, roleNome: string, senhaPlana: string,
): Promise<void> {
  const { data: existe } = await client.from('dashboard_users')
    .select('id, senha_hash').eq('company_id', ECOSUN).eq('login', login).maybeSingle();
  const rid = await roleId(client, roleNome);
  if (!rid) { console.warn(`[seed] papel ${roleNome} não encontrado; pulei ${login}`); return; }
  if (!existe) {
    await client.from('dashboard_users').insert({
      company_id: ECOSUN, login, nome, role_id: rid,
      senha_hash: await hashSenha(senhaPlana), ativo: true,
    });
    console.log(`[seed] usuário ${login} criado`);
  } else if (!(existe as { senha_hash: string | null }).senha_hash) {
    // usuário existe mas sem senha (ex.: seed parcial) → define
    await client.from('dashboard_users').update({ senha_hash: await hashSenha(senhaPlana) })
      .eq('id', (existe as { id: string }).id);
  }
}

export async function ensureSeed(client: SupabaseClient): Promise<void> {
  try {
    const adminPass = process.env.DASHBOARD_PASSWORD;
    if (!adminPass) { console.warn('[seed] DASHBOARD_PASSWORD ausente; admin não semeado'); return; }
    const adminLogin = process.env.DASHBOARD_ADMIN_LOGIN ?? 'admin';
    const seedPass = process.env.DASHBOARD_SEED_PASSWORD ?? 'trocar123';
    await ensureUser(client, adminLogin, 'Junior (Admin)', 'Administrador', adminPass);
    await ensureUser(client, 'comercial1', 'Comercial 1', 'Comercial', seedPass);
    await ensureUser(client, 'comercial2', 'Comercial 2', 'Comercial', seedPass);
  } catch (err) {
    console.warn('[seed] falhou (ignorado):', (err as Error).message);
  }
}
