// Renderizacao HTML do dashboard — server-side. Sem framework, sem build step.
// Tailwind via CDN + Chart.js via CDN. Identidade EcoSun: azul navy + amarelo solar.

import type { DashboardKpi, PropostaRow, ManutencaoRow, GraficoMensal, SistemaMonitorRow } from './queries.js';
import type { DetalheSistema } from '../monitoring/service.js';
import { LOGO_ECOSUNPOWER_BRANCO_BASE64, LOGO_ECOSUNPOWER_DARK_BASE64 } from '../proposal/assets/logo-base64.js';
import { formatPhoneBR, normalizeBrazilianPhone } from '../meta-leadgen.js';
import { renderClienteSelector } from './proprietario.js';
import { empresa } from '../empresa-config.js';
import { can, type Area, type Nivel, type DashUser } from './permissions.js';

export function escapeHtml(s: string | null | undefined): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function brl(v: number | null | undefined): string {
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
  active: 'cockpit' | 'home' | 'propostas' | 'manutencao' | 'monitoramento' | 'usinas_kanban' | 'pos_venda' | 'marketing' | 'blog' | 'cadencia' | 'leads' | 'kanban' | 'clientes' | 'financeiro' | 'usuarios';
  title: string;
  body: string;
  scripts?: string;
  // Tema escuro escopado: só quem foi desenhado pra dark liga (hoje só o
  // Painel de Triagem). Default claro = não quebra as telas não adaptadas.
  dark?: boolean;
  // Usuário logado pra condicionar o menu por permissão. COMPATIBILIDADE:
  // se undefined, mostra TUDO (não quebra telas ainda não migradas).
  user?: DashUser;
}

// Estrutura de um item do sidebar.
interface SideItem {
  href: string;
  key: string;
  label: string;
  area?: Area;
  nivel?: Nivel;
}
// Estrutura de um setor (departamento) do sidebar.
interface SideSetor {
  titulo: string; // já inclui ícone
  itens: SideItem[];
}

// Setores e itens do menu lateral (departamentos). Gating por permissão
// reusa exatamente a mesma checagem do navItem antigo: item com área só
// aparece se can(user, area, nivel). Item sem área = sempre visível. Sem
// usuário (telas não migradas) = mostra tudo (compatibilidade).
const SIDEBAR_SETORES: SideSetor[] = [
  {
    titulo: '📊 Visão geral',
    itens: [
      { href: '/dashboard/cockpit', key: 'cockpit', label: '⚡ Cockpit' },
      { href: '/dashboard/home', key: 'home', label: '🏠 Home' },
    ],
  },
  {
    titulo: '💼 Comercial',
    itens: [
      { href: '/dashboard/leads', key: 'leads', label: '👥 Leads', area: 'leads' },
      { href: '/dashboard/leads/kanban', key: 'kanban', label: '📋 Funil (Kanban)', area: 'leads' },
      { href: '/dashboard/clientes', key: 'clientes', label: '🤝 Clientes' },
      { href: '/dashboard/propostas', key: 'propostas', label: '📊 Propostas', area: 'propostas' },
    ],
  },
  {
    titulo: '📣 Marketing',
    itens: [
      { href: '/dashboard/marketing', key: 'marketing', label: '📣 Campanhas', area: 'marketing' },
      { href: '/dashboard/marketing/blog', key: 'blog', label: '📝 Blog', area: 'marketing' },
      { href: '/dashboard/cadencia', key: 'cadencia', label: '🔄 Cadência', area: 'marketing' },
    ],
  },
  {
    titulo: '⚡ Operação',
    itens: [
      { href: '/dashboard/monitoramento', key: 'monitoramento', label: '⚡ Monitoramento', area: 'usinas' },
      { href: '/dashboard/usinas/kanban', key: 'usinas_kanban', label: '🏗️ Kanban de Obras', area: 'usinas' },
      { href: '/dashboard/pos-venda', key: 'pos_venda', label: '❤️ Pós-venda', area: 'usinas' },
      { href: '/dashboard/manutencao', key: 'manutencao', label: '🔧 Manutenção' },
    ],
  },
  {
    titulo: '💰 Financeiro',
    itens: [
      { href: '/dashboard/financeiro', key: 'financeiro', label: '💰 Financeiro', area: 'financeiro' },
    ],
  },
  {
    titulo: '⚙️ Configurações',
    itens: [
      { href: '/dashboard/usuarios', key: 'usuarios', label: '👤 Usuários', area: 'usuarios' },
    ],
  },
];

