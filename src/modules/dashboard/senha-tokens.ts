// src/modules/dashboard/senha-tokens.ts
// Convite por e-mail + "esqueci minha senha" (migration 108).
//
// Fluxo: admin cadastra usuário SEM senha → criamos um token (cru = 32 bytes
// base64url, no banco só o sha256) → e-mail com link /dashboard/definir-senha?t=
// → o usuário cria a própria senha → token marcado como usado → sessão aberta.
// "Esqueci minha senha": mesmo mecanismo, tipo 'reset', validade curta.
// Ninguém vê a senha de ninguém; o token vale UMA vez e expira.
import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { escapeHtml } from '../email/email-moldura.js';

export type TipoToken = 'convite' | 'reset';

export const VALIDADE_HORAS: Record<TipoToken, number> = { convite: 72, reset: 2 };

export function hashToken(tokenCru: string): string {
  return createHash('sha256').update(tokenCru).digest('hex');
}

export function gerarTokenCru(): string {
  return randomBytes(32).toString('base64url');
}

export interface TokenCriado { tokenCru: string; expiraEm: Date }

export const COOLDOWN_MINUTOS = 3;

// Já existe um link vivo criado há menos de COOLDOWN_MINUTOS pra este usuário/tipo?
// Sem isso, quem fica reenviando "esqueci minha senha" com o login da vítima
// invalida o link legítimo antes de ela clicar (e enche a caixa dela).
export async function existeTokenRecente(
  client: SupabaseClient,
  userId: string,
  tipo: TipoToken,
  agora: Date = new Date(),
): Promise<boolean> {
  const { data } = await client.from('dashboard_senha_tokens')
    .select('id')
    .eq('user_id', userId).eq('tipo', tipo).is('usado_em', null)
    .gt('created_at', new Date(agora.getTime() - COOLDOWN_MINUTOS * 60 * 1000).toISOString())
    .limit(1);
  return ((data as unknown[] | null) ?? []).length > 0;
}

export async function criarTokenSenha(
  client: SupabaseClient,
  input: { companyId: string; userId: string; tipo: TipoToken },
  agora: Date = new Date(),
): Promise<TokenCriado> {
  const tokenCru = gerarTokenCru();
  const expiraEm = new Date(agora.getTime() + VALIDADE_HORAS[input.tipo] * 60 * 60 * 1000);
  // Um link vivo por usuário/tipo: invalida os anteriores (reenvio = link novo).
  await client.from('dashboard_senha_tokens')
    .update({ usado_em: agora.toISOString() })
    .eq('user_id', input.userId).eq('tipo', input.tipo).is('usado_em', null);
  const { error } = await client.from('dashboard_senha_tokens').insert({
    company_id: input.companyId,
    user_id: input.userId,
    tipo: input.tipo,
    token_hash: hashToken(tokenCru),
    expira_em: expiraEm.toISOString(),
    created_at: agora.toISOString(),
  });
  if (error) throw new Error(`token de senha não criado: ${error.message}`);
  return { tokenCru, expiraEm };
}

export interface TokenValido { id: string; userId: string; companyId: string; tipo: TipoToken }

// Devolve o token se existir, não usado e não expirado. NÃO marca como usado
// (isso é feito só depois que a senha foi gravada — falha no meio não queima o link).
export async function validarTokenSenha(
  client: SupabaseClient,
  tokenCru: string | undefined,
  agora: Date = new Date(),
): Promise<TokenValido | null> {
  const cru = (tokenCru ?? '').trim();
  if (!cru || cru.length < 20) return null;
  const { data } = await client.from('dashboard_senha_tokens')
    .select('id, user_id, company_id, tipo, expira_em, usado_em')
    .eq('token_hash', hashToken(cru))
    .maybeSingle();
  const t = data as { id: string; user_id: string; company_id: string; tipo: TipoToken; expira_em: string; usado_em: string | null } | null;
  if (!t || t.usado_em) return null;
  if (new Date(t.expira_em).getTime() <= agora.getTime()) return null;
  return { id: t.id, userId: t.user_id, companyId: t.company_id, tipo: t.tipo };
}

export async function marcarTokenUsado(client: SupabaseClient, id: string, agora: Date = new Date()): Promise<void> {
  await client.from('dashboard_senha_tokens').update({ usado_em: agora.toISOString() }).eq('id', id);
}

// ---------- e-mails (miolo; a moldura é a montarMolduraEmail) ----------

export function corpoEmailConvite(nome: string, empresa: string, validadeHoras: number): string {
  return `<p>Olá, <b>${escapeHtml(nome)}</b>!</p>` +
    `<p>Seu acesso à plataforma da <b>${escapeHtml(empresa)}</b> foi criado. Falta só você escolher a sua senha — clique no botão abaixo.</p>` +
    `<p style="font-size:14px;color:#556">O link vale por <b>${validadeHoras} horas</b> e só pode ser usado uma vez. Se expirar, peça um novo ao administrador ou use "Esqueci minha senha" na tela de login.</p>`;
}

export function corpoEmailReset(nome: string, validadeHoras: number): string {
  return `<p>Olá, <b>${escapeHtml(nome)}</b>!</p>` +
    `<p>Recebemos um pedido para redefinir a sua senha. Clique no botão abaixo para criar uma nova.</p>` +
    `<p style="font-size:14px;color:#556">O link vale por <b>${validadeHoras} horas</b>. Se você não pediu isso, pode ignorar este e-mail — sua senha continua a mesma.</p>`;
}

