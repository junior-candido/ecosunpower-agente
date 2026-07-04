// src/modules/dashboard/rh-views.ts
// Telas da área RH: vagas (CRUD) + candidatos (funil de seleção).
// Molde visual: usuarios-views.ts (tema claro, tabelas simples).
import { renderLayout } from './views.js';
import type { DashUser } from './permissions.js';
import type { VagaRow, CandidatoRow, FiltrosCandidatos } from '../rh/store.js';
import { STATUS_VALIDOS } from '../rh/store.js';

function esc(s: string | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]!));
}

const dataBr = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};

const STATUS_ROTULO: Record<string, string> = {
  novo: '🆕 novo', triado: '🔎 triado', entrevista: '🗓 entrevista',
  aprovado: '✅ aprovado', reprovado: '❌ reprovado',
};

// ---------------------------------------------------------------------------
// VAGAS
// ---------------------------------------------------------------------------

export function renderVagasPage(vagas: VagaRow[], viewer?: DashUser): string {
  const linhas = vagas.map((v) => `
    <tr class="border-b border-slate-200 hover:bg-slate-50">
      <td class="px-3 py-2 font-medium">${esc(v.titulo)}</td>
      <td class="px-3 py-2 text-slate-500">${esc(v.cidade)}</td>
      <td class="px-3 py-2 text-slate-500">${esc(v.tipo)}</td>
      <td class="px-3 py-2">${v.status === 'aberta' ? '🟢 aberta' : '⚪ fechada'}</td>
      <td class="px-3 py-2 text-slate-500">${dataBr(v.created_at)}</td>
      <td class="px-3 py-2 text-right whitespace-nowrap">
        <a href="/dashboard/rh/vagas/${esc(v.id)}" class="text-sky-600 hover:underline mr-3">editar</a>
        <form method="POST" action="/dashboard/rh/vagas/${esc(v.id)}/status" class="inline">
          <input type="hidden" name="status" value="${v.status === 'aberta' ? 'fechada' : 'aberta'}">
          <button class="text-slate-600 hover:underline">${v.status === 'aberta' ? 'fechar' : 'reabrir'}</button>
        </form>
      </td>
    </tr>`).join('');

  const body = `
  <div class="flex items-center justify-between mb-4">
    <h1 class="text-xl font-bold">📢 Vagas</h1>
    <a href="/dashboard/rh/vagas/nova" class="bg-sky-600 hover:bg-sky-700 text-white rounded-md px-4 py-2 text-sm font-semibold">➕ Nova vaga</a>
  </div>
  <p class="text-sm text-slate-500 mb-4">Vaga <strong>aberta</strong> aparece na página <a href="https://ecosunpower.eng.br/trabalhe-conosco" target="_blank" class="text-sky-600 hover:underline">Trabalhe Conosco</a> do site na hora. Fechou, some na hora.</p>
  <table class="w-full bg-white rounded-lg border border-slate-200 text-sm">
    <thead><tr class="text-left text-slate-500 border-b border-slate-200">
      <th class="px-3 py-2">Vaga</th><th class="px-3 py-2">Cidade</th><th class="px-3 py-2">Tipo</th>
      <th class="px-3 py-2">Status</th><th class="px-3 py-2">Criada</th><th></th>
    </tr></thead>
    <tbody>${linhas || '<tr><td class="px-3 py-4 text-slate-400" colspan="6">Nenhuma vaga ainda — crie a primeira no botão acima.</td></tr>'}</tbody>
  </table>`;
  return renderLayout({ active: 'rh_vagas', title: 'RH · Vagas', body, user: viewer });
}