export function renderLayout(input: LayoutInput): string {
  const { active, title, body, scripts, dark, user } = input;

  // Mesmo gate do navItem antigo: área presente + usuário presente e sem
  // permissão → esconde. Sem área ou sem usuário → mostra.
  const itemVisivel = (it: SideItem): boolean =>
    !(it.area && user && !can(user, it.area, it.nivel ?? 'visualizar'));

  const linkClass = (key: string) =>
    active === key
      ? 'bg-amber-400 text-slate-900 font-semibold shadow-md'
      : 'text-sky-100 hover:bg-white/10 hover:text-white';

  // Monta cada setor recolhível (<details>). Setor só aparece se tiver ao
  // menos 1 item visível. O setor que contém o item ativo vem aberto.
  const sidebarHtml = SIDEBAR_SETORES.map((setor) => {
    const visiveis = setor.itens.filter(itemVisivel);
    if (visiveis.length === 0) return '';
    const contemAtivo = visiveis.some((it) => it.key === active);
    const linksHtml = visiveis
      .map(
        (it) =>
          `<a href="${it.href}" class="block px-3 py-2 rounded-lg text-sm transition ${linkClass(it.key)}">${it.label}</a>`,
      )
      .join('\n          ');
    return `<details ${contemAtivo ? 'open' : ''} class="group">
        <summary class="flex items-center justify-between cursor-pointer select-none px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide text-sky-300 hover:text-white">
          <span>${setor.titulo}</span>
          <span class="text-sky-400 transition-transform group-open:rotate-90">▸</span>
        </summary>
        <div class="mt-1 mb-2 flex flex-col gap-0.5 pl-1">
          ${linksHtml}
        </div>
      </details>`;
  })
    .filter(Boolean)
    .join('\n      ');

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
  /* Tema escuro ESCOPADO: aplicado só quando o caller pede (input.dark),
     hoje só a tela Painel de Triagem. Demais telas seguem claras até serem
     adaptadas (follow-up). Evita texto escuro sumindo em fundo escuro. */
  .ecosun-body-dark {
    background:
      radial-gradient(1200px 600px at 50% -10%, rgba(56, 189, 248, 0.10), transparent 60%),
      radial-gradient(ellipse at bottom right, rgba(245, 158, 11, 0.06), transparent 50%),
      #020617;
    color: #e2e8f0;
  }
  .accent-amber { border-left: 4px solid #f59e0b; }
  .accent-sky { border-left: 4px solid #0ea5e9; }
  .accent-emerald { border-left: 4px solid #10b981; }
  .accent-violet { border-left: 4px solid #8b5cf6; }
  .accent-rose { border-left: 4px solid #f43f5e; }
  .accent-indigo { border-left: 4px solid #6366f1; }
  /* Sidebar (menu lateral por setores). Em telas grandes fica fixo à
     esquerda; no mobile abre/fecha por um botão ☰ (alterna .sidebar-open). */
  .ecosun-sidebar {
    background: linear-gradient(180deg, #0c4a6e 0%, #075985 55%, #0369a1 100%);
    width: 240px;
  }
  details > summary { list-style: none; }
  details > summary::-webkit-details-marker { display: none; }
  @media (max-width: 1023px) {
    .ecosun-sidebar {
      position: fixed;
      top: 0; left: 0; bottom: 0;
      transform: translateX(-100%);
      transition: transform 0.25s ease;
      z-index: 40;
    }
    .sidebar-open .ecosun-sidebar { transform: translateX(0); }
    .sidebar-backdrop { display: none; }
    .sidebar-open .sidebar-backdrop {
      display: block;
      position: fixed; inset: 0;
      background: rgba(2, 6, 23, 0.5);
      z-index: 30;
    }
  }
</style>
</head>
<body class="ecosun-body${dark ? ' ecosun-body-dark bg-slate-950 text-slate-100' : ''}" id="dash-root">
  <div class="lg:flex min-h-screen">
    <!-- Backdrop do menu mobile (clicável pra fechar) -->
    <div class="sidebar-backdrop" onclick="document.getElementById('dash-root').classList.remove('sidebar-open')"></div>

    <!-- SIDEBAR: menu lateral por setores -->
    <aside class="ecosun-sidebar text-white shadow-xl flex flex-col flex-shrink-0 lg:sticky lg:top-0 lg:h-screen">
      <div class="px-4 py-5 border-b border-white/10 text-center">
        <a href="/dashboard/home" title="Ir para a Home" class="inline-block">
          <img src="${LOGO_ECOSUNPOWER_DARK_BASE64}" alt="EcoSunPower" class="h-12 w-auto mx-auto">
        </a>
        <div class="text-[11px] text-sky-200 mt-2 tracking-[0.18em] uppercase">Dashboard interno</div>
      </div>
      <nav class="flex-1 overflow-y-auto px-2 py-3 space-y-1">
      ${sidebarHtml}
      </nav>
      <div class="px-3 py-3 border-t border-white/10">
        <form action="/dashboard/logout" method="post">
          <button type="submit" class="w-full px-3 py-2 rounded-lg text-sky-200 hover:bg-white/10 hover:text-white transition text-sm text-left" title="Sair">🚪 Sair</button>
        </form>
      </div>
    </aside>

    <!-- COLUNA DE CONTEÚDO -->
    <div class="flex-1 min-w-0 flex flex-col">
      <!-- Barra superior só no mobile: botão ☰ -->
      <div class="lg:hidden ecosun-header text-white shadow-md flex items-center gap-3 px-4 py-3 sticky top-0 z-20">
        <button type="button" aria-label="Abrir menu"
          onclick="document.getElementById('dash-root').classList.toggle('sidebar-open')"
          class="text-2xl leading-none px-2 py-1 rounded-lg hover:bg-white/10">☰</button>
        <span class="font-semibold tracking-tight">EcoSunPower</span>
      </div>

      <main class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 relative z-0">
        ${body}
      </main>

      <footer class="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 text-xs text-slate-500 text-center border-t border-slate-200 mt-8">
        <div class="flex items-center justify-center gap-2 flex-wrap">
          <span>☀</span>
          <span>EcoSunPower Energia Solar</span>
          <span class="text-slate-300 hidden sm:inline">·</span>
          <span>CNPJ 33.020.459/0001-06</span>
          <span class="text-slate-300 hidden sm:inline">·</span>
          <span>Brasília-DF</span>
        </div>
      </footer>
    </div>
  </div>

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
      <h1 class="text-3xl font-bold text-white tracking-tight">${escapeHtml(empresa().nomeFantasia)}</h1>
      <p class="text-sky-200 text-sm mt-2">Dashboard interno · Acesso restrito</p>
    </div>

    <div class="bg-white rounded-2xl shadow-2xl p-8">
      ${erro}
      <form action="/dashboard/login" method="post" class="space-y-5">
        ${next ? `<input type="hidden" name="next" value="${escapeHtml(next)}">` : ''}

        <div>
          <label for="login" class="block text-sm font-semibold text-slate-700 mb-2">
            👤 Login
          </label>
          <input
            id="login"
            name="login"
            type="text"
            required
            autocomplete="username"
            autofocus
            class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 transition"
            placeholder="seu usuário">
        </div>

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
      ${card('Em qualificação', String(kpis.leadsQualificando), `${escapeHtml(empresa().nomeAtendente)} ativa neles`, 'violet', 'text-violet-700')}
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

export function renderPropostasPage(input: PropostasPageInput, user?: DashUser): string {
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
        <td class="px-4 py-3 text-sm text-slate-600">
          ${p.acessos > 0
            ? `<a href="/dashboard/propostas/${escapeHtml(p.slug)}/visualizacoes" class="text-sky-700 hover:underline">${p.acessos}x</a>`
            : '<span class="text-slate-400">0x</span>'}
          ${p.ultimo_acesso_at ? `<div class="text-xs text-slate-500">${relativeTime(p.ultimo_acesso_at)}</div>` : ''}
        </td>
        <td class="px-4 py-3 text-sm text-right">
          ${p.revoked
            ? '<span class="text-xs text-red-600">revogada</span>'
            : `<div class="flex items-center justify-end gap-2">
                 <a href="/dashboard/propostas/${escapeHtml(p.slug)}/preview" class="inline-flex items-center px-3 py-1 rounded-md bg-amber-100 text-amber-700 hover:bg-amber-200 text-xs font-medium">✏️ Reabrir</a>
                 <a href="${url}" target="_blank" class="inline-flex items-center px-3 py-1 rounded-md bg-sky-100 text-sky-700 hover:bg-sky-200 text-xs font-medium">Abrir →</a>
               </div>`
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

  return renderLayout({ active: 'propostas', title: 'Propostas', body, user });
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
  abb: 'ABB / FIMER',
};

// Logos oficiais hospedadas no site EcoSunPower (public/logos/).
// Mesma fonte usada na pagina pública pra consistencia visual.
const MARCAS_LOGO_URL: Record<string, string> = {
  solaredge: 'https://ecosunpower.eng.br/logos/solaredge.svg',
  sungrow:   'https://ecosunpower.eng.br/logos/sungrow.png',
  deye:      'https://ecosunpower.eng.br/logos/deye.png',
  hoymiles:  'https://ecosunpower.eng.br/logos/hoymiles.png',
  goodwe:    'https://ecosunpower.eng.br/logos/goodwe.png',
  huawei:    'https://ecosunpower.eng.br/logos/huawei.png',
  foxess:    'https://ecosunpower.eng.br/logos/foxess.png',
  nep:       'https://ecosunpower.eng.br/logos/nep.png',
  abb:       'https://ecosunpower.eng.br/logos/abb.png',
};

// Gera badge visual da marca usando as logos oficiais do site.
// Compact = só a logo (pra header). Default = logo + nome ao lado (pra tabela).
function marcaBadge(marca: string, options: { compact?: boolean; size?: number } = {}): string {
  const url = MARCAS_LOGO_URL[marca];
  const label = MARCAS_LABEL[marca] ?? marca;
  const tam = options.size ?? (options.compact ? 32 : 22);

  if (!url) {
    // Fallback texto quando nao tem logo (marca nova, etc)
    return `<span class="inline-block px-2 py-1 rounded text-xs bg-slate-100 text-slate-700 font-medium">${escapeHtml(label)}</span>`;
  }

  const img = `<img src="${url}" alt="${escapeHtml(label)}" loading="lazy" style="height:${tam}px;width:auto;max-width:${tam * 3}px;object-fit:contain;display:inline-block;vertical-align:middle">`;

  if (options.compact) {
    return `<span class="inline-flex items-center justify-center bg-white rounded-md border border-slate-200 px-2 py-1" title="${escapeHtml(label)}">${img}</span>`;
  }
  return `<span class="inline-flex items-center gap-2 px-2 py-1 rounded-md bg-white border border-slate-200">${img}<span class="text-xs font-medium text-slate-800">${escapeHtml(label)}</span></span>`;
}

export interface KPIsAbordagemMes {
  enviadas: number;
  resolvidoSozinhoCount: number;
  limpezasFechadasCount: number;
  semRespostaCount: number;
  resolvidoSozinhoPct: number;
}

export function renderMonitoramentoPage(
  rows: SistemaMonitorRow[],
  q: { q?: string; marca?: string; cidade?: string; status?: string; ord?: string },
  alertasResumo?: { urgente: number; aviso: number; info: number; total: number },
  sparkline7d?: Array<{ dia: string; enviados: number }>,
  kpisEva?: KPIsAbordagemMes,
  user?: DashUser,
): string {
  const ativos = rows.filter((r) => r.ativo);
  const totalKwp = ativos.reduce((s, r) => s + (r.potencia_kwp ?? 0), 0);
  const totalHoje = rows.reduce((s, r) => s + (r.geracao_hoje_kwh ?? 0), 0);
  const totalMes = rows.reduce((s, r) => s + r.geracao_mes_kwh, 0);
  const okCount = ativos.filter((r) => r.nivel === 'ok' || r.nivel === 'info').length;
  const marcas = new Set(rows.map((r) => r.marca_inversor)).size;
  const problemas = rows.filter((r) => r.nivel === 'urgente' || r.nivel === 'aviso');

  const kpi = (t: string, v: string, sub: string, cor: string) => `
    <div class="bg-slate-800/60 backdrop-blur rounded-xl border border-slate-700 p-5 shadow-lg">
      <div class="text-xs uppercase tracking-wider text-slate-400 font-semibold">${escapeHtml(t)}</div>
      <div class="text-3xl font-bold ${cor} mt-2">${escapeHtml(v)}</div>
      <div class="text-xs text-slate-500 mt-1">${escapeHtml(sub)}</div>
    </div>`;

  const saudeCor = okCount === ativos.length ? 'text-emerald-400'
    : problemas.some((p) => p.nivel === 'urgente') ? 'text-rose-400' : 'text-amber-400';

  const cardProblema = (r: SistemaMonitorRow) => {
    const cor = r.nivel === 'urgente' ? 'border-rose-500/60 bg-rose-500/10' : 'border-amber-500/60 bg-amber-500/10';
    return `
    <div class="rounded-xl border ${cor} p-4 flex flex-col gap-2">
      <div class="flex items-center justify-between gap-2">
        <a href="/dashboard/monitoramento/${escapeHtml(r.id)}" class="font-semibold text-sky-300 hover:underline">${escapeHtml(r.apelido)}</a>
        ${marcaBadge(r.marca_inversor)}
      </div>
      <div class="text-xs text-slate-400">${escapeHtml([r.cidade, r.uf].filter(Boolean).join('/') || '—')}</div>
      <div class="text-sm ${r.nivel === 'urgente' ? 'text-rose-300' : 'text-amber-300'}">${escapeHtml(r.alertaTexto ?? '')}</div>
      <div class="text-xs text-slate-500">⏱ ${escapeHtml(r.garantiaIdade)} · garantia EcoSun: ${escapeHtml(r.garantiaEcosun)}</div>
      <div class="flex flex-wrap gap-2 mt-1">
        <form action="/dashboard/monitoramento/${escapeHtml(r.id)}/sync" method="post"><button class="px-3 py-1.5 rounded-md bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold">🔄 Sincronizar</button></form>
        <a href="/dashboard/monitoramento/${escapeHtml(r.id)}" class="px-3 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs font-semibold">🔎 Detalhe</a>
        <a href="/dashboard/monitoramento/${escapeHtml(r.id)}/relatorio" class="px-3 py-1.5 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold">📄 Gerar relatório</a>
        <form action="/dashboard/monitoramento/${escapeHtml(r.id)}/excluir" method="post" onsubmit="return confirm('EXCLUIR esta usina de vez? Isso apaga todo o histórico de geração. Esta ação não tem volta.') && confirm('Confirma de novo: excluir esta usina permanentemente?')"><button class="px-3 py-1.5 rounded-md bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold">🗑 Excluir</button></form>
      </div>
    </div>`;
  };

  const sincOk = (r: SistemaMonitorRow) => r.ultima_sincronizacao
    && (Date.now() - new Date(r.ultima_sincronizacao).getTime() < 36 * 60 * 60 * 1000);
  const statusPill = (r: SistemaMonitorRow) => !r.ativo
    ? '<span class="px-2 py-1 rounded text-xs bg-slate-700 text-slate-400">⏸ Pausado</span>'
    : r.nivel === 'urgente'
      ? '<span class="px-2 py-1 rounded text-xs bg-rose-500/20 text-rose-300">⚠️ Urgente</span>'
      : r.nivel === 'aviso'
        ? '<span class="px-2 py-1 rounded text-xs bg-amber-500/20 text-amber-300">⚠️ Atenção</span>'
        : r.nivel === 'info'
          ? '<span class="px-2 py-1 rounded text-xs bg-sky-500/20 text-sky-300">🌟 Acima</span>'
          : sincOk(r)
            ? '<span class="px-2 py-1 rounded text-xs bg-emerald-500/20 text-emerald-300">✅ OK</span>'
            : '<span class="px-2 py-1 rounded text-xs bg-amber-500/20 text-amber-300">⏳ Aguardando</span>';

  const linha = (r: SistemaMonitorRow) => `
    <tr class="hover:bg-slate-800/50 cursor-pointer" onclick="window.location='/dashboard/monitoramento/${escapeHtml(r.id)}'">
      <td class="px-4 py-3 text-sm">
        <a href="/dashboard/monitoramento/${escapeHtml(r.id)}" class="font-medium text-sky-300 hover:underline">${escapeHtml(r.apelido)}</a>
        <div class="text-xs text-slate-500">${escapeHtml([r.cidade, r.uf].filter(Boolean).join('/') || '—')}</div>
      </td>
      <td class="px-4 py-3 text-sm">${marcaBadge(r.marca_inversor)}</td>
      <td class="px-4 py-3 text-sm text-slate-300">${r.potencia_kwp ? `${r.potencia_kwp.toFixed(2)} kWp` : '—'}</td>
      <td class="px-4 py-3 text-sm text-amber-300 font-bold">${r.geracao_hoje_kwh !== null ? `${r.geracao_hoje_kwh.toFixed(1)} kWh` : '—'}</td>
      <td class="px-4 py-3 text-sm text-emerald-300">${r.geracao_mes_kwh > 0 ? `${r.geracao_mes_kwh.toFixed(0)} kWh` : '—'}</td>
      <td class="px-4 py-3 text-sm">${statusPill(r)}</td>
      <td class="px-4 py-3 text-xs text-slate-400">⏱ ${escapeHtml(r.garantiaIdade)}</td>
      <td class="px-4 py-3 text-right whitespace-nowrap" onclick="event.stopPropagation()">
        <form action="/dashboard/monitoramento/${escapeHtml(r.id)}/excluir" method="post" class="inline" onsubmit="return confirm('EXCLUIR esta usina de vez? Apaga todo o histórico. Sem volta.') && confirm('Confirma de novo: excluir esta usina permanentemente?')">
          <button class="px-2.5 py-1.5 rounded-md bg-rose-700 hover:bg-rose-800 text-white text-xs">🗑</button>
        </form>
      </td>
    </tr>`;

  const opt = (v: string, label: string, sel?: string) =>
    `<option value="${escapeHtml(v)}" ${sel === v ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  const marcasUnicas = [...new Set(rows.map((r) => r.marca_inversor))].sort();
  const cidadesUnicas = [...new Set(rows.map((r) => r.cidade).filter(Boolean) as string[])].sort();

  const body = `
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-slate-100">⚡ Painel de Triagem — Usinas</h1>
      <p class="text-slate-400 text-sm">Primeiro o que precisa de ação. Depois a carteira inteira, filtrável.</p>
    </div>

    <section class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
      ${kpi('Usinas ativas', String(ativos.length), `${totalKwp.toFixed(1)} kWp total`, 'text-amber-400')}
      ${kpi('Geração hoje', `${totalHoje.toFixed(1)} kWh`, 'somatório', 'text-sky-300')}
      ${kpi('Geração mês', `${totalMes.toFixed(0)} kWh`, 'mês corrente', 'text-emerald-300')}
      ${kpi('Saúde da frota', `${okCount}/${ativos.length}`, 'usinas OK', saudeCor)}
      ${kpi('Marcas', String(marcas), 'integradas', 'text-violet-300')}
    </section>

    ${alertasResumo ? `
    <section class="mb-8">
      <h2 class="text-sm uppercase tracking-wider text-slate-400 font-semibold mb-3">🔔 Alertas proativos</h2>
      <div class="grid grid-cols-3 gap-4">
        <div class="rounded-xl border border-rose-600/40 bg-rose-500/10 p-4">
          <div class="text-xs text-rose-300/70 font-semibold uppercase">Urgente</div>
          <div class="text-3xl font-bold text-rose-300 mt-1">${alertasResumo.urgente}</div>
        </div>
        <div class="rounded-xl border border-amber-600/40 bg-amber-500/10 p-4">
          <div class="text-xs text-amber-300/70 font-semibold uppercase">Aviso</div>
          <div class="text-3xl font-bold text-amber-300 mt-1">${alertasResumo.aviso}</div>
        </div>
        <div class="rounded-xl border border-emerald-600/40 bg-emerald-500/10 p-4">
          <div class="text-xs text-emerald-300/70 font-semibold uppercase">Bombando</div>
          <div class="text-3xl font-bold text-emerald-300 mt-1">${alertasResumo.info}</div>
        </div>
      </div>
      ${sparkline7d && sparkline7d.length ? `
      <div class="mt-3 text-xs text-slate-500">
        Enviados nos últimos 7d: <span class="text-slate-300 font-mono">${sparkline7d.map((d) => d.enviados).join(' · ')}</span>
        <span class="text-slate-600 ml-2">(${sparkline7d.map((d) => d.dia.slice(5)).join(' · ')})</span>
      </div>` : ''}
    </section>` : ''}

    ${kpisEva ? `
    <section class="mb-8">
      <h2 class="text-sm uppercase tracking-wider text-slate-400 font-semibold mb-3">🤖 Eva no mês</h2>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="rounded-xl border border-sky-600/40 bg-sky-500/10 p-4">
          <div class="text-xs text-sky-300/70 font-semibold uppercase">Abordagens enviadas</div>
          <div class="text-3xl font-bold text-sky-300 mt-1">${escapeHtml(String(kpisEva.enviadas))}</div>
        </div>
        <div class="rounded-xl border border-emerald-600/40 bg-emerald-500/10 p-4">
          <div class="text-xs text-emerald-300/70 font-semibold uppercase">Resolvido sozinho</div>
          <div class="text-3xl font-bold text-emerald-300 mt-1">${escapeHtml(String(kpisEva.resolvidoSozinhoPct))}%</div>
          <div class="text-xs text-emerald-400/60 mt-1">${escapeHtml(String(kpisEva.resolvidoSozinhoCount))} ocorrências</div>
        </div>
        <div class="rounded-xl border border-violet-600/40 bg-violet-500/10 p-4">
          <div class="text-xs text-violet-300/70 font-semibold uppercase">Limpezas fechadas</div>
          <div class="text-3xl font-bold text-violet-300 mt-1">${escapeHtml(String(kpisEva.limpezasFechadasCount))}</div>
        </div>
        <div class="rounded-xl border border-slate-600/40 bg-slate-700/40 p-4">
          <div class="text-xs text-slate-400/70 font-semibold uppercase">Sem resposta</div>
          <div class="text-3xl font-bold text-slate-300 mt-1">${escapeHtml(String(kpisEva.semRespostaCount))}</div>
        </div>
      </div>
    </section>` : ''}

    <section class="mb-8">
      <h2 class="text-lg font-bold text-slate-200 mb-3">⚠️ Precisa de ação ${problemas.length ? `<span class="text-rose-400">(${problemas.length})</span>` : ''}</h2>
      ${problemas.length === 0
        ? '<div class="rounded-xl border border-emerald-600/40 bg-emerald-500/10 p-6 text-emerald-300 text-center font-medium">✅ Tudo certo — nenhuma usina precisando de ação agora.</div>'
        : `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">${problemas.map(cardProblema).join('')}</div>`}
    </section>

    <form method="get" action="/dashboard/monitoramento" class="mb-4 flex flex-wrap gap-2 items-center">
      <input name="q" value="${escapeHtml(q.q ?? '')}" placeholder="🔎 cliente ou cidade" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm">
      <select name="marca" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm">${opt('', 'Todas as marcas', q.marca)}${marcasUnicas.map((m) => opt(m, m, q.marca)).join('')}</select>
      <select name="cidade" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm">${opt('', 'Todas as cidades', q.cidade)}${cidadesUnicas.map((c) => opt(c, c, q.cidade)).join('')}</select>
      <select name="status" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm">${opt('', 'Todos os status', q.status)}${['urgente', 'aviso', 'info', 'ok'].map((s) => opt(s, s, q.status)).join('')}</select>
      <select name="ord" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm">${opt('severidade', 'Ordenar: severidade', q.ord)}${opt('geracao_desc', 'Ordenar: geração ↓', q.ord)}${opt('nome', 'Ordenar: nome', q.ord)}</select>
      <button class="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold">Filtrar</button>
      <a href="/dashboard/monitoramento" class="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm">Limpar</a>
      <span class="ml-auto flex gap-2">
        <a href="/dashboard/monitoramento/importar" class="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold">📥 Importar</a>
        ${rows.length ? `<form action="/dashboard/monitoramento/sync-todos" method="post"><button class="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold">🔄 Atualizar todas</button></form>` : ''}
      </span>
    </form>

    ${rows.length === 0 ? `
    <section class="bg-slate-800/60 rounded-xl border border-slate-700 p-8 text-center">
      <div class="text-5xl mb-3">⚡</div>
      <div class="text-slate-200 font-medium mb-2">Nenhum sistema cadastrado ainda.</div>
      <a href="/dashboard/monitoramento/importar" class="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold">📥 Importar agora</a>
    </section>` : `
    <section class="bg-slate-800/60 rounded-xl border border-slate-700 overflow-x-auto">
      <table class="w-full min-w-[820px]">
        <thead class="bg-slate-900/80 border-b border-slate-700">
          <tr class="text-left text-xs uppercase tracking-wider text-slate-400">
            <th class="px-4 py-3 font-semibold">Sistema</th><th class="px-4 py-3 font-semibold">Marca</th>
            <th class="px-4 py-3 font-semibold">Potência</th><th class="px-4 py-3 font-semibold">Hoje</th>
            <th class="px-4 py-3 font-semibold">Mês</th><th class="px-4 py-3 font-semibold">Status</th>
            <th class="px-4 py-3 font-semibold">Idade</th><th class="px-4 py-3 font-semibold text-right">Excluir</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800">${rows.map(linha).join('')}</tbody>
      </table>
    </section>
    <div class="mt-4 text-xs text-slate-500 text-center">💡 Sincronização automática a cada <strong>15 min</strong>. Página atualiza sozinha a cada <strong>30s</strong>.</div>`}
  `;
  const scripts = `<script>setTimeout(() => location.reload(), 30000);</script>`;
  return renderLayout({ active: 'monitoramento', title: 'Monitoramento', body, scripts, dark: true, user });
}

// =========================================================================
// DETALHE DE 1 SISTEMA — analise completa de uma usina
// =========================================================================

export interface AbordagemTimelineRow {
  created_at: string;
  tipo: string;
  status: string;
  desfecho: string | null;
  mensagem_enviada: string | null;
  resposta_resumo: string | null;
  nota_junior: string | null;
}

export function renderDetalheSistemaPage(
  d: DetalheSistema,
  dono?: { id: string; name: string | null } | null,
  timelineAbordagens?: AbordagemTimelineRow[],
  prontuarioHtml?: string,
): string {
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
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  // Serie do periodo selecionado (diaria ou mensal dependendo do range)
  const labelsPeriodo = d.serie.map((p) => {
    if (d.periodo.granularidade === 'mensal') {
      const [y, m] = p.data.split('-');
      return `${meses[parseInt(m, 10) - 1]}/${y.slice(2)}`;
    }
    const [, mm, dia] = p.data.split('-');
    return `${dia}/${mm}`;
  });
  const valoresPeriodo = d.serie.map((p) => Number(p.kwh.toFixed(1)));
  const esperadoPeriodo = d.serie.map((p) => Number(p.esperado.toFixed(1)));

  // Serie mensal completa (overview de TODA a vida do sistema)
  const labelsMensal = d.serieMensalCompleta.map((p) => {
    const [y, m] = p.mes.split('-');
    return `${meses[parseInt(m, 10) - 1]}/${y.slice(2)}`;
  });
  const valoresMensal = d.serieMensalCompleta.map((p) => Math.round(p.kwh));
  const esperadoMensal = d.serieMensalCompleta.map((p) => Math.round(p.esperado));

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
          ${marcaBadge(s.marca_inversor, { compact: true, size: 48 })}
          <div>
            <h1 class="text-2xl font-bold text-slate-900">${escapeHtml(s.apelido)}</h1>
            <div class="text-sm mt-1">
              ${dono
                ? `<a href="/dashboard/clientes/${escapeHtml(dono.id)}" class="text-sky-600 hover:underline">👤 ${escapeHtml(dono.name ?? 'cliente')}</a>`
                : `<a href="/dashboard/monitoramento/${escapeHtml(s.id)}/editar" class="text-amber-600 hover:underline">⚠️ Sem proprietário — definir</a>`}
            </div>
            <div class="text-slate-600 text-sm mt-1 flex flex-wrap gap-3 items-center">
              <span><span class="text-slate-400">📍</span> ${escapeHtml(localizacao)}</span>
              <span><span class="text-slate-400">⚡</span> ${s.potencia_kwp ? `${Number(s.potencia_kwp).toFixed(2)} kWp` : 'sem potência'}</span>
              ${s.data_instalacao ? `<span><span class="text-slate-400">📅</span> Instalado ${formatDate(s.data_instalacao)}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <a href="/dashboard/monitoramento/${escapeHtml(s.id)}/editar" class="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm rounded-lg font-medium">✏️ Editar</a>
          <form action="/dashboard/monitoramento/${escapeHtml(s.id)}/sync" method="post" class="inline">
            <button class="px-4 py-2 bg-sky-700 hover:bg-sky-800 text-white text-sm rounded-lg font-medium">🔄 Atualizar</button>
          </form>
          <form action="/dashboard/monitoramento/${escapeHtml(s.id)}/backfill" method="post" class="inline" onsubmit="return confirm('Vai puxar TODO o histórico desde a instalação do sistema (até 10 anos se não tiver data cadastrada). Pode demorar 30s-2min dependendo do volume. Continuar?')">
            <button class="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm rounded-lg font-medium">📅 Carregar histórico completo</button>
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

    <section class="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-sm font-semibold text-slate-700">📅 Período:</span>
        ${(['30d', '90d', '6m', '1a', '2a', '5a', 'tudo'] as const).map((p) => {
          const labels: Record<string, string> = { '30d': '30 dias', '90d': '90 dias', '6m': '6 meses', '1a': '1 ano', '2a': '2 anos', '5a': '5 anos', 'tudo': 'Tudo' };
          const ativo = d.periodo.presetAtual === p;
          return `<a href="/dashboard/monitoramento/${escapeHtml(s.id)}?preset=${p}" class="px-3 py-1.5 rounded-md text-sm transition ${ativo ? 'bg-sky-700 text-white font-semibold' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}">${labels[p]}</a>`;
        }).join('')}
        <form method="get" action="/dashboard/monitoramento/${escapeHtml(s.id)}" class="flex flex-wrap items-center gap-2 ml-auto">
          <input type="date" name="inicio" value="${d.periodo.inicio}" class="px-2 py-1 border border-slate-300 rounded-md text-sm">
          <span class="text-slate-500 text-sm">até</span>
          <input type="date" name="fim" value="${d.periodo.fim}" class="px-2 py-1 border border-slate-300 rounded-md text-sm">
          <button class="px-3 py-1.5 rounded-md text-sm bg-amber-500 hover:bg-amber-600 text-white font-medium">Aplicar</button>
        </form>
      </div>
    </section>

    <section class="bg-white rounded-xl shadow-md border border-slate-200 p-6 mb-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-base font-semibold text-slate-900">Geração — ${escapeHtml(d.periodo.label)}</h2>
        <span class="text-xs text-slate-500">${d.periodo.granularidade === 'diaria' ? 'visão diária' : 'visão mensal'}</span>
      </div>
      <div style="height:300px;position:relative">
        <canvas id="graficoPeriodo"></canvas>
      </div>
    </section>

    ${d.serieMensalCompleta.length > 1 ? `
    <section class="bg-white rounded-xl shadow-md border border-slate-200 p-6 mb-6">
      <h2 class="text-base font-semibold text-slate-900 mb-4">📊 Histórico mensal completo</h2>
      <div style="height:300px;position:relative">
        <canvas id="graficoMensal"></canvas>
      </div>
      <p class="text-xs text-slate-500 mt-2">Todos os meses desde o início do tracking. Use pra ver sazonalidade e degradação ano sobre ano.</p>
    </section>` : ''}

    ${(() => {
      const TIPO_EMOJI: Record<string, string> = {
        parabens: '☀️',
        depoimento: '⭐',
        queda: '📉',
        offline: '🔌',
      };
      const DESFECHO_LABEL: Record<string, string> = {
        resolvido_sozinho: 'resolvido sozinho ✅',
        limpeza_fechada: 'limpeza fechada 🧽',
        visita_agendada: 'visita agendada 🚗',
        transferido_junior: 'transferido 📞',
        sem_resposta: 'sem resposta 😶',
        descartada_junior: 'descartada —',
        em_andamento: 'em andamento 🔄',
      };
      const NOTA_LABEL: Record<string, string> = { boa: '👍', errou: '👎' };

      if (!timelineAbordagens || timelineAbordagens.length === 0) {
        return `
    <section class="bg-white rounded-xl shadow-md border border-slate-200 p-6 mb-6">
      <h2 class="text-base font-semibold text-slate-900 mb-3">🤖 Abordagens da Eva</h2>
      <div class="text-sm text-slate-500">Nenhuma abordagem ainda.</div>
    </section>`;
      }

      const linhas = timelineAbordagens.map((a) => {
        const [, mm, dd] = a.created_at.slice(0, 10).split('-');
        const data = `${dd}/${mm}`;
        const emoji = TIPO_EMOJI[a.tipo] ?? '🤖';
        const primeiraLinha = a.mensagem_enviada
          ? escapeHtml(a.mensagem_enviada.split('\n')[0].slice(0, 80) + (a.mensagem_enviada.length > 80 ? '…' : ''))
          : '<span class="text-slate-400">—</span>';
        const desfecho = a.desfecho ? escapeHtml(DESFECHO_LABEL[a.desfecho] ?? a.desfecho) : '<span class="text-slate-400">—</span>';
        const nota = a.nota_junior ? escapeHtml(NOTA_LABEL[a.nota_junior] ?? '') : '';
        return `<tr class="border-t border-slate-100">
          <td class="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">${escapeHtml(data)}</td>
          <td class="px-3 py-2 text-sm">${emoji}</td>
          <td class="px-3 py-2 text-sm text-slate-700">${primeiraLinha}</td>
          <td class="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">${desfecho}</td>
          <td class="px-3 py-2 text-xs whitespace-nowrap">${nota}</td>
        </tr>`;
      }).join('');

      return `
    <section class="bg-white rounded-xl shadow-md border border-slate-200 p-6 mb-6">
      <h2 class="text-base font-semibold text-slate-900 mb-3">🤖 Abordagens da Eva</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs uppercase tracking-wider text-slate-400">
              <th class="px-3 py-2 font-semibold">Data</th>
              <th class="px-3 py-2 font-semibold">Tipo</th>
              <th class="px-3 py-2 font-semibold">Mensagem</th>
              <th class="px-3 py-2 font-semibold">Desfecho</th>
              <th class="px-3 py-2 font-semibold">Nota</th>
            </tr>
          </thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>
    </section>`;
    })()}

    ${s.ultimo_erro ? `
    <section class="bg-rose-50 border border-rose-200 rounded-xl p-4 mb-6 text-sm">
      <div class="font-semibold text-rose-800 mb-1">⚠️ Último erro de sincronização:</div>
      <div class="text-rose-700 font-mono text-xs">${escapeHtml(s.ultimo_erro)}</div>
    </section>` : ''}

    ${prontuarioHtml ? `
    <section class="bg-white rounded-xl shadow-md border border-slate-200 p-6 mb-6">
      <h2 class="text-base font-semibold text-slate-900 mb-4">🔧 Prontuário de manutenção</h2>
      ${prontuarioHtml}
    </section>` : ''}
  `;

  const scripts = `
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<script>
  // Auto-refresh 30s pra mostrar dado mais fresco do nosso banco.
  // NAO recarrega se cliente clicou em algum filtro/preset (preserva URL).
  setTimeout(() => location.reload(), 30000);

  const ctxPeriodo = document.getElementById('graficoPeriodo');
  if (ctxPeriodo) {
    new Chart(ctxPeriodo, {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(labelsPeriodo)},
        datasets: [
          {
            label: 'Real (kWh)',
            data: ${JSON.stringify(valoresPeriodo)},
            backgroundColor: '#f59e0b',
            borderRadius: 4,
            order: 2,
          },
          {
            label: 'Esperado (kWh)',
            data: ${JSON.stringify(esperadoPeriodo)},
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

export function renderEditarSistemaPage(
  s: import('../monitoring/types.js').SistemaCliente,
  dono?: { id: string; name: string | null; phone: string | null } | null,
): string {
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
        <h2 class="font-semibold text-slate-900 mb-4">👤 Proprietário</h2>
        ${dono ? `
          <div class="flex items-center justify-between gap-3 mb-4 p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div>
              <div class="font-semibold text-slate-800">${escapeHtml(dono.name ?? '(sem nome)')}</div>
              <div class="text-xs text-slate-500">${escapeHtml(dono.phone ?? '')}</div>
              <a href="/dashboard/clientes/${escapeHtml(dono.id)}" class="text-xs text-sky-600 hover:underline">ver cliente →</a>
            </div>
            <button type="submit" name="desvincular" value="1" class="px-3 py-1.5 rounded-lg border-2 border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold">Desvincular</button>
          </div>
          <p class="text-sm text-slate-600 mb-2">Trocar de proprietário? Busque outro cliente abaixo.</p>
        ` : `
          <p class="text-sm text-slate-600 mb-2">Esta usina ainda não tem proprietário. Vincule um cliente:</p>
        `}
        ${renderClienteSelector({ idPrefix: 'prop', dark: false })}
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
      <form action="/dashboard/monitoramento/importar" method="post" class="space-y-4" id="form-importar">
        <div>
          <label for="marca" class="block text-sm font-semibold text-slate-700 mb-2">Marca do inversor</label>
          <select name="marca" id="marca" required
                  onchange="['solaredge','deye','nep','abb','foxess'].forEach(function(m){var el=document.getElementById('campos-'+m);if(!el)return;var ativo=document.getElementById('marca').value===m;el.style.display=ativo?'block':'none';el.disabled=!ativo;});"
                  class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition">
            <option value="solaredge">SolarEdge</option>
            <option value="deye">Deye Cloud</option>
            <option value="nep">NEP (microinversores BDM)</option>
            <option value="abb">ABB / FIMER Aurora Vision</option>
            <option value="foxess">FoxESS (micro Q1 / inversores)</option>
            <option value="sungrow" disabled>Sungrow (em breve)</option>
            <option value="hoymiles" disabled>Hoymiles (em breve)</option>
            <option value="goodwe" disabled>GoodWe (em breve)</option>
            <option value="huawei" disabled>Huawei (em breve)</option>
          </select>
        </div>

        <fieldset id="campos-solaredge" class="border-0 p-0 m-0">
          <label for="api_key" class="block text-sm font-semibold text-slate-700 mb-2">API Key da conta SolarEdge</label>
          <input
            id="api_key"
            name="api_key"
            type="text"
            placeholder="cola aqui a API key gerada no painel SolarEdge"
            class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition font-mono text-sm">
          <p class="text-xs text-slate-500 mt-2">
            Pega em: monitoring.solaredge.com → Admin → Site Access → API Access.
          </p>
        </fieldset>

        <fieldset id="campos-deye" style="display:none" disabled class="border-0 p-0 m-0">
          <div class="space-y-3">
            <div>
              <label class="block text-sm font-semibold text-slate-700 mb-1">Data Center</label>
              <select name="dataCenter" class="w-full px-4 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500">
                <option value="us1">US1 (Americas — recomendado pra Brasil)</option>
                <option value="eu1">EU1 (Europa)</option>
              </select>
              <p class="text-xs text-slate-500 mt-1">Mesmo que o portal mostre "AMEA", a API real fica em US1 ou EU1.</p>
            </div>
            <div>
              <label class="block text-sm font-semibold text-slate-700 mb-1">AppId</label>
              <input name="appId" type="text" placeholder="Ex: 202601151929002"
                     class="w-full px-4 py-2 border-2 border-slate-200 rounded-xl font-mono text-sm focus:outline-none focus:border-amber-500">
            </div>
            <div>
              <label class="block text-sm font-semibold text-slate-700 mb-1">AppSecret</label>
              <input name="appSecret" type="password" placeholder="cola o AppSecret do portal Deye"
                     class="w-full px-4 py-2 border-2 border-slate-200 rounded-xl font-mono text-sm focus:outline-none focus:border-amber-500">
            </div>
            <div>
              <label class="block text-sm font-semibold text-slate-700 mb-1">E-mail da conta master Deye</label>
              <input name="email" type="email" placeholder="seu email Deye"
                     class="w-full px-4 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500">
            </div>
            <div>
              <label class="block text-sm font-semibold text-slate-700 mb-1">Senha da conta Deye</label>
              <input name="password" type="password" placeholder="senha Deye"
                     class="w-full px-4 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500">
            </div>
            <div class="md:col-span-2">
              <label class="block text-sm font-semibold text-slate-700 mb-1">
                Company ID <span class="text-slate-400 font-normal">(opcional)</span>
              </label>
              <div class="flex gap-2">
                <input id="deye-companyId" name="companyId" type="text" placeholder="vazio = perfil pessoal · clique 🔍 pra listar empresas"
                       class="flex-1 px-4 py-2 border-2 border-slate-200 rounded-xl font-mono text-sm focus:outline-none focus:border-amber-500">
                <button type="button" id="deye-buscar-empresas"
                        class="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold whitespace-nowrap">
                  🔍 Buscar empresas
                </button>
              </div>
              <div id="deye-empresas-result" class="mt-2 text-xs"></div>
            </div>
          </div>
          <div class="mt-3 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs">
            <strong>📋 Onde achar:</strong> developer.deyecloud.com → Application →
            AppId visível, AppSecret oculto (clica no olho). E-mail/senha são da conta
            Deye master que vê todas as plantas. Company ID aparece no app/portal Deye
            ao trocar entre Personal e empresas (super admin).
          </div>
        </fieldset>

        <fieldset id="campos-nep" style="display:none" disabled class="border-0 p-0 m-0">
          <div>
            <label for="nep_jwt" class="block text-sm font-semibold text-slate-700 mb-2">Token de acesso (JWT) da conta NEPViewer</label>
            <textarea
              id="nep_jwt"
              name="jwt"
              rows="3"
              placeholder="cola aqui o JWT capturado no localStorage do NEPViewer"
              class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition font-mono text-xs"></textarea>
          </div>

          <div class="mt-3 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs">
            <strong>📋 Como pegar o JWT (1 minuto):</strong>
            <ol class="list-decimal ml-5 mt-2 space-y-1">
              <li>Acessa <a href="https://user.nepviewer.com" target="_blank" rel="noopener" class="underline font-semibold">user.nepviewer.com</a> e faz login (conta de instalador)</li>
              <li>Aperta <kbd class="px-1.5 py-0.5 bg-white border border-amber-300 rounded font-mono text-[10px]">F12</kbd> → aba <strong>Console</strong></li>
              <li>Cola e executa:
                <pre class="mt-1 px-2 py-1.5 bg-white border border-amber-300 rounded text-[11px] overflow-x-auto"><code>copy(JSON.parse(localStorage.getItem('userInfo')).token)</code></pre>
              </li>
              <li>Volta aqui, <kbd class="px-1.5 py-0.5 bg-white border border-amber-300 rounded font-mono text-[10px]">Ctrl+V</kbd> no campo acima</li>
            </ol>
          </div>

          <div class="mt-3 px-4 py-3 rounded-lg bg-sky-50 border border-sky-200 text-sky-900 text-xs">
            ⏱ <strong>Validade:</strong> o JWT dura ~30 dias. Quando expirar, o sistema vai
            avisar com alerta de "credencial inválida" — basta repetir os 4 passos e cadastrar
            o novo token. (Renovação automática via login será liberada em breve.)
          </div>
        </fieldset>

        <fieldset id="campos-abb" style="display:none" disabled class="border-0 p-0 m-0">
          <div class="space-y-3">
            <div>
              <label class="block text-sm font-semibold text-slate-700 mb-1">E-mail (UserID Aurora Vision)</label>
              <input name="userId" type="email" placeholder="email da conta instalador"
                     class="w-full px-4 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500">
            </div>
            <div>
              <label class="block text-sm font-semibold text-slate-700 mb-1">Senha Aurora Vision</label>
              <input name="abb_password" type="password" placeholder="senha"
                     class="w-full px-4 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500">
            </div>
            <div>
              <label class="block text-sm font-semibold text-slate-700 mb-1">API Key</label>
              <input name="apiKey" type="text" placeholder="X-AuroraVision-ApiKey"
                     class="w-full px-4 py-2 border-2 border-slate-200 rounded-xl font-mono text-xs focus:outline-none focus:border-amber-500">
            </div>
          </div>
          <div class="mt-3 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs">
            <strong>📋 Como pegar a API Key:</strong>
            <ol class="list-decimal ml-5 mt-2 space-y-1">
              <li>Loga em <a href="https://www.auroravision.net/" target="_blank" rel="noopener" class="underline font-semibold">auroravision.net</a> com a conta de instalador</li>
              <li>Menu superior → <strong>Account</strong> → <strong>API Access</strong> (ou Settings → Developer)</li>
              <li>Gera/copia a <strong>API Key</strong> (campo "X-AuroraVision-ApiKey")</li>
              <li>Cola aqui junto com seu e-mail e senha de login do portal</li>
            </ol>
          </div>
          <div class="mt-3 px-4 py-3 rounded-lg bg-sky-50 border border-sky-200 text-sky-900 text-xs">
            🔑 <strong>Renovação automática:</strong> diferente do NEP, o adapter ABB faz o login
            sozinho usando o e-mail e senha. Token interno renova a cada 50 minutos sem você fazer nada.
          </div>
        </fieldset>

        <fieldset id="campos-foxess" style="display:none" disabled class="border-0 p-0 m-0">
          <div>
            <label for="foxess_api_key" class="block text-sm font-semibold text-slate-700 mb-2">API Key da conta FoxESS</label>
            <input
              id="foxess_api_key"
              name="foxess_api_key"
              type="text"
              placeholder="cola aqui a API Key gerada no FoxESS Cloud"
              class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition font-mono text-sm">
          </div>
          <div class="mt-3 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs">
            <strong>📋 Como pegar a API Key (1 minuto):</strong>
            <ol class="list-decimal ml-5 mt-2 space-y-1">
              <li>Acessa <a href="https://www.foxesscloud.com" target="_blank" rel="noopener" class="underline font-semibold">www.foxesscloud.com</a> (com o <strong>www.</strong>) e faz login</li>
              <li>Canto superior direito → seu perfil → <strong>API Management</strong></li>
              <li>Clica em <strong>Generate API Key</strong> e <strong>copia na hora</strong> (só aparece uma vez)</li>
              <li>Cola aqui. A mesma chave lista todos os inversores da conta.</li>
            </ol>
          </div>
          <div class="mt-3 px-4 py-3 rounded-lg bg-sky-50 border border-sky-200 text-sky-900 text-xs">
            🔑 <strong>Sem expiração / sem login:</strong> a API Key já é o acesso — o adapter usa
            ela direto (assinatura por chamada). Limite de ~1440 chamadas/dia por inversor, de sobra
            pro monitoramento diário.
          </div>
        </fieldset>

        <button type="submit"
                class="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-semibold py-3 rounded-xl shadow-lg hover:shadow-xl transition transform hover:-translate-y-0.5">
          📥 Importar agora
        </button>
      </form>

      <div class="mt-6 pt-6 border-t border-slate-100 text-xs text-slate-500 space-y-2">
        <p>💡 <strong>Como funciona:</strong> chamamos a API da marca selecionada com as suas credenciais,
        recebemos todos os sites associados, e cadastramos cada um em
        <code class="bg-slate-100 px-1 rounded">sistemas_clientes</code>.</p>
        <p>🔄 <strong>Atualização automática:</strong> de hora em hora o sistema re-consulta a API e
        cadastra plantas novas que apareceram no painel da marca — sem você fazer nada.</p>
        <p>🔁 <strong>Re-importar:</strong> rodar de novo é seguro — sites que já existem só são atualizados (apelido, potência, etc).</p>
      </div>
    </section>

    <div class="mt-4">
      <a href="/dashboard/monitoramento" class="text-sm text-slate-600 hover:underline">← Voltar pro monitoramento</a>
    </div>
  `;

  // JS pro botao "Buscar empresas Deye" — chama o endpoint AJAX, mostra a
  // lista de companyId / companyName, ao clicar numa preenche o input.
  const scripts = `
<script>
  (function(){
    var btn = document.getElementById('deye-buscar-empresas');
    if (!btn) return;
    var resultDiv = document.getElementById('deye-empresas-result');
    var inputId = document.getElementById('deye-companyId');
    btn.addEventListener('click', async function(){
      function v(name){ var el = document.querySelector('[name="'+name+'"]'); return el ? el.value : ''; }
      var creds = { appId: v('appId'), appSecret: v('appSecret'), email: v('email'), password: v('password'), dataCenter: v('dataCenter') };
      if (!creds.appId || !creds.appSecret || !creds.email || !creds.password) {
        resultDiv.innerHTML = '<div class="p-2 rounded bg-rose-50 text-rose-700">Preenche AppId, AppSecret, e-mail e senha primeiro.</div>';
        return;
      }
      btn.disabled = true; btn.textContent = '⏳ Buscando...';
      resultDiv.innerHTML = '';
      try {
        var resp = await fetch('/dashboard/monitoramento/buscar-empresas-deye', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(creds),
        });
        var data = await resp.json();
        if (!data.ok) throw new Error(data.error || 'erro');
        if (!data.empresas || data.empresas.length === 0) {
          resultDiv.innerHTML = '<div class="p-2 rounded bg-amber-50 text-amber-800">Nenhuma empresa encontrada.</div>';
        } else {
          var html = '<div class="p-2 rounded bg-emerald-50 border border-emerald-200"><div class="font-semibold text-emerald-900 mb-1">Empresas encontradas — clica pra usar:</div><div class="space-y-1">';
          for (var i = 0; i < data.empresas.length; i++) {
            var e = data.empresas[i];
            html += '<button type="button" data-id="'+e.companyId+'" class="block w-full text-left px-2 py-1 rounded hover:bg-emerald-100 text-emerald-900 font-mono text-xs"><strong>'+e.companyId+'</strong> · '+e.companyName+' <span class="text-emerald-600">('+e.roleName+')</span></button>';
          }
          html += '</div></div>';
          resultDiv.innerHTML = html;
          resultDiv.querySelectorAll('button[data-id]').forEach(function(b){
            b.addEventListener('click', function(){
              inputId.value = b.getAttribute('data-id');
              resultDiv.innerHTML = '<div class="p-2 rounded bg-emerald-100 text-emerald-900">✅ Company ID '+inputId.value+' selecionado. Clica em "Importar agora".</div>';
            });
          });
        }
      } catch(err) {
        resultDiv.innerHTML = '<div class="p-2 rounded bg-rose-50 text-rose-700">Erro: '+(err.message || err)+'</div>';
      } finally {
        btn.disabled = false; btn.textContent = '🔍 Buscar empresas';
      }
    });
  })();
</script>`;

  return renderLayout({ active: 'monitoramento', title: 'Importar sites', body, scripts });
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
      ? `https://wa.me/${normalizeBrazilianPhone(r.telefone) ?? r.telefone.replace(/\D/g, '')}`
      : null;

    return `
      <tr class="hover:bg-slate-50">
        <td class="px-4 py-3 text-sm">
          <div class="font-medium text-slate-900">${escapeHtml(r.cliente_nome)}</div>
          <div class="text-xs text-slate-500">${escapeHtml(formatPhoneBR(r.telefone ?? '')) || '—'}</div>
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
