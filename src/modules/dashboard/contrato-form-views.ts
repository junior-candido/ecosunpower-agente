// src/modules/dashboard/contrato-form-views.ts
// 📝 O formulário da CENTRAL DE CONTRATOS.
//
// Mostra TODOS os campos do tipo de contrato escolhido, já preenchidos com o que
// veio do cadastro + proposta + o que a IA leu da conta/CNH. O que faltou aparece
// destacado em vermelho ("vai sair em branco no PDF") pro operador completar.
// Os campos vêm do registro (contratos-registry) — tipo novo não mexe nesta tela.
//
// Renovação do miolo — R21 (28/09/2026): MESMOS formulários (ler-documentos
// multipart, form-contrato com os formaction de IA/parcelas/congelar e o
// confirm do congelar, vincular proposta com o confirm, enviar-doc, salvar-drive),
// mesmos names e ids (campo-*, lista-*, cf_docs, form-contrato, btn-preview,
// preview-doc) e o mesmo script (data-usar/data-valor). Visual cc- (tema escuro,
// sem Tailwind). A TRAVA DE SAÍDA (#317) é do servidor e não muda: a caixa de
// status continua usando `problemas` (o mesmo resultado da trava).
import { escapeHtml } from './views.js';
import { bannerContratos } from './contratos-views.js';
import { cabecalhoPagina, cartaoSecao, botao, pilulaStatus, icone, abas } from './ui/componentes.js';
import { renderComercial, avisoHtml, ehCasa, TRILHA_COMERCIAL } from './comercial-casca.js';
import { gruposDoContrato, type CampoContrato, type DefinicaoContrato } from '../closing/contratos-registry.js';
import type { AchadoRevisao, SugestaoIa } from '../closing/revisar-contrato.js';
/** Uma linha da tabela do cartão, já com a frase pronta que vai pro contrato. */
export interface LinhaCartao {
  parcelas: number;
  parcela: number;
  total: number;
  frase: string;
}

export interface ContratoFormInput {
  leadId: string;
  nome: string;
  def: DefinicaoContrato;
  tipos: Array<{ tipo: string; nome: string; emoji: string }>;
  valores: Record<string, string>;
  faltando: CampoContrato[];
  /**
   * Os problemas da TRAVA (montarDocumentoFinal(...).problemas) — o mesmo
   * resultado que decide se Gerar PDF / Mandar / Drive saem. A caixa de status
   * usa ISTO (não os campos vermelhos): formulário e trava nunca discordam.
   */
  problemas: string[];
  temProposta: boolean;
  /** A proposta usada já venceu (ISO). Vale pro contrato, mas pede conferir os valores. */
  propostaExpiradaEm?: string | null;
  /** Propostas SEM lead, da mesma empresa, com nome parecido — pra vincular na mão. */
  /** Resultado do "Vincular proposta" ('ok' | 'erro'). */
  vinculoResultado?: string;
  propostasOrfas?: Array<{ id: string; cliente_nome: string | null; numero_proposta?: string | null; created_at: string }>;
  salvo?: boolean;
  docsResultado?: string;
  envioResultado?: string;
  driveResultado?: string;
  /** O que a IA achou pra cada campo em branco — SUGESTÃO, não vai pro campo sozinha. */
  sugestoes?: Record<string, SugestaoIa>;
  /** O que a IA achou de errado no contrato. */
  achados?: AchadoRevisao[];
  /** A IA rodou nesta tela. */
  iaRodou?: boolean;
  /** A IA não respondeu (sem crédito, fora do ar, demorou). NUNCA fingir que revisou. */
  iaFalhou?: boolean;
  /** Não tem chave da IA configurada no servidor. */
  iaIndisponivel?: boolean;
  /** A tabela do cartão calculada pro valor que está na tela (botão "calcular"). */
  parcelamento?: { valor: number; linhas: LinhaCartao[] } | null;
  /** Pediu pra calcular mas o valor da venda está em branco. */
  parcelamentoSemValor?: boolean;
  /** O contrato congelado ("este é o contrato que vale"). Null = nunca congelaram. */
  vigente?: { congeladoEm: string; valor: number; formaPagamento: string } | null;
  /** Acabou de congelar agora. */
  congelou?: boolean;
  user?: unknown;
}

const FONTE_TEXTO: Record<string, string> = {
  cadastro: 'no cadastro do cliente',
  proposta: 'na proposta',
  conversa: 'na conversa do WhatsApp',
};

