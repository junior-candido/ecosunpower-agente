import { renderLayout, escapeHtml, brl } from './views.js';
import type {
  MarketingKpis, CampaignRow, CreativeRow, AlertRow, ChannelFunnelRow,
} from './marketing-queries.js';

function card(
  titulo: string,
  valor: string,
  sub: string,
  accent: 'amber' | 'sky' | 'emerald' | 'violet' | 'rose' | 'indigo',
  valorCor: string = 'text-slate-900',
): string {
  return `
    <div class="bg-white rounded-xl shadow-md hover:shadow-lg transition border border-slate-200 accent-${accent} p-5">
      <div class="text-xs uppercase tracking-wider text-slate-500 font-semibold">${escapeHtml(titulo)}</div>
      <div class="text-3xl font-bold ${valorCor} mt-2">${escapeHtml(valor)}</div>
      ${sub ? `<div class="text-xs text-slate-500 mt-1">${escapeHtml(sub)}</div>` : ''}
    </div>`;
}

function alertBadge(severity: string): string {
  const map: Record<string, { bg: string; text: string; icon: string }> = {
    critical: { bg: 'bg-rose-100', text: 'text-rose-800', icon: '🚨' },
    warning: { bg: 'bg-amber-100', text: 'text-amber-800', icon: '⚠️' },
    info: { bg: 'bg-sky-100', text: 'text-sky-800', icon: 'ℹ️' },
  };
  const s = map[severity] ?? map.info;
  return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}">${s.icon} ${escapeHtml(severity)}</span>`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins} min atrás`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h atrás`;
  const days = Math.floor(hrs / 24);
  return `${days}d atrás`;
}

export interface MarketingPageInput {
  kpis: MarketingKpis;
  campaigns: CampaignRow[];
  creatives: CreativeRow[];
  alerts: AlertRow[];
  channels: ChannelFunnelRow[];
  campaignsFilters?: { status: 'active' | 'paused' | 'all'; search: string; limit: number; offset: number };
  campaignsCounts?: { active: number; paused: number; total: number };
  campaignsTotal?: number;
}

const CHANNEL_LABELS: Record<string, string> = {
  meta: 'Meta',
  google: 'Google',
  blog: 'Blog',
  direto: 'Direto',
  indicacao: 'Indicação',
  outro: 'Outro',
};

function renderChannelsSection(channels: ChannelFunnelRow[]): string {
  const dash = '—';

  const rows = channels.map((ch) => {
    const empty = ch.total === 0;
    const label = CHANNEL_LABELS[ch.channel] ?? ch.channel;
    const total = empty ? dash : String(ch.total);
    const qualificado = empty ? dash : String(ch.qualificado);
    const agendado = empty ? dash : String(ch.agendado);
    const gasto = empty ? dash : brl(ch.spend_cents / 100);
    const cpl = ch.cpl != null ? brl(ch.cpl / 100) : dash;
    const custoAgend = ch.custo_por_agendamento != null ? brl(ch.custo_por_agendamento / 100) : dash;

    // Barra de funil simples: qualificado/total %
    const pct = ch.total > 0 ? Math.round((ch.qualificado / ch.total) * 100) : 0;
    const barColor = pct >= 50 ? 'bg-emerald-500' : pct >= 25 ? 'bg-amber-500' : 'bg-slate-300';
    const funnelBar = empty
      ? `<div class="w-full h-1.5 bg-slate-100 rounded-full"></div>`
      : `<div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
           <div class="${barColor} h-1.5 rounded-full" style="width:${pct}%"></div>
         </div>`;

    return `
      <tr class="border-t border-slate-100 hover:bg-slate-50">
        <td class="px-4 py-3 text-sm font-medium text-slate-900">${escapeHtml(label)}</td>
        <td class="px-4 py-3 text-sm text-slate-700">
          <div>${escapeHtml(total)}</div>
          ${empty ? '' : funnelBar}
        </td>
        <td class="px-4 py-3 text-sm text-slate-700">${escapeHtml(qualificado)}</td>
        <td class="px-4 py-3 text-sm text-slate-700">${escapeHtml(agendado)}</td>
        <td class="px-4 py-3 text-sm text-slate-700">${gasto}</td>
        <td class="px-4 py-3 text-sm text-slate-700">${cpl}</td>
        <td class="px-4 py-3 text-sm text-slate-700">${custoAgend}</td>
      </tr>`;
  }).join('');

  return `
    <section class="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-8 overflow-x-auto">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-slate-900">📡 Canais — funil por origem</h2>
        <div class="flex items-center gap-3">
          <form method="POST" action="/dashboard/admin/backfill-channels" onsubmit="return confirm('Recalcular canais de TODOS os leads sem channel preenchido? Idempotente, pode rodar varias vezes.')" class="inline">
            <button class="px-3 py-1.5 text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 rounded font-medium">🔄 Recalcular canais</button>
          </form>
          <span class="text-xs text-slate-400">Mesmo período dos KPIs</span>
        </div>
      </div>
      <table class="w-full text-left">
        <thead class="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th class="px-4 py-2">Canal</th>
            <th class="px-4 py-2">Leads</th>
            <th class="px-4 py-2">Qualificados</th>
            <th class="px-4 py-2">Agendados</th>
            <th class="px-4 py-2">Gasto</th>
            <th class="px-4 py-2">CPL</th>
            <th class="px-4 py-2">Custo/Agend.</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="text-xs text-slate-400 mt-3">CPL = custo por lead · Custo/Agend. = custo por agendamento · "—" = sem dado no período</p>
    </section>`;
}

