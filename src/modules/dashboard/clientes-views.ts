// src/modules/dashboard/clientes-views.ts
import { renderLayout } from './views.js';
import { statusLabel, statusCorChip } from '../clientes/mappers.js';
import { CONCESSIONARIAS_BR, getConcessionariaById } from '../concessionarias.js';
import type { ClienteRow, ClienteDetail, InsightCard } from '../clientes/types.js';

function escapeHtml(s: string | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function avatarInitials(name: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}

export function renderClientesListPage(
  rows: ClienteRow[],
  filters: { q?: string; concessionaria?: string; cidade?: string; ord?: string },
): string {
  const opt = (v: string, label: string, sel?: string) =>
    `<option value="${escapeHtml(v)}" ${sel === v ? 'selected' : ''}>${escapeHtml(label)}</option>`;

  const cidades = [...new Set(rows.map((r) => r.city).filter(Boolean) as string[])].sort();

  const card = (r: ClienteRow) => {
    const concNome = r.concessionaria ? getConcessionariaById(r.concessionaria)?.nome ?? r.concessionaria : '—';
    return `
    <a href="/dashboard/clientes/${escapeHtml(r.id)}" class="block bg-slate-800/60 hover:bg-slate-800 border border-slate-700 rounded-xl p-4 transition">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center font-bold text-slate-900 text-sm">${escapeHtml(avatarInitials(r.name))}</div>
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-slate-100 truncate">${escapeHtml(r.name) || '—'}</div>
          <div class="text-xs text-slate-500 truncate">${escapeHtml(r.phone)}</div>
        </div>
        <div class="px-2 py-0.5 rounded-full border text-[10px] font-semibold ${statusCorChip(r.installation_status)}">${escapeHtml(statusLabel(r.installation_status))}</div>
      </div>
      <div class="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div class="text-slate-500 uppercase tracking-wider text-[9px]">Cidade</div>
          <div class="text-slate-200">${escapeHtml([r.city, r.uf].filter(Boolean).join('/') || '—')}</div>
        </div>
        <div>
          <div class="text-slate-500 uppercase tracking-wider text-[9px]">Concessionária</div>
          <div class="text-slate-200 truncate">${escapeHtml(concNome)}</div>
        </div>
        <div>
          <div class="text-slate-500 uppercase tracking-wider text-[9px]">Consumo</div>
          <div class="text-slate-200">${r.consumo_medio_kwh ? `${r.consumo_medio_kwh} kWh/mês` : '—'}</div>
        </div>
        <div>
          <div class="text-slate-500 uppercase tracking-wider text-[9px]">Conta</div>
          <div class="text-slate-200">${r.conta_media_brl ? `R$ ${r.conta_media_brl.toFixed(0)}` : '—'}</div>
        </div>
      </div>
    </a>`;
  };

  const body = `
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-slate-100">👥 Clientes — ${rows.length}</h1>
      <p class="text-slate-400 text-sm">Quem comprou. Lista de clientes instalados / operando / pós-venda.</p>
    </div>

    <form method="get" action="/dashboard/clientes" class="mb-6 flex flex-wrap gap-2 items-center">
      <input name="q" value="${escapeHtml(filters.q ?? '')}" placeholder="🔎 nome, telefone, email, CPF" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm flex-1 min-w-[200px]">
      <select name="concessionaria" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm">
        ${opt('', 'Todas concessionárias', filters.concessionaria)}
        ${CONCESSIONARIAS_BR.map((c) => opt(c.id, c.nome, filters.concessionaria)).join('')}
      </select>
      <select name="cidade" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm">
        ${opt('', 'Todas cidades', filters.cidade)}
        ${cidades.map((c) => opt(c, c, filters.cidade)).join('')}
      </select>
      <select name="ord" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm">
        ${opt('', 'Mais recente', filters.ord)}
        ${opt('nome', 'Nome A-Z', filters.ord)}
      </select>
      <button class="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold">Filtrar</button>
      <a href="/dashboard/clientes" class="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm">Limpar</a>
    </form>

    ${rows.length === 0
      ? `<div class="bg-slate-800/60 rounded-xl border border-slate-700 p-12 text-center text-slate-400">Nenhum cliente cadastrado ainda. Quando um lead chega em installation_status >= contrato_assinado, aparece aqui.</div>`
      : `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">${rows.map(card).join('')}</div>`}
  `;

  return renderLayout({ active: 'clientes', title: 'Clientes', body, dark: true });
}

// ============================================================
// Detail page (T10 estrutura + T11 abas)
// ============================================================

function progressoJornada(installation_status: string | null): string {
  const ordem = ['lead', 'proposta', 'contrato', 'instalado', 'operando', 'pos_venda'];
  const map: Record<string, string> = {
    novo: 'lead', qualificando: 'lead', qualificado: 'proposta',
    proposta_aceita: 'contrato', contrato_assinado: 'contrato',
    instalado: 'instalado', medidor_trocado: 'instalado',
    operando: 'operando', pos_venda_concluido: 'pos_venda',
  };
  const atual = map[installation_status ?? ''] ?? 'lead';
  const atualIdx = ordem.indexOf(atual);
  const fases = [
    { id: 'lead', label: 'Lead' },
    { id: 'proposta', label: 'Proposta' },
    { id: 'contrato', label: 'Contrato' },
    { id: 'instalado', label: 'Instalado' },
    { id: 'operando', label: 'Operando' },
    { id: 'pos_venda', label: 'Pós-venda' },
  ];
  return `
    <div class="flex gap-1 items-center text-[10px]">
      ${fases.map((f, i) => {
        const ativa = i <= atualIdx;
        const ehAtual = i === atualIdx;
        const cor = ativa ? (ehAtual ? 'bg-cyan-400' : 'bg-cyan-500') : 'bg-slate-700';
        return `
          <div class="flex-1 h-1.5 rounded-full ${cor}"></div>
          <span class="${ativa ? 'text-cyan-300' : 'text-slate-500'}">${ehAtual ? '▶' : '🟢'} ${f.label}</span>`;
      }).join('')}
    </div>`;
}

function renderKpisStrip(d: ClienteDetail): string {
  const kpi = (label: string, valor: string, sub: string, cor: string) => `
    <div class="bg-slate-800/40 border border-slate-700 rounded-xl p-3">
      <div class="text-[10px] text-slate-400 uppercase tracking-wider">${label}</div>
      <div class="text-2xl font-bold ${cor} mt-1">${valor}</div>
      <div class="text-[10px] text-slate-500 mt-1">${sub}</div>
    </div>`;

  const sistemaKpi = d.sistema
    ? kpi('Sistema', `${d.sistema.potencia_kwp ?? '—'}`, `kWp · ${d.sistema.qtd_paineis ?? '?'} painéis`, 'text-sky-400')
    : kpi('Sistema', '—', '<a href="/dashboard/monitoramento" class="underline">vincular</a>', 'text-slate-500');

  const economiaEstim = d.sistema ? `R$ ${(d.sistema.geracao_total_kwh * 1).toFixed(0)}` : '—';
  const saudePct = d.sistema ? Math.round(d.sistema.ratio_ultimos_7d * 100) : null;
  const saudeStr = saudePct != null ? `${saudePct}%` : '—';
  const saudeCor = saudePct == null ? 'text-slate-500'
    : saudePct >= 90 ? 'text-green-400'
    : saudePct >= 70 ? 'text-amber-400' : 'text-rose-400';

  return `
    <div class="grid grid-cols-2 md:grid-cols-5 gap-2 my-4">
      ${sistemaKpi}
      ${kpi('Economia', economiaEstim, 'estimativa simples', 'text-purple-400')}
      ${kpi('Saúde', saudeStr, 'vs esperado 7d', saudeCor)}
      ${kpi('Propostas', String(d.propostas.length), `${d.propostas.filter(p => p.cliente_respondeu_at).length} respondidas`, 'text-amber-400')}
      ${kpi('Alertas', String(d.alertas_ativos.length), d.alertas_ativos.length ? 'ativos' : 'sistema ok', d.alertas_ativos.length ? 'text-rose-400' : 'text-green-400')}
    </div>`;
}

function renderInsightsRow(insights: InsightCard[]): string {
  if (insights.length === 0) {
    return `<div class="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 my-4 text-center text-sm text-purple-200">🤖 ✅ Cliente em ordem — nada urgente agora.</div>`;
  }
  const card = (c: InsightCard) => `
    <div class="bg-slate-900/60 rounded-lg p-3 border border-purple-500/20">
      <div class="text-xs text-slate-200 leading-relaxed">${escapeHtml(c.texto)}</div>
      ${c.cta
        ? `<form action="/dashboard/clientes/eva-action" method="post" class="mt-2">
             <input type="hidden" name="action" value="${escapeHtml(c.cta.action)}">
             <input type="hidden" name="lead_id" value="${escapeHtml(String(c.cta.params?.lead_id ?? ''))}">
             <input type="hidden" name="extra" value='${escapeHtml(JSON.stringify(c.cta.params))}'>
             <button class="text-purple-300 underline text-[10px]">${escapeHtml(c.cta.label)}</button>
           </form>`
        : `<span class="text-slate-500 text-[10px]">CTA indisponível (lead em opt-out)</span>`}
    </div>`;
  return `
    <div class="bg-purple-500/5 border border-purple-500/20 rounded-xl p-3 my-4">
      <div class="text-[10px] text-purple-300 uppercase tracking-wider mb-2">🤖 EVA SUGERE</div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-2">${insights.map(card).join('')}</div>
    </div>`;
}

export function renderClienteDetailPage(d: ClienteDetail, insights: InsightCard[]): string {
  const concNome = d.concessionaria ? getConcessionariaById(d.concessionaria)?.nome ?? d.concessionaria : '—';
  const phoneClean = d.phone.replace(/\D/g, '');

  // Header
  const header = `
    <div class="flex items-center gap-4 pb-4 border-b border-slate-700">
      <div class="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center font-bold text-slate-900 text-xl">${escapeHtml(avatarInitials(d.name))}</div>
      <div class="flex-1">
        <div class="text-xl font-bold text-slate-100">${escapeHtml(d.name) || 'Sem nome'}</div>
        <div class="text-xs text-slate-500">📍 ${escapeHtml([d.city, d.uf].filter(Boolean).join('-') || '—')} · Cliente desde ${escapeHtml((d.installed_at ?? d.created_at).slice(0,7))} · ${escapeHtml(concNome)}</div>
      </div>
      <div class="px-3 py-1 rounded-full border text-xs font-semibold ${statusCorChip(d.installation_status)}">${escapeHtml(statusLabel(d.installation_status))}</div>
      <a href="https://wa.me/${escapeHtml(phoneClean)}" target="_blank" class="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold">📞 Conversar</a>
      <a href="/dashboard/propostas/novo?lead_id=${escapeHtml(d.id)}" class="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold">📄 Nova proposta</a>
    </div>`;

  // Abas (estrutura — conteúdo virá em T11)
  const tabs = `
    <div id="abas" class="flex gap-1 border-b border-slate-700 my-4 overflow-x-auto">
      <a href="#dados" class="px-4 py-2 text-xs font-semibold text-sky-300 border-b-2 border-sky-400 whitespace-nowrap">👤 Dados</a>
      <a href="#sistema" class="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 whitespace-nowrap">☀ Sistema + Kit</a>
      <a href="#propostas" class="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 whitespace-nowrap">📄 Propostas (${d.propostas.length})</a>
      <a href="#anexos" class="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 whitespace-nowrap">📸 Anexos (${d.anexos.length})</a>
      <a href="#timeline" class="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 whitespace-nowrap">📖 Timeline</a>
      <a href="#conversa" class="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 whitespace-nowrap">💬 Conversa</a>
      <a href="#relatorios" class="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 whitespace-nowrap">📋 Relatórios</a>
    </div>`;

  // Conteúdos (T11 preenche os placeholders <!-- T11: ... -->)
  const abasConteudo = `
    <div id="dados-content" class="space-y-3"><!-- T11: aba Dados --></div>
    <div id="sistema-content" class="hidden text-slate-500 italic text-sm p-6">Aba "Sistema + Kit" vem na próxima fatia (A2 — calculadora).</div>
    <div id="propostas-content" class="hidden"><!-- T11: aba Propostas --></div>
    <div id="anexos-content" class="hidden"><!-- T11: aba Anexos --></div>
    <div id="timeline-content" class="hidden"><!-- T11: timeline --></div>
    <div id="conversa-content" class="hidden"><!-- T11: conversa --></div>
    <div id="relatorios-content" class="hidden text-slate-500 italic text-sm p-6">Aba "Relatórios" vem na próxima fatia (A5).</div>
  `;

  const insightsComLeadId = insights.map(i => ({
    ...i,
    cta: i.cta ? { ...i.cta, params: { ...(i.cta.params ?? {}), lead_id: d.id } } : null,
  }));

  const body = `
    ${header}
    <div class="mt-4">
      <div class="text-[10px] text-slate-400 uppercase tracking-widest mb-2">📈 JORNADA</div>
      ${progressoJornada(d.installation_status)}
    </div>
    ${renderKpisStrip(d)}
    ${renderInsightsRow(insightsComLeadId)}
    ${tabs}
    ${abasConteudo}
  `;

  return renderLayout({ active: 'clientes', title: `Cliente — ${d.name ?? '?'}`, body, dark: true });
}