function campoHtml(c: CampoContrato, valor: string, vazio: boolean): string {
  const cls = vazio ? ' class="cc-cf-vazio"' : '';
  const v = escapeHtml(valor);

  if (c.somenteLeitura) {
    // sem `name` → o navegador nem manda esse campo, então não tem como salvar
    return `<input type="text" value="${v}" disabled />`;
  }
  if (c.tipo === 'select') {
    const opcoes = (c.opcoes ?? [])
      .map((o) => `<option value="${escapeHtml(o.valor)}"${o.valor === valor ? ' selected' : ''}>${escapeHtml(o.texto)}</option>`)
      .join('');
    // Select que já vem com uma opção escolhida (o ler() nunca devolve vazio)
    // não ganha o "— escolher —": escolher o vazio seria descartado ao salvar e
    // o operador ficaria sem entender por que o valor antigo voltou.
    const temEscolhido = (c.opcoes ?? []).some((o) => o.valor === valor);
    const opcaoVazia = temEscolhido ? '' : '<option value="">— escolher —</option>';
    return `<select name="${c.id}" id="campo-${c.id}"${cls}>${opcaoVazia}${opcoes}</select>`;
  }
  if (c.tipo === 'textarea') {
    return `<textarea name="${c.id}" id="campo-${c.id}" rows="3"${cls} placeholder="${escapeHtml(c.dica ?? '')}">${v}</textarea>`;
  }
  // Lista de atalhos, mas campo LIVRE: o operador escolhe uma das de sempre ou
  // escreve o que combinou com o cliente. (É o caso da forma de pagamento.)
  if (c.tipo === 'texto_sugerido') {
    const lista = `lista-${c.id}`;
    const itens = (c.sugestoes ?? []).map((s) => `<option value="${escapeHtml(s)}"></option>`).join('');
    return `<input type="text" name="${c.id}" id="campo-${c.id}" value="${v}" list="${lista}"
        placeholder="${escapeHtml(c.dica ?? '')}" autocomplete="off"${cls} />
      <datalist id="${lista}">${itens}</datalist>`;
  }
  const htmlType = c.tipo === 'data' ? 'date' : 'text';
  const inputmode = c.tipo === 'numero' || c.tipo === 'moeda' ? ' inputmode="decimal"' : '';
  return `<input type="${htmlType}" name="${c.id}" id="campo-${c.id}" value="${v}"${inputmode} placeholder="${escapeHtml(c.dica ?? '')}"${cls} />`;
}

// A sugestão da IA NÃO entra no campo sozinha. Fica aqui do lado, dizendo de onde
// saiu e mostrando o trecho — e só entra se o Junior clicar em "usar". Num
// contrato, um clique distraído em Salvar não pode gravar palpite de máquina no
// cadastro do cliente.
function cartaoSugestao(c: CampoContrato, s: SugestaoIa): string {
  const onde = FONTE_TEXTO[s.fonte] ?? 'nas fontes';
  return `<div class="cc-cf-sug">
      ${icone('spark', 'sm')}
      <div class="cc-cf-sug-txt">Achei <strong>${escapeHtml(s.valor)}</strong> ${escapeHtml(onde)}.
        <small title="${escapeHtml(s.trecho)}">“${escapeHtml(s.trecho)}”</small>
      </div>
      <button type="button" data-usar="${escapeHtml(c.id)}" data-valor="${escapeHtml(s.valor)}" class="cc-btn cc-btn-sm">usar</button>
    </div>`;
}

function campo(c: CampoContrato, valor: string, sugestao?: SugestaoIa): string {
  const vazio = !!c.obrigatorio && !valor;
  const marca = vazio && !sugestao
    ? '<span class="cc-cf-falta">vai sair em branco no PDF</span>'
    : '';
  // Input/textarea mostram a dica como placeholder; select não tem placeholder,
  // então a dica aparece escrita embaixo (senão viraria código morto — e é nela
  // que mora o efeito jurídico de escolhas como a da visita técnica).
  const dica = (c.somenteLeitura || c.tipo === 'select') && c.dica
    ? `<div class="cc-cf-dica">${escapeHtml(c.dica)}</div>`
    : '';
  return `<div class="cc-campo">
      <span${vazio ? ' class="cc-cf-rot-vazio"' : ''}>${escapeHtml(c.label)}${marca}</span>
      ${campoHtml(c, valor, vazio)}
      ${sugestao ? cartaoSugestao(c, sugestao) : ''}
      ${dica}
    </div>`;
}

