// Renovação do miolo — R20 (Financeiro II: Notas fiscais, Cobrar cliente,
// Assinaturas): o que MUDA de propósito no contrato das telas. O JSON gravado
// da tela antiga (contrato-financeiro2.json) NÃO é regravado: cada troca fica
// escrita aqui, item por item, com o motivo.
import type { MudancaContrato } from '../helpers/contrato-tela.js';

export type { MudancaContrato };

/** R20: trocas por caso de tests/fixtures/casos-financeiro2.ts. */
export const MUDANCAS_R20: Record<string, MudancaContrato[]> = {};
