// Renovação do miolo — Onda 2 (R8–R12): o que MUDA de propósito no contrato
// das telas. Os JSON gravados das telas antigas NÃO são regravados: cada troca
// fica escrita aqui, item por item, com o motivo.
import type { MudancaContrato } from '../helpers/contrato-tela.js';
import { URL_CSS_MAPA_USINAS, URL_JS_MAPA_USINA } from '../../src/modules/dashboard/ui/estatico.js';

/** Gráficos no tema do painel: o trecho JS_TEMA_GRAFICOS (ui/graficos.ts) lê as
 *  cores dos tokens na casca (`document.querySelector('.cc-shell')`). O plano
 *  pede esse trecho nas telas com Chart.js/ECharts (R9, R10, R11). */
export const TEMA_GRAFICOS: MudancaContrato = {
  motivo: 'plano: gráficos leem as cores do tema (JS_TEMA_GRAFICOS)',
  entra: { seletores: ['.cc-shell'] },
};

/** Mapa das Usinas (#330, entrou na main depois da gravação do contrato da
 *  usina): a tela da usina ganhou o mini-mapa com alfinete arrastável, que
 *  traz o CSS e o JS dele por arquivo. Não é mudança da renovação — é da main. */
export const MINI_MAPA_DA_MAIN: MudancaContrato = {
  motivo: 'main #330: mini-mapa da usina (CSS + JS por arquivo)',
  entra: { links: [URL_CSS_MAPA_USINAS], scriptsExternos: [URL_JS_MAPA_USINA] },
};
