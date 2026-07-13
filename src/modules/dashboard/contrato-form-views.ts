// src/modules/dashboard/contrato-form-views.ts
// 📝 O formulário da CENTRAL DE CONTRATOS.
//
// Mostra TODOS os campos do tipo de contrato escolhido, já preenchidos com o que
// veio do cadastro + proposta + o que a IA leu da conta/CNH. O que faltou aparece
// destacado em vermelho ("vai sair em branco no PDF") pro operador completar.
// Os campos vêm do registro (contratos-registry) — tipo novo não mexe nesta tela.
import { renderLayout, escapeHtml } from './views.js';
import { bannerContratos } from './contratos-views.js';
import { gruposDoContrato, type CampoContrato, type DefinicaoContrato } from '../closing/contratos-registry.js';

export interface ContratoFormInput {
  leadId: string;
  nome: string;
  def: DefinicaoContrato;
  tipos: Array<{ tipo: string; nome: string; emoji: string }>;
  valores: Record<string, string>;
  faltando: CampoContrato[];
  temProposta: boolean;
  salvo?: boolean;
  envioResultado?: string;
  driveResultado?: string;
  user?: unknown;
}

function campoHtml(c: CampoContrato, valor: string, vazio: boolean): string {
  const base = vazio
    ? 'border-rose-400 bg-rose-50 focus:ring-rose-300'
    : 'border-slate-300 bg-white focus:ring-amber-400';
  const trava = c.somenteLeitura ? ' bg-slate-100 text-slate-500 cursor-not-allowed' : '';
  const cls = `w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 ${base}${trava}`;
  const v = escapeHtml(valor);

  if (c.somenteLeitura) {
    // sem `name` → o navegador nem manda esse campo, então não tem como salvar
    return `<input type="text" value="${v}" disabled class="${cls}" />`;
  }
  if (c.tipo === 'select') {
    const opcoes = (c.opcoes ?? [])
      .map((o) => `<option value="${escapeHtml(o.valor)}"${o.valor === valor ? ' selected' : ''}>${escapeHtml(o.texto)}</option>`)
      .join('');
    return `<select name="${c.id}" class="${cls}"><option value="">— escolher —</option>${opcoes}</select>`;
  }
  if (c.tipo === 'textarea') {
    return `<textarea name="${c.id}" rows="3" class="${cls}" placeholder="${escapeHtml(c.dica ?? '')}">${v}</textarea>`;
  }
  const htmlType = c.tipo === 'data' ? 'date' : 'text';
  const inputmode = c.tipo === 'numero' || c.tipo === 'moeda' ? ' inputmode="decimal"' : '';
  return `<input type="${htmlType}" name="${c.id}" value="${v}"${inputmode} placeholder="${escapeHtml(c.dica ?? '')}" class="${cls}" />`;
}

function campo(c: CampoContrato, valor: string): string {
  const vazio = !!c.obrigatorio && !valor;
  const marca = vazio
    ? '<span class="ml-2 text-xs font-normal text-rose-600">vai sair em branco no PDF</span>'
    : '';
  const dica = c.somenteLeitura && c.dica
    ? `<div class="text-xs text-slate-400 mt-1">${escapeHtml(c.dica)}</div>`
    : '';
  return `<div>
      <label class="block text-sm mb-1 ${vazio ? 'text-rose-700 font-semibold' : 'text-slate-600'}">${escapeHtml(c.label)}${marca}</label>
      ${campoHtml(c, valor, vazio)}
      ${dica}
    </div>`;
}

function grupo(titulo: string, campos: CampoContrato[], valores: Record<string, string>): string {
  if (campos.length === 0) return '';
  const faltam = campos.filter((c) => c.obrigatorio && !valores[c.id]).length;
  const aviso = faltam > 0
    ? `<span class="text-xs px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-semibold">${faltam} em branco</span>`
    : '<span class="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">completo</span>';
  return `<section class="rounded-xl border border-slate-200 bg-white p-5 mb-4 shadow-sm">
      <div class="flex items-center gap-3 mb-4">
        <h2 class="font-semibold text-slate-900">${escapeHtml(titulo)}</h2>
        ${aviso}
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        ${campos.map((c) => campo(c, valores[c.id] ?? '')).join('\n')}
      </div>
    </section>`;
}

function abas(page: ContratoFormInput): string {
  const itens = page.tipos.map((t) => {
    const ativo = t.tipo === page.def.tipo;
    const cls = ativo
      ? 'bg-slate-900 text-white'
      : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50';
    return `<a href="/dashboard/leads/${page.leadId}/contrato-form?tipo=${encodeURIComponent(t.tipo)}"
        class="px-3 py-1.5 rounded-lg text-sm font-medium ${cls}">${t.emoji} ${escapeHtml(t.nome)}</a>`;
  });
  return `<div class="flex flex-wrap gap-2 mb-5">${itens.join('')}</div>`;
}

