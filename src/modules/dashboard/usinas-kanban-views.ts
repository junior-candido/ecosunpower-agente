// usinas-kanban-views.ts
// Quadro de Obras: colunas por etapa, cards arrastáveis (SortableJS via CDN).
// Arrastar um card pra outra coluna dispara POST /dashboard/usinas/:id/set-etapa-obra.
//
// Renovação do miolo, R15 (28/09/2026): colunas e cartões no padrão do Command
// Center (ui/kanban.ts), tema escuro (D4), sem Tailwind. Faixa "Pipeline
// técnico" com a contagem por etapa que o quadro já agrupa (+ média de dias na
// etapa, feita com o mesmo número que o cartão já mostrava). Cartão com trilha
// de etapas em miniatura e "dias na etapa" em atenção quando passa da média da
// etapa (nenhum prazo novo — prazo é da fase F).
// O que os scripts procuram continua igual: lista `.kanban-list` com data-etapa
// + data-ordem, cartão `.kanban-card` com data-usina-id/data-apelido/data-busca,
// `.kanban-check`, `.kanban-info`, `.kanban-count`, `.sel-todas`, os ids do
// painel de contato (contato-…) e da barra de lote (lote-…), os 3 fetch e o CDN
// pinado do Sortable. Celular: colunas com rolagem horizontal e encaixe (D7
// ainda não decidida → sem "Mover para…" no cartão) e o painel de contato em
// tela cheia.

import { renderLayout, escapeHtml } from './views.js';
import type { DashUser } from './permissions.js';
import { ETAPAS_USINA, ordemEtapa, type EtapaUsinaSlug } from '../usina-etapas.js';
import { agruparUsinasPorEtapaObra } from '../monitoring/usinas-queries.js';
import { cabecalhoPagina, cartaoSecao, faixaKpis, chip, botao, icone, estadoVazio, trilhaEtapas } from './ui/componentes.js';
import { colunaKanban, cartaoKanban } from './ui/kanban.js';
import { fmtNumero } from './ui/html.js';
import { temaDaTela } from './ui/tema.js';

export interface UsinaKanbanCard {
  id: string;
  apelido: string | null;
  cidade: string | null;
  potencia_kwp: number | null;
  etapa_obra: string;
  etapa_obra_updated_at: string | null;
}

/** Cor (token) de cada etapa da obra — a mesma das pílulas (ui/etapas.ts). */
const COR_ETAPA: Record<EtapaUsinaSlug, string> = {
  projeto:     'var(--cc-info)',
  aprovacao:   'var(--cc-et-qualificando)',
  instalacao:  'var(--cc-warn)',
  vistoria:    'var(--cc-watch)',
  homologacao: 'var(--cc-et-qualificado)',
  operacao:    'var(--cc-ok)',
};

const ULTIMA_ETAPA = ETAPAS_USINA[ETAPAS_USINA.length - 1].slug;
const ROTULOS_ETAPAS = ETAPAS_USINA.map((e) => e.label);

