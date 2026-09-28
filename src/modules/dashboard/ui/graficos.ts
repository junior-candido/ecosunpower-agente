// src/modules/dashboard/ui/graficos.ts
// Gráficos no tema do painel (renovação do miolo, R1). Chart.js e ECharts
// continuam vindo do CDN de cada tela; este trecho só LÊ as cores dos tokens
// `--cc-*` (escuro ou claro, conforme a casca) e aplica:
//   - Chart.js: Chart.defaults (texto, grade, fonte);
//   - ECharts: registra o tema 'cc' (use echarts.init(el, 'cc')).
// Deve entrar DEPOIS do <script src> do Chart/ECharts e ANTES do código do
// gráfico. Não quebra se a biblioteca não estiver na página.
// Cores de série: window.ccTema.{ok, gold, crit, info, off, muted}.

export const JS_TEMA_GRAFICOS = `<script id="cc-tema-graficos">
(function () {
  var alvo = document.querySelector('.cc-shell') || document.documentElement;
  var cs = getComputedStyle(alvo);
  function v(n, padrao) { var x = (cs.getPropertyValue(n) || '').trim(); return x || padrao; }
  var T = {
    text: v('--cc-text-2', '#C4D3E3'), muted: v('--cc-muted', '#8CA3BC'), line: v('--cc-line-2', 'rgba(150,185,225,.18)'),
    gold: v('--cc-gold', '#F0A500'), ok: v('--cc-ok', '#3DBB6E'), crit: v('--cc-crit', '#E4574B'),
    warn: v('--cc-warn', '#F2862E'), info: v('--cc-info', '#38BDF8'), off: v('--cc-off', '#7F90A6'),
    fonte: v('--cc-f-text', 'Inter, system-ui, sans-serif'), fonteNum: v('--cc-f-num', 'Space Grotesk, system-ui, sans-serif')
  };
  window.ccTema = T;
  if (window.Chart && window.Chart.defaults) {
    var d = window.Chart.defaults;
    d.color = T.muted;
    d.borderColor = T.line;
    if (d.font) d.font.family = T.fonte;
  }
  if (window.echarts && window.echarts.registerTheme) {
    window.echarts.registerTheme('cc', {
      backgroundColor: 'transparent',
      color: [T.ok, T.off, T.gold, T.info, T.warn, T.crit],
      textStyle: { color: T.text, fontFamily: T.fonte },
      legend: { textStyle: { color: T.muted } },
      categoryAxis: { axisLine: { lineStyle: { color: T.line } }, axisLabel: { color: T.muted }, splitLine: { lineStyle: { color: T.line } } },
      valueAxis: { axisLine: { lineStyle: { color: T.line } }, axisLabel: { color: T.muted }, splitLine: { lineStyle: { color: T.line } } },
      tooltip: { backgroundColor: 'rgba(15,33,56,.95)', borderColor: T.line, textStyle: { color: '#EAF1F8' } }
    });
  }
})();
</script>`;
