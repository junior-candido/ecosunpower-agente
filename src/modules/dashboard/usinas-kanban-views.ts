// usinas-kanban-views.ts
// Kanban de etapas da obra: colunas por etapa, cards arrastáveis (SortableJS via CDN).
// Arrastar um card pra outra coluna dispara POST /dashboard/usinas/:id/set-etapa-obra.

import { renderLayout, escapeHtml } from './views.js';
import type { DashUser } from './permissions.js';
import { ETAPAS_USINA, ordemEtapa, type EtapaUsinaSlug } from '../usina-etapas.js';
import { agruparUsinasPorEtapaObra } from '../monitoring/usinas-queries.js';

export interface UsinaKanbanCard {
  id: string;
  apelido: string | null;
  cidade: string | null;
  potencia_kwp: number | null;
  etapa_obra: string;
  etapa_obra_updated_at: string | null;
}

const COR_ETAPA: Record<EtapaUsinaSlug, string> = {
  projeto:     'bg-sky-100 text-sky-800',
  aprovacao:   'bg-violet-100 text-violet-800',
  instalacao:  'bg-amber-100 text-amber-800',
  vistoria:    'bg-orange-100 text-orange-800',
  homologacao: 'bg-fuchsia-100 text-fuchsia-800',
  operacao:    'bg-emerald-200 text-emerald-900',
};

function diasNaEtapa(updatedAt: string | null): string {
  if (!updatedAt) return '';
  const dias = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86_400_000);
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'há 1 dia';
  return `há ${dias} dias`;
}

function renderCard(u: UsinaKanbanCard): string {
  const apelido = escapeHtml(u.apelido ?? 'Sem apelido');
  const cidade = escapeHtml(u.cidade ?? '—');
  const kwp = u.potencia_kwp != null ? `${u.potencia_kwp} kWp` : '—';
  const dias = diasNaEtapa(u.etapa_obra_updated_at);
  const busca = escapeHtml(`${u.apelido ?? ''} ${u.cidade ?? ''}`.toLowerCase());
  return `
    <div class="kanban-card bg-white border border-slate-200 rounded-md px-2 py-1.5 shadow-sm cursor-grab hover:shadow-md hover:border-indigo-300 transition"
         data-usina-id="${escapeHtml(u.id)}" data-apelido="${apelido}" data-busca="${busca}" title="${apelido} · ${cidade}">
      <div class="flex items-center justify-between gap-1">
        <a href="/dashboard/monitoramento/${escapeHtml(u.id)}" draggable="false"
           class="font-medium text-slate-800 hover:text-indigo-600 text-xs leading-tight truncate flex-1">${apelido}</a>
        ${dias ? `<span class="text-[9px] text-slate-400 flex-shrink-0">${dias}</span>` : ''}
      </div>
      <div class="text-[10px] text-slate-400 mt-0.5">${cidade} · ${kwp}</div>
    </div>`;
}

