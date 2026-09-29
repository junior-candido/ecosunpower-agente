// src/modules/dashboard/contratos-views.ts
// Tela dedicada de Contratos & Procurações: busca o cliente pelo nome, a IA lê
// conta+CNH, gera o PDF (sempre gera) e envia no zap. Reusa as rotas por lead_id
// (/leads/:id/contrato.pdf, /procuracao.pdf, /ler-documentos, /enviar-doc).
//
// Renovação do miolo — R21 (28/09/2026): mesmos formulários (GET de cliente/
// tipo/busca, ler-documentos multipart, enviar-doc com o confirm, salvar-drive,
// contratos/novo), mesmos names, ids e links; visual no padrão cc- do Command
// Center (tema escuro, sem Tailwind). A trava de saída do contrato (#317) é do
// servidor e não muda.
import { escapeHtml } from './views.js';
import { cabecalhoPagina, cartaoSecao, botao, celulaDupla, estadoVazio, pilulaStatus } from './ui/componentes.js';
import { renderComercial, avisoHtml, TRILHA_COMERCIAL } from './comercial-casca.js';

export interface ContratoCliente {
  leadId: string;
  nome: string;
  status: string | null;
}

export interface TipoContratoItem {
  tipo: string;
  nome: string;
  emoji: string;
  descricao: string;
}

export interface ContratosPageInput {
  q: string;
  buscou: boolean;
  resultados: ContratoCliente[];
  /** Clientes recentes (fecharam / viraram cliente): populam o dropdown e os 2
   *  cards de acesso rápido. */
  recentes?: ContratoCliente[];
  /** Cliente escolhido no dropdown (?lead=) — mostra a barra de ações dele. */
  selecionado?: ContratoCliente | null;
  /** Tipo de contrato escolhido (?tipo=). */
  tipoSel?: string;
  /** Os tipos de contrato registrados na central (vêm do contratos-registry). */
  tipos: TipoContratoItem[];
  docsResultado?: string;
  envioResultado?: string;
  driveResultado?: string;
  /** Resultado do "criar contrato manual" (faltou/erro) — pra não falhar calado. */
  novoResultado?: string;
  user?: any;
}

/** Avisos de "li os documentos / enviei no zap / salvei no Drive". A tela do
 *  formulário reusa os mesmos — senão um caso (ex.: cliente sem telefone) some
 *  numa tela e aparece na outra. */
export function bannerContratos(docs: string, envio: string, drive: string): string {
  let out = '';
  const d = parseInt(docs, 10);
  if (docs && Number.isFinite(d) && d > 0) out += avisoHtml('ok', `IA preencheu ${d} campo(s) do cadastro. Agora é só gerar/enviar.`);
  else if (docs === 'erro') out += avisoHtml('erro', 'Não consegui ler os documentos. Preenche no cadastro — o PDF gera do mesmo jeito.');
  else if (docs === '0') out += avisoHtml('atencao', 'Li os documentos mas não achei dado novo.');
  else if (docs === 'vazio') out += avisoHtml('atencao', 'Anexe pelo menos um documento (conta de luz ou CNH) pra ler.');
  else if (docs === 'off') out += avisoHtml('atencao', 'O leitor de IA não está configurado no servidor. Preenche na mão — o contrato gera do mesmo jeito.');
  if (envio === 'ok-cliente') out += avisoHtml('ok', 'Enviado pro zap do cliente!');
  else if (envio === 'ok-eu') out += avisoHtml('ok', 'Enviado pro seu zap!');
  else if (envio === 'erro') out += avisoHtml('erro', 'Não consegui enviar (cliente pode estar fora da janela de 24h). Manda pro seu zap e encaminha.');
  else if (envio === 'semzap') out += avisoHtml('atencao', 'Esse cliente está sem telefone.');
  if (drive === 'ok') out += avisoHtml('ok', 'Contrato + procuração salvos no seu Drive/Workspace (na pasta do cliente)!');
  else if (drive === 'off') out += avisoHtml('atencao', 'Drive/Workspace não está configurado no servidor.');
  else if (drive === 'erro') out += avisoHtml('erro', 'Não consegui salvar no Drive agora.');
  return out;
}

