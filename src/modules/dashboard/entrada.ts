// src/modules/dashboard/entrada.ts
// Um lugar só que decide a TELA DE ENTRADA do painel e para onde a logo leva.
//
// Renovação do miolo, R0 (28/09/2026): o tenant era mandado para /dashboard/home,
// que não está no menu dele (e cuja consulta é da casa). Agora:
//  - EcoSun continua na Home (por enquanto; a troca da entrada é do R5, decisão D1);
//  - tenant vai para o Command Center dele (dado escopado pela empresa da sessão);
//  - sem usuário (tela legada/teste) fica como sempre: Home.
// Função pura: sem banco, sem sessão.

import type { DashUser } from './permissions.js';
import { ECOSUN_COMPANY_ID } from '../tenant-resolver.js';

export const ENTRADA_CASA = '/dashboard/home';
export const ENTRADA_TENANT = '/dashboard/command-center';

/** Tela de entrada de quem está logado. */
export function paginaInicialDe(user: DashUser | undefined): string {
  if (!user) return ENTRADA_CASA;
  return user.companyId === ECOSUN_COMPANY_ID ? ENTRADA_CASA : ENTRADA_TENANT;
}

/** Para onde a logo do menu (e o "← voltar" da vitrine) leva. Hoje = entrada. */
export function linkDaLogo(user: DashUser | undefined): string {
  return paginaInicialDe(user);
}
