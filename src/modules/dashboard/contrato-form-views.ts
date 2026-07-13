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
import type { AchadoRevisao, SugestaoIa } from '../closing/revisar-contrato.js';

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
  user?: unknown;
}

const FONTE_TEXTO: Record<string, string> = {
  cadastro: 'no cadastro do cliente',
  proposta: 'na proposta',
  conversa: 'na conversa do WhatsApp',
};

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
    return `<select name="${c.id}" id="campo-${c.id}" class="${cls}"><option value="">— escolher —</option>${opcoes}</select>`;
  }
  if (c.tipo === 'textarea') {
    return `<textarea name="${c.id}" id="campo-${c.id}" rows="3" class="${cls}" placeholder="${escapeHtml(c.dica ?? '')}">${v}</textarea>`;
  }
  // Lista de atalhos, mas campo LIVRE: o operador escolhe uma das de sempre ou
  // escreve o que combinou com o cliente. (É o caso da forma de pagamento.)
  if (c.tipo === 'texto_sugerido') {
    const lista = `lista-${c.id}`;
    const itens = (c.sugestoes ?? []).map((s) => `<option value="${escapeHtml(s)}"></option>`).join('');
    return `<input type="text" name="${c.id}" id="campo-${c.id}" value="${v}" list="${lista}"
        placeholder="${escapeHtml(c.dica ?? '')}" autocomplete="off" class="${cls}" />
      <datalist id="${lista}">${itens}</datalist>`;
  }
  const htmlType = c.tipo === 'data' ? 'date' : 'text';
  const inputmode = c.tipo === 'numero' || c.tipo === 'moeda' ? ' inputmode="decimal"' : '';
  return `<input type="${htmlType}" name="${c.id}" id="campo-${c.id}" value="${v}"${inputmode} placeholder="${escapeHtml(c.dica ?? '')}" class="${cls}" />`;
}

// A sugestão da IA NÃO entra no campo sozinha. Fica aqui do lado, dizendo de onde
// saiu e mostrando o trecho — e só entra se o Junior clicar em "usar". Num
// contrato, um clique distraído em Salvar não pode gravar palpite de máquina no
// cadastro do cliente.
function cartaoSugestao(c: CampoContrato, s: SugestaoIa): string {
  const onde = FONTE_TEXTO[s.fonte] ?? 'nas fontes';
  return `<div class="mt-1.5 rounded-lg border border-violet-300 bg-violet-50 px-3 py-2">
      <div class="flex items-start gap-2">
        <span class="text-sm">🤖</span>
        <div class="min-w-0 flex-1">
          <div class="text-sm text-violet-900">Achei <strong>${escapeHtml(s.valor)}</strong> ${escapeHtml(onde)}.</div>
          <div class="text-xs text-violet-700 mt-0.5 truncate" title="${escapeHtml(s.trecho)}">“${escapeHtml(s.trecho)}”</div>
        </div>
        <button type="button" data-usar="${escapeHtml(c.id)}" data-valor="${escapeHtml(s.valor)}"
          class="shrink-0 px-2.5 py-1 rounded-md text-xs font-semibold bg-violet-600 text-white hover:bg-violet-700">usar</button>
      </div>
    </div>`;
}

function campo(c: CampoContrato, valor: string, sugestao?: SugestaoIa): string {
  const vazio = !!c.obrigatorio && !valor;
  const marca = vazio && !sugestao
    ? '<span class="ml-2 text-xs font-normal text-rose-600">vai sair em branco no PDF</span>'
    : '';
  const cor = vazio ? 'text-rose-700 font-semibold' : 'text-slate-600';
  const dica = c.somenteLeitura && c.dica
    ? `<div class="text-xs text-slate-400 mt-1">${escapeHtml(c.dica)}</div>`
    : '';
  return `<div>
      <label class="block text-sm mb-1 ${cor}">${escapeHtml(c.label)}${marca}</label>
      ${campoHtml(c, valor, vazio)}
      ${sugestao ? cartaoSugestao(c, sugestao) : ''}
      ${dica}
    </div>`;
}

