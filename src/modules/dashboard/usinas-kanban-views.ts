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
        <input type="checkbox" title="Selecionar" data-usina-id="${escapeHtml(u.id)}"
               class="kanban-check hidden flex-shrink-0 accent-indigo-600">
        <a href="/dashboard/monitoramento/${escapeHtml(u.id)}" draggable="false"
           class="font-medium text-slate-800 hover:text-indigo-600 text-xs leading-tight truncate flex-1">${apelido}</a>
        <button type="button" draggable="false" title="Ver contato"
                class="kanban-info flex-shrink-0 text-slate-400 hover:text-indigo-600 text-xs leading-none px-0.5"
                data-usina-id="${escapeHtml(u.id)}" data-apelido="${apelido}">ℹ️</button>
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
          <span class="flex items-center gap-1 flex-shrink-0">
            <button type="button" class="sel-todas hidden text-[9px] text-indigo-600 hover:underline" data-etapa="${escapeHtml(etapa.slug)}">todas</button>
            <span class="kanban-count text-[10px] font-bold text-slate-500 bg-white rounded-full px-1.5 py-0.5">${cards.length}</span>
          </span>
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
          <button id="btn-selecionar" type="button"
                  class="border border-slate-300 rounded px-3 py-1 text-xs text-slate-700 hover:bg-slate-50">☑️ Selecionar</button>
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

    <!-- Painel de contato (drawer): preenchido por fetch ao clicar no ℹ️ do card -->
    <div id="contato-overlay" class="hidden fixed inset-0 bg-black/20 z-40"></div>
    <aside id="contato-drawer" class="hidden fixed top-0 right-0 h-full w-80 max-w-[90vw] bg-white shadow-xl z-50 flex flex-col">
      <div class="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <h2 id="contato-titulo" class="font-bold text-slate-800 text-sm truncate">Usina</h2>
        <button id="contato-fechar" type="button" title="Fechar"
                class="text-slate-400 hover:text-slate-700 text-2xl leading-none">&times;</button>
      </div>
      <div id="contato-corpo" class="p-4 text-sm text-slate-700 overflow-y-auto flex-1"></div>
    </aside>

    <!-- Modo seleção: caixinhas e "todas" só aparecem com o modo ligado -->
    <style>
      .modo-selecao .kanban-check { display: inline-block; }
      .modo-selecao .sel-todas { display: inline; }
    </style>

    <!-- Barra de mover em lote (aparece no modo seleção com 1+ marcada) -->
    <div id="lote-bar" class="hidden fixed bottom-0 left-0 right-0 bg-slate-800 text-white px-4 py-2 flex items-center gap-3 z-40 shadow-lg">
      <span id="lote-count" class="text-sm font-medium">0 selecionadas</span>
      <select id="lote-etapa" class="text-slate-800 rounded px-2 py-1 text-sm">
        <option value="">Mover para…</option>
        ${ETAPAS_USINA.map((e) => `<option value="${escapeHtml(e.slug)}">${escapeHtml(e.label)}</option>`).join('')}
      </select>
      <button id="lote-mover" type="button" class="bg-indigo-500 hover:bg-indigo-400 rounded px-3 py-1 text-sm font-medium">Mover</button>
      <button id="lote-limpar" type="button" class="text-slate-300 hover:text-white text-sm">Limpar</button>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/Sortable.min.js"
            integrity="sha384-HZZ/fukV+9G8gwTNjN7zQDG0Sp7MsZy5DDN6VfY3Be7V9dvQpEpR2jF2HlyFUUjU"
            crossorigin="anonymous"></script>
    <script>
      (function () {
        // Auto-refresh: 60s, resetado a cada interação do usuário.
        // Pausa enquanto o modo seleção está ligado (não atrapalha a seleção).
        var REFRESH_MS = 60000;
        var refreshTimer;
        function agendarRefresh() {
          clearTimeout(refreshTimer);
          refreshTimer = setTimeout(function () {
            if (document.body.classList.contains('modo-selecao')) agendarRefresh();
            else location.reload();
          }, REFRESH_MS);
        }
        agendarRefresh();
        function resetTimer() { agendarRefresh(); }
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

        // Drag-and-drop (SortableJS). Guarda as instâncias pra poder desabilitar
        // o arraste quando o modo seleção estiver ligado.
        if (typeof Sortable === 'undefined') return;
        var sortables = [];
        document.querySelectorAll('.kanban-list').forEach(function (col) {
          sortables.push(new Sortable(col, {
            group: 'obras',
            animation: 150,
            draggable: '.kanban-card',
            filter: '.kanban-info, .kanban-check', // clicar no ℹ️/caixinha não arrasta
            preventOnFilter: false,                // ...mas o clique ainda dispara
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
          }));
        });
        window.__obrasSortables = sortables;
      })();
    </script>

    <script>
      (function () {
        var overlay = document.getElementById('contato-overlay');
        var drawer  = document.getElementById('contato-drawer');
        var titulo  = document.getElementById('contato-titulo');
        var corpo   = document.getElementById('contato-corpo');
        var fechar  = document.getElementById('contato-fechar');
        var board   = document.querySelector('.kanban-board');
        if (!drawer || !board) return;

        // Anti-XSS: todo dado vindo do servidor (nome/email/etc.) passa por aqui
        // antes de ir pro innerHTML. Cobre texto e atributo com aspas duplas.
        function esc(s) {
          return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
          });
        }

        function campo(icone, valor) {
          var copiavel = valor && valor !== 'não cadastrado';
          return '<div class="flex items-center justify-between gap-2 mb-2">' +
                   '<span class="truncate">' + icone + ' ' + esc(valor) + '</span>' +
                   (copiavel
                     ? '<button type="button" class="contato-copiar text-[11px] text-indigo-600 hover:underline flex-shrink-0" data-valor="' + esc(valor) + '">copiar</button>'
                     : '') +
                 '</div>';
        }

        function preencher(c) {
          var h = '';
          if (c.cliente) {
            h += campo('👤', c.cliente.nome);
            h += campo('📱', c.cliente.telefone);
            h += campo('✉️', c.cliente.email);
          } else {
            h += '<div class="mb-2 text-slate-500 italic">Cliente não cadastrado</div>';
          }
          h += '<hr class="my-3 border-slate-100">';
          h += '<div class="mb-1 text-slate-600">📍 ' + esc(c.localizacao) + ' · ' + esc(c.potencia) + '</div>';
          h += '<div class="mb-3 text-slate-600">🏗️ ' + esc(c.etapa) + (c.diasNaEtapa ? ' · ' + esc(c.diasNaEtapa) : '') + '</div>';
          h += '<a href="' + esc(c.detalheUrl) + '" class="inline-block text-indigo-600 hover:underline text-sm">abrir detalhe completo →</a>';
          corpo.innerHTML = h;
        }

        function abrir(id, apelido) {
          titulo.textContent = apelido || 'Usina';
          corpo.innerHTML = '<div class="text-slate-400 italic">carregando…</div>';
          overlay.classList.remove('hidden');
          drawer.classList.remove('hidden');
          fetch('/dashboard/usinas/' + id + '/contato')
            .then(function (res) { if (!res.ok) throw new Error(res.status); return res.json(); })
            .then(preencher)
            .catch(function () {
              corpo.innerHTML = '<div class="text-rose-600">Não foi possível carregar o contato.</div>';
            });
        }

        function fecharPainel() {
          overlay.classList.add('hidden');
          drawer.classList.add('hidden');
        }

        board.addEventListener('click', function (e) {
          var btn = e.target.closest('.kanban-info');
          if (!btn) return;
          e.preventDefault();
          abrir(btn.dataset.usinaId, btn.dataset.apelido);
        });
        corpo.addEventListener('click', function (e) {
          var btn = e.target.closest('.contato-copiar');
          if (!btn) return;
          navigator.clipboard.writeText(btn.dataset.valor).then(function () {
            var t = btn.textContent; btn.textContent = 'copiado!';
            setTimeout(function () { btn.textContent = t; }, 1200);
          }).catch(function () {});
        });
        overlay.addEventListener('click', fecharPainel);
        fechar.addEventListener('click', fecharPainel);
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fecharPainel(); });
      })();
    </script>

    <script>
      (function () {
        var btn    = document.getElementById('btn-selecionar');
        var bar    = document.getElementById('lote-bar');
        var conta  = document.getElementById('lote-count');
        var selEt  = document.getElementById('lote-etapa');
        var mover  = document.getElementById('lote-mover');
        var limpar = document.getElementById('lote-limpar');
        var board  = document.querySelector('.kanban-board');
        if (!btn || !bar || !board) return;

        function selecionados() {
          return Array.prototype.slice.call(document.querySelectorAll('.kanban-check:checked'));
        }
        function atualizarBarra() {
          var n = selecionados().length;
          conta.textContent = n + (n === 1 ? ' selecionada' : ' selecionadas');
          bar.classList.toggle('hidden', n === 0);
        }
        function setArrasteDesabilitado(v) {
          (window.__obrasSortables || []).forEach(function (s) { s.option('disabled', v); });
        }
        function limparSelecao() {
          document.querySelectorAll('.kanban-check:checked').forEach(function (c) { c.checked = false; });
          atualizarBarra();
        }

        // Liga/desliga o modo seleção
        btn.addEventListener('click', function () {
          var ligado = document.body.classList.toggle('modo-selecao');
          setArrasteDesabilitado(ligado);
          btn.classList.toggle('bg-indigo-600', ligado);
          btn.classList.toggle('text-white', ligado);
          if (!ligado) limparSelecao();
        });

        // Marcar/desmarcar uma caixinha
        board.addEventListener('change', function (e) {
          if (e.target.classList.contains('kanban-check')) atualizarBarra();
        });

        // "todas" no cabeçalho da coluna: alterna marcar/desmarcar a coluna toda
        board.addEventListener('click', function (e) {
          var b = e.target.closest('.sel-todas');
          if (!b) return;
          var col = b.closest('.kanban-col');
          if (!col) return;
          var checks = col.querySelectorAll('.kanban-check');
          var todas = Array.prototype.every.call(checks, function (c) { return c.checked; });
          checks.forEach(function (c) { c.checked = !todas; });
          atualizarBarra();
        });

        limpar.addEventListener('click', limparSelecao);

        mover.addEventListener('click', function () {
          var ids = selecionados().map(function (c) { return c.dataset.usinaId; });
          var etapa = selEt.value;
          if (!ids.length) return;
          if (!etapa) { alert('Escolha a etapa de destino.'); return; }
          var label = selEt.options[selEt.selectedIndex].text;
          if (!confirm('Mover ' + ids.length + ' usina(s) para "' + label + '"?')) return;
          fetch('/dashboard/usinas/set-etapa-obra-lote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'etapa=' + encodeURIComponent(etapa) + '&ids=' + encodeURIComponent(ids.join(','))
          }).then(function (res) {
            if (res.ok) { location.reload(); return; }
            alert(res.status === 403
              ? 'Você não tem permissão para mover obras.'
              : 'Não foi possível mover (erro ' + res.status + ').');
          }).catch(function () { alert('Falha de conexão ao mover.'); });
        });
      })();
    </script>`;

  return renderLayout({ active: 'usinas_kanban', title: 'Kanban de Obras', body, user });
}
