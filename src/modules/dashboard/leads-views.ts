// leads-views.ts
// Views HTML para /dashboard/leads (lista + detalhe).

import { renderLayout, escapeHtml } from './views.js';
import type { LeadRow, LeadDetail } from './leads-queries.js';
import { formatPhoneBR } from '../meta-leadgen.js';

function formatPhone(phone: string): string {
  // Normaliza (wa_id BR vem sem o 9o digito) antes de formatar. Ver formatPhoneBR.
  return formatPhoneBR(phone);
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

function alertaBadge(a: LeadRow['alerta']): string {
  const map: Record<LeadRow['alerta'], { label: string; cls: string }> = {
    silente_sem_cadencia: { label: '🚨 Silente sem cadência', cls: 'bg-rose-100 text-rose-800' },
    silente_com_cadencia: { label: '⚠️ Silente em cadência', cls: 'bg-amber-100 text-amber-800' },
    cliente_respondeu:    { label: '🔥 Respondeu', cls: 'bg-emerald-100 text-emerald-800' },
    novo:                 { label: '🆕 Novo', cls: 'bg-sky-100 text-sky-800' },
    normal:               { label: '✅', cls: 'bg-slate-100 text-slate-700' },
  };
  const t = map[a];
  return `<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${t.cls}">${escapeHtml(t.label)}</span>`;
}

function statusBadge(s: string): string {
  const map: Record<string, string> = {
    novo:         'bg-sky-100 text-sky-800',
    qualificando: 'bg-violet-100 text-violet-800',
    qualificado:  'bg-fuchsia-100 text-fuchsia-800',
    agendado:     'bg-amber-100 text-amber-800',
    transferido:  'bg-emerald-100 text-emerald-800',
    fechado:      'bg-emerald-200 text-emerald-900',
    perdido:      'bg-rose-100 text-rose-800',
  };
  const cls = map[s] ?? 'bg-slate-100 text-slate-700';
  return `<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cls}">${escapeHtml(s)}</span>`;
}

function evaBadge(active: boolean, optOut: boolean): string {
  if (optOut) return '<span class="inline-flex px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-500">🚪 opt-out</span>';
  if (active) return '<span class="inline-flex px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-800">✅ ativa</span>';
  return '<span class="inline-flex px-2 py-0.5 rounded-full text-xs bg-slate-200 text-slate-700">⏸️ pausada</span>';
}

export function renderLeadsListPage(rows: LeadRow[], filters: { status?: string; only_alerts?: boolean }): string {
  const alertasCount = rows.filter((r) => r.alerta === 'silente_sem_cadencia').length;

  const filterBar = `
    <div class="flex flex-wrap gap-2 mb-4">
      <a href="/dashboard/leads" class="px-3 py-1.5 rounded-lg text-sm ${!filters.status && !filters.only_alerts ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'}">Todos</a>
      <a href="/dashboard/leads?only_alerts=1" class="px-3 py-1.5 rounded-lg text-sm ${filters.only_alerts ? 'bg-rose-600 text-white' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'}">🚨 Alertas (${alertasCount})</a>
      <a href="/dashboard/leads?status=novo" class="px-3 py-1.5 rounded-lg text-sm ${filters.status === 'novo' ? 'bg-sky-600 text-white' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'}">🆕 Novos</a>
      <a href="/dashboard/leads?status=qualificando" class="px-3 py-1.5 rounded-lg text-sm ${filters.status === 'qualificando' ? 'bg-violet-600 text-white' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'}">🎯 Qualificando</a>
      <a href="/dashboard/leads?status=qualificado" class="px-3 py-1.5 rounded-lg text-sm ${filters.status === 'qualificado' ? 'bg-fuchsia-600 text-white' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'}">⭐ Qualificados</a>
      <a href="/dashboard/leads?status=agendado" class="px-3 py-1.5 rounded-lg text-sm ${filters.status === 'agendado' ? 'bg-amber-600 text-white' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'}">📅 Agendados</a>
      <a href="/dashboard/leads?status=transferido" class="px-3 py-1.5 rounded-lg text-sm ${filters.status === 'transferido' ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'}">✅ Transferidos</a>
    </div>
  `;

  const tableRows = rows
    .map((l) => {
      const nome = escapeHtml(l.name ?? 'Sem nome');
      const phoneFmt = formatPhone(l.phone);
      const origem = l.acquisition_source
        ? escapeHtml(l.acquisition_source).replace('campanha_1_meta_lead_ads', 'Campanha Meta')
        : '—';
      return `
        <tr class="border-t border-slate-200 hover:bg-slate-50">
          <td class="px-4 py-3">${alertaBadge(l.alerta)}</td>
          <td class="px-4 py-3">
            <a href="/dashboard/leads/${l.id}" class="font-medium text-slate-900 hover:text-indigo-600">${nome}</a>
            <div class="text-xs text-slate-500">${phoneFmt}</div>
          </td>
          <td class="px-4 py-3">${statusBadge(l.status)}</td>
          <td class="px-4 py-3 text-sm text-slate-600">${origem}</td>
          <td class="px-4 py-3 text-sm text-slate-600">${evaBadge(l.eva_active, l.opt_out)}</td>
          <td class="px-4 py-3 text-sm text-slate-600">${l.has_cadence_pending ? '📤 sim' : '—'}</td>
          <td class="px-4 py-3 text-xs text-slate-500" title="${l.updated_at}">${timeAgo(l.updated_at)}</td>
        </tr>`;
    })
    .join('');

  const body = `
    <div class="max-w-7xl mx-auto px-4 py-6">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-slate-900">Leads</h1>
          <p class="text-sm text-slate-500 mt-1">${rows.length} lead(s) listado(s) · ordenado por última atividade</p>
        </div>
      </div>

      ${alertasCount > 0 && !filters.only_alerts ? `
        <div class="bg-rose-50 border border-rose-200 rounded-lg p-4 mb-4">
          <p class="text-sm text-rose-800">
            <strong>${alertasCount} lead(s)</strong> silentes sem cadência agendada.
            <a href="/dashboard/leads?only_alerts=1" class="underline font-medium">Ver alertas →</a>
          </p>
        </div>` : ''}

      ${filterBar}

      <div class="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
        <table class="w-full">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs uppercase tracking-wider text-slate-500 font-semibold">Alerta</th>
              <th class="px-4 py-3 text-left text-xs uppercase tracking-wider text-slate-500 font-semibold">Lead</th>
              <th class="px-4 py-3 text-left text-xs uppercase tracking-wider text-slate-500 font-semibold">Status</th>
              <th class="px-4 py-3 text-left text-xs uppercase tracking-wider text-slate-500 font-semibold">Origem</th>
              <th class="px-4 py-3 text-left text-xs uppercase tracking-wider text-slate-500 font-semibold">Eva</th>
              <th class="px-4 py-3 text-left text-xs uppercase tracking-wider text-slate-500 font-semibold">Cadência</th>
              <th class="px-4 py-3 text-left text-xs uppercase tracking-wider text-slate-500 font-semibold">Última atividade</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows || '<tr><td colspan="7" class="px-4 py-8 text-center text-slate-400">Nenhum lead encontrado</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
  return renderLayout({ active: 'leads', title: 'Leads', body });
}

export function renderLeadDetailPage(lead: LeadDetail): string {
  const phoneFmt = formatPhone(lead.phone);
  const nome = escapeHtml(lead.name ?? 'Sem nome');

  const messagesHtml = lead.conversation_messages.length === 0
    ? '<p class="text-slate-400 text-sm">Nenhuma mensagem ainda.</p>'
    : lead.conversation_messages
        .map((m) => {
          const isEva = m.role === 'assistant';
          const align = isEva ? 'flex-row-reverse' : 'flex-row';
          const bg = isEva ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-100 border-slate-200';
          const label = isEva ? 'Eva' : (lead.name ?? 'Cliente');
          const ts = m.timestamp ? new Date(m.timestamp).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '';
          return `
            <div class="flex ${align} gap-2 my-2">
              <div class="max-w-[75%] ${bg} border rounded-lg px-3 py-2">
                <div class="text-xs font-semibold ${isEva ? 'text-emerald-700' : 'text-slate-600'} mb-1">${escapeHtml(label)}</div>
                <div class="text-sm whitespace-pre-wrap">${escapeHtml(m.content)}</div>
                <div class="text-[10px] text-slate-400 mt-1">${ts}</div>
              </div>
            </div>`;
        })
        .join('');

  const cadenceHtml = lead.cadence_steps.length === 0
    ? '<p class="text-slate-400 text-sm">Nenhuma cadência agendada.</p>'
    : `<ul class="space-y-1 text-sm">${lead.cadence_steps
        .map((c) => {
          const when = new Date(c.scheduled_for).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
          const statusClass = c.status === 'sent' ? 'text-emerald-700' : c.status === 'pending' ? 'text-amber-700' : 'text-slate-500';
          return `<li>Toque ${c.step}: <span class="${statusClass} font-medium">${escapeHtml(c.status)}</span> — ${escapeHtml(when)}</li>`;
        })
        .join('')}</ul>`;

  const acoes = `
    <div class="mt-4 space-y-3">
      <!-- Bloco 1: Eva on/off + cadência -->
      <div class="flex flex-wrap gap-2">
        ${lead.eva_active
          ? `<form method="POST" action="/dashboard/leads/${lead.id}/pause-eva">
              <button class="px-3 py-1.5 rounded-lg text-sm bg-slate-200 text-slate-800 hover:bg-slate-300">🚫 Pausar Eva</button>
            </form>`
          : `<form method="POST" action="/dashboard/leads/${lead.id}/resume-eva">
              <button class="px-3 py-1.5 rounded-lg text-sm bg-emerald-600 text-white hover:bg-emerald-700">▶️ Reativar Eva</button>
            </form>`}
        ${!lead.has_cadence_pending && !lead.opt_out
          ? `<form method="POST" action="/dashboard/leads/${lead.id}/start-cadence">
              <button class="px-3 py-1.5 rounded-lg text-sm bg-amber-600 text-white hover:bg-amber-700">📅 Iniciar cadência</button>
            </form>`
          : ''}
        ${lead.has_cadence_pending
          ? `<form method="POST" action="/dashboard/leads/${lead.id}/cancel-cadence" onsubmit="return confirm('Cancelar todos os toques pendentes?')">
              <button class="px-3 py-1.5 rounded-lg text-sm bg-rose-100 text-rose-800 hover:bg-rose-200">❌ Cancelar cadência</button>
            </form>`
          : ''}
        ${!lead.opt_out
          ? `<form method="POST" action="/dashboard/leads/${lead.id}/opt-out" onsubmit="return confirm('Marcar como opt-out? Eva nunca mais conversa com esse contato.')">
              <button class="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-700 hover:bg-slate-200">🚪 Opt-out</button>
            </form>`
          : `<form method="POST" action="/dashboard/leads/${lead.id}/opt-in">
              <button class="px-3 py-1.5 rounded-lg text-sm bg-emerald-100 text-emerald-800 hover:bg-emerald-200">↩️ Remover opt-out</button>
            </form>`}
        <a href="/dashboard/leads/${lead.id}" class="px-3 py-1.5 rounded-lg text-sm bg-white border border-slate-300 text-slate-700 hover:bg-slate-50">🔄 Atualizar</a>
      </div>

      <!-- Bloco 2: Mudar status -->
      <div class="flex flex-wrap gap-2 items-center">
        <span class="text-xs uppercase tracking-wider text-slate-500 font-semibold mr-1">Status:</span>
        ${['novo', 'qualificando', 'agendado', 'transferido', 'perdido']
          .map((s) => {
            const isCurrent = lead.status === s;
            const cls = isCurrent
              ? 'bg-indigo-600 text-white'
              : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50';
            return `<form method="POST" action="/dashboard/leads/${lead.id}/set-status" class="inline">
                <input type="hidden" name="status" value="${s}" />
                <button class="px-2.5 py-1 rounded-md text-xs ${cls}" ${isCurrent ? 'disabled' : ''}>${escapeHtml(s)}</button>
              </form>`;
          })
          .join('')}
      </div>

      <!-- Bloco 3: Editar nome -->
      <form method="POST" action="/dashboard/leads/${lead.id}/edit-name" class="flex flex-wrap gap-2 items-center">
        <span class="text-xs uppercase tracking-wider text-slate-500 font-semibold mr-1">Nome:</span>
        <input type="text" name="name" value="${escapeHtml(lead.name ?? '')}" placeholder="Nome do cliente"
          class="px-2.5 py-1 rounded-md text-sm border border-slate-300 w-64" />
        <button class="px-3 py-1 rounded-md text-xs bg-slate-700 text-white hover:bg-slate-800">✏️ Salvar</button>
      </form>

      <!-- Bloco 4: Arquivar (reversivel) ou Remover (destrutivo) -->
      <div class="pt-2 border-t border-slate-100 flex flex-wrap gap-2">
        ${lead.archived_at
          ? `<form method="POST" action="/dashboard/leads/${lead.id}/desarquivar">
              <button class="px-3 py-1.5 rounded-lg text-xs bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200">↩️ Restaurar lead</button>
            </form>`
          : `<form method="POST" action="/dashboard/leads/${lead.id}/arquivar" onsubmit="return confirm('Arquivar este lead? Sai da lista ativa, mas o historico fica intacto e da pra restaurar a qualquer hora.')">
              <button class="px-3 py-1.5 rounded-lg text-xs bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200">📦 Arquivar</button>
            </form>`}
        <form method="POST" action="/dashboard/leads/${lead.id}/delete" onsubmit="return confirm('REMOVER PERMANENTEMENTE este lead? Esta acao nao pode ser desfeita.')">
          <button class="px-3 py-1.5 rounded-lg text-xs bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100">🗑️ Remover lead permanentemente</button>
        </form>
      </div>
    </div>
  `;

  const body = `
    <div class="max-w-5xl mx-auto px-4 py-6">
      <a href="/dashboard/leads" class="text-sm text-indigo-600 hover:underline mb-4 inline-block">← Voltar pra lista</a>

      <div class="bg-white rounded-xl shadow-md border border-slate-200 p-6 mb-4">
        <div class="flex justify-between items-start">
          <div>
            <h1 class="text-2xl font-bold text-slate-900">${nome}</h1>
            <p class="text-sm text-slate-500 mt-1">${phoneFmt}${lead.city ? ` · ${escapeHtml(lead.city)}` : ''}${lead.email ? ` · ${escapeHtml(lead.email)}` : ''}</p>
          </div>
          <div class="text-right">
            ${statusBadge(lead.status)}
            <div class="mt-2">${evaBadge(lead.eva_active, lead.opt_out)}</div>
          </div>
        </div>

        ${lead.acquisition_source ? `<p class="text-sm mt-3"><span class="text-slate-500">Origem:</span> ${escapeHtml(lead.acquisition_source)}</p>` : ''}

        <div class="mt-4 flex flex-wrap gap-2">
          <a href="/dashboard/clientes/${lead.id}" class="px-3 py-1.5 rounded-lg text-sm bg-cyan-600 text-white hover:bg-cyan-700">🔍 Abrir cockpit completo</a>
          <a href="/dashboard/propostas/novo?lead_id=${lead.id}" class="px-3 py-1.5 rounded-lg text-sm bg-purple-600 text-white hover:bg-purple-700">📄 Nova proposta</a>
        </div>

        ${acoes}
      </div>

      <div class="grid md:grid-cols-2 gap-4">
        <div class="bg-white rounded-xl shadow-md border border-slate-200 p-6">
          <h2 class="text-lg font-semibold text-slate-900 mb-3">Conversa (Eva ↔ Cliente)</h2>
          <div class="max-h-[500px] overflow-y-auto">${messagesHtml}</div>
        </div>

        <div class="space-y-4">
          <div class="bg-white rounded-xl shadow-md border border-slate-200 p-6">
            <h2 class="text-lg font-semibold text-slate-900 mb-3">Cadência</h2>
            ${cadenceHtml}
          </div>

          ${Object.keys(lead.energy_data ?? {}).length > 0 ? `
            <div class="bg-white rounded-xl shadow-md border border-slate-200 p-6">
              <h2 class="text-lg font-semibold text-slate-900 mb-3">Dados de energia</h2>
              <pre class="text-xs bg-slate-50 p-3 rounded overflow-x-auto">${escapeHtml(JSON.stringify(lead.energy_data, null, 2))}</pre>
            </div>` : ''}

          ${Object.keys(lead.opportunities ?? {}).length > 0 ? `
            <div class="bg-white rounded-xl shadow-md border border-slate-200 p-6">
              <h2 class="text-lg font-semibold text-slate-900 mb-3">Oportunidades</h2>
              <pre class="text-xs bg-slate-50 p-3 rounded overflow-x-auto">${escapeHtml(JSON.stringify(lead.opportunities, null, 2))}</pre>
            </div>` : ''}
        </div>
      </div>
    </div>
  `;
  return renderLayout({ active: 'leads', title: `Lead: ${nome}`, body });
}
