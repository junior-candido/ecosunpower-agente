// Telas do módulo Demonstrativos GD (fatia 1): lista, cliente, conferência do
// PDF enviado e digitação. Só desenham — regra fica em src/modules/gd/.
// Renovação do miolo — R11 (28/09/2026): mesmas rotas, formulários e gráfico;
// visual no padrão cc- do Command Center, tema escuro (D4), sem Tailwind.
// Ver docs/superpowers/specs/2026-09-23-demonstrativos-tela-relatorio-design.md.

import { renderLayout } from './views.js';
import {
  cabecalhoPagina, faixaKpis, cartaoSecao, tabela, estadoVazio, pilulaStatus, botao, celulaDupla, linhaLista, aviso, icone,
  type Tom,
} from './ui/componentes.js';
import { JS_TEMA_GRAFICOS } from './ui/graficos.js';
import { temaDaTela } from './ui/tema.js';
import { ECOSUN_COMPANY_ID } from '../tenant-resolver.js';
import type { DashUser } from './permissions.js';
import type { ItemLista } from '../gd/demonstrativos-tela.js';
import { historicoPorMes } from '../gd/demonstrativos-tela.js';
import type { EstadoGd, ResultadoValidacao } from '../gd/gd-validacao.js';
import { mesCurto } from '../gd/demonstrativo-cruzamento.js';
import { dataHoraBrasilia } from '../gd/relatorio-envio-textos.js';
import { telefoneBonito } from '../gd/relatorio-marca.js';
import { motivoEmPortugues } from '../relatorios/pasta/resultado-envio.js';

export interface UltimoEnvioRelatorio {
  enviadoEm: string;
  zapPara: string | null;
  emailPara: string | null;
}

/** "✅ enviado em 27/09 10:05 para (61) 99171-8505 e j@x.com" — SEM escapar (quem desenha escapa). */
export function textoUltimoEnvio(u: UltimoEnvioRelatorio): string {
  const para = [u.zapPara ? telefoneBonito(u.zapPara) : null, u.emailPara].filter(Boolean).join(' e ');
  return `✅ enviado em ${dataHoraBrasilia(u.enviadoEm)}${para ? ` para ${para}` : ''}`;
}

export interface UltimoEnvioPeriodo {
  enviadoEm: string;
  zapPara: string | null;
  emailPara: string | null;
  inicio: string;
  fim: string;
}

/** "mai/2026" + "ago/2026" → "mai–ago/2026" (mesmo ano) ou "mai/2025–ago/2026" (anos diferentes). */
function periodoAbreviado(inicio: string, fim: string): string {
  const de = mesCurto(inicio);
  const ate = mesCurto(fim);
  const [deMes, deAno] = de.split('/');
  const [ateMes, ateAno] = ate.split('/');
  return deAno === ateAno ? `${deMes}–${ateMes}/${ateAno}` : `${de}–${ate}`;
}

