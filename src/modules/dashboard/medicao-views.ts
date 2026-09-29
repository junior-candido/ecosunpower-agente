// src/modules/dashboard/medicao-views.ts
//
// Aba Medição — o que o cliente abre quando paga a mensalidade do kit.
//
// A tela é organizada em torno de UM número: a demanda de 15 minutos. É a
// janela em que a distribuidora mede, e o medidor dela alisa o pico. Mostrar a
// média de 15 min ao lado do pico instantâneo é o que ninguém mostra — e é o
// que transforma a medição em argumento e em laudo.
//
// HTML puro, sem biblioteca de gráfico: o desenho é SVG montado aqui. Menos
// dependência, carrega em qualquer celular.
//
// Renovação do miolo — R22 (28/09/2026): mesmo GET do aparelho (device + horas),
// mesmos números; visual cc- do Command Center (KPIs, painel, tema escuro, sem
// Tailwind, CSS no <head>). O gráfico continua SVG, com as cores por classe
// (azul = consumo, verde = injeção) e eixos nos tokens.

import type { ResumoMedicao, Aparelho } from './medicao-queries.js';
import { renderLayout } from './views.js';
import { cabecalhoPagina, cartaoSecao, estadoVazio, pilulaStatus } from './ui/componentes.js';
import { temaDaTela } from './ui/tema.js';
import type { DashUser } from './permissions.js';

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit',
  });
}

function w(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000) return (n / 1000).toFixed(2).replace('.', ',') + ' kW';
  return Math.round(n) + ' W';
}

function card(rotulo: string, valor: string, nota = '', destaque = false): string {
  return `<div class="cc-kpi${destaque ? ' cc-kpi-hl' : ''}"><div class="cc-lbl">${esc(rotulo)}</div><div class="cc-val">${esc(valor)}</div><div class="cc-dl">${nota ? esc(nota) : "&nbsp;"}</div></div>`;
}

/**
 * Escala vertical do gráfico, com o zero no lugar certo.
 *
 * Casa com solar tem as duas metades: consumo pra cima, injeção pra baixo. Se
 * o zero ficasse sempre na base, injeção viraria barra invisível — e o cliente
 * que gera energia veria um gráfico mentindo pra ele.
 *
 * `alturaUtil` é a altura em pixels disponível para o desenho.
 */
export function escalaDoGrafico(valores: number[], alturaUtil: number) {
  const maxCima = Math.max(0, ...valores.map((v) => (v > 0 ? v : 0)));
  const maxBaixo = Math.max(0, ...valores.map((v) => (v < 0 ? -v : 0)));
  const total = maxCima + maxBaixo;
  // Sem amplitude nenhuma (tudo zero, ou lista vazia): zero na base, e nada a
  // desenhar. Sem isso, dividir por zero geraria NaN em todas as coordenadas.
  const yZero = total === 0 ? alturaUtil : (maxCima / total) * alturaUtil;
  const yDe = (v: number) => (total === 0 ? alturaUtil : yZero - (v / total) * alturaUtil);
  return { maxCima, maxBaixo, total, yZero, yDe };
}

