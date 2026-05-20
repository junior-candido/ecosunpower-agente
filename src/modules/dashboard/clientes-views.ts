// src/modules/dashboard/clientes-views.ts
import { renderLayout } from './views.js';
import { statusLabel, statusCorChip } from '../clientes/mappers.js';
import { CONCESSIONARIAS_BR, getConcessionariaById } from '../concessionarias.js';
import type { ClienteRow } from '../clientes/types.js';

function escapeHtml(s: string | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function avatarInitials(name: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}

export function renderClientesListPage(
  rows: ClienteRow[],
  filters: { q?: string; concessionaria?: string; cidade?: string; ord?: string },
): string {
  const opt = (v: string, label: string, sel?: string) =>
    `<option value="${escapeHtml(v)}" ${sel === v ? 'selected' : ''}>${escapeHtml(label)}</option>`;

  const cidades = [...new Set(rows.map((r) => r.city).filter(Boolean) as string[])].sort();

  const card = (r: ClienteRow) => {
    const concNome = r.concessionaria ? getConcessionariaById(r.concessionaria)?.nome ?? r.concessionaria : '—';
    return `
    <a href="/dashboard/clientes/${escapeHtml(r.id)}" class="block bg-slate-800/60 hover:bg-slate-800 border border-slate-700 rounded-xl p-4 transition">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center font-bold text-slate-900 text-sm">${escapeHtml(avatarInitials(r.name))}</div>
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-slate-100 truncate">${escapeHtml(r.name) || '—'}</div>
          <div class="text-xs text-slate-500 truncate">${escapeHtml(r.phone)}</div>
        </div>
        <div class="px-2 py-0.5 rounded-full border text-[10px] font-semibold ${statusCorChip(r.installation_status)}">${escapeHtml(statusLabel(r.installation_status))}</div>
      </div>
      <div class="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div class="text-slate-500 uppercase tracking-wider text-[9px]">Cidade</div>
          <div class="text-slate-200">${escapeHtml([r.city, r.uf].filter(Boolean).join('/') || '—')}</div>
        </div>
        <div>
          <div class="text-slate-500 uppercase tracking-wider text-[9px]">Concessionária</div>
          <div class="text-slate-200 truncate">${escapeHtml(concNome)}</div>
        </div>
        <div>
          <div class="text-slate-500 uppercase tracking-wider text-[9px]">Consumo</div>
          <div class="text-slate-200">${r.consumo_medio_kwh ? `${r.consumo_medio_kwh} kWh/mês` : '—'}</div>
        </div>
        <div>
          <div class="text-slate-500 uppercase tracking-wider text-[9px]">Conta</div>
          <div class="text-slate-200">${r.conta_media_brl ? `R$ ${r.conta_media_brl.toFixed(0)}` : '—'}</div>
        </div>
      </div>
    </a>`;
  };

  const body = `
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-slate-100">👥 Clientes — ${rows.length}</h1>
      <p class="text-slate-400 text-sm">Quem comprou. Lista de clientes instalados / operando / pós-venda.</p>
    </div>

    <form method="get" action="/dashboard/clientes" class="mb-6 flex flex-wrap gap-2 items-center">
      <input name="q" value="${escapeHtml(filters.q ?? '')}" placeholder="🔎 nome, telefone, email, CPF" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm flex-1 min-w-[200px]">
      <select name="concessionaria" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm">
        ${opt('', 'Todas concessionárias', filters.concessionaria)}
        ${CONCESSIONARIAS_BR.map((c) => opt(c.id, c.nome, filters.concessionaria)).join('')}
      </select>
      <select name="cidade" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm">
        ${opt('', 'Todas cidades', filters.cidade)}
        ${cidades.map((c) => opt(c, c, filters.cidade)).join('')}
      </select>
      <select name="ord" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm">
        ${opt('', 'Mais recente', filters.ord)}
        ${opt('nome', 'Nome A-Z', filters.ord)}
      </select>
      <button class="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold">Filtrar</button>
      <a href="/dashboard/clientes" class="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm">Limpar</a>
    </form>

    ${rows.length === 0
      ? `<div class="bg-slate-800/60 rounded-xl border border-slate-700 p-12 text-center text-slate-400">Nenhum cliente cadastrado ainda. Quando um lead chega em installation_status >= contrato_assinado, aparece aqui.</div>`
      : `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">${rows.map(card).join('')}</div>`}
  `;

  return renderLayout({ active: 'clientes', title: 'Clientes', body, dark: true });
}