const dinheiro = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const dataHoraBR = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};

// "Este é o contrato que vale" — congela o retrato do que foi combinado.
// Sem isso não existe aditivo: o aditivo precisa dizer "antes era 24x sem juros",
// e esse "antes" só existe se alguém tiver carimbado o contrato.
function congelar(page: ContratoFormInput): string {
  if (page.def.tipo === 'aditivo') return ''; // aditivo não se congela; contrato sim
  const v = page.vigente;

  // O botão vive DENTRO do formulário (formaction): ele salva o que está na tela e
  // só então congela. Se ficasse fora, quem preenchesse e clicasse direto aqui
  // carimbaria os dados velhos, em silêncio.
  const botaoCongelar = (texto: string) => `
    <button type="submit" formaction="/dashboard/leads/${page.leadId}/contrato-congelar"
      onclick="return confirm('Salvar o que está na tela e congelar como o contrato que vale?')"
      class="cc-btn">${icone('lock', 'sm')}${texto}</button>`;

  if (!v) {
    return cartaoSecao({
      titulo: 'Este contrato ainda não foi congelado',
      acoesHtml: pilulaStatus('acompanhar', 'não congelado'),
      corpoHtml: `<p class="cc-cm-nota" style="margin:0 0 12px">
        Enquanto não congelar, o PDF é montado do zero toda vez (a partir do cadastro e da proposta) —
        se a proposta mudar amanhã, o "contrato original" muda junto. Congelar salva o que está na tela e guarda
        o <strong>retrato</strong> do que foi combinado, com data. <strong>É o que permite fazer aditivo depois.</strong>
      </p>
      ${botaoCongelar('Este é o contrato que vale')}`,
    });
  }

  return cartaoSecao({
    titulo: `Contrato congelado em ${dataHoraBR(v.congeladoEm)}`,
    acoesHtml: pilulaStatus('normal', 'congelado'),
    corpoHtml: `<p class="cc-cm-nota" style="margin:0 0 8px">
      Valendo: <strong>${dinheiro(v.valor)}</strong> — ${escapeHtml(v.formaPagamento)}.
      Mudou alguma coisa? Faz um <strong>termo aditivo</strong> (lá em cima), que ele cita este contrato sozinho.
    </p>
    <p class="cc-cm-nota" style="margin:0 0 12px">
      Gerar PDF, Mandar e Salvar no Drive (contrato e procuração) usam a versão congelada, com a data do congelamento.
      Corrigiu algum dado aqui? <strong>Congele de novo</strong> — senão sai a versão antiga.
    </p>
    ${botaoCongelar('Congelar de novo (vira a versão seguinte)')}`,
  });
}

// O aditivo sem contrato congelado não tem o que citar.
function avisoAditivo(page: ContratoFormInput): string {
  if (page.def.tipo !== 'aditivo' || page.vigente) return '';
  return avisoHtml('atencao', `<strong>Esse cliente não tem contrato congelado.</strong> O aditivo precisa dizer "fica alterado o contrato
      firmado em tal data" — e essa data não existe ainda. Vai na aba do <strong>Contrato</strong>, confere os dados
      e clica em <strong>"Este é o contrato que vale"</strong>. Aí volta aqui. (O aditivo gera assim mesmo, mas com a
      data em branco pra preencher à mão.)`);
}

