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

/** R15: trocas por caso de tests/fixtures/casos-obras.ts (vazio = contrato idêntico). */
export const MUDANCAS_R15: Record<string, MudancaContrato[]> = {};


// ════════════════════════════════════════════════════════════════════════
// R16 — Clientes
// ════════════════════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════════════════════
// R17 — Marketing
// ════════════════════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════════════════════
// R18 — RH
// ════════════════════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════════════════════
// R19 — Configurações
// ════════════════════════════════════════════════════════════════════════
