// src/modules/dashboard/financeiro-views.ts
// Visão financeira (/dashboard/financeiro). Renovação do miolo — R10
// (28/09/2026): mesmos números (FinanceiroData), mesmos gráficos ECharts
// (#graf, #pizza, dados em #fin-data) e mesmos links de filtro; visual no
// padrão cc- do Command Center, tema escuro (D4), sem Tailwind.
import type { FinanceiroData } from './financeiro-queries.js';
import { renderLayout } from './views.js';
import type { DashUser } from './permissions.js';
import { escapeHtml, hrefSeguro } from './ui/html.js';
import {
  cabecalhoPagina, faixaKpis, cartaoSecao, tabela, estadoVazio, pilulaStatus, type Tom,
} from './ui/componentes.js';
import { JS_TEMA_GRAFICOS } from './ui/graficos.js';
import { temaDaTela } from './ui/tema.js';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (n: number) => `${(n * 100).toFixed(1).replace('.', ',')}%`;
const STATUS_LABEL: Record<string, string> = {
  pendente: 'Pendente', recebido_parcial: 'Parcial', recebido: 'Recebido', cancelado: 'Cancelado',
};
const STATUS_TOM: Record<string, Tom> = {
  pendente: 'atencao', recebido_parcial: 'acompanhar', recebido: 'normal', cancelado: 'sem_dado',
};

const CSS_FINANCEIRO = `
.cc-fin .cc-kstrip+.cc-kstrip{margin-top:12px}
.cc-fin .cc-panel+.cc-panel,.cc-fin .cc-kstrip+.cc-panel,.cc-fin .cc-fin-2+.cc-panel,.cc-fin .cc-panel+.cc-fin-2{margin-top:16px}
.cc-fin-2{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:16px;margin-top:16px}
.cc-fin-2>.cc-fin-col{display:flex;flex-direction:column;gap:16px;min-width:0}
.cc-fin-2 .cc-panel{margin:0}
.cc-fin-graf{height:280px}
.cc-fin-fr{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.cc-fin-fr .cc-big{font-size:30px;font-weight:700}
.cc-fin-fr.cc-fin-ok .cc-big{color:var(--cc-ok)} .cc-fin-fr.cc-fin-ruim .cc-big{color:var(--cc-crit)}
.cc-fin-nota{margin:8px 0 0;font-size:12.5px;color:var(--cc-muted)}
.cc-fin-nota b{color:var(--cc-text);font-family:var(--cc-f-num)}
.cc-fin-pf{display:flex;gap:18px;flex-wrap:wrap;font-size:14px;color:var(--cc-text-2)}
.cc-fin-pf b{font-family:var(--cc-f-num)}
.cc-fin-mais{color:var(--cc-ok)} .cc-fin-menos{color:var(--cc-crit)}
.cc-fin .cc-chips{margin-bottom:12px}
.cc-fin-doc{font-size:16px}
@media (max-width:1023px){.cc-fin-2{grid-template-columns:minmax(0,1fr)}}
@media (max-width:760px){.cc-fin-graf{height:220px}}
`;

