// Atendimento (Leads › Conversas, 28/09/2026) — o que MUDOU de propósito no
// contrato das telas, por decisão do Junior. Cada item diz por quê.
// Os JSON gravados das telas antigas (contrato-*.json) NÃO foram regravados.
import type { MudancaContrato } from '../helpers/contrato-tela.js';

const ID = '11111111-1111-1111-1111-111111111111';

/** Item "Conversas" novo no menu (Comercial) e nos atalhos Conversas · Lista · Funil. */
export const MENU_CONVERSAS: MudancaContrato = {
  motivo: 'menu ganhou Leads › Conversas',
  entra: { links: ['/dashboard/leads/conversas'] },
};

/** Copiloto IA sai da tela (a rota POST /leads/:id/ia-copiloto continua no servidor). */
export const SAI_COPILOTO: MudancaContrato = {
  motivo: 'Junior: Copiloto IA sai da tela',
  sai: {
    fetches: ["'/dashboard/leads/' + leadId + '/ia-copiloto'"],
    ids: ['ia-chat', 'ia-pergunta'],
    seletores: ['div'], // btn.closest('div') do "Copiar" do copiloto
  },
};

/** "Abrir cockpit completo" (/clientes/:id) — o Junior não pôs no "⋯ Mais". */
export const SAI_COCKPIT_COMPLETO: MudancaContrato = {
  motivo: 'Junior: ⋯ Mais só com pausar/retomar, proposta, contrato, perdido, arquivar, opt-out, excluir',
  sai: { links: [`/dashboard/clientes/${ID}`] },
};

/** Coluna da lista de conversas (busca GET + chips de filtro), dentro da própria tela. */
export const ENTRA_LISTA: MudancaContrato = {
  motivo: 'tela de 3 colunas: lista de conversas à esquerda',
  entra: {
    formularios: [{ method: 'GET', action: '/dashboard/leads/conversas', enctype: '', campos: [{ name: 'q', type: 'search' }] }],
    links: [
      '/dashboard/leads/conversas?filtro=aguardando', '/dashboard/leads/conversas?filtro=meus',
      '/dashboard/leads/conversas?etapa=novo', '/dashboard/leads/conversas?etapa=qualificando',
      '/dashboard/leads/conversas?etapa=proposta', '/dashboard/leads/conversas?etapa=negociacao',
      '/dashboard/leads/conversas?etapa=ganho', '/dashboard/leads/conversas?etapa=perdido',
    ],
  },
};

/** Script novo: rolar o chat até a última mensagem; janelinha do Fechou! (quando ainda não é venda). */
export const entraScript = (comFechou: boolean): MudancaContrato => ({
  motivo: 'chat rola até o fim; "Fechou!" abre janelinha (antes o bloco ficava sempre aberto)',
  entra: { ids: comFechou ? ['cc-at-msgs', 'modal-fechou'] : ['cc-at-msgs'] },
});