/** Situação do cliente (installation_status/status) em pílula — o texto é o de sempre. */
function pilulaSituacao(status: string | null): string {
  if (!status) return '';
  const tom = /instalad|operac|monitor/i.test(status) ? 'normal' : /assinad|contrat|ganho|fech/i.test(status) ? 'oportunidade' : 'info';
  return pilulaStatus(tom, status);
}

function envioBtn(leadId: string, nome: string, tipo: 'contrato' | 'procuracao', destino: 'cliente' | 'eu', label: string, tipoCentral = ''): string {
  const conf = destino === 'cliente' ? ` onsubmit="return confirm('Enviar direto pro WhatsApp do cliente?')"` : '';
  return `<form method="POST" action="/dashboard/leads/${leadId}/enviar-doc"${conf}>
      <input type="hidden" name="tipo" value="${tipo}" />
      <input type="hidden" name="tipo_central" value="${escapeHtml(tipoCentral)}" />
      <input type="hidden" name="destino" value="${destino}" />
      <input type="hidden" name="next" value="contratos" />
      <input type="hidden" name="nome" value="${escapeHtml(nome)}" />
      ${botao({ rotulo: label, tipo: 'submit', icone: 'send' })}
    </form>`;
}

/** BARRA DE CIMA: escolhe o cliente numa lista suspensa + o tipo. Escala pra
 *  centenas de contratos (é só rolar a lista / buscar), em vez de um card gordo
 *  por cliente. Escolher recarrega com ?lead=<id> e mostra a barra de ações. */
function barraSelecao(opcoes: ContratoCliente[], selecionado: ContratoCliente | null, q: string, tipos: TipoContratoItem[], tipoSel: string): string {
  const opts = opcoes.map((c) =>
    `<option value="${escapeHtml(c.leadId)}" ${selecionado && c.leadId === selecionado.leadId ? 'selected' : ''}>${escapeHtml(c.nome)}${c.status ? ` · ${escapeHtml(c.status)}` : ''}</option>`,
  ).join('');
  const tipoOpts = tipos.map((t) =>
    `<option value="${escapeHtml(t.tipo)}" ${t.tipo === tipoSel ? 'selected' : ''}>${t.emoji} ${escapeHtml(t.nome)}</option>`,
  ).join('');
  return cartaoSecao({
    titulo: 'Escolher o cliente',
    dica: 'a lista traz os contratos já fechados',
    corpoHtml: `
      <form method="get" action="/dashboard/contratos" class="cc-form cc-cm-linha">
        ${q ? `<input type="hidden" name="q" value="${escapeHtml(q)}" />` : ''}
        <label class="cc-campo"><span>Cliente</span>
          <select name="lead" onchange="this.form.submit()">
            <option value="">— escolher cliente —</option>
            ${opts}
          </select>
        </label>
        <label class="cc-campo cc-campo-estreito"><span>Tipo de contrato</span>
          <select name="tipo" onchange="this.form.submit()">
            ${tipoOpts}
          </select>
        </label>
      </form>
      <form method="get" action="/dashboard/contratos" class="cc-form cc-cm-linha cc-cm-sep">
        <input type="hidden" name="tipo" value="${escapeHtml(tipoSel)}" />
        <label class="cc-campo"><span>Não achou na lista?</span>
          <input name="q" value="${escapeHtml(q)}" placeholder="Busca por nome ou telefone..." />
        </label>
        ${botao({ rotulo: 'Buscar', tipo: 'submit', icone: 'search' })}
      </form>
      ${q ? `<p class="cc-cm-nota">${opcoes.length} resultado(s) pra "<strong>${escapeHtml(q)}</strong>" — escolhe na lista acima.</p>` : ''}`,
  });
}

/** BARRA DE AÇÕES do cliente escolhido — ler conta+CNH, abrir formulário, gerar,
 *  enviar, Drive, tudo DIRETO (não precisa abrir o formulário antes). */