// ---------- telas públicas (mesmo visual da tela de login) ----------

const CSS = `body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.login-bg{background:radial-gradient(circle at 20% 30%,rgba(245,158,11,.18),transparent 40%),radial-gradient(circle at 80% 70%,rgba(14,165,233,.25),transparent 50%),linear-gradient(135deg,#0c4a6e 0%,#075985 50%,#0369a1 100%)}`;

function shell(titulo: string, corpo: string, empresa: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(titulo)} · ${escapeHtml(empresa)}</title><script src="https://cdn.tailwindcss.com"></script><style>${CSS}</style></head>
<body class="login-bg min-h-screen flex items-center justify-center p-4"><div class="w-full max-w-md">
<div class="text-center mb-6"><h1 class="text-2xl font-bold text-white tracking-tight">${escapeHtml(empresa)}</h1><p class="text-sky-200 text-sm mt-1">${escapeHtml(titulo)}</p></div>
<div class="bg-white rounded-2xl shadow-2xl p-8">${corpo}</div></div></body></html>`;
}

const INPUT = 'w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-sky-500';
const BOTAO = 'w-full bg-gradient-to-r from-sky-700 to-sky-600 hover:from-sky-800 hover:to-sky-700 text-white font-semibold py-3 rounded-xl shadow-lg';

export function renderDefinirSenhaPage(input: { token: string; nome: string; empresa: string; tipo: TipoToken; errorMsg?: string }): string {
  const erro = input.errorMsg ? `<div class="mb-4 px-4 py-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm">⚠️ ${escapeHtml(input.errorMsg)}</div>` : '';
  const titulo = input.tipo === 'convite' ? 'Crie a sua senha' : 'Nova senha';
  const corpo = `${erro}<p class="text-slate-700 mb-5">Olá, <b>${escapeHtml(input.nome)}</b>! ${input.tipo === 'convite' ? 'Escolha a senha que você vai usar para entrar.' : 'Escolha a sua nova senha.'}</p>
<form method="post" action="/dashboard/definir-senha" class="space-y-4" autocomplete="on">
<input type="hidden" name="t" value="${escapeHtml(input.token)}">
<div><label class="block text-sm font-semibold text-slate-700 mb-2">🔐 Nova senha</label><input name="senha" type="password" required minlength="8" autocomplete="new-password" class="${INPUT}" placeholder="mínimo 8 caracteres" autofocus></div>
<div><label class="block text-sm font-semibold text-slate-700 mb-2">🔐 Repita a senha</label><input name="senha2" type="password" required minlength="8" autocomplete="new-password" class="${INPUT}" placeholder="igual à de cima"></div>
<button type="submit" class="${BOTAO}">Salvar e entrar →</button></form>`;
  return shell(titulo, corpo, input.empresa);
}

export function renderLinkInvalidoPage(empresa: string): string {
  const corpo = `<p class="text-slate-800 font-semibold mb-2">Este link não vale mais.</p>
<p class="text-slate-600 text-sm mb-5">Ele expirou ou já foi usado. Peça um novo em "Esqueci minha senha" ou ao administrador da sua empresa.</p>
<a href="/dashboard/esqueci-senha" class="${BOTAO} block text-center">Pedir um novo link</a>
<p class="mt-4 text-center text-sm"><a href="/dashboard/login" class="text-sky-700 hover:underline">Voltar ao login</a></p>`;
  return shell('Link inválido', corpo, empresa);
}

export function renderEsqueciSenhaPage(input: { empresa: string; enviado?: boolean; errorMsg?: string }): string {
  if (input.enviado) {
    const corpo = `<p class="text-slate-800 font-semibold mb-2">Pronto! 📬</p>
<p class="text-slate-600 text-sm mb-5">Se existir um usuário com esse login ou e-mail, mandamos um link para criar uma nova senha. Ele vale por ${VALIDADE_HORAS.reset} horas — confira também a caixa de spam.</p>
<p class="text-center text-sm"><a href="/dashboard/login" class="text-sky-700 hover:underline">Voltar ao login</a></p>`;
    return shell('Esqueci minha senha', corpo, input.empresa);
  }
  const erro = input.errorMsg ? `<div class="mb-4 px-4 py-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm">⚠️ ${escapeHtml(input.errorMsg)}</div>` : '';
  const corpo = `${erro}<p class="text-slate-700 mb-5">Digite o seu login ou e-mail. Se o cadastro tiver e-mail, você recebe um link para criar uma nova senha.</p>
<form method="post" action="/dashboard/esqueci-senha" class="space-y-4">
<div><label class="block text-sm font-semibold text-slate-700 mb-2">👤 Login ou e-mail</label><input name="identificacao" type="text" required autocomplete="username" class="${INPUT}" placeholder="seu login ou e-mail" autofocus></div>
<button type="submit" class="${BOTAO}">Enviar link →</button></form>
<p class="mt-4 text-center text-sm"><a href="/dashboard/login" class="text-sky-700 hover:underline">Voltar ao login</a></p>`;
  return shell('Esqueci minha senha', corpo, input.empresa);
}
