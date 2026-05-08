// Renderizacao HTML do dashboard — server-side. Sem framework, sem build step.
// Tailwind via CDN + Chart.js via CDN. Identidade EcoSun: azul navy + amarelo solar.

import type { DashboardKpi, PropostaRow, ManutencaoRow, GraficoMensal } from './queries.js';
import { LOGO_ECOSUNPOWER_BRANCO_BASE64 } from '../proposal/assets/logo-base64.js';

function escapeHtml(s: string | null | undefined): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function brl(v: number | null | undefined): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 30) return `${dias}d atrás`;
  if (dias < 365) return `${Math.floor(dias / 30)}m atrás`;
  return `${Math.floor(dias / 365)}a atrás`;
}

// Formata status do follow-up automatico de proposta como badge colorido.
// Hierarquia (do mais avancado pro inicial):
//   1. revogada
//   2. cliente respondeu (ouro — venda em curso)
//   3. eva engajou ou skipped
//   4. cliente visualizou (sem followup ainda)
//   5. so enviada (sem acesso)
function formatStatusFollowup(p: PropostaRow): string {
  if (p.revoked) {
    return '<span class="inline-block px-2 py-1 rounded text-xs bg-slate-200 text-slate-600">🚫 Revogada</span>';
  }
  if (p.cliente_respondeu_at) {
    return `<span class="inline-block px-2 py-1 rounded text-xs bg-emerald-100 text-emerald-800 font-semibold" title="Respondeu ${relativeTime(p.cliente_respondeu_at)}">✉️ Respondeu</span>`;
  }
  if (p.followup_sent_at) {
    if (p.followup_skipped_reason) {
      const motivos: Record<string, string> = {
        cliente_sem_telefone: 'sem fone',
        waba_indisponivel: 'sem WABA',
        fora_janela_24h: 'fora 24h',
        envio_falhou: 'erro envio',
      };
      const motivo = motivos[p.followup_skipped_reason] ?? p.followup_skipped_reason;
      return `<span class="inline-block px-2 py-1 rounded text-xs bg-amber-100 text-amber-800" title="${escapeHtml(p.followup_skipped_reason)}">⚠️ ${escapeHtml(motivo)}</span>`;
    }
    return `<span class="inline-block px-2 py-1 rounded text-xs bg-sky-100 text-sky-800" title="Eva engajou ${relativeTime(p.followup_sent_at)}">💬 Eva engajou</span>`;
  }
  if (p.acessos > 0) {
    return `<span class="inline-block px-2 py-1 rounded text-xs bg-yellow-100 text-yellow-800" title="${p.acessos} acesso${p.acessos > 1 ? 's' : ''}">👁 Visualizada</span>`;
  }
  return '<span class="inline-block px-2 py-1 rounded text-xs bg-slate-100 text-slate-600">📤 Enviada</span>';
}

// =========================================================================
// LAYOUT (wrapper comum)
// =========================================================================

interface LayoutInput {
  active: 'home' | 'propostas' | 'manutencao';
  title: string;
  body: string;
  scripts?: string;
}

