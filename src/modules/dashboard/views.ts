// Renderizacao HTML do dashboard — server-side. Sem framework, sem build step.
// Tailwind via CDN + Chart.js via CDN. Identidade EcoSun: azul navy + amarelo solar.

import type { DashboardKpi, PropostaRow, ManutencaoRow, GraficoMensal, SistemaMonitorRow } from './queries.js';
import type { DetalheSistema } from '../monitoring/service.js';
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
  active: 'home' | 'propostas' | 'manutencao' | 'monitoramento';
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
      <nav class="flex flex-wrap gap-1 text-sm w-full sm:w-auto justify-end">
        <a href="/dashboard/home" class="px-3 sm:px-4 py-2 rounded-lg transition ${navClass('home')}">🏠 <span class="hidden sm:inline">Home</span></a>
        <a href="/dashboard/propostas" class="px-3 sm:px-4 py-2 rounded-lg transition ${navClass('propostas')}">📊 <span class="hidden sm:inline">Propostas</span></a>
        <a href="/dashboard/monitoramento" class="px-3 sm:px-4 py-2 rounded-lg transition ${navClass('monitoramento')}">⚡ <span class="hidden sm:inline">Monitoramento</span></a>
        <a href="/dashboard/manutencao" class="px-3 sm:px-4 py-2 rounded-lg transition ${navClass('manutencao')}">🔧 <span class="hidden sm:inline">Manutenção</span></a>
        <form action="/dashboard/logout" method="post" class="inline">
          <button type="submit" class="px-3 py-2 rounded-lg text-sky-200 hover:bg-white/10 hover:text-white transition text-xs" title="Sair">🚪 <span class="hidden sm:inline">Sair</span></button>
        </form>
      </nav>
    </div>
  </header>

  <main class="max-w-7xl mx-auto px-4 sm:px-6 py-8 relative z-0">
    ${body}
  </main>

  <footer class="max-w-7xl mx-auto px-4 sm:px-6 py-6 text-xs text-slate-500 text-center border-t border-slate-200 mt-8">
    <div class="flex items-center justify-center gap-2 flex-wrap">
      <span>☀</span>
      <span>EcoSunPower Energia Solar</span>
      <span class="text-slate-300 hidden sm:inline">·</span>
      <span>CNPJ 33.020.459/0001-06</span>
      <span class="text-slate-300 hidden sm:inline">·</span>
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
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <div>
        <h1 class="text-2xl font-bold text-slate-900">Propostas</h1>
        <p class="text-slate-600 text-sm">${total} ${total === 1 ? 'proposta' : 'propostas'} ${search ? `encontrada(s) pra "${escapeHtml(search)}"` : 'no total'}</p>
      </div>
      <form action="/dashboard/propostas" method="get" class="flex gap-2 w-full sm:w-auto">
        <input type="text" name="q" value="${escapeHtml(search)}" placeholder="Buscar por nome..." class="flex-1 sm:flex-none sm:w-64 px-4 py-2 border border-slate-300 rounded-lg text-sm">
        <button class="px-4 py-2 bg-sky-700 text-white rounded-lg text-sm hover:bg-sky-800 whitespace-nowrap">🔍 Buscar</button>
      </form>
    </div>

    <section class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
      <table class="w-full min-w-[800px]">
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
// MONITORAMENTO — sistemas FV com geracao em tempo real (via API inversor)
// =========================================================================

const MARCAS_LABEL: Record<string, string> = {
  solaredge: 'SolarEdge',
  sungrow: 'Sungrow',
  deye: 'Deye',
  hoymiles: 'Hoymiles',
  goodwe: 'GoodWe',
  huawei: 'Huawei',
  foxess: 'FoxESS',
  nep: 'NEP',
};

// Cores oficiais aproximadas de cada marca (pra badge sem precisar de logo PNG).
// Quando Junior tiver as logos em arquivo, dá pra substituir o SVG por <img>.
const MARCAS_COR: Record<string, { bg: string; text: string; sigla: string }> = {
  solaredge: { bg: '#ED1C24', text: '#FFFFFF', sigla: 'SE' }, // SolarEdge vermelho
  sungrow:   { bg: '#F58220', text: '#FFFFFF', sigla: 'SG' }, // Sungrow laranja
  deye:      { bg: '#D9261C', text: '#FFFFFF', sigla: 'DY' }, // Deye vermelho
  hoymiles:  { bg: '#0091D5', text: '#FFFFFF', sigla: 'HY' }, // Hoymiles azul
  goodwe:    { bg: '#E60012', text: '#FFFFFF', sigla: 'GW' }, // GoodWe vermelho
  huawei:    { bg: '#C7000B', text: '#FFFFFF', sigla: 'HW' }, // Huawei vermelho
  foxess:    { bg: '#1F1F1F', text: '#FFFFFF', sigla: 'FX' }, // FoxESS cinza-escuro
  nep:       { bg: '#0070C0', text: '#FFFFFF', sigla: 'NE' }, // NEP azul
};

