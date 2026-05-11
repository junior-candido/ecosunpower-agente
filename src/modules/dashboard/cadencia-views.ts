import { renderLayout, escapeHtml, brl } from './views.js';
import type { LeadCadenciaRow, CadenciaKpis, CadenciaStatus } from './cadencia-queries.js';

const STATUS_LABELS: Record<CadenciaStatus, { label: string; color: string; bg: string }> = {
  aguardando:           { label: '⏳ Aguardando disparo', color: 'text-slate-700', bg: 'bg-slate-100' },
  enviado_sem_resposta: { label: '📤 Template enviado',  color: 'text-sky-800',   bg: 'bg-sky-100' },
  respondeu:            { label: '💬 Respondeu',         color: 'text-emerald-800', bg: 'bg-emerald-100' },
  qualificando:         { label: '🎯 Qualificando',      color: 'text-violet-800', bg: 'bg-violet-100' },
  proposta_enviada:     { label: '📋 Proposta enviada',  color: 'text-amber-800', bg: 'bg-amber-100' },
  cliente:              { label: '✅ Cliente',           color: 'text-emerald-900', bg: 'bg-emerald-200' },
  sem_resposta_7d:      { label: '⚠️ Sem resposta 7d+',  color: 'text-rose-800',  bg: 'bg-rose-100' },
  opt_out:              { label: '🚪 Opt-out',           color: 'text-slate-500', bg: 'bg-slate-50' },
};

function card(titulo: string, valor: string, sub: string, accent: 'amber' | 'sky' | 'emerald' | 'violet' | 'rose' | 'indigo', valorCor = 'text-slate-900'): string {
  return `
    <div class="bg-white rounded-xl shadow-md hover:shadow-lg transition border border-slate-200 accent-${accent} p-5">
      <div class="text-xs uppercase tracking-wider text-slate-500 font-semibold">${escapeHtml(titulo)}</div>
      <div class="text-3xl font-bold ${valorCor} mt-2">${escapeHtml(valor)}</div>
      ${sub ? `<div class="text-xs text-slate-500 mt-1">${escapeHtml(sub)}</div>` : ''}
    </div>`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mês`;
}

function statusBadge(s: CadenciaStatus): string {
  const t = STATUS_LABELS[s];
  return `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${t.bg} ${t.color}">${escapeHtml(t.label)}</span>`;
}

function tempBadge(temp: string | null): string {
  if (!temp) return '<span class="text-slate-400 text-xs">—</span>';
  const map: Record<string, { icon: string; class: string }> = {
    quente: { icon: '🔥', class: 'bg-rose-100 text-rose-800' },
    morno:  { icon: '🌡️', class: 'bg-amber-100 text-amber-800' },
    frio:   { icon: '🥶', class: 'bg-sky-100 text-sky-800' },
  };
  const t = map[temp] ?? { icon: '', class: 'bg-slate-100 text-slate-700' };
  return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${t.class}">${t.icon} ${escapeHtml(temp)}</span>`;
}

function maskPhone(phone: string): string {
  // 5561998805002 -> +55 61 99880-5002
  if (phone.length < 10) return phone;
  const country = phone.slice(0, 2);
  const ddd = phone.slice(2, 4);
  const part1 = phone.slice(4, -4);
  const part2 = phone.slice(-4);
  return `+${country} ${ddd} ${part1}-${part2}`;
}

export interface CadenciaPageInput {
  rows: LeadCadenciaRow[];
  kpis: CadenciaKpis;
  filterStatus?: string;
}