/** Gráfico de barras das janelas de 15 min. SVG, sem biblioteca. */
function grafico(janelas: ResumoMedicao['janelas']): string {
  if (janelas.length === 0) {
    return estadoVazio({ tipo: 'sem_dado', compacto: true, titulo: 'Ainda sem leitura suficiente para o gráfico' });
  }
  const L = 900, A = 240, pad = { t: 14, r: 12, b: 26, l: 52 };
  const util = A - pad.t - pad.b;
  const larg = (L - pad.l - pad.r) / janelas.length;

  // A escala considera média E pico, pra nenhuma barra estourar a moldura.
  const todos = janelas.flatMap((j) => [j.mediaW, j.picoW]);
  const esc0 = escalaDoGrafico(todos, util);
  const y = (v: number) => pad.t + esc0.yDe(v);
  const yZero = pad.t + esc0.yZero;
  const temInjecao = esc0.maxBaixo > 0;

  const barra = (x: number, larguraB: number, valor: number, cor: string) => {
    const yV = y(valor);
    const topo = Math.min(yV, yZero);
    const alt = Math.abs(yV - yZero);
    if (alt < 0.4) return '';
    return `<rect class="${cor}" x="${x.toFixed(1)}" y="${topo.toFixed(1)}" width="${larguraB.toFixed(1)}" height="${alt.toFixed(1)}"/>`;
  };

  const barras = janelas.map((j, i) => {
    const x = pad.l + i * larg + larg * 0.12;
    const lb = larg * 0.76;
    // Consumo em azul, injeção em verde — cor de energia que volta pra rede.
    const corPico = j.mediaW < 0 ? 'cc-md-pico-inj' : 'cc-md-pico';
    const corMedia = j.mediaW < 0 ? 'cc-md-inj' : 'cc-md-cons';
    return barra(x, lb, j.picoW, corPico) + barra(x, lb, j.mediaW, corMedia) +
      `<rect x="${x.toFixed(1)}" y="${pad.t}" width="${lb.toFixed(1)}" height="${util}" fill="transparent">
         <title>${esc(hora(j.inicio))} — média ${esc(w(j.mediaW))} · pico ${esc(w(j.picoW))}</title>
       </rect>`;
  }).join('');

  const passo = Math.max(1, Math.ceil(janelas.length / 8));
  const rotulos = janelas.map((j, i) => {
    if (i % passo !== 0) return '';
    const x = pad.l + i * larg + larg / 2;
    return `<text x="${x.toFixed(1)}" y="${A - 8}" font-size="10" class="cc-md-eixo" text-anchor="middle">${esc(hora(j.inicio))}</text>`;
  }).join('');

  // Referências: topo (maior consumo), zero e fundo (maior injeção).
  const refs = [
    { v: esc0.maxCima, mostra: esc0.maxCima > 0 },
    { v: 0, mostra: true },
    { v: -esc0.maxBaixo, mostra: esc0.maxBaixo > 0 },
  ].filter((r) => r.mostra).map((r) => {
    const yy = y(r.v);
    const zero = r.v === 0;
    return `
      <line class="${zero ? 'cc-md-zero' : 'cc-md-ref'}" x1="${pad.l}" y1="${yy.toFixed(1)}" x2="${L - pad.r}" y2="${yy.toFixed(1)}"/>
      <text class="cc-md-eixo" x="${pad.l - 6}" y="${(yy + 3).toFixed(1)}" font-size="10" text-anchor="end">${esc(w(r.v))}</text>`;
  }).join('');

  const cor = (c: string) => `<i class="cc-md-leg ${c}"></i>`;
  const legenda = temInjecao
    ? `<span>${cor('cc-md-cons')}consumo (média de 15 min)</span>
       <span>${cor('cc-md-inj')}injetado na rede</span>
       <span>${cor('cc-md-pico')}pico instantâneo</span>`
    : `<span>${cor('cc-md-cons')}média de 15 min <em>(o que a distribuidora mede)</em></span>
       <span>${cor('cc-md-pico')}pico instantâneo</span>`;

  return `
    <div class="cc-md-graf">
      <svg viewBox="0 0 ${L} ${A}" role="img" aria-label="Potência por janela de 15 minutos">
        ${refs}${barras}${rotulos}
      </svg>
    </div>
    <div class="cc-md-legenda">${legenda}</div>
    ${temInjecao ? `<p class="cc-md-nota-inj">Abaixo da linha do zero é energia que <strong>saiu</strong> da casa para a rede.</p>` : ''}`;
}

const CSS_MEDICAO = `
.cc-md .cc-kstrip{margin-bottom:16px}
.cc-md-sel{display:flex;gap:10px;align-items:flex-end;margin-bottom:16px}
.cc-md-sel .cc-campo{flex:0 1 320px}
.cc-md-faixas{display:flex;gap:6px}
.cc-md-graf{overflow-x:auto}
.cc-md-graf svg{width:100%;min-width:520px;height:auto;display:block}
.cc-md-cons{fill:#3b82f6;background:#3b82f6}
.cc-md-inj{fill:#22c55e;background:#22c55e}
.cc-md-pico{fill:rgba(59,130,246,.3);background:rgba(59,130,246,.3)}
.cc-md-pico-inj{fill:rgba(34,197,94,.3);background:rgba(34,197,94,.3)}
.cc-md-eixo{fill:var(--cc-faint)}
.cc-md-ref{stroke:var(--cc-line);stroke-width:1}
.cc-md-zero{stroke:var(--cc-line-2);stroke-width:1.5}
.cc-md-legenda{display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--cc-muted);margin-top:8px}
.cc-md-leg{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px}
.cc-md-nota-inj{font-size:12.5px;color:var(--cc-ok);margin:8px 0 0}
.cc-md-porque p{margin:0;color:var(--cc-text-2);font-size:14px;line-height:1.55}
.cc-md .cc-panel+.cc-panel{margin-top:16px}
@media (max-width:760px){.cc-md-sel .cc-campo{flex:1 1 100%}}
`;