/** "✅ período mai–ago/2026 enviado em 27/09 14:32" — SEM escapar (quem desenha escapa). */
export function textoUltimoEnvioPeriodo(u: UltimoEnvioPeriodo): string {
  return `✅ período ${periodoAbreviado(u.inicio, u.fim)} enviado em ${dataHoraBrasilia(u.enviadoEm)}`;
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
const kwh = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kWh`;
const brl = (v: number | null) => (v === null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

/** Status do mês — MESMA regra de antes (estado da validação), em pílula cc-. */
const ESTADO: Record<EstadoGd, { tom: Tom; txt: string; filtro: string }> = {
  pronto: { tom: 'normal', txt: 'Pronto', filtro: 'Pronto' },
  falta_dado: { tom: 'atencao', txt: 'Falta dado', filtro: 'Falta dado' },
  inconsistente: { tom: 'critico', txt: 'Número não bate', filtro: 'Número não bate' },
  sem_cliente: { tom: 'sem_dado', txt: 'Sem cliente', filtro: 'Sem cliente' },
};
const pilulaEstado = (e: EstadoGd) => pilulaStatus(ESTADO[e]?.tom ?? 'info', ESTADO[e]?.txt ?? e);
const ORIGEM: Record<string, string> = {
  email: 'e-mail da concessionária',
  pdf_manual: 'PDF enviado na tela',
  digitado: 'digitado na tela',
};

/** "Eva" é a assistente da casa; o tenant vê um nome genérico. */
const nomeAssistente = (user?: DashUser) => (user && user.companyId !== ECOSUN_COMPANY_ID ? 'assistente' : 'Eva');

const CSS_GD = `
.cc-gd .cc-panel+.cc-panel,.cc-gd .cc-kstrip+.cc-panel,.cc-gd .cc-aviso+.cc-panel,.cc-gd .cc-panel+.cc-aviso,.cc-gd .cc-kstrip+.cc-aviso{margin-top:16px}
.cc-gd .cc-kstrip{margin-bottom:0}
.cc-gd-acoes{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.cc-gd-acoes form{margin:0}
.cc-gd-filtro{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:14px}
.cc-gd-filtro input[name=q]{width:220px}
.cc-gd-nav{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:6px 0 16px}
.cc-gd-nav .cc-gd-mes{font-family:var(--cc-f-num);font-weight:700;color:var(--cc-text);min-width:6.5rem;text-align:center}
.cc-gd-graf{position:relative;height:260px}
.cc-gd-lista{display:flex;flex-direction:column;gap:8px}
.cc-gd-nota{margin:10px 0 0;font-size:12.5px;color:var(--cc-muted)}
.cc-gd-nota b{color:var(--cc-text)}
.cc-gd-ok{color:var(--cc-ok);font-size:13px;margin:10px 0 0}
.cc-gd-origem{margin:0;padding-left:18px;list-style:disc;font-size:13px;color:var(--cc-text-2);display:flex;flex-direction:column;gap:4px}
.cc-gd-form{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}
.cc-gd-form .cc-campo{min-width:160px}
.cc-gd-grade{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.cc-gd-grade .cc-gd-cheia{grid-column:1/-1}
.cc-gd-grade input{width:100%}
.cc-gd-per{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}
.cc-gd-per>b,.cc-gd-per>p{width:100%;color:var(--cc-text)}
.cc-gd-per>p.cc-gd-ok{color:var(--cc-ok);margin:0}
.cc-gd-per .cc-gd-dica{width:100%;font-size:12px;color:var(--cc-faint)}
.cc-gd-cand{display:flex;flex-direction:column;gap:6px;margin-top:10px}
.cc-gd-cand form{margin:0}
.cc-gd-zap{white-space:pre-wrap;font-family:inherit;margin:8px 0 0;padding:12px;border-radius:10px;background:var(--cc-surface-2);border:1px solid var(--cc-line);color:var(--cc-text);font-size:13.5px}
.cc-gd-email{width:100%;height:560px;background:#fff;border:0;border-radius:10px;margin-top:8px}
.cc-gd-para{margin:0;font-size:13.5px;color:var(--cc-text-2)}
.cc-gd-para b{color:var(--cc-text)}
.cc-gd-erro{color:var(--cc-crit);margin:0}
.cc-gd-envio{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
.cc-gd .cc-us-link{color:var(--cc-gold-2);text-decoration:underline}
.cc-gd code{font-size:12px;padding:1px 5px;border-radius:5px;background:var(--cc-surface-3)}
.cc-gd-conf .cc-gd-nums{font-size:13.5px;color:var(--cc-text-2);margin:0 0 10px}
.cc-gd-limite{max-width:46rem}
.cc-gd .cc-tbl .cc-pill{white-space:normal;height:auto;min-height:22px;line-height:1.3;padding-top:3px;padding-bottom:3px}
@media (max-width:760px){
  .cc-gd-filtro input[name=q],.cc-gd-filtro select{flex:1 1 100%;width:100%}
  .cc-gd-grade{grid-template-columns:minmax(0,1fr)}
  .cc-gd-graf{height:220px}
  .cc-gd-acoes{width:100%}
  .cc-gd-acoes .cc-btn,.cc-gd-envio .cc-btn{flex:1 1 auto;justify-content:center}
  .cc-gd-email{height:420px}
}
`;

const layout = (title: string, body: string, user: DashUser | undefined, scripts?: string, largo = true) => renderLayout({
  active: 'demonstrativos', title, body: `<div class="cc-root cc-gd">${body}</div><style>${CSS_GD}</style>`, scripts, user,
  tailwind: false, dark: temaDaTela(user, 'escuro') === 'escuro', largo,
});

const TRILHA_GD = { rotulo: 'Demonstrativos GD', href: '/dashboard/demonstrativos' };

export function renderDemonstrativosLista(p: {
  itens: ItemLista[]; meses: string[]; mes: string | null; filtro: { estado?: string; q?: string }; msg?: string | null;
}, user?: DashUser): string {
  const opcMes = p.meses.map((m) => `<option value="${esc(m)}"${m === p.mes ? ' selected' : ''}>${esc(mesCurto(m))}</option>`).join('');
  const opcEstado = ['', 'pronto', 'falta_dado', 'inconsistente', 'sem_cliente']
    .map((e) => `<option value="${e}"${(p.filtro.estado ?? '') === e ? ' selected' : ''}>${e ? ESTADO[e as EstadoGd].filtro : 'Todas'}</option>`).join('');
  const conta = (e: EstadoGd) => p.itens.filter((i) => i.estado === e).length;

  const acoes = `<div class="cc-gd-acoes">
    ${botao({ rotulo: '+ Enviar PDF', href: '/dashboard/demonstrativos/enviar-pdf', tom: 'ouro' })}
    ${botao({ rotulo: '✎ Digitar demonstrativo', href: '/dashboard/demonstrativos/digitar' })}
  </div>`;

  const filtro = `<form method="get" action="/dashboard/demonstrativos" class="cc-form cc-gd-filtro">
    <select name="mes" aria-label="Mês">${opcMes}</select>
    <select name="estado" aria-label="Situação">${opcEstado}</select>
    <input name="q" value="${esc(p.filtro.q ?? '')}" placeholder="buscar cliente ou UC" aria-label="Buscar">
    ${botao({ rotulo: 'Filtrar', tipo: 'submit', icone: 'filter' })}
  </form>`;

  const lista = p.itens.length === 0
    ? estadoVazio({ tipo: 'vazio', titulo: 'Nenhum demonstrativo neste filtro.', texto: 'Eles chegam sozinhos pelo e-mail da concessionária — ou use "+ Enviar PDF".' })
    : tabela({
      mobile: 'cartoes',
      colunas: [{ titulo: 'Cliente' }, { titulo: 'Mês' }, { titulo: 'Gerou', alinhar: 'dir', num: true }, { titulo: 'Créditos', alinhar: 'dir', num: true }, { titulo: 'Situação' }, { titulo: 'Créditos a vencer' }],
      linhas: p.itens.map((i) => [
        { html: celulaDupla(i.clienteNome, `UC ${i.instalacao}`, `/dashboard/demonstrativos/${i.instalacao}?mes=${i.referencia}`) },
        mesCurto(i.referencia),
        kwh(i.geracaoKwh),
        kwh(i.saldoKwh),
        { html: `${pilulaEstado(i.estado)}${i.motivo ? `<div class="cc-dupla-s">${esc(i.motivo)}</div>` : ''}` },
        { html: i.alertaVencimento ? pilulaStatus('acompanhar', i.alertaVencimento) : '—' },
      ]),
    });

  const body = `
${cabecalhoPagina({
    trilha: [{ rotulo: 'Usinas' }, { rotulo: 'Demonstrativos GD' }],
    titulo: 'Demonstrativos de GD',
    subtitulo: 'O demonstrativo de cada UC no mês: pronto, falta dado ou número que não bate.',
    acoesHtml: acoes,
  })}
${p.msg ? aviso({ tom: 'ok', texto: p.msg }) : ''}
${faixaKpis([
    { rotulo: 'Prontos', valor: conta('pronto') },
    { rotulo: 'Falta dado', valor: conta('falta_dado') },
    { rotulo: 'Número não bate', valor: conta('inconsistente') },
    { rotulo: 'Sem cliente', valor: conta('sem_cliente') },
  ])}
${cartaoSecao({ titulo: p.mes ? `Demonstrativos de ${mesCurto(p.mes)}` : 'Demonstrativos', dica: `${p.itens.length} UC(s)`, corpoHtml: `${filtro}${lista}` })}`;
  return layout('Demonstrativos', body, user);
}

export interface DetalheCliente {
  instalacao: string;
  clienteNome: string;
  leadId: string | null;
  meses: string[];
  mes: string;
  consumoKwh: number | null;
  injetadoKwh: number | null;
  saldoKwh: number | null;
  compensadoKwh: number | null;
  economiaRs: number | null;
  proximoExpirar: string | null;
  historico: Array<{ mes: string; consumida: number; injetada: number; compensado: number }>;
  unidades: Array<{ codigoCliente: string; percentual: number; saldo: number }>;
  origemDemonstrativo: string;
  verificado: boolean;
  validacao: ResultadoValidacao;
  candidatos: Array<{ id: string; nome: string | null; uc: string | null }>;
  msg: string | null;
  /** Último envio ao cliente deste mês (fatia 3); ausente/null = nunca enviado. */
  ultimoEnvio?: UltimoEnvioRelatorio | null;
  /** Último envio de relatório do PERÍODO desta UC, qualquer intervalo; ausente/null = nunca enviado. */
  ultimoEnvioPeriodo?: UltimoEnvioPeriodo | null;
}

/**
 * "📊 Relatório do período: de [mês] até [mês]" — vários meses num relatório só
 * (o dono manda a cada 4–5 meses, principalmente pra quem tem rateio). As
 * opções são os meses que têm demonstrativo; quem confere se TODOS estão 🟢
 * é o servidor (prepararRelatorioPeriodo), mês a mês.
 */
function formRelatorioPeriodo(d: DetalheCliente, assistente: string): string {
  if (!d.leadId || d.meses.length < 2) return '';
  const meses = [...d.meses].sort();
  const ate = meses.includes(d.mes) ? d.mes : meses[meses.length - 1];
  const i = meses.indexOf(ate);
  const de = meses[Math.max(0, i - 3)];
  const opcoes = (sel: string) => meses
    .map((m) => `<option value="${esc(m)}"${m === sel ? ' selected' : ''}>${esc(mesCurto(m))}</option>`).join('');
  const base = `/dashboard/demonstrativos/${esc(d.instalacao)}`;
  const envioFeito = d.ultimoEnvioPeriodo
    ? `<p class="cc-gd-ok">${esc(textoUltimoEnvioPeriodo(d.ultimoEnvioPeriodo))}</p>` : '';
  return cartaoSecao({ titulo: 'Relatório de vários meses', dica: 'até 12 meses', corpoHtml: `
<form method="get" action="${base}/periodo.html" class="cc-form cc-gd-per">
  <b>📊 Relatório do período:</b>
  ${envioFeito}
  <label class="cc-campo"><span>de</span><select name="de">${opcoes(de)}</select></label>
  <label class="cc-campo"><span>até</span><select name="ate">${opcoes(ate)}</select></label>
  <button type="submit" formaction="${base}/periodo.html" formtarget="_blank" class="cc-btn">👁 Prévia</button>
  <button type="submit" formaction="${base}/periodo.pdf" formtarget="_self" class="cc-btn">📄 Gerar PDF</button>
  <button type="submit" formaction="${base}/periodo/enviar" formtarget="_self" class="cc-btn">📲 Enviar pela ${assistente}</button>
  <span class="cc-gd-dica">Até 12 meses. Só sai com todos os meses do período 🟢.</span>
</form>` });
}

export function renderDemonstrativoCliente(d: DetalheCliente, user?: DashUser): string {
  const assistente = nomeAssistente(user);
  const i = d.meses.indexOf(d.mes);
  const anterior = d.meses[i + 1];
  const proximo = i > 0 ? d.meses[i - 1] : undefined;
  const nav = (m: string | undefined, s: string, rot: string) => m
    ? `<a class="cc-btn cc-btn-sm" aria-label="${rot}" href="/dashboard/demonstrativos/${esc(d.instalacao)}?mes=${esc(m)}">${s}</a>`
    : `<span class="cc-btn cc-btn-sm cc-btn-off" aria-disabled="true">${s}</span>`;
  const v = d.validacao;
  const origemGeracao = v.origemGeracao === 'manual' ? 'digitada na tela' : v.origemGeracao === 'api' ? 'monitoramento (API)' : '—';

  const checklist = [
    ...v.bloqueios.map((x) => linhaLista({ tom: 'critico', titulo: x })),
    ...v.pendencias.map((x) => linhaLista({ tom: 'atencao', titulo: x })),
    ...v.avisos.map((x) => linhaLista({ tom: 'info', titulo: x })),
  ].join('');

  const formGeracao = `
<form method="post" action="/dashboard/demonstrativos/${esc(d.instalacao)}/geracao" class="cc-form cc-gd-form">
  <input type="hidden" name="referencia" value="${esc(d.mes)}">
  <label class="cc-campo"><span>Geração de ${esc(mesCurto(d.mes))} (kWh)</span><input name="kwh" inputmode="decimal" required></label>
  ${botao({ rotulo: 'Salvar geração', tipo: 'submit', icone: 'check' })}
</form>`;
  const formLigar = d.leadId ? '' : cartaoSecao({ titulo: 'Ligar esta UC a um cliente', corpoHtml: `
  <form method="get" action="/dashboard/demonstrativos/${esc(d.instalacao)}" class="cc-form cc-gd-form">
    <input type="hidden" name="mes" value="${esc(d.mes)}">
    <label class="cc-campo"><span>Nome do cliente</span><input name="buscar" placeholder="nome do cliente"></label>${botao({ rotulo: 'Buscar', tipo: 'submit', icone: 'search' })}
  </form>
  <div class="cc-gd-cand">${d.candidatos.map((c) => `
  <form method="post" action="/dashboard/demonstrativos/${esc(d.instalacao)}/ligar">
    <input type="hidden" name="lead_id" value="${esc(c.id)}"><input type="hidden" name="mes" value="${esc(d.mes)}">
    ${botao({ rotulo: `Ligar a ${c.nome ?? 'sem nome'}${c.uc ? ` (UC ${c.uc})` : ''}`, tipo: 'submit', icone: 'plug' })}
  </form>`).join('')}</div>` });
  const rateio = d.unidades.length > 1
    ? `<p class="cc-gd-nota">Rateio: ${d.unidades.map((u) => `<b>${esc(u.codigoCliente)}</b> ${esc(u.percentual)}%`).join(' · ')}</p>` : '';
  const motivoFalta = v.bloqueios[0] ?? v.pendencias[0] ?? 'o mês ainda não está pronto';
  const envioFeito = d.ultimoEnvio ? `<p class="cc-gd-ok">${esc(textoUltimoEnvio(d.ultimoEnvio))}</p>` : '';
  const botaoRelatorio = v.estado === 'pronto'
    ? `<div class="cc-gd-acoes">
  ${botao({ rotulo: `📲 Enviar ao cliente pela ${assistente}`, href: `/dashboard/demonstrativos/${d.instalacao}/enviar?mes=${d.mes}`, tom: 'ouro' })}
  <a href="/dashboard/demonstrativos/${esc(d.instalacao)}/relatorio.pdf?mes=${esc(d.mes)}" class="cc-btn">📄 Gerar PDF</a>
  <a href="/dashboard/demonstrativos/${esc(d.instalacao)}/relatorio.html?mes=${esc(d.mes)}" target="_blank" class="cc-btn">👁 Prévia</a>
</div>${envioFeito}`
    : `<div class="cc-gd-acoes"><span class="cc-btn cc-btn-off" aria-disabled="true">📄 Gerar PDF</span>
  <span class="cc-gd-nota">Só sai com tudo 🟢 — ${esc(motivoFalta)}</span></div>`;

  const cabecalho = cabecalhoPagina({
    trilha: [{ rotulo: 'Usinas' }, { rotulo: 'Demonstrativos GD', href: `/dashboard/demonstrativos?mes=${d.mes}` }, { rotulo: `UC ${d.instalacao}` }],
    titulo: `${d.clienteNome} · UC ${d.instalacao}`,
    seloHtml: pilulaEstado(v.estado),
  });

  const body = `
${cabecalho}
<div class="cc-gd-nav">${nav(anterior, '◀', 'Mês anterior')}<span class="cc-gd-mes">${esc(mesCurto(d.mes))}</span>${nav(proximo, '▶', 'Próximo mês')}</div>
${d.msg ? aviso({ tom: 'ok', texto: d.msg }) : ''}
${faixaKpis([
    { rotulo: 'Gerou', valor: v.geracaoKwh, casas: 1, unidade: 'kWh', destaque: true },
    { rotulo: 'Consumiu', valor: d.consumoKwh, casas: 1, unidade: 'kWh' },
    { rotulo: 'Economia estimada', valor: d.economiaRs, casas: 2, prefixo: 'R$' },
    { rotulo: 'Saldo de créditos', valor: d.saldoKwh, casas: 1, unidade: 'kWh' },
  ])}
${d.proximoExpirar ? aviso({ tom: 'atencao', texto: d.proximoExpirar }) : ''}
${cartaoSecao({ titulo: 'Relatório do mês', corpoHtml: botaoRelatorio })}
${cartaoSecao({
    titulo: 'Consumo, injetado e compensado', dica: 'últimos 13 meses',
    corpoHtml: `<div class="cc-gd-graf"><canvas id="g13"></canvas></div>${rateio}`,
  })}
${checklist || v.geracaoKwh === null || v.origemGeracao === 'manual' ? cartaoSecao({
    titulo: 'Conferência do mês',
    corpoHtml: `${checklist ? `<div class="cc-gd-lista">${checklist}</div>` : ''}${v.geracaoKwh === null || v.origemGeracao === 'manual' ? formGeracao : ''}`,
  }) : ''}
${formLigar}
${cartaoSecao({ titulo: 'De onde veio cada número', corpoHtml: `<ul class="cc-gd-origem">
  <li>Consumo, injetado e créditos → ${esc(ORIGEM[d.origemDemonstrativo] ?? d.origemDemonstrativo)}${d.verificado ? ' ✓ (assinatura da concessionária conferida)' : ''}</li>
  <li>Geração → ${origemGeracao}</li>
  <li>Economia estimada = compensado ${kwh(d.compensadoKwh)} × tarifa média (Lei 14.300 cobra parte do Fio B)</li>
</ul>` })}
${formRelatorioPeriodo(d, assistente)}`;
  // Rateio: uma linha por unidade no mês — soma por mês (13 meses distintos).
  // Gráfico: os MESMOS arrays de antes; só as cores vêm do tema (JS_TEMA_GRAFICOS).
  const hist = historicoPorMes(d.historico, 13);
  const scripts = `
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
${JS_TEMA_GRAFICOS}
<script>
(function () {
var T = window.ccTema || {};
new Chart(document.getElementById('g13'), { type: 'bar', data: {
  labels: ${JSON.stringify(hist.map((h) => mesCurto(h.mes)))},
  datasets: [
    { label: 'Consumo (kWh)', data: ${JSON.stringify(hist.map((h) => h.consumida))}, backgroundColor: T.gold, borderRadius: 4 },
    { label: 'Injetado (kWh)', data: ${JSON.stringify(hist.map((h) => h.injetada))}, backgroundColor: T.info, borderRadius: 4 },
    { label: 'Compensado (kWh)', data: ${JSON.stringify(hist.map((h) => h.compensado))}, backgroundColor: T.ok, borderRadius: 4 },
  ] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } },
  scales: { x: { grid: { display: false } }, y: { beginAtZero: true } } } });
})();
</script>`;
  return layout(d.clienteNome, body, user, scripts);
}

export type ResultadoLeituraPdf =
  | { arquivo: string; ok: true; textoB64: string; assinatura: string; clienteNome: string; instalacao: string; referencia: string;
      injetadoKwh: number | null; consumoKwh: number | null; saldoKwh: number | null; inconsistencias: string[] }
  | { arquivo: string; ok: false; motivo: string };

export function renderEnviarPdf(user?: DashUser): string {
  const body = `
${cabecalhoPagina({ trilha: [{ rotulo: 'Usinas' }, TRILHA_GD, { rotulo: 'Enviar PDF' }], titulo: 'Enviar PDF do demonstrativo' })}
<div class="cc-gd-limite">
${cartaoSecao({ titulo: 'PDFs da concessionária', corpoHtml: `
<form method="post" action="/dashboard/demonstrativos/enviar-pdf" enctype="multipart/form-data" class="cc-form cc-gd-form">
  <label class="cc-campo cc-gd-cheia"><span>Arquivos PDF</span><input type="file" name="pdfs" accept="application/pdf" multiple required></label>
  <p class="cc-gd-nota">Pode escolher vários de uma vez. Nada é gravado antes de você conferir.</p>
  ${botao({ rotulo: 'Ler PDFs', tipo: 'submit', tom: 'ouro', icone: 'file' })}
</form>` })}
</div>`;
  return layout('Enviar PDF', body, user, undefined, false);
}

export function renderConferenciaPdf(res: ResultadoLeituraPdf[], user?: DashUser): string {
  const blocos = res.map((r) => r.ok
    ? cartaoSecao({ titulo: r.arquivo, dica: `${r.clienteNome} · UC ${r.instalacao} · ${mesCurto(r.referencia)}`, classe: 'cc-gd-conf', corpoHtml: `
  <p class="cc-gd-nums">Injetado <b>${kwh(r.injetadoKwh)}</b> · Consumo <b>${kwh(r.consumoKwh)}</b> · Saldo <b>${kwh(r.saldoKwh)}</b></p>
  ${r.inconsistencias.length ? `<div class="cc-gd-lista">${r.inconsistencias.map((x) => linhaLista({ tom: 'critico', titulo: x })).join('')}</div>` : ''}
  <form method="post" action="/dashboard/demonstrativos/confirmar" class="cc-gd-envio">
    <input type="hidden" name="texto_b64" value="${esc(r.textoB64)}">
    <input type="hidden" name="assinatura_texto" value="${esc(r.assinatura)}">
    ${botao({ rotulo: 'Confirmo — gravar', tipo: 'submit', icone: 'check' })}
  </form>` })
    : `<div class="cc-aviso cc-aviso-erro" role="alert">${icone('alert', 'sm')}<span><strong>${esc(r.arquivo)}</strong> — não deu pra ler: ${esc(r.motivo)}.
  Confira se é o demonstrativo de microgeração, ou use "✎ Digitar demonstrativo".</span></div>`).join('');
  const body = `
${cabecalhoPagina({
    trilha: [{ rotulo: 'Usinas' }, TRILHA_GD, { rotulo: 'Conferência' }],
    titulo: 'Conferência',
    subtitulo: 'Confira os números de cada PDF antes de gravar.',
    acoesHtml: botao({ rotulo: '← voltar', href: '/dashboard/demonstrativos' }),
  })}
${blocos}`;
  return layout('Conferência', body, user);
}

export function renderDigitar(v: Record<string, string>, erros: string[], user?: DashUser): string {
  const campo = (nome: string, rotulo: string, extra = '', cls = '') =>
    `<label class="cc-campo${cls ? ` ${cls}` : ''}"><span>${rotulo}</span><input name="${nome}" value="${esc(v[nome] ?? '')}" ${extra}></label>`;
  const body = `
${cabecalhoPagina({ trilha: [{ rotulo: 'Usinas' }, TRILHA_GD, { rotulo: 'Digitar' }], titulo: 'Digitar demonstrativo' })}
<div class="cc-gd-limite">
${erros.length ? `<div class="cc-aviso cc-aviso-erro" role="alert">${icone('alert', 'sm')}<ul class="cc-gd-origem">${erros.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
${cartaoSecao({ titulo: 'Números do demonstrativo', corpoHtml: `
<form method="post" action="/dashboard/demonstrativos/digitar" class="cc-form cc-gd-grade">
  ${campo('clienteNome', 'Nome do cliente', 'required', 'cc-gd-cheia')}
  ${campo('instalacao', 'Instalação (UC)', 'inputmode="numeric" required')}${campo('codigoCliente', 'Código do cliente (se tiver)', 'inputmode="numeric"')}
  ${campo('mes', 'Mês de referência', 'type="month" required', 'cc-gd-cheia')}
  ${campo('injetado', 'Injetado no mês (kWh)', 'inputmode="decimal" required')}${campo('consumo', 'Consumo do mês (kWh)', 'inputmode="decimal" required')}
  ${campo('creditoUtilizado', 'Crédito utilizado (kWh)', 'inputmode="decimal" required')}${campo('saldoAcumulado', 'Saldo acumulado (kWh)', 'inputmode="decimal" required')}
  ${campo('proximoExpirar', 'Crédito a expirar (kWh, se tiver)', 'inputmode="decimal"')}${campo('cicloExpirar', 'Expira em', 'type="month"')}
  <div class="cc-gd-cheia">${botao({ rotulo: 'Conferir e gravar', tipo: 'submit', tom: 'ouro', icone: 'check' })}</div>
</form>` })}
</div>`;
  return layout('Digitar demonstrativo', body, user, undefined, false);
}

export interface ConfirmarEnvioRelatorio {
  instalacao: string;
  mes: string;
  mesExtenso: string;
  clienteNome: string;
  canal: 'casa' | 'evolution' | 'nenhum';
  zap: { para: string | null; motivo: string | null; texto: string };
  /** null = e-mail não configurado neste ambiente. */
  email: { para: string | null; motivo: string | null; assunto: string; html: string } | null;
  linkExemplo: string;
  ultimoEnvio: UltimoEnvioRelatorio | null;
  /** Relatório do período (de/até = YYYY-MM-01); ausente = relatório do mês. */
  periodo?: { de: string; ate: string };
}

export function renderConfirmarEnvioRelatorio(c: ConfirmarEnvioRelatorio, user?: DashUser): string {
  const voltar = `/dashboard/demonstrativos/${esc(c.instalacao)}?mes=${esc(c.mes)}`;
  const qs = c.periodo ? esc(`?de=${c.periodo.de}&ate=${c.periodo.ate}`) : `?mes=${esc(c.mes)}`;
  const acaoEnviar = `/dashboard/demonstrativos/${esc(c.instalacao)}/${c.periodo ? 'periodo/enviar' : 'enviar'}${qs}`;
  const previaHref = `/dashboard/demonstrativos/${esc(c.instalacao)}/${c.periodo ? 'periodo.html' : 'relatorio.html'}${qs}`;
  const comoVai = c.canal === 'evolution'
    ? 'Vai pelo WhatsApp da sua empresa: a mensagem com o link e o PDF anexo.'
    : 'Vai pelo modelo aprovado da Meta ("relatorio_usina_v1"), com o botão "Ver meu relatório". Se o modelo ainda não estiver aprovado, tento como mensagem comum (só chega se o cliente falou com a gente nas últimas 24 horas).';
  const blocoZap = c.zap.para
    ? `<p class="cc-gd-para">Para: <b>${esc(telefoneBonito(c.zap.para))}</b></p>
<p class="cc-gd-nota">${esc(comoVai)}</p>
<pre class="cc-gd-zap">${esc(c.zap.texto)}</pre>`
    : `<p class="cc-gd-erro">❌ Não vai sair — ${esc(motivoEmPortugues('zap', c.zap.motivo))}.</p>`;
  let blocoEmail: string;
  if (c.email === null) {
    blocoEmail = aviso({ tom: 'atencao', texto: 'O e-mail não está configurado neste ambiente — só o WhatsApp será tentado.' });
  } else if (c.email.para) {
    blocoEmail = `<p class="cc-gd-para">Para: <b>${esc(c.email.para)}</b> · Assunto: <b>${esc(c.email.assunto)}</b></p>
<iframe title="Prévia do e-mail" sandbox="" srcdoc="${esc(c.email.html)}" class="cc-gd-email"></iframe>`;
  } else {
    blocoEmail = `<p class="cc-gd-erro">❌ Não vai sair — ${esc(motivoEmPortugues('email', c.email.motivo))}.</p>`;
  }
  const podeEnviar = Boolean(c.zap.para) || Boolean(c.email?.para);
  const jaEnviado = c.ultimoEnvio
    ? `<div class="cc-aviso cc-aviso-atencao" role="status">${icone('alert', 'sm')}<span>Este relatório já foi enviado: ${esc(textoUltimoEnvio(c.ultimoEnvio))}.<br>Enviar de novo manda outra mensagem para o cliente.</span></div>`
    : '';
  const form = podeEnviar
    // Duplo clique: o botão trava no 1º envio (o servidor também reserva o mês).
    ? `<form method="post" action="${acaoEnviar}" class="cc-gd-envio" onsubmit="var b=this.querySelector('button[type=submit]');if(b){b.disabled=true;b.textContent='Enviando…';}">
  <input type="hidden" name="confirmar" value="1">
  ${c.ultimoEnvio ? '<input type="hidden" name="reenviar" value="1">' : ''}
  <button type="submit" class="cc-btn cc-btn-gold">${c.ultimoEnvio ? '🔁 Enviar de novo' : '📲 Confirmar e enviar'}</button>
  <a href="${voltar}" class="cc-btn">Cancelar</a>
</form>`
    : `<div class="cc-aviso cc-aviso-erro" role="alert">${icone('alert', 'sm')}<span>Nada pode ser enviado — corrija o cadastro do cliente (telefone/e-mail) e tente de novo.</span></div>
<div class="cc-gd-envio"><a href="${voltar}" class="cc-btn">← Voltar</a></div>`;
  const body = `
${cabecalhoPagina({
    trilha: [{ rotulo: 'Usinas' }, TRILHA_GD, { rotulo: c.clienteNome, href: `/dashboard/demonstrativos/${c.instalacao}?mes=${c.mes}` }, { rotulo: 'Enviar' }],
    titulo: `Enviar o relatório de ${c.mesExtenso} para ${c.clienteNome}`,
  })}
<div class="cc-gd-limite">
${jaEnviado}
${cartaoSecao({ titulo: 'WhatsApp', corpoHtml: blocoZap })}
${cartaoSecao({ titulo: 'E-mail', corpoHtml: blocoEmail })}
${cartaoSecao({ titulo: 'Link do relatório', corpoHtml: `<p class="cc-gd-nota">O cliente recebe um link assim: <code>${esc(c.linkExemplo)}</code> — o endereço definitivo é criado na hora do envio e abre o PDF direto, sem senha.
<a href="${previaHref}" target="_blank" class="cc-us-link">👁 Ver o relatório</a></p>` })}
${form}
</div>`;
  return layout(`Enviar relatório — ${c.clienteNome}`, body, user, undefined, false);
}
