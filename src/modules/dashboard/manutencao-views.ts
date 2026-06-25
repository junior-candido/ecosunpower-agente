// src/modules/dashboard/manutencao-views.ts
// Tela de Manutenção repaginada: agenda guiada por atenção + leituras pendentes
// (empurrão mensal das usinas sem API) + agendar manual + modal de leitura.
// Também o selo "sem API" (reusado no pós-venda) e o prontuário da usina.
import { renderLayout, escapeHtml } from './views.js';
import type { DashUser } from './permissions.js';
import type { AgendaItem, LeituraPendente, ProntuarioManutencao } from './manutencao-queries.js';
import { statusAgendaItem, type ManutencaoTipo } from './manutencao-motor.js';

const TIPO_LABEL: Record<ManutencaoTipo, string> = {
  limpeza: '🧹 Limpeza', revisao_inversor: '🔌 Revisão inversor',
  revisao_eletrica: '⚡ Revisão elétrica', corretiva: '🔧 Corretiva', inspecao: '🔎 Inspeção',
};

export function seloSemApi(semApi: boolean): string {
  return semApi
    ? '<span class="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">📵 Sem API · leitura manual</span>'
    : '';
}

interface UsinaOpt { id: string; apelido: string }
export interface ManutencaoPageData { agenda: AgendaItem[]; leiturasPendentes: LeituraPendente[]; usinas: UsinaOpt[] }

function corStatus(s: 'vencida' | 'proxima' | 'ok'): string {
  return s === 'vencida' ? 'border-l-rose-500' : s === 'proxima' ? 'border-l-amber-400' : 'border-l-slate-300';
}

const dataBR = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');

function renderAgendaItem(i: AgendaItem, hoje: Date): string {
  const st = statusAgendaItem(i.data_agendada, hoje);
  const chip = st === 'vencida'
    ? '<span class="text-[10px] font-bold text-rose-700 bg-rose-100 rounded px-1">⚠ vencida</span>'
    : st === 'proxima' ? '<span class="text-[10px] font-bold text-amber-700 bg-amber-100 rounded px-1">⏳ próxima</span>' : '';
  return `
  <div class="bg-white border border-slate-200 border-l-4 ${corStatus(st)} rounded-md px-3 py-2 mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1" data-manut-id="${escapeHtml(i.id)}">
    <span class="font-medium text-slate-800">${escapeHtml(i.apelido)}</span>
    ${seloSemApi(i.semApi)}
    <span class="text-xs text-slate-500">${escapeHtml(i.clienteNome ?? '')}</span>
    <span class="text-xs text-slate-600">${TIPO_LABEL[i.tipo] ?? escapeHtml(i.tipo)}</span>
    <span class="text-xs text-slate-400">${dataBR(i.data_agendada)}</span>
    ${chip}
    <span class="ml-auto flex gap-1">
      <form method="post" action="/dashboard/manutencao/${escapeHtml(i.id)}/feita" class="inline">
        <button class="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs">✓ Feita</button></form>
      <form method="post" action="/dashboard/manutencao/${escapeHtml(i.id)}/os/abrir" class="inline">
        <button class="px-2 py-1 rounded bg-violet-600 hover:bg-violet-700 text-white text-xs" title="Abrir Ordem de Serviço (checklist + fotos + laudo)">📋 OS</button></form>
      <button class="pv-leitura px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white text-xs" data-sistema="${escapeHtml(i.sistemaId)}" data-apelido="${escapeHtml(i.apelido)}">📊 Leitura</button>
    </span>
  </div>`;
}

