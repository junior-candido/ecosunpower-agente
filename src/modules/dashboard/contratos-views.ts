// src/modules/dashboard/contratos-views.ts
// Tela dedicada de Contratos & Procurações: busca o cliente pelo nome, a IA lê
// conta+CNH, gera o PDF (sempre gera) e envia no zap. Reusa as rotas por lead_id
// (/leads/:id/contrato.pdf, /procuracao.pdf, /ler-documentos, /enviar-doc).
import { renderLayout, escapeHtml } from './views.js';

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
  const box = (cls: string, txt: string) => `<div class="mb-4 text-sm px-4 py-3 rounded-lg border ${cls}">${txt}</div>`;
  let out = '';
  const d = parseInt(docs, 10);
  if (docs && Number.isFinite(d) && d > 0) out += box('bg-emerald-50 border-emerald-300 text-emerald-800', `✅ IA preencheu ${d} campo(s) do cadastro. Agora é só gerar/enviar.`);
  else if (docs === 'erro') out += box('bg-rose-50 border-rose-300 text-rose-800', 'Não consegui ler os documentos. Preenche no cadastro — o PDF gera do mesmo jeito.');
  else if (docs === '0') out += box('bg-amber-50 border-amber-300 text-amber-800', 'Li os documentos mas não achei dado novo.');
  else if (docs === 'vazio') out += box('bg-amber-50 border-amber-300 text-amber-800', 'Anexe pelo menos um documento (conta de luz ou CNH) pra ler.');
  else if (docs === 'off') out += box('bg-amber-50 border-amber-300 text-amber-800', 'O leitor de IA não está configurado no servidor. Preenche na mão — o contrato gera do mesmo jeito.');
  if (envio === 'ok-cliente') out += box('bg-emerald-50 border-emerald-300 text-emerald-800', '✅ Enviado pro zap do cliente!');
  else if (envio === 'ok-eu') out += box('bg-emerald-50 border-emerald-300 text-emerald-800', '✅ Enviado pro seu zap!');
  else if (envio === 'erro') out += box('bg-rose-50 border-rose-300 text-rose-800', 'Não consegui enviar (cliente pode estar fora da janela de 24h). Manda pro seu zap e encaminha.');
  else if (envio === 'semzap') out += box('bg-amber-50 border-amber-300 text-amber-800', 'Esse cliente está sem telefone.');
  if (drive === 'ok') out += box('bg-emerald-50 border-emerald-300 text-emerald-800', '☁️ Contrato + procuração salvos no seu Drive/Workspace (na pasta do cliente)!');
  else if (drive === 'off') out += box('bg-amber-50 border-amber-300 text-amber-800', 'Drive/Workspace não está configurado no servidor.');
  else if (drive === 'erro') out += box('bg-rose-50 border-rose-300 text-rose-800', 'Não consegui salvar no Drive agora.');
  return out;
}

