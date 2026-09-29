// src/modules/dashboard/custo-ia-views.ts
// Tela "Custo de IA" — SÓ A CASA (portão no router). Quanto cada empresa gasta
// de IA, em quê, mês atual × anterior, e — pros tenants — mensalidade × custo
// → margem, com alerta quando o custo passa de X% da mensalidade.
// Padrão Command Center (cc-), tema escuro, sem Tailwind.
import { escapeHtml } from './views.js';
import type { DashUser } from './permissions.js';
import type { PainelCustoIa, Totais, UsoResumo, EmpresaCustoIa } from './custo-ia-calc.js';
import { cabecalhoPagina, cartaoSecao, tabela, pilulaStatus, faixaKpis, barra, aviso as avisoCc } from './ui/componentes.js';
import { paginaConfiguracoes } from './configuracoes-casca.js';

const CSS_CUSTO_IA = `
.cc-ci .cc-kstrip{margin-bottom:16px}
.cc-ci-nota{margin:0 0 14px;font-size:12.5px;color:var(--cc-muted);line-height:1.5}
.cc-ci-form{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px;color:var(--cc-muted)}
.cc-ci-form input{width:64px;background:var(--cc-surface);color:var(--cc-text);border:1px solid var(--cc-line);border-radius:8px;padding:5px 8px;font:inherit}
.cc-ci-form button{background:transparent;color:var(--cc-text);border:1px solid var(--cc-line);border-radius:8px;padding:5px 10px;font:inherit;cursor:pointer}
.cc-ci-pct{display:flex;align-items:center;gap:8px;min-width:120px}
.cc-ci-pct .cc-bar{flex:1;min-width:60px}
.cc-ci-num{font-variant-numeric:tabular-nums;white-space:nowrap}
.cc-ci-sub{display:block;font-size:11.5px;color:var(--cc-faint)}
.cc-ci-det{margin-top:16px;border:1px solid var(--cc-line);border-radius:12px;background:var(--cc-surface)}
.cc-ci-det>summary{cursor:pointer;padding:12px 14px;font-weight:600;font-size:13.5px;color:var(--cc-text);list-style:none;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.cc-ci-det>summary::-webkit-details-marker{display:none}
.cc-ci-det>summary .cc-ci-sub{display:inline;font-weight:400}
.cc-ci-det[open]>summary{border-bottom:1px solid var(--cc-line)}
.cc-ci-det .cc-ci-corpo{padding:4px 6px 8px}
`;

