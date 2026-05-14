// View HTML do dashboard de visualizacoes de proposta.
//
// Pagina: /dashboard/propostas/<slug>/visualizacoes
// Mostra resumo + timeline cronologica + filtros + export CSV.
// Identidade EcoSun (navy + amarelo solar), mobile responsivo.

import type {
  PropostaResumoVisualizacoes,
  VisualizacaoRow,
} from './proposta-views-queries.js';
import { escapeHtml } from './views.js';

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function relativeFromNow(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min atrás`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h atrás`;
  const dias = Math.floor(h / 24);
  return `${dias}d atrás`;
}

function detectarDispositivo(ua: string | null): string {
  if (!ua) return '—';
  if (/iPhone|Android|Mobile/i.test(ua)) return '📱 Mobile';
  if (/iPad|Tablet/i.test(ua)) return '📱 Tablet';
  if (/Bot|crawler|spider/i.test(ua)) return '🤖 Bot';
  return '💻 Desktop';
}

function formatMinutos(min: number | null): string {
  if (min === null) return '—';
  if (min < 60) return `${min} min`;
  if (min < 60 * 24) return `${(min / 60).toFixed(1)}h`;
  return `${Math.floor(min / (60 * 24))}d ${Math.floor((min % (60 * 24)) / 60)}h`;
}

export interface VisualizacoesPageInput {
  resumo: PropostaResumoVisualizacoes;
  visualizacoes: VisualizacaoRow[];
  incluirPreview: boolean;
}