export function renderManutencaoPage(d: ManutencaoPageData, user?: DashUser): string {
  const hoje = new Date();
  const agenda = d.agenda.length
    ? d.agenda.map((i) => renderAgendaItem(i, hoje)).join('')
    : '<div class="text-slate-400 text-sm py-6 text-center">Nenhuma manutenção agendada.</div>';

  const pend = d.leiturasPendentes.length ? `
    <h2 class="text-sm font-bold text-amber-700 mt-6 mb-2">📵 Leituras do mês pendentes (usinas sem API)</h2>
    ${d.leiturasPendentes.map((l) => `
      <div class="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-1.5 flex items-center gap-3">
        <span class="font-medium text-slate-800">${escapeHtml(l.apelido)}</span>
        <span class="text-xs text-slate-500">${escapeHtml(l.clienteNome ?? '')}</span>
        <button class="pv-leitura ml-auto px-2 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white text-xs" data-sistema="${escapeHtml(l.sistemaId)}" data-apelido="${escapeHtml(l.apelido)}">📊 Registrar leitura</button>
      </div>`).join('')}` : '';

  const opcoesUsina = d.usinas.map((u) => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.apelido)}</option>`).join('');

  const body = `
  <div>
    <h1 class="text-xl font-bold text-slate-900 mb-1">🔧 Manutenção</h1>
    <p class="text-xs text-slate-500 mb-4">Agenda guiada por atenção — as <b class="text-rose-600">vencidas</b> primeiro.</p>
    <h2 class="text-sm font-bold text-slate-700 mb-2">Agenda</h2>
    ${agenda}
    ${pend}
    <details class="mt-6">
      <summary class="cursor-pointer text-sm text-slate-600">➕ Agendar manutenção manual</summary>
      <form method="post" action="/dashboard/manutencao/agendar" class="mt-2 flex flex-wrap gap-2 items-end">
        <select name="sistemaId" class="border rounded px-2 py-1 text-sm" required>${opcoesUsina}</select>
        <select name="tipo" class="border rounded px-2 py-1 text-sm">
          <option value="limpeza">🧹 Limpeza</option><option value="revisao_inversor">🔌 Revisão inversor</option>
          <option value="revisao_eletrica">⚡ Revisão elétrica</option><option value="corretiva">🔧 Corretiva</option>
          <option value="inspecao">🔎 Inspeção</option>
        </select>
        <input type="date" name="dataAgendada" class="border rounded px-2 py-1 text-sm" required>
        <button class="px-3 py-1 rounded bg-indigo-600 text-white text-sm">Agendar</button>
      </form>
    </details>
    <details class="mt-3">
      <summary class="cursor-pointer text-sm text-slate-600">📋 Nova OS avulsa (sem agendamento)</summary>
      <form method="post" action="/dashboard/os/nova" class="mt-2 flex flex-wrap gap-2 items-end">
        <select name="sistemaId" class="border rounded px-2 py-1 text-sm" required>${opcoesUsina}</select>
        <select name="tipo" class="border rounded px-2 py-1 text-sm">
          <option value="corretiva">🔧 Corretiva</option><option value="inspecao">🔎 Inspeção</option>
          <option value="limpeza">🧹 Limpeza</option><option value="revisao_inversor">🔌 Revisão inversor</option>
          <option value="revisao_eletrica">⚡ Revisão elétrica</option>
        </select>
        <button class="px-3 py-1 rounded bg-violet-600 text-white text-sm">Abrir OS</button>
      </form>
    </details>
  </div>

  <div id="leitura-modal" class="fixed inset-0 bg-black/50 hidden items-center justify-center z-50 p-4">
    <form id="leitura-form" method="post" class="bg-white rounded-xl max-w-sm w-full p-4">
      <div class="text-sm font-semibold mb-2" id="leitura-title">Registrar leitura</div>
      <label class="block text-xs text-slate-500">Competência</label>
      <input type="month" name="competencia" class="w-full border rounded px-2 py-1 text-sm mb-2" required>
      <label class="block text-xs text-slate-500">kWh do mês (o que a plataforma de origem mostra)</label>
      <input type="number" step="0.1" name="kwh" class="w-full border rounded px-2 py-1 text-sm mb-3" required>
      <div id="leitura-fb" class="text-xs mb-2"></div>
      <div class="flex justify-end gap-2">
        <button type="button" id="leitura-cancel" class="px-3 py-1 rounded bg-slate-200 text-sm">Fechar</button>
        <button type="submit" class="px-3 py-1 rounded bg-emerald-600 text-white text-sm">Salvar</button>
      </div>
    </form>
  </div>`;

  const scripts = `<script>
  (function(){
    var modal=document.getElementById('leitura-modal'), form=document.getElementById('leitura-form');
    var title=document.getElementById('leitura-title'), fb=document.getElementById('leitura-fb');
    document.querySelectorAll('.pv-leitura').forEach(function(b){
      b.onclick=function(){
        form.action='/dashboard/usinas/'+b.dataset.sistema+'/leitura';
        title.textContent='Leitura · '+(b.dataset.apelido||'usina'); fb.textContent='';
        modal.classList.remove('hidden'); modal.classList.add('flex');
      };
    });
    document.getElementById('leitura-cancel').onclick=function(){ modal.classList.add('hidden'); modal.classList.remove('flex'); };
    form.onsubmit=async function(e){
      e.preventDefault();
      var r=await fetch(form.action,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(new FormData(form)).toString()});
      var j=await r.json().catch(function(){return {};});
      fb.textContent=j.sugestao||'Salvo.';
      fb.className='text-xs mb-2 '+(j.status==='baixo'?'text-rose-600':j.status==='alto'?'text-emerald-600':'text-slate-600');
    };
  })();
  </script>`;

  return renderLayout({ active: 'manutencao', title: 'Manutenção', body, scripts, user });
}

export function renderProntuario(itens: ProntuarioManutencao[]): string {
  if (!itens.length) return '<div class="text-slate-400 text-sm">Sem manutenções registradas ainda.</div>';
  const linha = (m: ProntuarioManutencao) => {
    const quando = m.status === 'feita' ? m.feita_em : m.data_agendada;
    const badge = m.status === 'feita' ? '✅' : m.status === 'cancelada' ? '✖' : '📅';
    return `<tr class="border-t border-slate-200">
      <td class="py-1">${badge} ${TIPO_LABEL[m.tipo] ?? escapeHtml(m.tipo)}</td>
      <td class="py-1 text-slate-500">${dataBR(quando)}</td>
      <td class="py-1 text-slate-500">${escapeHtml(m.status)}</td>
      <td class="py-1 text-slate-500">${escapeHtml(m.notas ?? '')}</td>
    </tr>`;
  };
  return `<table class="w-full text-sm"><thead><tr class="text-slate-400 text-left text-xs">
    <th>Tipo</th><th>Quando</th><th>Status</th><th>Notas</th></tr></thead>
    <tbody>${itens.map(linha).join('')}</tbody></table>`;
}
