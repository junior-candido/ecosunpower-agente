// Casos do Modo TV (renovação do miolo, R26 — D6 = a: usuário/papel "TV
// só-leitura", sem migration). Dados fictícios (telas-renovadas#dadosCC).
import { renderModoTvPage } from '../../src/modules/dashboard/command-center-views.js';
import type { DashUser } from '../../src/modules/dashboard/permissions.js';
import { dadosCC } from './telas-renovadas.js';
import { USER_CASA, USER_TENANT } from './miolo-leads.js';

export const AGORA_TV = new Date('2026-09-28T15:00:00Z');
export const USER_TV_CASA: DashUser = { ...USER_CASA, id: 'u-tv', nome: 'TV do escritório', login: 'tv', isAdmin: false, roleNome: 'TV só-leitura', permissoes: {} };
export const USER_TV_TENANT: DashUser = { ...USER_TENANT, id: 'u-tv-t', nome: 'TV da loja', login: 'tv-loja', isAdmin: false, roleNome: 'TV só-leitura', permissoes: {} };

export const CASOS_TV: Record<string, () => string> = {
  'tv-casa': () => (renderModoTvPage as (...a: unknown[]) => string)(USER_CASA, { agora: AGORA_TV, nomeUsuario: 'Junior', dados: dadosCC(6) }),
  'tv-sem-dado': () => (renderModoTvPage as (...a: unknown[]) => string)(USER_CASA, { agora: AGORA_TV, nomeUsuario: 'Junior', dados: null }),
  'tv-papel-tv': () => (renderModoTvPage as (...a: unknown[]) => string)(USER_TV_CASA, { agora: AGORA_TV, nomeUsuario: 'TV do escritório', dados: dadosCC(6) }),
  'tv-papel-tv-tenant': () => (renderModoTvPage as (...a: unknown[]) => string)(USER_TV_TENANT, { agora: AGORA_TV, nomeUsuario: 'TV da loja', dados: dadosCC(6) }),
};
