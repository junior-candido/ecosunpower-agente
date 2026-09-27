// HTML A4 (2 páginas) do RELATÓRIO DO PERÍODO da usina. Mesma identidade
// visual do mensal (faixa da marca + logo grande, rodapé, gráfico) — as peças
// vêm de relatorio-html.ts. Página 1: os 4 números do período, a frase e o
// gráfico de 13 meses com o período em destaque. Página 2: mês a mês, rateio
// por unidade, créditos, desempenho, glossário e fontes. Tem de caber em 2
// páginas com até 12 meses e 6 unidades (tabelas apertam quando há muitas linhas).

import type { RelatorioPeriodoGd } from './relatorio-periodo-motor.js';
import type { MarcaRelatorio } from './relatorio-marca.js';
import {
  GLOSSARIO_HTML, brl, cabecalhoHtml, cardHtml, esc, estilosBase, kwh, rodapeHtml, scriptConferenciaCorte, scriptGrafico,
} from './relatorio-html.js';

/** A partir daqui as tabelas da página 2 usam letra menor (senão 12 meses + 6 unidades não cabem). */
const LINHAS_PARA_APERTAR = { meses: 8, unidades: 4 } as const;

export function renderRelatorioPeriodoHtml(r: RelatorioPeriodoGd, m: MarcaRelatorio): string {
  const cab = cabecalhoHtml(m, `Relatório da sua usina solar —<br>${esc(r.periodoExtenso)}`, `${esc(r.cliente)} · UC ${esc(r.instalacao)}`);
  const apertada = r.meses.length > LINHAS_PARA_APERTAR.meses || r.rateio.length > LINHAS_PARA_APERTAR.unidades;
  const classeTabela = apertada ? ' class="apertada"' : '';

  const linhasMeses = r.meses.map((x) =>
    `<tr><td>${esc(x.rotulo)}</td><td class="n">${kwh(x.gerouKwh)}</td><td class="n">${kwh(x.consumoKwh)}</td><td class="n">${kwh(x.compensadoKwh)}</td><td class="n">${brl(x.economiaRs)}</td></tr>`).join('');
  const tabelaMeses = `
<section class="bloco"><h2>Mês a mês</h2>
<table${classeTabela}><tr><th>Mês</th><th class="n">Gerou</th><th class="n">Consumo</th><th class="n">Créditos usados</th><th class="n">Economia estimada</th></tr>
${linhasMeses}
<tr class="total"><td>Total</td><td class="n">${kwh(r.totais.gerouKwh)}</td><td class="n">${kwh(r.totais.consumoKwh)}</td><td class="n">${kwh(r.totais.compensadoKwh)}</td><td class="n">${brl(r.totais.economiaRs)}</td></tr>
</table></section>`;

  const rateio = r.rateio.length > 1 ? `
<section class="bloco"><h2>Rateio dos créditos — soma do período</h2>
<table${classeTabela}><tr><th>Unidade (código do cliente)</th><th class="n">Parte</th><th class="n">Consumo</th><th class="n">Créditos usados</th><th class="n">Saldo hoje</th></tr>
${r.rateio.map((u) => `<tr><td>${esc(u.codigoCliente)}</td><td class="n">${u.percentual === null ? '—' : `${esc(u.percentual)}%`}</td><td class="n">${kwh(u.consumoKwh)}</td><td class="n">${kwh(u.compensadoKwh)}</td><td class="n">${kwh(u.saldoKwh)}</td></tr>`).join('')}
</table></section>` : '';

  // Mesma regra do mensal: alerta só quando vence em até 6 meses do fim do período.
  const temVencimento = Boolean(r.creditos.aVencerKwh && r.creditos.aVencerKwh > 0 && r.creditos.venceEm);
  const venc = !temVencimento ? ''
    : r.creditos.avisoVencimento === 'alerta'
      ? `<p class="alerta">⏰ ${kwh(r.creditos.aVencerKwh)} de créditos vencem em <b>${esc(r.creditos.venceEm)}</b>. Use antes disso.</p>`
      : r.creditos.avisoVencimento === 'validade'
        ? `<p class="nota">Créditos válidos até <b>${esc(r.creditos.venceEm)}</b>.</p>`
        : '';
  const creditos = `
<section class="bloco"><h2>Seus créditos</h2>
<p class="grande">Guardados hoje: <b>${kwh(r.creditos.saldoKwh)}</b> · Usados no período: <b>${kwh(r.creditos.usadosNoPeriodoKwh)}</b></p>
${venc}
</section>`;

  const desempenho = r.desempenho.percentual !== null ? `
<section class="bloco"><h2>Desempenho da usina no período</h2>
<p class="grande">Gerou <b>${kwh(r.totais.gerouKwh)}</b> de <b>${kwh(r.desempenho.esperadoKwh)}</b> esperados
(<b>${r.desempenho.percentual}%</b>)${r.desempenho.potenciaKwp ? ` para uma usina de ${r.desempenho.potenciaKwp.toLocaleString('pt-BR')} kWp` : ''}.
<span class="nota">Meses com mais chuva ficam abaixo; é normal variar.</span></p>
</section>` : '';

  const temGrafico = r.grafico.length > 0;
  // Meses do período em cor cheia; os de antes, esmaecidos (mesma cor, transparente).
  const cor = (forte: string, fraca: string) => `meses.map(function (m) { return m.noPeriodo ? '${forte}' : '${fraca}'; })`;
  const grafico = temGrafico ? scriptGrafico(r.grafico, `[
        { label: 'Geração (kWh)', data: meses.map(function (m) { return m.geracao; }), backgroundColor: ${cor('#f59e0b', 'rgba(245,158,11,.3)')} },
        { label: 'Consumo (kWh)', data: meses.map(function (m) { return m.consumo; }), backgroundColor: ${cor('#64748b', 'rgba(100,116,139,.3)')} },
        { label: 'Injetado (kWh)', data: meses.map(function (m) { return m.injetado; }), backgroundColor: ${cor('#22c55e', 'rgba(34,197,94,.3)')} }
      ]`) : '';

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório da sua usina solar — ${esc(r.periodoExtenso)}</title>
<style>
${estilosBase(m)}
.titulo{font-size:21px;line-height:1.25}
.grafico{height:480px}
td.n,th.n{text-align:right;white-space:nowrap}
tr.total td{font-weight:bold;background:#f8fafc}
table{font-size:13px}th,td{padding:4px 7px}
table.apertada{font-size:11.5px}table.apertada th,table.apertada td{padding:2px 6px}
h2{font-size:17px;margin:8px 0 5px}
.bloco{margin-bottom:6px}
dl{font-size:12.5px}
</style></head><body>

<div class="pagina">
${cab}
<div class="conteudo">
<div class="cards">
  ${cardHtml('☀', 'Sua usina gerou no período', kwh(r.totais.gerouKwh))}
  ${cardHtml('🏠', 'Consumo no período', kwh(r.totais.consumoKwh))}
  ${cardHtml('💰', 'Economia estimada no período', brl(r.totais.economiaRs))}
  ${cardHtml('🔋', 'Créditos guardados hoje', kwh(r.creditosHojeKwh))}
</div>
<p class="frase">${esc(r.frase)}</p>
<h2>Últimos meses</h2>
${temGrafico
    ? '<p class="nota">Os meses do período estão em cor forte; os anteriores, mais claros.</p>\n<div class="grafico"><canvas id="g13"></canvas></div>'
    : '<p class="nota">Histórico dos meses não disponível neste demonstrativo.</p>'}
</div>
${rodapeHtml(m, 1)}
</div>

<div class="pagina">
${cab}
<div class="conteudo">
${tabelaMeses}
${rateio}
${creditos}
${desempenho}
${apertada ? '' : GLOSSARIO_HTML}
<div class="fontes"><b>De onde vêm os números:</b><br>${r.fontes.map(esc).join('<br>')}</div>
</div>
${rodapeHtml(m, 2)}
</div>

${grafico}${scriptConferenciaCorte()}</body></html>`;
}
