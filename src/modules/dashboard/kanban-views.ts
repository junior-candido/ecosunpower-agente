// kanban-views.ts
// View do funil em kanban: colunas por etapa, cards arrastáveis (SortableJS via CDN).
// Arrastar um card pra outra coluna dispara POST /dashboard/leads/:id/set-etapa.
//
// Renovação do miolo, R4 (28/09/2026): colunas e cartões no padrão do Command
// Center (ui/kanban.ts). O que o Sortable procura continua igual: a lista tem
// a classe `kanban-list` + data-etapa, o cartão tem `kanban-card` +
// data-lead-id, o link do nome tem draggable="false" e o script é o mesmo.
// Celular: colunas com rolagem horizontal e encaixe (D7 ainda não decidida →
// sem o "Mover para…").

import { renderLayout, escapeHtml } from './views.js';
import type { DashUser } from './permissions.js';
import type { KanbanCard } from './leads-queries.js';
import { ORDEM_ETAPAS, etapaLabel } from './pipeline.js';
import { formatPhoneBR } from '../meta-leadgen.js';
import { cabecalhoPagina, chip, pilulaStatus } from './ui/componentes.js';
import { colunaKanban, cartaoKanban } from './ui/kanban.js';
import { corEtapa } from './ui/etapas.js';
import { temaDaTela } from './ui/tema.js';

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

// SLA: borda lateral colorida sempre + pílula só quando precisa (verde fica
// limpo). Vermelho ainda ganha o pulso (classe sla-urgent no cartão).
const SLA: Record<'verde' | 'ambar' | 'vermelho', { tom: 'ok' | 'atencao' | 'critico'; selo: string }> = {
  verde:    { tom: 'ok', selo: '' },
  ambar:    { tom: 'atencao', selo: pilulaStatus('atencao', 'vence') },
  vermelho: { tom: 'critico', selo: pilulaStatus('critico', 'vencida') },
};

function renderCard(l: KanbanCard): string {
  const nome = l.name ?? 'Sem nome';
  const phone = formatPhoneBR(l.phone);
  const sla = SLA[l.seloSla] ?? SLA.verde;
  return cartaoKanban({
    classe: `kanban-card${l.seloSla === 'vermelho' ? ' sla-urgent' : ''}`,
    dados: { 'lead-id': l.id },
    titulo: nome,
    href: `/dashboard/leads/${l.id}`,
    tom: sla.tom,
    direita: timeAgo(l.updated_at),
    metaHtml: `<span>${escapeHtml(phone)}</span>${sla.selo}`,
    dica: `${nome} · ${phone}`,
  });
}

export function renderKanbanPage(grupos: Record<string, KanbanCard[]>, user?: DashUser): string {
  const colunas = ORDEM_ETAPAS.map((etapa) => {
    const cards = grupos[etapa] ?? [];
    return colunaKanban({
      titulo: etapaLabel(etapa),
      contagem: cards.length,
      cor: corEtapa(etapa),
      classeColuna: 'kanban-col',
      dadosColuna: { etapa },
      classeLista: 'kanban-list',
      dados: { etapa },
      cartoesHtml: cards.map(renderCard).join(''),
      vazio: 'vazio',
    });
  }).join('');

  const total = ORDEM_ETAPAS.reduce((s, e) => s + (grupos[e]?.length ?? 0), 0);
  const cabecalho = cabecalhoPagina({
    trilha: [{ rotulo: 'Comercial' }, { rotulo: 'Funil' }],
    titulo: 'Funil (Kanban)',
    subtitulo: `${total} lead(s) no funil. Arraste os cartões entre as colunas. Os que pulsam em vermelho precisam de ação.`,
    acoesHtml: `<div class="cc-chips">${chip({ rotulo: 'Conversas', href: '/dashboard/leads/conversas' })}${chip({ rotulo: 'Lista', href: '/dashboard/leads' })}${chip({ rotulo: 'Kanban', href: '/dashboard/leads/kanban', ativo: true })}</div>`,
  });

  const body = `
    <div class="cc-root cc-funil">
      ${cabecalho}
      <div class="cc-kb kanban-board">
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
      .cc-funil .cc-kb-col{flex-basis:220px}
      .cc-funil .cc-kb-card-m .cc-pill{padding:1px 7px;font-size:10.5px}
      .cc-funil .sortable-ghost{opacity:.4}
    </style>

    <script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/Sortable.min.js"
            integrity="sha384-HZZ/fukV+9G8gwTNjN7zQDG0Sp7MsZy5DDN6VfY3Be7V9dvQpEpR2jF2HlyFUUjU"
            crossorigin="anonymous"></script>
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

  return renderLayout({ active: 'kanban', title: 'Funil (Kanban)', body, user, dark: temaDaTela(user, 'claro') === 'escuro', largo: true });
}
