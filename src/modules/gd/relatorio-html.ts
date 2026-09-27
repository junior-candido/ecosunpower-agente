// HTML A4 (2 páginas) do relatório mensal da usina. Letra grande, cores da
// marca do tenant, gráfico Chart.js (sem animação, pro Puppeteer capturar
// pronto). Cada página tem altura FIXA de A4 e o gerador de PDF confere que
// saíram exatamente 2 páginas.

import type { RelatorioGd } from './relatorio-motor.js';
import type { MarcaRelatorio } from './relatorio-marca.js';

/** Texto fixo do rodapé que o gerador de PDF procura pra saber que nada cortou. */
export const RODAPE_CONFERENCIA = 'Relatório gerado a partir do demonstrativo da concessionária';
/**
 * Marca invisível gravada no DOM só DEPOIS que `new Chart(...)` roda sem
 * lançar. O Chart.js vem de CDN: se o script não carregar (rede caiu,
 * bloqueio, etc.), `Chart` fica indefinido, `new Chart(...)` lança e esta
 * linha nunca executa — o gerador de PDF confere essa marca no texto
 * extraído pra nunca entregar um PDF com o gráfico em branco sem avisar.
 */
export const MARCA_GRAFICO_OK = 'grafico-ok';

const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const kwh = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kWh`);
const brl = (v: number | null) => (v === null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' '));
/** JSON dentro de <script>: impede fechar a tag. */
const jsonSeguro = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');

export function renderRelatorioHtml(r: RelatorioGd, m: MarcaRelatorio): string {
  // Logo da casa (silver, feita pra fundo escuro) vai direto na faixa; logo de tenant
  // (cores desconhecidas) entra numa caixa branca pra sempre ficar legível.
  const logoHtml = m.logoSrc
    ? (m.ehCasa
        ? `<img class="logo" src="${esc(m.logoSrc)}" alt="${esc(m.nomeFantasia)}">`
        : `<div class="logo-caixa"><img class="logo logo-tenant" src="${esc(m.logoSrc)}" alt="${esc(m.nomeFantasia)}"></div>`)
    : `<div class="nome-empresa">${esc(m.nomeFantasia)}</div>`;
  const cab = `
<header class="cab">
  ${logoHtml}
  <div class="cab-dir"><div class="titulo">Relatório da sua usina solar</div>
  <div class="sub">${esc(r.cliente)} · UC ${esc(r.instalacao)} · ${esc(r.mesExtenso)}</div></div>
</header>`;
  const card = (icone: string, rot: string, valor: string) =>
    `<div class="card"><div class="rot">${icone} ${rot}</div><div class="valor">${valor}</div></div>`;
  const rodape = (n: number) => `
<footer class="rod">
  <div>${esc(m.nomeFantasia)}${m.telefone ? ` · ${esc(m.telefone)}` : ''} · ${esc(m.email)} · ${esc(m.site)}</div>
  <div>${esc(m.rodapeRt)}</div>
  <div class="conf">${RODAPE_CONFERENCIA} · página ${n} de 2</div>
</footer>`;

  const rateio = r.rateio.length > 1 ? `
<section class="bloco"><h2>Rateio dos créditos</h2>
<table><tr><th>Unidade (código do cliente)</th><th>Parte</th><th>Saldo</th></tr>
${r.rateio.map((u) => `<tr><td>${esc(u.codigoCliente)}</td><td>${esc(u.percentual)}%</td><td>${kwh(u.saldoKwh)}</td></tr>`).join('')}
</table></section>` : '';

  const venc = r.creditos.aVencerKwh && r.creditos.aVencerKwh > 0 && r.creditos.venceEm
    ? `<p class="alerta">⏰ ${kwh(r.creditos.aVencerKwh)} de créditos vencem em <b>${esc(r.creditos.venceEm)}</b>. Use antes disso.</p>` : '';

  const desempenho = r.desempenho.percentual !== null ? `
<section class="bloco"><h2>Desempenho da usina</h2>
<p class="grande">Gerou <b>${kwh(r.gerouKwh)}</b> de <b>${kwh(r.desempenho.esperadoKwh)}</b> esperados
(<b>${r.desempenho.percentual}%</b>)${r.desempenho.potenciaKwp ? ` para uma usina de ${r.desempenho.potenciaKwp.toLocaleString('pt-BR')} kWp` : ''}.</p>
<p class="nota">O esperado considera o tamanho da usina, a média de sol da região e os dias do mês. Meses com mais chuva ficam abaixo; é normal variar.</p>
</section>` : '';

  // Demonstrativo digitado não traz histórico: sem meses, sem gráfico (nem Chart.js).
  const temGrafico = r.meses.length > 0;
  const grafico = temGrafico ? `<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<script>
