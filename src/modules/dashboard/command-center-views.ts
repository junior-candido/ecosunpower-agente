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
  faixaKpis, kpiCard, cartaoSecao, estadoVazio, cabecalhoPagina, icone, tabela,
  TONS, type KpiInput, type Tom, type TomSelo,
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
import {
  TODAS_PERMISSOES, NOME_CURTO_FONTE,
  type DadosCommandCenter, type FonteAviso, type PermissoesCC, type IdFonte,
} from './command-center-queries.js';
import { MODULOS } from './conhecer-views.js';
import { ECOSUN_COMPANY_ID } from '../tenant-resolver.js';
import { can, ehPapelTv } from './permissions.js';
import { blocoMapaUsinas } from './mapa-usinas-views.js';
import { URL_CSS_COMMAND_CENTER } from './ui/estatico.js';

/** CSS do Command Center/Central por ARQUIVO no <head> (sem piscada — R5). */
const CABECA_CC = `<link rel="stylesheet" href="${URL_CSS_COMMAND_CENTER}">`;

export interface CommandCenterDados {
  agora: Date;
  nomeUsuario: string | null;
  /** null = a carga inteira falhou (a tela mostra "—" em tudo). */
  dados: DadosCommandCenter | null;
  /** Módulos contratados pela empresa (o resto vira vitrine com cadeado).
   *  Ausente = o que veio em `dados` (ou tudo, pra quem chama sem saber). */
  contratados?: PermissoesCC;
  /** Nome da assistente DESTA empresa (campo real do cadastro). null = só "Resumo do dia". */
  nomeAssistente?: string | null;
}

function contratadosDe(d: { contratados?: PermissoesCC; dados: DadosCommandCenter | null }): PermissoesCC {
  return d.contratados ?? d.dados?.contratados ?? TODAS_PERMISSOES;
}