export function renderMarketingPage(input: MarketingPageInput): string {
  const { kpis, campaigns, creatives, alerts, channels } = input;
  const filters = input.campaignsFilters ?? { status: 'active' as const, search: '', limit: 20, offset: 0 };
  const counts = input.campaignsCounts ?? { active: 0, paused: 0, total: 0 };
  const total = input.campaignsTotal ?? campaigns.length;
  const pagina = Math.floor(filters.offset / filters.limit) + 1;
  const totalPaginas = Math.max(1, Math.ceil(total / filters.limit));
  const qsSemOffset = (extras: Record<string, string | number> = {}): string => {
    const base: Record<string, string> = { status: filters.status };
    if (filters.search) base.q = filters.search;
    for (const [k, v] of Object.entries(extras)) base[k] = String(v);
    return new URLSearchParams(base).toString();
  };
  const tabBtn = (id: 'active' | 'paused' | 'all', label: string, count: number) => {
    const isActive = filters.status === id;
    const cls = isActive
      ? 'bg-slate-900 text-white'
      : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-300';
    return `<a href="/dashboard/marketing?status=${id}${filters.search ? `&q=${encodeURIComponent(filters.search)}` : ''}" class="px-3 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-2 ${cls}">${label} <span class="px-1.5 py-0.5 rounded-full text-[10px] ${isActive ? 'bg-white/20' : 'bg-slate-200'}">${count}</span></a>`;
  };

  const cplStr = kpis.cpl7d_brl != null ? brl(kpis.cpl7d_brl) : '—';
  const ctrStr = kpis.ctr7d_pct != null ? `${kpis.ctr7d_pct.toFixed(2)}%` : '—';
  const cplColor = kpis.cpl7d_brl != null && kpis.cpl7d_brl > 80 ? 'text-rose-600' : 'text-emerald-700';

  const campaignsRows = campaigns.length === 0
    ? `<tr><td colspan="7" class="text-center text-slate-500 py-8">Nenhuma campanha cadastrada.</td></tr>`
    : campaigns.map((c) => {
        const cpl = c.cpl7d_brl;
        const cplColor = cpl == null
          ? 'text-slate-400'
          : (c.cpl_critico_brl && cpl > c.cpl_critico_brl)
            ? 'text-rose-600 font-semibold'
            : (c.cpl_alerta_brl && cpl > c.cpl_alerta_brl)
              ? 'text-amber-600'
              : 'text-emerald-700';
        const budget = c.daily_budget_cents != null ? brl(c.daily_budget_cents / 100) : '—';
        const isPaused = c.status === 'paused';
        const statusBadge = isPaused
          ? `<span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200 text-slate-700">⏸ Pausada</span>`
          : `<span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">● Ativa</span>`;
        const rowOpacity = isPaused ? 'opacity-60' : '';
        return `
          <tr class="border-t border-slate-100 hover:bg-slate-50 ${rowOpacity}">
            <td class="px-4 py-3 text-sm">
              <div class="font-medium text-slate-900">${escapeHtml(c.name)}</div>
              <div class="text-xs text-slate-500">${escapeHtml(c.codigo_portfolio)}</div>
            </td>
            <td class="px-4 py-3 text-sm">${statusBadge}</td>
            <td class="px-4 py-3 text-sm text-slate-700">${budget}</td>
            <td class="px-4 py-3 text-sm text-slate-700">${brl(c.spend7d_brl)}</td>
            <td class="px-4 py-3 text-sm text-slate-700">${c.leads7d}</td>
            <td class="px-4 py-3 text-sm ${cplColor}">${cpl != null ? brl(cpl) : '—'}</td>
            <td class="px-4 py-3 text-xs text-slate-500">${timeAgo(c.last_synced_at)}</td>
          </tr>`;
      }).join('');

  const creativesBlock = creatives.length === 0
    ? `<div class="text-sm text-slate-500 py-4">Nenhum criativo cadastrado ainda. Use <code class="bg-slate-100 px-1.5 py-0.5 rounded text-xs">/criativo</code> no WhatsApp pra gerar.</div>`
    : `<div class="grid grid-cols-1 md:grid-cols-2 gap-3">${creatives.map((cr) => `
        <div class="border border-slate-200 rounded-lg p-3 hover:border-sky-500 transition">
          <div class="flex items-start justify-between gap-2">
            <div class="font-medium text-sm text-slate-900 line-clamp-2">${escapeHtml(cr.briefing ?? 'sem briefing')}</div>
            <span class="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 shrink-0">${escapeHtml(cr.status)}</span>
          </div>
          <div class="text-xs text-slate-500 mt-2">${timeAgo(cr.created_at)}</div>
        </div>`).join('')}</div>`;

  const alertsBlock = alerts.length === 0
    ? `<div class="text-sm text-slate-500 py-4">✅ Nenhum alerta pendente — tudo em ordem.</div>`
    : `<ul class="space-y-2">${alerts.map((a) => `
        <li class="border-l-4 ${a.severity === 'critical' ? 'border-rose-500' : a.severity === 'warning' ? 'border-amber-500' : 'border-sky-500'} bg-slate-50 px-3 py-2 rounded">
          <div class="flex items-center gap-2 mb-1">
            ${alertBadge(a.severity)}
            <span class="text-xs text-slate-500">${escapeHtml(a.agent)} · ${timeAgo(a.created_at)}</span>
          </div>
          <div class="text-sm font-medium text-slate-900">${escapeHtml(a.subject)}</div>
          <div class="text-sm text-slate-700 mt-1">${escapeHtml(a.body)}</div>
          ${a.action_required ? `<div class="text-xs text-slate-500 mt-2">Ação: ${escapeHtml(a.action_required)}</div>` : ''}
        </li>`).join('')}</ul>`;

  const body = `
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-slate-900">📣 Marketing</h1>
      <p class="text-slate-600 text-sm">Desempenho dos últimos 7 dias, campanhas ativas, criativos gerados e alertas pendentes.</p>
    </div>

    <section class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      ${card('Gasto 7d', brl(kpis.spend7d_brl), 'investimento Meta Ads', 'amber')}
      ${card('Leads 7d', String(kpis.leads7d), 'capturados via campanha', 'sky', 'text-sky-700')}
      ${card('CPL médio 7d', cplStr, kpis.cpl7d_brl != null ? 'por lead' : 'sem leads ainda', kpis.cpl7d_brl != null && kpis.cpl7d_brl > 80 ? 'rose' : 'emerald', cplColor)}
      ${card('CTR 7d', ctrStr, kpis.impressions7d.toLocaleString('pt-BR') + ' impressões', 'violet', 'text-violet-700')}
    </section>

    <section class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      ${card('Campanhas ativas', String(kpis.activeCampaigns), 'rodando agora', 'indigo')}
      ${card('Criativos em uso', String(kpis.creativesEmUso), 'gerados pelo Agente Criativo', 'emerald')}
      ${card('Alertas pendentes', String(kpis.alertasPendentes), 'aguardando ação', kpis.alertasPendentes > 0 ? 'rose' : 'sky', kpis.alertasPendentes > 0 ? 'text-rose-600' : 'text-slate-900')}
    </section>

    <section class="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-8 overflow-x-auto">
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <h2 class="text-lg font-semibold text-slate-900">📊 Campanhas — performance 7d</h2>
        <form action="/dashboard/marketing" method="get" class="flex gap-2 items-center">
          <input type="hidden" name="status" value="${filters.status}">
          <input type="text" name="q" value="${escapeHtml(filters.search)}" placeholder="🔎 Buscar campanha..." class="px-3 py-1.5 border border-slate-300 rounded-md text-sm w-64">
          <button class="px-3 py-1.5 bg-sky-700 text-white rounded-md text-xs font-semibold hover:bg-sky-800">Buscar</button>
          ${filters.search ? `<a href="/dashboard/marketing?status=${filters.status}" class="text-xs text-slate-500 hover:underline">limpar</a>` : ''}
        </form>
      </div>

      <div class="flex flex-wrap gap-2 mb-4">
        ${tabBtn('active', '● Ativas', counts.active)}
        ${tabBtn('paused', '⏸ Pausadas', counts.paused)}
        ${tabBtn('all', 'Todas', counts.total)}
      </div>

      <table class="w-full text-left">
        <thead class="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th class="px-4 py-2">Campanha</th>
            <th class="px-4 py-2">Status</th>
            <th class="px-4 py-2">Budget diário</th>
            <th class="px-4 py-2">Gasto 7d</th>
            <th class="px-4 py-2">Leads 7d</th>
            <th class="px-4 py-2">CPL 7d</th>
            <th class="px-4 py-2">Última sync</th>
          </tr>
        </thead>
        <tbody>${campaignsRows}</tbody>
      </table>

      ${total > filters.limit ? `
      <div class="flex items-center justify-between mt-4 text-sm text-slate-600">
        <div>Mostrando ${filters.offset + 1}–${Math.min(filters.offset + filters.limit, total)} de ${total} · Página ${pagina} de ${totalPaginas}</div>
        <div class="flex gap-2">
          ${filters.offset > 0
            ? `<a href="/dashboard/marketing?${qsSemOffset({ offset: Math.max(0, filters.offset - filters.limit) })}" class="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 rounded text-xs">← Anterior</a>`
            : `<span class="px-3 py-1.5 text-slate-300 text-xs">← Anterior</span>`}
          ${filters.offset + filters.limit < total
            ? `<a href="/dashboard/marketing?${qsSemOffset({ offset: filters.offset + filters.limit })}" class="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 rounded text-xs">Próxima →</a>`
            : `<span class="px-3 py-1.5 text-slate-300 text-xs">Próxima →</span>`}
        </div>
      </div>` : ''}
    </section>

    <section class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 class="text-lg font-semibold text-slate-900 mb-4">🎨 Criativos recentes</h2>
        ${creativesBlock}
      </div>
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 class="text-lg font-semibold text-slate-900 mb-4">🔔 Alertas pendentes</h2>
        ${alertsBlock}
      </div>
    </section>

    ${renderChannelsSection(channels)}
  `;

  return renderLayout({ active: 'marketing', title: 'Marketing', body });
}