// A calculadora do cartão. Usa a MESMA tabela da proposta (proposal/cartao-solar)
// — se usasse outra, o cliente leria um número na proposta e assinaria outro no
// contrato. Financiamento de banco NÃO entra: quem define a parcela é o banco, e a
// máquina não pode inventar juros de banco dentro de um contrato.
function calculadoraCartao(page: ContratoFormInput): string {
  const alvo = `/dashboard/leads/${page.leadId}/contrato-parcelas`;
  // No aditivo, a parcela nova vai pro campo do aditivo, não pro do contrato.
  const campoAlvo = page.def.tipo === 'aditivo' ? 'adit_nova_forma_pagamento' : 'com_forma_pagamento';
  const deOnde = page.def.tipo === 'aditivo'
    ? 'em cima do valor do contrato'
    : 'em cima do Valor total aí em cima';
  let resultado = '';

  if (page.parcelamentoSemValor) {
    resultado = `<div style="margin-top:12px">${avisoHtml('atencao', 'Preenche o <strong>valor</strong> primeiro — sem ele não tem o que parcelar.')}</div>`;
  } else if (page.parcelamento) {
    const linhas = page.parcelamento.linhas.map((l) => `<tr>
          <td class="cc-n">${l.parcelas}x</td>
          <td class="cc-n"><strong>${dinheiro(l.parcela)}</strong></td>
          <td><span class="cc-faint">total ${dinheiro(l.total)}</span></td>
          <td class="cc-r">
            <button type="button" data-usar="${campoAlvo}" data-valor="${escapeHtml(l.frase)}" class="cc-btn cc-btn-sm">usar</button>
          </td>
        </tr>`).join('');
    resultado = `<div class="cc-cf-parc">
        <div class="cc-cf-parc-t">
          Em cima de <strong>${dinheiro(page.parcelamento.valor)}</strong>. Clica em <strong>usar</strong> pra escrever no documento.
        </div>
        <div class="cc-cf-parc-l">
          <table><tbody>${linhas}</tbody></table>
        </div>
      </div>`;
  }

  return `<div class="cc-cm-cheia cc-cf-calc">
      <div class="cc-cm-acoes">
        <strong>Calcular a parcela no cartão</strong>
        <button type="submit" formaction="${alvo}" class="cc-btn cc-btn-sm">${icone('wallet', 'sm')}Calcular</button>
        <span class="cc-cm-nota" style="margin:0">${escapeHtml(deOnde)} — é a mesma conta que a proposta mostrou pro cliente</span>
      </div>
      <p class="cc-cm-nota">
        Financiamento de banco não entra aqui: quem define a parcela é o banco, na aprovação. Escreve no campo o que veio aprovado.
      </p>
      ${resultado}
    </div>`;
}

function grupo(titulo: string, campos: CampoContrato[], valores: Record<string, string>, sugestoes: Record<string, SugestaoIa>, extra = ''): string {
  if (campos.length === 0) return '';
  const faltam = campos.filter((c) => c.obrigatorio && !valores[c.id]).length;
  const selo = faltam > 0 ? pilulaStatus('critico', `${faltam} em branco`) : pilulaStatus('normal', 'completo');
  return cartaoSecao({
    titulo,
    acoesHtml: selo,
    corpoHtml: `<div class="cc-cm-grade">
        ${campos.map((c) => campo(c, valores[c.id] ?? '', sugestoes[c.id])).join('\n')}
        ${extra}
      </div>`,
  });
}

// O contrato montado, do jeitinho que vai virar PDF — inclusive com o que você
// acabou de digitar e ainda não salvou (o botão reposta o formulário pra prévia).
// O quadro é TRANCADO (sandbox): o documento leva nome/endereço que vieram de
// fora (perfil do WhatsApp, CNH, formulário do Meta) e não pode rodar nada aqui.
function preview(page: ContratoFormInput): string {
  const url = `/dashboard/leads/${page.leadId}/contrato-preview?tipo=${encodeURIComponent(page.def.tipo)}`;
  return cartaoSecao({
    titulo: 'Como vai ficar o documento',
    dica: 'mesmo template do PDF',
    acoesHtml: `<button type="button" id="btn-preview" class="cc-btn cc-btn-sm">↻ ver como está agora</button>`,
    corpoHtml: `<iframe id="preview-doc" name="preview-doc" src="${url}" title="Prévia do documento" sandbox="" class="cc-cf-prev"></iframe>
      <p class="cc-cm-nota">O quadro mostra o documento <strong>salvo</strong>. Digitou algo e quer ver antes de salvar? Clica em <strong>ver como está agora</strong>.</p>`,
  });
}