export function renderUsinasKanbanPage(usinas: UsinaKanbanCard[], user?: DashUser): string {
  const grupos = agruparUsinasPorEtapaObra(usinas);

  const colunas = ETAPAS_USINA.map((etapa) => {
    const cards = grupos[etapa.slug];
    const cor = COR_ETAPA[etapa.slug];
    const cardsHtml = cards.map(renderCard).join('')
      || `<div class="text-[11px] text-slate-400 italic py-3 text-center">vazio</div>`;
    return `
      <div class="kanban-col flex-shrink-0 w-48 bg-slate-100 rounded-lg p-1.5 flex flex-col" data-etapa="${escapeHtml(etapa.slug)}">
        <div class="flex items-center justify-between mb-1.5 px-0.5 sticky top-0">
          <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${cor} truncate">${escapeHtml(etapa.label)}</span>
          <span class="kanban-count text-[10px] font-bold text-slate-500 bg-white rounded-full px-1.5 py-0.5 flex-shrink-0">${cards.length}</span>
        </div>
        <div class="kanban-list flex flex-col gap-1.5 overflow-y-auto pr-0.5 min-h-[40px]"
             style="max-height: calc(100vh - 230px)" data-etapa="${escapeHtml(etapa.slug)}" data-ordem="${ordemEtapa(etapa.slug)}">
          ${cardsHtml}
        </div>
      </div>`;
  }).join('');

  const body = `
    <div class="w-full px-3 py-4">
      <div class="flex items-center justify-between mb-3">
        <div>
          <h1 class="text-lg font-bold text-slate-900 leading-tight">Kanban de Obras</h1>
          <p class="text-[11px] text-slate-500">Arraste para mover entre etapas. Atualiza a cada 60s.</p>
        </div>
        <div class="flex items-center gap-3">
          <input id="filtro-kanban" type="text" placeholder="Buscar nome ou cidade…"
                 class="border border-slate-300 rounded px-2 py-1 text-xs w-44 focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <div class="inline-flex rounded-lg border border-slate-300 overflow-hidden text-sm">
            <a href="/dashboard/monitoramento" class="px-3 py-1 bg-white text-slate-700 hover:bg-slate-50">Lista</a>
            <a href="/dashboard/usinas/kanban" class="px-3 py-1 bg-indigo-600 text-white">Kanban</a>
          </div>
        </div>
      </div>

      <div class="kanban-board flex gap-2 overflow-x-auto pb-2">
        ${colunas}
      </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/Sortable.min.js"
            integrity="sha384-HZZ/fukV+9G8gwTNjN7zQDG0Sp7MsZy5DDN6VfY3Be7V9dvQpEpR2jF2HlyFUUjU"
            crossorigin="anonymous"></script>
    <script>
      (function () {
        // Auto-refresh: 60s, resetado a cada interação do usuário
        var REFRESH_MS = 60000;
        var refreshTimer = setTimeout(function () { location.reload(); }, REFRESH_MS);
        function resetTimer() {
          clearTimeout(refreshTimer);
          refreshTimer = setTimeout(function () { location.reload(); }, REFRESH_MS);
        }
        document.addEventListener('mousedown', resetTimer);
        document.addEventListener('touchstart', resetTimer);

        // Filtro por nome/cidade
        var filtroInput = document.getElementById('filtro-kanban');
        if (filtroInput) {
          filtroInput.addEventListener('input', function () {
            resetTimer();
            var q = filtroInput.value.toLowerCase().trim();
            document.querySelectorAll('.kanban-col').forEach(function (col) {
              var visivel = 0;
              col.querySelectorAll('.kanban-card').forEach(function (card) {
                var mostrar = !q || (card.dataset.busca || '').includes(q);
                card.style.display = mostrar ? '' : 'none';
                if (mostrar) visivel++;
              });
              var badge = col.querySelector('.kanban-count');
              if (badge) badge.textContent = String(visivel);
            });
          });
        }

        // Drag-and-drop (SortableJS)
        if (typeof Sortable === 'undefined') return;
        document.querySelectorAll('.kanban-list').forEach(function (col) {
          new Sortable(col, {
            group: 'obras',
            animation: 150,
            draggable: '.kanban-card',
            onEnd: function (evt) {
              resetTimer();
              var id = evt.item.dataset.usinaId;
              var etapa = evt.to.dataset.etapa;
              if (!id || !etapa) return;

              // Avanço x retrocesso: compara a ordem (data-ordem) das colunas.
              // O servidor carimba essa ordem via ordemEtapa() — fonte única.
              var ordemDe = Number(evt.from.dataset.ordem);
              var ordemPara = Number(evt.to.dataset.ordem);

              // Reordenar dentro da mesma coluna não muda etapa: não faz nada.
              if (ordemPara === ordemDe) return;

              // Retrocesso (voltar etapa): confirma antes de salvar. Se cancelar,
              // recarrega para o card voltar ao lugar de origem.
              if (ordemPara < ordemDe) {
                var nome = evt.item.dataset.apelido || 'esta usina';
                if (!confirm('Voltar "' + nome + '" para uma etapa anterior?')) {
                  location.reload();
                  return;
                }
              }

              fetch('/dashboard/usinas/' + id + '/set-etapa-obra', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'etapa=' + encodeURIComponent(etapa)
              }).then(function (res) {
                if (res.ok) return;
                // Salvar falhou: avisa e recarrega para devolver o card ao lugar.
                alert(res.status === 403
                  ? 'Você não tem permissão para mover obras. Fale com o administrador.'
                  : 'Não foi possível mover (erro ' + res.status + '). A tela será recarregada.');
                location.reload();
              }).catch(function () {
                alert('Falha de conexão ao mover. A tela será recarregada.');
                location.reload();
              });
            }
          });
        });
      })();
    </script>`;

  return renderLayout({ active: 'usinas_kanban', title: 'Kanban de Obras', body, user });
}
