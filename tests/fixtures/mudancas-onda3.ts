// Renovação do miolo — Onda 3 (R13–R19): o que MUDA de propósito no contrato
// das telas. Os JSON gravados das telas antigas NÃO são regravados: cada troca
// fica escrita aqui, item por item, com o motivo (cada fatia na sua seção).
// A troca comum (sai o Tailwind do CDN) é TELAS_LEVES (mudancas-telas-leves.ts).
import type { MudancaContrato } from '../helpers/contrato-tela.js';

/** Marca de uso do tipo (evita import sem uso enquanto as seções estão vazias). */
export type { MudancaContrato };


// ════════════════════════════════════════════════════════════════════════
// R13 — Manutenção + OS
// ════════════════════════════════════════════════════════════════════════

/** R13: mudanças deliberadas por caso de tests/fixtures/casos-manutencao.ts. */
export const MUDANCAS_R13: Record<string, MudancaContrato[]> = {};


// ════════════════════════════════════════════════════════════════════════
// R14 — Serviços de campo (painel interno)
// ════════════════════════════════════════════════════════════════════════
/** Por caso de tests/fixtures/casos-servicos.ts: trocas deliberadas além de TELAS_LEVES. */
export const MUDANCAS_R14: Record<string, MudancaContrato[]> = {};


// ════════════════════════════════════════════════════════════════════════
// R15 — Quadro de Obras + vincular + contato
// ════════════════════════════════════════════════════════════════════════

/** R15: trocas por caso de tests/fixtures/casos-obras.ts. Só a troca comum das
 *  telas renovadas (TELAS_LEVES: sai o Tailwind do CDN). Formulário, fetch,
 *  ids, data-*, seletores do Sortable, confirms e CDN do Sortable: IGUAIS. */
import { TELAS_LEVES as TELAS_LEVES_R15 } from './mudancas-telas-leves.js';
/** Conserto de tela: o <main> é um contexto de empilhamento (z-index 0) e o
 *  painel de contato ficava ATRÁS da barra de cima no celular. O script sobe o
 *  painel e o fundo para a casca (querySelector('.cc-shell')) — mesmos ids,
 *  mesmo fetch; só entra esse seletor. */
const R15_PAINEL_NA_CASCA: MudancaContrato = {
  motivo: 'painel de contato sobe para a casca (.cc-shell) para cobrir a tela no celular',
  entra: { seletores: ['.cc-shell'] },
};
const R15_QUADRO = ['quadro', 'quadro-vazio', 'quadro-tenant'];
const R15_VINCULAR = ['vincular', 'vincular-vazio', 'vincular-tenant'];
export const MUDANCAS_R15: Record<string, MudancaContrato[]> = {
  ...Object.fromEntries(R15_QUADRO.map((c) => [c, [TELAS_LEVES_R15, R15_PAINEL_NA_CASCA]])),
  ...Object.fromEntries(R15_VINCULAR.map((c) => [c, [TELAS_LEVES_R15]])),
};


// ════════════════════════════════════════════════════════════════════════
// R16 — Clientes
// ════════════════════════════════════════════════════════════════════════

/** CONSERTO (R16): o botão "Vincular cliente" (sistemas sem cliente) montava
 *  onclick="abrirVinculo('id','apelido')" com o apelido escapado para HTML —
 *  o navegador desfaz o &#39; e um apóstrofo no nome da usina quebrava o JS
 *  (e um nome malicioso rodava código). Agora id e nome vão em data-sistema /
 *  data-apelido e o onclick lê this.dataset. Mesma função, mesmo modal. */
export const R16_VINCULO_POR_DATASET: MudancaContrato = {
  motivo: 'conserto: onclick do Vincular cliente quebrava com apóstrofo no nome da usina (e permitia injetar JS)',
  entra: { dataAttrs: ['data-apelido', 'data-sistema'] },
};

/** Ficha do cliente: as abas viraram ÂNCORAS (todas as seções na página, em
 *  duas colunas) — sai o script que escondia/mostrava "#abas a" e
 *  "[id$=-content]". Bônus: os redirects do servidor (#dados, #anexos) agora
 *  caem na seção certa (antes a aba Anexos ficava escondida). */
export const R16_ABAS_POR_ANCORA: MudancaContrato = {
  motivo: 'ficha do cliente com abas por âncora (sem o JS de esconder abas)',
  sai: { ids: ['abas'], seletores: ['#abas a', '[id$="-content"]'] },
};

/** Ficha do cliente (tenant): a trilha "Clientes › nome" ganha link de volta
 *  pra lista (a EcoSun já tinha o link no menu). */
export const R16_TRILHA_LISTA: MudancaContrato = {
  motivo: 'trilha da ficha com link de volta pra lista de clientes',
  entra: { links: ['/dashboard/clientes'] },
};


// ════════════════════════════════════════════════════════════════════════
// R17 — Marketing
// ════════════════════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════════════════════
// R18 — RH
// ════════════════════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════════════════════
// R19 — Configurações
// ════════════════════════════════════════════════════════════════════════
