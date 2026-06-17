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
<div class="flex items-center justify-between mb-4 flex-wrap gap-2">
  <h1 class="text-xl font-bold text-cyan-300">💰 Financeiro · EcoSunPower</h1>
  <nav class="text-xs flex gap-3">
    <a href="/dashboard/cockpit" class="text-cyan-300 hover:text-cyan-100">[COCKPIT]</a>
    <a href="/dashboard/home" class="text-cyan-300 hover:text-cyan-100">[HOME]</a>
    <a href="/dashboard/leads" class="text-cyan-300 hover:text-cyan-100">[LEADS]</a>
    <a href="/dashboard/propostas" class="text-cyan-300 hover:text-cyan-100">[PROPOSTAS]</a>
  </nav>
</div>
<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
  <div class="card"><div class="text-xs text-gray-400">Recebido no mês</div><div class="big">${brl(d.faturamentoMes)}</div></div>
  <div class="card"><div class="text-xs text-gray-400">RBT12 (faixa ${d.faixa})</div><div class="big">${brl(d.rbt12)}</div>
    <div class="text-xs text-amber-400">${d.salto ? `faltam ${brl(d.salto.distancia)} pro salto` : 'última faixa'}</div></div>
  <div class="card"><div class="text-xs text-gray-400">Imposto a separar</div><div class="big text-rose-300">${brl(d.impostoASeparar)}</div></div>
  <div class="card"><div class="text-xs text-gray-400">A receber</div><div class="big">${brl(d.aReceber)}</div></div>
  <div class="card"><div class="text-xs text-gray-400">💸 Saiu no mês (PJ)</div><div class="big text-rose-300">${brl(d.caixa.saiuMesPj)}</div></div>
  <div class="card"><div class="text-xs text-gray-400">💰 Lucro do mês</div><div class="big" style="color:${d.caixa.lucroMes >= 0 ? '#34d399' : '#f87171'}">${brl(d.caixa.lucroMes)}</div>
    <div class="text-xs text-gray-500">caixa real − saiu − imposto (DAS pago não desconta 2×)</div></div>
  <div class="card"><div class="text-xs text-gray-400">💰 Entrou (caixa real)</div><div class="big text-emerald-300">${brl(d.caixa.entrouMesPjCaixa)}</div>
    ${d.caixa.entrouSemNotaPj > 0 ? `<div class="text-xs text-amber-400">Por fora (sem nota): ${brl(d.caixa.entrouSemNotaPj)}</div>` : ''}
  </div>
  <div class="card"><div class="text-xs text-gray-400">🧾 Faturado (base imposto)</div><div class="big">${brl(d.caixa.faturadoMesPj)}</div></div>
</div>
<div class="card mb-4"><div class="text-sm mb-1">👤 Mundo PF (pessoal — fora do lucro da empresa)</div>
  <div class="text-sm">Entrou: <b class="text-emerald-300">${brl(d.caixa.entrouMesPf)}</b> · Saiu: <b class="text-rose-300">${brl(d.caixa.saiuMesPf)}</b></div></div>
<div class="grid md:grid-cols-2 gap-3 mb-4">
  <div class="card"><div class="text-sm mb-2">Entrou × Saiu mês a mês</div><div id="graf" style="height:260px"></div></div>
  <div class="grid gap-3">
    <div class="card"><div class="text-sm mb-2">Fator R</div>
      <div class="big" style="color:${corFatorR}">${pct(d.fatorR.ratio)} → Anexo ${d.fatorR.anexo}</div>
      <div class="text-xs text-gray-400 mt-1">Pró-labore mín. p/ Anexo III: <b>${brl(d.fatorR.proLaboreMin)}/mês</b></div>
    </div>
    <div class="card"><div class="text-sm mb-2">Pra onde foi o dinheiro (mês, PJ)</div>
    ${d.caixa.pizzaCategorias.length === 0
      ? '<div class="text-gray-500 text-sm py-8 text-center">Sem despesas no mês ainda</div>'
      : '<div id="pizza" style="height:260px"></div>'
    }
    </div>
  </div>
