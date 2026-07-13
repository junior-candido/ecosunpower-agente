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

export interface ContratosPageInput {
  q: string;
  buscou: boolean;
  resultados: ContratoCliente[];
  docsResultado?: string;
  envioResultado?: string;
  driveResultado?: string;
  user?: any;
}

function banner(docs: string, envio: string, drive: string): string {
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

function cardCliente(c: ContratoCliente): string {
  const id = c.leadId;
  return `<div class="rounded-xl border border-slate-200 bg-white px-4 py-4 mb-3 shadow-sm">
    <div class="flex items-center justify-between mb-3">
      <div class="font-semibold text-slate-900">${escapeHtml(c.nome)}</div>
      <span class="text-xs text-slate-500">${escapeHtml(c.status ?? '')}</span>
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
      <span class="text-xs uppercase tracking-wider text-slate-500 font-semibold mr-1">📄 Gerar:</span>
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

export function renderContratosPage(input: ContratosPageInput): string {
  const { q, buscou, resultados, docsResultado = '', envioResultado = '', driveResultado = '', user } = input;

  const busca = `
    <form method="get" action="/dashboard/contratos" class="flex flex-wrap gap-2 items-end mb-6">
      <div class="flex-1 min-w-[220px]">
        <label class="block text-sm text-slate-600 mb-1">Nome do cliente</label>
        <input name="q" value="${escapeHtml(q)}" autofocus placeholder="Digite o nome e busque..."
          class="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-400 outline-none" />
      </div>
      <button class="bg-slate-900 text-white px-5 py-2 rounded-lg font-semibold hover:bg-slate-800">🔎 Buscar</button>
    </form>`;

  let lista = '';
  if (buscou && resultados.length === 0) {
    lista = `<div class="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-amber-800">Nenhum cliente com "<strong>${escapeHtml(q)}</strong>".</div>`;
  } else if (resultados.length > 0) {
    lista = resultados.map(cardCliente).join('\n');
  }

  const body = `
  <div class="max-w-3xl mx-auto">
    <div class="mb-5">
      <h1 class="text-2xl font-bold text-slate-900">📄 Contratos & Procurações</h1>
      <p class="text-slate-500 mt-1">Busca o cliente, a IA lê conta de luz + CNH, gera o PDF na hora e envia no zap. Sempre gera — o que faltar vem como espaço em branco.</p>
    </div>
    ${banner(docsResultado, envioResultado, driveResultado)}
    ${busca}
    ${lista}
  </div>`;

  return renderLayout({ active: 'contratos', title: 'Contratos & Procurações', body, user });
}
