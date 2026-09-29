// Renovação do miolo — Onda 4 (acabamento: R5, R21–R26): o que MUDA de
// propósito no contrato das telas. Os JSON gravados das telas antigas NÃO são
// regravados: cada troca fica escrita aqui, item por item, com o motivo (cada
// fatia na sua seção). A troca comum (sai o Tailwind do CDN) é TELAS_LEVES
// (mudancas-telas-leves.ts). O R20 (Financeiro II) NÃO faz parte desta onda.
import type { ContratoTela, MudancaContrato } from '../helpers/contrato-tela.js';

import { URL_CSS_COMMAND_CENTER } from '../../src/modules/dashboard/ui/estatico.js';

export type { MudancaContrato };


// ════════════════════════════════════════════════════════════════════════
// R5 — Nova entrada (Command Center) + Cockpit sai do menu
// ════════════════════════════════════════════════════════════════════════

/** R5 (D2 = a): o item "Cockpit" sai do MENU. Toda tela da casa que tinha o
 *  link só pelo menu perde o `/dashboard/cockpit` da lista de links (a rota
 *  continua viva, só para a casa). Tela sem o link (tenant) não muda. */
export const R5_COCKPIT_FORA_DO_MENU: MudancaContrato = {
  motivo: 'R5: Cockpit sai do menu (decisão D2 = a); a rota /cockpit continua viva para a casa',
  sai: { links: ['/dashboard/cockpit'] },
};
/** A troca do menu para um contrato gravado antes do R5 (só se o link estava lá). */
export function r5Menu(base: ContratoTela): MudancaContrato[] {
  return base?.links?.includes('/dashboard/cockpit') ? [R5_COCKPIT_FORA_DO_MENU] : [];
}

/** R5: o CSS do Command Center e da Central sai do <style> no fim da página
 *  e entra por ARQUIVO no <head> (sem piscada — padrão do #337). No menu da
 *  casa o Cockpit sai, mas o rodapé ganha o "Cockpit antigo": o link continua. */
const R5_CSS_CC_NO_HEAD: MudancaContrato = {
  motivo: 'R5: CSS do Command Center por arquivo no <head> (a entrada de todo mundo não pisca)',
  entra: { links: [URL_CSS_COMMAND_CENTER] },
};
/** R5 (D2 = a): link discreto "Cockpit antigo" no rodapé do Command Center,
 *  só da casa, por 30 dias (sai no R25). */
const R5_COCKPIT_ANTIGO_NO_RODAPE: MudancaContrato = {
  motivo: 'R5: link "Cockpit antigo" no rodapé do Command Center (só casa, 30 dias)',
  entra: { links: ['/dashboard/cockpit'] },
};
/** R5: trocas por caso de tests/fixtures/casos-command-center.ts. */
export const MUDANCAS_R5: Record<string, MudancaContrato[]> = {
  'cc-casa': [R5_CSS_CC_NO_HEAD, R5_COCKPIT_FORA_DO_MENU, R5_COCKPIT_ANTIGO_NO_RODAPE],
  'cc-casa-sem-dado': [R5_CSS_CC_NO_HEAD, R5_COCKPIT_FORA_DO_MENU, R5_COCKPIT_ANTIGO_NO_RODAPE],
  'cc-tenant': [R5_CSS_CC_NO_HEAD],
  'atencao-casa': [R5_CSS_CC_NO_HEAD, R5_COCKPIT_FORA_DO_MENU],
  'atencao-tenant': [R5_CSS_CC_NO_HEAD],
};