/** Dias inteiros desde a última troca de etapa (null = sem data). */
function diasNaEtapa(updatedAt: string | null): number | null {
  if (!updatedAt) return null;
  const t = new Date(updatedAt).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

function textoDias(d: number | null): string {
  if (d === null) return '—';
  return d === 0 ? 'hoje' : `${d} d`;
}

/** Casas decimais do kWp: as que o número tem (até 2) — 6,3 · 10,08 · 75. */
function casasKwp(v: number): number {
  if (Number.isInteger(v)) return 0;
  return Math.abs(v * 10 - Math.round(v * 10)) < 1e-9 ? 1 : 2;
}

/** Média (arredondada) dos dias na etapa das obras que têm data; null se nenhuma. */
function mediaDias(cards: UsinaKanbanCard[]): number | null {
  const ds = cards.map((c) => diasNaEtapa(c.etapa_obra_updated_at)).filter((d): d is number => d !== null);
  if (ds.length === 0) return null;
  return Math.round(ds.reduce((s, d) => s + d, 0) / ds.length);
}

const CSS_OBRAS = `
.cc-ob .cc-panel{margin-bottom:16px}
.cc-ob .cc-ob-pipe .cc-kstrip{border:0;border-radius:0;background:transparent}
.cc-ob-busca{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 10px;border:1px solid var(--cc-line-2);border-radius:10px;background:var(--cc-surface-2);color:var(--cc-muted)}
.cc-ob-busca input{border:0;background:transparent;color:var(--cc-text);font:inherit;font-size:13px;width:180px;min-width:0;outline:none}
.cc-ob-busca input::placeholder{color:var(--cc-faint)}
.cc-ob-busca:focus-within{border-color:var(--cc-gold);box-shadow:0 0 0 3px var(--cc-gold-soft)}
#btn-selecionar.cc-ob-on{background:var(--cc-gold-soft);border-color:var(--cc-gold);color:var(--cc-gold-2)}
.cc-ob .cc-kb-col{--kb:var(--cc-off)}
@media (min-width:761px){.cc-ob .cc-kb{gap:10px}.cc-ob .cc-kb-col{flex:1 1 0;min-width:158px}}
.cc-ob .cc-kb-card-m{display:block}
.cc-ob-l1{display:flex;align-items:center;gap:6px;min-width:0}
.cc-ob-loc{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cc-ob-dias{flex:none;font-family:var(--cc-f-num);font-size:11px;color:var(--cc-faint)}
.cc-ob-dias.cc-ob-parada{color:var(--cc-warn);font-weight:700}
.cc-ob-info{flex:none;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:1px solid var(--cc-line);border-radius:8px;background:transparent;color:var(--cc-muted);cursor:pointer;padding:0}
.cc-ob-info:hover{color:var(--cc-gold-2);border-color:var(--cc-gold)}
.cc-ob-info svg{pointer-events:none}
.cc-ob .kanban-check{display:none;flex:none;margin:0;accent-color:var(--cc-gold);width:16px;height:16px}
.modo-selecao .cc-ob .kanban-check{display:inline-block}
.cc-ob .sel-todas{display:none;border:0;background:transparent;color:var(--cc-gold-2);font-size:11px;cursor:pointer;padding:0 2px}
.modo-selecao .cc-ob .sel-todas{display:inline}
.cc-ob-l2{display:flex;align-items:center;gap:8px;margin-top:6px}
.cc-ob-trl{flex:1;min-width:0}
.cc-ob-trl .cc-trl li{padding-top:0;height:9px;font-size:0}
.cc-ob-trl .cc-trl li::before{top:0;width:7px;height:7px;border-width:1px}
.cc-ob-trl .cc-trl li::after{top:3px;height:1.5px}
.cc-ob-trl .cc-trl li.cc-trl-atual::before{box-shadow:0 0 0 2px var(--cc-gold-soft)}
.cc-ob-trl .cc-trl span{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.cc-ob .sortable-ghost{opacity:.4}
.cc-ob .hidden,.cc-ob-overlay.hidden,.cc-ob-drawer.hidden{display:none!important}
.cc-ob-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:60}
.cc-ob-drawer{position:fixed;top:0;right:0;height:100%;width:340px;max-width:92vw;z-index:61;display:flex;flex-direction:column;background:var(--cc-surface);border-left:1px solid var(--cc-line-2);box-shadow:-12px 0 32px rgba(0,0,0,.35)}
.cc-ob-drawer-h{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--cc-line)}
.cc-ob-drawer-h h2{flex:1;min-width:0;font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cc-ob-fechar{border:0;background:transparent;color:var(--cc-muted);font-size:26px;line-height:1;cursor:pointer;padding:0 4px}
.cc-ob-fechar:hover{color:var(--cc-text)}
.cc-ob-corpo{padding:16px;overflow-y:auto;flex:1;font-size:13.5px;color:var(--cc-text-2)}
.cc-ob-campo{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--cc-line)}
.cc-ob-rot{flex:none;width:72px;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--cc-faint);font-weight:600}
.cc-ob-val{flex:1;min-width:0;overflow-wrap:anywhere;color:var(--cc-text)}
.cc-ob-nada{color:var(--cc-muted);font-style:italic;padding:8px 0}
.cc-ob-link{display:inline-flex;margin-top:16px;color:var(--cc-gold-2);font-weight:600}
.cc-ob-link:hover{text-decoration:underline}
.cc-ob-erro{color:var(--cc-crit)}
.cc-ob-lote.hidden{display:none!important}
.cc-ob-lote{position:fixed;left:0;right:0;bottom:0;z-index:55;display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:10px 16px;background:var(--cc-surface-3);border-top:1px solid var(--cc-line-2);box-shadow:0 -8px 24px rgba(0,0,0,.35)}
.cc-ob-lote-n{font-weight:600;color:var(--cc-text)}
.cc-ob-lote select{height:36px;padding:0 10px;border:1px solid var(--cc-line-2);border-radius:10px;background:var(--cc-surface-2);color:var(--cc-text);font:inherit;font-size:14px;max-width:100%}
@media (max-width:760px){
  .cc-ob-busca{width:100%}
  .cc-ob-busca input{width:100%;font-size:16px}
  .cc-ob-drawer{width:100%;max-width:100%;border-left:0}
  .cc-ob-lote select{flex:1 1 100%;font-size:16px;height:44px}
}
`;

function renderCard(u: UsinaKanbanCard, media: number | null): string {
  const apelido = u.apelido ?? 'Sem apelido';
  const cidade = u.cidade ?? '—';
  const kwp = u.potencia_kwp != null ? `${fmtNumero(u.potencia_kwp, casasKwp(u.potencia_kwp))} kWp` : '—';
  const dias = diasNaEtapa(u.etapa_obra_updated_at);
  // "Parada": passou da média da etapa (a mesma do Pipeline técnico). A última
  // etapa (Operação) não é obra parada. Nenhum prazo novo.
  const parada = dias !== null && media !== null && dias > media && u.etapa_obra !== ULTIMA_ETAPA;
  const id = escapeHtml(u.id);
  const indice = ETAPAS_USINA.findIndex((e) => e.slug === u.etapa_obra);
  const meta = `<div class="cc-ob-l1">`
    + `<input type="checkbox" title="Selecionar" class="kanban-check" data-usina-id="${id}">`
    + `<span class="cc-ob-loc">${escapeHtml(cidade)} · ${escapeHtml(kwp)}</span>`
    + `<span class="cc-ob-dias${parada ? ' cc-ob-parada' : ''}" title="dias nesta etapa">${escapeHtml(textoDias(dias))}</span>`
    + `</div>`
    + `<div class="cc-ob-l2"><div class="cc-ob-trl">${trilhaEtapas(ROTULOS_ETAPAS, indice)}</div>`
    + `<button type="button" draggable="false" title="Ver contato" aria-label="Ver contato" class="cc-ob-info kanban-info" data-usina-id="${id}" data-apelido="${escapeHtml(apelido)}">${icone('contact', 'xs')}</button>`
    + `</div>`;
  return cartaoKanban({
    classe: 'kanban-card',
    dados: { 'usina-id': u.id, apelido, busca: `${u.apelido ?? ''} ${u.cidade ?? ''}`.toLowerCase() },
    titulo: apelido,
    href: `/dashboard/monitoramento/${u.id}`,
    tom: parada ? 'atencao' : undefined,
    metaHtml: meta,
    dica: `${apelido} · ${cidade}`,
  });
}

/** Coluna do quadro: a de ui/kanban.ts + os ganchos do script (contagem e "todas"). */
function colunaObra(etapa: (typeof ETAPAS_USINA)[number], cards: UsinaKanbanCard[], media: number | null): string {
  const html = colunaKanban({
    titulo: etapa.label,
    contagem: cards.length,
    cor: COR_ETAPA[etapa.slug],
    classeColuna: 'kanban-col',
    dadosColuna: { etapa: etapa.slug },
    classeLista: 'kanban-list',
    dados: { etapa: etapa.slug, ordem: ordemEtapa(etapa.slug) },
    cartoesHtml: cards.map((c) => renderCard(c, media)).join(''),
    vazio: 'vazio',
  });
  const todas = `<button type="button" class="sel-todas" data-etapa="${escapeHtml(etapa.slug)}">todas</button>`;
  return html.replace('<span class="cc-kb-n">', `${todas}<span class="cc-kb-n kanban-count">`);
}

export function renderUsinasKanbanPage(usinas: UsinaKanbanCard[], user?: DashUser): string {
  const grupos = agruparUsinasPorEtapaObra(usinas);
  const medias = Object.fromEntries(ETAPAS_USINA.map((e) => [e.slug, mediaDias(grupos[e.slug])])) as Record<EtapaUsinaSlug, number | null>;

  const noQuadro = ETAPAS_USINA.flatMap((e) => grupos[e.slug]);
  const kwpTotal = noQuadro.reduce((s, u) => s + (u.potencia_kwp ?? 0), 0);

  const pipeline = cartaoSecao({
    titulo: 'Pipeline técnico',
    dica: 'quantas obras em cada etapa · tempo médio na etapa',
    classe: 'cc-ob-pipe',
    corpoHtml: faixaKpis(ETAPAS_USINA.map((e) => {
      const n = grupos[e.slug].length;
      const m = medias[e.slug];
      return {
        rotulo: e.label,
        valor: n,
        detalhe: n === 0 ? 'nenhuma obra' : m === null ? 'sem data' : `média ${m} ${m === 1 ? 'dia' : 'dias'}`,
      };
    })),
  });

  const colunas = ETAPAS_USINA.map((e) => colunaObra(e, grupos[e.slug], medias[e.slug])).join('');

  const cabecalho = cabecalhoPagina({
    trilha: [{ rotulo: 'Instalações' }, { rotulo: 'Quadro de Obras' }],
    titulo: 'Quadro de Obras',
    subtitulo: `${noQuadro.length} obra(s) · ${fmtNumero(kwpTotal, 1)} kWp. Arraste o cartão para mudar de etapa. Em laranja: parada há mais tempo que a média da etapa. Atualiza a cada 60s.`,
    filtrosHtml: `<label class="cc-ob-busca">${icone('search', 'sm')}<input id="filtro-kanban" type="text" placeholder="Buscar nome ou cidade…" aria-label="Buscar nome ou cidade"></label>`,
    acoesHtml: `<div class="cc-chips">${chip({ rotulo: 'Lista', href: '/dashboard/monitoramento' })}${chip({ rotulo: 'Quadro', href: '/dashboard/usinas/kanban', ativo: true })}</div>`
      + botao({ rotulo: 'Selecionar', icone: 'check', attrs: { id: 'btn-selecionar' } })
      + botao({ rotulo: 'Vincular usinas sem cliente', href: '/dashboard/usinas/vincular', tom: 'ouro', icone: 'plug' }),
  });

  const vazio = noQuadro.length === 0
    ? estadoVazio({ titulo: 'Nenhuma obra no quadro', texto: 'As usinas aparecem aqui conforme a etapa da obra.', compacto: true })
    : '';

  const body = `
    <div class="cc-root cc-ob">
      ${cabecalho}
      ${pipeline}
      ${vazio}
      <div class="cc-kb kanban-board">
        ${colunas}
      </div>

      <!-- Painel de contato: preenchido por fetch ao clicar no botão de contato do cartão -->
      <div id="contato-overlay" class="hidden cc-ob-overlay"></div>
      <aside id="contato-drawer" class="hidden cc-root cc-ob-drawer" aria-labelledby="contato-titulo">
        <div class="cc-ob-drawer-h">
          <h2 id="contato-titulo">Usina</h2>
          <button id="contato-fechar" type="button" title="Fechar" aria-label="Fechar" class="cc-ob-fechar">&times;</button>
        </div>
        <div id="contato-corpo" class="cc-ob-corpo"></div>
      </aside>

      <!-- Barra de mover em lote (aparece no modo seleção com 1+ marcada) -->
      <div id="lote-bar" class="hidden cc-ob-lote">
        <span id="lote-count" class="cc-ob-lote-n">0 selecionadas</span>
        <select id="lote-etapa" aria-label="Etapa de destino">
          <option value="">Mover para…</option>
          ${ETAPAS_USINA.map((e) => `<option value="${escapeHtml(e.slug)}">${escapeHtml(e.label)}</option>`).join('')}
        </select>
        ${botao({ rotulo: 'Mover', attrs: { id: 'lote-mover' } })}
        ${botao({ rotulo: 'Limpar', tom: 'fantasma', attrs: { id: 'lote-limpar' } })}
      </div>
    </div>
    <style>${CSS_OBRAS}</style>

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
            filter: '.kanban-info, .kanban-check', // clicar no contato/caixinha não arrasta
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
        // O <main> é um contexto de empilhamento (z-index 0): dentro dele o
        // painel ficaria atrás da barra de cima no celular. Sobe o painel e o
        // fundo escuro para a casca, pra cobrir a tela inteira.
        var casca = document.querySelector('.cc-shell') || document.body;
        casca.appendChild(overlay);
        casca.appendChild(drawer);

        // Anti-XSS: todo dado vindo do servidor (nome/email/etc.) passa por aqui
        // antes de ir pro innerHTML. Cobre texto e atributo com aspas duplas.
        function esc(s) {
          return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
          });
        }

        function campo(rotulo, valor) {
          var copiavel = valor && valor !== 'não cadastrado';
          return '<div class="cc-ob-campo">' +
                   '<span class="cc-ob-rot">' + rotulo + '</span>' +
                   '<span class="cc-ob-val">' + esc(valor) + '</span>' +
                   (copiavel
                     ? '<button type="button" class="contato-copiar cc-btn cc-btn-sm" data-valor="' + esc(valor) + '">copiar</button>'
                     : '') +
                 '</div>';
        }

        function preencher(c) {
          var h = '';
          if (c.cliente) {
            h += campo('Cliente', c.cliente.nome);
            h += campo('Telefone', c.cliente.telefone);
            h += campo('E-mail', c.cliente.email);
          } else {
            h += '<div class="cc-ob-nada">Cliente não cadastrado</div>';
          }
          h += '<div class="cc-ob-campo"><span class="cc-ob-rot">Local</span><span class="cc-ob-val">' + esc(c.localizacao) + '</span></div>';
          h += '<div class="cc-ob-campo"><span class="cc-ob-rot">Potência</span><span class="cc-ob-val">' + esc(c.potencia) + '</span></div>';
          h += '<div class="cc-ob-campo"><span class="cc-ob-rot">Etapa</span><span class="cc-ob-val">' + esc(c.etapa) + (c.diasNaEtapa ? ' · ' + esc(c.diasNaEtapa) : '') + '</span></div>';
          h += '<a href="' + esc(c.detalheUrl) + '" class="cc-ob-link">abrir detalhe completo →</a>';
          corpo.innerHTML = h;
        }

        function abrir(id, apelido) {
          titulo.textContent = apelido || 'Usina';
          corpo.innerHTML = '<div class="cc-ob-nada">carregando…</div>';
          overlay.classList.remove('hidden');
          drawer.classList.remove('hidden');
          fetch('/dashboard/usinas/' + id + '/contato')
            .then(function (res) { if (!res.ok) throw new Error(res.status); return res.json(); })
            .then(preencher)
            .catch(function () {
              corpo.innerHTML = '<div class="cc-ob-erro">Não foi possível carregar o contato.</div>';
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
        // Barra fixa fora do <main> (contexto de empilhamento), como o painel.
        (document.querySelector('.cc-shell') || document.body).appendChild(bar);

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
          btn.classList.toggle('cc-ob-on', ligado);
          btn.setAttribute('aria-pressed', ligado ? 'true' : 'false');
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

  return renderLayout({
    active: 'usinas_kanban', title: 'Quadro de Obras', body, user,
    tailwind: false, dark: temaDaTela(user, 'escuro') === 'escuro', largo: true,
  });
}