</div>
<div class="card mb-4"><div class="text-sm mb-2">Contas a receber</div>
  <table class="w-full text-sm"><thead><tr class="text-gray-500 text-left">
  <th>Descrição</th><th>Valor</th><th>Status</th><th>Imposto</th></tr></thead><tbody>
  ${d.contas.map((c) => `<tr class="border-t border-gray-800"><td>${escapeHtml(c.descricao ?? '-')}</td><td>${brl(c.valor)}</td><td>${STATUS_LABEL[c.status] ?? c.status}</td><td>${c.imposto != null ? brl(c.imposto) : '-'}</td></tr>`).join('')}
  </tbody></table></div>
<div class="card mt-4"><div class="text-sm mb-2">Lançamentos
  <span class="text-xs text-gray-500 ml-2">
    <a href="/dashboard/financeiro" class="text-cyan-300">[todos]</a>
    <a href="?tipo=despesa" class="text-cyan-300">[gastos]</a>
    <a href="?tipo=entrada" class="text-cyan-300">[entradas]</a>
    <a href="?pfpj=PJ" class="text-cyan-300">[PJ]</a>
    <a href="?pfpj=PF" class="text-cyan-300">[PF]</a>
  </span></div>
  <div class="overflow-x-auto">
  <table class="w-full text-sm"><thead><tr class="text-gray-500 text-left">
  <th>Data</th><th></th><th>Valor</th><th>Quem</th><th>Categoria</th><th>PF/PJ</th><th>Doc</th></tr></thead><tbody>
  ${d.lancamentos.map((l) => `<tr class="border-t border-gray-800">
    <td>${l.data_evento.slice(8,10)}/${l.data_evento.slice(5,7)}</td>
    <td>${l.tipo === 'entrada' ? '💰' : '💸'}</td>
    <td>${brl(l.valor)}</td>
    <td>${escapeHtml(l.contraparte ?? '-')}</td>
    <td>${escapeHtml(l.categoriaNome ?? '-')}</td>
    <td><span class="px-1 rounded text-xs" style="background:${l.pf_pj === 'PJ' ? '#0e7490' : '#7c3aed'}">${l.pf_pj ?? '-'}</span></td>
    <td>${l.comprovanteUrl ? `<a href="${escapeHtml(l.comprovanteUrl)}" target="_blank" class="text-cyan-300">📎</a>` : '-'}</td>
  </tr>`).join('')}
  </tbody></table>
  </div></div>
<script type="application/json" id="fin-data">${dataJson}</script>
<script>
  const d = JSON.parse(document.getElementById('fin-data').textContent);
  const g = echarts.init(document.getElementById('graf'), 'dark');
  const meses = [...new Set([...d.faturamentoMensal.map(x=>x.competencia), ...d.despesasMensal.map(x=>x.competencia)])].sort();
  const entrou = meses.map(m => (d.faturamentoMensal.find(x=>x.competencia===m)?.receita) ?? 0);
  const saiu = meses.map(m => (d.despesasMensal.find(x=>x.competencia===m)?.total) ?? 0);
  g.setOption({ backgroundColor:'transparent', tooltip:{trigger:'axis'}, legend:{textStyle:{color:'#9ca3af'}},
    xAxis:{type:'category', data:meses}, yAxis:{type:'value'},
    series:[{name:'Entrou', type:'bar', data:entrou, itemStyle:{color:'#22d3ee'}},
            {name:'Saiu', type:'bar', data:saiu, itemStyle:{color:'#f87171'}}] });
  window.addEventListener('resize', ()=>g.resize());
  ${d.caixa.pizzaCategorias.length > 0 ? `
  const p = echarts.init(document.getElementById('pizza'), 'dark');
  p.setOption({ backgroundColor:'transparent', tooltip:{trigger:'item'},
    series:[{type:'pie', radius:['40%','70%'],
      data:d.caixa.pizzaCategorias.map(x=>({name:x.categoria, value:x.total})),
      label:{color:'#d1d5db'}}] });
  window.addEventListener('resize', ()=>p.resize());
  ` : ''}
</script>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