export function renderVagaFormPage(vaga: VagaRow | null, viewer?: DashUser): string {
  const action = vaga ? `/dashboard/rh/vagas/${esc(vaga.id)}` : '/dashboard/rh/vagas';
  const tipos = ['CLT', 'PJ', 'Estágio', 'Temporário'];
  const body = `
  <div class="mb-4"><a href="/dashboard/rh/vagas" class="text-sky-600 hover:underline text-sm">← Vagas</a></div>
  <h1 class="text-xl font-bold mb-4">${vaga ? '✏️ Editar vaga' : '➕ Nova vaga'}</h1>
  <form method="POST" action="${action}" class="bg-white rounded-lg border border-slate-200 p-5 max-w-2xl space-y-4">
    <div>
      <label class="block text-sm font-semibold text-slate-700 mb-1">Título da vaga</label>
      <input name="titulo" required value="${esc(vaga?.titulo)}" placeholder="ex.: Instalador Fotovoltaico" class="w-full border border-slate-300 rounded-md px-3 py-2">
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-semibold text-slate-700 mb-1">Cidade</label>
        <input name="cidade" value="${esc(vaga?.cidade ?? 'Brasília-DF')}" class="w-full border border-slate-300 rounded-md px-3 py-2">
      </div>
      <div>
        <label class="block text-sm font-semibold text-slate-700 mb-1">Tipo</label>
        <select name="tipo" class="w-full border border-slate-300 rounded-md px-3 py-2">
          ${tipos.map((t) => `<option value="${t}" ${vaga?.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
    </div>
    <div>
      <label class="block text-sm font-semibold text-slate-700 mb-1">Descrição (o que a pessoa vai fazer)</label>
      <textarea name="descricao" rows="4" class="w-full border border-slate-300 rounded-md px-3 py-2">${esc(vaga?.descricao)}</textarea>
    </div>
    <div>
      <label class="block text-sm font-semibold text-slate-700 mb-1">Requisitos (a IA usa isso pra dar a nota na triagem)</label>
      <textarea name="requisitos" rows="4" placeholder="ex.: NR-35 em dia, experiência com estrutura em telhado metálico, CNH B" class="w-full border border-slate-300 rounded-md px-3 py-2">${esc(vaga?.requisitos)}</textarea>
    </div>
    <button class="bg-sky-600 hover:bg-sky-700 text-white rounded-md px-5 py-2 font-semibold">${vaga ? 'Salvar alterações' : 'Publicar vaga'}</button>
  </form>`;
  return renderLayout({ active: 'rh_vagas', title: vaga ? 'RH · Editar vaga' : 'RH · Nova vaga', body, user: viewer });
}

// ---------------------------------------------------------------------------
// CANDIDATOS
// ---------------------------------------------------------------------------

export function renderCandidatosPage(
  candidatos: CandidatoRow[],
  vagas: VagaRow[],
  filtros: FiltrosCandidatos,
  viewer?: DashUser,
): string {
  const tituloVaga = new Map(vagas.map((v) => [v.id, v.titulo]));

  const selectStatus = (c: CandidatoRow) => `
    <form method="POST" action="/dashboard/rh/candidatos/${esc(c.id)}/status" class="inline">
      <select name="status" onchange="this.form.submit()" class="border border-slate-300 rounded-md px-2 py-1 text-xs bg-white">
        ${STATUS_VALIDOS.map((s) => `<option value="${s}" ${c.status === s ? 'selected' : ''}>${STATUS_ROTULO[s]}</option>`).join('')}
      </select>
    </form>`;

  const linhas = candidatos.map((c) => `
    <tr class="border-b border-slate-200 hover:bg-slate-50">
      <td class="px-3 py-2 font-medium">${esc(c.nome)}</td>
      <td class="px-3 py-2 text-slate-500">${c.vaga_id ? esc(tituloVaga.get(c.vaga_id) ?? 'vaga encerrada') : '🗂 Banco de Talentos'}</td>
      <td class="px-3 py-2 whitespace-nowrap">
        <a href="https://wa.me/${esc(c.telefone)}" target="_blank" class="text-emerald-600 hover:underline">💬 ${esc(c.telefone)}</a>
      </td>
      <td class="px-3 py-2 text-slate-500">${esc(c.email) || '—'}</td>
      <td class="px-3 py-2 text-center">${c.nota_ia !== null && c.nota_ia !== undefined ? `<span class="font-bold ${Number(c.nota_ia) >= 7 ? 'text-emerald-600' : Number(c.nota_ia) >= 4 ? 'text-amber-600' : 'text-rose-600'}">${Number(c.nota_ia).toFixed(1)}</span>` : '—'}</td>
      <td class="px-3 py-2">${selectStatus(c)}</td>
      <td class="px-3 py-2 text-slate-500">${dataBr(c.created_at)}</td>
      <td class="px-3 py-2 text-right whitespace-nowrap">
        <a href="/dashboard/rh/candidatos/${esc(c.id)}/curriculo" target="_blank" class="text-sky-600 hover:underline">📄 Currículo</a>
      </td>
    </tr>`).join('');

  const opcaoVaga = (id: string, rotulo: string) =>
    `<option value="${esc(id)}" ${filtros.vagaId === id ? 'selected' : ''}>${esc(rotulo)}</option>`;

  const body = `
  <div class="flex items-center justify-between mb-4">
    <h1 class="text-xl font-bold">📋 Candidatos</h1>
    <a href="/dashboard/rh/vagas" class="text-sky-600 hover:underline text-sm">📢 Gerenciar vagas →</a>
  </div>
  <form method="GET" action="/dashboard/rh/candidatos" class="bg-white rounded-lg border border-slate-200 p-3 mb-4 flex flex-wrap gap-2 items-center">
    <input name="q" value="${esc(filtros.q)}" placeholder="🔎 nome do candidato" class="border border-slate-300 rounded-md px-3 py-1.5 text-sm">
    <select name="vaga" class="border border-slate-300 rounded-md px-3 py-1.5 text-sm">
      <option value="">Todas as vagas</option>
      ${opcaoVaga('banco', '🗂 Banco de Talentos')}
      ${vagas.map((v) => opcaoVaga(v.id, v.titulo)).join('')}
    </select>
    <select name="status" class="border border-slate-300 rounded-md px-3 py-1.5 text-sm">
      <option value="">Todos os status</option>
      ${STATUS_VALIDOS.map((s) => `<option value="${s}" ${filtros.status === s ? 'selected' : ''}>${STATUS_ROTULO[s]}</option>`).join('')}
    </select>
    <button class="bg-sky-600 hover:bg-sky-700 text-white rounded-md px-4 py-1.5 text-sm font-semibold">Filtrar</button>
    <a href="/dashboard/rh/candidatos" class="text-slate-500 hover:underline text-sm">Limpar</a>
  </form>
  <table class="w-full bg-white rounded-lg border border-slate-200 text-sm">
    <thead><tr class="text-left text-slate-500 border-b border-slate-200">
      <th class="px-3 py-2">Nome</th><th class="px-3 py-2">Vaga</th><th class="px-3 py-2">WhatsApp</th>
      <th class="px-3 py-2">E-mail</th><th class="px-3 py-2 text-center">Nota IA</th><th class="px-3 py-2">Status</th>
      <th class="px-3 py-2">Chegou</th><th></th>
    </tr></thead>
    <tbody>${linhas || '<tr><td class="px-3 py-4 text-slate-400" colspan="8">Nenhum candidato ainda. Quando alguém se candidatar pelo site, aparece aqui.</td></tr>'}</tbody>
  </table>
  <p class="text-xs text-slate-400 mt-3">💡 Currículos ficam guardados por 12 meses (LGPD) e abrem por link temporário seguro. A coluna "Nota IA" enche quando a triagem inteligente (Entrega 2) entrar.</p>`;
  return renderLayout({ active: 'rh_candidatos', title: 'RH · Candidatos', body, user: viewer });
}
