// leads-views.ts
// Views HTML para /dashboard/leads (lista + detalhe).

import { renderLayout, escapeHtml } from './views.js';
import type { LeadRow, LeadDetail } from './leads-queries.js';
import { formatPhoneBR } from '../meta-leadgen.js';
import { renderInsightsBanner } from './ai-summary.js';

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

export function renderLeadsListPage(
  rows: LeadRow[],
  filters: {
    status?: string;
    only_alerts?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
    total?: number;
    countByStatus?: Record<string, number>;
    insights?: import('./ai-summary.js').Insight[];
  },
): string {
  const alertasCount = rows.filter((r) => r.alerta === 'silente_sem_cadencia').length;
  const search = filters.search ?? '';
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  const total = filters.total ?? rows.length;
  const counts = filters.countByStatus ?? {};
  const pagina = Math.floor(offset / limit) + 1;
  const totalPaginas = Math.max(1, Math.ceil(total / limit));

  const tab = (statusId: string | null, label: string, count: number | null, activeClass: string) => {
    const isActive = (statusId === null && !filters.status && !filters.only_alerts)
      || (statusId !== null && filters.status === statusId);
    const cls = isActive
      ? activeClass + ' text-white'
      : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50';
    const href = statusId === null ? '/dashboard/leads' : `/dashboard/leads?status=${statusId}`;
    const finalHref = search ? `${href}${href.includes('?') ? '&' : '?'}q=${encodeURIComponent(search)}` : href;
    const badge = count != null ? `<span class="ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${isActive ? 'bg-white/20' : 'bg-slate-200'}">${count}</span>` : '';
    return `<a href="${finalHref}" class="px-3 py-1.5 rounded-lg text-sm inline-flex items-center ${cls}">${label}${badge}</a>`;
  };

  const filterBar = `
    <div class="flex flex-wrap gap-2 mb-4">
      ${tab(null, 'Todos', counts.todos ?? null, 'bg-indigo-600')}
      <a href="/dashboard/leads?only_alerts=1${search ? `&q=${encodeURIComponent(search)}` : ''}" class="px-3 py-1.5 rounded-lg text-sm inline-flex items-center ${filters.only_alerts ? 'bg-rose-600 text-white' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'}">🚨 Alertas <span class="ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${filters.only_alerts ? 'bg-white/20' : 'bg-slate-200'}">${alertasCount}</span></a>
      ${tab('novo', '🆕 Novos', counts.novo ?? null, 'bg-sky-600')}
      ${tab('qualificando', '🎯 Qualificando', counts.qualificando ?? null, 'bg-violet-600')}
      ${tab('qualificado', '⭐ Qualificados', counts.qualificado ?? null, 'bg-fuchsia-600')}
      ${tab('agendado', '📅 Agendados', counts.agendado ?? null, 'bg-amber-600')}
      ${tab('transferido', '➡️ Transferidos', counts.transferido ?? null, 'bg-emerald-600')}
      <span class="text-slate-300 px-1 self-center">·</span>
      ${tab('ganhos', '🏆 Ganhos', counts.ganhos ?? null, 'bg-green-700')}
      ${tab('perdidos', '❌ Perdidos', counts.perdido ?? null, 'bg-slate-600')}
    </div>
  `;

  const qsSemOffset = (extras: Record<string, string | number> = {}): string => {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.only_alerts) params.set('only_alerts', '1');
    if (search) params.set('q', search);
    for (const [k, v] of Object.entries(extras)) params.set(k, String(v));
    return params.toString();
  };

  const searchForm = `
    <form action="/dashboard/leads" method="get" class="flex gap-2 items-center mb-4">
      ${filters.status ? `<input type="hidden" name="status" value="${escapeHtml(filters.status)}">` : ''}
      ${filters.only_alerts ? `<input type="hidden" name="only_alerts" value="1">` : ''}
      <input type="text" name="q" value="${escapeHtml(search)}" placeholder="🔎 Nome, telefone ou email..." class="px-3 py-1.5 border border-slate-300 rounded-md text-sm flex-1 max-w-md">
      <button class="px-3 py-1.5 bg-sky-700 text-white rounded-md text-xs font-semibold hover:bg-sky-800">Buscar</button>
      ${search ? `<a href="/dashboard/leads${filters.status ? `?status=${filters.status}` : ''}" class="text-xs text-slate-500 hover:underline">limpar</a>` : ''}
    </form>
  `;

  const paginationBlock = total > limit ? `
    <div class="flex items-center justify-between mt-4 px-4 py-3 text-sm text-slate-600 border-t border-slate-200">
      <div>Mostrando ${offset + 1}–${Math.min(offset + limit, total)} de ${total} · Página ${pagina} de ${totalPaginas}</div>
      <div class="flex gap-2">
        ${offset > 0
          ? `<a href="/dashboard/leads?${qsSemOffset({ offset: Math.max(0, offset - limit) })}" class="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 rounded text-xs">← Anterior</a>`
          : `<span class="px-3 py-1.5 text-slate-300 text-xs">← Anterior</span>`}
        ${offset + limit < total
          ? `<a href="/dashboard/leads?${qsSemOffset({ offset: offset + limit })}" class="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 rounded text-xs">Próxima →</a>`
          : `<span class="px-3 py-1.5 text-slate-300 text-xs">Próxima →</span>`}
      </div>
    </div>` : '';

  const CLIENTE_STATUSES_SET = new Set(['contrato_assinado', 'instalado', 'medidor_trocado', 'operando', 'pos_venda_concluido']);
  const LOSS_REASON_LABELS: Record<string, string> = {
    nao_atende: 'Não atende',
    concorrente: 'Concorrente',
    sem_orcamento: 'Sem orçamento',
    fora_area: 'Fora da área',
    sem_interesse: 'Sem interesse',
    outro: 'Outro',
  };

  const tableRows = rows
    .map((l) => {
      const nome = escapeHtml(l.name ?? 'Sem nome');
      const phoneFmt = formatPhone(l.phone);
      const origem = l.acquisition_source
        ? escapeHtml(l.acquisition_source).replace('campanha_1_meta_lead_ads', 'Campanha Meta')
        : '—';
      // Ganho: linka pra cockpit completo (/clientes/:id) — onde tem todo histórico
      const isGanho = l.installation_status && CLIENTE_STATUSES_SET.has(l.installation_status);
      const perfilUrl = isGanho ? `/dashboard/clientes/${l.id}` : `/dashboard/leads/${l.id}`;
      const isPerdido = l.status === 'perdido';
      const rowOpacity = isPerdido ? 'opacity-70' : '';
      // Coluna info contextual: motivo de perda se perdido; senão alerta normal
      const colInfo = isPerdido && l.loss_reason
        ? `<span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-800" title="${escapeHtml(l.loss_notes ?? '')}">${escapeHtml(LOSS_REASON_LABELS[l.loss_reason] ?? l.loss_reason)}</span>`
        : alertaBadge(l.alerta);
      return `
        <tr class="border-t border-slate-200 hover:bg-slate-50 ${rowOpacity}">
          <td class="px-4 py-3">${colInfo}</td>
          <td class="px-4 py-3">
            <a href="${perfilUrl}" class="font-medium text-slate-900 hover:text-indigo-600">${nome}${isGanho ? ' 🏆' : ''}</a>
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
          <p class="text-sm text-slate-500 mt-1">${total} lead(s) no total · mostrando ${rows.length} · ordenado por última atividade</p>
        </div>
      </div>

      ${renderInsightsBanner(filters.insights ?? [])}

      ${alertasCount > 0 && !filters.only_alerts ? `
        <div class="bg-rose-50 border border-rose-200 rounded-lg p-4 mb-4">
          <p class="text-sm text-rose-800">
            <strong>${alertasCount} lead(s)</strong> silentes sem cadência agendada.
            <a href="/dashboard/leads?only_alerts=1" class="underline font-medium">Ver alertas →</a>
          </p>
        </div>` : ''}

      ${searchForm}
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
        ${paginationBlock}
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