export function renderFinanceiroPage(d: FinanceiroData, user?: DashUser): string {
  const dataJson = JSON.stringify(d).replace(/</g, '\\u003c');
  const f = d.filtros ?? {};
  const lucroOk = d.caixa.lucroMes >= 0;

  const cabecalho = cabecalhoPagina({
    trilha: [{ rotulo: 'Financeiro' }, { rotulo: 'Visão financeira' }],
    titulo: 'Financeiro',
    subtitulo: `Competência ${d.competencia} · caixa, imposto e contas a receber do mês`,
  });

  const kpis1 = faixaKpis([
    { rotulo: 'Recebido no mês', valor: d.faturamentoMes, casas: 2, prefixo: 'R$', destaque: true },
    { rotulo: `RBT12 (faixa ${d.faixa})`, valor: d.rbt12, casas: 2, prefixo: 'R$', detalhe: d.salto ? `faltam ${brl(d.salto.distancia)} pro salto` : 'última faixa' },
    { rotulo: 'Imposto a separar', valor: d.impostoASeparar, casas: 2, prefixo: 'R$' },
    { rotulo: 'A receber', valor: d.aReceber, casas: 2, prefixo: 'R$' },
  ]);
  const kpis2 = faixaKpis([
    { rotulo: 'Saiu no mês (PJ)', valor: d.caixa.saiuMesPj, casas: 2, prefixo: 'R$' },
    { rotulo: 'Lucro do mês', valor: d.caixa.lucroMes, casas: 2, prefixo: 'R$',
      tendencia: { texto: lucroOk ? 'no azul' : 'no vermelho', direcao: lucroOk ? 'sobe' : 'desce' },
      detalhe: '· caixa − saiu − imposto', },
    { rotulo: 'Entrou (caixa real)', valor: d.caixa.entrouMesPjCaixa, casas: 2, prefixo: 'R$',
      detalhe: d.caixa.entrouSemNotaPj > 0 ? `Por fora (sem nota): ${brl(d.caixa.entrouSemNotaPj)}` : undefined },
    { rotulo: 'Faturado (base imposto)', valor: d.caixa.faturadoMesPj, casas: 2, prefixo: 'R$' },
  ]);

  const pf = cartaoSecao({
    titulo: 'Mundo PF',
    dica: 'pessoal — fora do lucro da empresa',
    corpoHtml: `<div class="cc-fin-pf"><span>Entrou: <b class="cc-fin-mais">${escapeHtml(brl(d.caixa.entrouMesPf))}</b></span><span>Saiu: <b class="cc-fin-menos">${escapeHtml(brl(d.caixa.saiuMesPf))}</b></span></div>
      <p class="cc-fin-nota">Lucro do mês = caixa real − saiu − imposto (DAS pago não desconta 2×).</p>`,
  });

  const temGraf = d.faturamentoMensal.length > 0 || d.despesasMensal.length > 0;
  const grafico = cartaoSecao({
    titulo: 'Entrou × Saiu mês a mês',
    dica: 'verde entrou · cinza saiu · dourado sobrou',
    corpoHtml: `${temGraf ? '' : estadoVazio({ tipo: 'sem_dado', titulo: 'Sem movimento nos últimos meses', compacto: true })}<div id="graf" class="cc-fin-graf"${temGraf ? '' : ' hidden'}></div>`,
  });

  const fatorR = cartaoSecao({
    titulo: 'Fator R',
    corpoHtml: `<div class="cc-fin-fr ${d.fatorR.anexo === 'III' ? 'cc-fin-ok' : 'cc-fin-ruim'}"><span class="cc-big">${escapeHtml(pct(d.fatorR.ratio))}</span>${pilulaStatus(d.fatorR.anexo === 'III' ? 'normal' : 'critico', `Anexo ${d.fatorR.anexo}`)}</div>
      <p class="cc-fin-nota">Pró-labore mínimo p/ Anexo III: <b>${escapeHtml(brl(d.fatorR.proLaboreMin))}/mês</b></p>`,
  });

  const pizza = cartaoSecao({
    titulo: 'Pra onde foi o dinheiro',
    dica: 'mês, PJ',
    corpoHtml: d.caixa.pizzaCategorias.length === 0
      ? estadoVazio({ tipo: 'vazio', titulo: 'Sem despesas no mês ainda', compacto: true })
      : '<div id="pizza" class="cc-fin-graf"></div>',
  });

  const contas = cartaoSecao({
    titulo: 'Contas a receber',
    corpoHtml: tabela({
      mobile: 'cartoes',
      vazio: 'Nenhuma conta a receber',
      colunas: [{ titulo: 'Descrição' }, { titulo: 'Valor', alinhar: 'dir', num: true }, { titulo: 'Status' }, { titulo: 'Imposto', alinhar: 'dir', num: true }],
      linhas: d.contas.map((c) => [
        c.descricao ?? null,
        brl(c.valor),
        { html: pilulaStatus(STATUS_TOM[c.status] ?? 'info', STATUS_LABEL[c.status] ?? c.status) },
        c.imposto != null ? brl(c.imposto) : null,
      ]),
    }),
  });

  // Filtros dos lançamentos: os MESMOS links de antes (relativos, ?tipo= / ?pfpj=).
  const chipF = (href: string, rotulo: string, ativo: boolean) =>
    `<a class="cc-chip${ativo ? ' cc-chip-on' : ''}" href="${href}"${ativo ? ' aria-current="true"' : ''}>${rotulo}</a>`;
  const semFiltro = !f.tipo && !f.pfpj && !f.categoria && !f.competencia;
  const filtros = `<div class="cc-chips cc-chips-rolar">
      ${chipF('/dashboard/financeiro', 'Todos', semFiltro)}
      ${chipF('?tipo=despesa', 'Gastos', f.tipo === 'despesa')}
      ${chipF('?tipo=entrada', 'Entradas', f.tipo === 'entrada')}
      ${chipF('?pfpj=PJ', 'PJ', f.pfpj === 'PJ')}
      ${chipF('?pfpj=PF', 'PF', f.pfpj === 'PF')}
    </div>`;

  const lancamentos = cartaoSecao({
    titulo: 'Lançamentos',
    corpoHtml: `${filtros}${tabela({
      mobile: 'cartoes',
      vazio: 'Nenhum lançamento neste filtro',
      colunas: [{ titulo: 'Data' }, { titulo: 'Tipo' }, { titulo: 'Valor', alinhar: 'dir', num: true }, { titulo: 'Quem' }, { titulo: 'Categoria' }, { titulo: 'PF/PJ' }, { titulo: 'Doc' }],
      linhas: d.lancamentos.map((l) => {
        const doc = hrefSeguro(l.comprovanteUrl);
        return [
          { html: `<span class="cc-num">${escapeHtml(`${l.data_evento.slice(8, 10)}/${l.data_evento.slice(5, 7)}`)}</span>` },
          { html: l.tipo === 'entrada' ? pilulaStatus('normal', 'Entrada') : pilulaStatus('atencao', 'Gasto') },
          { html: `${escapeHtml(brl(l.valor))}${l.tipo === 'entrada' && !l.tem_nota ? ` ${pilulaStatus('acompanhar', 'sem nota')}` : ''}` },
          l.contraparte ?? null,
          l.categoriaNome ?? null,
          { html: l.pf_pj ? pilulaStatus(l.pf_pj === 'PJ' ? 'info' : 'acompanhar', l.pf_pj) : '—' },
          { html: doc ? `<a class="cc-fin-doc" href="${escapeHtml(doc)}" target="_blank" rel="noopener" title="Abrir comprovante">📎</a>` : '—' },
        ];
      }),
    })}`,
  });

  const body = `<div class="cc-root cc-fin">
  ${cabecalho}
  ${kpis1}
  ${kpis2}
  <div class="cc-fin-2">
    <div class="cc-fin-col">${grafico}${pf}</div>
    <div class="cc-fin-col">${fatorR}${pizza}</div>
  </div>
  ${contas}
  ${lancamentos}
</div>
<style>${CSS_FINANCEIRO}</style>
<script type="application/json" id="fin-data">${dataJson}</script>`;

  // Gráficos: mesmos dados (#fin-data) e contêineres; cores do tema cc
  // (JS_TEMA_GRAFICOS registra o tema 'cc' e expõe window.ccTema).
  const scripts = `<script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"></script>
${JS_TEMA_GRAFICOS}
<script>
  const T = window.ccTema || {};
  const d = JSON.parse(document.getElementById('fin-data').textContent);
  const reais = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const celular = window.innerWidth < 760;
  // #graf sempre existe (igual a antes); sem dado fica escondido.
  const g = echarts.init(document.getElementById('graf'), 'cc');
  const meses = [...new Set([...d.faturamentoMensal.map(x=>x.competencia), ...d.despesasMensal.map(x=>x.competencia)])].sort();
  const entrou = meses.map(m => (d.faturamentoMensal.find(x=>x.competencia===m)?.receita) ?? 0);
  const saiu = meses.map(m => (d.despesasMensal.find(x=>x.competencia===m)?.total) ?? 0);
  const sobrou = meses.map((m, i) => Math.round((entrou[i] - saiu[i]) * 100) / 100);
  g.setOption({ tooltip:{trigger:'axis', valueFormatter: reais}, legend:{},
    grid:{left:8, right:8, top:36, bottom:8, containLabel:true},
    xAxis:{type:'category', data:meses}, yAxis:{type:'value', axisLabel:{formatter: (v) => Math.abs(v) >= 1000 ? (v / 1000).toLocaleString('pt-BR') + ' mil' : String(v)}},
    series:[{name:'Entrou', type:'bar', data:entrou, itemStyle:{color:T.ok, borderRadius:[4,4,0,0]}},
            {name:'Saiu', type:'bar', data:saiu, itemStyle:{color:T.off, borderRadius:[4,4,0,0]}},
            {name:'Sobrou', type:'line', data:sobrou, smooth:true, symbolSize:6, itemStyle:{color:T.gold}, lineStyle:{color:T.gold, width:2}}] });
  window.addEventListener('resize', ()=>g.resize());
  ${d.caixa.pizzaCategorias.length > 0 ? `
  const p = echarts.init(document.getElementById('pizza'), 'cc');
  p.setOption({ tooltip:{trigger:'item', valueFormatter: reais},
    legend: celular ? { type:'scroll', bottom:0 } : { show:false },
    series:[{type:'pie', radius: celular ? ['35%','60%'] : ['40%','70%'], avoidLabelOverlap:true,
      data:d.caixa.pizzaCategorias.map(x=>({name:x.categoria, value:x.total})),
      label: celular ? { show:false } : { color:T.text }}] });
  window.addEventListener('resize', ()=>p.resize());
  ` : ''}
</script>`;

  return renderLayout({
    active: 'financeiro', title: 'Financeiro', user, body, scripts,
    tailwind: false, dark: temaDaTela(user, 'escuro') === 'escuro', largo: true,
  });
}