export function renderCadenciaPage(input: CadenciaPageInput): string {
  const { rows, kpis, filterStatus } = input;

  const filtered = filterStatus
    ? rows.filter((r) => r.cadencia_status === filterStatus)
    : rows;

  const tableRows = filtered.length === 0
    ? `<tr><td colspan="7" class="text-center text-slate-500 py-8">Nenhum lead encontrado${filterStatus ? ' nesse status' : ''}.</td></tr>`
    : filtered.map((r) => `
        <tr class="border-t border-slate-100 hover:bg-slate-50">
          <td class="px-4 py-3">
            <div class="font-medium text-slate-900">${escapeHtml(r.name)}</div>
            <div class="text-xs text-slate-500">${escapeHtml(maskPhone(r.phone))}</div>
            ${r.email ? `<div class="text-xs text-sky-700 mt-0.5">✉️ ${escapeHtml(r.email)}</div>` : '<div class="text-xs text-slate-300 mt-0.5">✉️ sem email</div>'}
          </td>
          <td class="px-4 py-3">${statusBadge(r.cadencia_status)}</td>
          <td class="px-4 py-3">${tempBadge(r.temperatura_anterior)}</td>
          <td class="px-4 py-3 text-xs text-slate-700">
            ${r.ultima_etapa_anterior ? escapeHtml(r.ultima_etapa_anterior) : '—'}
            ${r.atendente_anterior ? `<div class="text-slate-500">com ${escapeHtml(r.atendente_anterior)}</div>` : ''}
          </td>
          <td class="px-4 py-3 text-sm">
            ${r.consumo_kwh ? `${r.consumo_kwh.toLocaleString('pt-BR')} kWh/mês` : '—'}
          </td>
          <td class="px-4 py-3 text-xs text-slate-600">
            <div>Template: ${timeAgo(r.last_reactivation_sent_at)}</div>
            <div>Última msg: ${timeAgo(r.last_message_at)}</div>
          </td>
          <td class="px-4 py-3 text-xs text-slate-500">
            ${r.motivo_perda_anterior ? escapeHtml(r.motivo_perda_anterior).slice(0, 60) : '—'}
          </td>
          <td class="px-4 py-3">
            ${r.cadencia_status === 'cliente' || r.cadencia_status === 'opt_out'
              ? '<span class="text-xs text-slate-400">—</span>'
              : `<form method="POST" action="/dashboard/cadencia/fechou" class="inline" onsubmit="return confirm('Marcar ${escapeHtml(r.name).replace(/'/g, "\\'")}  como cliente fechado? Remove da cadência.')">
                  <input type="hidden" name="id" value="${escapeHtml(r.id)}">
                  <button type="submit" class="text-xs px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition font-medium">✅ Fechou</button>
                </form>
                <form method="POST" action="/dashboard/cadencia/optout" class="inline ml-1" onsubmit="return confirm('Marcar ${escapeHtml(r.name).replace(/'/g, "\\'")}  como opt-out? Para de receber mensagens.')">
                  <input type="hidden" name="id" value="${escapeHtml(r.id)}">
                  <button type="submit" class="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 transition font-medium">🚪 Opt-out</button>
                </form>`}
          </td>
        </tr>`).join('');

  const statusFilter = (status: string, label: string, count: number) => {
    const active = filterStatus === status;
    return `<a href="/dashboard/cadencia${active ? '' : `?status=${status}`}" class="px-3 py-1.5 rounded-full text-xs font-medium transition ${active ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}">${escapeHtml(label)} ${count > 0 ? `<span class="ml-1 opacity-70">${count}</span>` : ''}</a>`;
  };

  const counts: Record<CadenciaStatus, number> = {
    aguardando: 0, enviado_sem_resposta: 0, respondeu: 0, qualificando: 0,
    proposta_enviada: 0, cliente: 0, sem_resposta_7d: 0, opt_out: 0,
  };
  for (const r of rows) counts[r.cadencia_status]++;

  const body = `
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-slate-900">🔄 Cadência de Reativação</h1>
      <p class="text-slate-600 text-sm">Leads da base recuperada (comercial terceirizado) — acompanhe template disparado, respostas e funil até proposta.</p>
    </div>

    <section class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      ${card('Total leads', String(kpis.total_leads), 'base terceirizada', 'indigo')}
      ${card('Templates disparados', String(kpis.templates_disparados), kpis.total_leads > 0 ? `${((kpis.templates_disparados / kpis.total_leads) * 100).toFixed(0)}% da base` : '', 'sky', 'text-sky-700')}
      ${card('Responderam', String(kpis.responderam), kpis.taxa_resposta_pct != null ? `${kpis.taxa_resposta_pct.toFixed(1)}% taxa resposta` : '', 'emerald', 'text-emerald-700')}
      ${card('Clientes novos', String(kpis.clientes), 'fechados via reativação', 'amber', 'text-amber-700')}
    </section>

    <section class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
      ${card('Qualificando', String(kpis.qualificando), kpis.taxa_qualificacao_pct != null ? `${kpis.taxa_qualificacao_pct.toFixed(1)}% dos que responderam` : '', 'violet')}
      ${card('Proposta enviada', String(kpis.proposta_enviada), kpis.taxa_proposta_pct != null ? `${kpis.taxa_proposta_pct.toFixed(1)}% dos qualificando` : '', 'amber')}
      ${card('Sem resposta 7d+', String(counts.sem_resposta_7d), 'follow-up necessário', counts.sem_resposta_7d > 0 ? 'rose' : 'sky', counts.sem_resposta_7d > 0 ? 'text-rose-600' : 'text-slate-900')}
    </section>

    <section class="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-4">
      <h2 class="text-lg font-semibold text-slate-900 mb-3">Filtrar por status</h2>
      <div class="flex flex-wrap gap-2">
        ${statusFilter('', 'Todos', rows.length)}
        ${statusFilter('aguardando', '⏳ Aguardando', counts.aguardando)}
        ${statusFilter('enviado_sem_resposta', '📤 Enviado', counts.enviado_sem_resposta)}
        ${statusFilter('respondeu', '💬 Respondeu', counts.respondeu)}
        ${statusFilter('qualificando', '🎯 Qualificando', counts.qualificando)}
        ${statusFilter('proposta_enviada', '📋 Proposta', counts.proposta_enviada)}
        ${statusFilter('cliente', '✅ Cliente', counts.cliente)}
        ${statusFilter('sem_resposta_7d', '⚠️ Sem resposta 7d+', counts.sem_resposta_7d)}
        ${statusFilter('opt_out', '🚪 Opt-out', counts.opt_out)}
      </div>
    </section>

    <section class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
      <table class="w-full text-left">
        <thead class="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th class="px-4 py-3">Lead</th>
            <th class="px-4 py-3">Status</th>
            <th class="px-4 py-3">Temp</th>
            <th class="px-4 py-3">Etapa anterior</th>
            <th class="px-4 py-3">Consumo</th>
            <th class="px-4 py-3">Histórico</th>
            <th class="px-4 py-3">Motivo perda anterior</th>
            <th class="px-4 py-3">Ações</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </section>

    <div class="mt-6 text-xs text-slate-500">
      💡 Pra disparar template pros leads aguardando: manda <code class="bg-slate-100 px-1.5 py-0.5 rounded">/reativar-base N</code> no WhatsApp (default N=10). Delay 30-90s entre cada.
    </div>
  `;

  return renderLayout({ active: 'marketing', title: 'Cadência', body });
}