// Gera badge visual da marca: quadradinho colorido com sigla + label ao lado.
// Sem imagem externa = leve, rápido, sem broken images.
function marcaBadge(marca: string, options: { compact?: boolean } = {}): string {
  const cor = MARCAS_COR[marca] ?? { bg: '#64748B', text: '#FFFFFF', sigla: '?' };
  const label = MARCAS_LABEL[marca] ?? marca;
  if (options.compact) {
    return `<span class="inline-flex items-center justify-center rounded-md font-bold text-[10px] tracking-tight" style="background:${cor.bg};color:${cor.text};width:28px;height:28px" title="${escapeHtml(label)}">${escapeHtml(cor.sigla)}</span>`;
  }
  return `<span class="inline-flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium bg-slate-50 border border-slate-200">
    <span class="inline-flex items-center justify-center rounded font-bold text-[10px] tracking-tight" style="background:${cor.bg};color:${cor.text};width:22px;height:22px">${escapeHtml(cor.sigla)}</span>
    <span class="text-slate-800">${escapeHtml(label)}</span>
  </span>`;
}

export function renderMonitoramentoPage(rows: SistemaMonitorRow[]): string {
  const totalSistemas = rows.length;
  const totalGeracaoHoje = rows.reduce((s, r) => s + (r.geracao_hoje_kwh ?? 0), 0);
  const totalGeracaoMes = rows.reduce((s, r) => s + r.geracao_mes_kwh, 0);
  const totalKwp = rows.reduce((s, r) => s + (r.potencia_kwp ?? 0), 0);

  const kpiCard = (titulo: string, valor: string, sub: string, accent: string, valorCor: string) => `
    <div class="bg-white rounded-xl shadow-md hover:shadow-lg transition border border-slate-200 ${accent} p-5">
      <div class="text-xs uppercase tracking-wider text-slate-500 font-semibold">${escapeHtml(titulo)}</div>
      <div class="text-3xl font-bold ${valorCor} mt-2">${escapeHtml(valor)}</div>
      <div class="text-xs text-slate-500 mt-1">${escapeHtml(sub)}</div>
    </div>`;

  const linhas = rows.map((r) => {
    const local = [r.cidade, r.uf].filter(Boolean).join('/') || '—';
    const sincOk = r.ultima_sincronizacao
      && (Date.now() - new Date(r.ultima_sincronizacao).getTime() < 36 * 60 * 60 * 1000);
    const status = !r.ativo
      ? '<span class="px-2 py-1 rounded text-xs bg-slate-100 text-slate-500">⏸ Pausado</span>'
      : r.ultimo_erro
        ? `<span class="px-2 py-1 rounded text-xs bg-rose-100 text-rose-700" title="${escapeHtml(r.ultimo_erro)}">⚠️ Erro</span>`
        : sincOk
          ? '<span class="px-2 py-1 rounded text-xs bg-emerald-100 text-emerald-800">✅ OK</span>'
          : '<span class="px-2 py-1 rounded text-xs bg-amber-100 text-amber-800">⏳ Aguardando</span>';

    const hojeNum = r.geracao_hoje_kwh ?? null;
    const hojeStr = hojeNum !== null ? `${hojeNum.toFixed(1)} kWh` : '—';
    const mesStr = r.geracao_mes_kwh > 0 ? `${r.geracao_mes_kwh.toFixed(0)} kWh` : '—';

    return `
      <tr class="hover:bg-slate-50 cursor-pointer" onclick="window.location='/dashboard/monitoramento/${escapeHtml(r.id)}'">
        <td class="px-4 py-3 text-sm">
          <a href="/dashboard/monitoramento/${escapeHtml(r.id)}" class="font-medium text-sky-700 hover:underline">${escapeHtml(r.apelido)}</a>
          <div class="text-xs text-slate-500">${escapeHtml(local)}</div>
        </td>
        <td class="px-4 py-3 text-sm">${marcaBadge(r.marca_inversor)}</td>
        <td class="px-4 py-3 text-sm text-slate-700">${r.potencia_kwp ? `${r.potencia_kwp.toFixed(2)} kWp` : '—'}</td>
        <td class="px-4 py-3 text-sm text-amber-700 font-bold">${hojeStr}</td>
        <td class="px-4 py-3 text-sm text-emerald-700 font-medium">${mesStr}</td>
        <td class="px-4 py-3 text-sm">${status}</td>
        <td class="px-4 py-3 text-sm text-slate-500">${r.ultima_sincronizacao ? relativeTime(r.ultima_sincronizacao) : 'nunca'}</td>
        <td class="px-4 py-3 text-right" onclick="event.stopPropagation()">
          <form action="/dashboard/monitoramento/${escapeHtml(r.id)}/sync" method="post" class="inline">
            <button class="px-3 py-1 rounded-md bg-sky-100 text-sky-700 hover:bg-sky-200 text-xs font-medium" title="Atualizar agora">🔄</button>
          </form>
        </td>
      </tr>`;
  }).join('');

  const body = `
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-slate-900">⚡ Monitoramento</h1>
      <p class="text-slate-600 text-sm">Geração em tempo real dos sistemas FV instalados nos clientes (via API dos inversores).</p>
    </div>

    <section class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      ${kpiCard('Sistemas ativos', String(totalSistemas), `${totalKwp.toFixed(1)} kWp total`, 'accent-amber', 'text-amber-600')}
      ${kpiCard('Geração hoje', `${totalGeracaoHoje.toFixed(1)} kWh`, 'somatório de todos', 'accent-sky', 'text-sky-700')}
      ${kpiCard('Geração mês', `${totalGeracaoMes.toFixed(0)} kWh`, 'mês corrente', 'accent-emerald', 'text-emerald-700')}
      ${kpiCard('Marcas', String(new Set(rows.map(r => r.marca_inversor)).size), 'integradas', 'accent-violet', 'text-violet-700')}
    </section>

    <div class="mb-4 flex flex-wrap gap-2">
      <a href="/dashboard/monitoramento/importar" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold shadow-md transition">
        📥 Importar todos do SolarEdge
      </a>
    </div>

    ${rows.length === 0 ? `
    <section class="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
      <div class="text-5xl mb-3">⚡</div>
      <div class="text-slate-700 font-medium mb-2">Nenhum sistema cadastrado ainda.</div>
      <div class="text-slate-500 text-sm max-w-md mx-auto mb-4">
        Maneira mais rápida: clica no botão amarelo acima <strong>"Importar todos do SolarEdge"</strong>,
        cola tua API key da conta SolarEdge, e o sistema cadastra todos os sites automaticamente.
      </div>
      <a href="/dashboard/monitoramento/importar" class="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-semibold shadow-lg transition">
        📥 Importar agora
      </a>
    </section>` : `
    <section class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
      <table class="w-full min-w-[800px]">
        <thead class="bg-slate-100 border-b border-slate-200">
          <tr class="text-left text-xs uppercase tracking-wider text-slate-500">
            <th class="px-4 py-3 font-semibold">Sistema</th>
            <th class="px-4 py-3 font-semibold">Marca</th>
            <th class="px-4 py-3 font-semibold">Potência</th>
            <th class="px-4 py-3 font-semibold">Hoje</th>
            <th class="px-4 py-3 font-semibold">Mês</th>
            <th class="px-4 py-3 font-semibold">Status</th>
            <th class="px-4 py-3 font-semibold">Última sinc</th>
            <th class="px-4 py-3 font-semibold text-right">Ação</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">${linhas}</tbody>
      </table>
    </section>

    <div class="mt-4 text-xs text-slate-500 text-center">
      💡 Sincronização automática a cada <strong>15 min</strong> (alinhado com taxa do SolarEdge).
      Esta página atualiza sozinha a cada <strong>30s</strong> mostrando o dado mais fresco do nosso banco.
    </div>`}
  `;

  // Auto-refresh 30s: pega dados frescos do nosso banco (que vem do cron 15min).
  // Sem chamadas extras a SolarEdge — apenas reload local.
  const scripts = `
<script>
  setTimeout(() => location.reload(), 30000);
</script>`;

  return renderLayout({ active: 'monitoramento', title: 'Monitoramento', body, scripts });
}

