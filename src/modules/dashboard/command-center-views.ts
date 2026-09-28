// src/modules/dashboard/command-center-views.ts
// Command Center — FASE A (spec docs/superpowers/specs/2026-09-27-command-center-design.md).
//
// Layout do protótipo aprovado pelo Junior ("muito top"), montado com os
// componentes do design system (ui/). REGRA: número só se for real. Nesta fase
// só existem os contadores do mês de `fetchDashboardKpis` (leads, propostas,
// vendas, usinas novas, manutenções pendentes) — e só pra EcoSun. Todo o resto
// mostra "Em construção — próxima entrega". A fase B liga o resto com dado real
// e o motor da Central de Atenção.

import { renderLayout, escapeHtml } from './views.js';
import type { DashUser } from './permissions.js';
import {
  faixaKpis, cartaoSecao, estadoVazio, cabecalhoPagina, icone, filtroGlobal,
  TONS, type KpiInput, type Tom,
} from './ui/componentes.js';
import { fmtNumero, temNumero, SEM_DADO } from './ui/html.js';
import type { NomeIcone } from './ui/icones.js';
import type { CommandCenterKpis } from './queries.js';

export interface CommandCenterDados {
  agora: Date;
  nomeUsuario: string | null;
  /** Contadores do mês (fetchCommandCenterKpis). null (inteiro ou por campo) =
   *  sem dado (a contagem falhou) → a tela mostra "—", nunca 0 inventado.
   *  usinasNovas = sistemas cadastrados no mês; manutencoesPendentes = lembretes
   *  pendentes com data até 30 dias à frente (mesma regra do card da Home). */
  kpisMes: CommandCenterKpis | null;
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

// ---------------------------------------------------------------------------
// Blocos
// ---------------------------------------------------------------------------

function hero(d: CommandCenterDados): string {
  const nome = (d.nomeUsuario ?? '').trim().split(/\s+/)[0] ?? '';
  const k = d.kpisMes;
  // Resumo com número só se as 3 contagens vieram; qualquer falha → texto sem número.
  const resumo = k && temNumero(k.leads) && temNumero(k.propostas) && temNumero(k.vendas)
    ? `<p>Neste mês entraram <b>${escapeHtml(fmtNumero(k.leads))} leads</b>, saíram <b>${escapeHtml(fmtNumero(k.propostas))} propostas</b> e <b>${escapeHtml(fmtNumero(k.vendas))} ${k.vendas === 1 ? 'venda fechou' : 'vendas fecharam'}</b>. O resumo completo da Eva — usinas, obras e dinheiro — chega nas próximas entregas.</p>`
    : `<p>O resumo do dia da Eva — usinas, vendas, obras e dinheiro, com a próxima ação mais importante — chega nas próximas entregas.</p>`;
  return `<section class="cc-hero">
    <div class="cc-hero-l">
      <div class="cc-who"><div class="cc-eva-av">${icone('spark')}</div><div><span class="cc-lbl-s cc-gold">Eva · resumo do dia</span><div class="cc-faint" style="font-size:12px">${escapeHtml(carimboAoVivo(d.agora))}</div></div></div>
      <h2>${escapeHtml(saudacao(d.agora))}${nome ? `, ${escapeHtml(nome)}` : ''}.</h2>
      ${resumo}
      <div class="cc-changed"><span class="cc-lbl-s">O que mudou desde ontem</span>
        ${estadoVazio({ tipo: 'construcao', compacto: true, texto: 'Comparação com o dia anterior (contratos, leads, usinas sem sinal, homologações).' })}
      </div>
    </div>
    <div class="cc-hero-r">
      <div class="cc-hh"><span class="cc-lbl-s">Ações recomendadas</span><span class="cc-sp"></span><a class="cc-link" href="/dashboard/cockpit">Abrir o Cockpit ${icone('right', 'xs')}</a></div>
      ${estadoVazio({ tipo: 'construcao', texto: 'A Eva vai listar aqui as 3 ações de maior impacto do dia — a primeira em destaque, com o botão para resolver.' })}
    </div>
  </section>`;
}

function kpis(d: CommandCenterDados): string {
  const k = d.kpisMes;
  const obra = (rotulo: string, unidade?: string): KpiInput => ({ rotulo, valor: null, unidade, semDadoTexto: EM_CONSTRUCAO });
  // Contagem que falhou mostra "—" + "sem dado agora" (não "em construção").
  const semDado = k ? 'sem dado agora' : EM_CONSTRUCAO;
  const lista: KpiInput[] = [
    obra('Geração agora', 'kW'),
    obra('Energia hoje', 'MWh'),
    obra('Energia no mês', 'MWh'),
    obra('Usinas ativas'),
    obra('Faturamento'),
    { rotulo: 'Leads do mês', valor: k?.leads ?? null, detalhe: 'ver leads', href: '/dashboard/leads', semDadoTexto: semDado },
    { rotulo: 'Propostas', valor: k?.propostas ?? null, detalhe: 'no mês', href: '/dashboard/propostas', semDadoTexto: semDado },
    { rotulo: 'Vendas', valor: k?.vendas ?? null, detalhe: 'fechadas no mês', href: '/dashboard/leads/kanban', destaque: true, semDadoTexto: semDado },
  ];
  return faixaKpis(lista, { classe: 'cc-kstrip-cc' });
}

function geracao(): string {
  return cartaoSecao({
    titulo: 'Geração do portfólio',
    dica: 'real × esperada',
    classe: 'cc-a-gen',
    acoesHtml: '<div class="cc-seg" aria-hidden="true"><span class="cc-on">Hoje</span><span>7 dias</span><span>30 dias</span><span>Ano</span></div>',
    corpoHtml: `<div class="cc-gsum">
        <div><span class="cc-lbl-s">Real até agora</span><div class="cc-big cc-faint">${SEM_DADO}</div></div>
        <div><span class="cc-lbl-s">Esperada até agora</span><div class="cc-big cc-faint">${SEM_DADO}</div></div>
        <div><span class="cc-lbl-s">Desvio</span><div class="cc-big cc-faint">${SEM_DADO}</div></div>
        <div><span class="cc-lbl-s">Perda estimada hoje</span><div class="cc-big cc-faint">${SEM_DADO}</div></div>
      </div>
      <div class="cc-chartbox">${estadoVazio({ tipo: 'construcao', texto: 'Curva da geração somada de todas as usinas contra a esperada pela irradiação do dia, a cada 30 minutos. Enquanto isso, a geração de cada usina está no Monitoramento.' })}
        <a class="cc-btn cc-btn-sm" href="/dashboard/monitoramento" style="margin-top:12px">${icone('sun', 'xs')}Abrir o Monitoramento</a></div>`,
  });
}

function mapa(): string {
  const leg = (tom: Tom, rotulo: string) => `<div class="cc-ln"><span class="cc-dot ${TONS[tom].ponto}"></span>${escapeHtml(rotulo)}<b>${SEM_DADO}</b></div><div class="cc-bar"><i style="width:0"></i></div>`;
  return cartaoSecao({
    titulo: 'Usinas agora',
    dica: 'por região',
    classe: 'cc-a-map',
    acoesHtml: `<a class="cc-link" href="/dashboard/monitoramento">Abrir frota ${icone('right', 'xs')}</a>`,
    corpoHtml: `<div class="cc-mapwrap">
        ${estadoVazio({ tipo: 'construcao', icone: 'map', texto: 'Mapa das usinas por região com a cor do pior estado de cada grupo.' })}
        <div class="cc-mleg">
          ${leg('normal', 'Normal')}${leg('atencao', 'Atenção')}${leg('critico', 'Crítico')}${leg('sem_dado', 'Sem comunicação')}
          <hr>
          <div class="cc-ln cc-faint" style="font-size:12px">Disponibilidade<b>${SEM_DADO}</b></div>
          <div class="cc-ln cc-faint" style="font-size:12px">PR médio<b>${SEM_DADO}</b></div>
        </div>
      </div>`,
  });
}

function centralAtencao(): string {
  const sev = (tom: Tom) => `<span class="cc-sev"><span class="cc-dot ${TONS[tom].ponto}"></span>${escapeHtml(TONS[tom].rotulo)} <b>${SEM_DADO}</b></span>`;
  return cartaoSecao({
    titulo: 'Central de Atenção',
    classe: 'cc-a-att',
    corpoHtml: `<div class="cc-sevs">${(['critico', 'atencao', 'acompanhar', 'oportunidade', 'info'] as Tom[]).map(sev).join('')}</div>
      ${estadoVazio({ tipo: 'construcao', texto: 'Um só lugar para o que precisa de você: usina abaixo do esperado, proposta parada há 72 h, obra atrasada, conta a vencer, créditos GD perto de vencer, garantia acabando. Ordenado pelo impacto em reais.' })}
      <div class="cc-evs-hoje">
        <span class="cc-lbl-s">Enquanto isso, onde olhar</span>
        <a class="cc-ev-link" href="/dashboard/cockpit">${icone('gauge', 'sm')}<span><b>Cockpit</b><small>leads esperando resposta e SLA</small></span>${icone('chev', 'xs')}</a>
        <a class="cc-ev-link" href="/dashboard/monitoramento">${icone('sun', 'sm')}<span><b>Monitoramento</b><small>usinas com alerta</small></span>${icone('chev', 'xs')}</a>
        <a class="cc-ev-link" href="/dashboard/financeiro">${icone('wallet', 'sm')}<span><b>Financeiro</b><small>contas a pagar e a receber</small></span>${icone('chev', 'xs')}</a>
      </div>`,
  });
}

interface DeptInput { titulo: string; icone: NomeIcone; href: string; valor: number | null; legenda: string; linha: string }

function dept(x: DeptInput): string {
  const tem = temNumero(x.valor);
  return `<a class="cc-dept" href="${escapeHtml(x.href)}">
      <div class="cc-dh"><span class="cc-ic">${icone(x.icone, 'sm')}</span>${escapeHtml(x.titulo)}<svg class="cc-i cc-i-sm cc-go" aria-hidden="true"><use href="#cc-i-chev"/></svg></div>
      <div class="cc-big${tem ? '' : ' cc-faint'}">${tem ? escapeHtml(fmtNumero(x.valor)) : SEM_DADO} <small>${escapeHtml(x.legenda)}</small></div>
      <div class="cc-s1">${escapeHtml(x.linha)}</div>
      <div class="cc-st"><span class="cc-dot cc-d-off"></span>${tem ? 'tendência e alerta: próxima entrega' : 'em construção'}</div>
    </a>`;
}

function departamentos(d: CommandCenterDados): string {
  const k = d.kpisMes;
  return `<section class="cc-depts">
    ${dept({ titulo: 'Comercial', icone: 'users', href: '/dashboard/leads/kanban', valor: k?.propostas ?? null, legenda: 'propostas no mês', linha: temNumero(k?.vendas) ? `${fmtNumero(k?.vendas ?? null)} vendas fechadas no mês` : 'Pipeline e conversão: próxima entrega' })}
    ${dept({ titulo: 'Marketing', icone: 'mega', href: '/dashboard/marketing', valor: k?.leads ?? null, legenda: 'leads no mês', linha: 'Investimento e custo por lead: próxima entrega' })}
    ${dept({ titulo: 'Instalações', icone: 'hammer', href: '/dashboard/usinas/kanban', valor: k?.usinasNovas ?? null, legenda: 'usinas cadastradas no mês', linha: 'Obras por etapa e atrasos: próxima entrega' })}
    ${dept({ titulo: 'O&M', icone: 'wrench', href: '/dashboard/manutencao', valor: k?.manutencoesPendentes ?? null, legenda: 'manutenções em até 30 dias', linha: 'Alarmes e disponibilidade: próxima entrega' })}
    ${dept({ titulo: 'Financeiro', icone: 'wallet', href: '/dashboard/financeiro', valor: null, legenda: 'faturamento', linha: 'Margem e a receber: próxima entrega' })}
  </section>`;
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export function renderCommandCenterPage(d: CommandCenterDados, user?: DashUser): string {
  const cab = cabecalhoPagina({
    titulo: 'Command Center',
    aoVivo: carimboAoVivo(d.agora),
    seloHtml: '<span class="cc-selo-fase">Fase A · montando</span>',
    subtitulo: 'Como está a empresa agora, o que mudou e qual é a próxima ação mais importante.',
    filtrosHtml: filtroGlobal('Período', 'Este mês', 'cal'),
    acoesHtml: `<a class="cc-btn" href="/dashboard/tv">${icone('tv', 'sm')}Modo TV</a>`,
  });

  const body = `<div class="cc-root cc-cc">
  ${cab}
  <div class="cc-wrap">
    ${hero(d)}
    ${kpis(d)}
    <div class="cc-board">
      ${geracao()}
      ${mapa()}
      ${centralAtencao()}
    </div>
    ${departamentos(d)}
    <div class="cc-foot">${icone('tv', 'sm')}Modo TV: a tela do escritório vai girar entre visão geral, usinas e comercial. <span class="cc-sp"></span>Todo número é clicável e leva ao detalhe.</div>
  </div>
</div>
<style>${CSS_COMMAND_CENTER}</style>`;

  return renderLayout({ active: 'command_center', title: 'Command Center', body, dark: true, largo: true, user });
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

// CSS específico da página (o resto vem do design system em ui/estilo.ts).
const CSS_COMMAND_CENTER = `
.cc-cc .cc-hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.12fr);border-radius:20px;overflow:hidden;border:1px solid rgba(251,191,36,.22);
  background:linear-gradient(120deg,#12304f 0%,#0f2640 45%,#0f2138 100%);box-shadow:0 20px 50px rgba(0,0,0,.28);margin-bottom:18px;position:relative}
.cc-cc .cc-hero::after{content:"";position:absolute;right:-120px;top:-160px;width:420px;height:420px;border-radius:50%;background:radial-gradient(circle,rgba(240,165,0,.16),transparent 65%);pointer-events:none}
.cc-cc .cc-hero-l{padding:24px 28px}
.cc-cc .cc-who{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.cc-cc .cc-eva-av{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;flex:none;background:linear-gradient(135deg,#0369a1,#16304F);border:1px solid rgba(251,191,36,.45);color:#fbbf24}
.cc-cc .cc-hero-l h2{font-size:30px;font-weight:600;letter-spacing:-.02em;line-height:1.1;color:#fff}
.cc-cc .cc-hero-l>p{margin:10px 0 0;color:var(--cc-text-2);font-size:15px;line-height:1.55;max-width:560px}
.cc-cc .cc-hero-l>p b{color:#fff;font-weight:600;font-family:var(--cc-f-num)}
.cc-cc .cc-changed{margin-top:16px}
.cc-cc .cc-changed .cc-lbl-s{margin-bottom:8px;display:block}
.cc-cc .cc-hero-r{padding:20px 22px;border-left:1px solid var(--cc-line);background:rgba(6,16,30,.28);display:flex;flex-direction:column;gap:10px;position:relative;z-index:1}
.cc-cc .cc-hh{display:flex;align-items:center;gap:10px;margin-bottom:2px}
.cc-cc .cc-hero-r .cc-empty{flex:1;align-items:center}

.cc-cc .cc-board{display:grid;grid-template-columns:minmax(0,1fr) 452px;grid-template-areas:"gen att" "map att";gap:18px;margin-top:18px}
.cc-cc .cc-a-gen{grid-area:gen}.cc-cc .cc-a-map{grid-area:map}
.cc-cc .cc-a-att{grid-area:att;background:linear-gradient(180deg,#132b47 0%,#0f2138 60%);border-color:rgba(150,185,225,.16);box-shadow:0 18px 44px rgba(0,0,0,.25);display:flex;flex-direction:column}
.cc-cc .cc-a-att .cc-ph h3{font-size:18px}
.cc-cc .cc-seg{display:inline-flex;padding:3px;border-radius:10px;background:rgba(0,0,0,.22);border:1px solid var(--cc-line);opacity:.55}
.cc-cc .cc-seg span{padding:5px 11px;border-radius:7px;font-size:12.5px;color:var(--cc-muted);font-weight:500}
.cc-cc .cc-seg .cc-on{background:var(--cc-surface-3);color:var(--cc-text)}
.cc-cc .cc-gsum{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}
.cc-cc .cc-gsum>div{padding:10px 12px;border-radius:10px;background:rgba(0,0,0,.16);border:1px solid var(--cc-line)}
.cc-cc .cc-gsum .cc-big{font-size:20px;margin-top:3px}
.cc-cc .cc-chartbox{min-height:150px}
.cc-cc .cc-mapwrap{display:grid;grid-template-columns:minmax(0,1fr) 176px;gap:16px;align-items:start}
.cc-cc .cc-mleg{display:flex;flex-direction:column;gap:9px;font-size:13px}
.cc-cc .cc-ln{display:flex;align-items:center;gap:9px}
.cc-cc .cc-ln b{margin-left:auto;font-family:var(--cc-f-num);font-weight:600;color:var(--cc-faint)}
.cc-cc .cc-mleg .cc-bar{margin:-2px 0 2px 17px}
.cc-cc .cc-mleg hr{border:0;border-top:1px solid var(--cc-line);margin:4px 0}
.cc-cc .cc-sevs{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:14px}
.cc-cc .cc-sev{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;padding:3px 7px;border-radius:8px;background:rgba(0,0,0,.2);border:1px solid var(--cc-line);color:var(--cc-text-2)}
.cc-cc .cc-sev b{font-family:var(--cc-f-num);color:var(--cc-faint)}
.cc-cc .cc-evs-hoje{display:flex;flex-direction:column;gap:7px;margin-top:16px}
.cc-cc .cc-evs-hoje .cc-lbl-s{margin-bottom:2px}
.cc-cc .cc-ev-link{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.028);border:1px solid var(--cc-line);color:var(--cc-text-2)}
.cc-cc .cc-ev-link:hover{border-color:rgba(251,191,36,.35)}
.cc-cc .cc-ev-link>svg:first-child{color:var(--cc-gold-2)}
.cc-cc .cc-ev-link span{flex:1;min-width:0}
.cc-cc .cc-ev-link b{display:block;font-size:13.5px;color:var(--cc-text);font-weight:600}
.cc-cc .cc-ev-link small{display:block;font-size:12px;color:var(--cc-muted)}

.cc-cc .cc-depts{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px;margin-top:18px}
.cc-cc .cc-dept{padding:16px 16px 12px;border-radius:14px;background:var(--cc-surface);border:1px solid var(--cc-line);display:flex;flex-direction:column;transition:border-color .15s,transform .15s}
.cc-cc .cc-dept:hover{border-color:rgba(251,191,36,.35);transform:translateY(-1px)}
.cc-cc .cc-dh{display:flex;align-items:center;gap:8px;font-weight:600;font-size:13.5px;color:var(--cc-text-2)}
.cc-cc .cc-dh .cc-ic{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;background:var(--cc-surface-3);color:var(--cc-gold-2)}
.cc-cc .cc-dh .cc-go{margin-left:auto;color:var(--cc-faint)}
.cc-cc .cc-dept .cc-big{font-size:26px;margin-top:12px;line-height:1}
.cc-cc .cc-dept .cc-big small{font-size:13px;color:var(--cc-muted);font-weight:500;font-family:var(--cc-f-text)}
.cc-cc .cc-s1{font-size:12.5px;color:var(--cc-muted);margin-top:6px;min-height:36px}
.cc-cc .cc-st{margin-top:10px;font-size:12px;display:flex;align-items:center;gap:6px;color:var(--cc-faint)}
.cc-cc .cc-foot{margin-top:26px;display:flex;align-items:center;gap:10px;font-size:12px;color:var(--cc-faint)}

@media (max-width:1280px){
  .cc-cc .cc-board{grid-template-columns:minmax(0,1fr) 400px}
  .cc-cc .cc-depts{grid-template-columns:repeat(3,minmax(0,1fr))}
  .cc-cc .cc-kstrip-cc{--n:4!important}
  .cc-cc .cc-kstrip-cc .cc-kpi:nth-child(n+5){border-top:1px solid var(--cc-line)}
  .cc-cc .cc-kstrip-cc .cc-kpi:nth-child(5){border-left:0}
}
@media (max-width:980px){
  .cc-cc .cc-board{grid-template-columns:minmax(0,1fr);grid-template-areas:"att" "gen" "map"}
}
@media (max-width:760px){
  /* Celular: a Central de Atenção sobe logo depois do resumo da Eva (spec §16). */
  .cc-cc .cc-wrap{display:flex;flex-direction:column;gap:16px}
  .cc-cc .cc-wrap>*{margin:0!important}
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