export function renderMedicaoPage(
  aparelhos: Aparelho[],
  r: ResumoMedicao,
  horas: number,
): string {
  const cab = (subtitulo?: string, seloHtml?: string) => cabecalhoPagina({
    trilha: [{ rotulo: 'Usinas' }, { rotulo: 'Medição' }],
    titulo: 'Medição',
    subtitulo,
    seloHtml,
  });
  if (aparelhos.length === 0) {
    return `<div class="cc-root cc-md">
      ${cab('O que o medidor mostra: a demanda de 15 minutos que a distribuidora cobra.')}
      ${estadoVazio({ tipo: 'sem_dado', titulo: 'Nenhum medidor mandou leitura ainda.', texto: 'O aparelho precisa do script de envio rodando, com o token do servidor. O procedimento está em docs/kit-medicao.' })}
    </div>`;
  }

  const seletor = aparelhos.length > 1
    ? `<form method="GET" class="cc-form cc-md-sel">
         <label class="cc-campo"><span>Aparelho</span>
         <select name="device" onchange="this.form.submit()">
           ${aparelhos.map((a) => `<option value="${esc(a.deviceId)}"${a.deviceId === r.aparelho?.deviceId ? ' selected' : ''}>${esc(a.apelido || a.deviceId)}</option>`).join('')}
         </select></label>
         <input type="hidden" name="horas" value="${horas}">
       </form>`
    : '';

  const atrasado = (r.minutosSemReceber ?? 0) > 10;
  const statusTexto = r.minutosSemReceber === null
    ? 'sem leitura'
    : r.minutosSemReceber < 3 ? 'recebendo agora' : `última há ${r.minutosSemReceber} min`;
  const selo = pilulaStatus(r.minutosSemReceber === null ? 'sem_dado' : atrasado ? 'critico' : 'normal', statusTexto);

  const cards = r.agora
    ? `<div class="cc-kstrip">
         ${card('Agora', w(r.agora.potenciaW), `às ${hora(r.agora.medidoEm)}`)}
         ${r.demanda ? card('Demanda de 15 min', w(r.demanda.demandaW), `maior janela · ${hora(r.demanda.janelaInicio)}`, true) : ''}
         ${r.demanda ? card('Pico instantâneo', w(r.demanda.picoInstantaneoW), 'que a conta de luz não mostra') : ''}
         ${r.consumoDiaKwh !== null ? card('Consumo no período', r.consumoDiaKwh.toFixed(2).replace('.', ',') + ' kWh') : ''}
         ${r.injecaoDiaKwh ? card('Injetado na rede', r.injecaoDiaKwh.toFixed(2).replace('.', ',') + ' kWh') : ''}
       </div>`
    : '';

  const eletrico = r.agora
    ? `<div class="cc-kstrip">
         ${card('Tensão', r.agora.tensao !== null ? r.agora.tensao.toFixed(1).replace('.', ',') + ' V' : '—')}
         ${card('Corrente', r.agora.corrente !== null ? r.agora.corrente.toFixed(2).replace('.', ',') + ' A' : '—')}
         ${card('Fator de potência', r.agora.fatorPotencia !== null ? r.agora.fatorPotencia.toFixed(2).replace('.', ',') : '—')}
         ${card('Leituras no período', String(r.aparelho?.leituras ?? 0))}
       </div>`
    : '';

  const faixas = [6, 24, 72].map((h) =>
    `<a class="cc-chip${h === horas ? ' cc-chip-on' : ''}" href="?device=${encodeURIComponent(r.aparelho?.deviceId ?? '')}&horas=${h}">${h}h</a>`
  ).join('');

  const nomeAparelho = r.aparelho?.apelido || r.aparelho?.deviceId || '';
  return `<div class="cc-root cc-md">
    ${cab(nomeAparelho || undefined, selo)}
    ${seletor}
    ${cards}
    ${eletrico}
    ${cartaoSecao({
      titulo: 'Potência por janela de 15 minutos',
      acoesHtml: `<div class="cc-md-faixas">${faixas}</div>`,
      corpoHtml: grafico(r.janelas),
    })}
    ${cartaoSecao({
      titulo: 'Por que a janela de 15 minutos',
      classe: 'cc-md-porque',
      corpoHtml: `<p>
        A distribuidora mede demanda pela <strong>média de 15 minutos</strong>, não pelo pico instantâneo.
        O medidor dela <strong>alisa o pico</strong> — então o cliente paga por uma média que nunca viu.
        Aqui as duas aparecem lado a lado: a barra forte é o que ele paga, a clara é o que realmente aconteceu.
      </p>`,
    })}
  </div>`;
}

/** A tela inteira (casca + miolo) — antes o router montava a casca. */
export function renderMedicaoTela(aparelhos: Aparelho[], r: ResumoMedicao, horas: number, user: DashUser | undefined): string {
  return renderLayout({
    active: 'medicao', title: 'Medição', body: renderMedicaoPage(aparelhos, r, horas), user,
    tailwind: false, dark: temaDaTela(user, 'escuro') === 'escuro', cabeca: `<style>${CSS_MEDICAO}</style>`,
  });
}