// =========================================================================
// DETALHE DE 1 SISTEMA — analise completa de uma usina
// =========================================================================

export function renderDetalheSistemaPage(d: DetalheSistema): string {
  const s = d.sistema;
  const localizacao = [s.cidade, s.uf].filter(Boolean).join('/') || '—';

  // Card de KPI com border-left colorido
  const card = (
    titulo: string,
    valor: string,
    sub: string,
    accent: 'amber' | 'sky' | 'emerald' | 'violet' | 'rose' | 'indigo',
    valorCor: string,
  ) => `
    <div class="bg-white rounded-xl shadow-md border border-slate-200 accent-${accent} p-5">
      <div class="text-xs uppercase tracking-wider text-slate-500 font-semibold">${escapeHtml(titulo)}</div>
      <div class="text-3xl font-bold ${valorCor} mt-2">${escapeHtml(valor)}</div>
      <div class="text-xs text-slate-500 mt-1">${escapeHtml(sub)}</div>
    </div>`;

  // Alertas
  const alertasHtml = d.alertas.length === 0
    ? '<div class="px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">✅ Sistema operando normalmente, sem alertas.</div>'
    : d.alertas.map((a) => {
        const cor = a.severidade === 'urgente'
          ? 'bg-rose-50 border-rose-200 text-rose-800'
          : a.severidade === 'aviso'
            ? 'bg-amber-50 border-amber-200 text-amber-900'
            : 'bg-sky-50 border-sky-200 text-sky-900';
        const icone = a.severidade === 'urgente' ? '🚨' : a.severidade === 'aviso' ? '⚠️' : 'ℹ️';
        return `<div class="px-4 py-3 rounded-lg border ${cor} text-sm mb-2">${icone} ${escapeHtml(a.texto)}</div>`;
      }).join('');

  // Dados pros graficos (Chart.js)
  const labels30 = d.serie30.map((p) => {
    const [, m, dia] = p.data.split('-');
    return `${dia}/${m}`;
  });
  const valores30 = d.serie30.map((p) => Number(p.kwh.toFixed(1)));
  const esperado30 = d.serie30.map((p) => Number(p.esperado.toFixed(1)));

  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const labelsMensal = d.serieMensal.map((p) => {
    const [y, m] = p.mes.split('-');
    return `${meses[parseInt(m, 10) - 1]}/${y.slice(2)}`;
  });
  const valoresMensal = d.serieMensal.map((p) => Math.round(p.kwh));
  const esperadoMensal = d.serieMensal.map((p) => Math.round(p.esperado));

  const ratioPct = Math.round(d.kpis.ratioUltimos7 * 100);
  const ratioCor = ratioPct < 70 ? 'rose' : ratioPct > 110 ? 'emerald' : 'sky';
  const ratioCorClass = ratioPct < 70 ? 'text-rose-600' : ratioPct > 110 ? 'text-emerald-600' : 'text-sky-700';

  const body = `
    <div class="mb-4">
      <a href="/dashboard/monitoramento" class="text-sm text-slate-600 hover:underline">← Voltar pra lista</a>
    </div>

    <div class="bg-white rounded-xl shadow-md border border-slate-200 p-6 mb-6">
      <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div class="flex items-start gap-4">
          ${marcaBadge(s.marca_inversor, { compact: true }).replace('width:28px;height:28px', 'width:48px;height:48px;font-size:14px')}
          <div>
            <h1 class="text-2xl font-bold text-slate-900">${escapeHtml(s.apelido)}</h1>
            <div class="text-slate-600 text-sm mt-1 flex flex-wrap gap-3">
              <span><span class="text-slate-400">📍</span> ${escapeHtml(localizacao)}</span>
              <span><span class="text-slate-400">⚡</span> ${s.potencia_kwp ? `${Number(s.potencia_kwp).toFixed(2)} kWp` : 'sem potência'}</span>
              <span>${marcaBadge(s.marca_inversor)}</span>
              ${s.data_instalacao ? `<span><span class="text-slate-400">📅</span> Instalado ${formatDate(s.data_instalacao)}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="flex gap-2">
          <a href="/dashboard/monitoramento/${escapeHtml(s.id)}/editar" class="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm rounded-lg font-medium">✏️ Editar</a>
          <form action="/dashboard/monitoramento/${escapeHtml(s.id)}/sync" method="post" class="inline">
            <button class="px-4 py-2 bg-sky-700 hover:bg-sky-800 text-white text-sm rounded-lg font-medium">🔄 Atualizar</button>
          </form>
        </div>
      </div>
    </div>

    <section class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      ${card(
        'Hoje',
        d.kpis.hojeKwh !== null ? `${d.kpis.hojeKwh.toFixed(1)} kWh` : '—',
        d.kpis.hojeKwh !== null ? `de ${d.kpis.esperadoDiaKwh.toFixed(1)} esperado` : 'sem dados ainda',
        'amber',
        'text-amber-600',
      )}
      ${card('Mês', `${d.kpis.mesKwh.toFixed(0)} kWh`, 'mês corrente', 'sky', 'text-sky-700')}
      ${card('Ano', `${d.kpis.anoKwh.toFixed(0)} kWh`, 'desde 1º jan', 'emerald', 'text-emerald-700')}
      ${card('Total monitorado', `${d.kpis.totalKwh.toFixed(0)} kWh`, 'desde início do tracking', 'indigo', 'text-indigo-700')}
    </section>

    <section class="bg-white rounded-xl shadow-md border border-slate-200 p-6 mb-6 ${ratioPct < 70 ? 'accent-rose' : ratioPct > 110 ? 'accent-emerald' : 'accent-sky'}">
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-base font-semibold text-slate-900">Performance últimos 7 dias</h2>
        <span class="text-3xl font-bold ${ratioCorClass}">${ratioPct}%</span>
      </div>
      <div class="text-sm text-slate-600">
        Comparação geração real vs esperada (kWp × HSP regional × fator 0.80).
        ${ratioPct < 70 ? '⚠️ <strong class="text-rose-600">Performance baixa</strong> — possível sujeira/sombreamento.' : ratioPct > 110 ? '✨ <strong class="text-emerald-600">Acima do esperado</strong> — condições ótimas.' : '✅ Dentro da faixa normal de operação.'}
      </div>
    </section>

    <section class="mb-6">
      <h2 class="text-base font-semibold text-slate-900 mb-3">Status & Alertas</h2>
      ${alertasHtml}
    </section>

    <section class="bg-white rounded-xl shadow-md border border-slate-200 p-6 mb-6">
      <h2 class="text-base font-semibold text-slate-900 mb-4">Geração últimos 30 dias</h2>
      <div style="height:300px;position:relative">
        <canvas id="grafico30"></canvas>
      </div>
    </section>

    <section class="bg-white rounded-xl shadow-md border border-slate-200 p-6 mb-6">
      <h2 class="text-base font-semibold text-slate-900 mb-4">Geração últimos 12 meses</h2>
      <div style="height:300px;position:relative">
        <canvas id="graficoMensal"></canvas>
      </div>
    </section>

    ${s.ultimo_erro ? `
    <section class="bg-rose-50 border border-rose-200 rounded-xl p-4 mb-6 text-sm">
      <div class="font-semibold text-rose-800 mb-1">⚠️ Último erro de sincronização:</div>
      <div class="text-rose-700 font-mono text-xs">${escapeHtml(s.ultimo_erro)}</div>
    </section>` : ''}
  `;

  const scripts = `
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<script>
  // Auto-refresh 30s pra mostrar dado mais fresco do nosso banco.
  setTimeout(() => location.reload(), 30000);

  const ctx30 = document.getElementById('grafico30');
  if (ctx30) {
    new Chart(ctx30, {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(labels30)},
        datasets: [
          {
            label: 'Real (kWh)',
            data: ${JSON.stringify(valores30)},
            backgroundColor: '#f59e0b',
            borderRadius: 4,
            order: 2,
          },
          {
            label: 'Esperado (kWh)',
            data: ${JSON.stringify(esperado30)},
            type: 'line',
            borderColor: '#0ea5e9',
            borderDash: [4, 4],
            borderWidth: 2,
            fill: false,
            pointRadius: 0,
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: 'kWh' } },
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 15 } }
        }
      }
    });
  }

  const ctxMensal = document.getElementById('graficoMensal');
  if (ctxMensal) {
    new Chart(ctxMensal, {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(labelsMensal)},
        datasets: [
          {
            label: 'Real (kWh)',
            data: ${JSON.stringify(valoresMensal)},
            backgroundColor: '#10b981',
            borderRadius: 6,
          },
          {
            label: 'Esperado (kWh)',
            data: ${JSON.stringify(esperadoMensal)},
            backgroundColor: '#cbd5e1',
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: 'kWh' } },
          x: { grid: { display: false } }
        }
      }
    });
  }
