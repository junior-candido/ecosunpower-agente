// src/modules/dashboard/ui/componentes.ts
// Componentes do design system do Command Center (fase A).
//
// Funções PURAS que devolvem HTML (string). Convenção:
//   - campo de texto comum (titulo, rotulo, detalhe…) → sempre ESCAPADO aqui;
//   - campo terminado em `Html` (corpoHtml, acoesHtml, filtrosHtml) → HTML
//     confiável montado pelo próprio código (ex.: saída de outro componente).
// Sem dado → "—" (regra do Junior: nunca número inventado).
// Classes com prefixo `cc-` (CSS em ./estilo.ts) pra não colidir com as telas antigas.

import { escapeHtml, fmtNumero, fmtCompacto, hrefSeguro, temNumero, SEM_DADO } from './html.js';
import type { NomeIcone } from './icones.js';

// ---------------------------------------------------------------------------
// Estados (Central de Atenção + status de usina)
// ---------------------------------------------------------------------------

export type Tom =
  | 'critico' | 'atencao' | 'acompanhar' | 'oportunidade' | 'info'
  | 'normal' | 'sem_dado';

export const TONS: Record<Tom, { classe: string; ponto: string; rotulo: string; emoji: string }> = {
  critico:      { classe: 'cc-s-crit',  ponto: 'cc-d-crit',  rotulo: 'Crítico',      emoji: '🔴' },
  atencao:      { classe: 'cc-s-warn',  ponto: 'cc-d-warn',  rotulo: 'Atenção',      emoji: '🟠' },
  acompanhar:   { classe: 'cc-s-watch', ponto: 'cc-d-watch', rotulo: 'Acompanhar',   emoji: '🟡' },
  oportunidade: { classe: 'cc-s-ok',    ponto: 'cc-d-ok',    rotulo: 'Oportunidade', emoji: '🟢' },
  info:         { classe: 'cc-s-info',  ponto: 'cc-d-info',  rotulo: 'Info',         emoji: '🔵' },
  normal:       { classe: 'cc-s-ok',    ponto: 'cc-d-ok',    rotulo: 'Normal',       emoji: '🟢' },
  sem_dado:     { classe: 'cc-s-off',   ponto: 'cc-d-off',   rotulo: 'Sem dado',     emoji: '⚪' },
};

/** Pílula de status: bolinha colorida + rótulo. */
export function pilulaStatus(tom: Tom, texto?: string): string {
  const t = TONS[tom];
  return `<span class="cc-pill ${t.classe}" title="${t.emoji} ${escapeHtml(t.rotulo)}">${escapeHtml(texto ?? t.rotulo)}</span>`;
}

/** Só a bolinha de status. */
export function pontoStatus(tom: Tom): string {
  return `<span class="cc-dot ${TONS[tom].ponto}" aria-hidden="true"></span>`;
}

// ---------------------------------------------------------------------------
// Ícone (sprite em ./icones.ts)
// ---------------------------------------------------------------------------

export function icone(nome: NomeIcone, tamanho?: 'sm' | 'xs'): string {
  const cls = tamanho ? ` cc-i-${tamanho}` : '';
  return `<svg class="cc-i${cls}" aria-hidden="true"><use href="#cc-i-${nome}"/></svg>`;
}

// ---------------------------------------------------------------------------
// KPI
// ---------------------------------------------------------------------------

export interface KpiInput {
  rotulo: string;
  valor: number | null | undefined;
  casas?: number;
  unidade?: string;         // "kW", "MWh"
  prefixo?: string;         // "R$"
  compacto?: boolean;       // 284.800 → 284,8 mil
  detalhe?: string;         // linha de baixo (texto simples)
  tendencia?: { texto: string; direcao: 'sobe' | 'desce' };
  destaque?: boolean;       // número em dourado (o KPI principal)
  href?: string;            // card clicável → drill-down
  semDadoTexto?: string;    // padrão "sem dado"; ex.: "em construção"
}

export function kpiCard(k: KpiInput): string {
  const tem = temNumero(k.valor);
  let valorHtml: string;
  if (!tem) {
    valorHtml = SEM_DADO;
  } else if (k.compacto) {
    const c = fmtCompacto(k.valor);
    valorHtml = `${k.prefixo ? `<small class="cc-pre">${escapeHtml(k.prefixo)}</small>` : ''}${escapeHtml(c.numero)}`
      + `${c.sufixo ? `<small>${escapeHtml(c.sufixo)}</small>` : ''}${k.unidade ? `<small>${escapeHtml(k.unidade)}</small>` : ''}`;
  } else {
    valorHtml = `${k.prefixo ? `<small class="cc-pre">${escapeHtml(k.prefixo)}</small>` : ''}${escapeHtml(fmtNumero(k.valor, k.casas ?? 0))}`
      + `${k.unidade ? `<small>${escapeHtml(k.unidade)}</small>` : ''}`;
  }

  let linha = '';
  if (!tem) {
    linha = `<span class="cc-faint">${escapeHtml(k.semDadoTexto ?? 'sem dado')}</span>`;
  } else {
    const tend = k.tendencia
      ? `<span class="${k.tendencia.direcao === 'sobe' ? 'cc-up' : 'cc-dn'}">${escapeHtml(k.tendencia.texto)}</span> `
      : '';
    linha = `${tend}${escapeHtml(k.detalhe ?? '')}`;
  }

  const classes = `cc-kpi${k.destaque && tem ? ' cc-kpi-hl' : ''}${tem ? '' : ' cc-kpi-vazio'}`;
  const inner = `<div class="cc-lbl">${escapeHtml(k.rotulo)}</div><div class="cc-val">${valorHtml}</div><div class="cc-dl">${linha || '&nbsp;'}</div>`;
  const href = hrefSeguro(k.href);
  return href
    ? `<a class="${classes} cc-clk" href="${escapeHtml(href)}">${inner}</a>`
    : `<div class="${classes}">${inner}</div>`;
}