// O que a IA fez. Regra de ouro: se ela NÃO respondeu, a tela diz isso na cara —
// jamais um "está tudo certo" sobre um contrato que a máquina não leu.
function revisaoIa(page: ContratoFormInput): string {
  if (page.iaIndisponivel) {
    return avisoHtml('info', 'A IA não está ligada neste servidor (falta a chave). O contrato gera do mesmo jeito — só não tem quem confira.');
  }
  if (!page.iaRodou) return '';

  if (page.iaFalhou) {
    return cartaoSecao({
      titulo: 'Não consegui revisar',
      acoesHtml: pilulaStatus('atencao', 'IA não respondeu'),
      corpoHtml: `<p class="cc-cm-nota" style="margin:0">A IA não respondeu agora (pode ser crédito da Anthropic, ou ela demorou demais). <strong>Ninguém conferiu este contrato.</strong> Tenta de novo daqui a pouco, ou confere na mão antes de mandar.</p>`,
    });
  }

  const achados = page.achados ?? [];
  const nSug = Object.keys(page.sugestoes ?? {}).length;
  const tom = (g: string): 'erro' | 'info' | 'atencao' => (g === 'alto' ? 'erro' : g === 'baixo' ? 'info' : 'atencao');

  const lista = achados.length === 0
    ? avisoHtml('ok', 'A IA não apontou nada de errado. <strong>Isso não é garantia</strong> — dá uma lida no documento aí em cima antes de mandar.')
    : achados.map((a) => avisoHtml(tom(a.gravidade), escapeHtml(a.texto))).join('');

  const sug = nSug > 0
    ? avisoHtml('info', `Achei ${nSug} dado(s) que estavam faltando. Estão nos cartões roxos lá embaixo, com o trecho de onde eu tirei. <strong>Confere e clica em "usar"</strong> — eu não preencho nada sozinha.`)
    : avisoHtml('info', 'Não encontrei os dados que faltam — nem no cadastro, nem na proposta, nem na conversa. Preenche na mão.');

  return cartaoSecao({ titulo: 'O que a IA fez', corpoHtml: `${sug}${lista}` });
}

function abasTipos(page: ContratoFormInput): string {
  return abas({
    rotuloNav: 'Tipo de documento',
    itens: page.tipos.map((t) => ({
      rotulo: `${t.emoji} ${t.nome}`,
      href: `/dashboard/leads/${page.leadId}/contrato-form?tipo=${encodeURIComponent(t.tipo)}`,
      ativo: t.tipo === page.def.tipo,
    })),
  });
}

function avisos(page: ContratoFormInput): string {
  // Mesmos avisos de envio/Drive da tela de busca (inclusive "cliente sem
  // telefone" e "Drive desligado", que aqui sumiam).
  let out = bannerContratos(page.docsResultado ?? '', page.envioResultado ?? '', page.driveResultado ?? '');

  const n = page.faltando.length;
  // O pagamento merece grito próprio: é a cláusula do dinheiro, e já saiu contrato
  // emitido com "____" nela (o operador tinha posto o valor nos combinados à parte).
  if (page.faltando.some((c) => c.id === 'com_forma_pagamento')) {
    const temCombinados = !!(page.valores['disposicoes_especiais'] ?? '').trim();
    out += avisoHtml('erro',
      `<strong>Forma de pagamento vazia.</strong> Do jeito que está, a cláusula de pagamento sai com uma linha em branco no contrato.` +
      (temCombinados ? ' Vi texto nos "Combinados à parte" — se o pagamento estiver lá, ele vai no campo <strong>Forma de pagamento</strong> (é ele que aparece na cláusula certa).' : ''));
  }
  const problemas = page.problemas ?? [];
  if (n > 0 || problemas.length > 0) {
    const nomes = page.faltando.map((c) => escapeHtml(c.label)).join(' · ');
    const titulo = n > 0
      ? `<strong>${n} campo(s) em branco.</strong> Completa aqui embaixo (o vermelho) e salva.`
      : '<strong>O documento ainda não pode sair.</strong>';
    const lista = problemas.length
      ? `<ul style="margin:6px 0 0 18px;list-style:disc">${problemas.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>`
      : `<div style="margin-top:4px;font-size:12.5px">${nomes}</div>`;
    out += avisoHtml('atencao',
      `${titulo} Enquanto isso, <strong>Gerar PDF, Mandar e Salvar no Drive ficam travados</strong> — a prévia mostra o que falta.${lista}`);
  } else if (page.salvo) {
    out += avisoHtml('ok', 'Salvo, e não falta nada. Pode gerar o PDF ou mandar no zap.');
  } else {
    out += avisoHtml('ok', 'Está tudo preenchido. Pode gerar.');
  }
  if (page.salvo && n > 0) {
    out += avisoHtml('info', 'Salvei o que você preencheu. Os campos acima seguem em branco — o documento só sai quando completar.');
  }
  if (page.vinculoResultado === 'ok') {
    out += avisoHtml('ok', 'Proposta vinculada. Os dados da usina e o valor agora vêm dela.');
  } else if (page.vinculoResultado === 'erro') {
    out += avisoHtml('erro', 'Não consegui vincular a proposta (ela pode já estar ligada a outro cliente). Nada mudou.');
  }
  if (page.propostaExpiradaEm) {
    out += avisoHtml('atencao',
      `<strong>proposta expirada em ${escapeHtml(diaMesBR(page.propostaExpiradaEm))} — conferir valores.</strong> Os dados da usina e o valor vieram dela; se o preço mudou, corrige aqui antes de gerar.`);
  }
  if (!page.temProposta) {
    out += avisoHtml('info', 'Esse cliente não tem proposta ligada — os dados da usina e o valor não vieram sozinhos. Preenche na mão aqui.');
    out += vincularProposta(page);
  }
  return out;
}

