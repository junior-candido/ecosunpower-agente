// Renovação do miolo — R20 (Financeiro II: Notas fiscais, Cobrar cliente,
// Assinaturas): o que MUDA de propósito no contrato das telas. O JSON gravado
// da tela antiga (contrato-financeiro2.json) NÃO é regravado: cada troca fica
// escrita aqui, item por item, com o motivo.
import type { MudancaContrato } from '../helpers/contrato-tela.js';
import { contratoDaTela } from '../helpers/contrato-tela.js';
import { renderLayout } from '../../src/modules/dashboard/views.js';
import type { DashUser } from '../../src/modules/dashboard/permissions.js';
import { TELAS_LEVES } from './mudancas-telas-leves.js';
import { USER_CASA, USER_TENANT } from './miolo-leads.js';

export type { MudancaContrato };

/** R20 (Cobrar cliente): era uma página SOLTA (sem menu, sem casca). Agora vem
 *  dentro da casca do painel — entra exatamente o contrato de uma casca vazia
 *  (menu, sair, CSS do painel por arquivo, script do menu). Nada da tela sai:
 *  mesmos ids e os mesmos dois fetch. */
function r20CobrarNaCasca(user: DashUser): MudancaContrato {
  const casca = contratoDaTela(renderLayout({ active: 'cobrar', title: 'x', body: '', user, tailwind: false, dark: true }));
  return { motivo: 'R20: Cobrar cliente entra na casca do painel (era página solta)', entra: casca };
}

const FISCAL = [
  'notas', 'notas-cert-vencendo', 'notas-vazio-sem-config', 'notas-tenant',
  'nota-nova', 'nota-nova-do-fechamento', 'nota-nova-sem-servico', 'nota-editar',
  'nota-preparada-com-cert', 'nota-preparada-homologacao', 'nota-preparada-sem-cert', 'nota-teste-homologacao',
  'nota-enviada', 'nota-autorizada', 'nota-cancelada',
  'fiscal-config', 'fiscal-config-teste', 'fiscal-config-vazia',
];

/** R20: trocas por caso de tests/fixtures/casos-financeiro2.ts. Notas fiscais:
 *  a troca comum das telas renovadas (sai o Tailwind do CDN). Assinaturas: nada
 *  (já nasceram no padrão cc-, #339). */
export const MUDANCAS_R20: Record<string, MudancaContrato[]> = {
  ...Object.fromEntries(FISCAL.map((c) => [c, [TELAS_LEVES]])),
  'cobrar': [r20CobrarNaCasca(USER_CASA)],
  'cobrar-sem-infinitepay': [r20CobrarNaCasca(USER_CASA)],
  'cobrar-tenant': [r20CobrarNaCasca(USER_TENANT)],
};