function avisos(page: ContratoFormInput): string {
  const box = (cls: string, txt: string) => `<div class="mb-4 text-sm px-4 py-3 rounded-lg border ${cls}">${txt}</div>`;
  // Mesmos avisos de envio/Drive da tela de busca (inclusive "cliente sem
  // telefone" e "Drive desligado", que aqui sumiam).
  let out = bannerContratos('', page.envioResultado ?? '', page.driveResultado ?? '');

  const n = page.faltando.length;
  if (n > 0) {
    const nomes = page.faltando.map((c) => escapeHtml(c.label)).join(' · ');
    out += box('bg-amber-50 border-amber-300 text-amber-800',
      `<strong>${n} campo(s) em branco.</strong> Completa aqui embaixo (o vermelho) e salva. Se deixar assim, o PDF gera do mesmo jeito — só que com uma linha em branco pra preencher à mão.<div class="mt-1 text-xs">${nomes}</div>`);
  } else if (page.salvo) {
    out += box('bg-emerald-50 border-emerald-300 text-emerald-800', '✅ Salvo, e não falta nada. Pode gerar o PDF ou mandar no zap.');
  } else {
    out += box('bg-emerald-50 border-emerald-300 text-emerald-800', '✅ Está tudo preenchido. Pode gerar.');
  }
  if (page.salvo && n > 0) {
    out += box('bg-slate-50 border-slate-300 text-slate-700', 'Salvei o que você preencheu. Os campos acima seguem em branco — pode gerar assim mesmo.');
  }
  if (!page.temProposta) {
    out += box('bg-slate-50 border-slate-300 text-slate-700', 'Esse cliente não tem proposta ligada — os dados da usina e o valor não vieram sozinhos. Preenche na mão aqui.');
  }
  return out;
}

function acoes(page: ContratoFormInput): string {
  const { leadId, def } = page;
  const doc = def.tipo === 'procuracao' ? 'procuracao' : 'contrato';
  const hidden = `<input type="hidden" name="next" value="form" />
      <input type="hidden" name="tipo_contrato" value="${escapeHtml(def.tipo)}" />`;
  const enviar = (destino: 'cliente' | 'eu', label: string, cls: string) => {
    const conf = destino === 'cliente' ? ` onsubmit="return confirm('Enviar direto pro WhatsApp do cliente?')"` : '';
    return `<form method="POST" action="/dashboard/leads/${leadId}/enviar-doc" class="inline"${conf}>
        ${hidden}
        <input type="hidden" name="tipo" value="${doc}" />
        <input type="hidden" name="destino" value="${destino}" />
        <button class="px-3 py-2 rounded-lg text-sm ${cls}">${label}</button>
      </form>`;
  };
  return `<div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div class="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">Depois de salvar</div>
      <div class="flex flex-wrap gap-2">
        <a href="/dashboard/leads/${leadId}/${doc}.pdf?tipo=${encodeURIComponent(def.tipo)}" target="_blank"
          class="px-3 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700">📄 Gerar PDF</a>
        ${enviar('cliente', '📤 Mandar pro cliente', 'bg-emerald-600 text-white hover:bg-emerald-700')}
        ${enviar('eu', '📤 Mandar pro meu zap', 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200')}
        <form method="POST" action="/dashboard/leads/${leadId}/salvar-drive" class="inline">
          ${hidden}
          <button class="px-3 py-2 rounded-lg text-sm bg-sky-600 text-white hover:bg-sky-700">☁️ Salvar no Drive</button>
        </form>
      </div>
    </div>`;
}

export function renderContratoFormPage(page: ContratoFormInput): string {
  const { def, valores } = page;

  // Os grupos vêm da ordem dos campos do próprio tipo — tipo novo com um grupo
  // novo ("A locação", "O serviço") aparece sozinho, sem mexer nesta tela.
  const grupos = gruposDoContrato(def)
    .map((g) => grupo(g, def.campos.filter((c) => c.grupo === g), valores))
    .join('\n');

  const body = `
  <div class="max-w-4xl mx-auto">
    <div class="mb-4">
      <a href="/dashboard/contratos?q=${encodeURIComponent(page.nome)}" class="text-sm text-slate-500 hover:text-slate-800">← voltar pra busca</a>
      <h1 class="text-2xl font-bold text-slate-900 mt-1">${def.emoji} ${escapeHtml(def.nome)}</h1>
      <p class="text-slate-500 mt-1">${escapeHtml(page.nome)} — ${escapeHtml(def.descricao)}</p>
    </div>

    ${abas(page)}
    ${avisos(page)}

    <form method="POST" action="/dashboard/leads/${page.leadId}/contrato-form">
      <input type="hidden" name="tipo" value="${escapeHtml(def.tipo)}" />
      ${grupos}
      <div class="flex items-center gap-3 mb-6">
        <button class="bg-slate-900 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-slate-800">💾 Salvar dados</button>
        <span class="text-sm text-slate-500">Os dados do cliente (CPF, RG, endereço, UC) vão pro cadastro dele — valem pra todo contrato, pra procuração e pra Eva. Você não digita duas vezes.</span>
      </div>
    </form>

    ${acoes(page)}
  </div>`;

  return renderLayout({ active: 'contratos', title: `${def.nome} — ${page.nome}`, body, user: page.user as any });
}
