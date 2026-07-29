// src/modules/dashboard/assinaturas-views.ts
// Tela "📆 Assinaturas" (setor Financeiro) — lista + botões manuais.
// Automático (avisos/trava) é a Fatia 2; aqui é o posto de comando do Junior.
import { renderLayout, escapeHtml } from './views.js';
import type { DashUser } from './permissions.js';
import { situacaoDaAssinatura } from './assinaturas-store.js';
import type { AssinaturaRow, ProdutoRow, Situacao } from './assinaturas-store.js';

const reais = (c: number) => (c / 100).toFixed(2).replace('.', ',');
const dataBr = (iso: string) => iso.split('-').reverse().join('/');

const BADGE: Record<Situacao, string> = {
  ativa: '<span class="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">🟢 ativa</span>',
  vencendo: '<span class="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">🟡 vencendo</span>',
  vencida: '<span class="px-2 py-0.5 rounded-full text-xs bg-rose-100 text-rose-700">🔴 vencida</span>',
  travada: '<span class="px-2 py-0.5 rounded-full text-xs bg-slate-200 text-slate-700">⛔ travada</span>',
  cancelada: '<span class="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-500">cancelada</span>',
};

export function renderAssinaturasPage(
  produtos: ProdutoRow[],
  assinaturas: AssinaturaRow[],
  hoje: string,
  user: DashUser | undefined,
  aviso?: { tipo: 'ok' | 'erro'; texto: string; link?: string },
): string {
  const linhas = assinaturas.map((a) => {
    const sit = situacaoDaAssinatura({ status: a.status, venceEm: a.venceEm }, hoje);
    const acaoStatus = a.status === 'travada'
      ? `<form method="post" action="/dashboard/assinaturas/${a.id}/status" class="inline"><input type="hidden" name="status" value="ativa"><button class="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs">Liberar</button></form>`
      : `<form method="post" action="/dashboard/assinaturas/${a.id}/status" class="inline"><input type="hidden" name="status" value="travada"><button class="px-2 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white text-xs">Travar</button></form>`;
    return `<tr class="border-b border-slate-100 hover:bg-slate-50 align-top">
      <td class="px-4 py-3 font-medium">${escapeHtml(a.nome)}<div class="text-xs text-slate-400">${escapeHtml(a.email ?? '')}</div></td>
      <td class="px-4 py-3 text-sm">${escapeHtml(a.produtoNome)}</td>
      <td class="px-4 py-3 text-sm">R$ ${reais(a.valorCentavos)}</td>
      <td class="px-4 py-3 text-sm">${a.limite !== null ? `${a.limite} usinas` : '—'}</td>
      <td class="px-4 py-3 text-sm">${dataBr(a.venceEm)}</td>
      <td class="px-4 py-3">${BADGE[sit]}</td>
      <td class="px-4 py-3 text-sm">${a.telefone ? (a.zapConfirmado ? '✅ zap' : '📱 sem confirmar') : '—'}</td>
      <td class="px-4 py-3 whitespace-nowrap space-x-1">
        <form method="post" action="/dashboard/assinaturas/${a.id}/cobrar" class="inline"><button class="px-2 py-1 rounded bg-sky-600 hover:bg-sky-700 text-white text-xs">Gerar cobrança</button></form>
        ${acaoStatus}
        <details class="inline-block align-middle"><summary class="cursor-pointer text-xs text-slate-500 select-none">✏️ editar</summary>
          <form method="post" action="/dashboard/assinaturas/${a.id}/editar" class="mt-2 p-3 bg-slate-50 rounded-lg space-y-2 text-xs w-56">
            <label class="block">Valor (R$)<input name="valor" value="${reais(a.valorCentavos)}" class="w-full border border-slate-300 rounded px-2 py-1"></label>
            <label class="block">Telefone (zap)<input name="telefone" value="${escapeHtml(a.telefone ?? '')}" class="w-full border border-slate-300 rounded px-2 py-1"></label>
            <label class="block">Limite (usinas)<input name="limite" value="${a.limite ?? ''}" class="w-full border border-slate-300 rounded px-2 py-1"></label>
            <label class="block">Vence em<input type="date" name="vence_em" value="${a.venceEm}" class="w-full border border-slate-300 rounded px-2 py-1"></label>
            <button class="px-3 py-1 rounded bg-amber-400 hover:bg-amber-300 text-slate-900 font-semibold">Salvar</button>
          </form>
        </details>
      </td>
    </tr>`;
  }).join('\n');

  const avisoHtml = aviso
    ? `<div class="mb-4 px-4 py-3 rounded-xl text-sm ${aviso.tipo === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}">${escapeHtml(aviso.texto)}${aviso.link ? ` <a href="${escapeHtml(aviso.link)}" target="_blank" class="underline break-all">${escapeHtml(aviso.link)}</a>` : ''}</div>`
    : '';

  const opcoesProduto = produtos.map((p) =>
    `<option value="${escapeHtml(p.id)}">${escapeHtml(p.nome)} — R$ ${reais(p.valorCentavosPadrao)}</option>`).join('');

  const body = `
  <div class="mb-6">
    <h1 class="text-2xl font-bold text-slate-800">📆 Assinaturas</h1>
    <p class="text-sm text-slate-500 mt-1">Mensalidades dos produtos (calculadora, monitoramento). Os avisos e a trava automática entram na próxima fatia — aqui é o posto de comando manual.</p>
  </div>
  ${avisoHtml}
  <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-x-auto mb-8">
    <table class="w-full text-left">
      <thead class="text-xs uppercase tracking-wide text-slate-500 bg-slate-50"><tr>
        <th class="px-4 py-3">Assinante</th><th class="px-4 py-3">Produto</th><th class="px-4 py-3">Valor</th>
        <th class="px-4 py-3">Limite</th><th class="px-4 py-3">Vence</th><th class="px-4 py-3">Situação</th>
        <th class="px-4 py-3">Zap</th><th class="px-4 py-3">Ações</th>
      </tr></thead>
      <tbody>${linhas || '<tr><td colspan="8" class="px-4 py-8 text-center text-slate-400">Nenhuma assinatura ainda — crie a primeira aqui embaixo.</td></tr>'}</tbody>
    </table>
  </div>
  <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 max-w-xl">
    <h2 class="text-lg font-semibold text-slate-800 mb-1">➕ Nova assinatura</h2>
    <p class="text-xs text-slate-500 mb-4">O valor é o combinado com o assinante (pode ser diferente do padrão do produto — negociado).</p>
    <form method="post" action="/dashboard/assinaturas/nova" class="space-y-3">
      <label class="block text-sm">Produto<select name="produto" required class="w-full border border-slate-300 rounded-lg px-3 py-2">${opcoesProduto}</select></label>
      <label class="block text-sm">Nome do assinante<input name="nome" required maxlength="80" class="w-full border border-slate-300 rounded-lg px-3 py-2" placeholder="Ex.: Sabion Solar"></label>
      <div class="grid grid-cols-2 gap-3">
        <label class="block text-sm">E-mail<input name="email" type="email" class="w-full border border-slate-300 rounded-lg px-3 py-2"></label>
        <label class="block text-sm">Telefone (zap)<input name="telefone" class="w-full border border-slate-300 rounded-lg px-3 py-2" placeholder="5561999998888"></label>
      </div>
      <div class="grid grid-cols-3 gap-3">
        <label class="block text-sm">Valor (R$)<input name="valor" required class="w-full border border-slate-300 rounded-lg px-3 py-2" placeholder="297,00"></label>
        <label class="block text-sm">Limite (usinas)<input name="limite" class="w-full border border-slate-300 rounded-lg px-3 py-2" placeholder="110"></label>
        <label class="block text-sm">1º vencimento<input type="date" name="vence_em" required class="w-full border border-slate-300 rounded-lg px-3 py-2"></label>
      </div>
      <button type="submit" class="px-4 py-2 rounded-lg bg-amber-400 text-slate-900 font-semibold hover:bg-amber-300 transition">Criar assinatura</button>
    </form>
  </div>`;

  return renderLayout({ active: 'assinaturas', title: 'Assinaturas', body, user });
}
