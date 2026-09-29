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

/** Parte 2b: o dono (admin da casa) liga o WhatsApp pessoal dele pela tela de Conversas. */
export const ENTRA_MEU_WHATSAPP: MudancaContrato = {
  motivo: 'Junior: o número pessoal dele (QR) entra no painel — atalho "👤 Conectar meu WhatsApp"',
  entra: { links: ['/dashboard/whatsapp/pessoal'] },
};

/**
 * Junior (28/09): "quando envio não sai suave, demora e dá um toque na tela
 * inteira". O envio vai por fetch (JSON) SEM recarregar; a conversa aberta se
 * atualiza sozinha (balões, faixa "assumiu", janela de 24 h). Os formulários
 * POST continuam iguais (sem JS funciona como antes).
 */
export const ENTRA_SEM_RECARREGAR: MudancaContrato = {
  motivo: 'Junior: responder sem recarregar a página + mensagens novas aparecem sozinhas',
  entra: {
    fetches: ["f.getAttribute('action')", 'u'],
    ids: ['cc-at-topo', 'conversa', 'responder'],
    seletores: ['#cc-at-topo', '#responder', '.cc-at-aviso-envio', '.cc-at-janela', '.cc-at-msg-h', '.cc-at-vazio', 'input[name=chave]', 'textarea[name=texto]'],
  },
};

// ---------------------------------------------------------------------------
// W1 (28/09/2026) — mídia no WhatsApp: foto, PDF/documento, áudio e vídeo.
// ---------------------------------------------------------------------------

/** Foto do chat amplia na própria tela (a janelinha é criada pelo script). */
export const ENTRA_AMPLIAR: MudancaContrato = {
  motivo: 'Junior: foto em miniatura que amplia no chat',
  entra: { dataAttrs: ['data-ampliar'], seletores: ['[data-ampliar]', 'button', 'img'] },
};

/**
 * Anexar foto, PDF/documento, áudio (arquivo ou gravado) e vídeo — com prévia
 * antes de enviar, legenda, arrastar/colar e envio sem recarregar. Mesmas
 * regras do texto (no número da Eva, só dentro da janela de 24 h).
 */
export const ENTRA_MIDIA: MudancaContrato = {
  motivo: 'Junior: enviar foto, PDF, áudio e vídeo pelo painel (prévia + legenda)',
  entra: {
    formularios: [{
      method: 'POST', action: `/dashboard/leads/${ID}/responder-midia`, enctype: 'multipart/form-data',
      campos: [{ name: 'arquivo', type: 'file' }, { name: 'chave', type: 'hidden' }, { name: 'legenda', type: 'text' }],
    }],
    ids: ['cc-at-anexo-prev', 'cc-at-arquivo', 'cc-at-gravar', 'cc-at-legenda'],
    seletores: ['#cc-at-gravar', '#conversa', 'form[data-envio-midia]'],
    dataAttrs: ['data-envio-midia'],
  },
};

// ---------------------------------------------------------------------------
// W2 (28/09/2026) — responder CITANDO e REAGIR com emoji.
// ---------------------------------------------------------------------------

/**
 * Cada mensagem com id do WhatsApp ganha "⋯" (Responder / reagir 👍❤️😂😮😢🙏);
 * "Responder" põe "Respondendo a …" em cima do campo e o id da citada no
 * campo oculto `citando` (texto e arquivo). Reações e citações aparecem no balão.
 */
export const ENTRA_CITAR_REAGIR: MudancaContrato = {
  motivo: 'Junior: responder citando uma mensagem e reagir com emoji',
  sai: {
    formularios: [
      { method: 'POST', action: `/dashboard/leads/${ID}/responder`, enctype: '', campos: [{ name: 'chave', type: 'hidden' }, { name: 'texto', type: 'textarea' }] },
      { method: 'POST', action: `/dashboard/leads/${ID}/responder-midia`, enctype: 'multipart/form-data', campos: [{ name: 'arquivo', type: 'file' }, { name: 'chave', type: 'hidden' }, { name: 'legenda', type: 'text' }] },
    ],
  },
  entra: {
    formularios: [
      { method: 'POST', action: `/dashboard/leads/${ID}/responder`, enctype: '', campos: [{ name: 'chave', type: 'hidden' }, { name: 'citando', type: 'hidden' }, { name: 'texto', type: 'textarea' }] },
      { method: 'POST', action: `/dashboard/leads/${ID}/responder-midia`, enctype: 'multipart/form-data', campos: [{ name: 'arquivo', type: 'file' }, { name: 'chave', type: 'hidden' }, { name: 'citando', type: 'hidden' }, { name: 'legenda', type: 'text' }] },
    ],
    fetches: ['URLR'],
    ids: ['cc-at-citando', 'cc-at-citando-txt'],
    dataAttrs: ['data-acoes', 'data-msg', 'data-tirar-citacao'],
    seletores: [
      '.cc-at-foto', '.cc-at-menu-msg', '.cc-at-midia,.cc-at-doc-txt strong', '.cc-at-msg-q', '.cc-at-msg-t', '.cc-at-reacoes',
      '[data-acoes]', '[data-msg]', '[data-tirar-citacao]', 'audio', 'input[name=citando]', 'video',
    ],
  },
};