function barraAcoes(sel: ContratoCliente, tipoSel: string, tipos: TipoContratoItem[]): string {
  const id = sel.leadId;
  const t = tipos.find((x) => x.tipo === tipoSel) ?? tipos[0];
  const tipoNome = t ? t.nome : 'Contrato';
  const doc: 'contrato' | 'procuracao' = tipoSel === 'procuracao' ? 'procuracao' : 'contrato';
  return `<section class="cc-panel cc-cm-sel">
      <div class="cc-ph"><div class="cc-cm-quem">${escapeHtml(sel.nome)}<small>${escapeHtml(tipoNome)}${sel.status ? ` · ${escapeHtml(sel.status)}` : ''}</small></div><span class="cc-sp"></span>${pilulaSituacao(sel.status)}</div>
      <div class="cc-cm-acoes">
        ${botao({ rotulo: 'Abrir formulário', href: `/dashboard/leads/${id}/contrato-form?tipo=${encodeURIComponent(tipoSel)}`, tom: 'ouro', icone: 'file' })}
        <a class="cc-btn" href="/dashboard/leads/${id}/${doc}.pdf?tipo=${encodeURIComponent(tipoSel)}" target="_blank">${'Gerar PDF'}</a>
        ${envioBtn(id, sel.nome, doc, 'cliente', 'Enviar → cliente', tipoSel)}
        ${envioBtn(id, sel.nome, doc, 'eu', '→ meu zap', tipoSel)}
        <form method="POST" action="/dashboard/leads/${id}/salvar-drive">
          <input type="hidden" name="next" value="contratos" />
          <input type="hidden" name="tipo_central" value="${escapeHtml(tipoSel)}" />
          <input type="hidden" name="nome" value="${escapeHtml(sel.nome)}" />
          ${botao({ rotulo: 'Salvar no Drive', tipo: 'submit', icone: 'folder' })}
        </form>
      </div>
      <form method="POST" action="/dashboard/leads/${id}/ler-documentos" enctype="multipart/form-data" class="cc-form cc-cm-acoes cc-cm-sep">
        <input type="hidden" name="next" value="contratos" />
        <input type="hidden" name="tipo_central" value="${escapeHtml(tipoSel)}" />
        <input type="file" name="docs" accept="image/*,application/pdf" multiple id="cc_docs" />
        <button type="button" class="cc-btn" onclick="var i=document.getElementById('cc_docs');i.setAttribute('capture','environment');i.setAttribute('accept','image/*');i.removeAttribute('multiple');i.click();i.removeAttribute('capture');i.setAttribute('accept','image/*,application/pdf');i.setAttribute('multiple','')">Tirar foto</button>
        ${botao({ rotulo: 'Ler conta+CNH', tipo: 'submit', icone: 'spark' })}
      </form>
      <p class="cc-cm-nota">As ações usam o que está <strong>salvo</strong>. Mexeu num campo? Abre o formulário e salva antes de enviar.</p>
    </section>`;
}

/** Card de acesso rápido dos 2 contratos mais recentes JÁ FECHADOS (não leads):
 *  o resto fica no dropdown. Um clique abre a barra de ações / o formulário. */
function cardRecente(c: ContratoCliente, tipoDefault: string): string {
  const id = c.leadId;
  // caminho do PDF segue o tipo (procuracao.pdf vs contrato.pdf), pra não gerar
  // "contrato.pdf?tipo=procuracao" (caminho e tipo divergentes).
  const doc = tipoDefault === 'procuracao' ? 'procuracao' : 'contrato';
  return `<div class="cc-cm-cartao">
      ${celulaDupla(c.nome, c.status)}
      <div class="cc-cm-acoes">
        ${botao({ rotulo: 'ações', href: `/dashboard/contratos?lead=${encodeURIComponent(id)}`, tamanho: 'sm', icone: 'cog' })}
        ${botao({ rotulo: 'Abrir', href: `/dashboard/leads/${id}/contrato-form?tipo=${encodeURIComponent(tipoDefault)}`, tamanho: 'sm', icone: 'file' })}
        <a class="cc-btn cc-btn-sm" href="/dashboard/leads/${id}/${doc}.pdf?tipo=${encodeURIComponent(tipoDefault)}" target="_blank">Gerar</a>
      </div>
    </div>`;
}

