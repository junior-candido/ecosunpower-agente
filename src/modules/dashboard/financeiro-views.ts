// src/modules/dashboard/financeiro-views.ts
import type { FinanceiroData } from './financeiro-queries.js';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const STATUS_LABEL: Record<string, string> = {
  pendente: 'Pendente', recebido_parcial: 'Parcial', recebido: 'Recebido', cancelado: 'Cancelado',
};

export function renderFinanceiroPage(d: FinanceiroData): string {
  const dataJson = JSON.stringify(d).replace(/</g, '\\u003c');
  const corFatorR = d.fatorR.anexo === 'III' ? '#34d399' : '#f87171';
  return `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Financeiro · EcoSun</title>
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"></script>
<style>body{background:#050610;color:#d1d5db;font-family:'JetBrains Mono',ui-monospace,monospace}
.card{background:#0b0e1f;border:1px solid #1b2040;border-radius:14px;padding:18px}
.big{font-size:2rem;font-weight:700;color:#e5e7eb}</style></head>
<body class="p-4">
<h1 class="text-xl font-bold mb-4 text-cyan-300">💰 Financeiro · EcoSunPower</h1>
<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
  <div class="card"><div class="text-xs text-gray-400">Recebido no mês</div><div class="big">${brl(d.faturamentoMes)}</div></div>
  <div class="card"><div class="text-xs text-gray-400">RBT12 (faixa ${d.faixa})</div><div class="big">${brl(d.rbt12)}</div>
    <div class="text-xs text-amber-400">${d.salto ? `faltam ${brl(d.salto.distancia)} pro salto` : 'última faixa'}</div></div>
  <div class="card"><div class="text-xs text-gray-400">Imposto a separar</div><div class="big text-rose-300">${brl(d.impostoASeparar)}</div></div>
  <div class="card"><div class="text-xs text-gray-400">A receber</div><div class="big">${brl(d.aReceber)}</div></div>
</div>
<div class="grid md:grid-cols-2 gap-3 mb-4">
  <div class="card"><div class="text-sm mb-2">Faturamento mês a mês</div><div id="graf" style="height:260px"></div></div>
  <div class="card"><div class="text-sm mb-2">Fator R</div>
    <div class="big" style="color:${corFatorR}">${pct(d.fatorR.ratio)} → Anexo ${d.fatorR.anexo}</div>
    <div class="text-xs text-gray-400 mt-1">Pró-labore mín. p/ Anexo III: <b>${brl(d.fatorR.proLaboreMin)}/mês</b></div>
  </div>
</div>
<div class="card"><div class="text-sm mb-2">Contas a receber</div>
  <table class="w-full text-sm"><thead><tr class="text-gray-500 text-left">
  <th>Descrição</th><th>Valor</th><th>Status</th><th>Imposto</th></tr></thead><tbody>
  ${d.contas.map((c) => `<tr class="border-t border-gray-800"><td>${escapeHtml(c.descricao ?? '-')}</td><td>${brl(c.valor)}</td><td>${STATUS_LABEL[c.status] ?? c.status}</td><td>${c.imposto != null ? brl(c.imposto) : '-'}</td></tr>`).join('')}
  </tbody></table></div>
<script type="application/json" id="fin-data">${dataJson}</script>
<script>
  const d = JSON.parse(document.getElementById('fin-data').textContent);
  const g = echarts.init(document.getElementById('graf'), 'dark');
  g.setOption({ backgroundColor:'transparent', tooltip:{trigger:'axis'},
    xAxis:{type:'category', data:d.faturamentoMensal.map(x=>x.competencia)},
    yAxis:{type:'value'},
    series:[{type:'bar', data:d.faturamentoMensal.map(x=>x.receita), itemStyle:{color:'#22d3ee'}}] });
  window.addEventListener('resize', ()=>g.resize());
</script>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