/** Tela da casa (EcoSun) ou legada sem usuário: Modo TV aparece. Tenant, não. */
function ehDaCasa(user?: DashUser): boolean {
  return !user || user.companyId === ECOSUN_COMPANY_ID;
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

/** Níveis que alguma fonte ligada já produz. Os outros (oportunidade: garantias,
 *  campanhas; info: certificado A1) ainda não têm fonte → "—", nunca 0. */
const SEVERIDADES_LIGADAS: ReadonlySet<Severidade> = new Set<Severidade>(['critico', 'atencao', 'acompanhar']);

const ROTULO_AREA: Record<AreaEvento, string> = {
  usinas: 'Usinas', comercial: 'Comercial', marketing: 'Marketing', instalacoes: 'Instalações',
  om: 'O&M', financeiro: 'Financeiro', clientes: 'Clientes',
};

/** Em qual área do menu cai o aviso de cada fonte. */
const AREA_DA_FONTE: Record<IdFonte, AreaEvento> = {
  usinas: 'usinas', leads_esperando: 'comercial', sla: 'comercial', propostas: 'comercial', gd: 'clientes', manutencao: 'om', contas: 'financeiro',
};

/** Alguma fonte não carregou → toda contagem é "pelo menos". */
function ehParcial(fontes: readonly FonteAviso[] | undefined): boolean {
  return !!fontes?.some((f) => f.estado === 'falhou');
}

/** Texto de uma contagem: exata, "≥ N" (faltou fonte) ou "?" (faltou fonte e nada apareceu). */
export function textoContagem(n: number, parcial: boolean): string {
  if (!parcial) return fmtNumero(n);
  return n > 0 ? `≥ ${fmtNumero(n)}` : '?';
}

/** Selos do menu com a contagem real de avisos crítico + atenção por área.
 *  Área cuja fonte não carregou não some: mostra "≥ N" ou "?". */
export function selosDoMenu(eventos: readonly EventoAtencao[], fontes: readonly FonteAviso[] = []): Partial<Record<IdGrupo, SeloGrupo>> {
  const out: Partial<Record<IdGrupo, SeloGrupo>> = {};
  for (const area of AREAS_EVENTO) {
    const daArea = eventos.filter((e) => e.area === area && (e.severidade === 'critico' || e.severidade === 'atencao'));
    const falhou = fontes.some((f) => f.estado === 'falhou' && AREA_DA_FONTE[f.id] === area);
    if (!daArea.length && !falhou) continue;
    const tom: TomSelo = daArea.some((e) => e.severidade === 'critico') ? 'critico' : daArea.length ? 'dourado' : 'neutro';
    out[area as IdGrupo] = { valor: falhou ? textoContagem(daArea.length, true) : daArea.length, tom };
  }
  return out;
}

/** "usinas, propostas e contas a pagar" — só as fontes que carregaram. null = nenhuma ligada. */
function fontesLigadasTexto(fontes: readonly FonteAviso[]): string | null {
  const ok = fontes.filter((f) => f.estado === 'ok').map((f) => NOME_CURTO_FONTE[f.id]);
  if (!ok.length) return null;
  return ok.length === 1 ? ok[0] : `${ok.slice(0, -1).join(', ')} e ${ok[ok.length - 1]}`;
}

const todasLigadas = (fontes: readonly FonteAviso[]) => fontes.length > 0 && fontes.every((f) => f.estado === 'ok');

/** Nenhuma fonte de aviso liberada pra este usuário (não contratado / sem acesso): vitrine, não "tudo em dia". */
function semFonteLiberada(): string {
  return estadoVazio({
    tipo: 'vazio', icone: 'lock', titulo: 'Os avisos aparecem quando o módulo estiver liberado',
    texto: 'Nenhuma fonte de avisos está liberada para você agora. Os blocos com cadeado mostram o que cada módulo traz.',
  });
}

/** "Tudo em dia" que nomeia SÓ o que foi conferido. */
function tudoEmDia(fontes: readonly FonteAviso[]): string {
  const lig = fontesLigadasTexto(fontes);
  if (!lig) return semFonteLiberada();
  return estadoVazio({ tipo: 'vazio', titulo: 'Tudo em dia por aqui', texto: `Nenhum aviso de ${lig}.` });
}

// ---------------------------------------------------------------------------
// Vitrine: bloco de módulo que a empresa não contratou
// ---------------------------------------------------------------------------

/** Uma linha, em português simples, do que cada módulo faz (sem número nenhum). */
export const FRASE_VITRINE = {
  monitoramento: 'Veja as usinas dos seus clientes numa tela só e saiba na hora quando uma para de gerar.',
  manutencao: 'Agenda de manutenção das usinas, com aviso do que já venceu.',
  usinas_kanban: 'Cada obra numa etapa, da homologação à ligação, sem ninguém perguntar como está.',
  financeiro: 'O que entra, o que sai e o que vence, numa tela só.',
  propostas: 'Proposta pronta em minutos e aviso de quem parou de responder.',
  leads: 'Os contatos que chegam pela assistente, com aviso de quem está esperando resposta.',
  marketing: 'Anúncio, blog e e-mail saindo do mesmo lugar em que os leads chegam.',
} as const;
export type ChaveVitrine = keyof typeof FRASE_VITRINE;

export interface BlocoTrancadoInput {
  titulo: string;
  chave: ChaveVitrine;
  frase: string;
  /** Onde o bloco entra: painel grande, célula da faixa de KPIs ou cartão de área. */
  variante?: 'painel' | 'kpi' | 'dept';
  classe?: string;
  /** Painel grande: lista "o que você ganha" da vitrine (/conhecer). */
  comGanhos?: boolean;
}

/**
 * Bloco trancado (vitrine). Cadeado + título + uma frase + botão pra conhecer.
 * NUNCA mostra número, "—" ou "sem acesso": o módulo não é da empresa, então
 * não há o que medir — só o que ele faria.
 */
export function blocoTrancado(b: BlocoTrancadoInput): string {
  const v = b.variante ?? 'painel';
  const raiz = v === 'kpi' ? 'cc-kpi cc-kpi-tranc' : v === 'dept' ? 'cc-dept cc-dept-tranc' : 'cc-panel cc-panel-tranc';
  const ganhos = b.comGanhos ? (MODULOS[b.chave]?.ganhos ?? []) : [];
  const tag = v === 'painel' ? 'section' : 'div';
  return `<${tag} class="${raiz} cc-tranc${b.classe ? ` ${escapeHtml(b.classe)}` : ''}" data-trancado="${escapeHtml(b.chave)}">
    <div class="cc-tranc-h"><span class="cc-tranc-ic">${icone('lock', 'sm')}</span><b>${escapeHtml(b.titulo)}</b><span class="cc-tranc-tag">Fora do seu plano</span></div>
    <p>${escapeHtml(b.frase)}</p>
    ${ganhos.length ? `<ul class="cc-tranc-g">${ganhos.map((g) => `<li>${icone('check', 'xs')}${escapeHtml(g)}</li>`).join('')}</ul>` : ''}
    <a class="cc-btn cc-btn-sm cc-btn-tranc" href="/dashboard/conhecer/${encodeURIComponent(b.chave)}">Quero liberar / falar com o suporte</a>
  </${tag}>`;
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
  // leads do mês pode vir só pelo Marketing: a frase do funil exige a permissão de leads.
  if (dd.permissoes.leads && temNumero(k.leads) && temNumero(k.propostas) && temNumero(k.vendas)) {
    out.push(`Neste mês entraram <b>${escapeHtml(plural(k.leads, 'lead', 'leads'))}</b>, foram feitas <b>${escapeHtml(plural(k.propostas, 'proposta', 'propostas'))}</b> e <b>${escapeHtml(plural(k.vendas, 'venda fechou', 'vendas fecharam'))}</b>.`);
  }
  const crit = contarPorSeveridade(dd.eventos).critico;
  const falhou = fontesComFalha(dd.fontes).length > 0;
  if (crit > 0) {
    out.push(`Há <b>${falhou ? 'pelo menos ' : ''}${escapeHtml(plural(crit, 'aviso crítico', 'avisos críticos'))}</b> pedindo você agora.`);
  } else if (!falhou) {
    // Só afirma sobre o que foi conferido de verdade.
    const lig = fontesLigadasTexto(dd.fontes);
    if (todasLigadas(dd.fontes)) out.push('Nenhum aviso crítico agora.');
    else if (lig) out.push(`Nenhum aviso crítico em ${escapeHtml(lig)} agora.`);
  }
  return out;
}

/** Nenhum bloco liberado pra este usuário (nada contratado, ou papel sem acesso a nada). */
const nadaLiberado = (dd: DadosCommandCenter) => !Object.values(dd.permissoes).some(Boolean);

function chipsMudancas(dd: DadosCommandCenter | null): string {
  if (dd && nadaLiberado(dd)) return estadoVazio({ tipo: 'vazio', icone: 'lock', compacto: true, titulo: 'Nada liberado para comparar ainda' });
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
    if (fontesComFalha(dd.fontes).length) {
      return estadoVazio({ tipo: 'sem_dado', titulo: 'Parte dos avisos não carregou', texto: 'Sem essas fontes não dá pra dizer qual é a próxima ação. Veja a Central de Atenção.' });
    }
    const lig = fontesLigadasTexto(dd.fontes);
    if (!lig) return semFonteLiberada();
    return estadoVazio({
      tipo: 'vazio', titulo: 'Nada urgente agora',
      texto: todasLigadas(dd.fontes)
        ? 'Nenhum aviso pedindo ação. O que está só em acompanhamento fica na Central de Atenção.'
        : `Nenhum aviso pedindo ação em ${lig}.`,
    });
  }
  return acoes.map((e, i) => `<div class="cc-act${i === 0 ? ' cc-act-1' : ''}">
      <span class="cc-act-n">${i + 1}</span>
      <div>${i === 0 ? '<span class="cc-act-tag">Próxima ação mais importante</span>' : ''}<b>${escapeHtml(e.titulo)}</b><small>${escapeHtml([e.impactoTexto, e.detalhe ?? e.contexto].filter(Boolean).join(' · '))}</small></div>
      <a class="cc-btn cc-btn-sm${i === 0 ? ' cc-btn-gold' : ''}" href="${escapeHtml(hrefAcao(e))}">${escapeHtml(e.acao.rotulo)}</a>
    </div>`).join('')
    + (fontesComFalha(dd.fontes).length ? '<p class="cc-nota">Parte dos avisos não carregou agora — a ordem pode mudar quando voltar.</p>' : '');
}

