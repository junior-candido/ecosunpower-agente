// kanban-views.ts
// View do funil em kanban: colunas por etapa, cards arrastáveis (SortableJS via CDN).
// Arrastar um card pra outra coluna dispara POST /dashboard/leads/:id/set-etapa.

import { renderLayout, escapeHtml } from './views.js';
import type { DashUser } from './permissions.js';
import type { KanbanCard } from './leads-queries.js';
import { ORDEM_ETAPAS, etapaLabel, etapaCor } from './pipeline.js';
import { formatPhoneBR } from '../meta-leadgen.js';

// "há X" desde a última atividade. Inline simples (mesmo formato do leads-views).
function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mês`;
}

// SLA "que chama atenção": borda lateral colorida sempre + chip só quando precisa
// (verde fica limpo). Vermelho ainda ganha o pulso (classe sla-urgent no card).
const SLA_STYLE: Record<'verde' | 'ambar' | 'vermelho', { border: string; chip: string }> = {
  verde:    { border: 'border-l-emerald-400', chip: '' },
  ambar:    { border: 'border-l-amber-400',   chip: '<span class="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-700 bg-amber-100 rounded px-1 leading-tight flex-shrink-0">⏳ vence</span>' },
  vermelho: { border: 'border-l-rose-500',    chip: '<span class="inline-flex items-center gap-0.5 text-[9px] font-bold text-rose-700 bg-rose-100 rounded px-1 leading-tight flex-shrink-0">⚠ vencida</span>' },
};

function renderCard(l: KanbanCard): string {
  const nome = escapeHtml(l.name ?? 'Sem nome');
  const phone = escapeHtml(formatPhoneBR(l.phone));
  const sla = SLA_STYLE[l.seloSla] ?? SLA_STYLE.verde;
  const urgente = l.seloSla === 'vermelho' ? ' sla-urgent' : '';
  // Card COMPACTO (2 linhas). Borda esquerda = SLA. Chip de prazo só no âmbar/vermelho.
  return `
    <div class="kanban-card bg-white border border-slate-200 border-l-[3px] ${sla.border} rounded-md px-2 py-1.5 shadow-sm cursor-grab hover:shadow-md hover:border-indigo-300 transition${urgente}" data-lead-id="${escapeHtml(l.id)}" title="${nome} · ${phone}">
      <div class="flex items-center gap-1.5">
        <a href="/dashboard/leads/${escapeHtml(l.id)}" draggable="false" class="font-medium text-slate-800 hover:text-indigo-600 text-xs leading-tight truncate flex-1">${nome}</a>
        <span class="text-[10px] text-slate-400 flex-shrink-0">${timeAgo(l.updated_at)}</span>
      </div>
      <div class="flex items-center justify-between gap-1 mt-0.5">
        <span class="text-[10px] text-slate-400 truncate">${phone}</span>
        ${sla.chip}
      </div>
    </div>`;
}

export function renderKanbanPage(grupos: Record<string, KanbanCard[]>, user?: DashUser): string {
  const colunas = ORDEM_ETAPAS.map((etapa) => {
    const cards = grupos[etapa] ?? [];
    const corCabecalho = etapaCor(etapa);
    const cardsHtml = cards.map(renderCard).join('') || `<div class="text-[11px] text-slate-400 italic py-3 text-center">vazio</div>`;
    // Coluna estreita; o cabeçalho fica "sticky" e a lista de cards rola DENTRO
    // da coluna (max-height pela altura do monitor) — não estica a página.
    return `
      <div class="kanban-col flex-shrink-0 w-48 bg-slate-100 rounded-lg p-1.5 flex flex-col" data-etapa="${escapeHtml(etapa)}">
        <div class="flex items-center justify-between mb-1.5 px-0.5 sticky top-0">
          <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${corCabecalho} truncate">${escapeHtml(etapaLabel(etapa))}</span>
          <span class="text-[10px] font-bold text-slate-500 bg-white rounded-full px-1.5 py-0.5 flex-shrink-0">${cards.length}</span>
        </div>
        <div class="kanban-list flex flex-col gap-1.5 overflow-y-auto pr-0.5 min-h-[40px]" style="max-height: calc(100vh - 190px)" data-etapa="${escapeHtml(etapa)}">
          ${cardsHtml}
        </div>
      </div>`;
  }).join('');

  const body = `
    <div class="w-full px-3 py-4">
      <div class="flex items-center justify-between mb-3">
        <div>
          <h1 class="text-lg font-bold text-slate-900 leading-tight">Funil (Kanban)</h1>
          <p class="text-[11px] text-slate-500">Arraste os cards entre as colunas. Os que <b class="text-rose-600">pulsam em vermelho</b> precisam de ação.</p>
        </div>
        <div class="inline-flex rounded-lg border border-slate-300 overflow-hidden text-sm">
          <a href="/dashboard/leads" class="px-3 py-1 bg-white text-slate-700 hover:bg-slate-50">Lista</a>
          <a href="/dashboard/leads/kanban" class="px-3 py-1 bg-indigo-600 text-white">Kanban</a>
        </div>
      </div>

      <div class="kanban-board flex gap-2 overflow-x-auto pb-2">
        ${colunas}
      </div>
    </div>

    <style>
      @keyframes slaPulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(244, 63, 94, 0); }
        50%      { box-shadow: 0 0 0 3px rgba(244, 63, 94, 0.35); }
      }
      .sla-urgent { animation: slaPulse 1.8s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) { .sla-urgent { animation: none; box-shadow: 0 0 0 2px rgba(244,63,94,0.4); } }
    </style>

    <script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/Sortable.min.js"></script>
    <script>
      (function () {
        if (typeof Sortable === 'undefined') return;
        document.querySelectorAll('.kanban-list').forEach(function (col) {
          new Sortable(col, {
            group: 'funil',
            animation: 150,
            draggable: '.kanban-card',
            onEnd: function (evt) {
              var id = evt.item.dataset.leadId;
              var etapa = evt.to.dataset.etapa;
              if (!id || !etapa) return;
              fetch('/dashboard/leads/' + id + '/set-etapa', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'etapa=' + encodeURIComponent(etapa)
              }).then(function () {}).catch(function () { location.reload(); });
            }
          });
        });
      })();
    </script>`;

  return renderLayout({ active: 'kanban', title: 'Funil (Kanban)', body, user });
}