function envioBtn(leadId: string, nome: string, tipo: 'contrato' | 'procuracao', destino: 'cliente' | 'eu', label: string, cls: string, tipoCentral = ''): string {
  const conf = destino === 'cliente' ? ` onsubmit="return confirm('Enviar direto pro WhatsApp do cliente?')"` : '';
  return `<form method="POST" action="/dashboard/leads/${leadId}/enviar-doc" class="inline"${conf}>
      <input type="hidden" name="tipo" value="${tipo}" />
      <input type="hidden" name="tipo_central" value="${escapeHtml(tipoCentral)}" />
      <input type="hidden" name="destino" value="${destino}" />
      <input type="hidden" name="next" value="contratos" />
      <input type="hidden" name="nome" value="${escapeHtml(nome)}" />
      <button class="px-2.5 py-1 rounded-md text-xs ${cls}">${label}</button>
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
  return `
    <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
      <form method="get" action="/dashboard/contratos" class="flex flex-wrap gap-3 items-end">
        ${q ? `<input type="hidden" name="q" value="${escapeHtml(q)}" />` : ''}
        <div class="flex-1 min-w-[220px]">
          <label class="block text-xs font-semibold text-slate-500 mb-1">Cliente</label>
          <select name="lead" onchange="this.form.submit()" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">— escolher cliente —</option>
            ${opts}
          </select>
        </div>
        <div class="min-w-[190px]">
          <label class="block text-xs font-semibold text-slate-500 mb-1">Tipo de contrato</label>
          <select name="tipo" onchange="this.form.submit()" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
            ${tipoOpts}
          </select>
        </div>
      </form>
      <form method="get" action="/dashboard/contratos" class="flex gap-2 items-center mt-3 pt-3 border-t border-slate-100">
        <input type="hidden" name="tipo" value="${escapeHtml(tipoSel)}" />
        <input name="q" value="${escapeHtml(q)}" placeholder="🔎 não achou na lista? busca por nome ou telefone..."
          class="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
        <button class="px-3 py-1.5 rounded-lg text-sm bg-slate-900 text-white hover:bg-slate-800">Buscar</button>
      </form>
      ${q ? `<div class="text-xs text-slate-500 mt-2">${opcoes.length} resultado(s) pra "<strong>${escapeHtml(q)}</strong>" — escolhe na lista acima.</div>` : ''}
    </div>`;
}

/** BARRA DE AÇÕES do cliente escolhido — ler conta+CNH, abrir formulário, gerar,
 *  enviar, Drive, tudo DIRETO (não precisa abrir o formulário antes). */
function barraAcoes(sel: ContratoCliente, tipoSel: string, tipos: TipoContratoItem[]): string {
  const id = sel.leadId;
  const t = tipos.find((x) => x.tipo === tipoSel) ?? tipos[0];
  const tipoNome = t ? t.nome : 'Contrato';
  const doc: 'contrato' | 'procuracao' = tipoSel === 'procuracao' ? 'procuracao' : 'contrato';
  return `
    <div class="bg-white rounded-xl border-2 border-indigo-200 shadow-sm p-4 mb-5">
      <div class="flex items-center justify-between mb-3">
        <div>
          <div class="font-bold text-slate-900">${escapeHtml(sel.nome)}</div>
          <div class="text-xs text-slate-500">${escapeHtml(tipoNome)}${sel.status ? ` · ${escapeHtml(sel.status)}` : ''}</div>
        </div>
      </div>
      <div class="flex flex-wrap gap-2 items-center">
        <a href="/dashboard/leads/${id}/contrato-form?tipo=${encodeURIComponent(tipoSel)}"
          class="px-3 py-2 rounded-lg text-sm bg-slate-900 text-white font-semibold hover:bg-slate-800">📝 Abrir formulário</a>
        <form method="POST" action="/dashboard/leads/${id}/ler-documentos" enctype="multipart/form-data" class="flex items-center gap-2">
          <input type="hidden" name="next" value="contratos" />
          <input type="hidden" name="tipo_central" value="${escapeHtml(tipoSel)}" />
          <input type="file" name="docs" accept="image/*,application/pdf" multiple
            class="text-xs text-slate-600 file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-violet-100 file:text-violet-800 file:cursor-pointer" />
          <button class="px-3 py-2 rounded-lg text-sm bg-violet-600 text-white hover:bg-violet-700">🤖 Ler conta+CNH</button>
        </form>
        <a href="/dashboard/leads/${id}/${doc}.pdf?tipo=${encodeURIComponent(tipoSel)}" target="_blank"
          class="px-3 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700">📄 Gerar PDF</a>
        ${envioBtn(id, sel.nome, doc, 'cliente', '📤 Enviar → cliente', 'bg-emerald-600 text-white hover:bg-emerald-700', tipoSel)}
        ${envioBtn(id, sel.nome, doc, 'eu', '→ meu zap', 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200', tipoSel)}
        <form method="POST" action="/dashboard/leads/${id}/salvar-drive" class="inline">
          <input type="hidden" name="next" value="contratos" />
          <input type="hidden" name="tipo_central" value="${escapeHtml(tipoSel)}" />
          <input type="hidden" name="nome" value="${escapeHtml(sel.nome)}" />
          <button class="px-3 py-2 rounded-lg text-sm bg-sky-600 text-white hover:bg-sky-700">☁️ Salvar no Drive</button>
        </form>
      </div>
      <div class="text-xs text-slate-400 mt-2">As ações usam o que está <strong>salvo</strong>. Mexeu num campo? Abre o formulário e salva antes de enviar.</div>
    </div>`;
}

/** Card de acesso rápido dos 2 contratos mais recentes JÁ FECHADOS (não leads):
 *  o resto fica no dropdown. Um clique abre a barra de ações / o formulário. */
function cardRecente(c: ContratoCliente, tipoDefault: string): string {
  const id = c.leadId;
  // caminho do PDF segue o tipo (procuracao.pdf vs contrato.pdf), pra não gerar
  // "contrato.pdf?tipo=procuracao" (caminho e tipo divergentes).
  const doc = tipoDefault === 'procuracao' ? 'procuracao' : 'contrato';
  return `
    <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex flex-wrap items-center gap-2 mb-2">
      <div class="flex-1 min-w-[150px]">
        <div class="font-semibold text-slate-900 text-sm">${escapeHtml(c.nome)}</div>
        <div class="text-xs text-slate-500">${c.status ? escapeHtml(c.status) : ''}</div>
      </div>
      <a href="/dashboard/contratos?lead=${encodeURIComponent(id)}" class="px-2.5 py-1.5 rounded-lg text-xs bg-slate-100 text-slate-700 hover:bg-slate-200">⚙️ ações</a>
      <a href="/dashboard/leads/${id}/contrato-form?tipo=${encodeURIComponent(tipoDefault)}" class="px-2.5 py-1.5 rounded-lg text-xs bg-slate-900 text-white hover:bg-slate-800">📝 Abrir</a>
      <a href="/dashboard/leads/${id}/${doc}.pdf?tipo=${encodeURIComponent(tipoDefault)}" target="_blank" class="px-2.5 py-1.5 rounded-lg text-xs bg-indigo-600 text-white hover:bg-indigo-700">📄 Gerar</a>
    </div>`;
}

/** Bloco "criar do zero": cliente novo/fora do sistema → cria o cadastro e cai
 *  DIRETO no formulário pra preencher na mão. Não depende de proposta nem de IA —
 *  é o caminho manual garantido (contrato é receita: não pode travar). */
function blocoCriarManual(): string {
  return `
    <div class="mb-6 rounded-xl border-2 border-emerald-200 bg-emerald-50/60 p-4">
      <div class="font-semibold text-slate-800">➕ Criar contrato manual</div>
      <div class="text-xs text-slate-500 mb-3">Cliente novo ou fora do sistema? Cria aqui e cai direto no formulário pra preencher na mão — não precisa de proposta nem de IA.</div>
      <form method="post" action="/dashboard/contratos/novo" class="flex flex-wrap gap-2 items-end">
        <div class="flex-1 min-w-[160px]">
          <label class="block text-xs text-slate-500 mb-1">Nome do cliente</label>
          <input name="name" required placeholder="Nome completo"
            class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div class="min-w-[150px]">
          <label class="block text-xs text-slate-500 mb-1">WhatsApp</label>
          <input name="phone" required placeholder="5561999999999"
            class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <button class="bg-emerald-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-emerald-700 text-sm">Criar e preencher →</button>
      </form>
    </div>`;
}

export function renderContratosPage(input: ContratosPageInput): string {
  const { q, buscou, resultados, recentes = [], selecionado = null, tipoSel, tipos, docsResultado = '', envioResultado = '', driveResultado = '', novoResultado = '', user } = input;
  const tipoAtual = tipoSel || (tipos[0]?.tipo ?? 'fv');

  const avisoNovo = novoResultado === 'faltou'
    ? `<div class="mb-4 text-sm px-4 py-3 rounded-lg border bg-amber-50 border-amber-300 text-amber-800">Pra criar o contrato manual, preencha o <strong>nome</strong> e o <strong>telefone</strong> do cliente.</div>`
    : novoResultado === 'erro'
    ? `<div class="mb-4 text-sm px-4 py-3 rounded-lg border bg-rose-50 border-rose-300 text-rose-800">Não consegui criar o cliente agora. Confere o telefone (só números) e tenta de novo.</div>`
    : '';

  // Dropdown: resultado da busca (se buscou) senão os fechados recentes.
  const opcoes = buscou ? resultados : recentes;
  // Os 2 contratos JÁ FECHADOS mais recentes viram card de acesso rápido (o resto
  // fica no dropdown). Só quando não tem cliente escolhido nem busca ativa.
  const doisUltimos = recentes.slice(0, 2);
  const semResultado = buscou && opcoes.length === 0;

  const body = `
  <div class="max-w-3xl mx-auto">
    <div class="mb-5">
      <h1 class="text-2xl font-bold text-slate-900">📄 Central de Contratos</h1>
      <p class="text-slate-500 mt-1">Escolhe o cliente na lista, o tipo, e usa as ações (ler conta+CNH, gerar, enviar, Drive) — direto, sem abrir nada antes. A IA ajuda, mas o preenchimento é seu: <strong>sempre gera</strong>.</p>
    </div>
    ${bannerContratos(docsResultado, envioResultado, driveResultado)}
    ${avisoNovo}
    ${barraSelecao(opcoes, selecionado, q, tipos, tipoAtual)}
    ${selecionado ? barraAcoes(selecionado, tipoAtual, tipos) : ''}
    ${semResultado ? `<div class="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-amber-800 mb-4">Nenhum cliente com "<strong>${escapeHtml(q)}</strong>". Tenta outro trecho, o telefone, ou cria manual abaixo.</div>` : ''}
    ${blocoCriarManual()}
    ${(!selecionado && !buscou && doisUltimos.length > 0)
      ? `<div class="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">Últimos contratos fechados</div>${doisUltimos.map((c) => cardRecente(c, tipoAtual)).join('')}`
      : ''}
  </div>`;

  return renderLayout({ active: 'contratos', title: 'Contratos & Procurações', body, user });
}