/** Faixa de KPIs lado a lado (stat strip), como no topo do protótipo. */
export function faixaKpis(kpis: KpiInput[], opts: { classe?: string } = {}): string {
  return `<section class="cc-kstrip${opts.classe ? ` ${escapeHtml(opts.classe)}` : ''}" style="--n:${kpis.length}">${kpis.map(kpiCard).join('')}</section>`;
}

// ---------------------------------------------------------------------------
// Cartão de seção (panel)
// ---------------------------------------------------------------------------

export interface CartaoSecaoInput {
  titulo: string;
  dica?: string;
  acoesHtml?: string;
  corpoHtml: string;
  classe?: string;
  id?: string;
}

export function cartaoSecao(c: CartaoSecaoInput): string {
  return `<section class="cc-panel${c.classe ? ` ${escapeHtml(c.classe)}` : ''}"${c.id ? ` id="${escapeHtml(c.id)}"` : ''}>
  <div class="cc-ph"><h3>${escapeHtml(c.titulo)}</h3>${c.dica ? `<span class="cc-hint">${escapeHtml(c.dica)}</span>` : ''}<span class="cc-sp"></span>${c.acoesHtml ?? ''}</div>
  ${c.corpoHtml}
</section>`;
}

// ---------------------------------------------------------------------------
// Tabela
// ---------------------------------------------------------------------------

export type Celula = string | number | null | undefined | { html: string };

export interface TabelaInput {
  colunas: Array<{ titulo: string; alinhar?: 'dir'; num?: boolean; casas?: number }>;
  linhas: Celula[][];
  hrefs?: Array<string | null | undefined>;
  vazio?: string;
}

function celulaHtml(c: Celula, casas: number | undefined): string {
  if (c === null || c === undefined) return SEM_DADO;
  if (typeof c === 'number') return escapeHtml(fmtNumero(c, casas ?? (Number.isInteger(c) ? 0 : 1)));
  if (typeof c === 'string') return escapeHtml(c);
  return c.html;
}

export function tabela(t: TabelaInput): string {
  if (t.linhas.length === 0) {
    return estadoVazio({ tipo: 'vazio', titulo: t.vazio ?? 'Nada por aqui ainda' });
  }
  const th = t.colunas
    .map((c) => `<th${c.alinhar === 'dir' ? ' class="cc-r"' : ''}>${escapeHtml(c.titulo)}</th>`)
    .join('');
  const tr = t.linhas.map((linha, i) => {
    const href = hrefSeguro(t.hrefs?.[i] ?? null);
    const tds = linha.map((cel, j) => {
      const col = t.colunas[j];
      const cls = [col?.alinhar === 'dir' ? 'cc-r' : '', col?.num ? 'cc-n' : ''].filter(Boolean).join(' ');
      return `<td${cls ? ` class="${cls}"` : ''}>${celulaHtml(cel, col?.casas)}</td>`;
    }).join('');
    return href
      ? `<tr class="cc-tr-link" data-href="${escapeHtml(href)}" onclick="location.href=this.dataset.href">${tds}</tr>`
      : `<tr>${tds}</tr>`;
  }).join('');
  return `<div class="cc-tbl-wrap"><table class="cc-tbl"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}

// ---------------------------------------------------------------------------
// Selo (badge de contagem — usado no menu)
// ---------------------------------------------------------------------------

export type TomSelo = 'neutro' | 'critico' | 'dourado';

export function selo(valor: number | string | null | undefined, tom: TomSelo = 'neutro'): string {
  if (valor === null || valor === undefined || valor === 0 || valor === '') return '';
  const cls = tom === 'critico' ? ' cc-bdg-r' : tom === 'dourado' ? ' cc-bdg-a' : '';
  const txt = typeof valor === 'number' ? fmtNumero(valor) : valor;
  return `<span class="cc-bdg${cls}">${escapeHtml(txt)}</span>`;
}

// ---------------------------------------------------------------------------
// Sparkline (SVG inline — sem JavaScript)
// ---------------------------------------------------------------------------

const COR_OK = /^#[0-9a-f]{3,8}$/i;
let sparkSeq = 0;

export function sparkline(
  valores: Array<number | null | undefined>,
  opts: { cor?: string; largura?: number; altura?: number } = {},
): string {
  const pts = valores.filter(temNumero);
  if (pts.length < 2) {
    return `<div class="cc-spark cc-spark-vazio">sem dado</div>`;
  }
  const W = opts.largura ?? 200;
  const H = opts.altura ?? 40;
  const p = 3;
  const cor = opts.cor && COR_OK.test(opts.cor) ? opts.cor : '#fbbf24';
  let mn = Math.min(...pts);
  let mx = Math.max(...pts);
  if (mx === mn) { mx = mn + 1; mn = mn - 1; }
  const coords = pts.map((y, i) => [
    p + ((W - 2 * p) * i) / (pts.length - 1),
    H - p - ((H - 2 * p) * (y - mn)) / (mx - mn),
  ]);
  const d = coords.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' ');
  const id = `ccsg${(sparkSeq = (sparkSeq + 1) % 1_000_000)}`;
  return `<svg class="cc-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">`
    + `<defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${cor}" stop-opacity=".28"/><stop offset="1" stop-color="${cor}" stop-opacity="0"/></linearGradient></defs>`
    + `<path d="${d} L${W - p} ${H} L${p} ${H} Z" fill="url(#${id})"/>`
    + `<path d="${d}" fill="none" stroke="${cor}" stroke-width="1.8" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`
    + `</svg>`;
}