function grupo(titulo: string, campos: CampoContrato[], valores: Record<string, string>, sugestoes: Record<string, SugestaoIa>): string {
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
        ${campos.map((c) => campo(c, valores[c.id] ?? '', sugestoes[c.id])).join('\n')}
      </div>
    </section>`;
}

// 👀 O contrato montado, do jeitinho que vai virar PDF — inclusive com o que você
// acabou de digitar e ainda não salvou (o botão reposta o formulário pra prévia).
// O quadro é TRANCADO (sandbox): o documento leva nome/endereço que vieram de
// fora (perfil do WhatsApp, CNH, formulário do Meta) e não pode rodar nada aqui.
function preview(page: ContratoFormInput): string {
  const url = `/dashboard/leads/${page.leadId}/contrato-preview?tipo=${encodeURIComponent(page.def.tipo)}`;
  return `<section class="rounded-xl border border-slate-200 bg-white p-5 mb-4 shadow-sm">
      <div class="flex items-center gap-3 mb-3">
        <h2 class="font-semibold text-slate-900">👀 Como vai ficar o documento</h2>
        <span class="text-xs text-slate-500">mesmo template do PDF</span>
        <button type="button" id="btn-preview"
          class="ml-auto px-2.5 py-1 rounded-md text-xs bg-slate-100 text-slate-700 hover:bg-slate-200">↻ ver como está agora</button>
      </div>
      <iframe id="preview-doc" name="preview-doc" src="${url}" title="Prévia do documento" sandbox=""
        class="w-full h-[520px] rounded-lg border border-slate-200 bg-white"></iframe>
      <p class="text-xs text-slate-500 mt-2">O quadro mostra o documento <strong>salvo</strong>. Digitou algo e quer ver antes de salvar? Clica em <strong>ver como está agora</strong>.</p>
    </section>`;
}

// 🤖 O que a IA fez. Regra de ouro: se ela NÃO respondeu, a tela diz isso na cara —
// jamais um "está tudo certo" sobre um contrato que a máquina não leu.
function revisaoIa(page: ContratoFormInput): string {
  const box = (cls: string, txt: string) => `<div class="text-sm px-4 py-3 rounded-lg border mb-2 ${cls}">${txt}</div>`;

  if (page.iaIndisponivel) {
    return box('bg-slate-50 border-slate-300 text-slate-700', 'A IA não está ligada neste servidor (falta a chave). O contrato gera do mesmo jeito — só não tem quem confira.');
  }
  if (!page.iaRodou) return '';

  if (page.iaFalhou) {
    return `<section class="rounded-xl border border-amber-300 bg-amber-50 p-5 mb-4">
        <h2 class="font-semibold text-slate-900 mb-2">🤖 Não consegui revisar</h2>
        <p class="text-sm text-amber-900">A IA não respondeu agora (pode ser crédito da Anthropic, ou ela demorou demais). <strong>Ninguém conferiu este contrato.</strong> Tenta de novo daqui a pouco, ou confere na mão antes de mandar.</p>
      </section>`;
  }

  const achados = page.achados ?? [];
  const nSug = Object.keys(page.sugestoes ?? {}).length;
  const cor = (g: string) => g === 'alto'
    ? 'bg-rose-50 border-rose-300 text-rose-800'
    : g === 'baixo' ? 'bg-slate-50 border-slate-300 text-slate-700' : 'bg-amber-50 border-amber-300 text-amber-800';
  const icone = (g: string) => (g === 'alto' ? '🔴' : g === 'baixo' ? '⚪' : '🟡');

  const lista = achados.length === 0
    ? box('bg-emerald-50 border-emerald-300 text-emerald-800', 'A IA não apontou nada de errado. <strong>Isso não é garantia</strong> — dá uma lida no documento aí em cima antes de mandar.')
    : achados.map((a) => box(cor(a.gravidade), `${icone(a.gravidade)} ${escapeHtml(a.texto)}`)).join('');

  const sug = nSug > 0
    ? box('bg-violet-50 border-violet-300 text-violet-800', `🤖 Achei ${nSug} dado(s) que estavam faltando. Estão nos cartões roxos lá embaixo, com o trecho de onde eu tirei. <strong>Confere e clica em "usar"</strong> — eu não preencho nada sozinha.`)
    : box('bg-slate-50 border-slate-300 text-slate-700', 'Não encontrei os dados que faltam — nem no cadastro, nem na proposta, nem na conversa. Preenche na mão.');

  return `<section class="rounded-xl border border-violet-200 bg-violet-50/40 p-5 mb-4">
      <h2 class="font-semibold text-slate-900 mb-3">🤖 O que a IA fez</h2>
      ${sug}
      ${lista}
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
      <div class="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-1">Entregar o documento</div>
      <p class="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
        ⚠️ Estes botões usam o que está <strong>salvo</strong>. Se você mexeu em algum campo agora, clica em <strong>💾 Salvar dados</strong> antes — senão o cliente recebe o documento sem a sua alteração.
      </p>
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
  const sugestoes = page.sugestoes ?? {};

  // Os grupos vêm da ordem dos campos do próprio tipo — tipo novo com um grupo
  // novo ("A locação", "O serviço") aparece sozinho, sem mexer nesta tela.
  const grupos = gruposDoContrato(def)
    .map((g) => grupo(g, def.campos.filter((c) => c.grupo === g), valores, sugestoes))
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

    <!-- Tudo dentro de UM formulário: assim o botão da IA e o da prévia levam
         junto o que você acabou de digitar, em vez de apagar da tela. -->
    <form method="POST" action="/dashboard/leads/${page.leadId}/contrato-form" id="form-contrato">
      <input type="hidden" name="tipo" value="${escapeHtml(def.tipo)}" />

      <div class="mb-4">
        <button formaction="/dashboard/leads/${page.leadId}/contrato-ia"
          class="w-full sm:w-auto px-5 py-2.5 rounded-lg font-semibold bg-violet-600 text-white hover:bg-violet-700">
          🤖 IA: procurar o que falta e revisar o contrato
        </button>
        <span class="block sm:inline sm:ml-3 text-sm text-slate-500 mt-2 sm:mt-0">Ela procura no cadastro, na proposta e na conversa do zap — e aponta o que está errado. <strong>Ela não preenche nada sozinha</strong>: sugere, e você decide.</span>
      </div>

      ${revisaoIa(page)}
      ${preview(page)}
      ${grupos}

      <div class="flex items-center gap-3 mb-6">
        <button class="bg-slate-900 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-slate-800">💾 Salvar dados</button>
        <span class="text-sm text-slate-500">Os dados do cliente (CPF, RG, endereço, UC) vão pro cadastro dele — valem pra todo contrato, pra procuração e pra Eva. Você não digita duas vezes.</span>
      </div>
    </form>

    ${acoes(page)}
  </div>`;

  // "usar" põe a sugestão da IA no campo (só com o clique do Junior).
  // "ver como está agora" reposta o formulário pro quadro da prévia.
  const scripts = `<script>
    document.querySelectorAll('[data-usar]').forEach(function (b) {
      b.addEventListener('click', function () {
        var campo = document.getElementById('campo-' + b.dataset.usar);
        if (!campo) return;
        campo.value = b.dataset.valor;
        campo.classList.remove('border-rose-400', 'bg-rose-50');
        campo.classList.add('border-violet-400', 'bg-violet-50');
        b.textContent = 'usado ✓';
        b.disabled = true;
        b.classList.add('opacity-60');
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

  return renderLayout({ active: 'contratos', title: `${def.nome} — ${page.nome}`, body, scripts, user: page.user as any });
}