function hero(d: CommandCenterDados): string {
  const nome = (d.nomeUsuario ?? '').trim().split(/\s+/)[0] ?? '';
  const frases = d.dados ? frasesResumo(d.dados) : [];
  const resumo = frases.length
    ? `<p>${frases.join(' ')}</p>`
    : d.dados && nadaLiberado(d.dados)
      ? '<p>Os números aparecem aqui quando um módulo estiver liberado. Os blocos com cadeado mostram o que cada um traz.</p>'
      : '<p>Ainda não consegui ler os números agora. Tente de novo em alguns minutos — nada aqui é chute.</p>';
  return `<section class="cc-hero">
    <div class="cc-hero-l">
      <div class="cc-who"><div class="cc-eva-av">${icone('spark')}</div><div><span class="cc-lbl-s cc-gold">${escapeHtml(d.nomeAssistente ? `${d.nomeAssistente} · resumo do dia` : 'Resumo do dia')}</span><div class="cc-faint" style="font-size:12px">${escapeHtml(carimboAoVivo(d.agora))}</div></div></div>
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
  const c = contratadosDe(d);
  const f = dd?.frota ?? null;
  const semUsinas = semTexto(p, 'usinas');

  const hoje = energiaLegivel(f?.energiaHojeKwh);
  const mes = energiaLegivel(f?.energiaMesKwh);
  const pot = f?.potenciaKwp ?? null;
  const potMw = temNumero(pot) && pot >= 1000;

  const celulas: string[] = [];
  const trancadas: BlocoTrancadoInput[] = [];
  if (c.usinas) {
    const usinas: KpiInput[] = [
      {
        rotulo: 'Geração agora', valor: f?.geracaoAgora?.kw ?? null, casas: 1, unidade: 'kW', href: '/dashboard/monitoramento',
        detalhe: f?.geracaoAgora ? `${plural(f.geracaoAgora.usinas, 'usina', 'usinas')} ao vivo${dd?.telemetriaCortada ? ' (parcial)' : ''}` : undefined,
        semDadoTexto: f ? 'sem leitura ao vivo agora' : semUsinas,
      },
      {
        rotulo: 'Energia hoje', valor: hoje.valor, casas: hoje.casas, unidade: hoje.unidade, href: '/dashboard/monitoramento',
        detalhe: f ? 'até agora' : undefined,
        semDadoTexto: f ? 'sem leitura hoje ainda' : semUsinas,
      },
      {
        rotulo: 'Energia no mês', valor: mes.valor, casas: mes.casas, unidade: mes.unidade, href: '/dashboard/monitoramento',
        detalhe: 'desde o dia 1º', semDadoTexto: f ? 'sem leitura no mês' : semUsinas,
      },
      {
        rotulo: 'Potência total', valor: potMw ? (pot as number) / 1000 : pot, casas: potMw ? 2 : 1, unidade: potMw ? 'MWp' : 'kWp',
        href: '/dashboard/monitoramento', detalhe: f ? plural(f.total, 'usina ativa', 'usinas ativas') : undefined,
        semDadoTexto: f ? 'sem potência cadastrada' : semUsinas,
      },
      {
        rotulo: 'Usinas no ar', valor: f && f.monitoradas > 0 ? f.comunicando : null, unidade: f ? `/ ${fmtNumero(f.monitoradas)}` : undefined,
        href: '/dashboard/monitoramento',
        detalhe: f ? (f.porEstado.sem_comunicacao ? `${fmtNumero(f.porEstado.sem_comunicacao)} sem sinal` : 'todas com sinal') : undefined,
        semDadoTexto: f ? 'nenhuma usina monitorada' : semUsinas,
      },
    ];
    celulas.push(...usinas.map(kpiCard));
  } else {
    trancadas.push({ titulo: 'Usinas', chave: 'monitoramento', frase: FRASE_VITRINE.monitoramento, variante: 'kpi' });
  }
  if (c.financeiro) {
    // Mesmo número e mesmo nome da tela Financeiro ("Recebido no mês"), pra não confundir com "faturado".
    celulas.push(kpiCard({
      rotulo: 'Recebido', valor: dd?.recebidoMes ?? null, prefixo: 'R$', compacto: true, href: '/dashboard/financeiro',
      detalhe: 'no mês', semDadoTexto: semTexto(p, 'financeiro'),
    }));
  } else {
    trancadas.push({ titulo: 'Financeiro', chave: 'financeiro', frase: FRASE_VITRINE.financeiro, variante: 'kpi' });
  }
  if (c.leads) {
    // kpisMes.leads pode ter vindo só pelo Marketing: aqui vale a permissão de leads.
    const leadsMes = p && !p.leads ? null : dd?.kpisMes.leads ?? null;
    celulas.push(kpiCard({
      rotulo: 'Leads do mês', valor: leadsMes, href: '/dashboard/leads',
      detalhe: temNumero(dd?.mudancas24h.leads) ? `+${fmtNumero(dd!.mudancas24h.leads)} desde ontem` : 'ver leads', semDadoTexto: semTexto(p, 'leads'),
    }));
    celulas.push(kpiCard({
      rotulo: 'Vendas', valor: dd?.kpisMes.vendas ?? null, href: '/dashboard/leads/kanban', destaque: true,
      detalhe: temNumero(dd?.kpisMes.propostas) ? plural(dd!.kpisMes.propostas as number, 'proposta', 'propostas') : 'fechadas no mês',
      semDadoTexto: semTexto(p, 'leads'),
    }));
  } else {
    trancadas.push({ titulo: 'Leads e vendas', chave: 'leads', frase: FRASE_VITRINE.leads, variante: 'kpi' });
  }
  // Célula trancada ocupa 2 colunas (a frase e o botão não cabem numa coluna de KPI).
  // Faixa cheia (passaria de 8 colunas): a trancada vira uma linha inteira embaixo.
  const emLinha = celulas.length + trancadas.length * 2 > 8;
  const n = emLinha ? celulas.length : celulas.length + trancadas.length * 2;
  const tr = trancadas.map((t) => blocoTrancado({ ...t, classe: emLinha ? 'cc-tranc-linha' : undefined }));
  return `<section class="cc-kstrip cc-kstrip-cc" style="--n:${Math.max(1, n)}">${emLinha ? celulas.join('') + tr.join('') : tr.join('') + celulas.join('')}</section>`;
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

  const casasY = (v: number) => (Number.isInteger(v) ? 0 : Number.isInteger(Math.round(v * 1000) / 100) ? 1 : 2);
  const rotY = [1, 0.5, 0].map((f) => {
    const v = (topo * f) / divisor;
    return `<span style="top:${(1 - f) * 100}%">${escapeHtml(fmtNumero(v, casasY(v)))}</span>`;
  }).join('');
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

  const legenda = `<div class="cc-chart-leg"><span><i class="cc-sw-real"></i>Real</span>${temEsperada ? '<span><i class="cc-sw-esp"></i>Esperada (média de sol da região)</span>' : ''}<span class="cc-sp"></span><span class="cc-faint cc-hide-m">Passe o mouse numa barra para ver o dia</span></div>`;
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
// Usinas agora: estados reais + por cidade (o mapa fica logo abaixo do quadro)
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
          <p class="cc-nota"><a class="cc-link" href="#cc-mapa-usinas">Ver no mapa ${icone('right', 'xs')}</a></p></div>
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

function legendaSeveridades(eventos: readonly EventoAtencao[] | null, linkar: boolean, parcial = false): string {
  const c = eventos ? contarPorSeveridade(eventos) : null;
  return `<div class="cc-sevs">${ORDEM_SEVERIDADE.map((s) => {
    const tom = TONS[TOM_DA_SEVERIDADE[s]];
    const ligada = SEVERIDADES_LIGADAS.has(s);
    const inner = `<span class="cc-dot ${tom.ponto}"></span>${escapeHtml(tom.rotulo)} <b>${c && ligada ? escapeHtml(textoContagem(c[s], parcial)) : SEM_DADO}</b>`;
    return linkar && c && ligada ? `<a class="cc-sev" href="/dashboard/atencao?severidade=${s}">${inner}</a>` : `<span class="cc-sev">${inner}</span>`;
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
    : falha ? '' : tudoEmDia(dd.fontes);
  return cartaoSecao({
    titulo: 'Central de Atenção',
    classe: 'cc-a-att',
    acoesHtml: `<a class="cc-link" href="/dashboard/atencao">${todos.length > top.length ? `Ver os ${escapeHtml(fmtNumero(todos.length))}` : 'Ver todos'} ${icone('right', 'xs')}</a>`,
    corpoHtml: `${legendaSeveridades(todos, true, ehParcial(dd.fontes))}${falha}${lista}`,
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
    if (fs.every((f) => f.estado === 'sem_acesso' || f.estado === 'nao_contratado')) return null;
    const lista = dd.eventos.filter((e) => e.area === area);
    // Fonte da área falhou e nada apareceu: não dá pra dizer "nada pedindo atenção".
    if (!lista.length && fs.some((f) => f.estado === 'falhou')) return null;
    return lista;
  };
  const m = dd?.manutencao ?? null;
  const c = contratadosDe(d);
  const tranca = (titulo: string, chave: ChaveVitrine) => blocoTrancado({ titulo, chave, frase: FRASE_VITRINE[chave], variante: 'dept' });
  return `<section class="cc-depts">
    ${c.leads ? dept({
      titulo: 'Comercial', icone: 'users', href: '/dashboard/leads/kanban', valor: k?.propostas ?? null, legenda: 'propostas no mês', semTexto: semTexto(p, 'propostas'),
      linha: temNumero(k?.vendas) ? `${plural(k!.vendas as number, 'venda fechada', 'vendas fechadas')} no mês` : 'Pipeline e conversão: próxima entrega',
      avisos: avisosDe('comercial', ['leads_esperando', 'sla', 'propostas']),
    }) : tranca('Comercial', 'leads')}
    ${c.marketing ? dept({
      titulo: 'Marketing', icone: 'mega', href: '/dashboard/marketing', valor: p && !p.marketing ? null : k?.leads ?? null, legenda: 'leads no mês',
      semTexto: semTexto(p, 'marketing'), linha: 'Investimento e custo por lead: próxima entrega',
    }) : tranca('Marketing', 'marketing')}
    ${c.usinas ? dept({
      titulo: 'Instalações', icone: 'hammer', href: '/dashboard/usinas/kanban', valor: k?.usinasNovas ?? null, legenda: 'usinas novas', semTexto: semTexto(p, 'usinas'),
      linha: 'Cadastradas no mês · obras por etapa: próxima entrega',
    }) : tranca('Instalações', 'usinas_kanban')}
    ${c.usinas ? dept({
      titulo: 'O&M', icone: 'wrench', href: '/dashboard/manutencao', valor: m?.vencidas ?? null, legenda: m?.vencidas === 1 ? 'vencida' : 'vencidas', semTexto: semTexto(p, 'usinas'),
      linha: m ? `Manutenções · ${plural(m.proximas30, 'agendada', 'agendadas')} nos próximos 30 dias` : 'Agenda de manutenção',
      avisos: avisosDe('om', ['manutencao']),
    }) : tranca('O&M', 'manutencao')}
    ${c.financeiro ? dept({
      titulo: 'Financeiro', icone: 'wallet', href: '/dashboard/financeiro', valor: dd?.recebidoMes ?? null, dinheiro: true, legenda: 'recebido', semTexto: semTexto(p, 'financeiro'),
      linha: 'No mês · margem e a receber: próxima entrega',
      avisos: avisosDe('financeiro', ['contas']),
    }) : tranca('Financeiro', 'financeiro')}
  </section>`;
}

// ---------------------------------------------------------------------------
// Página: Command Center
// ---------------------------------------------------------------------------

/** Selo do botão "Central de Atenção": nº de críticos; com fonte faltando, "≥ N" ou "?" (nunca some). */
function seloCriticos(dd: DadosCommandCenter | null): string {
  if (!dd) return '';
  const crit = contarPorSeveridade(dd.eventos).critico;
  const parcial = ehParcial(dd.fontes);
  if (!crit && !parcial) return '';
  const titulo = parcial ? ' title="Parte dos avisos não carregou: pode haver mais"' : '';
  return `<span class="cc-bdg${crit ? ' cc-bdg-r' : ''}"${titulo}>${escapeHtml(textoContagem(crit, parcial))}</span>`;
}

export function renderCommandCenterPage(d: CommandCenterDados, user?: DashUser): string {
  const casa = ehDaCasa(user);
  const c = contratadosDe(d);
  const cab = cabecalhoPagina({
    titulo: 'Command Center',
    aoVivo: carimboAoVivo(d.agora),
    subtitulo: 'Como está a empresa agora, o que mudou e qual é a próxima ação mais importante.',
    acoesHtml: `<a class="cc-btn" href="/dashboard/atencao">${icone('bell', 'sm')}Central de Atenção${seloCriticos(d.dados)}</a>`
      // Modo TV é só da casa (a rota manda o tenant pro Cockpit).
      + (casa ? `<a class="cc-btn" href="/dashboard/tv">${icone('tv', 'sm')}Modo TV</a>` : ''),
  });
  // Monitoramento não contratado: um bloco trancado no lugar da curva e do "Usinas agora".
  const quadroUsinas = c.usinas
    ? `${geracao(d)}
      ${usinasAgora(d)}`
    : blocoTrancado({
      titulo: 'Usinas: geração e estado agora', chave: 'monitoramento', frase: FRASE_VITRINE.monitoramento,
      comGanhos: true, classe: 'cc-a-genmap',
    });

  // Mapa das usinas: módulo contratado E papel que vê usinas (a rota mapa.json confere de novo).
  const veUsinas = d.dados ? d.dados.permissoes.usinas : !user || can(user, 'usinas', 'visualizar');
  const mapa = c.usinas && veUsinas ? blocoMapaUsinas({ podeLocalizar: !user || can(user, 'usinas', 'editar') }) : '';

  const body = `<div class="cc-root cc-cc">
  ${cab}
  <div class="cc-wrap">
    ${hero(d)}
    ${kpis(d)}
    <div class="cc-board">
      ${quadroUsinas}
      ${centralAtencao(d)}
    </div>
    ${mapa}
    ${departamentos(d)}
    <div class="cc-foot">${casa ? `${icone('tv', 'sm')}Modo TV: a tela do escritório vai girar entre visão geral, usinas e comercial. ` : ''}<span class="cc-sp"></span>Todo número é clicável e leva ao detalhe.${
      // R5 (D2 = a): o Cockpit saiu do menu; link discreto só da casa por 30 dias (sai no R25).
      casa ? ` <a class="cc-cockpit-antigo" href="/dashboard/cockpit">Cockpit antigo</a>` : ''}</div>
  </div>
</div>
`;

  return renderLayout({
    active: 'command_center', title: 'Command Center', body, dark: true, largo: true, user, tailwind: false, cabeca: CABECA_CC,
    selos: d.dados ? selosDoMenu(d.dados.eventos, d.dados.fontes) : undefined,
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
  const parcial = ehParcial(dd?.fontes);

  const cab = cabecalhoPagina({
    titulo: 'Central de Atenção',
    trilha: [{ rotulo: 'Command Center', href: '/dashboard/command-center' }, { rotulo: 'Central de Atenção' }],
    aoVivo: carimboAoVivo(c.agora),
    subtitulo: 'Um lugar só para tudo que pede ação — usinas, vendas, manutenção, créditos e dinheiro. Ordem: o que tem mais impacto primeiro.',
  });

  const faixa = faixaKpis(ORDEM_SEVERIDADE.map((s): KpiInput => ({
    rotulo: TONS[TOM_DA_SEVERIDADE[s]].rotulo,
    valor: dd && SEVERIDADES_LIGADAS.has(s) ? cont[s] : null,
    // Fonte faltando: "≥ N" — pode haver mais do que isso.
    prefixo: parcial && SEVERIDADES_LIGADAS.has(s) ? '≥' : undefined,
    detalhe: parcial && SEVERIDADES_LIGADAS.has(s) ? `${TEXTO_SEVERIDADE[s]} (parcial)` : TEXTO_SEVERIDADE[s],
    href: SEVERIDADES_LIGADAS.has(s) ? hrefFiltro(area, sev === s ? null : s) : undefined,
    semDadoTexto: SEVERIDADES_LIGADAS.has(s) ? SEM_DADO_AGORA : EM_CONSTRUCAO,
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
        : tudoEmDia(dd.fontes);
  } else {
    lista = ORDEM_SEVERIDADE.map((s) => {
      const doGrupo = filtrados.filter((e) => e.severidade === s);
      if (!doGrupo.length) return '';
      return `<div class="cc-grupo-sev"><div class="cc-grupo-t"><span class="cc-dot ${TONS[TOM_DA_SEVERIDADE[s]].ponto}"></span>${escapeHtml(TONS[TOM_DA_SEVERIDADE[s]].rotulo)} <span class="cc-faint">${escapeHtml(fmtNumero(doGrupo.length))}</span></div>
        <div class="cc-evs cc-evs-lista">${doGrupo.map(cartaoEvento).join('')}</div></div>`;
    }).join('');
  }

  const ROTULO_ESTADO_FONTE = { ok: 'ligada', falhou: 'não carregou', sem_acesso: 'sem acesso', nao_contratado: 'não contratado' } as const;
  const TOM_ESTADO_FONTE = { ok: 'normal', falhou: 'critico', sem_acesso: 'sem_dado', nao_contratado: 'sem_dado' } as const;
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
`;

  return renderLayout({
    active: 'atencao', title: 'Central de Atenção', body, dark: true, largo: true, user, tailwind: false, cabeca: CABECA_CC,
    selos: dd ? selosDoMenu(dd.eventos, dd.fontes) : undefined,
  });
}

// ---------------------------------------------------------------------------
// Página: Modo TV (fase I / renovação do miolo R26, D6 = a)
// Tela de parede: 3 visões girando a cada 30 s (visão geral · usinas ·
// comercial), atalho T = tela cheia, ← → troca na mão. Só números e quadros do
// Command Center da empresa da sessão — nada de nome de cliente, nada de
// dinheiro (a rota carrega com PERMISSOES_TV). Casca escondida (menu, barra,
// rodapé): é uma TV. Recarrega sozinha a cada 5 min pra trazer número novo.
// ---------------------------------------------------------------------------

const CSS_TV = `
/* TV: sem menu, barra de cima nem rodapé (:has pinta já no 1º quadro; a classe do script é reserva) */
.cc-shell:has(#cc-tv) .cc-sb,.cc-shell:has(#cc-tv) .cc-mtop,.cc-shell:has(#cc-tv) .cc-backdrop,.cc-shell:has(#cc-tv) .cc-rodape,
.cc-shell.cc-tv-shell .cc-sb,.cc-shell.cc-tv-shell .cc-mtop,.cc-shell.cc-tv-shell .cc-backdrop,.cc-shell.cc-tv-shell .cc-rodape{display:none!important}
.cc-tv{min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;padding:28px 36px 22px;gap:18px}
.cc-tv-topo{display:flex;align-items:center;gap:18px;flex-wrap:wrap}
.cc-tv-topo h1{font-family:var(--cc-f-num,'Space Grotesk',system-ui,sans-serif);font-size:30px;font-weight:700;color:var(--cc-text);margin:0}
.cc-tv-topo .cc-tv-emp{font-size:15px;color:var(--cc-muted)}
.cc-tv-relogio{font-family:var(--cc-f-num,'Space Grotesk',system-ui,sans-serif);font-size:38px;font-weight:700;color:var(--cc-gold-2);font-variant-numeric:tabular-nums;letter-spacing:.02em}
.cc-tv-pontos{display:flex;gap:8px;align-items:center}
.cc-tv-pontos button{width:34px;height:8px;border-radius:99px;border:0;background:var(--cc-line-2);cursor:pointer;padding:0}
.cc-tv-pontos button[aria-current="true"]{background:var(--cc-gold)}
.cc-tv-visao{display:none;flex:1;flex-direction:column;gap:18px;animation:ccTvEntra .5s ease}
.cc-tv-visao.cc-tv-on{display:flex}
@keyframes ccTvEntra{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.cc-tv-visao{animation:none}}
.cc-tv-titulo{font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--cc-muted)}
.cc-tv .cc-kstrip .cc-val{font-size:44px}
.cc-tv .cc-kstrip .cc-lbl{font-size:15px}
.cc-tv .cc-kstrip .cc-dl{font-size:14px}
.cc-tv-grade{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:18px;align-items:start}
.cc-tv-grade .cc-panel{margin:0}
.cc-tv .cc-sevs{font-size:18px;gap:22px}
.cc-tv-rodape{display:flex;align-items:center;gap:14px;font-size:13px;color:var(--cc-faint)}
.cc-tv-rodape kbd{font-family:inherit;border:1px solid var(--cc-line-2);border-radius:6px;padding:1px 7px;color:var(--cc-muted)}
.cc-tv-rodape a{color:var(--cc-muted);text-decoration:underline}
@media (max-width:900px){.cc-tv{padding:18px 16px}.cc-tv-grade{grid-template-columns:minmax(0,1fr)}.cc-tv .cc-kstrip .cc-val{font-size:30px}.cc-tv-relogio{font-size:26px}}
`;

/** KPIs da TV: só os números que o Command Center já calcula, sem dinheiro. */
function kpisTv(d: CommandCenterDados, parte: 'geral' | 'comercial'): string {
  const dd = d.dados;
  const c = contratadosDe(d);
  const f = dd?.frota ?? null;
  const hoje = energiaLegivel(f?.energiaHojeKwh);
  const mes = energiaLegivel(f?.energiaMesKwh);
  const lista: KpiInput[] = [];
  if (parte === 'geral' && c.usinas) {
    lista.push(
      { rotulo: 'Geração agora', valor: f?.geracaoAgora?.kw ?? null, casas: 1, unidade: 'kW', detalhe: f?.geracaoAgora ? `${plural(f.geracaoAgora.usinas, 'usina', 'usinas')} ao vivo` : undefined, semDadoTexto: 'sem leitura ao vivo agora' },
      { rotulo: 'Energia hoje', valor: hoje.valor, casas: hoje.casas, unidade: hoje.unidade, detalhe: f ? 'até agora' : undefined, semDadoTexto: 'sem leitura hoje ainda' },
      { rotulo: 'Energia no mês', valor: mes.valor, casas: mes.casas, unidade: mes.unidade, detalhe: 'desde o dia 1º', semDadoTexto: 'sem leitura no mês' },
      { rotulo: 'Usinas no ar', valor: f && f.monitoradas > 0 ? f.comunicando : null, unidade: f ? `/ ${fmtNumero(f.monitoradas)}` : undefined, detalhe: f ? (f.porEstado.sem_comunicacao ? `${fmtNumero(f.porEstado.sem_comunicacao)} sem sinal` : 'todas com sinal') : undefined, semDadoTexto: 'nenhuma usina monitorada' },
    );
  }
  if (c.leads) {
    lista.push({ rotulo: 'Vendas do mês', valor: dd?.kpisMes.vendas ?? null, destaque: true, detalhe: temNumero(dd?.mudancas24h.vendas) ? `+${fmtNumero(dd!.mudancas24h.vendas)} desde ontem` : 'fechadas no mês' });
    if (parte === 'comercial') {
      lista.push(
        { rotulo: 'Leads do mês', valor: dd?.kpisMes.leads ?? null, detalhe: temNumero(dd?.mudancas24h.leads) ? `+${fmtNumero(dd!.mudancas24h.leads)} desde ontem` : undefined },
        { rotulo: 'Propostas do mês', valor: dd?.kpisMes.propostas ?? null, detalhe: temNumero(dd?.mudancas24h.propostas) ? `+${fmtNumero(dd!.mudancas24h.propostas)} desde ontem` : undefined },
      );
    }
  }
  if (parte === 'comercial' && c.usinas) {
    lista.push({ rotulo: 'Usinas novas no mês', valor: dd?.kpisMes.usinasNovas ?? null, detalhe: 'obras que viraram usina' });
  }
  return lista.length ? faixaKpis(lista) : '';
}

export function renderModoTvPage(user?: DashUser, d?: CommandCenterDados): string {
  const dados: CommandCenterDados = d ?? { agora: new Date(), nomeUsuario: user?.nome ?? null, dados: null };
  const dd = dados.dados;
  const c = contratadosDe(dados);
  const empresaNome = user?.companyNome && !ehDaCasa(user) ? user.companyNome : 'EcoSunPower';
  const semDado = !dd
    ? estadoVazio({ tipo: 'sem_dado', titulo: 'Sem dado agora', texto: 'A TV tenta de novo sozinha em alguns minutos.' })
    : '';

  const visoes: Array<{ id: string; titulo: string; html: string }> = [];
  visoes.push({
    id: 'geral', titulo: 'Visão geral',
    html: `${kpisTv(dados, 'geral')}
      ${cartaoSecao({ titulo: 'Avisos agora', dica: 'contagem da Central de Atenção', corpoHtml: legendaSeveridades(dd ? dd.eventos : null, false, ehParcial(dd?.fontes)) })}
      ${semDado}`,
  });
  if (c.usinas) {
    visoes.push({
      id: 'usinas', titulo: 'Usinas',
      html: dd ? `<div class="cc-tv-grade">${geracao(dados)}${usinasAgora(dados)}</div>` : semDado,
    });
  }
  if (c.leads) {
    visoes.push({ id: 'comercial', titulo: 'Comercial', html: `${kpisTv(dados, 'comercial')}${semDado}` });
  }

  const tvPuro = ehPapelTv(user);
  const body = `<div class="cc-root cc-cc cc-tv" id="cc-tv">
  <header class="cc-tv-topo">
    <div><h1>${escapeHtml(empresaNome)}</h1><div class="cc-tv-emp">Modo TV · <span id="cc-tv-nome-visao">${escapeHtml(visoes[0].titulo)}</span></div></div>
    <span class="cc-sp"></span>
    <nav class="cc-tv-pontos" aria-label="Visões">${visoes.map((v, i) => `<button type="button" data-visao="${i}" aria-label="${escapeHtml(v.titulo)}"${i === 0 ? ' aria-current="true"' : ''}></button>`).join('')}</nav>
    <div class="cc-tv-relogio" id="cc-tv-relogio">${escapeHtml(new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(dados.agora))}</div>
  </header>
  ${visoes.map((v, i) => `<section class="cc-tv-visao${i === 0 ? ' cc-tv-on' : ''}" data-titulo="${escapeHtml(v.titulo)}" aria-label="${escapeHtml(v.titulo)}">
    <div class="cc-tv-titulo">${escapeHtml(v.titulo)}</div>
    ${v.html}
  </section>`).join('')}
  <footer class="cc-tv-rodape"><span>${escapeHtml(carimboAoVivo(dados.agora))}</span><span class="cc-sp"></span><span><kbd>T</kbd> tela cheia · <kbd>←</kbd> <kbd>→</kbd> trocar</span>${tvPuro ? '' : '<a href="/dashboard/command-center">sair do Modo TV</a>'}</footer>
</div>`;

  const scripts = `<script>
(function () {
  var visoes = Array.prototype.slice.call(document.querySelectorAll('.cc-tv-visao'));
  var pontos = Array.prototype.slice.call(document.querySelectorAll('.cc-tv-pontos button'));
  var nome = document.getElementById('cc-tv-nome-visao');
  var atual = 0, GIRO = 30000, timer = null;
  function mostrar(i) {
    if (!visoes.length) return;
    atual = (i + visoes.length) % visoes.length;
    visoes.forEach(function (v, k) { v.classList.toggle('cc-tv-on', k === atual); });
    pontos.forEach(function (p, k) { if (k === atual) p.setAttribute('aria-current', 'true'); else p.removeAttribute('aria-current'); });
    if (nome) nome.textContent = visoes[atual].getAttribute('data-titulo') || '';
  }
  function girar() { clearInterval(timer); if (visoes.length > 1) timer = setInterval(function () { mostrar(atual + 1); }, GIRO); }
  pontos.forEach(function (p) { p.addEventListener('click', function () { mostrar(Number(p.dataset.visao) || 0); girar(); }); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 't' || e.key === 'T') {
      if (document.fullscreenElement) { if (document.exitFullscreen) document.exitFullscreen(); }
      else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {});
    } else if (e.key === 'ArrowRight') { mostrar(atual + 1); girar(); }
    else if (e.key === 'ArrowLeft') { mostrar(atual - 1); girar(); }
  });
  var relogio = document.getElementById('cc-tv-relogio');
  var fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  setInterval(function () { if (relogio) relogio.textContent = fmt.format(new Date()); }, 15000);
  girar();
  // Número novo a cada 5 minutos (a TV fica ligada o dia inteiro).
  setTimeout(function () { location.reload(); }, 300000);
})();
</script>`;

  const shell = `<script>document.querySelector('.cc-shell') && document.querySelector('.cc-shell').classList.add('cc-tv-shell');</script>`;
  return renderLayout({
    active: 'tv', title: 'Modo TV', body, scripts: shell + scripts, dark: true, largo: true, imersivo: true, user, tailwind: false,
    cabeca: `${CABECA_CC}<style>${CSS_TV}</style>`,
  });
}