/** "2026-08-10T12:00:00Z" → "10/08" (calendário de Brasília). */
function diaMesBR(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
}

/**
 * Proposta salva sem telefone fica sem cliente (órfã). Mostra as da empresa com
 * nome parecido e deixa o operador ligar UMA, explicitamente — nunca automático
 * (nome repete).
 */
function vincularProposta(page: ContratoFormInput): string {
  const orfas = page.propostasOrfas ?? [];
  if (!orfas.length) return '';
  const itens = orfas.map((p) => {
    const quando = diaMesBR(p.created_at);
    const rotulo = `${p.numero_proposta ? escapeHtml(p.numero_proposta) + ' · ' : ''}${escapeHtml(p.cliente_nome ?? '(sem nome)')} · ${escapeHtml(quando)}`;
    return `<form method="POST" action="/dashboard/leads/${encodeURIComponent(page.leadId)}/contrato-vincular-proposta" class="cc-cf-orfa"
        onsubmit="return confirm('Ligar esta proposta a este cliente? Os dados da usina e o valor passam a vir dela.')">
        <input type="hidden" name="tipo" value="${escapeHtml(page.def.tipo)}" />
        <input type="hidden" name="proposta_id" value="${escapeHtml(p.id)}" />
        <span>${rotulo}</span>
        ${botao({ rotulo: 'Vincular proposta', tipo: 'submit', tamanho: 'sm' })}
      </form>`;
  }).join('');
  return cartaoSecao({
    titulo: 'Achei proposta(s) sem cliente com esse nome',
    dica: 'salvas sem telefone — se uma for deste cliente, vincula',
    corpoHtml: itens,
  });
}

function acoes(page: ContratoFormInput): string {
  const { leadId, def } = page;
  const doc = def.tipo === 'procuracao' ? 'procuracao' : 'contrato';
  const hidden = `<input type="hidden" name="next" value="form" />
      <input type="hidden" name="tipo_contrato" value="${escapeHtml(def.tipo)}" />`;
  const enviar = (destino: 'cliente' | 'eu', label: string) => {
    const conf = destino === 'cliente' ? ` onsubmit="return confirm('Enviar direto pro WhatsApp do cliente?')"` : '';
    return `<form method="POST" action="/dashboard/leads/${leadId}/enviar-doc"${conf}>
        ${hidden}
        <input type="hidden" name="tipo" value="${doc}" />
        <input type="hidden" name="destino" value="${destino}" />
        ${botao({ rotulo: label, tipo: 'submit', icone: 'send' })}
      </form>`;
  };
  return cartaoSecao({
    titulo: 'Entregar o documento',
    corpoHtml: `${avisoHtml('atencao', 'Estes botões usam o que está <strong>salvo</strong>. Se você mexeu em algum campo agora, clica em <strong>Salvar dados</strong> antes — senão o cliente recebe o documento sem a sua alteração.')}
      <div class="cc-cm-acoes">
        <a class="cc-btn" href="/dashboard/leads/${leadId}/${doc}.pdf?tipo=${encodeURIComponent(def.tipo)}" target="_blank">${icone('file', 'sm')}Gerar PDF</a>
        ${enviar('cliente', 'Mandar pro cliente')}
        ${enviar('eu', 'Mandar pro meu zap')}
        <form method="POST" action="/dashboard/leads/${leadId}/salvar-drive">
          ${hidden}
          ${botao({ rotulo: 'Salvar no Drive', tipo: 'submit', icone: 'folder' })}
        </form>
      </div>`,
  });
}

