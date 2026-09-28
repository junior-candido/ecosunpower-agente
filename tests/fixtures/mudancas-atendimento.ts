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

/** Junior (28/09): lista estreita e filtros cortados → colunas ajustáveis arrastando a borda. */
export const ENTRA_ALCAS: MudancaContrato = {
  motivo: 'Junior: poder aumentar/diminuir as colunas arrastando',
  entra: { seletores: ['.cc-at-alca', '.cc-at-grade'] },
};

// ---------------------------------------------------------------------------
// Parte 2 (28/09/2026) — responder pelo painel.
// ---------------------------------------------------------------------------

/** Contato que pediu para PARAR: sem "Devolver para a Eva" (o servidor também recusa). */
export const SAI_RETOMAR_OPT_OUT: MudancaContrato = {
  motivo: 'LGPD: quem pediu para parar não volta a falar com a Eva — sem botão de devolver',
  sai: { formularios: [{ method: 'POST', action: `/dashboard/leads/${ID}/resume-eva`, enctype: '', campos: [] }] },
};

/** Campo de resposta (janela aberta) + modelo aprovado + script (trava do 2º clique e prévia). */
export const ENTRA_RESPONDER: MudancaContrato = {
  motivo: 'Junior: responder o WhatsApp de dentro do painel (texto na janela de 24 h, modelo fora dela)',
  entra: {
    formularios: [
      { method: 'POST', action: `/dashboard/leads/${ID}/responder`, enctype: '', campos: [{ name: 'chave', type: 'hidden' }, { name: 'texto', type: 'textarea' }] },
      { method: 'POST', action: `/dashboard/leads/${ID}/responder-modelo`, enctype: '', campos: [{ name: 'chave', type: 'hidden' }, { name: 'modelo', type: 'select' }, { name: 'nome', type: 'text' }] },
    ],
    ids: ['cc-at-modelo-custo', 'cc-at-modelo-nome', 'cc-at-modelo-sel', 'cc-at-previa', 'cc-at-texto'],
    seletores: ['button[type=submit]', 'form[data-envio]'],
    dataAttrs: ['data-envio'],
  },
};

/** Parte 2c: respostas prontas (chips que preenchem o campo ou escolhem o modelo). */
export const ENTRA_RESPOSTAS_PRONTAS: MudancaContrato = {
  motivo: 'Junior: respostas prontas (boas-vindas, conta de luz, proposta, visita, financiamento)',
  entra: { seletores: ['[data-pronta]', 'details'], dataAttrs: ['data-pronta'] },
};