/** Bloco "criar do zero": cliente novo/fora do sistema → cria o cadastro e cai
 *  DIRETO no formulário pra preencher na mão. Não depende de proposta nem de IA —
 *  é o caminho manual garantido (contrato é receita: não pode travar). */
function blocoCriarManual(principal: boolean): string {
  return cartaoSecao({
    titulo: 'Criar contrato manual',
    dica: 'cliente novo ou fora do sistema',
    corpoHtml: `<p class="cc-cm-nota" style="margin:0 0 12px">Cria aqui e cai direto no formulário pra preencher na mão — não precisa de proposta nem de IA.</p>
      <form method="post" action="/dashboard/contratos/novo" class="cc-form cc-cm-linha">
        <label class="cc-campo"><span>Nome do cliente</span>
          <input name="name" required placeholder="Nome completo" />
        </label>
        <label class="cc-campo cc-campo-estreito"><span>WhatsApp</span>
          <input name="phone" required placeholder="5561999999999" inputmode="numeric" />
        </label>
        ${botao({ rotulo: 'Criar e preencher →', tipo: 'submit', tom: principal ? 'ouro' : 'normal', icone: 'plus' })}
      </form>`,
  });
}

export function renderContratosPage(input: ContratosPageInput): string {
  const { q, buscou, resultados, recentes = [], selecionado = null, tipoSel, tipos, docsResultado = '', envioResultado = '', driveResultado = '', novoResultado = '', user } = input;
  const tipoAtual = tipoSel || (tipos[0]?.tipo ?? 'fv');

  const avisoNovo = novoResultado === 'faltou'
    ? avisoHtml('atencao', 'Pra criar o contrato manual, preencha o <strong>nome</strong> e o <strong>telefone</strong> do cliente.')
    : novoResultado === 'erro'
    ? avisoHtml('erro', 'Não consegui criar o cliente agora. Confere o telefone (só números) e tenta de novo.')
    : '';

  // Dropdown: resultado da busca (se buscou) senão os fechados recentes.
  const opcoes = buscou ? resultados : recentes;
  // Os 2 contratos JÁ FECHADOS mais recentes viram card de acesso rápido (o resto
  // fica no dropdown). Só quando não tem cliente escolhido nem busca ativa.
  const doisUltimos = recentes.slice(0, 2);
  const semResultado = buscou && opcoes.length === 0;

  const recentesHtml = (!selecionado && !buscou && doisUltimos.length > 0)
    ? `<div class="cc-cm-rot">Últimos contratos fechados</div>${doisUltimos.map((c) => cardRecente(c, tipoAtual)).join('')}`
    : (!selecionado && !buscou && recentes.length === 0)
      ? estadoVazio({ tipo: 'vazio', compacto: true, titulo: 'Nenhum contrato fechado ainda', texto: 'Quando uma venda for registrada, o cliente aparece aqui e na lista.' })
      : '';

  const body = `
    ${cabecalhoPagina({
      trilha: [TRILHA_COMERCIAL, { rotulo: 'Contratos & Procurações' }],
      titulo: 'Central de Contratos',
      subtitulo: 'Escolhe o cliente na lista, o tipo, e usa as ações (ler conta+CNH, gerar, enviar, Drive) — direto, sem abrir nada antes. A IA ajuda, mas o preenchimento é seu: sempre gera.',
    })}
    ${bannerContratos(docsResultado, envioResultado, driveResultado)}
    ${avisoNovo}
    ${barraSelecao(opcoes, selecionado, q, tipos, tipoAtual)}
    ${selecionado ? barraAcoes(selecionado, tipoAtual, tipos) : ''}
    ${semResultado ? avisoHtml('atencao', `Nenhum cliente com "<strong>${escapeHtml(q)}</strong>". Tenta outro trecho, o telefone, ou cria manual abaixo.`) : ''}
    ${blocoCriarManual(!selecionado)}
    ${recentesHtml}`;

  return renderComercial({ active: 'contratos', title: 'Contratos & Procurações', body, user, largo: false });
}