export function renderVisualizacoesPage(input: VisualizacoesPageInput): string {
  const { resumo, visualizacoes, incluirPreview } = input;

  const kpiCards = [
    { label: 'Aberturas (cliente)', value: String(resumo.total_aberturas_cliente), color: 'bg-amber-100 text-amber-800' },
    { label: 'Tempo até 1ª abertura', value: formatMinutos(resumo.tempo_ate_primeira_abertura_min), color: 'bg-blue-100 text-blue-800' },
    { label: 'Intervalo médio entre aberturas', value: formatMinutos(resumo.intervalo_medio_aberturas_min), color: 'bg-green-100 text-green-800' },
    { label: 'Dias ativo', value: `${resumo.dias_ativo}d`, color: 'bg-indigo-100 text-indigo-800' },
    { label: 'Aberturas preview (Junior)', value: String(resumo.total_aberturas_preview), color: 'bg-slate-100 text-slate-700' },
  ];

  const kpisHtml = kpiCards
    .map(
      (k) => `
        <div class="rounded-lg p-4 ${k.color}">
          <div class="text-xs uppercase tracking-wide opacity-75">${escapeHtml(k.label)}</div>
          <div class="text-2xl font-bold mt-1">${escapeHtml(k.value)}</div>
        </div>
      `,
    )
    .join('');

  // Timeline
  const timelineHtml = visualizacoes.length
    ? visualizacoes
        .map((v, idx) => {
          const ordinal = visualizacoes.length - idx;  // mais recente = nº maior
          const dispositivo = detectarDispositivo(v.user_agent);
          const previewBadge = v.is_preview
            ? `<span class="inline-block px-2 py-0.5 text-xs bg-slate-200 text-slate-700 rounded">👁️ preview</span>`
            : `<span class="inline-block px-2 py-0.5 text-xs bg-amber-100 text-amber-800 rounded">cliente</span>`;
          return `
            <li class="border-l-2 border-amber-400 pl-4 pb-4 relative">
              <span class="absolute -left-1.5 top-2 w-3 h-3 bg-amber-500 rounded-full"></span>
              <div class="flex items-baseline gap-3">
                <span class="text-xs text-slate-500 font-mono">#${ordinal}</span>
                <span class="font-medium">${formatDateTime(v.viewed_at)}</span>
                <span class="text-sm text-slate-500">(${relativeFromNow(v.viewed_at)})</span>
                ${previewBadge}
              </div>
              <div class="text-sm text-slate-600 mt-1">
                ${dispositivo} ·
                IP <code class="text-xs bg-slate-100 px-1 rounded">${escapeHtml(v.ip_address ?? '—')}</code>
                ${v.referer ? `· ref: <code class="text-xs">${escapeHtml(v.referer.slice(0, 60))}</code>` : ''}
              </div>
              ${v.user_agent ? `<div class="text-xs text-slate-400 mt-1 truncate max-w-2xl" title="${escapeHtml(v.user_agent)}">${escapeHtml(v.user_agent.slice(0, 120))}</div>` : ''}
            </li>
          `;
        })
        .join('')
    : `<p class="text-slate-500 italic">Nenhuma abertura registrada ainda.</p>`;

  const csvUrl = `/dashboard/propostas/${encodeURIComponent(resumo.slug)}/visualizacoes.csv${incluirPreview ? '?preview=1' : ''}`;
  const togglePreviewUrl = `?preview=${incluirPreview ? '0' : '1'}`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Visualizações: ${escapeHtml(resumo.cliente_nome)} — EcoSun</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-900 font-sans">
  <header class="bg-[#0d1b2a] text-white py-4 px-6 mb-6 shadow">
    <div class="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-3">
      <div>
        <a href="/dashboard/propostas" class="text-sm text-amber-300 hover:underline">← Propostas</a>
        <h1 class="text-xl font-bold mt-1">📊 Visualizações da proposta</h1>
      </div>
      <div class="text-right">
        <div class="text-lg">${escapeHtml(resumo.cliente_nome)}</div>
        <div class="text-sm text-slate-300">
          ${escapeHtml(resumo.cliente_telefone ?? '—')}
          · gerada ${formatDateTime(resumo.created_at)}
        </div>
      </div>
    </div>
  </header>

  <main class="max-w-5xl mx-auto px-6 pb-12">
    <!-- KPIs -->
    <section class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
      ${kpisHtml}
    </section>

    <!-- Controles -->
    <section class="flex flex-wrap gap-3 mb-4 items-center justify-between">
      <h2 class="text-lg font-semibold">Linha do tempo</h2>
      <div class="flex gap-2 text-sm">
        <a href="${togglePreviewUrl}" class="px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-100">
          ${incluirPreview ? '✓ Mostrando preview admin' : 'Incluir preview admin'}
        </a>
        <a href="${csvUrl}" class="px-3 py-1.5 rounded bg-amber-500 text-white hover:bg-amber-600">
          📥 Exportar CSV
        </a>
        <a href="https://propostas.ecosunpower.eng.br/p/${encodeURIComponent(resumo.slug)}"
           target="_blank" rel="noopener"
           class="px-3 py-1.5 rounded bg-[#0d1b2a] text-white hover:bg-[#1b263b]">
          🔗 Abrir proposta
        </a>
      </div>
    </section>

    <!-- Timeline -->
    <section class="bg-white rounded-lg shadow p-6">
      <ul class="space-y-0">
        ${timelineHtml}
      </ul>
    </section>

    <footer class="mt-8 text-xs text-slate-400 text-center">
      Slug: <code>${escapeHtml(resumo.slug)}</code> · ${visualizacoes.length} registro(s) ·
      Preview admin é Junior abrindo via <code>?eu=&lt;token&gt;</code>
    </footer>
  </main>
</body>
</html>`;
}

/** Exportacao CSV das visualizacoes. */
export function renderVisualizacoesCsv(rows: VisualizacaoRow[]): string {
  const header = 'id,viewed_at,is_preview,ip_address,user_agent,referer\n';
  const linhas = rows
    .map((v) => {
      const escape = (s: string | null) =>
        s ? `"${s.replace(/"/g, '""')}"` : '';
      return [
        v.id,
        v.viewed_at,
        v.is_preview ? 'true' : 'false',
        escape(v.ip_address),
        escape(v.user_agent),
        escape(v.referer),
      ].join(',');
    })
    .join('\n');
  return header + linhas;
}
