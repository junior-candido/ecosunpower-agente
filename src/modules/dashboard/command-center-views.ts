// src/modules/dashboard/command-center-views.ts
// Command Center — FASE B (spec docs/superpowers/specs/2026-09-27-command-center-design.md).
//
// Layout do protótipo aprovado pelo Junior, agora com DADO REAL: frota
// (monitoramento), funil, propostas, demonstrativos GD, manutenção e
// financeiro, mais o motor da Central de Atenção (central-atencao.ts).
//
// REGRA DE OURO: número só se for real. Fonte que falhou → "—" + "sem dado
// agora"; área sem permissão → "sem acesso"; bloco que ainda não tem fonte →
// "Em construção — próxima entrega". A Central nunca diz "tudo em dia" quando
// alguma fonte não carregou.

import { renderLayout, escapeHtml } from './views.js';
import type { DashUser } from './permissions.js';
import {
  faixaKpis, cartaoSecao, estadoVazio, cabecalhoPagina, icone, tabela,
  TONS, type KpiInput, type Tom,
} from './ui/componentes.js';
import { fmtNumero, fmtCompacto, temNumero, hrefSeguro, SEM_DADO } from './ui/html.js';
import type { NomeIcone } from './ui/icones.js';
import type { IdGrupo, SeloGrupo } from './menu-areas.js';
import {
  priorizar, contarPorSeveridade, topoDaHome, acoesRecomendadas, filtrarEventos,
  ORDEM_SEVERIDADE, AREAS_EVENTO, ehAreaEvento, ehSeveridade,
  type EventoAtencao, type Severidade, type AreaEvento,
} from './central-atencao.js';
import { energiaLegivel, mudancasDesdeOntem, pctDoEsperado, type EstadoUsina, type PontoCurva } from './command-center-calc.js';
import type { DadosCommandCenter, FonteAviso, PermissoesCC } from './command-center-queries.js';

export interface CommandCenterDados {
  agora: Date;
  nomeUsuario: string | null;
  /** null = a carga inteira falhou (a tela mostra "—" em tudo). */
  dados: DadosCommandCenter | null;
}

const TZ = 'America/Sao_Paulo';

function horaBrasilia(d: Date): number {
  const h = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', hour12: false, timeZone: TZ }).format(d);
  return parseInt(h, 10) % 24;
}

/** "Bom dia" até 11:59, "Boa tarde" até 17:59, "Boa noite" depois — no relógio de Brasília. */
export function saudacao(agora: Date): string {
  const h = horaBrasilia(agora);
  if (h >= 5 && h < 12) return 'Bom dia';
  if (h >= 12 && h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** "domingo, 27 de setembro · atualizado às 11:42" (Brasília). */
export function carimboAoVivo(agora: Date): string {
  const dia = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }).format(agora);
  const hora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ }).format(agora);
  return `${dia} · atualizado às ${hora}`;
}

const EM_CONSTRUCAO = 'em construção';
const SEM_ACESSO = 'sem acesso';
const SEM_DADO_AGORA = 'sem dado agora';

const plural = (n: number, um: string, varios: string) => `${fmtNumero(n)} ${n === 1 ? um : varios}`;

/** Texto do "—" de um bloco: sem permissão ≠ falhou. */
function semTexto(p: PermissoesCC | undefined, area: keyof PermissoesCC): string {
  return p && !p[area] ? SEM_ACESSO : SEM_DADO_AGORA;
}

// ---------------------------------------------------------------------------
// Severidade → cor (a mesma do design system)
// ---------------------------------------------------------------------------

const TOM_DA_SEVERIDADE: Record<Severidade, Tom> = {
  critico: 'critico', atencao: 'atencao', acompanhar: 'acompanhar', oportunidade: 'oportunidade', info: 'info',
};

const ROTULO_AREA: Record<AreaEvento, string> = {
  usinas: 'Usinas', comercial: 'Comercial', marketing: 'Marketing', instalacoes: 'Instalações',
  om: 'O&M', financeiro: 'Financeiro', clientes: 'Clientes',
};

