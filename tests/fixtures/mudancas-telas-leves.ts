// Telas leves (perf/telas-leves, 28/09/2026) — o que MUDOU de propósito no
// contrato das telas renovadas. Os JSON gravados (contrato-*.json) NÃO foram
// regravados: a troca fica escrita aqui, item por item.
import type { MudancaContrato } from '../helpers/contrato-tela.js';
import { URL_CSS_PAINEL, URL_CSS_SEM_TAILWIND, URL_CSS_ATENDIMENTO } from '../../src/modules/dashboard/ui/estatico.js';

/** Sai o Tailwind do CDN; entram o CSS comum e o reset de base por arquivo (<link>). */
export const TELAS_LEVES: MudancaContrato = {
  motivo: 'tela renovada sem Tailwind do CDN; CSS comum por arquivo com hash',
  sai: { scriptsExternos: ['https://cdn.tailwindcss.com'] },
  entra: { links: [URL_CSS_PAINEL, URL_CSS_SEM_TAILWIND] },
};

/**
 * Cobrança recorrente (28/09/2026): "Financeiro › Assinaturas" é a carteira de
 * TODOS os assinantes — virou SÓ da casa (soEcosun). No menu lateral de uma
 * tela de TENANT o link some. Tela da casa: nada muda (o teste
 * cobranca-recorrente-menu garante que a casa continua vendo).
 * Tela de tenant = a que não traz a logo da casa (telas-leves garante isso).
 */
export function menuTenantSemAssinaturas(html: string): MudancaContrato[] {
  return [...menuEnergyStudio(html), ...(html.includes('/dashboard/estatico/logo-casa.') ? [] : [{ motivo: 'Assinaturas só da casa — some do menu do tenant', saiSeHouver: { links: ['/dashboard/assinaturas', '/dashboard/conhecer/assinaturas'] } }])];
}

/** Energy Studio (02/10/2026): item novo no menu "Usinas" — link direto ou a
 *  vitrine (/conhecer) quando a empresa não contratou. Só em tela com menu. */
export function menuEnergyStudio(html: string): MudancaContrato[] {
  const links = ['/dashboard/energy-studio', '/dashboard/conhecer/energy_studio', '/dashboard/studio-3d', '/dashboard/conhecer/studio_3d'].filter((l) => html.includes(`href="${l}"`));
  return links.length ? [{ motivo: 'Energy Studio no menu Usinas', entra: { links } }] : [];
}

/** Leads sem piscada (28/09): o CSS da grade do Atendimento (Conversas e ficha
 *  do lead) sai do fim do <body> e entra por arquivo, no <head>. */
export const CSS_ATENDIMENTO_NO_HEAD: MudancaContrato = {
  motivo: 'CSS do Atendimento por arquivo no <head> — a tela não pisca sem as colunas',
  entra: { links: [URL_CSS_ATENDIMENTO] },
};
