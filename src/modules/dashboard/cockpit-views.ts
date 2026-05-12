// cockpit-views.ts
// Layout futurista 1-tela pro /dashboard/cockpit. Fundo preto + neon
// ciano/ambar/verde. Sem dependencia de build. Tailwind via CDN + ECharts
// via CDN pros gauges/funil/sparkline. Auto-refresh JS a cada 30s sem
// reload da pagina (fetch JSON + re-render).

import type { CockpitData } from './cockpit-queries.js';

function escapeHtml(s: string | null | undefined): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function brl(v: number | null | undefined): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function formatPhoneShort(phone: string): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 11) return phone;
  const ddd = digits.slice(-11, -9);
  const meio = digits.slice(-9, -4);
  const fim = digits.slice(-4);
  return `(${ddd}) ${meio}-${fim}`;
}

const STATUS_COLOR: Record<string, string> = {
  novo: '#06b6d4',
  qualificando: '#22d3ee',
  agendado: '#fbbf24',
  cliente_fechado: '#22c55e',
  perdido: '#64748b',
};

export function renderCockpitPage(data: CockpitData): string {
  // Serializa dados pro JS do cliente. Usa <script type="application/json">
  // (template element data) em vez de string-em-JS pra eliminar vetores XSS
  // como U+2028/U+2029 e </script>. JSON.parse via textContent eh seguro.
  const dataJson = JSON.stringify(data).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cockpit · EcoSun</title>
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"></script>
<style>
  body {
    background: #050610;
    color: #d1d5db;
    font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
    overflow: hidden;
  }
  .glow-cyan   { box-shadow: 0 0 0 1px #06b6d4, 0 0 18px -2px rgba(6,182,212,0.55); }
  .glow-amber  { box-shadow: 0 0 0 1px #fbbf24, 0 0 18px -2px rgba(251,191,36,0.55); }
  .glow-green  { box-shadow: 0 0 0 1px #22c55e, 0 0 18px -2px rgba(34,197,94,0.55); }
  .glow-rose   { box-shadow: 0 0 0 1px #f43f5e, 0 0 18px -2px rgba(244,63,94,0.55); }
  .panel {
    background: linear-gradient(180deg, rgba(15,23,42,0.85) 0%, rgba(2,6,23,0.85) 100%);
    border: 1px solid rgba(34,211,238,0.25);
    border-radius: 6px;
    backdrop-filter: blur(4px);
  }
  .panel-title {
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #67e8f9;
    border-bottom: 1px solid rgba(34,211,238,0.18);
    padding: 4px 10px;
  }
  .kpi-value {
    font-family: 'Orbitron', 'JetBrains Mono', monospace;
    font-weight: 800;
    line-height: 1;
  }
  .scan::before {
    content: '';
    position: absolute; inset: 0;
    background: repeating-linear-gradient(0deg, transparent 0, transparent 3px, rgba(6,182,212,0.04) 3px, rgba(6,182,212,0.04) 4px);
    pointer-events: none;
  }
  .blink { animation: blink 1.4s infinite; }
  @keyframes blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0.25; } }
  a.lead-link:hover { background: rgba(6,182,212,0.12); }
  /* Esconde scrollbar nativa pra manter look limpo */
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-thumb { background: rgba(6,182,212,0.4); border-radius: 4px; }
</style>
</head>
<body class="h-screen">
<div class="h-screen flex flex-col p-3 gap-3 scan relative">

  <!-- HEADER -->
  <div class="flex items-center justify-between px-2">
    <div class="flex items-center gap-3">
      <span class="text-cyan-400 text-xl">⚡</span>
      <span class="text-cyan-100 text-sm tracking-[0.3em] font-bold">ECOSUN · COCKPIT</span>
      <span class="text-xs text-emerald-400"><span class="blink">●</span> LIVE</span>
    </div>
    <div class="flex items-center gap-4 text-xs">
      <span class="text-cyan-300" id="hud-time">--:--:--</span>
      <span class="text-amber-300">ALERTAS: <span id="hud-alerts">${data.meta.alertasPendentes}</span></span>
      <span class="text-rose-300">SILENTES s/ CAD: <span id="hud-silent">${data.meta.silentesSemCadencia}</span></span>
      <button id="btn-sync" type="button"
        class="px-3 py-1 rounded border border-cyan-400 text-cyan-200 hover:bg-cyan-400 hover:text-slate-900 font-bold transition"
        title="Força sync Meta Ads + monitoramento agora">
        🔄 <span id="btn-sync-label">SYNC AGORA</span>
      </button>
      <a href="/dashboard/leads" class="text-cyan-300 hover:text-cyan-100">[LEADS]</a>
      <a href="/dashboard/home" class="text-cyan-300 hover:text-cyan-100">[HOME]</a>
    </div>
  </div>

  <!-- LINHA 1 — 4 KPIs grandes -->
  <div class="grid grid-cols-4 gap-3" style="flex: 0 0 auto;">
    ${data.kpis.map((k, i) => {
      const colors = ['glow-cyan', 'glow-rose', 'glow-amber', 'glow-green'];
      const valueColors = ['text-cyan-300', 'text-rose-300', 'text-amber-300', 'text-emerald-300'];
      return `<div class="panel ${colors[i] ?? 'glow-cyan'} p-3">
        <div class="text-[10px] uppercase tracking-widest text-slate-400">${escapeHtml(k.label)}</div>
        <div class="kpi-value text-5xl mt-1 ${valueColors[i] ?? 'text-cyan-300'}">${k.value}</div>
        <div class="text-[10px] text-slate-500 mt-1">${escapeHtml(k.hint ?? '')}</div>
      </div>`;
    }).join('')}
  </div>

  <!-- LINHA 2 — Gauges + Funil + Atividade 24h -->
  <div class="grid grid-cols-12 gap-3" style="flex: 1 1 auto; min-height: 0;">

    <!-- Gauge Eva -->
    <div class="panel col-span-3 flex flex-col">
      <div class="panel-title">EVA · CONVERSÃO 30D</div>
      <div id="chart-eva" class="flex-1"></div>
      <div class="text-center text-xs text-slate-400 pb-2">
        <span class="text-cyan-300 font-bold">${data.gauges.evaConversao.numerator}</span>
        de
        <span class="text-cyan-300 font-bold">${data.gauges.evaConversao.denominator}</span>
        leads (últimos 30d)
      </div>
    </div>

    <!-- Gauge Sistema -->
    <div class="panel col-span-3 flex flex-col">
      <div class="panel-title">SISTEMA · SAÚDE</div>
      <div id="chart-system" class="flex-1"></div>
      <div class="text-[10px] text-slate-400 px-3 pb-2 grid grid-cols-1 gap-0.5">
        ${data.gauges.sistemaSaude.subitens.map((s) => `
          <div class="flex justify-between">
            <span>${escapeHtml(s.name)}</span>
            <span class="${s.ok ? 'text-emerald-400' : 'text-rose-400'}">${s.ok ? '● ON' : '○ OFF'}</span>
          </div>`).join('')}
      </div>
    </div>

    <!-- Funil leads -->
    <div class="panel col-span-3 flex flex-col">
      <div class="panel-title">FUNIL · LEADS</div>
      <div id="chart-funnel" class="flex-1"></div>
    </div>

    <!-- Atividade 24h -->
    <div class="panel col-span-3 flex flex-col">
      <div class="panel-title">ATIVIDADE 24H</div>
      <div id="chart-activity" class="flex-1"></div>
      <div class="text-[10px] text-slate-400 px-3 pb-2 flex justify-around">
        <span><span class="inline-block w-2 h-2 bg-cyan-400 mr-1"></span>Mensagens</span>
        <span><span class="inline-block w-2 h-2 bg-amber-400 mr-1"></span>Cadência</span>
      </div>
    </div>

  </div>

  <!-- LINHA 3 — Top leads quentes + Campanha LIVE -->
  <div class="grid grid-cols-12 gap-3" style="flex: 1 1 auto; min-height: 0;">

    <!-- Top leads -->
    <div class="panel col-span-8 flex flex-col">
      <div class="panel-title flex justify-between">
        <span>LEADS QUENTES · TOP 5</span>
        <a href="/dashboard/leads" class="text-amber-300 hover:text-amber-200">VER TODOS →</a>
      </div>
      <div class="flex-1 overflow-auto">
        <table class="w-full text-xs">
          <thead class="text-slate-500 uppercase text-[10px] tracking-wider">
            <tr class="border-b border-slate-800">
              <th class="text-left px-3 py-1">Lead</th>
              <th class="text-left px-3 py-1">Telefone</th>
              <th class="text-left px-3 py-1">Cidade</th>
              <th class="text-left px-3 py-1">Status</th>
              <th class="text-right px-3 py-1">Ult. atual.</th>
              <th class="text-right px-3 py-1 pr-3">→</th>
            </tr>
          </thead>
          <tbody>
            ${data.topLeads.length === 0
              ? `<tr><td colspan="6" class="text-center text-slate-500 py-6">Sem leads quentes agora.</td></tr>`
              : data.topLeads.map((l) => {
                const color = STATUS_COLOR[l.status] ?? '#64748b';
                const minStr = l.minutosDesdeAtualizacao < 60
                  ? `${l.minutosDesdeAtualizacao}min`
                  : l.minutosDesdeAtualizacao < 1440
                    ? `${Math.floor(l.minutosDesdeAtualizacao / 60)}h`
                    : `${Math.floor(l.minutosDesdeAtualizacao / 1440)}d`;
                return `<tr class="border-b border-slate-900 lead-link">
                  <td class="px-3 py-1.5"><a href="/dashboard/leads/${escapeHtml(l.id)}" class="text-cyan-100 hover:text-cyan-300">${escapeHtml(l.name ?? '— sem nome —')}</a></td>
                  <td class="px-3 py-1.5 text-slate-400">${escapeHtml(formatPhoneShort(l.phone))}</td>
                  <td class="px-3 py-1.5 text-slate-400">${escapeHtml(l.cidade ?? '—')}</td>
                  <td class="px-3 py-1.5">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold" style="background:${color}25; color:${color}; border:1px solid ${color}66;">
                      ${escapeHtml(l.status.toUpperCase())}
                    </span>
                  </td>
                  <td class="px-3 py-1.5 text-right text-amber-300">${minStr}</td>
                  <td class="px-3 py-1.5 text-right pr-3"><a href="/dashboard/leads/${escapeHtml(l.id)}" class="text-cyan-400 hover:text-cyan-200">→</a></td>
                </tr>`;
              }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Campanha LIVE -->
    <div class="panel col-span-4 flex flex-col glow-amber">
      <div class="panel-title flex justify-between">
        <span>CAMPANHA · META ADS · 7D</span>
        <a href="/dashboard/marketing" class="text-amber-300 hover:text-amber-200">→</a>
      </div>
      <div class="flex-1 grid grid-cols-2 gap-2 p-3 content-start">
        <div>
          <div class="text-[10px] text-slate-400 uppercase">Ativas</div>
          <div class="text-3xl text-amber-300 kpi-value">${data.campanha.ativas}</div>
        </div>
        <div>
          <div class="text-[10px] text-slate-400 uppercase">Gasto 7d</div>
          <div class="text-2xl text-amber-300 kpi-value">${escapeHtml(brl(data.campanha.spend7d_brl))}</div>
        </div>
        <div>
          <div class="text-[10px] text-slate-400 uppercase">Leads 7d</div>
          <div class="text-2xl text-cyan-300 kpi-value">${data.campanha.leads7d}</div>
        </div>
        <div>
          <div class="text-[10px] text-slate-400 uppercase">CPL</div>
          <div class="text-2xl text-emerald-300 kpi-value">${escapeHtml(brl(data.campanha.cpl7d_brl ?? 0))}</div>
        </div>
        <div class="col-span-2">
          <div class="text-[10px] text-slate-400 uppercase">CTR</div>
          <div class="text-xl text-cyan-300 kpi-value">
            ${data.campanha.ctr7d_pct !== null ? data.campanha.ctr7d_pct.toFixed(2) + '%' : '—'}
          </div>
        </div>
      </div>
    </div>

  </div>

</div>

<script type="application/json" id="cockpit-data">${dataJson}</script>
<script>
const INITIAL_DATA = JSON.parse(document.getElementById('cockpit-data').textContent);

// ECharts theme tweaks compartilhados
const NEON = {
  text: '#cbd5e1', muted: '#475569', cyan: '#06b6d4', amber: '#fbbf24',
  green: '#22c55e', rose: '#f43f5e', bg: 'transparent',
};

function renderGauge(el, pct, color, existing) {
  const chart = existing ?? echarts.init(el, null, { renderer: 'canvas' });
  chart.setOption({
    series: [{
      type: 'gauge',
      startAngle: 200, endAngle: -20,
      min: 0, max: 100,
      progress: { show: true, width: 14, itemStyle: { color } },
      axisLine: { lineStyle: { width: 14, color: [[1, '#1e293b']] } },
      axisTick: { show: false },
      splitLine: { length: 8, lineStyle: { color: '#334155', width: 2 } },
      axisLabel: { color: NEON.muted, fontSize: 9, distance: 4 },
      pointer: { length: '60%', width: 4, itemStyle: { color } },
      anchor: { show: true, size: 12, itemStyle: { color, borderColor: '#020617', borderWidth: 3 } },
      title: { show: false },
      detail: {
        valueAnimation: true,
        formatter: (v) => Math.round(v) + '%',
        color, fontSize: 26, fontWeight: 'bold', offsetCenter: [0, '40%'],
      },
      data: [{ value: pct }],
    }],
  });
  return chart;
}

function renderFunnel(el, funilData, existing) {
  const chart = existing ?? echarts.init(el, null, { renderer: 'canvas' });
  chart.setOption({
    grid: { left: 8, right: 8, top: 8, bottom: 8, containLabel: false },
    series: [{
      type: 'funnel',
      left: '5%', right: '5%', top: 12, bottom: 12,
      width: '90%', minSize: '20%', maxSize: '100%',
      sort: 'descending', gap: 4,
      label: { show: true, position: 'inside', color: '#fff', fontWeight: 'bold' },
      labelLine: { show: false },
      itemStyle: { borderColor: '#020617', borderWidth: 2 },
      emphasis: { label: { fontSize: 16 } },
      data: funilData.map((f) => ({ value: f.count, name: f.stage + ' · ' + f.count, itemStyle: { color: f.color } })),
    }],
  });
  return chart;
}

function renderActivity(el, atividade, existing) {
  const chart = existing ?? echarts.init(el, null, { renderer: 'canvas' });
  const horas = atividade.map((a, i) => (i < 23 ? '-' + (23 - i) + 'h' : 'agora'));
  chart.setOption({
    grid: { left: 28, right: 8, top: 8, bottom: 22 },
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(2,6,23,0.95)', borderColor: NEON.cyan, textStyle: { color: '#cbd5e1' } },
    xAxis: {
      type: 'category', data: horas,
      axisLine: { lineStyle: { color: NEON.muted } },
      axisLabel: { color: NEON.muted, fontSize: 8, interval: 3 },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: NEON.muted, fontSize: 8 },
      splitLine: { lineStyle: { color: 'rgba(30,41,59,0.5)' } },
    },
    series: [
      { name: 'Mensagens', type: 'bar', stack: 'a', data: atividade.map((a) => a.mensagens), itemStyle: { color: NEON.cyan } },
      { name: 'Cadência', type: 'bar', stack: 'a', data: atividade.map((a) => a.cadencia), itemStyle: { color: NEON.amber } },
    ],
  });
  return chart;
}

let chartEva, chartSystem, chartFunnel, chartActivity;

function renderAll(data) {
  // Reaproveita instancias entre refreshes pra animar valores sem piscar.
  chartEva = renderGauge(document.getElementById('chart-eva'),
    data.gauges.evaConversao.pct, NEON.cyan, chartEva);
  chartSystem = renderGauge(document.getElementById('chart-system'),
    data.gauges.sistemaSaude.pct,
    data.gauges.sistemaSaude.pct >= 80 ? NEON.green : data.gauges.sistemaSaude.pct >= 50 ? NEON.amber : NEON.rose,
    chartSystem);
  chartFunnel = renderFunnel(document.getElementById('chart-funnel'), data.funil, chartFunnel);
  chartActivity = renderActivity(document.getElementById('chart-activity'), data.atividade24h, chartActivity);
}

renderAll(INITIAL_DATA);

// Auto-refresh
function updateClock() {
  // Sempre BRT (America/Sao_Paulo) — independente do fuso do device.
  const brt = new Date().toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  document.getElementById('hud-time').textContent = brt + ' BRT';
}
setInterval(updateClock, 1000);
updateClock();

async function refresh() {
  if (document.hidden) return; // economia: nao bate na API com aba em background
  try {
    const r = await fetch('/dashboard/cockpit/data');
    if (!r.ok) return;
    const data = await r.json();
    document.getElementById('hud-alerts').textContent = data.meta.alertasPendentes;
    document.getElementById('hud-silent').textContent = data.meta.silentesSemCadencia;
    renderAll(data);
  } catch (err) { console.warn('refresh failed', err); }
}
setInterval(refresh, 30000); // 30s

// Resize gauges/charts no window resize
window.addEventListener('resize', () => {
  chartEva && chartEva.resize();
  chartSystem && chartSystem.resize();
  chartFunnel && chartFunnel.resize();
  chartActivity && chartActivity.resize();
});

// Full page reload a cada 5min pra refrescar KPIs+tabela
setTimeout(() => window.location.reload(), 5 * 60 * 1000);

// SYNC AGORA: forca refresh dos collectors no backend (Meta Ads + monitoring).
// Sem cron pra esperar — Junior aperta e ve novo dado em poucos segundos.
const btnSync = document.getElementById('btn-sync');
const btnSyncLabel = document.getElementById('btn-sync-label');
btnSync.addEventListener('click', async () => {
  btnSync.disabled = true;
  btnSyncLabel.textContent = 'SINCRONIZANDO...';
  btnSync.style.opacity = '0.6';
  try {
    const r = await fetch('/dashboard/cockpit/sync', { method: 'POST' });
    const j = await r.json();
    if (j.ok) {
      btnSyncLabel.textContent = '✅ ATUALIZADO';
      // Re-fetch dados pra refletir o sync
      await refresh();
      setTimeout(() => { btnSyncLabel.textContent = 'SYNC AGORA'; btnSync.style.opacity = '1'; btnSync.disabled = false; }, 2500);
    } else {
      btnSyncLabel.textContent = j.error?.includes('aguarde') ? '⏳ AGUARDE' : '⚠️ ERRO';
      setTimeout(() => { btnSyncLabel.textContent = 'SYNC AGORA'; btnSync.style.opacity = '1'; btnSync.disabled = false; }, 3000);
    }
  } catch (err) {
    btnSyncLabel.textContent = '⚠️ ERRO';
    setTimeout(() => { btnSyncLabel.textContent = 'SYNC AGORA'; btnSync.style.opacity = '1'; btnSync.disabled = false; }, 3000);
  }
});
</script>
</body>
</html>`;
}