export function renderContratoFormPage(page: ContratoFormInput): string {
  const { def, valores } = page;
  const sugestoes = page.sugestoes ?? {};
  // O tenant não vê o nome da assistente da casa.
  const assistente = ehCasa(page.user) ? 'Eva' : 'assistente';

  // Os grupos vêm da ordem dos campos do próprio tipo — tipo novo com um grupo
  // novo ("A locação", "O serviço") aparece sozinho, sem mexer nesta tela.
  // A calculadora do cartão mora junto com a forma de pagamento: no contrato é o
  // grupo "O negócio"; no aditivo é "O que muda" (é lá que o 21x é escrito).
  const grupoDaCalculadora = def.tipo === 'aditivo' ? 'O que muda' : 'O negócio';
  const grupos = gruposDoContrato(def)
    .map((g) => grupo(
      g,
      def.campos.filter((c) => c.grupo === g),
      valores,
      sugestoes,
      g === grupoDaCalculadora ? calculadoraCartao(page) : '',
    ))
    .join('\n');

  // (Comentários que moravam no HTML — iam pro navegador de todo mundo:)
  // - LEITOR de conta de luz + CNH DENTRO do formulário (pedido de 15/07): sobe os
  //   documentos, a IA extrai e preenche CPF/RG/estado civil/nascimento/endereço/UC
  //   nas colunas do lead; next=form volta pra ESTA tela já preenchida. Form próprio
  //   (multipart), fora do form-contrato — assim não some com o que já foi digitado.
  // - Tudo dentro de UM formulário: os botões (IA, prévia, congelar) levam junto o
  //   que acabou de ser digitado, em vez de apagar ou ignorar.
  // - MANUAL EM 1º PLANO (15/07): contrato é receita, não pode depender da IA.
  const body = `
    ${cabecalhoPagina({
      trilha: [TRILHA_COMERCIAL, { rotulo: 'Contratos & Procurações', href: `/dashboard/contratos?q=${encodeURIComponent(page.nome)}` }, { rotulo: page.nome }],
      titulo: `${def.emoji} ${def.nome}`,
      subtitulo: `${page.nome} — ${def.descricao}`,
      acoesHtml: botao({ rotulo: '← voltar pra busca', href: `/dashboard/contratos?q=${encodeURIComponent(page.nome)}`, tom: 'fantasma' }),
    })}

    ${abasTipos(page)}
    ${page.congelou ? avisoHtml('ok', 'Contrato congelado! Agora ele é <strong>o</strong> contrato desse cliente — e dá pra fazer aditivo.') : ''}
    ${avisoAditivo(page)}
    ${avisos(page)}
    ${cartaoSecao({
      titulo: 'Ler conta de luz + CNH',
      dica: 'a IA preenche CPF, RG, estado civil, nascimento, endereço e UC',
      corpoHtml: `<form method="POST" action="/dashboard/leads/${page.leadId}/ler-documentos" enctype="multipart/form-data" class="cc-form cc-cm-acoes">
        <input type="hidden" name="next" value="form" />
        <input type="hidden" name="tipo_contrato" value="${escapeHtml(def.tipo)}" />
        <input type="file" name="docs" accept="image/*,application/pdf" multiple id="cf_docs" />
        <button type="button" class="cc-btn" onclick="var i=document.getElementById('cf_docs');i.setAttribute('capture','environment');i.setAttribute('accept','image/*');i.removeAttribute('multiple');i.click();i.removeAttribute('capture');i.setAttribute('accept','image/*,application/pdf');i.setAttribute('multiple','')">Tirar foto</button>
        ${botao({ rotulo: 'Ler e preencher', tipo: 'submit', icone: 'spark' })}
      </form>`,
    })}
    <form method="POST" action="/dashboard/leads/${page.leadId}/contrato-form" id="form-contrato" class="cc-form">
      <input type="hidden" name="tipo" value="${escapeHtml(def.tipo)}" />
      ${congelar(page)}
      ${cartaoSecao({
        titulo: 'Preencha os campos abaixo e gere o PDF',
        dica: 'o contrato sai sempre',
        corpoHtml: `<p class="cc-cm-nota" style="margin:0 0 12px">O que faltar fica em branco pra completar na mão.</p>
        <div class="cc-cm-acoes">
          <button type="submit" formaction="/dashboard/leads/${page.leadId}/contrato-ia" class="cc-btn">${icone('spark', 'sm')}IA (opcional): procurar o que falta e revisar</button>
          <span class="cc-cm-nota" style="margin:0">Sugere (não preenche sozinha) e aponta erros. Se a IA cair, o contrato gera do mesmo jeito.</span>
        </div>`,
      })}

      ${revisaoIa(page)}
      ${preview(page)}
      ${grupos}

      <div class="cc-cf-salvar">
        ${botao({ rotulo: 'Salvar dados', tipo: 'submit', tom: 'ouro', icone: 'check' })}
        <span>Os dados do cliente (CPF, RG, endereço, UC) vão pro cadastro dele — valem pra todo contrato, pra procuração e pra ${assistente}. Você não digita duas vezes.</span>
      </div>
    </form>

    ${acoes(page)}`;

  // "usar" põe a sugestão da IA no campo (só com o clique do Junior).
  // "ver como está agora" reposta o formulário pro quadro da prévia.
  const scripts = `<script>
    document.querySelectorAll('[data-usar]').forEach(function (b) {
      b.addEventListener('click', function () {
        var campo = document.getElementById('campo-' + b.dataset.usar);
        if (!campo) return;
        campo.value = b.dataset.valor;
        campo.classList.remove('cc-cf-vazio');
        campo.classList.add('cc-cf-usado');
        b.textContent = 'usado ✓';
        b.disabled = true;
        b.classList.add('cc-cf-usado-btn');
      });
    });
    var btnPreview = document.getElementById('btn-preview');
    if (btnPreview) {
      btnPreview.addEventListener('click', function () {
        var f = document.getElementById('form-contrato');
        var acaoAntiga = f.getAttribute('action');
        f.setAttribute('action', '/dashboard/leads/${page.leadId}/contrato-preview?tipo=${encodeURIComponent(def.tipo)}');
        f.setAttribute('target', 'preview-doc');
        f.submit();
        f.setAttribute('action', acaoAntiga);
        f.removeAttribute('target');
      });
    }
  </script>`;

  return renderComercial({ active: 'contratos', title: `${def.nome} — ${page.nome}`, body, scripts, user: page.user, largo: false });
}

