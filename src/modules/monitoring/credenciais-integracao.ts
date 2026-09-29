// src/modules/monitoring/credenciais-integracao.ts
// PURO. "Atualizar senha da integração" (29/09): quais campos de login/senha
// cada marca usa em sistemas_clientes.api_credentials, como ler o login atual
// (NUNCA a senha) e como aplicar a senha nova sem mexer no resto (site_id,
// appId, região, chave de API...).
//
// Só marcas que logam com usuário + senha. As de chave de API (SolarEdge,
// FoxESS, Solis) e OAuth (Sungrow) não entram — não há "senha" pra trocar.
//
// Armazenamento: api_credentials é JSONB simples (mesmo padrão do cadastro e
// da descoberta — o adapter lê direto). Não há coluna cifrada pra usinas (a
// api_credentials_cifrado é só dos medidores de energia).

import type { MarcaInversor } from './types.js';

export interface CamposSenhaMarca {
  /** Chave do login dentro de api_credentials (e-mail / usuário). */
  login: string;
  /** Outras chaves que o adapter também aceita como login (leitura). */
  loginAliases?: string[];
  rotuloLogin: string;
  tipoLogin: 'email' | 'text';
  /** Chave da senha dentro de api_credentials. */
  senha: string;
  rotuloSenha: string;
  /** Chaves que saem ao gravar senha nova (ex.: NEP jwt vencido tem prioridade sobre login). */
  remover?: string[];
  dica?: string;
}

export const CAMPOS_SENHA: Partial<Record<MarcaInversor, CamposSenhaMarca>> = {
  goodwe: {
    login: 'email', loginAliases: ['account', 'user'], rotuloLogin: 'E-mail da conta SEMS+', tipoLogin: 'email',
    senha: 'password', rotuloSenha: 'Senha do SEMS+',
    remover: ['pwd', 'pass'],
  },
  saj: {
    login: 'username', rotuloLogin: 'Usuário da conta SAJ (eSolar)', tipoLogin: 'text',
    senha: 'password', rotuloSenha: 'Senha da conta SAJ',
  },
  deye: {
    login: 'email', rotuloLogin: 'E-mail da conta Deye Cloud', tipoLogin: 'email',
    senha: 'password', rotuloSenha: 'Senha da conta Deye Cloud',
  },
  nep: {
    login: 'email', rotuloLogin: 'E-mail da conta NEPViewer', tipoLogin: 'email',
    senha: 'password', rotuloSenha: 'Senha da conta NEPViewer',
    // Com e-mail + senha o adapter loga sozinho e renova o acesso; o token
    // antigo (jwt) tem prioridade no adapter e, vencido, travaria a usina.
    remover: ['jwt'],
    dica: 'Com e-mail e senha o sistema entra sozinho e renova o acesso quando vence.',
  },
  abb: {
    login: 'userId', loginAliases: ['email'], rotuloLogin: 'Usuário da conta Aurora Vision', tipoLogin: 'text',
    senha: 'password', rotuloSenha: 'Senha da conta Aurora Vision',
  },
};

export function camposSenhaDaMarca(marca: MarcaInversor | string | null | undefined): CamposSenhaMarca | null {
  return (marca && CAMPOS_SENHA[marca as MarcaInversor]) || null;
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
}

/** Login (e-mail/usuário) gravado hoje — '' se não houver. Nunca devolve senha. */
export function loginAtual(marca: MarcaInversor | string, creds: unknown): string {
  const c = camposSenhaDaMarca(marca);
  if (!c || !creds || typeof creds !== 'object') return '';
  const obj = creds as Record<string, unknown>;
  for (const k of [c.login, ...(c.loginAliases ?? [])]) {
    const v = texto(obj[k]);
    if (v) return v;
  }
  return '';
}

/** Mesmo login? (e-mail sem diferença de maiúsculas/espaços). */
export function mesmoLogin(a: string, b: string): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

export type NovaSenhaValidada =
  | { ok: true; login: string; senha: string }
  | { ok: false; erro: string };

/**
 * Valida o formulário. Login em branco = mantém o atual (precisa existir);
 * senha é obrigatória.
 */
export function validarNovaSenha(
  marca: MarcaInversor | string,
  credsAtuais: unknown,
  corpo: { login?: unknown; senha?: unknown },
): NovaSenhaValidada {
  const c = camposSenhaDaMarca(marca);
  if (!c) return { ok: false, erro: 'Esta marca não usa login e senha — não há senha pra atualizar aqui.' };
  const senha = typeof corpo.senha === 'string' ? corpo.senha : '';
  if (!senha.trim()) return { ok: false, erro: 'Digite a senha nova.' };
  if (senha.length > 200) return { ok: false, erro: 'Senha longa demais.' };
  const login = texto(corpo.login) || loginAtual(marca, credsAtuais);
  if (!login) return { ok: false, erro: `Preencha o campo "${c.rotuloLogin}".` };
  if (login.length > 200) return { ok: false, erro: 'Login longo demais.' };
  if (c.tipoLogin === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login)) {
    return { ok: false, erro: 'E-mail inválido.' };
  }
  return { ok: true, login, senha };
}

/** api_credentials com o login/senha novos — o resto (site_id, appId, região...) fica. */
export function aplicarNovaSenha(
  marca: MarcaInversor | string,
  credsAtuais: unknown,
  nova: { login: string; senha: string },
): Record<string, unknown> {
  const c = camposSenhaDaMarca(marca);
  if (!c) throw new Error(`marca sem login/senha: ${marca}`);
  const base = credsAtuais && typeof credsAtuais === 'object' ? { ...(credsAtuais as Record<string, unknown>) } : {};
  for (const k of [...(c.loginAliases ?? []), ...(c.remover ?? [])]) delete base[k];
  base[c.login] = nova.login;
  base[c.senha] = nova.senha;
  return base;
}