// ---------------------------------------------------------------------------
// Troca suave (28/09/2026) — trocar de contato e enviar SEM piscar.
// ---------------------------------------------------------------------------

/** Ids que o script do chat procura (existem só quando a conversa tem campo de resposta). */
const IDS_DO_CHAT = [
  'cc-at-anexo-prev', 'cc-at-arquivo', 'cc-at-citando', 'cc-at-citando-txt', 'cc-at-gravar', 'cc-at-legenda',
  'cc-at-modelo-custo', 'cc-at-modelo-nome', 'cc-at-modelo-sel', 'cc-at-msgs', 'cc-at-previa', 'cc-at-texto',
  'cc-at-topo', 'conversa', 'responder',
];

/**
 * Junior (28/09): "ao clicar noutro contato a tela pisca" — trocar de contato
 * agora busca só o miolo (chat + resumo) pela MESMA rota e troca as duas
 * colunas, sem recarregar. Por isso o script do chat (enviar/anexar/citar/
 * reagir/atualizar) e o da troca vão em TODA tela de Conversas — mesmo sem
 * campo de resposta ou sem lead aberto: a próxima conversa pode ter. Nenhum
 * formulário, link ou confirm() muda. `html` = a tela, para saber quais ids o
 * script procura que ainda não existem nela.
 */
export const entraTrocaSuave = (html: string): MudancaContrato => ({
  motivo: 'Junior: trocar de contato sem recarregar (script do chat sempre na tela de Conversas)',
  entra: {
    // 'ac' = ✋ Assumir / ↩ Devolver sem recarregar (o MESMO POST do formulário)
    fetches: ['URLR', 'ac', 'chave(u)', "f.getAttribute('action')", 'u'],
    ids: IDS_DO_CHAT,
    idsAusentes: IDS_DO_CHAT.filter((id) => !html.includes(`id="${id}"`)),
    seletores: [
      '#cc-at-gravar', '#cc-at-topo', '#conversa', '#responder', '.cc-at', '.cc-at-abas-voltar', '.cc-at-aviso-envio', '.cc-at-chat-topo', '.cc-at-como', '.cc-at-dia',
      '.cc-at-esq', '.cc-at-foto', '.cc-at-grade', '.cc-at-item', '.cc-at-janela', '.cc-at-menu-msg', '.cc-at-midia,.cc-at-doc-txt strong',
      '.cc-at-msg-h', '.cc-at-msg-q', '.cc-at-msg-t', '.cc-at-msgs', '.cc-at-reacoes', '.cc-at-vazio', '[data-acoes]', '[data-msg]',
      '[data-pronta]', '[data-tirar-citacao]', 'a[href]', 'audio', 'button', 'button[type=submit]', 'details', 'form[data-envio-midia]',
      'form[data-envio]', 'input[name=chave]', 'input[name=citando]', 'textarea[name=texto]', 'video',
    ],
    dataAttrs: ['data-acoes', 'data-envio', 'data-envio-midia', 'data-msg', 'data-pronta', 'data-tirar-citacao'],
  },
});

/**
 * Junior (28/09): "senti falta de baixar as imagens e PDF somente com um
 * clique". Cada foto/PDF/áudio/vídeo do chat ganha ⬇ Baixar (?baixar=1 na
 * MESMA rota protegida) e a seção Arquivos ganha "⬇ Baixar tudo (.zip)".
 * `temArquivos` = o lead tem arquivos (a seção só aparece com arquivo).
 */
export const entraBaixar = (temArquivos: boolean): MudancaContrato => ({
  motivo: 'Junior: baixar foto/PDF com um clique e tudo num .zip',
  entra: { links: temArquivos ? [`/dashboard/leads/${ID}/arquivos.zip`] : [] },
});

/** Agendamento aguardando confirmação (28/09): os botões do aviso respondem sem recarregar (mesmo POST). */
export const ENTRA_AGENDA_PENDENTE: MudancaContrato = {
  motivo: 'Junior: a Eva não marca sozinha — o aviso de agendamento responde sem recarregar a tela',
  entra: { seletores: ['.cc-at-agenda'] },
};
