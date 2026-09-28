// src/modules/dashboard/ui/kanban.ts
// Coluna e cartão de Kanban no padrão do Command Center (renovação do miolo,
// R1) — Funil de leads e Obras. O arrastar continua sendo do Sortable da tela:
// estas peças só DESENHAM e mantêm o que o script procura — a classe-gancho
// (ex.: "kanban-card", "kanban-list") e os data-* (ex.: data-lead-id,
// data-etapa) passados pelo chamador. CSS em estilo.ts (CSS_KANBAN).

import { escapeHtml, hrefSeguro, fmtNumero } from './html.js';

type Dados = Record<string, string | number | null | undefined>;

/** Só nomes simples (letras, números, hífen) viram data-*; valor escapado. */
function dadosHtml(d: Dados | undefined): string {
  if (!d) return '';
  return Object.entries(d)
    .filter(([k, v]) => /^[a-z][a-z0-9-]*$/.test(k) && v !== null && v !== undefined)
    .map(([k, v]) => ` data-${k}="${escapeHtml(String(v))}"`)
    .join('');
}

/** Classes-gancho vindas do chamador: só [a-z0-9-_ ] (nada de aspas). */
function classes(c: string | undefined): string {
  return (c ?? '').replace(/[^\w\s-]/g, '').trim();
}

export interface ColunaKanbanInput {
  titulo: string;
  contagem: number;
  /** Cor da coluna (token CSS, ex.: corEtapa('novo')). */
  cor?: string;
  /** Linha extra do cabeçalho (ex.: soma), texto simples. */
  subtitulo?: string;
  /** Classe e data-* da COLUNA (se o script usar). */
  classeColuna?: string;
  dadosColuna?: Dados;
  /** Classe e data-* da LISTA de cartões — é nela que o Sortable se prende. */
  classeLista?: string;
  dados?: Dados;
  cartoesHtml: string;
  vazio?: string;
}

export function colunaKanban(c: ColunaKanbanInput): string {
  const cor = c.cor && /^var\(--[\w-]+\)$|^#[0-9a-f]{3,8}$/i.test(c.cor) ? ` style="--kb:${c.cor}"` : '';
  const clsCol = classes(c.classeColuna);
  const clsLista = classes(c.classeLista);
  const corpo = c.cartoesHtml || `<p class="cc-kb-vazio">${escapeHtml(c.vazio ?? 'Nenhum por aqui')}</p>`;
  return `<section class="cc-kb-col${clsCol ? ` ${clsCol}` : ''}"${dadosHtml(c.dadosColuna)}${cor}>`
    + `<header class="cc-kb-h"><span class="cc-kb-cor" aria-hidden="true"></span><h3>${escapeHtml(c.titulo)}</h3>`
    + `<span class="cc-kb-n">${escapeHtml(fmtNumero(c.contagem))}</span>`
    + `${c.subtitulo ? `<small class="cc-kb-sub">${escapeHtml(c.subtitulo)}</small>` : ''}</header>`
    + `<div class="cc-kb-lista${clsLista ? ` ${clsLista}` : ''}"${dadosHtml(c.dados)}>${corpo}</div>`
    + `</section>`;
}

export interface CartaoKanbanInput {
  /** Classe-gancho que o Sortable usa (draggable: '.kanban-card'). */
  classe: string;
  dados?: Dados;
  titulo: string;
  href?: string | null;
  /** Borda lateral: prazo/SLA. */
  tom?: 'ok' | 'atencao' | 'critico';
  /** Texto à direita do título (ex.: "3d"), simples. */
  direita?: string;
  /** Linha(s) de baixo: HTML confiável (saída de componente). */
  metaHtml?: string;
  /** Tooltip (texto simples). */
  dica?: string;
}

export function cartaoKanban(k: CartaoKanbanInput): string {
  const tom = k.tom === 'critico' ? ' cc-kb-crit' : k.tom === 'atencao' ? ' cc-kb-warn' : k.tom === 'ok' ? ' cc-kb-ok' : '';
  const cls = classes(k.classe);
  const href = hrefSeguro(k.href);
  const titulo = href
    // href ANTES da classe: o teste antigo do arrastar (dashboard-kanban-arrasta)
    // procura exatamente `<a href="…" draggable="false"`.
    ? `<a href="${escapeHtml(href)}" draggable="false" class="cc-kb-card-t">${escapeHtml(k.titulo)}</a>`
    : `<span class="cc-kb-card-t">${escapeHtml(k.titulo)}</span>`;
  return `<div class="cc-kb-card${tom}${cls ? ` ${cls}` : ''}"${dadosHtml(k.dados)}${k.dica ? ` title="${escapeHtml(k.dica)}"` : ''}>`
    + `<div class="cc-kb-card-l">${titulo}${k.direita ? `<span class="cc-kb-card-d">${escapeHtml(k.direita)}</span>` : ''}</div>`
    + `${k.metaHtml ? `<div class="cc-kb-card-m">${k.metaHtml}</div>` : ''}`
    + `</div>`;
}