// ---------------------------------------------------------------------------
// Estado vazio (inclui o "em construção" explícito da fase A)
// ---------------------------------------------------------------------------

export interface EstadoVazioInput {
  tipo?: 'construcao' | 'vazio' | 'sem_dado';
  titulo?: string;
  texto?: string;
  icone?: NomeIcone;
  compacto?: boolean;
}

export function estadoVazio(e: EstadoVazioInput = {}): string {
  const tipo = e.tipo ?? 'vazio';
  const titulo = e.titulo
    ?? (tipo === 'construcao' ? 'Em construção — próxima entrega' : tipo === 'sem_dado' ? 'Sem dado' : 'Nada por aqui ainda');
  const ic = e.icone ?? (tipo === 'construcao' ? 'hammer' : tipo === 'sem_dado' ? 'wifi-off' : 'check');
  return `<div class="cc-empty cc-empty-${tipo}${e.compacto ? ' cc-empty-sm' : ''}">
  <span class="cc-empty-ic">${icone(ic, 'sm')}</span>
  <div><b>${escapeHtml(titulo)}</b>${e.texto ? `<p>${escapeHtml(e.texto)}</p>` : ''}</div>
</div>`;
}

// ---------------------------------------------------------------------------
// Cabeçalho de página: trilha (breadcrumb) + título + filtros globais + ações
// ---------------------------------------------------------------------------

export interface CabecalhoInput {
  titulo: string;
  subtitulo?: string;
  trilha?: Array<{ rotulo: string; href?: string }>;
  aoVivo?: string;          // "domingo, 27 de setembro · atualizado às 11:42"
  seloHtml?: string;        // ao lado do título
  filtrosHtml?: string;     // slot dos filtros globais
  acoesHtml?: string;       // botões (Modo TV, sino…)
}

export function cabecalhoPagina(c: CabecalhoInput): string {
  const trilha = c.trilha && c.trilha.length
    ? `<nav class="cc-crumb" aria-label="Você está em">${c.trilha.map((t, i) => {
      const href = hrefSeguro(t.href);
      const ultimo = i === c.trilha!.length - 1;
      const item = href && !ultimo
        ? `<a href="${escapeHtml(href)}">${escapeHtml(t.rotulo)}</a>`
        : `<span${ultimo ? ' class="cc-cur"' : ''}>${escapeHtml(t.rotulo)}</span>`;
      return i ? `${icone('chev', 'xs')}${item}` : item;
    }).join('')}</nav>`
    : '';
  const eyebrow = c.aoVivo
    ? `<div class="cc-eyebrow"><span class="cc-live">Ao vivo</span><span>${escapeHtml(c.aoVivo)}</span></div>`
    : '';
  const ferramentas = c.filtrosHtml || c.acoesHtml
    ? `<div class="cc-tools">${c.filtrosHtml ?? ''}${c.acoesHtml ?? ''}</div>`
    : '';
  return `<div class="cc-top">
  <div class="cc-ttl">
    ${trilha}${eyebrow}
    <div class="cc-row cc-row-wrap"><h1>${escapeHtml(c.titulo)}</h1>${c.seloHtml ?? ''}</div>
    ${c.subtitulo ? `<p class="cc-subt">${escapeHtml(c.subtitulo)}</p>` : ''}
  </div>
  ${ferramentas}
</div>`;
}

/** Filtro global (visual de "select"). Na fase A é só leitura: mostra o recorte real dos dados. */
export function filtroGlobal(rotulo: string, valor: string, ic?: NomeIcone): string {
  return `<span class="cc-sel">${ic ? icone(ic, 'sm') : ''}<em>${escapeHtml(rotulo)}</em> ${escapeHtml(valor)}</span>`;
}
