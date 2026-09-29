// src/modules/dashboard/entrada.ts
// Um lugar só que decide a TELA DE ENTRADA do painel e para onde a logo leva.
//
// Renovação do miolo:
//  - R0 (28/09/2026): o tenant era mandado para /dashboard/home, que não está
//    no menu dele (e cuja consulta é da casa) → passou para o Command Center.
//  - R5 (decisão D1 = a): o Command Center é a entrada de TODO MUNDO (EcoSun e
//    tenant) — depois do login sem `next`, em `/`, na logo e no convite. O
//    Cockpit saiu do menu e foi aposentado (/cockpit só redireciona pra entrada).
//  - Sem sessão → tela de login (nunca o Command Center: ele mandaria de volta
//    pro login e criaria laço).
// Funções puras: sem banco, sem sessão.

import { ehPapelTv, type DashUser } from './permissions.js';

export const ENTRADA = '/dashboard/command-center';
export const TELA_LOGIN = '/dashboard/login';
/** R26 (D6 = a): o usuário do papel "TV só-leitura" entra direto no Modo TV. */
export const TELA_TV = '/dashboard/tv';

/** Tela de entrada de quem está logado (sem sessão → login). */
export function paginaInicialDe(user: DashUser | undefined): string {
  if (!user) return TELA_LOGIN;
  return ehPapelTv(user) ? TELA_TV : ENTRADA;
}

/** Para onde a logo do menu (e o "← voltar" da vitrine) leva. A casca só é
 *  montada para quem está logado; tela legada sem `user` também vai para a
 *  entrada (nunca para o login, que é tela de fora). */
export function linkDaLogo(_user: DashUser | undefined): string {
  return ENTRADA;
}

/** Destino depois do login: o `next` pedido (só caminho do próprio painel) ou
 *  a entrada. Não aceita `//host` nem `/dashboard` seguido de barra invertida
 *  (o navegador trata `\` como `/` e poderia sair do site). */
export function destinoDepoisDoLogin(next: unknown, user: DashUser | undefined): string {
  if (typeof next === 'string' && /^\/dashboard(?:[/?#]|$)/.test(next) && !next.includes('\\')) return next;
  return paginaInicialDe(user);
}