/** Selos do menu com a contagem real de avisos crítico + atenção por área. */
export function selosDoMenu(eventos: readonly EventoAtencao[]): Partial<Record<IdGrupo, SeloGrupo>> {
  const out: Partial<Record<IdGrupo, SeloGrupo>> = {};
  for (const area of AREAS_EVENTO) {
    const daArea = eventos.filter((e) => e.area === area && (e.severidade === 'critico' || e.severidade === 'atencao'));
    if (!daArea.length) continue;
    out[area as IdGrupo] = { valor: daArea.length, tom: daArea.some((e) => e.severidade === 'critico') ? 'critico' : 'dourado' };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Aviso (cartão de evento) — usado na Home e em /atencao
// ---------------------------------------------------------------------------

/** Link do aviso: só caminho interno/http(s); qualquer outra coisa cai na Central. */
const hrefAcao = (e: EventoAtencao) => hrefSeguro(e.acao.href) ?? '/dashboard/atencao';

export function cartaoEvento(e: EventoAtencao): string {
  const tom = TONS[TOM_DA_SEVERIDADE[e.severidade]];
  const btn = e.severidade === 'critico' ? 'cc-btn cc-btn-sm cc-btn-crit' : 'cc-btn cc-btn-sm';
  return `<div class="cc-ev cc-ev-${e.severidade}">
    <div class="cc-ev-m"><span class="cc-ev-sv">${escapeHtml(tom.rotulo)}</span><span>${escapeHtml(e.contexto)}</span></div>
    <div class="cc-ev-t">${escapeHtml(e.titulo)}</div>
    ${e.detalhe ? `<div class="cc-ev-d">${escapeHtml(e.detalhe)}</div>` : ''}
    ${e.impactoTexto ? `<div class="cc-ev-imp"><b>${escapeHtml(e.impactoTexto)}</b></div>` : ''}
    <a class="${btn}" href="${escapeHtml(hrefAcao(e))}">${escapeHtml(e.acao.rotulo)}</a>
  </div>`;
}

function fontesComFalha(fontes: readonly FonteAviso[]): FonteAviso[] {
  return fontes.filter((f) => f.estado === 'falhou');
}

function avisoFalha(fontes: readonly FonteAviso[]): string {
  const f = fontesComFalha(fontes);
  if (!f.length) return '';
  return `<div class="cc-falha">${icone('wifi-off', 'sm')}<span><b>Não consegui ler agora:</b> ${escapeHtml(f.map((x) => x.rotulo.toLowerCase()).join('; '))}. Os avisos dessas fontes não aparecem aqui até a próxima atualização.</span></div>`;
}

// ---------------------------------------------------------------------------
// Hero da Eva: resumo real + o que mudou + ações recomendadas
// ---------------------------------------------------------------------------

function frasesResumo(dd: DadosCommandCenter): string[] {
  const out: string[] = [];
  const f = dd.frota;
  if (f && f.monitoradas > 0) {
    out.push(`<b>${escapeHtml(fmtNumero(f.porEstado.normal))} de ${escapeHtml(plural(f.monitoradas, 'usina', 'usinas'))}</b> ${f.porEstado.normal === 1 ? 'está gerando' : 'estão gerando'} normalmente.`);
    const pct = pctDoEsperado(f.curva[f.curva.length - 1]);
    if (pct !== null) out.push(`Ontem o portfólio gerou <b>${escapeHtml(fmtNumero(pct))}% do esperado</b>.`);
  }
  const k = dd.kpisMes;
  if (temNumero(k.leads) && temNumero(k.propostas) && temNumero(k.vendas)) {
    out.push(`Neste mês entraram <b>${escapeHtml(plural(k.leads, 'lead', 'leads'))}</b>, saíram <b>${escapeHtml(plural(k.propostas, 'proposta', 'propostas'))}</b> e <b>${escapeHtml(plural(k.vendas, 'venda fechou', 'vendas fecharam'))}</b>.`);
  }
  const crit = contarPorSeveridade(dd.eventos).critico;
  const falhou = fontesComFalha(dd.fontes).length > 0;
  if (crit > 0) out.push(`Há <b>${escapeHtml(plural(crit, 'aviso crítico', 'avisos críticos'))}</b> pedindo você agora.`);
  else if (!falhou) out.push('Nenhum aviso crítico agora.');
  return out;
}

function chipsMudancas(dd: DadosCommandCenter | null): string {
  if (!dd) return estadoVazio({ tipo: 'sem_dado', compacto: true, titulo: 'Sem dado agora', texto: 'Não consegui comparar com ontem. Tente de novo em alguns minutos.' });
  const m = mudancasDesdeOntem({
    leads: dd.mudancas24h.leads, propostas: dd.mudancas24h.propostas, vendas: dd.mudancas24h.vendas,
    geracaoOntemPct: dd.frota ? pctDoEsperado(dd.frota.curva[dd.frota.curva.length - 1]) : null,
  });
  if (m.semDado) return estadoVazio({ tipo: 'sem_dado', compacto: true, titulo: 'Sem dado agora' });
  if (!m.chips.length) return '<div class="cc-chips"><span class="cc-chip">Nada de novo desde ontem neste horário</span></div>';
  return `<div class="cc-chips">${m.chips.map((c) => `<span class="cc-chip cc-chip-${c.tom}">${escapeHtml(c.texto)}</span>`).join('')}</div>`;
}

function acoesHtml(dd: DadosCommandCenter | null): string {
  if (!dd) return estadoVazio({ tipo: 'sem_dado', titulo: 'Sem dado agora', texto: 'Não consegui ler os avisos. Tente de novo em alguns minutos.' });
  const acoes = acoesRecomendadas(dd.eventos, 3);
  if (!acoes.length) {
    return fontesComFalha(dd.fontes).length
      ? estadoVazio({ tipo: 'sem_dado', titulo: 'Parte dos avisos não carregou', texto: 'Sem essas fontes não dá pra dizer qual é a próxima ação. Veja a Central de Atenção.' })
      : estadoVazio({ tipo: 'vazio', titulo: 'Nada urgente agora', texto: 'Nenhum aviso pedindo ação. O que está só em acompanhamento fica na Central de Atenção.' });
  }
  return acoes.map((e, i) => `<div class="cc-act${i === 0 ? ' cc-act-1' : ''}">
      <span class="cc-act-n">${i + 1}</span>
      <div>${i === 0 ? '<span class="cc-act-tag">Próxima ação mais importante</span>' : ''}<b>${escapeHtml(e.titulo)}</b><small>${escapeHtml([e.impactoTexto, e.detalhe ?? e.contexto].filter(Boolean).join(' · '))}</small></div>
      <a class="cc-btn cc-btn-sm${i === 0 ? ' cc-btn-gold' : ''}" href="${escapeHtml(hrefAcao(e))}">${escapeHtml(e.acao.rotulo)}</a>
    </div>`).join('');
}

function hero(d: CommandCenterDados): string {
  const nome = (d.nomeUsuario ?? '').trim().split(/\s+/)[0] ?? '';
  const frases = d.dados ? frasesResumo(d.dados) : [];
  const resumo = frases.length
    ? `<p>${frases.join(' ')}</p>`
    : '<p>Ainda não consegui ler os números agora. Tente de novo em alguns minutos — nada aqui é chute.</p>';
  return `<section class="cc-hero">
    <div class="cc-hero-l">
      <div class="cc-who"><div class="cc-eva-av">${icone('spark')}</div><div><span class="cc-lbl-s cc-gold">Eva · resumo do dia</span><div class="cc-faint" style="font-size:12px">${escapeHtml(carimboAoVivo(d.agora))}</div></div></div>
      <h2>${escapeHtml(saudacao(d.agora))}${nome ? `, ${escapeHtml(nome)}` : ''}.</h2>
      ${resumo}
      <div class="cc-changed"><span class="cc-lbl-s">O que mudou desde ontem</span>${chipsMudancas(d.dados)}</div>
    </div>
    <div class="cc-hero-r">
      <div class="cc-hh"><span class="cc-lbl-s">Ações recomendadas</span><span class="cc-sp"></span><a class="cc-link" href="/dashboard/atencao">Central de Atenção ${icone('right', 'xs')}</a></div>
      ${acoesHtml(d.dados)}
    </div>
  </section>`;
}

// ---------------------------------------------------------------------------
// Faixa de 8 KPIs
// ---------------------------------------------------------------------------

function kpis(d: CommandCenterDados): string {
  const dd = d.dados;
  const p = dd?.permissoes;
  const f = dd?.frota ?? null;
  const semUsinas = semTexto(p, 'usinas');

  const hoje = energiaLegivel(f?.energiaHojeKwh);
  const mes = energiaLegivel(f?.energiaMesKwh);
  const pot = f?.potenciaKwp ?? null;
  const potMw = temNumero(pot) && pot >= 1000;

  const lista: KpiInput[] = [
    {
      rotulo: 'Geração agora', valor: f?.geracaoAgora?.kw ?? null, casas: 1, unidade: 'kW', href: '/dashboard/monitoramento',
      detalhe: f?.geracaoAgora ? `ao vivo em ${f.geracaoAgora.usinas} de ${f.monitoradas} usinas` : undefined,
      semDadoTexto: f ? 'sem leitura ao vivo agora' : semUsinas,
    },
    {
      rotulo: 'Energia hoje', valor: hoje.valor, casas: hoje.casas, unidade: hoje.unidade, href: '/dashboard/monitoramento',
      detalhe: f ? `até agora · ${plural(f.usinasComDadoHoje, 'usina', 'usinas')}` : undefined,
      semDadoTexto: f ? 'sem leitura hoje ainda' : semUsinas,
    },
    {
      rotulo: 'Energia no mês', valor: mes.valor, casas: mes.casas, unidade: mes.unidade, href: '/dashboard/monitoramento',
      detalhe: 'desde o dia 1º', semDadoTexto: f ? 'sem leitura no mês' : semUsinas,
    },
    {
      rotulo: 'Potência instalada', valor: potMw ? (pot as number) / 1000 : pot, casas: potMw ? 2 : 1, unidade: potMw ? 'MWp' : 'kWp',
      href: '/dashboard/monitoramento', detalhe: f ? plural(f.total, 'usina ativa', 'usinas ativas') : undefined,
      semDadoTexto: f ? 'sem potência cadastrada' : semUsinas,
    },
    {
      rotulo: 'Usinas comunicando', valor: f && f.monitoradas > 0 ? f.comunicando : null, unidade: f ? `/ ${fmtNumero(f.monitoradas)}` : undefined,
      href: '/dashboard/monitoramento',
      detalhe: f ? (f.porEstado.sem_comunicacao ? `${plural(f.porEstado.sem_comunicacao, 'sem comunicação', 'sem comunicação')}` : 'todas comunicando') : undefined,
      semDadoTexto: f ? 'nenhuma usina monitorada' : semUsinas,
    },
    {
      rotulo: 'Faturamento', valor: dd?.recebidoMes ?? null, prefixo: 'R$', compacto: true, href: '/dashboard/financeiro',
      detalhe: 'recebido no mês', semDadoTexto: semTexto(p, 'financeiro'),
    },
    {
      rotulo: 'Leads do mês', valor: dd?.kpisMes.leads ?? null, href: '/dashboard/leads',
      detalhe: temNumero(dd?.mudancas24h.leads) ? `+${fmtNumero(dd!.mudancas24h.leads)} desde ontem` : 'ver leads', semDadoTexto: semTexto(p, 'leads'),
    },
    {
      rotulo: 'Vendas', valor: dd?.kpisMes.vendas ?? null, href: '/dashboard/leads/kanban', destaque: true,
      detalhe: temNumero(dd?.kpisMes.propostas) ? `${plural(dd!.kpisMes.propostas as number, 'proposta', 'propostas')} no mês` : 'fechadas no mês',
      semDadoTexto: semTexto(p, 'leads'),
    },
  ];
  return faixaKpis(lista, { classe: 'cc-kstrip-cc' });
}

// ---------------------------------------------------------------------------
// Geração do portfólio: 30 dias, real × esperada (SVG sem JavaScript)
// ---------------------------------------------------------------------------

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function eixoMax(v: number): number {
  if (v <= 0) return 1;
  const pot = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * pot >= v) return m * pot;
  return 10 * pot;
}

/** Barras = real; linha tracejada = esperada. Uma escala só (kWh/dia). */
export function graficoCurva(curva: readonly PontoCurva[]): string {
  const vals = curva.flatMap((p) => [p.realKwh ?? 0, p.esperadoKwh ?? 0]);
  const topo = eixoMax(Math.max(0, ...vals));
  const legivel = energiaLegivel(topo);
  const divisor = legivel.unidade === 'MWh' ? 1000 : 1;
  const W = 600; const H = 200; const n = curva.length || 1;
  const bw = W / n; const gap = Math.min(2, bw * 0.25);
  const y = (v: number) => H - (v / topo) * H;

  const barras = curva.map((p, i) => {
    if (p.realKwh === null) return '';
    const h = Math.max(1, H - y(p.realKwh));
    const tip = `${dm(p.data)}: real ${fmtNumero(p.realKwh / divisor, divisor > 1 ? 2 : 0)} ${legivel.unidade}`
      + (p.esperadoKwh !== null ? ` · esperada ${fmtNumero(p.esperadoKwh / divisor, divisor > 1 ? 2 : 0)} ${legivel.unidade}` : ' · esperada: sem dado');
    return `<rect x="${(i * bw + gap / 2).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${(bw - gap).toFixed(1)}" height="${h.toFixed(1)}" class="cc-bar-real"><title>${escapeHtml(tip)}</title></rect>`;
  }).join('');

  // Linha da esperada em trechos (quebra onde falta dado).
  const trechos: string[] = [];
  let atual: string[] = [];
  curva.forEach((p, i) => {
    if (p.esperadoKwh === null) { if (atual.length) trechos.push(atual.join(' ')); atual = []; return; }
    const x = (i * bw + bw / 2).toFixed(1);
    atual.push(`${atual.length ? 'L' : 'M'}${x} ${y(p.esperadoKwh).toFixed(1)}`);
  });
  if (atual.length) trechos.push(atual.join(' '));
  const linha = trechos.map((d) => `<path d="${d}" class="cc-linha-esp"/>`).join('');
  const grade = [0.25, 0.5, 0.75].map((f) => `<line x1="0" x2="${W}" y1="${(H * f).toFixed(1)}" y2="${(H * f).toFixed(1)}" class="cc-grade"/>`).join('');

  const rotY = [1, 0.5, 0].map((f) => `<span style="top:${(1 - f) * 100}%">${escapeHtml(fmtNumero((topo * f) / divisor, divisor > 1 && topo / divisor < 10 ? 1 : 0))}</span>`).join('');
  const marcas = [0, Math.floor((n - 1) / 3), Math.floor((2 * (n - 1)) / 3), n - 1]
    .filter((v, i, a) => a.indexOf(v) === i && curva[v])
    .map((i) => `<span style="left:${((i + 0.5) / n) * 100}%">${escapeHtml(dm(curva[i].data))}</span>`).join('');

  return `<div class="cc-chart" role="img" aria-label="Geração diária dos últimos 30 dias, real em barras e esperada em linha tracejada">
    <div class="cc-chart-un">${escapeHtml(legivel.unidade)}/dia</div>
    <div class="cc-chart-y">${rotY}</div>
    <div class="cc-chart-plot"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${grade}${barras}${linha}</svg></div>
    <div class="cc-chart-x">${marcas}</div>
  </div>`;
}

function geracao(d: CommandCenterDados): string {
  const f = d.dados?.frota ?? null;
  const acoes = `<a class="cc-link" href="/dashboard/monitoramento">Monitoramento ${icone('right', 'xs')}</a>`;
  if (!f) {
    return cartaoSecao({
      titulo: 'Geração do portfólio', dica: 'real × esperada · 30 dias', classe: 'cc-a-gen', acoesHtml: acoes,
      corpoHtml: estadoVazio({ tipo: 'sem_dado', titulo: d.dados && !d.dados.permissoes.usinas ? 'Sem acesso às usinas' : 'Sem dado agora', texto: 'Não consegui ler a geração das usinas.' }),
    });
  }
  const comReal = f.curva.filter((p) => p.realKwh !== null);
  if (!comReal.length) {
    return cartaoSecao({
      titulo: 'Geração do portfólio', dica: 'real × esperada · 30 dias', classe: 'cc-a-gen', acoesHtml: acoes,
      corpoHtml: estadoVazio({ tipo: 'sem_dado', titulo: 'Sem geração nos últimos 30 dias', texto: 'Nenhuma usina mandou dado de geração nesse período.' }),
    });
  }
  const completos = f.curva.filter((p) => p.realKwh !== null && p.esperadoKwh !== null);
  const real = completos.reduce((s, p) => s + (p.realKwh as number), 0);
  const esp = completos.reduce((s, p) => s + (p.esperadoKwh as number), 0);
  const temEsperada = completos.length > 0 && esp > 0;
  const realTodo = comReal.reduce((s, p) => s + (p.realKwh as number), 0);
  const caixa = (rotulo: string, kwh: number | null) => {
    const e = energiaLegivel(kwh);
    return `<div><span class="cc-lbl-s">${escapeHtml(rotulo)}</span><div class="cc-big${e.valor === null ? ' cc-faint' : ''}">${e.valor === null ? SEM_DADO : `${escapeHtml(fmtNumero(e.valor, e.casas))} <small>${e.unidade}</small>`}</div></div>`;
  };
  const desvio = temEsperada ? Math.round(((real - esp) / esp) * 1000) / 10 : null;
  const desvioHtml = `<div><span class="cc-lbl-s">Desvio</span><div class="cc-big${desvio === null ? ' cc-faint' : desvio < -10 ? ' cc-txt-crit' : desvio < 0 ? ' cc-txt-warn' : ' cc-txt-ok'}">${desvio === null ? SEM_DADO : `${desvio > 0 ? '+' : ''}${escapeHtml(fmtNumero(desvio, 1))}%`}</div></div>`;

  const legenda = `<div class="cc-chart-leg"><span><i class="cc-sw-real"></i>Real</span>${temEsperada ? '<span><i class="cc-sw-esp"></i>Esperada (média de sol da região)</span>' : ''}<span class="cc-sp"></span><span class="cc-faint">Passe o mouse numa barra para ver o dia</span></div>`;
  const nota = temEsperada
    ? (completos.length < comReal.length ? '<p class="cc-nota">A esperada só aparece nos dias em que todas as usinas que mandaram dado têm a potência cadastrada.</p>' : '')
    : '<p class="cc-nota">Só a geração real: falta a potência (kWp) de alguma usina no cadastro, então a esperada ficaria errada.</p>';

  const tabelaDias = tabela({
    colunas: [{ titulo: 'Dia' }, { titulo: 'Real (kWh)', alinhar: 'dir', num: true }, { titulo: 'Esperada (kWh)', alinhar: 'dir', num: true }],
    linhas: [...f.curva].reverse().map((p) => [dm(p.data), p.realKwh === null ? null : Math.round(p.realKwh), p.esperadoKwh === null ? null : Math.round(p.esperadoKwh)]),
  });

  return cartaoSecao({
    titulo: 'Geração do portfólio',
    dica: temEsperada ? 'real × esperada · 30 dias' : 'real · 30 dias',
    classe: 'cc-a-gen',
    acoesHtml: acoes,
    corpoHtml: `<div class="cc-gsum">
        ${caixa(!temEsperada || completos.length === comReal.length ? 'Real (30 dias)' : `Real (${completos.length} dias comparáveis)`, temEsperada ? real : realTodo)}
        ${caixa(temEsperada && completos.length < comReal.length ? `Esperada (${completos.length} dias)` : 'Esperada (30 dias)', temEsperada ? esp : null)}
        ${desvioHtml}
        ${caixa('Hoje até agora', f.energiaHojeKwh)}
      </div>
      ${graficoCurva(f.curva)}
      ${legenda}
      ${nota}
      <details class="cc-det"><summary>Ver os números dia a dia</summary>${tabelaDias}</details>`,
  });
}

// ---------------------------------------------------------------------------
// Usinas agora: estados reais + por cidade (mapa: próxima entrega)
// ---------------------------------------------------------------------------

const TOM_DO_ESTADO: Record<EstadoUsina, Tom> = {
  normal: 'normal', atencao: 'atencao', critico: 'critico', sem_comunicacao: 'sem_dado', sem_monitoramento: 'sem_dado',
};
const ROTULO_ESTADO: Record<EstadoUsina, string> = {
  normal: 'Normal', atencao: 'Atenção', critico: 'Crítico', sem_comunicacao: 'Sem comunicação', sem_monitoramento: 'Leitura manual',
};

function usinasAgora(d: CommandCenterDados): string {
  const f = d.dados?.frota ?? null;
  const acoes = `<a class="cc-link" href="/dashboard/monitoramento">Abrir frota ${icone('right', 'xs')}</a>`;
  if (!f) {
    return cartaoSecao({
      titulo: 'Usinas agora', dica: 'por estado e cidade', classe: 'cc-a-map', acoesHtml: acoes,
      corpoHtml: estadoVazio({ tipo: 'sem_dado', titulo: d.dados && !d.dados.permissoes.usinas ? 'Sem acesso às usinas' : 'Sem dado agora' }),
    });
  }
  if (f.total === 0) {
    return cartaoSecao({
      titulo: 'Usinas agora', dica: 'por estado e cidade', classe: 'cc-a-map', acoesHtml: acoes,
      corpoHtml: estadoVazio({ tipo: 'vazio', titulo: 'Nenhuma usina ativa ainda', texto: 'Quando uma usina entrar no monitoramento, ela aparece aqui.' }),
    });
  }
  const base = Math.max(1, f.monitoradas);
  const leg = (e: EstadoUsina) => {
    const n = f.porEstado[e];
    return `<div class="cc-ln"><span class="cc-dot ${TONS[TOM_DO_ESTADO[e]].ponto}"></span>${escapeHtml(ROTULO_ESTADO[e])}<b>${escapeHtml(fmtNumero(n))}</b></div><div class="cc-bar cc-bar-${e}"><i style="width:${Math.round((n / base) * 100)}%"></i></div>`;
  };
  const cidades = f.porCidade.slice(0, 7).map((c) => `<li><span class="cc-dot ${TONS[TOM_DO_ESTADO[c.pior]].ponto}"></span><span class="cc-cid">${escapeHtml(c.cidade)}</span><b>${escapeHtml(fmtNumero(c.total))}</b></li>`).join('');
  const resto = f.porCidade.length > 7 ? `<li class="cc-faint">e mais ${f.porCidade.length - 7} cidades</li>` : '';
  const pctCom = f.monitoradas > 0 ? Math.round((f.comunicando / f.monitoradas) * 1000) / 10 : null;
  return cartaoSecao({
    titulo: 'Usinas agora',
    dica: 'por estado e cidade',
    classe: 'cc-a-map',
    acoesHtml: acoes,
    corpoHtml: `<div class="cc-mapwrap">
        <div><span class="cc-lbl-s">Por cidade · cor do pior estado</span><ul class="cc-cidades">${cidades}${resto}</ul>
          <p class="cc-nota">Mapa por região: próxima entrega.</p></div>
        <div class="cc-mleg">
          ${leg('normal')}${leg('atencao')}${leg('critico')}${leg('sem_comunicacao')}
          <hr>
          <div class="cc-ln cc-faint" style="font-size:12px">Comunicando<b class="cc-txt">${pctCom === null ? SEM_DADO : `${escapeHtml(fmtNumero(pctCom, 1))}%`}</b></div>
          ${f.porEstado.sem_monitoramento ? `<div class="cc-ln cc-faint" style="font-size:12px">Leitura manual<b class="cc-txt">${escapeHtml(fmtNumero(f.porEstado.sem_monitoramento))}</b></div>` : ''}
        </div>
      </div>`,
  });
}

// ---------------------------------------------------------------------------
// Central de Atenção (topo da Home)
// ---------------------------------------------------------------------------

function legendaSeveridades(eventos: readonly EventoAtencao[] | null, linkar: boolean): string {
  const c = eventos ? contarPorSeveridade(eventos) : null;
  return `<div class="cc-sevs">${ORDEM_SEVERIDADE.map((s) => {
    const tom = TONS[TOM_DA_SEVERIDADE[s]];
    const inner = `<span class="cc-dot ${tom.ponto}"></span>${escapeHtml(tom.rotulo)} <b>${c ? escapeHtml(fmtNumero(c[s])) : SEM_DADO}</b>`;
    return linkar && c ? `<a class="cc-sev" href="/dashboard/atencao?severidade=${s}">${inner}</a>` : `<span class="cc-sev">${inner}</span>`;
  }).join('')}</div>`;
}

function centralAtencao(d: CommandCenterDados): string {
  const dd = d.dados;
  if (!dd) {
    return cartaoSecao({
      titulo: 'Central de Atenção', classe: 'cc-a-att',
      corpoHtml: `${legendaSeveridades(null, false)}${estadoVazio({ tipo: 'sem_dado', titulo: 'Sem dado agora', texto: 'Não consegui ler os avisos. Tente de novo em alguns minutos.' })}`,
    });
  }
  const todos = priorizar(dd.eventos);
  const top = topoDaHome(todos, 8);
  const falha = avisoFalha(dd.fontes);
  const lista = top.length
    ? `<div class="cc-evs">${top.map(cartaoEvento).join('')}</div>`
    : falha ? '' : estadoVazio({ tipo: 'vazio', titulo: 'Tudo em dia por aqui', texto: 'Nenhum aviso de usinas, leads, propostas, créditos GD, manutenção ou contas.' });
  return cartaoSecao({
    titulo: 'Central de Atenção',
    classe: 'cc-a-att',
    acoesHtml: `<a class="cc-link" href="/dashboard/atencao">${todos.length > top.length ? `Ver os ${escapeHtml(fmtNumero(todos.length))}` : 'Ver todos'} ${icone('right', 'xs')}</a>`,
    corpoHtml: `${legendaSeveridades(todos, true)}${falha}${lista}`,
  });
}

// ---------------------------------------------------------------------------
// Cartões por área
// ---------------------------------------------------------------------------

interface DeptInput {
  titulo: string; icone: NomeIcone; href: string; valor: number | null; dinheiro?: boolean;
  legenda: string; linha: string; semTexto: string;
  /** undefined = área ainda sem fonte de avisos (em construção). */
  avisos?: EventoAtencao[] | null;
}

function linhaAviso(avisos: EventoAtencao[] | null | undefined): string {
  if (avisos === undefined) return `<span class="cc-dot cc-d-off"></span>alertas desta área: próxima entrega`;
  if (avisos === null) return `<span class="cc-dot cc-d-off"></span>${SEM_DADO_AGORA}`;
  const topo = priorizar(avisos)[0];
  if (!topo) return `<span class="cc-dot cc-d-ok"></span>Nada pedindo atenção`;
  return `<span class="cc-dot ${TONS[TOM_DA_SEVERIDADE[topo.severidade]].ponto}"></span><span class="cc-st-t">${escapeHtml(topo.titulo)}</span>`;
}

function dept(x: DeptInput): string {
  const tem = temNumero(x.valor);
  let valor = SEM_DADO;
  if (tem && x.dinheiro) {
    const c = fmtCompacto(x.valor);
    valor = `<small class="cc-pre">R$</small>${escapeHtml(c.numero)}${c.sufixo ? `<small>${escapeHtml(c.sufixo)}</small>` : ''}`;
  } else if (tem) {
    valor = escapeHtml(fmtNumero(x.valor));
  }
  return `<a class="cc-dept" href="${escapeHtml(x.href)}">
      <div class="cc-dh"><span class="cc-ic">${icone(x.icone, 'sm')}</span>${escapeHtml(x.titulo)}<svg class="cc-i cc-i-sm cc-go" aria-hidden="true"><use href="#cc-i-chev"/></svg></div>
      <div class="cc-big${tem ? '' : ' cc-faint'}">${valor} <small>${escapeHtml(tem ? x.legenda : `${x.legenda} · ${x.semTexto}`)}</small></div>
      <div class="cc-s1">${escapeHtml(x.linha)}</div>
      <div class="cc-st">${linhaAviso(x.avisos)}</div>
    </a>`;
}

function departamentos(d: CommandCenterDados): string {
  const dd = d.dados;
  const p = dd?.permissoes;
  const k = dd?.kpisMes;
  const estadoFonte = (ids: string[]) => dd?.fontes.filter((f) => ids.includes(f.id)) ?? [];
  const avisosDe = (area: AreaEvento, fontes: string[]): EventoAtencao[] | null => {
    if (!dd) return null;
    const fs = estadoFonte(fontes);
    if (fs.every((f) => f.estado === 'sem_acesso')) return null;
    const lista = dd.eventos.filter((e) => e.area === area);
    // Fonte da área falhou e nada apareceu: não dá pra dizer "nada pedindo atenção".
    if (!lista.length && fs.some((f) => f.estado === 'falhou')) return null;
    return lista;
  };
  const m = dd?.manutencao ?? null;
  return `<section class="cc-depts">
    ${dept({
      titulo: 'Comercial', icone: 'users', href: '/dashboard/leads/kanban', valor: k?.propostas ?? null, legenda: 'propostas no mês', semTexto: semTexto(p, 'propostas'),
      linha: temNumero(k?.vendas) ? `${plural(k!.vendas as number, 'venda fechada', 'vendas fechadas')} no mês` : 'Pipeline e conversão: próxima entrega',
      avisos: avisosDe('comercial', ['leads_esperando', 'sla', 'propostas']),
    })}
    ${dept({ titulo: 'Marketing', icone: 'mega', href: '/dashboard/marketing', valor: k?.leads ?? null, legenda: 'leads no mês', semTexto: semTexto(p, 'leads'), linha: 'Investimento e custo por lead: próxima entrega' })}
    ${dept({ titulo: 'Instalações', icone: 'hammer', href: '/dashboard/usinas/kanban', valor: k?.usinasNovas ?? null, legenda: 'usinas cadastradas no mês', semTexto: semTexto(p, 'usinas'), linha: 'Obras por etapa e atrasos: próxima entrega' })}
    ${dept({
      titulo: 'O&M', icone: 'wrench', href: '/dashboard/manutencao', valor: m?.vencidas ?? null, legenda: m?.vencidas === 1 ? 'manutenção vencida' : 'manutenções vencidas', semTexto: semTexto(p, 'usinas'),
      linha: m ? `${plural(m.proximas30, 'agendada', 'agendadas')} para os próximos 30 dias` : 'Agenda de manutenção',
      avisos: avisosDe('om', ['manutencao']),
    })}
    ${dept({
      titulo: 'Financeiro', icone: 'wallet', href: '/dashboard/financeiro', valor: dd?.recebidoMes ?? null, dinheiro: true, legenda: 'recebido no mês', semTexto: semTexto(p, 'financeiro'),
      linha: 'Margem e a receber: próxima entrega',
      avisos: avisosDe('financeiro', ['contas']),
    })}
  </section>`;
}

// ---------------------------------------------------------------------------
// Página: Command Center
// ---------------------------------------------------------------------------

export function renderCommandCenterPage(d: CommandCenterDados, user?: DashUser): string {
  const crit = d.dados ? contarPorSeveridade(d.dados.eventos).critico : 0;
  const cab = cabecalhoPagina({
    titulo: 'Command Center',
    aoVivo: carimboAoVivo(d.agora),
    subtitulo: 'Como está a empresa agora, o que mudou e qual é a próxima ação mais importante.',
    acoesHtml: `<a class="cc-btn" href="/dashboard/atencao">${icone('bell', 'sm')}Central de Atenção${crit ? `<span class="cc-bdg cc-bdg-r">${escapeHtml(fmtNumero(crit))}</span>` : ''}</a>`
      + `<a class="cc-btn" href="/dashboard/tv">${icone('tv', 'sm')}Modo TV</a>`,
  });

  const body = `<div class="cc-root cc-cc">
  ${cab}
  <div class="cc-wrap">
    ${hero(d)}
    ${kpis(d)}
    <div class="cc-board">
      ${geracao(d)}
      ${usinasAgora(d)}
      ${centralAtencao(d)}
    </div>
    ${departamentos(d)}
    <div class="cc-foot">${icone('tv', 'sm')}Modo TV: a tela do escritório vai girar entre visão geral, usinas e comercial. <span class="cc-sp"></span>Todo número é clicável e leva ao detalhe.</div>
  </div>
</div>
<style>${CSS_COMMAND_CENTER}</style>`;

  return renderLayout({
    active: 'command_center', title: 'Command Center', body, dark: true, largo: true, user,
    selos: d.dados ? selosDoMenu(d.dados.eventos) : undefined,
  });
}

// ---------------------------------------------------------------------------
// Página: Central de Atenção (lista completa)
// ---------------------------------------------------------------------------

export interface CentralAtencaoDados {
  agora: Date;
  dados: DadosCommandCenter | null;
  filtro: { area?: unknown; severidade?: unknown };
}

const TEXTO_SEVERIDADE: Record<Severidade, string> = {
  critico: 'resolver agora', atencao: 'resolver hoje', acompanhar: 'sem pressa, com prazo', oportunidade: 'chance de ganhar', info: 'só para saber',
};

function hrefFiltro(area: AreaEvento | null, sev: Severidade | null): string {
  const q = [area ? `area=${area}` : '', sev ? `severidade=${sev}` : ''].filter(Boolean).join('&');
  return `/dashboard/atencao${q ? `?${q}` : ''}`;
}

const AINDA_NAO_LIGADOS = [
  'Obras paradas por etapa (Instalações)',
  'Garantias acabando (oportunidade de O&M)',
  'Certificado digital A1 perto de vencer',
  'Alertas de campanhas (Marketing)',
];

export function renderCentralAtencaoPage(c: CentralAtencaoDados, user?: DashUser): string {
  const dd = c.dados;
  const area = ehAreaEvento(c.filtro.area) ? c.filtro.area : null;
  const sev = ehSeveridade(c.filtro.severidade) ? c.filtro.severidade : null;
  const todos = dd ? priorizar(dd.eventos) : [];
  const filtrados = filtrarEventos(todos, { area, severidade: sev });
  const cont = contarPorSeveridade(todos);

  const cab = cabecalhoPagina({
    titulo: 'Central de Atenção',
    trilha: [{ rotulo: 'Command Center', href: '/dashboard/command-center' }, { rotulo: 'Central de Atenção' }],
    aoVivo: carimboAoVivo(c.agora),
    subtitulo: 'Um lugar só para tudo que pede ação — usinas, vendas, manutenção, créditos e dinheiro. Ordem: o que tem mais impacto primeiro.',
  });

  const faixa = faixaKpis(ORDEM_SEVERIDADE.map((s): KpiInput => ({
    rotulo: TONS[TOM_DA_SEVERIDADE[s]].rotulo,
    valor: dd ? cont[s] : null,
    detalhe: TEXTO_SEVERIDADE[s],
    href: hrefFiltro(area, sev === s ? null : s),
    semDadoTexto: SEM_DADO_AGORA,
  })), { classe: 'cc-kstrip-sev' });

  const areasComAviso = AREAS_EVENTO.filter((a) => todos.some((e) => e.area === a));
  const chip = (rotulo: string, href: string, ativo: boolean, n?: number) =>
    `<a class="cc-chip${ativo ? ' cc-chip-on' : ''}" href="${escapeHtml(href)}">${escapeHtml(rotulo)}${n !== undefined ? ` <b>${escapeHtml(fmtNumero(n))}</b>` : ''}</a>`;
  const filtros = `<div class="cc-chips cc-filtros"><span class="cc-lbl-s">Área</span>${chip('Todas', hrefFiltro(null, sev), !area)}${
    areasComAviso.map((a) => chip(ROTULO_AREA[a], hrefFiltro(a, sev), area === a, todos.filter((e) => e.area === a).length)).join('')
  }${sev ? chip(`${TONS[TOM_DA_SEVERIDADE[sev]].rotulo} ✕`, hrefFiltro(area, null), true) : ''}</div>`;

  let lista: string;
  if (!dd) {
    lista = estadoVazio({ tipo: 'sem_dado', titulo: 'Sem dado agora', texto: 'Não consegui ler os avisos. Tente de novo em alguns minutos.' });
  } else if (!filtrados.length) {
    lista = todos.length
      ? estadoVazio({ tipo: 'vazio', titulo: 'Nenhum aviso com esse filtro' })
      : fontesComFalha(dd.fontes).length
        ? ''
        : estadoVazio({ tipo: 'vazio', titulo: 'Tudo em dia por aqui', texto: 'Nenhum aviso de usinas, leads, propostas, créditos GD, manutenção ou contas.' });
  } else {
    lista = ORDEM_SEVERIDADE.map((s) => {
      const doGrupo = filtrados.filter((e) => e.severidade === s);
      if (!doGrupo.length) return '';
      return `<div class="cc-grupo-sev"><div class="cc-grupo-t"><span class="cc-dot ${TONS[TOM_DA_SEVERIDADE[s]].ponto}"></span>${escapeHtml(TONS[TOM_DA_SEVERIDADE[s]].rotulo)} <span class="cc-faint">${escapeHtml(fmtNumero(doGrupo.length))}</span></div>
        <div class="cc-evs cc-evs-lista">${doGrupo.map(cartaoEvento).join('')}</div></div>`;
    }).join('');
  }

  const ROTULO_ESTADO_FONTE = { ok: 'ligada', falhou: 'não carregou', sem_acesso: 'sem acesso' } as const;
  const TOM_ESTADO_FONTE = { ok: 'normal', falhou: 'critico', sem_acesso: 'sem_dado' } as const;
  const fontes = dd
    ? dd.fontes.map((f) => `<li><span class="cc-dot ${TONS[TOM_ESTADO_FONTE[f.estado]].ponto}"></span><span>${escapeHtml(f.rotulo)}</span><span class="cc-pill ${TONS[TOM_ESTADO_FONTE[f.estado]].classe}">${ROTULO_ESTADO_FONTE[f.estado]}</span></li>`).join('')
    : '';
  const lado = cartaoSecao({
    titulo: 'De onde vêm os avisos',
    classe: 'cc-fontes',
    corpoHtml: `${dd ? `<ul class="cc-fontes-l">${fontes}</ul>` : estadoVazio({ tipo: 'sem_dado', compacto: true, titulo: 'Sem dado agora' })}
      <span class="cc-lbl-s" style="display:block;margin-top:14px">Ainda não ligados · próximas entregas</span>
      <ul class="cc-fontes-l cc-fontes-off">${AINDA_NAO_LIGADOS.map((t) => `<li><span class="cc-dot cc-d-off"></span><span>${escapeHtml(t)}</span></li>`).join('')}</ul>`,
  });

  const body = `<div class="cc-root cc-cc cc-att-page">
  ${cab}
  <div class="cc-wrap">
    ${faixa}
    <div class="cc-att-grid">
      <div>${filtros}${dd ? avisoFalha(dd.fontes) : ''}${lista}</div>
      <aside>${lado}</aside>
    </div>
  </div>
</div>
<style>${CSS_COMMAND_CENTER}</style>`;

  return renderLayout({
    active: 'atencao', title: 'Central de Atenção', body, dark: true, largo: true, user,
    selos: dd ? selosDoMenu(dd.eventos) : undefined,
  });
}

/** Página do Modo TV — fase I. Por enquanto só diz o que vem, sem número. */
export function renderModoTvPage(user?: DashUser): string {
  const body = `<div class="cc-root">
  ${cabecalhoPagina({
    titulo: 'Modo TV',
    trilha: [{ rotulo: 'Command Center', href: '/dashboard/command-center' }, { rotulo: 'Modo TV' }],
    subtitulo: 'A tela do escritório: geração agora, energia do dia, usinas online, alarmes críticos, vendas do mês e instalações do dia — girando sozinha a cada 30 segundos.',
  })}
  ${estadoVazio({ tipo: 'construcao', texto: 'O Modo TV entra depois que o Command Center estiver com todos os números reais (assim a TV nunca mostra número de enfeite).' })}
</div>`;
  return renderLayout({ active: 'tv', title: 'Modo TV', body, dark: true, largo: true, user });
}

// CSS específico das páginas (o resto vem do design system em ui/estilo.ts).
const CSS_COMMAND_CENTER = `
.cc-cc .cc-hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.12fr);border-radius:20px;overflow:hidden;border:1px solid rgba(251,191,36,.22);
  background:linear-gradient(120deg,#12304f 0%,#0f2640 45%,#0f2138 100%);box-shadow:0 20px 50px rgba(0,0,0,.28);margin-bottom:18px;position:relative}
.cc-cc .cc-hero::after{content:"";position:absolute;right:-120px;top:-160px;width:420px;height:420px;border-radius:50%;background:radial-gradient(circle,rgba(240,165,0,.16),transparent 65%);pointer-events:none}
.cc-cc .cc-hero-l{padding:24px 28px}
.cc-cc .cc-who{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.cc-cc .cc-eva-av{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;flex:none;background:linear-gradient(135deg,#0369a1,#16304F);border:1px solid rgba(251,191,36,.45);color:#fbbf24}
.cc-cc .cc-hero-l h2{font-size:30px;font-weight:600;letter-spacing:-.02em;line-height:1.1;color:#fff}
.cc-cc .cc-hero-l>p{margin:10px 0 0;color:var(--cc-text-2);font-size:15px;line-height:1.55;max-width:560px}
.cc-cc .cc-hero-l>p b{color:#fff;font-weight:600}
.cc-cc .cc-changed{margin-top:16px}
.cc-cc .cc-changed .cc-lbl-s{margin-bottom:8px;display:block}
.cc-cc .cc-hero-r{padding:20px 22px;border-left:1px solid var(--cc-line);background:rgba(6,16,30,.28);display:flex;flex-direction:column;gap:10px;position:relative;z-index:1}
.cc-cc .cc-hh{display:flex;align-items:center;gap:10px;margin-bottom:2px}
.cc-cc .cc-hero-r .cc-empty{flex:1;align-items:center}

.cc-cc .cc-board{display:grid;grid-template-columns:minmax(0,1fr) 452px;grid-template-areas:"gen att" "map att";gap:18px;margin-top:18px;align-items:start}
.cc-cc .cc-a-gen{grid-area:gen}.cc-cc .cc-a-map{grid-area:map}
.cc-cc .cc-a-att{grid-area:att;background:linear-gradient(180deg,#132b47 0%,#0f2138 60%);border-color:rgba(150,185,225,.16);box-shadow:0 18px 44px rgba(0,0,0,.25);display:flex;flex-direction:column}
.cc-cc .cc-a-att .cc-ph h3{font-size:18px}
.cc-cc .cc-gsum{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}
.cc-cc .cc-gsum>div{padding:10px 12px;border-radius:10px;background:rgba(0,0,0,.16);border:1px solid var(--cc-line)}
.cc-cc .cc-gsum .cc-big{font-size:20px;margin-top:3px}
.cc-cc .cc-gsum .cc-big small{font-size:12px;color:var(--cc-muted);font-weight:500}
.cc-cc .cc-txt-crit{color:var(--cc-crit)!important}.cc-cc .cc-txt-warn{color:var(--cc-warn)!important}.cc-cc .cc-txt-ok{color:var(--cc-ok)!important}
.cc-cc .cc-nota{font-size:12px;color:var(--cc-muted);margin:8px 0 0}
.cc-cc .cc-det{margin-top:10px;font-size:12.5px;color:var(--cc-muted)}
.cc-cc .cc-det summary{cursor:pointer;color:var(--cc-text-2)}
.cc-cc .cc-det .cc-tbl-wrap{max-height:260px;overflow:auto;margin-top:8px}
.cc-cc .cc-mapwrap{display:grid;grid-template-columns:minmax(0,1fr) 190px;gap:18px;align-items:start}
.cc-cc .cc-cidades{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:7px;font-size:13px}
.cc-cc .cc-cidades li{display:flex;align-items:center;gap:9px;padding:7px 10px;border-radius:10px;background:rgba(255,255,255,.028);border:1px solid var(--cc-line)}
.cc-cc .cc-cidades .cc-cid{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--cc-text-2)}
.cc-cc .cc-cidades b{font-family:var(--cc-f-num);font-weight:600}
.cc-cc .cc-mleg{display:flex;flex-direction:column;gap:9px;font-size:13px}
.cc-cc .cc-ln{display:flex;align-items:center;gap:9px}
.cc-cc .cc-ln b{margin-left:auto;font-family:var(--cc-f-num);font-weight:600;color:var(--cc-text)}
.cc-cc .cc-ln b.cc-txt{color:var(--cc-text-2)}
.cc-cc .cc-mleg .cc-bar{margin:-2px 0 2px 17px}
.cc-cc .cc-bar-normal i{background:var(--cc-ok)}.cc-cc .cc-bar-atencao i{background:var(--cc-warn)}
.cc-cc .cc-bar-critico i{background:var(--cc-crit)}.cc-cc .cc-bar-sem_comunicacao i{background:var(--cc-off)}
.cc-cc .cc-mleg hr{border:0;border-top:1px solid var(--cc-line);margin:4px 0}
.cc-cc .cc-sevs{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:14px}
.cc-cc .cc-sev{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;padding:3px 7px;border-radius:8px;background:rgba(0,0,0,.2);border:1px solid var(--cc-line);color:var(--cc-text-2)}
.cc-cc a.cc-sev:hover{border-color:rgba(251,191,36,.4)}
.cc-cc .cc-sev b{font-family:var(--cc-f-num);color:var(--cc-text)}

.cc-cc .cc-depts{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px;margin-top:18px}
.cc-cc .cc-dept{padding:16px 16px 12px;border-radius:14px;background:var(--cc-surface);border:1px solid var(--cc-line);display:flex;flex-direction:column;transition:border-color .15s,transform .15s}
.cc-cc .cc-dept:hover{border-color:rgba(251,191,36,.35);transform:translateY(-1px)}
.cc-cc .cc-dh{display:flex;align-items:center;gap:8px;font-weight:600;font-size:13.5px;color:var(--cc-text-2)}
.cc-cc .cc-dh .cc-ic{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;background:var(--cc-surface-3);color:var(--cc-gold-2)}
.cc-cc .cc-dh .cc-go{margin-left:auto;color:var(--cc-faint)}
.cc-cc .cc-dept .cc-big{font-size:26px;margin-top:12px;line-height:1.15}
.cc-cc .cc-dept .cc-big small{font-size:13px;color:var(--cc-muted);font-weight:500;font-family:var(--cc-f-text)}
.cc-cc .cc-dept .cc-big small.cc-pre{font-size:15px;color:var(--cc-text-2);margin-right:2px}
.cc-cc .cc-s1{font-size:12.5px;color:var(--cc-muted);margin-top:6px;min-height:36px}
.cc-cc .cc-st{margin-top:10px;font-size:12px;display:flex;align-items:center;gap:6px;color:var(--cc-text-2);min-width:0}
.cc-cc .cc-st .cc-dot{flex:none}
.cc-cc .cc-st-t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cc-cc .cc-foot{margin-top:26px;display:flex;align-items:center;gap:10px;font-size:12px;color:var(--cc-faint)}

/* Central de Atenção — página */
.cc-att-page .cc-kstrip-sev{margin-bottom:18px}
.cc-att-page .cc-att-grid{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:18px;align-items:start}
.cc-att-page .cc-filtros{margin-bottom:14px;align-items:center}
.cc-att-page .cc-grupo-sev{margin-bottom:18px}
.cc-att-page .cc-grupo-t{display:flex;align-items:center;gap:8px;font-weight:600;font-size:14px;margin:0 0 10px;color:var(--cc-text)}
.cc-att-page .cc-fontes-l{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px;font-size:13px}
.cc-att-page .cc-fontes-l li{display:flex;align-items:center;gap:9px;color:var(--cc-text-2)}
.cc-att-page .cc-fontes-l li>span:nth-child(2){flex:1;min-width:0}
.cc-att-page .cc-fontes-off li{color:var(--cc-muted)}

@media (max-width:1280px){
  .cc-cc .cc-board{grid-template-columns:minmax(0,1fr) 400px}
  .cc-cc .cc-depts{grid-template-columns:repeat(3,minmax(0,1fr))}
  .cc-cc .cc-kstrip-cc{--n:4!important}
  .cc-cc .cc-kstrip-cc .cc-kpi:nth-child(n+5){border-top:1px solid var(--cc-line)}
  .cc-cc .cc-kstrip-cc .cc-kpi:nth-child(5){border-left:0}
}
@media (max-width:980px){
  .cc-cc .cc-board{grid-template-columns:minmax(0,1fr);grid-template-areas:"att" "gen" "map"}
  .cc-att-page .cc-att-grid{grid-template-columns:minmax(0,1fr)}
}
@media (max-width:760px){
  /* Celular: a Central de Atenção sobe logo depois do resumo da Eva (spec §16). */
  .cc-cc:not(.cc-att-page) .cc-wrap{display:flex;flex-direction:column;gap:16px}
  .cc-cc:not(.cc-att-page) .cc-wrap>*{margin:0!important}
  .cc-cc .cc-board{display:contents}
  .cc-cc .cc-hero{order:1} .cc-cc .cc-a-att{order:2} .cc-cc .cc-kstrip-cc{order:3} .cc-cc .cc-a-gen{order:4}
  .cc-cc .cc-a-map{order:5} .cc-cc .cc-depts{order:6} .cc-cc .cc-foot{order:7}
  .cc-cc .cc-hero{grid-template-columns:minmax(0,1fr)} .cc-cc .cc-hero-r{border-left:0;border-top:1px solid var(--cc-line)}
  .cc-cc .cc-hero-l{padding:20px} .cc-cc .cc-hero-l h2{font-size:24px}
  .cc-cc .cc-gsum{grid-template-columns:repeat(2,minmax(0,1fr))}
  .cc-cc .cc-mapwrap{grid-template-columns:minmax(0,1fr)}
  .cc-cc .cc-depts{grid-template-columns:repeat(2,minmax(0,1fr))}
  .cc-cc .cc-depts .cc-dept:last-child{grid-column:1/-1}
  .cc-cc .cc-foot{display:none}
}
`;
