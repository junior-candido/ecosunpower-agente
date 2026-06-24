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

function slaDot(selo: 'verde' | 'ambar' | 'vermelho'): string {
  const map = {
    verde:    { cls: 'bg-emerald-500', t: 'Tarefas em dia' },
    ambar:    { cls: 'bg-amber-500',   t: 'Tarefa vence em breve' },
    vermelho: { cls: 'bg-rose-500',    t: 'Tarefa vencida' },
  }[selo];
  return `<span class="inline-block w-2.5 h-2.5 rounded-full ${map.cls}" title="${map.t}"></span>`;
}

function renderCard(l: KanbanCard): string {
  const nome = escapeHtml(l.name ?? 'Sem nome');
  const phone = escapeHtml(formatPhoneBR(l.phone));
  return `
    <div class="kanban-card bg-white border border-slate-200 rounded-lg p-3 shadow-sm cursor-grab hover:shadow-md" data-lead-id="${escapeHtml(l.id)}">
      <div class="flex items-center justify-between gap-2">
        <a href="/dashboard/leads/${escapeHtml(l.id)}" class="font-medium text-slate-900 hover:text-indigo-600 text-sm truncate">${nome}</a>
        ${slaDot(l.seloSla)}
      </div>
      <div class="text-xs text-slate-500 mt-1">${phone}</div>
      <div class="text-[11px] text-slate-400 mt-1">há ${timeAgo(l.updated_at)}</div>
    </div>`;
}

export function renderKanbanPage(grupos: Record<string, KanbanCard[]>, user?: DashUser): string {
  const colunas = ORDEM_ETAPAS.map((etapa) => {
    const cards = grupos[etapa] ?? [];
    const corCabecalho = etapaCor(etapa);
    const cardsHtml = cards.map(renderCard).join('') || `<div class="text-xs text-slate-400 italic py-4 text-center">vazio</div>`;
    return `
      <div class="kanban-col flex-shrink-0 w-72 bg-slate-100 rounded-xl p-3" data-etapa="${escapeHtml(etapa)}">
        <div class="flex items-center justify-between mb-3 px-1">
          <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${corCabecalho}">${escapeHtml(etapaLabel(etapa))}</span>
          <span class="text-xs font-medium text-slate-500">${cards.length}</span>
        </div>
        <div class="kanban-list flex flex-col gap-2 min-h-[60px]" data-etapa="${escapeHtml(etapa)}">
          ${cardsHtml}
        </div>
      </div>`;
  }).join('');

  const body = `
    <div class="max-w-full mx-auto px-4 py-6">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-slate-900">Funil (Kanban)</h1>
          <p class="text-sm text-slate-500 mt-1">Arraste os cards entre as colunas pra mover de etapa.</p>
        </div>
        <div class="inline-flex rounded-lg border border-slate-300 overflow-hidden">
          <a href="/dashboard/leads" class="px-3 py-1.5 text-sm bg-white text-slate-700 hover:bg-slate-50">Lista</a>
          <a href="/dashboard/leads/kanban" class="px-3 py-1.5 text-sm bg-indigo-600 text-white">Kanban</a>
        </div>
      </div>

      <div class="kanban-board flex gap-4 overflow-x-auto pb-4">
        ${colunas}
      </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/Sortable.min.js"></script>
    <script>
      (function () {
        if (typeof Sortable === 'undefined') return;
        document.querySelectorAll('.kanban-list').forEach(function (col) {
          new Sortable(col, {
            group: 'funil',
            animation: 150,
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