(function () {
  var meses = ${jsonSeguro(r.meses)};
  new Chart(document.getElementById('g13'), {
    type: 'bar',
    data: {
      labels: meses.map(function (m) { return m.rotulo; }),
      datasets: [
        { label: 'Geração (kWh)', data: meses.map(function (m) { return m.geracao; }), backgroundColor: '#f59e0b' },
        { label: 'Consumo (kWh)', data: meses.map(function (m) { return m.consumo; }), backgroundColor: '#64748b' },
        { label: 'Injetado (kWh)', data: meses.map(function (m) { return m.injetado; }), backgroundColor: '#22c55e' }
      ]
    },
    options: { animation: false, responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { font: { size: 13 } } } },
      scales: { x: { ticks: { font: { size: 12 } } }, y: { beginAtZero: true, ticks: { font: { size: 12 } } } } }
  });
  // Marca dentro da .pagina (altura FIXA, overflow:hidden) — nunca em document.body:
  // lá fora ela somaria altura ao documento e o PDF sairia com 3 páginas.
  document.getElementById('g13').insertAdjacentHTML('afterend', '<span style="font-size:1px;color:#fff">${MARCA_GRAFICO_OK}</span>');
})();
</script>
` : '';

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório ${esc(r.mesExtenso)}</title>
<style>
@page{size:A4;margin:0}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#1f2937;font-size:15px}
.pagina{width:210mm;height:297mm;position:relative;overflow:hidden;page-break-after:always}
.pagina:last-child{page-break-after:auto}
.cab{display:flex;align-items:center;gap:18px;background:${esc(m.cor)};padding:14px 14mm;margin-bottom:12px}
.logo{max-height:95px;max-width:300px;display:block}
.logo-caixa{background:#fff;border-radius:10px;padding:8px 16px;display:flex;align-items:center}
.logo-tenant{max-height:75px;max-width:260px;display:block}
.nome-empresa{font-size:26px;font-weight:bold;color:#fff}
.titulo{font-size:22px;font-weight:bold;color:#fff}
.sub{font-size:15px;color:rgba(255,255,255,.88)}
.conteudo{padding:0 14mm 22mm 14mm}
.cards{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:10px 0}
.card{border:1px solid #e5e7eb;border-left:6px solid ${esc(m.cor)};border-radius:8px;padding:10px 12px}
.rot{font-size:14px;color:#6b7280}.valor{font-size:28px;font-weight:bold}
.frase{font-size:17px;line-height:1.5;background:#f8fafc;border-radius:8px;padding:10px 14px;margin:8px 0}
h2{font-size:18px;color:${esc(m.cor)};margin:10px 0 6px}
.bloco{margin-bottom:8px}
.grafico{height:400px}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid #e5e7eb;padding:5px 8px;text-align:left}th{background:#f1f5f9}
.alerta{font-size:16px;background:#fef3c7;border-left:6px solid #f59e0b;padding:8px 12px;border-radius:6px}
.grande{font-size:16px}.nota{font-size:13px;color:#6b7280}
dl{margin:0;font-size:13.5px}dt{font-weight:bold;margin-top:4px}dd{margin:0 0 2px 0}
.fontes{font-size:11.5px;color:#6b7280;margin-top:6px}
.rod{position:absolute;left:14mm;right:14mm;bottom:8mm;border-top:1px solid #e5e7eb;padding-top:5px;font-size:11px;color:#6b7280}
.conf{margin-top:2px}
</style></head><body>

<div class="pagina">
${cab}
<div class="conteudo">
<div class="cards">
  ${card('☀', 'Sua usina gerou', kwh(r.gerouKwh))}
  ${card('🏠', 'Consumo medido pela concessionária', kwh(r.consumiuKwh))}
  ${card('💰', 'Economia estimada no mês', brl(r.economiaRs))}
  ${card('🔋', 'Seus créditos guardados', kwh(r.creditosKwh))}
</div>
<p class="frase">${esc(r.frase)}</p>
<h2>Últimos meses</h2>
${temGrafico ? '<div class="grafico"><canvas id="g13"></canvas></div>' : '<p class="nota">Histórico dos meses não disponível neste demonstrativo.</p>'}
</div>
${rodape(1)}
</div>

<div class="pagina">
${cab}
<div class="conteudo">
<section class="bloco"><h2>Seus créditos</h2>
<table>
<tr><th>Saldo de créditos</th><td>${kwh(r.creditos.saldoKwh)}</td></tr>
<tr><th>Usados neste mês</th><td>${kwh(r.creditos.usadosNoMesKwh)}</td></tr>
</table>
${venc}
</section>
${rateio}
${desempenho}
<section class="bloco"><h2>Para entender</h2><dl>
<dt>Injetado</dt><dd>Energia que a usina mandou para a rede quando gerou mais do que a casa usava naquele momento.</dd>
<dt>Compensado</dt><dd>Créditos usados para abater o consumo da conta no mês.</dd>
<dt>Crédito</dt><dd>Energia injetada que sobrou e fica guardada para os próximos meses. Vale por 60 meses.</dd>
<dt>Rateio</dt><dd>Divisão dos créditos entre as unidades cadastradas, em porcentagem.</dd>
</dl></section>
<div class="fontes"><b>De onde vêm os números:</b><br>${r.fontes.map(esc).join('<br>')}</div>
</div>
${rodape(2)}
</div>

${grafico}</body></html>`;
}