/** Centavos (com fração) → "R$ 1.234,56". Custo de IA é miúdo: sempre 2 casas. */
export function reais(centavos: number | null | undefined): string {
  if (typeof centavos !== 'number' || !Number.isFinite(centavos)) return '—';
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const inteiro = (v: number) => Math.round(v).toLocaleString('pt-BR');
const num = (html: string) => ({ html: `<span class="cc-ci-num">${html}</span>` });

function variacao(atual: number, anterior: number): string {
  if (anterior <= 0) return '';
  const p = Math.round(((atual - anterior) / anterior) * 100);
  return `${p >= 0 ? '+' : ''}${p}% vs anterior`;
}

function celulaPct(e: EmpresaCustoIa, alertaPct: number): { html: string } | string {
  if (e.ehCasa) return { html: '<span class="cc-faint">a casa</span>' };
  if (e.mensalidadeCents === null) return { html: '<span class="cc-faint">sem mensalidade cadastrada</span>' };
  const p = e.pctDaMensalidade ?? 0;
  const tom = e.alerta ? 'crit' : p >= alertaPct * 0.75 ? 'warn' : 'ok';
  return {
    html: `<div class="cc-ci-pct">${barra(Math.min(100, p), tom)}<span class="cc-ci-num">${Math.round(p)}%</span></div>`
      + `<span class="cc-ci-sub">projeção do mês: ${e.pctProjecao === null ? '—' : `${Math.round(e.pctProjecao)}%`}</span>`,
  };
}

function tabelaUsos(usos: UsoResumo[]): string {
  return tabela({
    mobile: 'cartoes',
    colunas: [
      { titulo: 'Uso' }, { titulo: 'Mês atual', alinhar: 'dir' }, { titulo: 'Mês anterior', alinhar: 'dir' },
      { titulo: 'Chamadas', alinhar: 'dir' }, { titulo: 'Custo médio', alinhar: 'dir' }, { titulo: 'Entrada média', alinhar: 'dir' },
    ],
    linhas: usos.map((u) => [
      { html: `<span>${escapeHtml(u.rotulo)}</span><span class="cc-ci-sub">${escapeHtml(u.chave)}</span>` },
      num(reais(u.atual.centavos)),
      num(reais(u.anterior.centavos)),
      num(inteiro(u.atual.chamadas)),
      num(u.atual.chamadas ? reais(u.atual.centavos / u.atual.chamadas) : '—'),
      num(u.atual.chamadas ? `${inteiro(u.atual.tokensEntrada / u.atual.chamadas)} tokens` : '—'),
    ]),
    vazio: 'Nenhum uso de IA no período',
  });
}

const kpiReais = (t: Totais) => Math.round(t.centavos) / 100;

export function renderCustoIaPage(p: PainelCustoIa, user: DashUser | undefined): string {
  const casa = p.porEmpresa.find((e) => e.ehCasa);
  const alertas = p.porEmpresa.filter((e) => e.alerta);
  const projecaoTotal = p.porEmpresa.reduce((s, e) => s + e.projecaoCents, 0);

  const kpis = faixaKpis([
    { rotulo: 'IA no mês', valor: kpiReais(p.total.atual), casas: 2, prefixo: 'R$', destaque: true,
      detalhe: `${inteiro(p.total.atual.chamadas)} chamadas`,
      tendencia: p.total.anterior.centavos > 0 ? { texto: variacao(p.total.atual.centavos, p.total.anterior.centavos), direcao: p.total.atual.centavos > p.total.anterior.centavos ? 'sobe' : 'desce' } : undefined },
    { rotulo: 'Projeção do mês', valor: Math.round(projecaoTotal) / 100, casas: 2, prefixo: 'R$', detalhe: 'no ritmo de hoje' },
    { rotulo: 'Mês anterior', valor: kpiReais(p.total.anterior), casas: 2, prefixo: 'R$', detalhe: `${inteiro(p.total.anterior.chamadas)} chamadas` },
    { rotulo: 'Por resposta (Eva)', valor: casa?.custoPorRespostaCents != null ? casa.custoPorRespostaCents / 100 : null, casas: 2, prefixo: 'R$', detalhe: `${inteiro(casa?.respostas ?? 0)} respostas`, semDadoTexto: 'sem respostas' },
    { rotulo: 'Vindo do cache', valor: p.cacheConversaPct, unidade: '%', detalhe: 'mais = mais barato', semDadoTexto: 'sem conversas' },
  ]);

  const avisos = [
    alertas.length
      ? avisoCc({ tom: 'atencao', texto: `${alertas.map((e) => e.nome).join(', ')}: custo de IA passou (ou vai passar no ritmo atual) de ${p.alertaPct}% da mensalidade.` })
      : '',
    p.semEmpresa.chamadas
      ? avisoCc({ tom: 'info', texto: `${inteiro(p.semEmpresa.chamadas)} chamada(s) deste mês (${reais(p.semEmpresa.centavos)}) não disseram de qual empresa eram e foram contadas na casa — veja o uso marcado como "sem empresa".` })
      : '',
  ].join('');

  const porEmpresa = tabela({
    mobile: 'cartoes',
    colunas: [
      { titulo: 'Empresa' }, { titulo: 'Custo de IA', alinhar: 'dir' }, { titulo: 'Leads atendidos', alinhar: 'dir' },
      { titulo: 'Mensalidade', alinhar: 'dir' }, { titulo: 'Margem', alinhar: 'dir' }, { titulo: '% da mensalidade' },
    ],
    linhas: p.porEmpresa.map((e) => [
      { html: `<span>${escapeHtml(e.nome)}</span>${e.alerta ? ` ${pilulaStatus('critico', 'alerta')}` : ''}<span class="cc-ci-sub">${inteiro(e.atual.chamadas)} chamadas · ${inteiro(e.respostas)} respostas</span>` },
      { html: `<span class="cc-ci-num">${reais(e.atual.centavos)}</span><span class="cc-ci-sub">anterior: ${reais(e.anterior.centavos)}</span>` },
      { html: `<span class="cc-ci-num">${inteiro(e.leadsAtendidos)}</span><span class="cc-ci-sub">${e.custoPorLeadCents === null ? 'sem lead no mês' : `${reais(e.custoPorLeadCents)} por lead`}</span>` },
      num(e.ehCasa ? '—' : reais(e.mensalidadeCents)),
      num(e.margemCents === null ? '—' : reais(e.margemCents)),
      celulaPct(e, p.alertaPct),
    ]),
    vazio: 'Nenhum custo de IA no período',
  });

  const detalhes = p.porEmpresa
    .filter((e) => e.porUso.length)
    .map((e) => `<details class="cc-ci-det"><summary>${escapeHtml(e.nome)} <span class="cc-ci-sub">— ${reais(e.atual.centavos)} em ${escapeHtml(p.mesAtual)}, por uso</span></summary><div class="cc-ci-corpo">${tabelaUsos(e.porUso)}</div></details>`)
    .join('');

  const formAlerta = `<form method="get" action="/dashboard/custo-ia" class="cc-ci-form">
    <label for="cc-ci-alerta">Alertar quando passar de</label>
    <input id="cc-ci-alerta" name="alerta" type="number" min="1" max="100" value="${p.alertaPct}"> <span>% da mensalidade</span>
    <button type="submit">Aplicar</button>
  </form>`;

  const corpo = `<div class="cc-ci">
${avisos}
${kpis}
${cartaoSecao({ titulo: 'Por empresa', dica: 'mensalidade × custo de IA → margem', acoesHtml: formAlerta, corpoHtml: porEmpresa })}
${detalhes}
<div style="margin-top:16px">${cartaoSecao({ titulo: 'Por uso (todas as empresas)', dica: 'conversa, leitura de foto/PDF, resumos, reativação…', corpoHtml: tabelaUsos(p.porUso) })}</div>
<p class="cc-ci-nota" style="margin-top:14px">Valores estimados pelo sistema (tokens × preço do modelo × câmbio de referência), podem diferir alguns % da fatura da Anthropic. Até 28/09/2026 todo gasto era gravado como da casa; a divisão por empresa vale daí pra frente. Só a casa vê esta tela — nenhuma empresa cliente vê custo da casa nem de outra empresa.</p>
</div>`;

  return paginaConfiguracoes({
    active: 'custo_ia', secao: 'custo_ia', title: 'Custo de IA', user, css: CSS_CUSTO_IA,
    cabecalhoHtml: cabecalhoPagina({
      trilha: [{ rotulo: 'Configurações' }, { rotulo: 'Custo de IA' }],
      titulo: 'Custo de IA',
      subtitulo: `Quanto cada empresa gasta de inteligência artificial — ${p.mesAtual} e ${p.mesAnterior}.`,
    }),
    corpoHtml: corpo,
  });
}
