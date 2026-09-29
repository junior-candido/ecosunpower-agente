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

/** Leads sem piscada (28/09): o CSS da grade do Atendimento (Conversas e ficha
 *  do lead) sai do fim do <body> e entra por arquivo, no <head>. */
export const CSS_ATENDIMENTO_NO_HEAD: MudancaContrato = {
  motivo: 'CSS do Atendimento por arquivo no <head> — a tela não pisca sem as colunas',
  entra: { links: [URL_CSS_ATENDIMENTO] },
};