</script>`;

  return renderLayout({
    active: 'monitoramento',
    title: s.apelido,
    body,
    scripts,
  });
}

// =========================================================================
// EDITAR SISTEMA — form pra cadastrar dados detalhados (paineis, telhado, etc)
// =========================================================================

// Marcas oficiais EcoSunPower (memoria project_marcas_ecosunpower.md)
const PAINEIS_SUGESTOES = [
  'Trina Solar', 'JA Solar', 'LONGi', 'Jinko Solar', 'DAH Solar',
  'Risen Energy', 'Canadian Solar',
];
const INVERSORES_SUGESTOES = [
  'SolarEdge', 'Sungrow', 'Solis', 'Deye', 'FoxESS', 'Hoymiles', 'NEP',
  'Huawei', 'Fronius', 'SMA', 'GoodWe', 'APsystems', 'SolaX',
];
// Modelos populares — autocomplete pra agilizar
const PAINEIS_MODELOS_SUGESTOES = [
  'Trina Vertex S+ TSM-NEG21C.20-700',
  'Trina Vertex S+ TSM-NEG21C.20-720',
  'JA Solar JAM72D40-580/MB (DeepBlue 4.0X)',
  'Jinko Tiger Neo JKM625N-78HL4-BDV',
  'LONGi Hi-MO X6 LR5-72HTH-585M',
  'LONGi Hi-MO 7 LR5-72HPH-590M',
  'Risen Hyper-Ion RSM132-8-660BHDG',
  'Risen Energy RSM144-8-715BHDG',
  'Canadian HiKu6 CS6R-460MS',
  'DAH 580W Bifacial',
];
const INVERSORES_MODELOS_SUGESTOES = [
  'Sungrow SG5.0RS-L',
  'Sungrow SG8.0RS',
  'Sungrow SG10RS',
  'Solis S6-GR1P5K',
  'Solis S6-GH3P10K',
  'Deye SUN-5K-G',
  'Deye SUN-8K-SG04LP3',
  'FoxESS H1-5.0',
  'Hoymiles HM-2250-4T',
  'Hoymiles HMS-2000-4T',
  'NEP BDM-1000',
  'GoodWe GW5K-DT',
  'SolarEdge SE5000H',
  'Huawei SUN2000-5KTL-L1',
];

export function renderEditarSistemaPage(s: import('../monitoring/types.js').SistemaCliente): string {
  const dl = (id: string, items: string[]) =>
    `<datalist id="${id}">${items.map(i => `<option value="${escapeHtml(i)}"></option>`).join('')}</datalist>`;

  const inputClass = 'w-full px-4 py-2 border-2 border-slate-200 rounded-lg focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 transition';
  const selectClass = inputClass;

  const orientacoes: Array<{ v: string; l: string }> = [
    { v: '', l: '— escolha —' },
    { v: 'N', l: 'N (Norte)' },
    { v: 'NE', l: 'NE' }, { v: 'L', l: 'L (Leste)' },
    { v: 'SE', l: 'SE' }, { v: 'S', l: 'S (Sul)' },
    { v: 'SO', l: 'SO' }, { v: 'O', l: 'O (Oeste)' },
    { v: 'NO', l: 'NO' },
  ];
  const tiposTelhado = [
    { v: '', l: '— escolha —' },
    { v: 'ceramica', l: 'Cerâmica' },
    { v: 'fibrocimento', l: 'Fibrocimento' },
    { v: 'laje', l: 'Laje' },
    { v: 'metalico', l: 'Metálico' },
    { v: 'solo', l: 'Solo (usina)' },
    { v: 'outro', l: 'Outro' },
  ];

  const body = `
    <div class="mb-4">
      <a href="/dashboard/monitoramento/${escapeHtml(s.id)}" class="text-sm text-slate-600 hover:underline">← Voltar pra ${escapeHtml(s.apelido)}</a>
    </div>

    <div class="mb-6">
      <h1 class="text-2xl font-bold text-slate-900">✏️ Editar dados do sistema</h1>
      <p class="text-slate-600 text-sm">Quanto mais detalhe, mais precisa fica a análise (PR, ranking, calibragem de propostas).</p>
    </div>

    <form action="/dashboard/monitoramento/${escapeHtml(s.id)}/editar" method="post" class="space-y-6">
      ${dl('paineis-marcas', PAINEIS_SUGESTOES)}
      ${dl('paineis-modelos', PAINEIS_MODELOS_SUGESTOES)}
      ${dl('inversores-modelos', INVERSORES_MODELOS_SUGESTOES)}

      <section class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 class="font-semibold text-slate-900 mb-4">📌 Identificação</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1">Apelido</label>
            <input name="apelido" type="text" value="${escapeHtml(s.apelido)}" required class="${inputClass}">
          </div>
          <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1">Potência (kWp)</label>
            <input name="potencia_kwp" type="number" step="0.01" value="${s.potencia_kwp ?? ''}" class="${inputClass}">
          </div>
          <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1">Cidade</label>
            <input name="cidade" type="text" value="${escapeHtml(s.cidade ?? '')}" class="${inputClass}">
          </div>
          <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1">UF</label>
            <input name="uf" type="text" maxlength="2" value="${escapeHtml(s.uf ?? '')}" class="${inputClass} uppercase">
          </div>
          <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1">Data instalação</label>
            <input name="data_instalacao" type="date" value="${s.data_instalacao ?? ''}" class="${inputClass}">
          </div>
          <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1">Ativo</label>
            <select name="ativo" class="${selectClass}">
              <option value="true" ${s.ativo ? 'selected' : ''}>Sim</option>
              <option value="false" ${!s.ativo ? 'selected' : ''}>Não (pausar monitoramento)</option>
            </select>
          </div>
        </div>
      </section>

      <section class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 class="font-semibold text-slate-900 mb-4">☀ Painéis solares</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1">Marca</label>
            <input name="painel_marca" type="text" list="paineis-marcas" value="${escapeHtml(s.painel_marca ?? '')}" placeholder="Ex: Trina Solar" class="${inputClass}">
          </div>
          <div class="md:col-span-2">
            <label class="block text-sm font-semibold text-slate-700 mb-1">Modelo</label>
            <input name="painel_modelo" type="text" list="paineis-modelos" value="${escapeHtml(s.painel_modelo ?? '')}" placeholder="Ex: TSM-NEG21C.20-700" class="${inputClass}">
          </div>
          <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1">Quantidade</label>
            <input name="qtd_paineis" type="number" min="1" value="${s.qtd_paineis ?? ''}" placeholder="Ex: 12" class="${inputClass}">
          </div>
        </div>
      </section>

      <section class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 class="font-semibold text-slate-900 mb-4">⚡ Inversor (modelo específico)</h2>
        <div>
          <label class="block text-sm font-semibold text-slate-700 mb-1">Modelo</label>
          <input name="inversor_modelo" type="text" list="inversores-modelos" value="${escapeHtml(s.inversor_modelo ?? '')}" placeholder="Ex: Sungrow SG5.0RS-L" class="${inputClass}">
          <p class="text-xs text-slate-500 mt-1">Marca já é <strong>${escapeHtml(MARCAS_LABEL[s.marca_inversor] ?? s.marca_inversor)}</strong> (vinda da API). Aqui é o modelo específico.</p>
        </div>
      </section>

      <section class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 class="font-semibold text-slate-900 mb-4">🏠 Telhado</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1">Tipo</label>
            <select name="telhado_tipo" class="${selectClass}">
              ${tiposTelhado.map(t => `<option value="${t.v}" ${s.telhado_tipo === t.v ? 'selected' : ''}>${escapeHtml(t.l)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1">Orientação predominante</label>
            <select name="telhado_orientacao" class="${selectClass}">
              ${orientacoes.map(o => `<option value="${o.v}" ${s.telhado_orientacao === o.v ? 'selected' : ''}>${escapeHtml(o.l)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1">Inclinação (graus)</label>
            <input name="telhado_inclinacao_graus" type="number" min="0" max="90" value="${s.telhado_inclinacao_graus ?? ''}" placeholder="Ex: 23" class="${inputClass}">
          </div>
          <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1">Sombreamento estimado (%)</label>
            <input name="sombreamento_pct" type="number" min="0" max="100" value="${s.sombreamento_pct ?? ''}" placeholder="0=sem sombra" class="${inputClass}">
          </div>
        </div>
      </section>

      <section class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 class="font-semibold text-slate-900 mb-4">📝 Observações</h2>
        <textarea name="observacoes" rows="3" class="${inputClass}" placeholder="Manutenções, situações especiais, troca de equipamento, etc.">${escapeHtml(s.observacoes ?? '')}</textarea>
      </section>

      <div class="flex flex-col sm:flex-row gap-3 sticky bottom-4">
        <button type="submit" class="flex-1 bg-gradient-to-r from-sky-700 to-sky-600 hover:from-sky-800 hover:to-sky-700 text-white font-semibold py-3 rounded-xl shadow-lg transition">
          💾 Salvar alterações
        </button>
        <a href="/dashboard/monitoramento/${escapeHtml(s.id)}" class="flex-1 bg-white border-2 border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-3 rounded-xl text-center transition">
          Cancelar
        </a>
      </div>
    </form>
  `;

  return renderLayout({ active: 'monitoramento', title: `Editar ${s.apelido}`, body });
}

// =========================================================================
// IMPORTAR SITES — form com API key SolarEdge / outras marcas
// =========================================================================

interface ImportarPageInput {
  errorMsg?: string;
  successMsg?: string;
  novos?: number;
  atualizados?: number;
  total?: number;
  sitesNomes?: string[];
}

export function renderImportarSitesPage(input: ImportarPageInput = {}): string {
  const { errorMsg, successMsg, novos, atualizados, total, sitesNomes } = input;

  const erro = errorMsg
    ? `<div class="mb-4 px-4 py-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm">⚠️ ${escapeHtml(errorMsg)}</div>`
    : '';

  const sucesso = successMsg
    ? `<div class="mb-4 px-4 py-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900">
        <div class="font-semibold mb-2">✅ ${escapeHtml(successMsg)}</div>
        <div class="text-sm">${total} sites encontrados — ${novos} novos cadastrados, ${atualizados} atualizados.</div>
        ${sitesNomes && sitesNomes.length > 0 ? `
          <details class="mt-2">
            <summary class="text-xs cursor-pointer hover:underline">Ver lista de sites</summary>
            <ul class="text-xs mt-2 space-y-1 ml-4 list-disc">
              ${sitesNomes.map(n => `<li>${escapeHtml(n)}</li>`).join('')}
            </ul>
          </details>` : ''}
      </div>`
    : '';

  const body = `
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-slate-900">📥 Importar sistemas em massa</h1>
      <p class="text-slate-600 text-sm">Cole a API key da conta e o sistema cadastra todos os sites automaticamente.</p>
    </div>

    ${erro}
    ${sucesso}

    <section class="bg-white rounded-xl shadow-md border border-slate-200 p-6 max-w-2xl">
      <form action="/dashboard/monitoramento/importar" method="post" class="space-y-4">
        <div>
          <label for="marca" class="block text-sm font-semibold text-slate-700 mb-2">Marca do inversor</label>
          <select name="marca" id="marca" required
                  class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition">
            <option value="solaredge">SolarEdge</option>
            <option value="sungrow" disabled>Sungrow (em breve)</option>
            <option value="deye" disabled>Deye (em breve)</option>
            <option value="hoymiles" disabled>Hoymiles (em breve)</option>
            <option value="goodwe" disabled>GoodWe (em breve)</option>
            <option value="huawei" disabled>Huawei (em breve)</option>
            <option value="foxess" disabled>FoxESS (em breve)</option>
          </select>
        </div>

        <div>
          <label for="api_key" class="block text-sm font-semibold text-slate-700 mb-2">API Key da conta</label>
          <input
            id="api_key"
            name="api_key"
            type="text"
            required
            autofocus
            placeholder="cola aqui a API key gerada no painel SolarEdge"
            class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition font-mono text-sm">
          <p class="text-xs text-slate-500 mt-2">
            Pega em: monitoring.solaredge.com → Admin → Site Access → API Access (gerar/copiar a chave).
          </p>
        </div>

        <button type="submit"
                class="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-semibold py-3 rounded-xl shadow-lg hover:shadow-xl transition transform hover:-translate-y-0.5">
          📥 Importar agora
        </button>
      </form>

      <div class="mt-6 pt-6 border-t border-slate-100 text-xs text-slate-500 space-y-2">
        <p>💡 <strong>Como funciona:</strong> a gente chama <code class="bg-slate-100 px-1 rounded">/sites/list</code>
        da SolarEdge com tua API key, recebe todos os sites associados, e cadastra cada um em
        <code class="bg-slate-100 px-1 rounded">sistemas_clientes</code>.</p>
        <p>🔄 <strong>Atualização automática:</strong> de hora em hora, o sistema usa essa API key pra
        verificar se você criou plantas novas no painel SolarEdge — se criou, aparecem aqui sem você fazer nada.</p>
        <p>🔁 <strong>Re-importar:</strong> rodar de novo é seguro — sites que já existem só são atualizados (apelido, potência, etc).</p>
      </div>
    </section>

    <div class="mt-4">
      <a href="/dashboard/monitoramento" class="text-sm text-slate-600 hover:underline">← Voltar pro monitoramento</a>
    </div>
  `;

  return renderLayout({ active: 'monitoramento', title: 'Importar sites', body });
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

    <section class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
      <table class="w-full min-w-[800px]">
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