export function renderLayout(input: LayoutInput): string {
  const { active, title, body, scripts } = input;
  const navClass = (key: string) =>
    active === key
      ? 'bg-amber-400 text-slate-900 font-semibold shadow-md'
      : 'text-sky-100 hover:bg-white/10 hover:text-white';

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · EcoSun Dashboard</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .ecosun-header {
    background: linear-gradient(135deg, #0c4a6e 0%, #075985 50%, #0369a1 100%);
    position: relative;
    overflow: hidden;
  }
  .ecosun-header::after {
    content: '';
    position: absolute;
    top: -40px;
    right: -60px;
    width: 220px;
    height: 220px;
    background: radial-gradient(circle, rgba(245, 158, 11, 0.25), transparent 70%);
    pointer-events: none;
  }
  .ecosun-body {
    background:
      radial-gradient(ellipse at top left, rgba(14, 165, 233, 0.08), transparent 50%),
      radial-gradient(ellipse at bottom right, rgba(245, 158, 11, 0.05), transparent 50%),
      #f8fafc;
    min-height: 100vh;
  }
  .accent-amber { border-left: 4px solid #f59e0b; }
  .accent-sky { border-left: 4px solid #0ea5e9; }
  .accent-emerald { border-left: 4px solid #10b981; }
  .accent-violet { border-left: 4px solid #8b5cf6; }
  .accent-rose { border-left: 4px solid #f43f5e; }
  .accent-indigo { border-left: 4px solid #6366f1; }
</style>
</head>
<body class="ecosun-body">
  <header class="ecosun-header text-white shadow-lg relative z-10">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
      <div class="flex items-center gap-3">
        <img src="${LOGO_ECOSUNPOWER_BRANCO_BASE64}" alt="EcoSunPower" class="h-10 w-auto bg-white rounded-lg p-1.5 shadow-md">
        <div>
          <div class="font-bold text-lg leading-none tracking-tight">EcoSunPower</div>
          <div class="text-xs text-sky-200 mt-1">Dashboard interno</div>
        </div>
      </div>
      <nav class="flex gap-1 text-sm">
        <a href="/dashboard/home" class="px-4 py-2 rounded-lg transition ${navClass('home')}">Home</a>
        <a href="/dashboard/propostas" class="px-4 py-2 rounded-lg transition ${navClass('propostas')}">Propostas</a>
        <a href="/dashboard/manutencao" class="px-4 py-2 rounded-lg transition ${navClass('manutencao')}">Manutenção</a>
        <form action="/dashboard/logout" method="post" class="inline">
          <button type="submit" class="px-3 py-2 rounded-lg text-sky-200 hover:bg-white/10 hover:text-white transition text-xs">Sair</button>
        </form>
      </nav>
    </div>
  </header>

  <main class="max-w-7xl mx-auto px-4 sm:px-6 py-8 relative z-0">
    ${body}
  </main>

  <footer class="max-w-7xl mx-auto px-4 sm:px-6 py-6 text-xs text-slate-500 text-center border-t border-slate-200 mt-8">
    <div class="flex items-center justify-center gap-2">
      <span>☀</span>
      <span>EcoSunPower Energia Solar</span>
      <span class="text-slate-300">·</span>
      <span>CNPJ 33.020.459/0001-06</span>
      <span class="text-slate-300">·</span>
      <span>Brasília-DF</span>
    </div>
  </footer>

  ${scripts ?? ''}
</body>
</html>`;
}

// =========================================================================
// LOGIN — tela de auth com logo + form
// =========================================================================

interface LoginPageInput {
  errorMsg?: string;
  next?: string;
}

export function renderLoginPage(input: LoginPageInput = {}): string {
  const { errorMsg, next } = input;
  const erro = errorMsg
    ? `<div class="mb-4 px-4 py-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm">⚠️ ${escapeHtml(errorMsg)}</div>`
    : '';

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Login · EcoSun Dashboard</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .login-bg {
    background:
      radial-gradient(circle at 20% 30%, rgba(245, 158, 11, 0.18), transparent 40%),
      radial-gradient(circle at 80% 70%, rgba(14, 165, 233, 0.25), transparent 50%),
      linear-gradient(135deg, #0c4a6e 0%, #075985 50%, #0369a1 100%);
  }
  .sun-pulse {
    animation: sun-pulse 4s ease-in-out infinite;
  }
  @keyframes sun-pulse {
    0%, 100% { box-shadow: 0 0 60px rgba(245, 158, 11, 0.4); }
    50% { box-shadow: 0 0 100px rgba(245, 158, 11, 0.65); }
  }
</style>
</head>
<body class="login-bg min-h-screen flex items-center justify-center p-4">
  <div class="w-full max-w-md">
    <div class="text-center mb-8">
      <div class="inline-block bg-white rounded-2xl p-4 shadow-2xl sun-pulse mb-4">
        <img src="${LOGO_ECOSUNPOWER_BRANCO_BASE64}" alt="EcoSunPower" class="h-16 w-auto">
      </div>
      <h1 class="text-3xl font-bold text-white tracking-tight">EcoSunPower</h1>
      <p class="text-sky-200 text-sm mt-2">Dashboard interno · Acesso restrito</p>
    </div>

    <div class="bg-white rounded-2xl shadow-2xl p-8">
      ${erro}
      <form action="/dashboard/login" method="post" class="space-y-5">
        ${next ? `<input type="hidden" name="next" value="${escapeHtml(next)}">` : ''}

        <div>
          <label for="senha" class="block text-sm font-semibold text-slate-700 mb-2">
            🔐 Senha de acesso
          </label>
          <input
            id="senha"
            name="senha"
            type="password"
            required
            autocomplete="current-password"
            autofocus
            class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 transition"
            placeholder="Digite sua senha">
        </div>

        <button
          type="submit"
          class="w-full bg-gradient-to-r from-sky-700 to-sky-600 hover:from-sky-800 hover:to-sky-700 text-white font-semibold py-3 rounded-xl shadow-lg hover:shadow-xl transition transform hover:-translate-y-0.5">
          Entrar →
        </button>
      </form>

      <div class="mt-6 pt-6 border-t border-slate-100 text-center text-xs text-slate-400">
        Em caso de dúvida, fale com o líder técnico.<br>
        EcoSunPower Energia Solar · Brasília-DF
      </div>
    </div>

    <div class="text-center mt-6 text-xs text-sky-200/60">
      ☀ Plataforma proprietária · CNPJ 33.020.459/0001-06
    </div>
  </div>
</body>
</html>`;
}

// =========================================================================
// HOME — KPIs + grafico
// =========================================================================

export function renderHomePage(kpis: DashboardKpi, grafico: GraficoMensal[]): string {
  const card = (
    titulo: string,
    valor: string,
    sub?: string,
    accent: 'amber' | 'sky' | 'emerald' | 'violet' | 'rose' | 'indigo' = 'sky',
    valorCor: string = 'text-slate-900',
  ) => `
    <div class="bg-white rounded-xl shadow-md hover:shadow-lg transition border border-slate-200 accent-${accent} p-5">
      <div class="text-xs uppercase tracking-wider text-slate-500 font-semibold">${escapeHtml(titulo)}</div>
      <div class="text-3xl font-bold ${valorCor} mt-2">${escapeHtml(valor)}</div>
      ${sub ? `<div class="text-xs text-slate-500 mt-1">${escapeHtml(sub)}</div>` : ''}
    </div>`;

  const labels = grafico.map(g => {
    const [y, m] = g.mes.split('-');
    const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    return `${meses[parseInt(m) - 1]}/${y.slice(2)}`;
  });
  const valores = grafico.map(g => g.total);

  const body = `
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-slate-900">Visão geral</h1>
      <p class="text-slate-600 text-sm">Resumo das atividades da Eva e do funil de propostas.</p>
    </div>

    <section class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      ${card('Propostas mês', String(kpis.propostasMesAtual), `${kpis.propostasAnoAtual} no ano · ${kpis.totalPropostas} total`, 'amber', 'text-amber-600')}
      ${card('Ticket médio', brl(kpis.ticketMedio), 'baseado nas últimas 50 propostas', 'emerald', 'text-emerald-700')}
      ${card('Leads mês', String(kpis.leadsMesAtual), `${kpis.totalLeads} total`, 'sky', 'text-sky-700')}
      ${card('Em qualificação', String(kpis.leadsQualificando), 'Eva ativa neles', 'violet', 'text-violet-700')}
    </section>

    <section class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      ${card('Clientes instalados', String(kpis.clientesInstalados), 'sistemas operando', 'emerald')}
      ${card('Manutenção próx 30d', String(kpis.manutencaoPendente), 'lembretes pendentes', kpis.manutencaoPendente > 0 ? 'rose' : 'sky', kpis.manutencaoPendente > 0 ? 'text-rose-600' : 'text-slate-900')}
      ${card('Total propostas', String(kpis.totalPropostas), 'desde sempre', 'indigo')}
    </section>

    <section class="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-8">
      <h2 class="text-lg font-semibold text-slate-900 mb-4">Propostas geradas — últimos 12 meses</h2>
      <div style="height:280px;position:relative">
        <canvas id="graficoMensal"></canvas>
      </div>
    </section>

    <section class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <h2 class="text-lg font-semibold text-slate-900 mb-2">Atalhos</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <a href="/dashboard/propostas" class="block p-4 rounded-lg border border-slate-200 hover:border-sky-500 hover:bg-sky-50 transition">
          <div class="font-semibold text-slate-900">📊 Ver todas as propostas</div>
          <div class="text-slate-500 text-xs mt-1">Filtrar, buscar, abrir links</div>
        </a>
        <a href="/dashboard/manutencao" class="block p-4 rounded-lg border border-slate-200 hover:border-amber-500 hover:bg-amber-50 transition">
          <div class="font-semibold text-slate-900">🔧 Manutenção pendente</div>
          <div class="text-slate-500 text-xs mt-1">Quem precisa ser contatado</div>
        </a>
        <div class="block p-4 rounded-lg border border-dashed border-slate-300 bg-slate-50">
          <div class="font-semibold text-slate-400">+ Mais módulos em breve</div>
          <div class="text-slate-400 text-xs mt-1">Portal cliente, monitoramento, rateio</div>
        </div>
      </div>
    </section>
  `;

  const scripts = `
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<script>
  const ctx = document.getElementById('graficoMensal');
  if (ctx) {
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(labels)},
        datasets: [{
          label: 'Propostas',
          data: ${JSON.stringify(valores)},
          backgroundColor: '#f59e0b',
          borderRadius: 6,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 } },
          x: { grid: { display: false } }
        }
      }
    });
  }
</script>`;

  return renderLayout({ active: 'home', title: 'Home', body, scripts });
}

// =========================================================================
// PROPOSTAS — lista paginada + busca
// =========================================================================

export interface PropostasPageInput {
  rows: PropostaRow[];
  total: number;
  offset: number;
  limit: number;
  search: string;
}

export function renderPropostasPage(input: PropostasPageInput): string {
  const { rows, total, offset, limit, search } = input;
  const pagina = Math.floor(offset / limit) + 1;
  const totalPaginas = Math.max(1, Math.ceil(total / limit));

  const linhas = rows.map(p => {
    const localizacao = [p.cidade, p.uf].filter(Boolean).join('/') || '—';
    const url = p.revoked
      ? '#'
      : `https://propostas.ecosunpower.eng.br/p/${escapeHtml(p.slug)}`;
    const status = formatStatusFollowup(p);
    return `
      <tr class="hover:bg-slate-50 ${p.revoked ? 'opacity-50' : ''}">
        <td class="px-4 py-3 text-sm">
          <div class="font-medium text-slate-900">${escapeHtml(p.cliente_nome)}</div>
          <div class="text-xs text-slate-500">${escapeHtml(p.cliente_telefone) || '—'}</div>
        </td>
        <td class="px-4 py-3 text-sm text-slate-600">${escapeHtml(localizacao)}</td>
        <td class="px-4 py-3 text-sm text-slate-700">${p.kwp ? `${p.kwp.toFixed(2)} kWp` : '—'}</td>
        <td class="px-4 py-3 text-sm text-slate-700 font-medium">${brl(p.valorTotal)}</td>
        <td class="px-4 py-3 text-sm text-slate-600">${formatDate(p.created_at)}</td>
        <td class="px-4 py-3 text-sm">${status}</td>
        <td class="px-4 py-3 text-sm text-slate-600">${p.acessos}x ${p.ultimo_acesso_at ? `· ${relativeTime(p.ultimo_acesso_at)}` : ''}</td>
        <td class="px-4 py-3 text-sm text-right">
          ${p.revoked
            ? '<span class="text-xs text-red-600">revogada</span>'
            : `<a href="${url}" target="_blank" class="inline-flex items-center px-3 py-1 rounded-md bg-sky-100 text-sky-700 hover:bg-sky-200 text-xs font-medium">Abrir →</a>`
          }
        </td>
      </tr>`;
  }).join('');

  const body = `
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-slate-900">Propostas</h1>
        <p class="text-slate-600 text-sm">${total} ${total === 1 ? 'proposta' : 'propostas'} ${search ? `encontrada(s) pra "${escapeHtml(search)}"` : 'no total'}</p>
      </div>
      <form action="/dashboard/propostas" method="get" class="flex gap-2">
        <input type="text" name="q" value="${escapeHtml(search)}" placeholder="Buscar por nome do cliente..." class="px-4 py-2 border border-slate-300 rounded-lg text-sm w-64">
        <button class="px-4 py-2 bg-sky-700 text-white rounded-lg text-sm hover:bg-sky-800">Buscar</button>
      </form>
    </div>

    <section class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <table class="w-full">
        <thead class="bg-slate-100 border-b border-slate-200">
          <tr class="text-left text-xs uppercase tracking-wider text-slate-500">
            <th class="px-4 py-3 font-semibold">Cliente</th>
            <th class="px-4 py-3 font-semibold">Localização</th>
            <th class="px-4 py-3 font-semibold">Sistema</th>
            <th class="px-4 py-3 font-semibold">Valor</th>
            <th class="px-4 py-3 font-semibold">Gerada</th>
            <th class="px-4 py-3 font-semibold">Status</th>
            <th class="px-4 py-3 font-semibold">Acessos</th>
            <th class="px-4 py-3 font-semibold text-right">Link</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          ${rows.length > 0 ? linhas : '<tr><td colspan="8" class="px-4 py-8 text-center text-slate-500 text-sm">Nenhuma proposta encontrada.</td></tr>'}
        </tbody>
      </table>
    </section>

    ${total > limit ? `
    <div class="flex items-center justify-between mt-4 text-sm text-slate-600">
      <div>Página ${pagina} de ${totalPaginas}</div>
      <div class="flex gap-2">
        ${offset > 0
          ? `<a href="/dashboard/propostas?offset=${Math.max(0, offset - limit)}${search ? `&q=${encodeURIComponent(search)}` : ''}" class="px-3 py-2 bg-white border border-slate-300 rounded hover:bg-slate-50">← Anterior</a>`
          : `<span class="px-3 py-2 text-slate-300">← Anterior</span>`}
        ${offset + limit < total
          ? `<a href="/dashboard/propostas?offset=${offset + limit}${search ? `&q=${encodeURIComponent(search)}` : ''}" class="px-3 py-2 bg-white border border-slate-300 rounded hover:bg-slate-50">Próxima →</a>`
          : `<span class="px-3 py-2 text-slate-300">Próxima →</span>`}
      </div>
    </div>` : ''}
  `;

  return renderLayout({ active: 'propostas', title: 'Propostas', body });
}

// =========================================================================
// MANUTENCAO — clientes com lembrete pendente
// =========================================================================

export function renderManutencaoPage(rows: ManutencaoRow[]): string {
  const linhas = rows.map(r => {
    const dias = Math.floor((new Date(r.scheduled_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    const urgencia = dias < 0
      ? `<span class="text-red-600 font-semibold">Atrasada ${Math.abs(dias)}d</span>`
      : dias === 0
        ? '<span class="text-amber-600 font-semibold">HOJE</span>'
        : `<span class="text-slate-700">em ${dias}d</span>`;
    const topicLabel = r.topic === 'limpeza_maio'
      ? '🌧 Limpeza pré-chuva (maio)'
      : r.topic === 'limpeza_agosto'
        ? '🌳 Limpeza pós-folhas (agosto)'
        : escapeHtml(r.topic);

    const whatsappLink = r.telefone
      ? `https://wa.me/${r.telefone.replace(/\D/g, '')}`
      : null;

    return `
      <tr class="hover:bg-slate-50">
        <td class="px-4 py-3 text-sm">
          <div class="font-medium text-slate-900">${escapeHtml(r.cliente_nome)}</div>
          <div class="text-xs text-slate-500">${escapeHtml(r.telefone) || '—'}</div>
        </td>
        <td class="px-4 py-3 text-sm">${topicLabel}</td>
        <td class="px-4 py-3 text-sm text-slate-700">${formatDate(r.scheduled_date)}</td>
        <td class="px-4 py-3 text-sm">${urgencia}</td>
        <td class="px-4 py-3 text-sm text-slate-600">${formatDate(r.installed_at)}</td>
        <td class="px-4 py-3 text-right">
          ${whatsappLink
            ? `<a href="${whatsappLink}" target="_blank" class="inline-flex items-center px-3 py-1 rounded-md bg-green-100 text-green-700 hover:bg-green-200 text-xs font-medium">💬 WhatsApp</a>`
            : '<span class="text-xs text-slate-400">sem fone</span>'}
        </td>
      </tr>`;
  }).join('');

  const body = `
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-slate-900">🔧 Manutenção pendente</h1>
      <p class="text-slate-600 text-sm">Clientes com lembrete agendado nos próximos 30 dias (ou já atrasado).</p>
    </div>

    ${rows.length > 0 ? `
    <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-3">
      <div class="text-2xl">📌</div>
      <div class="text-sm text-amber-900">
        <div class="font-semibold">${rows.length} ${rows.length === 1 ? 'cliente' : 'clientes'} esperando contato.</div>
        <div class="text-xs mt-1">Eva já tem cron diário pra disparar mensagens automaticamente, mas você pode contatar manualmente clicando no botão WhatsApp ao lado de cada linha.</div>
      </div>
    </div>
    ` : ''}

    <section class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <table class="w-full">
        <thead class="bg-slate-100 border-b border-slate-200">
          <tr class="text-left text-xs uppercase tracking-wider text-slate-500">
            <th class="px-4 py-3 font-semibold">Cliente</th>
            <th class="px-4 py-3 font-semibold">Tipo</th>
            <th class="px-4 py-3 font-semibold">Data</th>
            <th class="px-4 py-3 font-semibold">Status</th>
            <th class="px-4 py-3 font-semibold">Instalado em</th>
            <th class="px-4 py-3 font-semibold text-right">Ação</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          ${rows.length > 0 ? linhas : `
            <tr>
              <td colspan="6" class="px-4 py-12 text-center">
                <div class="text-4xl mb-2">✨</div>
                <div class="text-slate-700 font-medium">Nenhuma manutenção pendente nos próximos 30 dias.</div>
                <div class="text-slate-500 text-sm mt-1">
                  Pra criar lembretes, marque clientes como "manutenção" via comando <code class="bg-slate-100 px-1 rounded">/manutencao</code> na Eva.
                </div>
              </td>
            </tr>`}
        </tbody>
      </table>
    </section>
  `;

  return renderLayout({ active: 'manutencao', title: 'Manutenção', body });
}
