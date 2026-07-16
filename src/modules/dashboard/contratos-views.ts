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
  /** Clientes recentes (fecharam / viraram cliente) — a lista que abre por padrão,
   *  pra NÃO ser só uma caixa de busca cega. */
  recentes?: ContratoCliente[];
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
  if (envio === 'ok-cliente') out += box('bg-emerald-50 border-emerald-300 text-emerald-800', '✅ Enviado pro zap do cliente!');
  else if (envio === 'ok-eu') out += box('bg-emerald-50 border-emerald-300 text-emerald-800', '✅ Enviado pro seu zap!');
  else if (envio === 'erro') out += box('bg-rose-50 border-rose-300 text-rose-800', 'Não consegui enviar (cliente pode estar fora da janela de 24h). Manda pro seu zap e encaminha.');
  else if (envio === 'semzap') out += box('bg-amber-50 border-amber-300 text-amber-800', 'Esse cliente está sem telefone.');
  if (drive === 'ok') out += box('bg-emerald-50 border-emerald-300 text-emerald-800', '☁️ Contrato + procuração salvos no seu Drive/Workspace (na pasta do cliente)!');
  else if (drive === 'off') out += box('bg-amber-50 border-amber-300 text-amber-800', 'Drive/Workspace não está configurado no servidor.');
  else if (drive === 'erro') out += box('bg-rose-50 border-rose-300 text-rose-800', 'Não consegui salvar no Drive agora.');
  return out;
}

function envioBtn(leadId: string, nome: string, tipo: 'contrato' | 'procuracao', destino: 'cliente' | 'eu', label: string, cls: string): string {
  const conf = destino === 'cliente' ? ` onsubmit="return confirm('Enviar direto pro WhatsApp do cliente?')"` : '';
  return `<form method="POST" action="/dashboard/leads/${leadId}/enviar-doc" class="inline"${conf}>
      <input type="hidden" name="tipo" value="${tipo}" />
      <input type="hidden" name="destino" value="${destino}" />
      <input type="hidden" name="next" value="contratos" />
      <input type="hidden" name="nome" value="${escapeHtml(nome)}" />
      <button class="px-2.5 py-1 rounded-md text-xs ${cls}">${label}</button>
    </form>`;
}

// Cada tipo da central vira uma linha: abre o formulário DAQUELE contrato, com
// os campos já preenchidos e os brancos destacados. É o caminho principal —
// os botões de gerar/enviar direto continuam logo abaixo, como atalho.
function linhaTipo(leadId: string, t: TipoContratoItem): string {
  return `<a href="/dashboard/leads/${leadId}/contrato-form?tipo=${encodeURIComponent(t.tipo)}"
      class="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 hover:border-amber-400 hover:bg-amber-50 transition">
      <span class="text-xl">${t.emoji}</span>
      <span class="min-w-0">
        <span class="block text-sm font-semibold text-slate-900">${escapeHtml(t.nome)}</span>
        <span class="block text-xs text-slate-500">${escapeHtml(t.descricao)}</span>
      </span>
      <span class="ml-auto text-xs font-semibold text-amber-700 whitespace-nowrap">📝 conferir e gerar →</span>
    </a>`;
}

