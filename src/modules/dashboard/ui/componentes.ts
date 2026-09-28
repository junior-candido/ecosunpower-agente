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
  /**
   * Celular (renovação do miolo, R1): 'cartoes' vira cada linha num cartão
   * (rótulo à esquerda, valor à direita; a 1ª coluna é o título do cartão);
   * 'rolar' rola só a tabela, com a 1ª coluna fixa (tabelas técnicas largas).
   * Sem a opção a saída é IDÊNTICA à de antes.
   */
  mobile?: 'cartoes' | 'rolar';
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
  const cartoes = t.mobile === 'cartoes';
  const tr = t.linhas.map((linha, i) => {
    const href = hrefSeguro(t.hrefs?.[i] ?? null);
    const tds = linha.map((cel, j) => {
      const col = t.colunas[j];
      const cls = [col?.alinhar === 'dir' ? 'cc-r' : '', col?.num ? 'cc-n' : ''].filter(Boolean).join(' ');
      const rotulo = cartoes ? ` data-label="${escapeHtml(col?.titulo ?? '')}"` : '';
      return `<td${cls ? ` class="${cls}"` : ''}${rotulo}>${celulaHtml(cel, col?.casas)}</td>`;
    }).join('');
    return href
      ? `<tr class="cc-tr-link" data-href="${escapeHtml(href)}" onclick="location.href=this.dataset.href">${tds}</tr>`
      : `<tr>${tds}</tr>`;
  }).join('');
  const wrap = t.mobile === 'cartoes' ? 'cc-tbl-wrap cc-tbl-cartoes'
    : t.mobile === 'rolar' ? 'cc-tbl-wrap cc-tbl-rolar'
    : 'cc-tbl-wrap';
  return `<div class="${wrap}"><table class="cc-tbl"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
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
  <div><strong>${escapeHtml(titulo)}</strong>${e.texto ? `<p>${escapeHtml(e.texto)}</p>` : ''}</div>
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

// ===========================================================================
// Peças da RENOVAÇÃO DO MIOLO (R1, 28/09/2026). Mesma convenção: texto é
// escapado aqui; campo `…Html` recebe HTML confiável (saída de componente ou
// formulário montado pela própria tela).
// ===========================================================================

/** Nome de atributo aceito em `attrs`/`dados`: só letras, números e hífen. */
const NOME_ATTR = /^[a-z][a-z0-9-]*$/i;

function attrsHtml(attrs: Record<string, string | number | null | undefined> | undefined, prefixo = ''): string {
  if (!attrs) return '';
  return Object.entries(attrs)
    .filter(([k, v]) => NOME_ATTR.test(k) && v !== null && v !== undefined)
    .map(([k, v]) => ` ${prefixo}${k.toLowerCase()}="${escapeHtml(String(v))}"`)
    .join('');
}

/** Link interno, âncora (#secao) ou http(s). O resto (javascript:, data:) some. */
function hrefOuAncora(href: string | null | undefined): string | null {
  if (href && /^#[\w-]*$/.test(href.trim())) return href.trim();
  return hrefSeguro(href);
}

// ---------------------------------------------------------------------------
// Botão
// ---------------------------------------------------------------------------

export interface BotaoInput {
  rotulo: string;
  /** Com href → <a>. Sem href → <button> (tipo padrão "button"). */
  href?: string | null;
  tipo?: 'submit' | 'button';
  tom?: 'ouro' | 'normal' | 'critico' | 'fantasma';
  tamanho?: 'sm';
  icone?: NomeIcone;
  /** name/value do <button> (ex.: name="modo" value="atualizar"). */
  nome?: string;
  valor?: string;
  /** Atributos extras (onclick, title, disabled, form…) — valores escapados. */
  attrs?: Record<string, string | number | null | undefined>;
}

/** Um jeito só de fazer botão. A ação principal da tela é o ÚNICO `tom:'ouro'`. */
export function botao(b: BotaoInput): string {
  const cls = ['cc-btn',
    b.tom === 'ouro' ? 'cc-btn-gold' : b.tom === 'critico' ? 'cc-btn-crit' : b.tom === 'fantasma' ? 'cc-btn-ghost' : '',
    b.tamanho === 'sm' ? 'cc-btn-sm' : '',
  ].filter(Boolean).join(' ');
  const conteudo = `${b.icone ? icone(b.icone, 'sm') : ''}${escapeHtml(b.rotulo)}`;
  const extra = attrsHtml(b.attrs);
  if (b.href !== undefined && b.href !== null) {
    const href = hrefOuAncora(b.href);
    return href
      ? `<a class="${cls}" href="${escapeHtml(href)}"${extra}>${conteudo}</a>`
      : `<span class="${cls}"${extra}>${conteudo}</span>`;
  }
  const nome = b.nome ? ` name="${escapeHtml(b.nome)}"` : '';
  const valor = b.valor !== undefined ? ` value="${escapeHtml(b.valor)}"` : '';
  return `<button type="${b.tipo === 'submit' ? 'submit' : 'button'}" class="${cls}"${nome}${valor}${extra}>${conteudo}</button>`;
}

// ---------------------------------------------------------------------------
// Abas (links / âncoras — nunca rota nova)
// ---------------------------------------------------------------------------

export interface AbaItem { rotulo: string; href: string; ativo?: boolean; selo?: number | null }

export function abas(a: { itens: AbaItem[]; rotuloNav?: string }): string {
  const itens = a.itens.map((it) => {
    const href = hrefOuAncora(it.href) ?? '#';
    const on = it.ativo ? ' cc-aba-on' : '';
    return `<a class="cc-aba${on}" href="${escapeHtml(href)}"${it.ativo ? ' aria-current="page"' : ''}>${escapeHtml(it.rotulo)}${selo(it.selo ?? null)}</a>`;
  }).join('');
  return `<nav class="cc-abas" aria-label="${escapeHtml(a.rotuloNav ?? 'Seções')}">${itens}</nav>`;
}

// ---------------------------------------------------------------------------
// Chips de filtro (com contagem)
// ---------------------------------------------------------------------------

export interface ChipInput {
  rotulo: string;
  /** Contagem: 0 aparece ("0" é informação); null/undefined → sem número. */
  valor?: number | null;
  href?: string | null;
  ativo?: boolean;
  tom?: 'ok' | 'warn';
}

export function chip(c: ChipInput): string {
  const cls = ['cc-chip', c.ativo ? 'cc-chip-on' : '', c.tom === 'ok' ? 'cc-chip-ok' : c.tom === 'warn' ? 'cc-chip-warn' : '']
    .filter(Boolean).join(' ');
  const num = temNumero(c.valor) ? ` <b>${escapeHtml(fmtNumero(c.valor))}</b>` : '';
  const href = hrefSeguro(c.href);
  const dentro = `${escapeHtml(c.rotulo)}${num}`;
  return href
    ? `<a class="${cls}" href="${escapeHtml(href)}"${c.ativo ? ' aria-current="true"' : ''}>${dentro}</a>`
    : `<span class="${cls}">${dentro}</span>`;
}

/** Linha de chips (no celular rola na horizontal, numa linha só). */
export function chipsFiltro(chips: ChipInput[]): string {
  return `<div class="cc-chips cc-chips-rolar">${chips.map(chip).join('')}</div>`;
}

// ---------------------------------------------------------------------------
// Célula com título + linha de baixo (cliente · cidade)
// ---------------------------------------------------------------------------

export function celulaDupla(titulo: string | null | undefined, sub?: string | null, href?: string | null): string {
  const t = titulo && titulo.trim() ? escapeHtml(titulo) : SEM_DADO;
  const h = hrefSeguro(href);
  const topo = h ? `<a class="cc-dupla-t" href="${escapeHtml(h)}">${t}</a>` : `<span class="cc-dupla-t">${t}</span>`;
  const baixo = sub && sub.trim() ? `<span class="cc-dupla-s">${escapeHtml(sub)}</span>` : '';
  return `<div class="cc-dupla">${topo}${baixo}</div>`;
}

// ---------------------------------------------------------------------------
// Barra de progresso (cc-bar) — 0 a 100 %, "—" sem dado
// ---------------------------------------------------------------------------

export function barra(pct: number | null | undefined, tom: 'ok' | 'warn' | 'crit' | 'ouro' = 'ok'): string {
  if (!temNumero(pct)) return `<span class="cc-faint">${SEM_DADO}</span>`;
  const v = Math.round(Math.max(0, Math.min(100, pct)));
  const cls = tom === 'ok' ? 'cc-bar' : `cc-bar cc-bar-${tom}`;
  return `<div class="${cls}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v}"><i style="width:${v}%"></i></div>`;
}

// ---------------------------------------------------------------------------
// Aviso (?ok= / ?erro= depois de um POST)
// ---------------------------------------------------------------------------

export function aviso(a: { tom: 'ok' | 'erro' | 'info' | 'atencao'; texto: string }): string {
  const ic: Record<typeof a.tom, NomeIcone> = { ok: 'check', erro: 'alert', info: 'bell', atencao: 'alert' };
  return `<div class="cc-aviso cc-aviso-${a.tom}" role="${a.tom === 'erro' ? 'alert' : 'status'}">${icone(ic[a.tom], 'sm')}<span>${escapeHtml(a.texto)}</span></div>`;
}

// ---------------------------------------------------------------------------
// Paginação (mesmo limit/offset de hoje — quem monta a URL é o chamador)
// ---------------------------------------------------------------------------

export interface PaginacaoInput {
  pagina: number;
  totalPaginas: number;
  limite: number;
  /** Recebe o OFFSET da página de destino e devolve o href completo. */
  hrefDe: (offset: number) => string;
  /** Linha de contexto ("Mostrando 11–20 de 45"). */
  resumo?: string;
}

export function paginacao(p: PaginacaoInput): string {
  if (p.totalPaginas <= 1) return '';
  const ant = p.pagina > 1 ? hrefSeguro(p.hrefDe((p.pagina - 2) * p.limite)) : null;
  const prox = p.pagina < p.totalPaginas ? hrefSeguro(p.hrefDe(p.pagina * p.limite)) : null;
  const link = (href: string | null, rel: 'prev' | 'next', txt: string) => href
    ? `<a class="cc-btn cc-btn-sm" href="${escapeHtml(href)}" rel="${rel}">${txt}</a>`
    : `<span class="cc-btn cc-btn-sm cc-btn-off" aria-disabled="true">${txt}</span>`;
  return `<nav class="cc-pg" aria-label="Paginação">`
    + `<span class="cc-pg-info">${p.resumo ? `${escapeHtml(p.resumo)} · ` : ''}Página ${p.pagina} de ${p.totalPaginas}</span>`
    + `<span class="cc-sp"></span>${link(ant, 'prev', '← Anterior')}${link(prox, 'next', 'Próxima →')}</nav>`;
}

// ---------------------------------------------------------------------------
// Linha de lista ("vence nos próximos dias", "hoje em campo")
// ---------------------------------------------------------------------------

export interface LinhaListaInput {
  tom: Tom;
  titulo: string;
  meta?: string;
  direitaHtml?: string;
  href?: string | null;
}

export function linhaLista(l: LinhaListaInput): string {
  const dentro = `${pontoStatus(l.tom)}<div class="cc-li-txt"><strong>${escapeHtml(l.titulo)}</strong>${l.meta ? `<small>${escapeHtml(l.meta)}</small>` : ''}</div>${l.direitaHtml ? `<div class="cc-li-d">${l.direitaHtml}</div>` : ''}`;
  const href = hrefSeguro(l.href);
  return href
    ? `<a class="cc-li" href="${escapeHtml(href)}">${dentro}</a>`
    : `<div class="cc-li">${dentro}</div>`;
}

// ---------------------------------------------------------------------------
// "⋯ Mais ações" — <details> sem JavaScript que GUARDA os formulários de hoje
// ---------------------------------------------------------------------------

export function menuAcoes(m: { rotulo?: string; itensHtml: string; alinhar?: 'dir' }): string {
  return `<details class="cc-mais${m.alinhar === 'dir' ? ' cc-mais-dir' : ''}"><summary class="cc-btn">${escapeHtml(m.rotulo ?? '⋯ Mais ações')}</summary><div class="cc-mais-menu">${m.itensHtml}</div></details>`;
}

// ---------------------------------------------------------------------------
// Avatar (bolinha dourada com a inicial)
// ---------------------------------------------------------------------------

export function avatar(nome: string | null | undefined): string {
  const inicial = (nome ?? '').trim().charAt(0).toUpperCase() || '?';
  return `<span class="cc-avatar" aria-hidden="true">${escapeHtml(inicial)}</span>`;
}

// ---------------------------------------------------------------------------
// Trilha de etapas (bolinhas ligadas: Contrato → … → Monitoramento)
// ---------------------------------------------------------------------------

export function trilhaEtapas(etapas: string[], indiceAtual: number): string {
  if (etapas.length === 0) return '';
  const atual = Number.isFinite(indiceAtual) ? Math.trunc(indiceAtual) : -1;
  const itens = etapas.map((e, i) => {
    const cls = i < atual ? 'cc-trl-feita' : i === atual ? 'cc-trl-atual' : '';
    return `<li${cls ? ` class="${cls}"` : ''}${i === atual ? ' aria-current="step"' : ''}><span>${escapeHtml(e)}</span></li>`;
  }).join('');
  return `<ol class="cc-trl">${itens}</ol>`;
}
