// Renovação do miolo — Onda 4 (acabamento: R5, R21–R26): o que MUDA de
// propósito no contrato das telas. Os JSON gravados das telas antigas NÃO são
// regravados: cada troca fica escrita aqui, item por item, com o motivo (cada
// fatia na sua seção). A troca comum (sai o Tailwind do CDN) é TELAS_LEVES
// (mudancas-telas-leves.ts). O R20 (Financeiro II) NÃO faz parte desta onda.
import type { ContratoTela, MudancaContrato } from '../helpers/contrato-tela.js';
import { contratoDaTela } from '../helpers/contrato-tela.js';
import { renderLayout } from '../../src/modules/dashboard/views.js';
import { USER_CASA } from './miolo-leads.js';

import { URL_CSS_COMMAND_CENTER } from '../../src/modules/dashboard/ui/estatico.js';
import { TELAS_LEVES } from './mudancas-telas-leves.js';
import { TEMA_GRAFICOS } from './mudancas-onda2.js';

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



// ════════════════════════════════════════════════════════════════════════
// R21 — Comercial II (contratos, Fechou!, contrato do lead, recados, lojas, conhecimento)
// ════════════════════════════════════════════════════════════════════════

/** R21 — o link "← voltar pra busca" do formulário do contrato é o MESMO
 *  (/dashboard/contratos?q=<nome>). Antes ele ia sem escapar no atributo e o
 *  leitor do contrato cortava no apóstrofo do nome ("Ana D'Ávila" → "Ana%20D");
 *  agora o atributo vem escapado (&#39;) e o navegador (e o leitor) leem inteiro.
 *  Mesmo destino — o que muda é só a leitura do teste. */
const R21_VOLTAR_BUSCA_INTEIRO: MudancaContrato = {
  motivo: 'R21: link de voltar pra busca escapado no atributo (o leitor via o nome cortado no apóstrofo)',
  sai: { links: ['/dashboard/contratos?q=Ana%20D'] },
  entra: { links: ["/dashboard/contratos?q=Ana%20D'%C3%81vila"] },
};
const R21_FORMS = ['form-faltando', 'form-cheio', 'form-ia', 'form-ia-falhou', 'form-ia-off', 'form-congelado', 'form-sem-proposta', 'form-aditivo', 'form-procuracao-tenant'];
/** R21: trocas por caso de tests/fixtures/casos-comercial2.ts (além de TELAS_LEVES). */
export const MUDANCAS_R21: Record<string, MudancaContrato[]> = Object.fromEntries(R21_FORMS.map((c) => [c, [R21_VOLTAR_BUSCA_INTEIRO]]));


// ════════════════════════════════════════════════════════════════════════
// R22 — Operação II (pós-venda, medição)
// ════════════════════════════════════════════════════════════════════════

/** R22 (pós-venda, tenant): o confirm do "enviar pelo copiloto" dizia "pela
 *  Eva" (nome da assistente da casa). Tenant lê "pela assistente". O envio do
 *  tenant continua barrado no servidor (podeDispararMensagens → 403). */
const R22_TENANT_SEM_EVA: MudancaContrato = {
  motivo: 'R22: tenant não vê o nome da assistente da casa no confirm',
  sai: { confirms: ["'Enviar esta mensagem pro cliente pela Eva?'"] },
  entra: { confirms: ["'Enviar esta mensagem pro cliente pela assistente?'"] },
};
/** R22: trocas por caso de tests/fixtures/casos-operacao2.ts (TELAS_LEVES = sai
 *  o Tailwind do CDN, a troca comum das telas renovadas). */
export const MUDANCAS_R22: Record<string, MudancaContrato[]> = {
  'pos-venda': [TELAS_LEVES],
  'pos-venda-sem-agenda': [TELAS_LEVES],
  'pos-venda-vazio': [TELAS_LEVES],
  'pos-venda-tenant': [TELAS_LEVES, R22_TENANT_SEM_EVA],
  'medicao': [TELAS_LEVES],
  'medicao-um-aparelho': [TELAS_LEVES],
  'medicao-sem-leitura': [TELAS_LEVES],
  'medicao-sem-aparelho': [TELAS_LEVES],
  'medicao-tenant': [TELAS_LEVES],
};


// ════════════════════════════════════════════════════════════════════════
// R23 — Prédio Vivo e Cérebro dentro da casca (modo imersivo)
// ════════════════════════════════════════════════════════════════════════

/** R23 (troca deliberada, ok do Junior): as duas telas eram páginas soltas e
 *  agora vêm DENTRO da casca — entra exatamente o contrato de uma casca vazia
 *  (menu, sair, CSS do painel por arquivo, script do menu). Nada da tela sai. */
function r23NaCasca(active: 'predio' | 'cerebro'): MudancaContrato {
  const casca = contratoDaTela(renderLayout({ active, title: 'x', body: '', user: USER_CASA, tailwind: false, imersivo: true, dark: true, largo: true }));
  const { formularios, ...resto } = casca;
  return { motivo: `R23: ${active} entra na casca do painel (modo imersivo)`, entra: { ...resto, formularios } };
}
/** R23: trocas por caso de tests/fixtures/casos-imersivo.ts. */
export const MUDANCAS_R23: Record<string, MudancaContrato[]> = {
  predio: [r23NaCasca('predio')],
  cerebro: [r23NaCasca('cerebro')],
};


// ════════════════════════════════════════════════════════════════════════
// R24 — Visão geral (/home)
// ════════════════════════════════════════════════════════════════════════

/** R24: trocas por caso de tests/fixtures/casos-home.ts — a troca comum das
 *  telas renovadas (sai o Tailwind do CDN) e os gráficos lendo as cores do
 *  tema (JS_TEMA_GRAFICOS, mesma troca das telas com gráfico da Onda 2).
 *  Mesmo GET ?mes=, mesmos canvas, mesmo CDN do Chart.js. */
export const MUDANCAS_R24: Record<string, MudancaContrato[]> = Object.fromEntries(
  ['home', 'home-mes-passado', 'home-vazio'].map((c) => [c, [TELAS_LEVES, TEMA_GRAFICOS]]),
);