function cardCliente(c: ContratoCliente, tipos: TipoContratoItem[]): string {
  const id = c.leadId;
  return `<div class="rounded-xl border border-slate-200 bg-white px-4 py-4 mb-3 shadow-sm">
    <div class="flex items-center justify-between mb-3">
      <div class="font-semibold text-slate-900">${escapeHtml(c.nome)}</div>
      <span class="text-xs text-slate-500">${escapeHtml(c.status ?? '')}</span>
    </div>

    <div class="mb-4">
      <div class="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">Qual contrato?</div>
      <div class="grid gap-2">${tipos.map((t) => linhaTipo(id, t)).join('\n')}</div>
    </div>

    <div class="flex flex-wrap gap-2 items-center mb-2">
      <span class="text-xs uppercase tracking-wider text-slate-500 font-semibold mr-1">🤖 IA lê:</span>
      <form method="POST" action="/dashboard/leads/${id}/ler-documentos" enctype="multipart/form-data" class="flex flex-wrap gap-2 items-center">
        <input type="hidden" name="next" value="contratos" />
        <input type="hidden" name="nome" value="${escapeHtml(c.nome)}" />
        <input type="file" name="docs" accept="image/*,application/pdf" multiple
          class="text-xs text-slate-600 file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-violet-100 file:text-violet-800 file:cursor-pointer" />
        <button class="px-3 py-1.5 rounded-lg text-sm bg-violet-600 text-white hover:bg-violet-700">Ler conta + CNH</button>
      </form>
    </div>

    <div class="flex flex-wrap gap-2 items-center mb-2">
      <span class="text-xs uppercase tracking-wider text-slate-500 font-semibold mr-1">⚡ Gerar direto:</span>
      <a href="/dashboard/leads/${id}/contrato.pdf" target="_blank" class="px-3 py-1.5 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700">📄 Contrato</a>
      <a href="/dashboard/leads/${id}/procuracao.pdf" target="_blank" class="px-3 py-1.5 rounded-lg text-sm bg-indigo-100 text-indigo-800 hover:bg-indigo-200">🖊️ Procuração</a>
    </div>

    <div class="flex flex-wrap gap-2 items-center">
      <span class="text-xs uppercase tracking-wider text-slate-500 font-semibold mr-1">📤 Enviar:</span>
      ${envioBtn(id, c.nome, 'contrato', 'cliente', 'Contrato → cliente', 'bg-emerald-600 text-white hover:bg-emerald-700')}
      ${envioBtn(id, c.nome, 'contrato', 'eu', 'Contrato → meu zap', 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200')}
      ${envioBtn(id, c.nome, 'procuracao', 'cliente', 'Procuração → cliente', 'bg-emerald-600 text-white hover:bg-emerald-700')}
      ${envioBtn(id, c.nome, 'procuracao', 'eu', 'Procuração → meu zap', 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200')}
    </div>

    <div class="flex flex-wrap gap-2 items-center mt-2">
      <span class="text-xs uppercase tracking-wider text-slate-500 font-semibold mr-1">☁️ Workspace:</span>
      <form method="POST" action="/dashboard/leads/${id}/salvar-drive" class="inline">
        <input type="hidden" name="next" value="contratos" />
        <input type="hidden" name="nome" value="${escapeHtml(c.nome)}" />
        <button class="px-3 py-1.5 rounded-lg text-sm bg-sky-600 text-white hover:bg-sky-700">☁️ Salvar no Drive</button>
      </form>
    </div>
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
  const { q, buscou, resultados, recentes = [], tipos, docsResultado = '', envioResultado = '', driveResultado = '', novoResultado = '', user } = input;

  const avisoNovo = novoResultado === 'faltou'
    ? `<div class="mb-4 text-sm px-4 py-3 rounded-lg border bg-amber-50 border-amber-300 text-amber-800">Pra criar o contrato manual, preencha o <strong>nome</strong> e o <strong>telefone</strong> do cliente.</div>`
    : novoResultado === 'erro'
    ? `<div class="mb-4 text-sm px-4 py-3 rounded-lg border bg-rose-50 border-rose-300 text-rose-800">Não consegui criar o cliente agora. Confere o telefone (só números) e tenta de novo.</div>`
    : '';

  const busca = `
    <form method="get" action="/dashboard/contratos" class="flex flex-wrap gap-2 items-end mb-6">
      <div class="flex-1 min-w-[220px]">
        <label class="block text-sm text-slate-600 mb-1">Buscar por nome ou telefone</label>
        <input name="q" value="${escapeHtml(q)}" placeholder="Nome ou telefone do cliente..."
          class="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-400 outline-none" />
      </div>
      <button class="bg-slate-900 text-white px-5 py-2 rounded-lg font-semibold hover:bg-slate-800">🔎 Buscar</button>
    </form>`;

  let lista = '';
  if (buscou) {
    // com busca: mostra o resultado do filtro
    lista = resultados.length > 0
      ? resultados.map((c) => cardCliente(c, tipos)).join('\n')
      : `<div class="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-amber-800">Nenhum cliente com "<strong>${escapeHtml(q)}</strong>". Tenta outro trecho do nome, o telefone, ou crie manual acima.</div>`;
  } else {
    // sem busca: abre com a LISTA de clientes recentes (não é caixa cega)
    lista = recentes.length > 0
      ? `<div class="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">Clientes recentes</div>${recentes.map((c) => cardCliente(c, tipos)).join('\n')}`
      : `<div class="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-slate-500 text-sm">Ainda não há clientes recentes. Busque acima ou crie um contrato manual.</div>`;
  }

  const body = `
  <div class="max-w-3xl mx-auto">
    <div class="mb-5">
      <h1 class="text-2xl font-bold text-slate-900">📄 Central de Contratos</h1>
      <p class="text-slate-500 mt-1">Escolhe o cliente, o tipo de contrato, confere os campos e gera o PDF — pra baixar, mandar no zap ou salvar no Drive. A IA <strong>ajuda</strong> lendo a conta de luz e a CNH, mas o preenchimento é seu: <strong>sempre gera</strong>, o que faltar sai em branco.</p>
    </div>
    ${bannerContratos(docsResultado, envioResultado, driveResultado)}
    ${avisoNovo}
    ${blocoCriarManual()}
    ${busca}
    ${lista}
  </div>`;

  return renderLayout({ active: 'contratos', title: 'Contratos & Procurações', body, user });
}