// O documento NÃO saiu (PDF, zap ou Drive) porque está incompleto/inválido.
// Nunca um envio mudo com "___": o operador vê O QUE falta e volta pro formulário.
export interface DocBloqueadoInput {
  leadId: string;
  nome: string;
  acao: 'pdf' | 'enviar' | 'drive' | 'congelar';
  /** O tipo do formulário pra onde o link volta. */
  tipoForm: string;
  blocos: Array<{ documento: string; problemas: string[]; congeladoEm?: string | null }>;
  user?: unknown;
}

const TITULO_BLOQUEIO: Record<DocBloqueadoInput['acao'], string> = {
  pdf: 'O PDF não foi gerado',
  enviar: 'O documento não foi enviado',
  drive: 'Nada foi salvo no Drive',
  congelar: 'O contrato não foi congelado',
};

export function renderDocBloqueadoPage(page: DocBloqueadoInput): string {
  const voltar = `/dashboard/leads/${encodeURIComponent(page.leadId)}/contrato-form?tipo=${encodeURIComponent(page.tipoForm)}`;
  const titulo = TITULO_BLOQUEIO[page.acao];
  const blocos = page.blocos.map((b) => {
    const itens = b.problemas.map((p) => `<li>${escapeHtml(p)}</li>`).join('');
    const congelado = b.congeladoEm
      ? `<p class="cc-cm-nota">Este documento sai da versão <strong>congelada em ${dataHoraBR(b.congeladoEm)}</strong>. Corrija no formulário e <strong>congele de novo</strong> — é a versão congelada que é impressa.</p>`
      : '';
    return `<div class="cc-cf-bloco">
        <strong>${escapeHtml(b.documento)}</strong>
        <ul>${itens}</ul>
        ${congelado}
      </div>`;
  }).join('');
  const body = `
    ${cabecalhoPagina({
      trilha: [TRILHA_COMERCIAL, { rotulo: 'Contratos & Procurações' }, { rotulo: page.nome }],
      titulo: `${titulo} — ${page.nome}`,
    })}
    ${cartaoSecao({
      titulo: 'O que falta',
      acoesHtml: pilulaStatus('critico', 'travado'),
      corpoHtml: `<p class="cc-cm-nota" style="margin:0 0 12px">
        O documento está incompleto ou com dado inválido. Pra não chegar no cliente com espaço em branco ou dado errado,
        ${page.acao === 'drive' ? 'o documento não foi salvo no Drive' : page.acao === 'enviar' ? 'ele não foi enviado' : page.acao === 'congelar' ? 'ele não foi congelado (o congelado é o que sai no PDF daqui pra frente)' : 'o PDF não foi gerado'}.
        Corrija o que está abaixo e tente de novo:
      </p>
      ${blocos}
      ${botao({ rotulo: '← Voltar pro formulário e completar', href: voltar, tom: 'ouro' })}`,
    })}`;
  return renderComercial({ active: 'contratos', title: `${titulo} — ${page.nome}`, body, user: page.user, largo: false });
}
