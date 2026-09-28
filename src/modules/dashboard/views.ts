// Renderizacao HTML do dashboard — server-side. Sem framework, sem build step.
// Tailwind via CDN + Chart.js via CDN. Identidade EcoSun: azul navy + amarelo solar.

import type { DashboardKpi, PropostaRow, ManutencaoRow, GraficoMensal, SistemaMonitorRow } from './queries.js';
import type { DetalheCalendario } from '../monitoring/service.js';
import type { IntradayPonto } from '../monitoring/types.js';
import { LOGO_ECOSUNPOWER_BRANCO_BASE64 } from '../proposal/assets/logo-base64.js';
import { escapeHtml, fmtNumero } from './ui/html.js';
import { SPRITE_ICONES } from './ui/icones.js';
import { FONTES_HEAD } from './ui/estilo.js';
import { URL_CSS_PAINEL, URL_CSS_SEM_TAILWIND, URL_LOGO_CASA } from './ui/estatico.js';
import {
  icone, selo, cabecalhoPagina, faixaKpis, cartaoSecao, chipsFiltro, celulaDupla, pilulaStatus, estadoVazio, botao,
  aviso, linhaLista, tabela, abas, menuAcoes, barra, type Tom,
} from './ui/componentes.js';
import { temaDaTela } from './ui/tema.js';
import { JS_TEMA_GRAFICOS } from './ui/graficos.js';
import { montarMenu, type ItemMontado, type IdGrupo, type SeloGrupo } from './menu-areas.js';
import { corDaMarca, logoDaEmpresa, LOGO_PADRAO_CASA } from './marca-empresa.js';
import { formatPhoneBR, normalizeBrazilianPhone } from '../meta-leadgen.js';
import { renderClienteSelector } from './proprietario.js';
import { empresa } from '../empresa-config.js';
import { can, type DashUser } from './permissions.js';
import { ECOSUN_COMPANY_ID } from '../tenant-resolver.js';
import { linkDaLogo } from './entrada.js';

// Escape único do painel: mora no design system (ui/html.ts) e é reexportado
// aqui porque quase todas as telas importam `escapeHtml` de './views.js'.
export { escapeHtml };

export function brl(v: number | null | undefined): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  // Sempre em horário de Brasília: o servidor roda em UTC — sem o timeZone,
  // tudo que acontece depois das 21h aparecia com a data do dia seguinte.
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });
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
// LAYOUT (wrapper comum) — casca do Energy Command Center (fase A, 27/09/2026)
// Spec: docs/superpowers/specs/2026-09-27-command-center-design.md
// Menu por ÁREA (menu-areas.ts), logo negativa-wide GRANDE, cartão do usuário,
// Modo TV, gaveta no celular. Área principal navy escura nas telas desenhadas
// pro escuro (`dark: true`) e clara nas demais (ninguém quebra).
// =========================================================================

/** Chave do item ativo no menu (ver MENU_AREAS). */
export type ChaveAtiva =
  | 'command_center' | 'cockpit' | 'home' | 'propostas' | 'fechar_venda' | 'contratos' | 'manutencao'
  | 'monitoramento' | 'medicao' | 'usinas_kanban' | 'pos_venda' | 'pastas' | 'marketing' | 'blog'
  | 'email' | 'cadencia' | 'leads' | 'conversas' | 'recados' | 'conhecimento' | 'kanban' | 'clientes' | 'financeiro'
  | 'fiscal' | 'cobrar' | 'assinaturas' | 'minha_assinatura' | 'whatsapp' | 'servicos' | 'usuarios'
  | 'empresas' | 'rh_candidatos' | 'rh_vagas' | 'rh_busca' | 'cerebro' | 'lojas' | 'predio'
  | 'demonstrativos' | 'tv' | 'atencao' | 'energia';

interface LayoutInput {
  active: ChaveAtiva;
  title: string;
  body: string;
  scripts?: string;
  // Tema: `dark: true` = tela desenhada pro escuro → área principal navy do
  // Command Center. Sem `dark` = área clara de sempre (telas ainda claras e o
  // tenant que pediu tema claro).
  dark?: boolean;
  // Usuário logado pra condicionar o menu por permissão. COMPATIBILIDADE:
  // se undefined, mostra tudo que não é exclusivo de tenant.
  // R0 da renovação do miolo (28/09/2026): a CHAVE é obrigatória no tipo, pra
  // o tsc apontar toda tela que esquecia de repassar o usuário (a casca da
  // casa vazava pro tenant). O valor `undefined` continua aceito (telas
  // legadas/testes) e se comporta como antes.
  user: DashUser | undefined;
  // Telas do Command Center usam a largura toda (o resto fica em 80rem).
  largo?: boolean;
  // Modo imersivo (renovação do miolo, R1 — uso no R23: Prédio Vivo e Cérebro):
  // área de conteúdo sem padding, altura cheia e SEM rodapé. Menu continua.
  imersivo?: boolean;
  // Selos de contagem por área no menu (fase B liga com número real).
  selos?: Partial<Record<IdGrupo, SeloGrupo>>;
  // Tailwind do CDN (~400 KB de JS que compila no navegador). Padrão: carrega
  // (telas antigas dependem dele). `false` SÓ nas telas renovadas — as da lista
  // TELAS_RENOVADAS do teto do Tailwind (tests/helpers/teto-tailwind.ts), cujo
  // miolo não tem utilitário Tailwind. No lugar entra o reset de base servido
  // por arquivo (ui/estatico.ts). perf/telas-leves, 28/09/2026.
  tailwind?: boolean;
}

export function renderLayout(input: LayoutInput): string {
  const { active, title, body, scripts, dark, user, largo, selos, imersivo } = input;
  const comTailwind = input.tailwind !== false;

  // MARCA DA EMPRESA (01/09/2026): cada empresa entra com a própria logo e cor;
  // nada da casa aparece na tela de outra empresa. EcoSun (ou tela legada sem
  // user) vê a logo oficial negativa-wide.
  const _emp = empresa();
  const corMarca = corDaMarca(_emp);
  const logoEmpresa = logoDaEmpresa(_emp);
  const temLogoPropria = logoEmpresa !== LOGO_PADRAO_CASA;

  const marcaTenant =
    user?.companyNome && user.companyId !== ECOSUN_COMPANY_ID ? user.companyNome : null;

  // Gating idêntico ao de antes (vitrine-menu.ts): visível / bloqueado 🔒 /
  // escondido. A fechadura continua no servidor (exigir(...) de cada rota).
  const grupos = montarMenu(user, active, ECOSUN_COMPANY_ID, (u, area, nivel) =>
    can(u as never, area as never, (nivel ?? 'visualizar') as never), selos ?? {});

  const cadeado = '<span class="cc-cadeado" aria-hidden="true">🔒</span>';
  const itemHtml = (it: ItemMontado): string =>
    it.estado === 'bloqueado'
      ? `<a href="/dashboard/conhecer/${encodeURIComponent(it.key)}" class="cc-lock${it.ativo ? ' cc-on' : ''}" title="Ainda não faz parte do seu plano — clique para conhecer">${escapeHtml(it.label)}${cadeado}</a>`
      : `<a href="${it.href}"${it.ativo ? ' class="cc-on" aria-current="page"' : ''}>${escapeHtml(it.label)}</a>`;

  const menuHtml = grupos.map((g) => {
    const seloHtml = g.selo ? selo(g.selo.valor, g.selo.tom) : '';
    const cls = `cc-top-item${g.ativo ? ' cc-on' : ''}${g.trancado ? ' cc-trancado' : ''}`;
    return `${g.separarAntes ? '<div class="cc-sep"></div>' : ''}<details class="cc-grp"${g.aberto ? ' open' : ''}>
        <summary class="${cls}">${icone(g.icone)}${escapeHtml(g.titulo)}${seloHtml}${g.trancado ? cadeado : ''}<svg class="cc-i cc-i-xs cc-chev" aria-hidden="true"><use href="#cc-i-chev"/></svg></summary>
        <div class="cc-sub">${g.itens.map(itemHtml).join('')}</div>
      </details>`;
  }).join('\n      ');

  const logoHtml = temLogoPropria
    ? `<img src="${escapeHtml(logoEmpresa)}" alt="${escapeHtml(_emp.nomeFantasia)}">`
    : marcaTenant
    ? `<div class="cc-sb-nome">${escapeHtml(marcaTenant)}</div>`
    : `<img src="${URL_LOGO_CASA}" alt="EcoSunPower">`;

  const logoMobile = temLogoPropria
    ? `<img src="${escapeHtml(logoEmpresa)}" alt="">`
    : marcaTenant
    ? `<span class="cc-mtop-nome">${escapeHtml(marcaTenant)}</span>`
    : `<img src="${URL_LOGO_CASA}" alt="">`;

  const ehCasa = user?.companyId === ECOSUN_COMPANY_ID;
  const inicial = (user?.nome ?? '').trim().charAt(0).toUpperCase() || '?';
  // Nome da casa só pra quem é da casa — tenant sem cargo nem marca fica em branco.
  const cartaoUsuario = user
    ? `<div class="cc-me"><div class="cc-av">${escapeHtml(inicial)}</div><div class="cc-me-txt"><strong>${escapeHtml(user.nome)}</strong><span>${escapeHtml(user.roleNome || marcaTenant || (ehCasa ? 'EcoSunPower' : ''))}</span></div>
          <form action="/dashboard/logout" method="post"><button type="submit" class="cc-sair" title="Sair" aria-label="Sair">${icone('ext', 'sm')}</button></form></div>`
    : `<form action="/dashboard/logout" method="post"><button type="submit" class="cc-tvcard" style="width:100%;cursor:pointer" title="Sair">${icone('ext', 'sm')}<span><strong>Sair</strong></span></button></form>`;

  // Classes do <body> iguais às de antes (telas antigas e testes contam com
  // elas). O tema do design system (cc-escuro / cc-claro) vai na casca.
  const classeBody = dark
    ? 'ecosun-body ecosun-body-dark bg-slate-950 text-slate-100'
    : 'ecosun-body';
  const tema = dark ? 'cc-escuro' : 'cc-claro';

  // <head>: CSS comum (design system + classes antigas) por ARQUIVO com hash no
  // nome — o navegador baixa uma vez e guarda (ui/estatico.ts). Inline só a cor
  // da MARCA da empresa em contexto (migration 120; sem cor cadastrada, âmbar).
  // Tela renovada (tailwind:false): sem o Tailwind do CDN e com o reset de base
  // no lugar, DEPOIS do CSS do painel (onde o Tailwind injetava o dele).
  const cabecaEstilos = [
    comTailwind ? '<script src="https://cdn.tailwindcss.com"></script>' : '',
    FONTES_HEAD,
    `<link rel="stylesheet" href="${URL_CSS_PAINEL}">`,
    comTailwind ? '' : `<link rel="stylesheet" href="${URL_CSS_SEM_TAILWIND}">`,
    `<style>\n  :root { --marca: ${corMarca}; }\n</style>`,
  ].filter(Boolean).join('\n');

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · ${marcaTenant ? `${escapeHtml(marcaTenant)} Dashboard` : 'EcoSun Dashboard'}</title>
${cabecaEstilos}
</head>
<body class="${classeBody}" id="dash-root">
  ${SPRITE_ICONES}
  <div class="cc-shell ${tema}">
    <!-- Fundo escuro do menu no celular (clique fecha) -->
    <div class="cc-backdrop" onclick="ccMenu(false)"></div>

    <!-- MENU LATERAL por área -->
    <aside class="cc-sb" id="cc-sidebar" aria-label="Menu principal">
      <a href="${linkDaLogo(user)}" class="cc-sb-logo" title="Ir para o início">
        ${logoHtml}
        <small>${marcaTenant ? 'Painel de gestão' : 'Central de gestão'}</small>
      </a>
      <nav class="cc-nav">
      ${menuHtml}
      </nav>
      <div class="cc-sb-foot">
        ${ehCasa ? `<a class="cc-tvcard" href="/dashboard/tv">${icone('tv')}<span><strong>Modo TV</strong> · tela do escritório</span></a>` : ''}
        ${cartaoUsuario}
      </div>
    </aside>

    <!-- CONTEÚDO -->
    <div class="cc-col">
      <header class="cc-mtop">
        <button type="button" class="cc-ibtn" id="cc-menu-btn" aria-label="Abrir menu"
          aria-controls="cc-sidebar" aria-expanded="false" onclick="ccMenu()">${icone('menu')}</button>
        ${logoMobile}
        <span class="cc-sp"></span>
      </header>

      <main class="cc-main${largo ? ' cc-largo' : ''}${imersivo ? ' cc-imersivo' : ''}">
        ${body}
      </main>
${imersivo ? '' : `
      <footer class="cc-rodape">
        <div class="cc-row">
          ${marcaTenant
            ? `<span>☀</span><span>${escapeHtml(marcaTenant)}</span>`
            : `<span>☀</span>
          <span>EcoSunPower Energia Solar</span>
          <span class="hidden sm:inline">·</span>
          <span>CNPJ 33.020.459/0001-06</span>
          <span class="hidden sm:inline">·</span>
          <span>Brasília-DF</span>`}
        </div>
      </footer>`}
    </div>
  </div>

  <script id="cc-gaveta-js">
    // Gaveta do menu no celular: abre/fecha, aria-expanded no botão. Ao abrir,
    // o foco vai pro 1º link do menu; ao fechar (botão, fundo escuro ou Esc),
    // volta pro botão.
    function ccMenu(abrir) {
      var root = document.getElementById('dash-root');
      var btn = document.getElementById('cc-menu-btn');
      var estava = root.classList.contains('sidebar-open');
      var aberto = typeof abrir === 'boolean' ? abrir : !estava;
      root.classList.toggle('sidebar-open', aberto);
      if (btn) btn.setAttribute('aria-expanded', aberto ? 'true' : 'false');
      if (aberto && !estava) {
        var sb = document.getElementById('cc-sidebar');
        var primeiro = sb && sb.querySelector('.cc-nav a[href], .cc-nav summary');
        if (primeiro) primeiro.focus();
      } else if (!aberto && estava && btn) {
        btn.focus();
      }
      return aberto;
    }
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !document.getElementById('dash-root').classList.contains('sidebar-open')) return;
      ccMenu(false);
    });
  </script>
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
      <form action="/dashboard/login" method="post" autocomplete="on" class="space-y-5">
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

        <label class="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
          <input type="checkbox" name="manter" value="1" checked
            class="w-5 h-5 rounded border-slate-300 text-sky-600 focus:ring-sky-500">
          Continuar conectado neste aparelho (60 dias)
        </label>

        <button
          type="submit"
          class="w-full bg-gradient-to-r from-sky-700 to-sky-600 hover:from-sky-800 hover:to-sky-700 text-white font-semibold py-3 rounded-xl shadow-lg hover:shadow-xl transition transform hover:-translate-y-0.5">
          Entrar →
        </button>
      </form>

      <p class="mt-4 text-center text-sm"><a href="/dashboard/esqueci-senha" class="text-sky-700 hover:underline">Esqueci minha senha</a></p>

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

export function renderHomePage(kpis: DashboardKpi, grafico: GraficoMensal[], graficoVendas: GraficoMensal[] = [], mesLabel = 'Este mês', mesValue = '', user: DashUser | undefined): string {
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
  const valoresVendas = graficoVendas.map(g => g.total);

  const body = `
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-slate-900">Visão geral</h1>
      <p class="text-slate-600 text-sm">Resumo das atividades da Eva e do funil de propostas.</p>
    </div>

    <section class="mb-8">
      <div class="flex items-center justify-between gap-2 flex-wrap mb-3">
        <h2 class="text-xs font-semibold text-slate-500 uppercase tracking-wide">📅 ${escapeHtml(mesLabel)}</h2>
        <form method="get" action="/dashboard/home" class="flex items-center gap-2">
          <label class="text-xs text-slate-500">Ver mês:</label>
          <input type="month" name="mes" value="${escapeHtml(mesValue)}" onchange="this.form.submit()"
            class="text-xs border border-slate-300 rounded-lg px-2 py-1 focus:ring-2 focus:ring-amber-400 outline-none" />
        </form>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        ${card('💰 Vendas fechadas', String(kpis.vendasMesAtual), `${kpis.vendasAnoAtual} no ano · ${kpis.vendasTotal} total`, 'emerald', 'text-emerald-700')}
        ${card('📤 Propostas', String(kpis.propostasMesAtual), `${kpis.propostasAnoAtual} no ano · ${kpis.totalPropostas} total`, 'amber', 'text-amber-600')}
        ${card('🎯 Leads novos', String(kpis.leadsMesAtual), `${kpis.totalLeads} total`, 'sky', 'text-sky-700')}
        ${card('⚡ Usinas que entraram', String(kpis.usinasMesAtual), 'novos sistemas no mês', 'violet', 'text-violet-700')}
      </div>
    </section>

    <section class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      ${card('Clientes instalados', String(kpis.clientesInstalados), 'sistemas operando', 'emerald')}
      ${card('Em qualificação', String(kpis.leadsQualificando), `${escapeHtml(empresa().nomeAtendente)} ativa neles`, 'violet', 'text-violet-700')}
      ${card('Ticket médio', brl(kpis.ticketMedio), 'últimas 50 propostas', 'emerald', 'text-emerald-700')}
      ${card('Manutenção próx 30d', String(kpis.manutencaoPendente), 'lembretes pendentes', kpis.manutencaoPendente > 0 ? 'rose' : 'sky', kpis.manutencaoPendente > 0 ? 'text-rose-600' : 'text-slate-900')}
    </section>

    <section class="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-8">
      <h2 class="text-lg font-semibold text-slate-900 mb-4">💰 Vendas fechadas — últimos 12 meses</h2>
      <div style="height:280px;position:relative">
        <canvas id="graficoVendas"></canvas>
      </div>
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
  const opcoesGrafico = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, ticks: { stepSize: 1 } },
      x: { grid: { display: false } }
    }
  };
  const ctxVendas = document.getElementById('graficoVendas');
  if (ctxVendas) {
    new Chart(ctxVendas, {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(labels)},
        datasets: [{ label: 'Vendas', data: ${JSON.stringify(valoresVendas)}, backgroundColor: '#10b981', borderRadius: 6 }]
      },
      options: opcoesGrafico
    });
  }
  const ctx = document.getElementById('graficoMensal');
  if (ctx) {
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(labels)},
        datasets: [{ label: 'Propostas', data: ${JSON.stringify(valores)}, backgroundColor: '#f59e0b', borderRadius: 6 }]
      },
      options: opcoesGrafico
    });
  }
</script>`;

  return renderLayout({ active: 'home', title: 'Home', body, scripts, user });
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

export const MARCAS_LABEL: Record<string, string> = {
  solaredge: 'SolarEdge',
  sungrow: 'Sungrow',
  deye: 'Deye',
  hoymiles: 'Hoymiles',
  goodwe: 'GoodWe',
  huawei: 'Huawei',
  foxess: 'FoxESS',
  nep: 'NEP',
  abb: 'ABB / FIMER',
  solis: 'Solis',
  saj: 'SAJ',
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
  solis:     'https://ecosunpower.eng.br/logos/solis.png',
};

export interface KPIsAbordagemMes {
  enviadas: number;
  resolvidoSozinhoCount: number;
  limpezasFechadasCount: number;
  semRespostaCount: number;
  resolvidoSozinhoPct: number;
}

/** Marca do inversor no padrão cc- (logo oficial num fundo claro + nome). */
function marcaCc(marca: string, soLogo = false): string {
  const url = MARCAS_LOGO_URL[marca];
  const label = MARCAS_LABEL[marca] ?? marca;
  if (!url) return `<span class="cc-marca cc-marca-txt">${escapeHtml(label)}</span>`;
  const img = `<img src="${url}" alt="${escapeHtml(label)}" loading="lazy">`;
  return soLogo
    ? `<span class="cc-marca" title="${escapeHtml(label)}">${img}</span>`
    : `<span class="cc-marca">${img}<span>${escapeHtml(label)}</span></span>`;
}

/** CSS da marca do inversor (frota e usina). */
const CSS_MARCA = `
.cc-marca{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--cc-text-2);white-space:nowrap}
.cc-marca img{display:inline-block;height:18px;width:auto;max-width:64px;object-fit:contain;background:#fff;border-radius:5px;padding:2px 4px;box-sizing:content-box}
.cc-marca-txt{padding:2px 8px;border-radius:99px;background:var(--cc-surface-3)}
`;

/** kWh com 1 casa no formato brasileiro; sem dado → "—". */
function kwhCc(v: number | null | undefined, casas = 1): string {
  return v === null || v === undefined || !Number.isFinite(v) ? '—' : `${fmtNumero(v, casas)} kWh`;
}

// CSS da tela da frota (só classes cc-mon-* e os ganchos antigos que os testes
// e o layout procuram: coluna-status, card-usina, orbita-frota, ponto-usina).
const CSS_MONITORAMENTO = `
.cc-mon .cc-kstrip{margin-bottom:16px}
.cc-mon .cc-mon-gap{height:12px}
.cc-mon .cc-panel+.cc-panel,.cc-mon .cc-kstrip+.cc-panel{margin-top:16px}
.cc-mon-filtro{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:16px}
.cc-mon-filtro input[name=q]{width:220px}
.cc-mon-acoes{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.cc-mon-acoes form{margin:0}
.orbita-frota .cc-mon-orb{display:flex;align-items:center;gap:22px}
.orbita-frota svg{width:200px;height:200px;flex:none}
.orbita-frota .cc-mon-orb-txt{flex:1;min-width:0}
.orbita-frota .cc-mon-orb-res{font-size:13px;color:var(--cc-muted);margin:4px 0 10px}
.orbita-frota .cc-mon-orb-res b{font-family:var(--cc-f-num);color:var(--cc-text)}
.orbita-frota .anel{animation:orbita-giro 90s linear infinite;transform-origin:170px 170px}
.orbita-frota .sol-pulso{animation:sol-pulsa 3.2s ease-in-out infinite;transform-origin:170px 170px}
@keyframes orbita-giro{to{transform:rotate(360deg)}}
@keyframes sol-pulsa{0%,100%{opacity:.45}50%{opacity:.85}}
@media (prefers-reduced-motion: reduce){.orbita-frota .anel,.orbita-frota .sol-pulso{animation:none}}
.orbita-frota .ponto-usina circle{cursor:pointer}
.orbita-frota .ponto-usina:hover circle,.orbita-frota .ponto-usina:focus circle{stroke:var(--cc-text);stroke-width:2.5}
.cc-mon-trilho{stroke:var(--cc-line-2)}
.cc-mon-board{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;align-items:start}
.cc-mon-board.cc-mon-um{grid-template-columns:minmax(0,1fr)}
.cc-mon-board .cc-kb-col{max-height:none}
.cc-mon-board .cc-kb-h a{display:flex;align-items:center;gap:8px;flex:1;min-width:0;color:var(--cc-text)}
.cc-mon-board .cc-kb-h a:hover h3{color:var(--cc-gold-2)}
.cc-mon-board .cc-kb-lista{max-height:560px}
.cc-mon-board .card-usina{cursor:pointer}
.cc-mon-card-al{font-size:11.5px;line-height:1.35;margin-top:4px}
.cc-mon-card-al.cc-mon-crit{color:var(--cc-crit)} .cc-mon-card-al.cc-mon-warn{color:var(--cc-warn)}
.cc-mon-card-b{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:6px}
.cc-mon-card-b .cc-kb-card-m{margin-top:0}
.cc-mon-card-b b{font-family:var(--cc-f-num);color:var(--cc-gold-2);font-size:12px;white-space:nowrap}
.cc-mon-card-acts{display:flex;gap:6px;margin-top:8px}
.cc-mon-card-acts form{margin:0}
.cc-mon-pausadas{margin-top:10px;font-size:12px;color:var(--cc-muted)}
.cc-mon-tbl td form{margin:0}
.cc-mon-exc{color:var(--cc-crit)}
.cc-mon-exc:hover{border-color:var(--cc-crit);background:var(--cc-crit-soft)}
.cc-mon-nota{margin-top:12px;font-size:12px;color:var(--cc-faint);text-align:center}
@media (max-width:1180px){.cc-mon-board{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:760px){
  .cc-mon-filtro input[name=q]{flex:1 1 100%;width:100%}
  .cc-mon-filtro select{flex:1 1 40%;min-width:0;width:auto}
  .orbita-frota .cc-mon-orb{flex-direction:column;align-items:stretch}
  .orbita-frota svg{align-self:center;width:180px;height:180px}
  .cc-mon-board{grid-template-columns:minmax(0,1fr)}
}
`;

export function renderMonitoramentoPage(
  rows: SistemaMonitorRow[],
  q: { q?: string; marca?: string; cidade?: string; status?: string; ord?: string; painel?: string },
  alertasResumo?: { urgente: number; aviso: number; info: number; total: number },
  sparkline7d?: Array<{ dia: string; enviados: number }>,
  kpisEva?: KPIsAbordagemMes,
  user?: DashUser,
): string {
  // Renovação do miolo — R8 (28/09/2026): mesma tela, mesmos números, mesmas
  // rotas e formulários; visual no padrão cc- (tema escuro do Command Center
  // para todos — decisão D4 do Junior, em ui/tema.ts).
  const ativos = rows.filter((r) => r.ativo);
  const totalKwp = ativos.reduce((s, r) => s + (r.potencia_kwp ?? 0), 0);
  const totalHoje = rows.reduce((s, r) => s + (r.geracao_hoje_kwh ?? 0), 0);
  const totalMes = rows.reduce((s, r) => s + r.geracao_mes_kwh, 0);
  const okCount = ativos.filter((r) => r.nivel === 'ok' || r.nivel === 'info').length;
  const marcas = new Set(rows.map((r) => r.marca_inversor)).size;
  const problemas = rows.filter((r) => r.nivel === 'urgente' || r.nivel === 'aviso');

  const sincOk = (r: SistemaMonitorRow) => r.ultima_sincronizacao
    && (Date.now() - new Date(r.ultima_sincronizacao).getTime() < 36 * 60 * 60 * 1000);

  const falhas = ativos.filter((r) => r.nivel === 'urgente');
  const atencoes = ativos.filter((r) => r.nivel === 'aviso');
  const saudaveis = ativos.filter((r) => (r.nivel === 'ok' || r.nivel === 'info') && sincOk(r));
  const aguardando = ativos.filter((r) => (r.nivel === 'ok' || r.nivel === 'info') && !sincOk(r));
  const pausadas = rows.filter((r) => !r.ativo);

  // Status de cada usina — MESMA regra de antes (nivel + sinal recente).
  const statusDe = (r: SistemaMonitorRow): [Tom, string] => !r.ativo ? ['sem_dado', 'Pausada']
    : r.nivel === 'urgente' ? ['critico', 'Falha']
      : r.nivel === 'aviso' ? ['atencao', 'Atenção']
        : r.nivel === 'info' ? ['oportunidade', 'Acima do esperado']
          : sincOk(r) ? ['normal', 'Gerando OK'] : ['sem_dado', 'Sem sinal'];

  // [Painel de Operação em COLUNAS — referência do Thiago 27/07] 4 grupos por
  // status, contagem + kWp no cabeçalho; cabeçalho leva ao ?painel= (só aquele
  // status, com "✕ ver tudo"). Mini-card clicável com marca, kWp e geração de hoje.
  const cardUsina = (r: SistemaMonitorRow) => {
    const tom = r.nivel === 'urgente' ? ' cc-kb-crit' : r.nivel === 'aviso' ? ' cc-kb-warn' : sincOk(r) ? ' cc-kb-ok' : '';
    const hoje = r.geracao_hoje_kwh;
    return `
    <div class="cc-kb-card${tom} card-usina" onclick="window.location='/dashboard/monitoramento/${escapeHtml(r.id)}'"${hoje !== null ? ` data-kwh-hoje="${hoje.toFixed(1)}"` : ''}>
      <div class="cc-kb-card-l"><span class="cc-kb-card-t">${escapeHtml(r.apelido)}</span></div>
      <div class="cc-kb-card-m">${escapeHtml([r.cidade, r.uf].filter(Boolean).join('/') || '—')}</div>
      ${r.alertaTexto ? `<div class="cc-mon-card-al ${r.nivel === 'urgente' ? 'cc-mon-crit' : 'cc-mon-warn'}">${escapeHtml(r.alertaTexto)}</div>` : ''}
      <div class="cc-mon-card-b"><span class="cc-kb-card-m">${marcaCc(r.marca_inversor, true)}${r.potencia_kwp ? `${escapeHtml(fmtNumero(r.potencia_kwp, 1))} kWp` : '—'}</span><b>${hoje !== null ? `☀ ${escapeHtml(kwhCc(hoje))}` : '—'}</b></div>
      <div class="cc-mon-card-acts" onclick="event.stopPropagation()">
        <form action="/dashboard/monitoramento/${escapeHtml(r.id)}/sync" method="post"><button type="submit" title="Sincronizar" class="cc-btn cc-btn-sm">${icone('zap', 'xs')}Sincronizar</button></form>
        <a href="/dashboard/monitoramento/${escapeHtml(r.id)}/relatorio" title="Gerar relatório" class="cc-btn cc-btn-sm">${icone('file', 'xs')}Relatório</a>
      </div>
    </div>`;
  };

  const PAINEIS: Record<string, { titulo: string; icone: string; cor: string; lista: SistemaMonitorRow[] }> = {
    falha: { titulo: 'Falha', icone: '🔴', cor: 'var(--cc-crit)', lista: falhas },
    atencao: { titulo: 'Atenção', icone: '🟡', cor: 'var(--cc-warn)', lista: atencoes },
    ok: { titulo: 'Gerando OK', icone: '🟢', cor: 'var(--cc-ok)', lista: saudaveis },
    aguardando: { titulo: 'Aguardando dados', icone: '⚪', cor: 'var(--cc-off)', lista: aguardando },
  };
  const painelAtivo = q.painel && q.painel in PAINEIS ? q.painel : null;

  const colunaStatus = (chave: string) => {
    const { titulo, icone: ic, cor, lista } = PAINEIS[chave];
    const ativa = painelAtivo === chave;
    const href = ativa ? '/dashboard/monitoramento' : `/dashboard/monitoramento?painel=${chave}`;
    const kwp = lista.reduce((s, r) => s + (r.potencia_kwp ?? 0), 0);
    return `
    <div class="coluna-status">
      <section class="cc-kb-col" style="--kb:${cor}">
        <header class="cc-kb-h"><a href="${href}" title="${ativa ? 'Voltar a ver todos os status' : 'Ver só este status'}"><h3>${ic} ${escapeHtml(titulo)}${ativa ? ' · ✕ ver tudo' : ''}</h3></a><span class="cc-kb-n">${lista.length}</span><small class="cc-kb-sub">${escapeHtml(fmtNumero(kwp, 1))} kWp</small></header>
        <div class="cc-kb-lista">${lista.length ? lista.map(cardUsina).join('') : '<p class="cc-kb-vazio">— nenhuma —</p>'}</div>
      </section>
    </div>`;
  };

  const boardHtml = painelAtivo
    ? `<div class="cc-mon-board cc-mon-um">${colunaStatus(painelAtivo)}</div>`
    : `<div class="cc-mon-board">${colunaStatus('falha')}${colunaStatus('atencao')}${colunaStatus('ok')}${colunaStatus('aguardando')}</div>
      ${pausadas.length ? `<div class="cc-mon-pausadas">${pausadas.length} usina(s) pausada(s) — aparecem só na carteira abaixo.</div>` : ''}`;

  // Chips de status com contagem — os MESMOS destinos ?painel= de antes.
  const chips = chipsFiltro([
    { rotulo: 'Todos', valor: ativos.length, href: '/dashboard/monitoramento', ativo: !painelAtivo },
    { rotulo: 'Falha', valor: falhas.length, href: '/dashboard/monitoramento?painel=falha', ativo: painelAtivo === 'falha', tom: falhas.length ? 'warn' : undefined },
    { rotulo: 'Atenção', valor: atencoes.length, href: '/dashboard/monitoramento?painel=atencao', ativo: painelAtivo === 'atencao', tom: atencoes.length ? 'warn' : undefined },
    { rotulo: 'Gerando OK', valor: saudaveis.length, href: '/dashboard/monitoramento?painel=ok', ativo: painelAtivo === 'ok', tom: 'ok' },
    { rotulo: 'Aguardando', valor: aguardando.length, href: '/dashboard/monitoramento?painel=aguardando', ativo: painelAtivo === 'aguardando' },
  ]);

  // [ÓRBITA DA FROTA — pedido do Junior 27/07] a carteira como sistema solar:
  // sol = geração de HOJE; um ponto por usina ativa, ordenado por status.
  const orbitaOrdem = [...falhas, ...atencoes, ...aguardando, ...saudaveis];
  const corPonto = (r: SistemaMonitorRow) =>
    r.nivel === 'urgente' ? '#E4574B' : r.nivel === 'aviso' ? '#F2862E' : sincOk(r) ? '#3DBB6E' : '#7F90A6';
  const N_ORB = orbitaOrdem.length;
  const RAIO_ORB = 132;
  const CENTRO_ORB = 170;
  const rPonto = N_ORB > 70 ? 4 : N_ORB > 40 ? 5.5 : 7;
  const pontosOrbita = orbitaOrdem.map((r, i) => {
    const ang = (i / Math.max(N_ORB, 1)) * 2 * Math.PI - Math.PI / 2;
    const x = (CENTRO_ORB + RAIO_ORB * Math.cos(ang)).toFixed(1);
    const y = (CENTRO_ORB + RAIO_ORB * Math.sin(ang)).toFixed(1);
    return `<a href="/dashboard/monitoramento/${escapeHtml(r.id)}" class="ponto-usina"><circle cx="${x}" cy="${y}" r="${rPonto}" fill="${corPonto(r)}"><title>${escapeHtml(r.apelido)} · ${r.geracao_hoje_kwh !== null ? `${escapeHtml(kwhCc(r.geracao_hoje_kwh))} hoje` : 'sem dados hoje'}</title></circle></a>`;
  }).join('');

  const orbitaHtml = N_ORB === 0 ? '' : cartaoSecao({
    titulo: 'Órbita da Frota',
    dica: 'Cada ponto é uma usina — a cor é o status. Clique pra abrir.',
    classe: 'orbita-frota',
    corpoHtml: `<div class="cc-mon-orb">
        <svg viewBox="0 0 340 340" role="img" aria-label="Órbita da frota: cada ponto é uma usina, a cor é o status">
          <defs><radialGradient id="grad-sol" cx="50%" cy="42%"><stop offset="0%" stop-color="#FDE68A"/><stop offset="55%" stop-color="#F59E0B"/><stop offset="100%" stop-color="#D97706"/></radialGradient></defs>
          <circle class="cc-mon-trilho" cx="${CENTRO_ORB}" cy="${CENTRO_ORB}" r="${RAIO_ORB}" fill="none" stroke-width="1" stroke-dasharray="2 7"/>
          <circle class="sol-pulso" cx="${CENTRO_ORB}" cy="${CENTRO_ORB}" r="82" fill="url(#grad-sol)" opacity=".45"/>
          <circle class="sol-central" cx="${CENTRO_ORB}" cy="${CENTRO_ORB}" r="66" fill="url(#grad-sol)" data-kwh-hoje="${totalHoje.toFixed(1)}"/>
          <text x="${CENTRO_ORB}" y="${CENTRO_ORB - 4}" text-anchor="middle" font-size="30" font-weight="700" fill="#3B2300" style="font-family:var(--cc-f-num)">${escapeHtml(fmtNumero(totalHoje, 1))}</text>
          <text x="${CENTRO_ORB}" y="${CENTRO_ORB + 17}" text-anchor="middle" font-size="12" font-weight="500" fill="#5A3E00">kWh hoje</text>
          <text x="${CENTRO_ORB}" y="${CENTRO_ORB + 34}" text-anchor="middle" font-size="11" fill="#5A3E00">${ativos.length} usinas</text>
          <g class="anel">${pontosOrbita}</g>
        </svg>
        <div class="cc-mon-orb-txt">
          <div class="cc-mon-orb-res">Mês: <b>${escapeHtml(fmtNumero(totalMes, 0))} kWh</b> · ${escapeHtml(fmtNumero(totalKwp, 1))} kWp · ${marcas} marca(s) · Saúde <b>${okCount}/${ativos.length}</b></div>
          ${chipsFiltro([
            { rotulo: 'Falha', valor: falhas.length, href: '/dashboard/monitoramento?painel=falha' },
            { rotulo: 'Atenção', valor: atencoes.length, href: '/dashboard/monitoramento?painel=atencao' },
            { rotulo: 'Gerando OK', valor: saudaveis.length, href: '/dashboard/monitoramento?painel=ok' },
            { rotulo: 'Aguardando dados', valor: aguardando.length, href: '/dashboard/monitoramento?painel=aguardando' },
          ])}
        </div>
      </div>`,
  });

  // Carteira inteira: tabela cc- que vira cartão no celular. A linha continua
  // clicável (mesmo onclick de antes) e o excluir tem os MESMOS dois confirm().
  const COLS = ['Usina', 'Marca', 'Potência', 'Hoje', 'Mês', 'Status', 'Sinal', 'Idade', ''];
  const td = (i: number, html: string, cls = '') =>
    `<td${cls ? ` class="${cls}"` : ''} data-label="${escapeHtml(COLS[i])}">${html}</td>`;
  const linha = (r: SistemaMonitorRow) => {
    const [tom, texto] = statusDe(r);
    return `<tr class="cc-tr-link" onclick="window.location='/dashboard/monitoramento/${escapeHtml(r.id)}'">`
      + td(0, celulaDupla(r.apelido, [r.cidade, r.uf].filter(Boolean).join('/') || '—', `/dashboard/monitoramento/${r.id}`))
      + td(1, marcaCc(r.marca_inversor))
      + td(2, r.potencia_kwp ? `${escapeHtml(fmtNumero(r.potencia_kwp, 2))} kWp` : '—', 'cc-r cc-n')
      + td(3, escapeHtml(kwhCc(r.geracao_hoje_kwh)), 'cc-r cc-n')
      + td(4, r.geracao_mes_kwh > 0 ? escapeHtml(kwhCc(r.geracao_mes_kwh, 0)) : '—', 'cc-r cc-n')
      + td(5, pilulaStatus(tom, texto))
      + td(6, `<span class="cc-muted">${escapeHtml(relativeTime(r.ultima_sincronizacao))}</span>`)
      + td(7, `<span class="cc-muted">${escapeHtml(r.garantiaIdade)}</span>`)
      + `<td class="cc-r" data-label="" onclick="event.stopPropagation()">
          <form action="/dashboard/monitoramento/${escapeHtml(r.id)}/excluir" method="post" onsubmit="return confirm('EXCLUIR esta usina de vez? Apaga todo o histórico. Sem volta.') && confirm('Confirma de novo: excluir esta usina permanentemente?')">
            <button type="submit" class="cc-btn cc-btn-sm cc-mon-exc" title="Excluir usina" aria-label="Excluir usina">Excluir</button>
          </form>
        </td></tr>`;
  };
  const tabelaHtml = `<div class="cc-tbl-wrap cc-tbl-cartoes cc-mon-tbl"><table class="cc-tbl"><thead><tr>${COLS.map((c, i) => `<th${[2, 3, 4, 8].includes(i) ? ' class="cc-r"' : ''}>${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(linha).join('')}</tbody></table></div>`;

  const opt = (v: string, label: string, sel?: string) =>
    `<option value="${escapeHtml(v)}" ${sel === v ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  const marcasUnicas = [...new Set(rows.map((r) => r.marca_inversor))].sort();
  const cidadesUnicas = [...new Set(rows.map((r) => r.cidade).filter(Boolean) as string[])].sort();
  const ROTULO_STATUS: Record<string, string> = { urgente: 'Falha', aviso: 'Atenção', info: 'Acima do esperado', ok: 'OK' };

  // Filtro: MESMO GET /dashboard/monitoramento com q/marca/cidade/status/ord.
  // "Atualizar todas" (POST sync-todos) sai de DENTRO deste form: formulário
  // dentro de formulário não existe no HTML — o botão acabava enviando o filtro.
  const filtro = `
    <form class="cc-form cc-mon-filtro" method="get" action="/dashboard/monitoramento">
      <input name="q" value="${escapeHtml(q.q ?? '')}" placeholder="Cliente ou cidade" aria-label="Buscar usina">
      <select name="marca" aria-label="Marca">${opt('', 'Todas as marcas', q.marca)}${marcasUnicas.map((m) => opt(m, MARCAS_LABEL[m] ?? m, q.marca)).join('')}</select>
      <select name="cidade" aria-label="Cidade">${opt('', 'Todas as cidades', q.cidade)}${cidadesUnicas.map((c) => opt(c, c, q.cidade)).join('')}</select>
      <select name="status" aria-label="Status">${opt('', 'Todos os status', q.status)}${['urgente', 'aviso', 'info', 'ok'].map((s) => opt(s, ROTULO_STATUS[s], q.status)).join('')}</select>
      <select name="ord" aria-label="Ordenar">${opt('severidade', 'Ordenar: severidade', q.ord)}${opt('geracao_desc', 'Ordenar: geração ↓', q.ord)}${opt('nome', 'Ordenar: nome', q.ord)}</select>
      ${botao({ rotulo: 'Filtrar', tipo: 'submit', icone: 'filter' })}
      <a href="/dashboard/monitoramento" class="cc-link">limpar</a>
    </form>`;

  const acoes = `<div class="cc-mon-acoes">
      ${botao({ rotulo: '📥 Importar', href: '/dashboard/monitoramento/importar', tom: 'ouro' })}
      ${rows.length ? `<form action="/dashboard/monitoramento/sync-todos" method="post">${botao({ rotulo: 'Atualizar todas', tipo: 'submit', icone: 'zap' })}</form>` : ''}
    </div>`;

  const cabecalho = cabecalhoPagina({
    trilha: [{ rotulo: 'Usinas' }, { rotulo: 'Monitoramento' }],
    titulo: 'Painel de Triagem — Usinas',
    subtitulo: 'Primeiro o que precisa de ação. Depois a carteira inteira, filtrável.',
    acoesHtml: acoes,
  });

  const kpis = faixaKpis([
    { rotulo: 'Usinas ativas', valor: ativos.length, detalhe: `${marcas} marca(s)` },
    { rotulo: 'Potência instalada', valor: totalKwp, casas: 1, unidade: 'kWp' },
    { rotulo: 'Geração hoje', valor: totalHoje, casas: 1, unidade: 'kWh', destaque: true },
    { rotulo: 'Geração no mês', valor: totalMes, casas: 0, unidade: 'kWh', detalhe: 'mês corrente' },
    { rotulo: 'Gerando OK', valor: saudaveis.length, detalhe: `saúde ${okCount}/${ativos.length}` },
    { rotulo: 'Fora do normal', valor: problemas.length, detalhe: 'falha + atenção', href: falhas.length ? '/dashboard/monitoramento?painel=falha' : atencoes.length ? '/dashboard/monitoramento?painel=atencao' : undefined },
  ]);

  const alertasHtml = alertasResumo ? cartaoSecao({
    titulo: 'Alertas proativos',
    dica: sparkline7d && sparkline7d.length
      ? `Enviados nos últimos 7 dias: ${sparkline7d.map((d) => d.enviados).join(' · ')} (${sparkline7d.map((d) => d.dia.slice(5)).join(' · ')})`
      : undefined,
    corpoHtml: faixaKpis([
      { rotulo: 'Urgente', valor: alertasResumo.urgente },
      { rotulo: 'Aviso', valor: alertasResumo.aviso },
      { rotulo: 'Bombando', valor: alertasResumo.info },
    ]),
  }) : '';

  const evaHtml = kpisEva ? cartaoSecao({
    titulo: 'Eva no mês',
    corpoHtml: faixaKpis([
      { rotulo: 'Abordagens enviadas', valor: kpisEva.enviadas },
      { rotulo: 'Resolvido sozinho', valor: kpisEva.resolvidoSozinhoPct, unidade: '%', detalhe: `${kpisEva.resolvidoSozinhoCount} ocorrências` },
      { rotulo: 'Limpezas fechadas', valor: kpisEva.limpezasFechadasCount },
      { rotulo: 'Sem resposta', valor: kpisEva.semRespostaCount },
    ]),
  }) : '';

  const operacao = cartaoSecao({
    titulo: 'Painel de Operação',
    dica: problemas.length ? `${problemas.length} precisam de ação` : 'nada pedindo ação agora',
    corpoHtml: `${chips}<div class="cc-mon-gap"></div>${boardHtml}`,
  });

  const carteira = rows.length === 0
    ? cartaoSecao({
      titulo: 'Carteira',
      corpoHtml: `${estadoVazio({ tipo: 'vazio', titulo: 'Nenhum sistema cadastrado ainda.', texto: 'Importe a lista de usinas do portal do inversor para começar.', icone: 'sun' })}
        <p class="cc-mon-nota">${botao({ rotulo: 'Importar agora', href: '/dashboard/monitoramento/importar', icone: 'download' })}</p>`,
    })
    : cartaoSecao({
      titulo: 'Carteira',
      dica: `${rows.length} usina(s)`,
      corpoHtml: `${tabelaHtml}<div class="cc-mon-nota">Sincronização automática a cada 15 min. Página atualiza sozinha a cada 30 s.</div>`,
    });

  const body = `<div class="cc-root cc-mon">
    ${cabecalho}
    ${filtro}
    ${kpis}
    ${orbitaHtml}
    ${alertasHtml}
    ${evaHtml}
    ${operacao}
    ${carteira}
  </div>
  <style>${CSS_MONITORAMENTO}${CSS_MARCA}</style>`;
  const scripts = `<script>setTimeout(() => location.reload(), 30000);</script>`;
  return renderLayout({
    active: 'monitoramento', title: 'Monitoramento', body, scripts, user,
    tailwind: false, dark: temaDaTela(user, 'escuro') === 'escuro', largo: true,
  });
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

// CSS das telas da USINA (detalhe, dados, editar, importar) — renovação do
// miolo R9. Só classes cc-us-*; o resto vem do design system.
const CSS_USINA = `
.cc-us .cc-panel+.cc-panel,.cc-us .cc-kstrip+.cc-panel,.cc-us .cc-panel+.cc-kstrip,.cc-us .cc-aviso+.cc-panel{margin-top:16px}
.cc-us .cc-abas{margin-top:4px}
.cc-us-acoes{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.cc-us-acoes form{margin:0}
.cc-us-sub{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;font-size:13px;color:var(--cc-muted);margin-top:6px}
.cc-us-sub a{color:var(--cc-gold-2);font-weight:600}
.cc-us-sec{scroll-margin-top:16px}
.cc-us-sec+.cc-us-sec{margin-top:22px}
.cc-us-lista{display:flex;flex-direction:column;gap:8px}
.cc-us-nav{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.cc-us-nav .cc-us-per{font-family:var(--cc-f-num);font-size:13px;font-weight:600;color:var(--cc-text-2);min-width:9rem;text-align:center}
.cc-us-graf{position:relative;height:300px}
.cc-us-nota{font-size:12px;color:var(--cc-faint);margin-top:10px}
.cc-us-vazio{margin:0;font-size:13px}
.cc-us-perf{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.cc-us-perf .cc-big{font-size:34px;font-weight:700}
.cc-us-perf .cc-bar{flex:1 1 200px}
.cc-us-perf-crit .cc-big{color:var(--cc-crit)} .cc-us-perf-ok .cc-big{color:var(--cc-ok)} .cc-us-perf-info .cc-big{color:var(--cc-info)}
.cc-us-dados{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
.cc-us-dados div{padding:10px 12px;border:1px solid var(--cc-line);border-radius:10px;background:rgba(255,255,255,.02)}
.cc-us-dados small{display:block;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--cc-faint);font-weight:600;margin-bottom:3px}
.cc-us-dados span{font-size:13.5px;color:var(--cc-text)}
.cc-us-erro{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;word-break:break-word}
.cc-us-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.cc-us-grid-3{grid-template-columns:repeat(3,minmax(0,1fr))}
.cc-us-grid .cc-us-2col{grid-column:span 2}
.cc-us-form .cc-campo input,.cc-us-form .cc-campo select,.cc-us-form .cc-campo textarea{width:100%}
.cc-us-form textarea{width:100%}
.cc-us-dono{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border:1px solid var(--cc-line);border-radius:12px;margin-bottom:12px}
.cc-us-dono strong{display:block;color:var(--cc-text)}
.cc-us-dono small{display:block;color:var(--cc-muted);font-size:12px}
.cc-us-dica{font-size:12.5px;color:var(--cc-muted);margin:0 0 10px}
.cc-us-rodape{position:sticky;bottom:12px;display:flex;gap:10px;flex-wrap:wrap;margin-top:18px;padding:12px;border-radius:14px;background:var(--cc-surface-2);border:1px solid var(--cc-line-2);box-shadow:0 10px 26px rgba(0,0,0,.3)}
.cc-us-rodape .cc-btn{flex:1 1 180px;justify-content:center}
.cc-us-sel{display:flex;flex-direction:column;gap:8px}
.cc-us-sel-busca{position:relative}
.cc-us-sel-drop{position:absolute;z-index:20;left:0;right:0;top:calc(100% + 4px);max-height:14rem;overflow:auto;border-radius:10px;background:var(--cc-surface-2);border:1px solid var(--cc-line-2);box-shadow:0 12px 28px rgba(0,0,0,.35)}
.cc-us-sel-item{padding:8px 12px;font-size:13px;color:var(--cc-text);cursor:pointer}
.cc-us-sel-item:hover{background:var(--cc-surface-3)}
.cc-us-sel-item .cc-muted{font-size:12px}
.cc-us-sel-in,.cc-us-sel-novo input{width:100%}
.cc-us-sel-t{font-weight:600}
.cc-us-sel summary{cursor:pointer;font-size:12.5px;color:var(--cc-muted)}
.cc-us-sel-novo{display:flex;flex-direction:column;gap:8px;margin-top:8px}
.cc-us .mu-box{background:var(--cc-surface);border:1px solid var(--cc-line);border-radius:var(--cc-r);box-shadow:none;margin:0 0 16px}
.cc-us .mu-h b{color:var(--cc-text);font-size:15px}
.cc-us .mu-fonte{background:var(--cc-surface-3);color:var(--cc-text-2);border-color:var(--cc-line-2)}
.cc-us .mu-fonte-manual{background:var(--cc-ok-soft);color:var(--cc-ok);border-color:transparent}
.cc-us .mu-fonte-cidade,.cc-us .mu-fonte-nada{background:var(--cc-warn-soft);color:var(--cc-warn);border-color:transparent}
.cc-us .mu-map{border-color:var(--cc-line-2)}
.cc-us .mu-rod{color:var(--cc-muted)}
.cc-us .mu-st-ok{color:var(--cc-ok)} .cc-us .mu-st-erro{color:var(--cc-crit)}
.cc-us .mu-btn{background:var(--cc-surface-2);border-color:var(--cc-line-2);color:var(--cc-text);border-radius:10px}
.cc-us .mu-btn:hover{background:var(--cc-surface-3)}
.cc-us-imp{max-width:46rem}
.cc-us-imp fieldset{border:0;padding:0;margin:0}
.cc-us-imp fieldset>.cc-campo+.cc-campo,.cc-us-imp .cc-us-campos>.cc-campo+.cc-campo{margin-top:12px}
.cc-us-imp .cc-aviso{margin:12px 0 0}
.cc-us-imp .cc-aviso ol{margin:6px 0 0;padding-left:18px;list-style:decimal}
.cc-us-imp .cc-aviso a{text-decoration:underline;font-weight:600}
.cc-us-imp code{font-size:12px;padding:1px 4px;border-radius:4px;background:var(--cc-surface-3)}
.cc-us-imp .cc-us-linha{display:flex;gap:8px}
.cc-us-imp .cc-us-linha input{flex:1;min-width:0}
.cc-us-imp .cc-us-enviar{width:100%;justify-content:center;margin-top:16px;height:44px}
.cc-us-mono{font-family:ui-monospace,Menlo,Consolas,monospace}
.cc-us-como p{margin:0 0 8px;font-size:12.5px;color:var(--cc-muted)}
.cc-us-deye-res{margin-top:8px;font-size:12.5px}
.cc-us-deye-res .cc-aviso{margin:0}
.cc-us-deye-res button{display:block;width:100%;text-align:left;padding:6px 8px;border-radius:8px;color:var(--cc-text);font-size:12.5px}
.cc-us-deye-res button:hover{background:var(--cc-surface-3)}
@media (max-width:760px){
  .cc-us-grid,.cc-us-grid-3{grid-template-columns:minmax(0,1fr)}
  .cc-us-grid .cc-us-2col{grid-column:auto}
  .cc-us-graf{height:220px}
  .cc-us-acoes{width:100%}
  .cc-us-nav{width:100%;justify-content:space-between}
  .cc-us-dono{flex-direction:column;align-items:flex-start}
}
`;

/** Trilha comum das telas da usina. */
function trilhaUsina(s: { id: string; apelido: string }, final?: string): Array<{ rotulo: string; href?: string }> {
  const t: Array<{ rotulo: string; href?: string }> = [
    { rotulo: 'Usinas' },
    { rotulo: 'Monitoramento', href: '/dashboard/monitoramento' },
    { rotulo: s.apelido, href: final ? `/dashboard/monitoramento/${s.id}` : undefined },
  ];
  if (final) t.push({ rotulo: final });
  return t;
}

export function renderDetalheSistemaPage(
  d: DetalheCalendario,
  curvaDia?: IntradayPonto[] | null,
  curvaMsg?: string | null,
  dono?: { id: string; name: string | null } | null,
  timelineAbordagens?: AbordagemTimelineRow[],
  prontuarioHtml?: string,
  // [Degustação Sabion 27/07] sem o user o layout montava o menu completo e a
  // marca EcoSun pro tenant (modo compat de tela antiga).
  user?: DashUser,
  // Mapa das Usinas (28/09/2026): mini-mapa com alfinete arrastável
  // (mapa-usinas-views.ts#blocoMiniMapaUsina), montado pelo router.
  mapaHtml?: string,
): string {
  // Renovação do miolo — R9 (28/09/2026): mesmos dados, rotas e gráficos;
  // visual cc- com abas por âncora (#visao · #geracao · #manutencao · #dados).
  const s = d.sistema;
  const localizacao = [s.cidade, s.uf].filter(Boolean).join('/') || '—';
  const assistente = user && user.companyId !== ECOSUN_COMPANY_ID ? 'assistente' : 'Eva';
  const sid = escapeHtml(s.id);

  // Status da usina no cabeçalho — pela pior severidade dos alertas de hoje.
  const pior = d.alertas.some((a) => a.severidade === 'urgente') ? 'urgente'
    : d.alertas.some((a) => a.severidade === 'aviso') ? 'aviso' : null;
  const seloStatus = !s.ativo ? pilulaStatus('sem_dado', 'Pausada')
    : pior === 'urgente' ? pilulaStatus('critico', 'Falha')
      : pior === 'aviso' ? pilulaStatus('atencao', 'Atenção')
        : pilulaStatus('normal', 'Operando');

  // Alertas
  const tomAlerta: Record<string, Tom> = { urgente: 'critico', aviso: 'atencao', info: 'info' };
  const alertasHtml = d.alertas.length === 0
    ? aviso({ tom: 'ok', texto: 'Sistema operando normalmente, sem alertas.' })
    : `<div class="cc-us-lista">${d.alertas.map((a) => linhaLista({ tom: tomAlerta[a.severidade] ?? 'info', titulo: a.texto })).join('')}</div>`;

  // Dados pros graficos (Chart.js) — os MESMOS arrays de antes.
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const labelsPeriodo = d.serie.map((p) => {
    if (d.vista === 'ano') {
      const m = p.x.split('-')[1];
      return meses[parseInt(m, 10) - 1] ?? p.x;
    }
    return p.x.split('-')[2]; // dia do mes
  });
  const valoresPeriodo = d.serie.map((p) => Number(p.kwh.toFixed(1)));
  const serieToda0 = d.serie.length > 0 && d.serie.every((p) => p.kwh === 0);

  const labelsDia = (curvaDia ?? []).map((p) => p.hora);
  const valoresDia = (curvaDia ?? []).map((p) => Number(p.kw.toFixed(3)));
  const temEnergiaDia = (curvaDia ?? []).some((p) => typeof p.kwh === 'number');
  const valoresEnergiaDia = (curvaDia ?? []).map((p) => (typeof p.kwh === 'number' ? Number(p.kwh.toFixed(2)) : null));
  const totalEnergiaDia = temEnergiaDia
    ? Math.max(0, ...(curvaDia ?? []).map((p) => (typeof p.kwh === 'number' ? p.kwh : 0)))
    : null;
  const datasetsDia: Array<Record<string, unknown>> = [{
    label: 'Potência (kW)', data: valoresDia, borderColor: '#f59e0b',
    backgroundColor: 'rgba(245,158,11,0.15)', borderWidth: 2, fill: true,
    pointRadius: 0, tension: 0.3, yAxisID: 'y',
  }];
  if (temEnergiaDia) {
    datasetsDia.push({
      label: 'Energia acumulada (kWh)', data: valoresEnergiaDia, borderColor: '#0ea5e9',
      backgroundColor: 'rgba(14,165,233,0.10)', borderWidth: 2, fill: false,
      pointRadius: 0, tension: 0.3, yAxisID: 'y1',
    });
  }

  const labelsMensal = d.serieMensalCompleta.map((p) => {
    const [y, m] = p.mes.split('-');
    return `${meses[parseInt(m, 10) - 1]}/${y.slice(2)}`;
  });
  const valoresMensal = d.serieMensalCompleta.map((p) => Math.round(p.kwh));
  const esperadoMensal = d.serieMensalCompleta.map((p) => Math.round(p.esperado));

  // Performance 7d na MESMA régua da seção de alertas (29/07): relativa à
  // mediana da carteira quando existe; absoluta (HSP) senão.
  const esperado7Card = d.kpis.esperadoDiaKwh * 7;
  const real7Card = d.kpis.ratioUltimos7 * esperado7Card;
  const kwpCard = Number(s.potencia_kwp ?? 0);
  const medianaCard = d.kpis.medianaCarteira7d;
  const cardRelativo = medianaCard != null && medianaCard > 0 && kwpCard > 0 && real7Card > 0;
  const ratioPct = Math.round((cardRelativo ? (real7Card / kwpCard) / medianaCard : d.kpis.ratioUltimos7) * 100);
  const perfCls = ratioPct < 70 ? 'cc-us-perf-crit' : ratioPct > 110 ? 'cc-us-perf-ok' : 'cc-us-perf-info';

  // Dia/Mês/Ano + setas (◀▶) por calendário — MESMOS links de antes.
  const tab = (v: 'dia' | 'mes' | 'ano', txt: string) =>
    `<a href="/dashboard/monitoramento/${sid}?vista=${v}&ref=${escapeHtml(d.ref)}" class="cc-chip${d.vista === v ? ' cc-chip-on' : ''}"${d.vista === v ? ' aria-current="true"' : ''}>${txt}</a>`;
  const seta = (destino: string | null, simbolo: string, rotulo: string) =>
    destino
      ? `<a href="/dashboard/monitoramento/${sid}?vista=${d.vista}&ref=${destino}" class="cc-btn cc-btn-sm" aria-label="${rotulo}">${simbolo}</a>`
      : `<span class="cc-btn cc-btn-sm cc-btn-off" aria-disabled="true">${simbolo}</span>`;
  const navGrafico = `<div class="cc-us-nav"><div class="cc-chips">${tab('dia', 'Dia')}${tab('mes', 'Mês')}${tab('ano', 'Ano')}</div>
      ${seta(d.nav.anterior, '◀', 'Período anterior')}<span class="cc-us-per">${escapeHtml(d.nav.label)}</span>${seta(d.nav.proximo, '▶', 'Próximo período')}</div>`;

  const graficoMeio = d.vista === 'dia'
    ? (curvaDia && curvaDia.length > 0
        ? `${totalEnergiaDia !== null ? `<p class="cc-us-dica">Geração do dia: <b class="cc-num">${escapeHtml(fmtNumero(totalEnergiaDia, 1))} kWh</b></p>` : ''}
           <div class="cc-us-graf"><canvas id="graficoDia"></canvas></div>`
        : `${estadoVazio({ tipo: 'sem_dado', titulo: curvaMsg ?? 'Curva do dia indisponível.', texto: `Geração do dia: ${d.totalDiaKwh !== null ? `${fmtNumero(d.totalDiaKwh, 1)} kWh` : '—'}`, compacto: true })}`)
    : (serieToda0
        ? estadoVazio({ tipo: 'sem_dado', titulo: 'Sem geração registrada nesse período.', compacto: true })
        : `<div class="cc-us-graf"><canvas id="graficoPeriodo"></canvas></div>`);

  // Abordagens da assistente (timeline)
  const TIPO_EMOJI: Record<string, string> = { parabens: '☀️', depoimento: '⭐', queda: '📉', offline: '🔌' };
  const DESFECHO_LABEL: Record<string, string> = {
    resolvido_sozinho: 'resolvido sozinho ✅', limpeza_fechada: 'limpeza fechada 🧽', visita_agendada: 'visita agendada 🚗',
    transferido_junior: 'transferido 📞', sem_resposta: 'sem resposta 😶', descartada_junior: 'descartada —', em_andamento: 'em andamento 🔄',
  };
  const NOTA_LABEL: Record<string, string> = { boa: '👍', errou: '👎' };
  const abordagensHtml = !timelineAbordagens || timelineAbordagens.length === 0
    ? '<p class="cc-muted cc-us-vazio">Nenhuma abordagem ainda.</p>'
    : tabela({
      mobile: 'cartoes',
      colunas: [{ titulo: 'Data' }, { titulo: 'Tipo' }, { titulo: 'Mensagem' }, { titulo: 'Desfecho' }, { titulo: 'Nota' }],
      linhas: timelineAbordagens.map((a) => {
        const [, mm, dd] = a.created_at.slice(0, 10).split('-');
        const msg = a.mensagem_enviada
          ? a.mensagem_enviada.split('\n')[0].slice(0, 80) + (a.mensagem_enviada.length > 80 ? '…' : '')
          : null;
        return [
          { html: `<span class="cc-num">${escapeHtml(`${dd}/${mm}`)}</span>` },
          TIPO_EMOJI[a.tipo] ?? '🤖',
          msg,
          a.desfecho ? (DESFECHO_LABEL[a.desfecho] ?? a.desfecho) : null,
          a.nota_junior ? (NOTA_LABEL[a.nota_junior] ?? '') : '',
        ];
      }),
    });

  const acoes = `<div class="cc-us-acoes">
      <form action="/dashboard/monitoramento/${sid}/sync" method="post">${botao({ rotulo: 'Atualizar agora', tipo: 'submit', tom: 'ouro', icone: 'zap' })}</form>
      ${botao({ rotulo: 'Relatório', href: `/dashboard/monitoramento/${s.id}/relatorio`, icone: 'file' })}
      ${botao({ rotulo: 'Editar', href: `/dashboard/monitoramento/${s.id}/editar`, icone: 'cog' })}
      ${menuAcoes({ alinhar: 'dir', itensHtml: `
        ${botao({ rotulo: 'Dados do inversor', href: `/dashboard/monitoramento/${s.id}/dados`, icone: 'trend' })}
        <form action="/dashboard/monitoramento/${sid}/backfill" method="post" onsubmit="return confirm('Vai puxar TODO o histórico desde a instalação do sistema (até 10 anos se não tiver data cadastrada). Pode demorar 30s-2min dependendo do volume. Continuar?')">
          ${botao({ rotulo: 'Carregar histórico completo', tipo: 'submit', icone: 'cal' })}
        </form>` })}
    </div>`;

  const donoHtml = dono
    ? `<a href="/dashboard/clientes/${escapeHtml(dono.id)}">${escapeHtml(dono.name ?? 'cliente')}</a>`
    : `<a href="/dashboard/monitoramento/${sid}/editar">Sem proprietário — definir</a>`;

  const cabecalho = `${cabecalhoPagina({
    trilha: trilhaUsina(s),
    titulo: s.apelido,
    seloHtml: `${marcaCc(s.marca_inversor, true)}${seloStatus}`,
    acoesHtml: acoes,
  })}
    <div class="cc-us-sub">${donoHtml}<span>${escapeHtml(localizacao)}</span><span>${s.potencia_kwp ? `${escapeHtml(fmtNumero(Number(s.potencia_kwp), 2))} kWp` : 'sem potência'}</span>${s.data_instalacao ? `<span>Instalada em ${escapeHtml(formatDate(s.data_instalacao))}</span>` : ''}</div>`;

  const kpis = faixaKpis([
    { rotulo: 'Hoje', valor: d.kpis.hojeKwh, casas: 1, unidade: 'kWh', destaque: true, detalhe: `de ${fmtNumero(d.kpis.esperadoDiaKwh, 1)} esperado`, semDadoTexto: 'sem dados ainda' },
    { rotulo: 'Mês', valor: d.kpis.mesKwh, casas: 0, unidade: 'kWh', detalhe: 'mês corrente' },
    { rotulo: 'Ano', valor: d.kpis.anoKwh, casas: 0, unidade: 'kWh', detalhe: 'desde 1º de janeiro' },
    { rotulo: 'Total monitorado', valor: d.kpis.totalKwh, casas: 0, unidade: 'kWh', detalhe: 'desde o início do acompanhamento' },
  ]);

  const perf = cartaoSecao({
    titulo: 'Performance dos últimos 7 dias',
    dica: cardRelativo ? 'comparada com a média da carteira (kWh por kWp)' : 'real × esperado (kWp × HSP regional × 0,80)',
    corpoHtml: `<div class="cc-us-perf ${perfCls}"><span class="cc-big">${ratioPct}%</span>${barra(ratioPct, ratioPct < 70 ? 'crit' : ratioPct > 110 ? 'ok' : 'ouro')}</div>
      <p class="cc-us-nota">${cardRelativo
        ? 'Clima afeta todo mundo junto — só destoa quem tem problema. '
        : ''}${ratioPct < 70 ? 'Performance baixa — possível sujeira ou sombreamento.' : ratioPct > 110 ? `${cardRelativo ? 'Acima da média da carteira' : 'Acima do esperado'} — condições ótimas.` : 'Dentro da faixa normal de operação.'}</p>`,
  });

  const dadoSis = (rot: string, val: string | null | undefined) =>
    `<div><small>${escapeHtml(rot)}</small><span>${val && String(val).trim() ? escapeHtml(String(val)) : '—'}</span></div>`;

  const body = `<div class="cc-root cc-us">
    ${cabecalho}
    ${abas({ rotuloNav: 'Seções da usina', itens: [
      { rotulo: 'Visão geral', href: '#visao', ativo: true },
      { rotulo: 'Geração', href: '#geracao' },
      { rotulo: 'Manutenção', href: '#manutencao' },
      { rotulo: 'Dados', href: '#dados' },
    ] })}

    <div id="visao" class="cc-us-sec">
      ${kpis}
      ${perf}
      ${cartaoSecao({ titulo: 'Status e alertas', corpoHtml: alertasHtml })}
    </div>

    <div id="geracao" class="cc-us-sec">
      ${cartaoSecao({
        titulo: `Geração — ${d.nav.label}`,
        dica: d.vista === 'dia' ? 'potência (kW) ao vivo' : d.vista === 'ano' ? 'kWh por mês' : 'kWh por dia',
        acoesHtml: navGrafico,
        corpoHtml: graficoMeio,
      })}
      ${d.serieMensalCompleta.length > 1 ? cartaoSecao({
        titulo: 'Histórico mensal completo',
        dica: 'real × esperado',
        corpoHtml: `<div class="cc-us-graf"><canvas id="graficoMensal"></canvas></div>
          <p class="cc-us-nota">Todos os meses desde o início do acompanhamento. Use pra ver sazonalidade e degradação ano sobre ano.</p>`,
      }) : ''}
    </div>

    <div id="manutencao" class="cc-us-sec">
      ${prontuarioHtml ? cartaoSecao({ titulo: 'Prontuário de manutenção', corpoHtml: prontuarioHtml }) : ''}
      ${cartaoSecao({ titulo: `Abordagens da ${assistente}`, corpoHtml: abordagensHtml })}
    </div>

    <div id="dados" class="cc-us-sec">
      ${mapaHtml ?? ''}
      ${s.ultimo_erro ? `<div class="cc-aviso cc-aviso-erro" role="alert">${icone('alert', 'sm')}<span><strong>Último erro de sincronização:</strong> <span class="cc-us-erro">${escapeHtml(s.ultimo_erro)}</span></span></div>` : ''}
      ${cartaoSecao({
        titulo: 'Dados do sistema',
        acoesHtml: botao({ rotulo: 'Editar dados', href: `/dashboard/monitoramento/${s.id}/editar`, tamanho: 'sm' }),
        corpoHtml: `<div class="cc-us-dados">
          ${dadoSis('Marca do inversor', MARCAS_LABEL[s.marca_inversor] ?? s.marca_inversor)}
          ${dadoSis('Modelo do inversor', s.inversor_modelo)}
          ${dadoSis('Potência', s.potencia_kwp ? `${fmtNumero(Number(s.potencia_kwp), 2)} kWp` : null)}
          ${dadoSis('Painéis', [s.qtd_paineis ? `${s.qtd_paineis}×` : '', s.painel_marca ?? '', s.painel_modelo ?? ''].filter(Boolean).join(' '))}
          ${dadoSis('Local', localizacao === '—' ? null : localizacao)}
          ${dadoSis('Instalação', s.data_instalacao ? formatDate(s.data_instalacao) : null)}
        </div>
        <p class="cc-us-nota">Tensão, corrente e temperatura ao longo do dia: ${botao({ rotulo: 'Dados do inversor', href: `/dashboard/monitoramento/${s.id}/dados`, tamanho: 'sm', icone: 'trend' })}</p>`,
      })}
    </div>
  </div>
  <style>${CSS_USINA}${CSS_MARCA}</style>`;

  // Gráficos: os MESMOS arrays de antes; as cores vêm dos tokens (JS_TEMA_GRAFICOS).
  const scripts = `
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
${JS_TEMA_GRAFICOS}
<script>
  // Auto-refresh 30s pra mostrar dado mais fresco do nosso banco.
  // Recarrega a cada 30 s — menos enquanto alguém arrasta/salva o alfinete do mapa.
  setInterval(() => { if (!window.ccSegurarRecarga) location.reload(); }, 30000);
  var T = window.ccTema || {};
  function alfa(cor, a) { return /^#[0-9a-f]{6}$/i.test(cor || '') ? cor + Math.round(a * 255).toString(16).padStart(2, '0') : cor; }

  // Gráfico do meio na vista Mês/Ano: barras de kWh (por dia / por mês).
  const ctxPeriodo = document.getElementById('graficoPeriodo');
  if (ctxPeriodo) {
    new Chart(ctxPeriodo, {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(labelsPeriodo)},
        datasets: [
          { label: 'Geração (kWh)', data: ${JSON.stringify(valoresPeriodo)}, backgroundColor: T.gold || '#f59e0b', borderRadius: 4 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: 'kWh' } },
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 15 } }
        }
      }
    });
  }

  // Gráfico do meio na vista Dia: curva de potência (kW) ao vivo.
  const ctxDia = document.getElementById('graficoDia');
  if (ctxDia) {
    var dsDia = ${JSON.stringify(datasetsDia)};
    if (T.gold) { dsDia[0].borderColor = T.gold; dsDia[0].backgroundColor = alfa(T.gold, 0.15); }
    if (dsDia[1] && T.info) { dsDia[1].borderColor = T.info; dsDia[1].backgroundColor = alfa(T.info, 0.1); }
    new Chart(ctxDia, {
      type: 'line',
      data: { labels: ${JSON.stringify(labelsDia)}, datasets: dsDia },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'top' } },
        scales: {
          y: { beginAtZero: true, position: 'left', title: { display: true, text: 'kW' } },
          ${temEnergiaDia ? `y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'kWh' } },` : ''}
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } }
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
          { label: 'Real (kWh)', data: ${JSON.stringify(valoresMensal)}, backgroundColor: T.ok || '#10b981', borderRadius: 6 },
          { label: 'Esperado (kWh)', data: ${JSON.stringify(esperadoMensal)}, backgroundColor: alfa(T.off, 0.55) || '#cbd5e1', borderRadius: 6 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: { y: { beginAtZero: true, title: { display: true, text: 'kWh' } }, x: { grid: { display: false } } }
      }
    });
  }
</script>`;

  return renderLayout({
    active: 'monitoramento', title: s.apelido, body, scripts, user,
    tailwind: false, dark: temaDaTela(user, 'claro') === 'escuro', largo: true,
  });
}

// =========================================================================
// TELA "DADOS" — telemetria completa (tensão/corrente/potência/etc no tempo)
// =========================================================================
export function renderTelemetriaPage(
  sistema: { id: string; apelido: string },
  devices: string[],
  grandezas: Array<{ ponto: string; rotulo: string; unidade: string }>,
  sel: { device: string; ponto: string; periodo: 'dia' | 'semana' | 'mes' },
  serie: Array<{ ts: string; valor: number }>,
  user?: DashUser,
): string {
  // Renovação do miolo — R9: mesmo GET (device/ponto/periodo) e mesmo gráfico.
  const g = grandezas.find((x) => x.ponto === sel.ponto);
  const unidade = g?.unidade ?? '';
  const rotulo = g?.rotulo ?? sel.ponto;
  // Rótulo do eixo X: só hora no "dia", dia+hora no resto.
  const labels = serie.map((p) => sel.periodo === 'dia'
    ? p.ts.slice(11, 16)
    : `${p.ts.slice(8, 10)}/${p.ts.slice(5, 7)} ${p.ts.slice(11, 16)}`);
  const valores = serie.map((p) => p.valor);

  const opt = (v: string, txt: string, cur: string) =>
    `<option value="${escapeHtml(v)}"${v === cur ? ' selected' : ''}>${escapeHtml(txt)}</option>`;
  const selDevice = devices.map((d) => opt(d, d, sel.device)).join('');
  const selGrandeza = grandezas.map((x) => opt(x.ponto, `${x.rotulo} (${x.unidade})`, sel.ponto)).join('');
  const periodos = [['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês']] as const;
  const selPeriodo = periodos.map(([v, t]) => opt(v, t, sel.periodo)).join('');

  const base = `/dashboard/monitoramento/${escapeHtml(sistema.id)}/dados`;

  const grafico = devices.length === 0
    ? estadoVazio({ tipo: 'sem_dado', titulo: 'Ainda não há dados do inversor para esta usina.', texto: 'A coleta roda a cada 15 min — volte em alguns minutos.' })
    : serie.length === 0
      ? estadoVazio({ tipo: 'sem_dado', titulo: `Sem dados de "${rotulo}" nesse período.`, compacto: true })
      : `<div class="cc-us-graf cc-us-graf-t"><canvas id="graficoTelemetria"></canvas></div>`;

  const filtro = `<form method="get" action="${base}" class="cc-form cc-us-grid cc-us-grid-3" id="form-telemetria">
      <label class="cc-campo"><span>Inversor</span><select name="device" onchange="document.getElementById('form-telemetria').submit()">${selDevice || '<option>—</option>'}</select></label>
      <label class="cc-campo"><span>Grandeza</span><select name="ponto" onchange="document.getElementById('form-telemetria').submit()">${selGrandeza}</select></label>
      <label class="cc-campo"><span>Período</span><select name="periodo" onchange="document.getElementById('form-telemetria').submit()">${selPeriodo}</select></label>
    </form>`;

  const body = `<div class="cc-root cc-us">
    ${cabecalhoPagina({
      trilha: trilhaUsina(sistema, 'Dados do inversor'),
      titulo: sistema.apelido,
      subtitulo: 'Dados detalhados do inversor (tensão, corrente, potência, temperatura…) ao longo do tempo.',
      acoesHtml: botao({ rotulo: '← Voltar pra usina', href: `/dashboard/monitoramento/${sistema.id}` }),
    })}
    ${cartaoSecao({ titulo: 'O que ver', corpoHtml: filtro })}
    ${cartaoSecao({ titulo: g ? `${rotulo} (${unidade})` : 'Gráfico', corpoHtml: grafico })}
  </div>
  <style>${CSS_USINA}.cc-us-graf-t{height:340px}@media (max-width:760px){.cc-us-graf-t{height:240px}}</style>`;

  const scripts = serie.length > 0 ? `
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
${JS_TEMA_GRAFICOS}
<script>
    var T = window.ccTema || {};
    const ctxT = document.getElementById('graficoTelemetria');
    if (ctxT) {
      new Chart(ctxT, {
        type: 'line',
        data: {
          labels: ${JSON.stringify(labels)},
          datasets: [{
            label: ${jsonNoScript(`${rotulo} (${unidade})`)},
            data: ${JSON.stringify(valores)},
            borderColor: T.info || '#0ea5e9',
            backgroundColor: 'rgba(56,189,248,0.12)',
            borderWidth: 2, fill: true, pointRadius: 0, tension: 0.25,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'top' } },
          scales: {
            y: { title: { display: true, text: ${jsonNoScript(unidade)} } },
            x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } }
          }
        }
      });
    }
</script>
  ` : '';

  return renderLayout({
    active: 'monitoramento', title: `Dados — ${sistema.apelido}`, body, scripts, user,
    tailwind: false, dark: temaDaTela(user, 'claro') === 'escuro', largo: true,
  });
}

/** JSON dentro de <script>: "<" vira < (um rótulo com "</script>" não fecha o bloco). */
function jsonNoScript(v: unknown): string {
  return JSON.stringify(v).replace(/</g, '\\u003c');
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
  'Huawei', 'Fronius', 'SMA', 'GoodWe', 'APsystems', 'SolaX', 'SAJ',
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
  user?: DashUser,
): string {
  // Renovação do miolo — R9: MESMO POST /:id/editar com os mesmos campos; o
  // formulário ganha class="cc-form" e cada bloco vira um painel.
  const dl = (id: string, items: string[]) =>
    `<datalist id="${id}">${items.map(i => `<option value="${escapeHtml(i)}"></option>`).join('')}</datalist>`;

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
  const campo = (rot: string, html: string, cls = '') => `<label class="cc-campo${cls ? ` ${cls}` : ''}"><span>${escapeHtml(rot)}</span>${html}</label>`;

  const proprietario = `${dono ? `
      <div class="cc-us-dono">
        <div>
          <strong>${escapeHtml(dono.name ?? '(sem nome)')}</strong>
          <small>${escapeHtml(dono.phone ?? '')}</small>
          <a href="/dashboard/clientes/${escapeHtml(dono.id)}" class="cc-link">ver cliente →</a>
        </div>
        <button type="submit" name="desvincular" value="1" class="cc-btn cc-btn-sm cc-btn-crit">Desvincular</button>
      </div>
      <p class="cc-us-dica">Trocar de proprietário? Busque outro cliente abaixo.</p>` : `
      <p class="cc-us-dica">Esta usina ainda não tem proprietário. Vincule um cliente:</p>`}
      ${renderClienteSelector({ idPrefix: 'prop', dark: false, cc: true })}`;

  const body = `<div class="cc-root cc-us">
    ${cabecalhoPagina({
      trilha: trilhaUsina(s, 'Editar'),
      titulo: 'Editar dados do sistema',
      subtitulo: 'Quanto mais detalhe, mais precisa fica a análise (PR, ranking, calibragem de propostas).',
      acoesHtml: botao({ rotulo: `← Voltar pra ${s.apelido}`, href: `/dashboard/monitoramento/${s.id}` }),
    })}

    <form action="/dashboard/monitoramento/${escapeHtml(s.id)}/editar" method="post" class="cc-form cc-us-form">
      ${dl('paineis-marcas', PAINEIS_SUGESTOES)}
      ${dl('paineis-modelos', PAINEIS_MODELOS_SUGESTOES)}
      ${dl('inversores-modelos', INVERSORES_MODELOS_SUGESTOES)}

      ${cartaoSecao({ titulo: 'Identificação', corpoHtml: `<div class="cc-us-grid">
        ${campo('Apelido', `<input name="apelido" type="text" value="${escapeHtml(s.apelido)}" required>`)}
        ${campo('Potência (kWp)', `<input name="potencia_kwp" type="number" step="0.01" value="${s.potencia_kwp ?? ''}">`)}
        ${campo('Cidade', `<input name="cidade" type="text" value="${escapeHtml(s.cidade ?? '')}">`)}
        ${campo('UF', `<input name="uf" type="text" maxlength="2" value="${escapeHtml(s.uf ?? '')}" style="text-transform:uppercase">`)}
        ${campo('Data de instalação', `<input name="data_instalacao" type="date" value="${escapeHtml(s.data_instalacao ?? '')}">`)}
        ${campo('Ativo', `<select name="ativo">
            <option value="true" ${s.ativo ? 'selected' : ''}>Sim</option>
            <option value="false" ${!s.ativo ? 'selected' : ''}>Não (pausar monitoramento)</option>
          </select>`)}
      </div>` })}

      ${cartaoSecao({ titulo: 'Proprietário', corpoHtml: proprietario })}

      ${cartaoSecao({ titulo: 'Painéis solares', corpoHtml: `<div class="cc-us-grid cc-us-grid-3">
        ${campo('Marca', `<input name="painel_marca" type="text" list="paineis-marcas" value="${escapeHtml(s.painel_marca ?? '')}" placeholder="Ex: Trina Solar">`)}
        ${campo('Modelo', `<input name="painel_modelo" type="text" list="paineis-modelos" value="${escapeHtml(s.painel_modelo ?? '')}" placeholder="Ex: TSM-NEG21C.20-700">`, 'cc-us-2col')}
        ${campo('Quantidade', `<input name="qtd_paineis" type="number" min="1" value="${s.qtd_paineis ?? ''}" placeholder="Ex: 12">`)}
      </div>` })}

      ${cartaoSecao({ titulo: 'Inversor (modelo específico)', corpoHtml: `
        ${campo('Modelo', `<input name="inversor_modelo" type="text" list="inversores-modelos" value="${escapeHtml(s.inversor_modelo ?? '')}" placeholder="Ex: Sungrow SG5.0RS-L">`)}
        <p class="cc-us-nota">Marca já é <strong>${escapeHtml(MARCAS_LABEL[s.marca_inversor] ?? s.marca_inversor)}</strong> (vinda da API). Aqui é o modelo específico.</p>` })}

      ${cartaoSecao({ titulo: 'Telhado', corpoHtml: `<div class="cc-us-grid">
        ${campo('Tipo', `<select name="telhado_tipo">
            ${tiposTelhado.map(t => `<option value="${t.v}" ${s.telhado_tipo === t.v ? 'selected' : ''}>${escapeHtml(t.l)}</option>`).join('')}
          </select>`)}
        ${campo('Orientação predominante', `<select name="telhado_orientacao">
            ${orientacoes.map(o => `<option value="${o.v}" ${s.telhado_orientacao === o.v ? 'selected' : ''}>${escapeHtml(o.l)}</option>`).join('')}
          </select>`)}
        ${campo('Inclinação (graus)', `<input name="telhado_inclinacao_graus" type="number" min="0" max="90" value="${s.telhado_inclinacao_graus ?? ''}" placeholder="Ex: 23">`)}
        ${campo('Sombreamento estimado (%)', `<input name="sombreamento_pct" type="number" min="0" max="100" value="${s.sombreamento_pct ?? ''}" placeholder="0 = sem sombra">`)}
      </div>` })}

      ${cartaoSecao({ titulo: 'Observações', corpoHtml: `<textarea name="observacoes" rows="3" placeholder="Manutenções, situações especiais, troca de equipamento, etc." aria-label="Observações">${escapeHtml(s.observacoes ?? '')}</textarea>` })}

      <div class="cc-us-rodape">
        ${botao({ rotulo: 'Salvar alterações', tipo: 'submit', tom: 'ouro', icone: 'check' })}
        ${botao({ rotulo: 'Cancelar', href: `/dashboard/monitoramento/${s.id}` })}
      </div>
    </form>
  </div>
  <style>${CSS_USINA}</style>`;

  return renderLayout({
    active: 'monitoramento', title: `Editar ${s.apelido}`, body, user,
    tailwind: false, dark: temaDaTela(user, 'claro') === 'escuro',
  });
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
  /** Quem está vendo (R0): sem ele, o tenant via a casca da EcoSun. */
  user: DashUser | undefined;
}

export function renderImportarSitesPage(input: ImportarPageInput): string {
  const { errorMsg, successMsg, novos, atualizados, total, sitesNomes, user } = input;
  // Renovação do miolo — R9: MESMO POST /monitoramento/importar com os mesmos
  // campos de todas as marcas; as 15 mensagens de erro da rota aparecem num
  // aviso de erro com o mesmo texto.
  const ehTenant = !!user && user.companyId !== ECOSUN_COMPANY_ID;

  const erro = errorMsg ? aviso({ tom: 'erro', texto: errorMsg }) : '';

  const sucesso = successMsg
    ? `<div class="cc-aviso cc-aviso-ok" role="status">${icone('check', 'sm')}<div>
        <strong>${escapeHtml(successMsg)}</strong>
        <div>${escapeHtml(String(total ?? 0))} sites encontrados — ${escapeHtml(String(novos ?? 0))} novos cadastrados, ${escapeHtml(String(atualizados ?? 0))} atualizados.</div>
        ${sitesNomes && sitesNomes.length > 0 ? `
          <details class="cc-us-sites">
            <summary class="cc-link">Ver lista de sites</summary>
            <ul>${sitesNomes.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul>
          </details>` : ''}
      </div></div>`
    : '';

  const campo = (rot: string, html: string, dica?: string) =>
    `<div class="cc-campo"><span class="cc-rot">${rot}</span>${html}${dica ? `<small class="cc-us-dica">${dica}</small>` : ''}</div>`;
  const nota = (tom: 'info' | 'ok' | 'atencao', html: string) =>
    `<div class="cc-aviso cc-aviso-${tom}">${icone(tom === 'ok' ? 'check' : tom === 'info' ? 'bell' : 'alert', 'sm')}<div>${html}</div></div>`;

  // Sungrow: o endereço de retorno é o do APP de quem autoriza. O da EcoSun
  // só vem preenchido para a EcoSun (tenant não vê a marca da casa).
  const redirectPadrao = ehTenant ? '' : 'https://www.ecosunpowerenergia.com.br';
  const exemploRetorno = ehTenant ? 'o seu endereço de retorno' : '...ecosunpowerenergia.com.br';

  const form = `
      <form action="/dashboard/monitoramento/importar" method="post" class="cc-form cc-us-imp" id="form-importar">
        ${campo('<label for="marca">Marca do inversor</label>', `<select name="marca" id="marca" required
                  onchange="['solaredge','deye','nep','abb','foxess','goodwe','solis','sungrow','saj'].forEach(function(m){var el=document.getElementById('campos-'+m);if(!el)return;var ativo=document.getElementById('marca').value===m;el.style.display=ativo?'block':'none';el.disabled=!ativo;});">
            <option value="solaredge">SolarEdge</option>
            <option value="deye">Deye Cloud</option>
            <option value="nep">NEP (microinversores BDM)</option>
            <option value="abb">ABB / FIMER Aurora Vision</option>
            <option value="foxess">FoxESS (micro Q1 / inversores)</option>
            <option value="goodwe">GoodWe (SEMS Portal)</option>
            <option value="solis">Solis (SolisCloud API)</option>
            <option value="sungrow">Sungrow (iSolarCloud OpenAPI)</option>
            <option value="saj">SAJ (elekeeper / eSolar)</option>
            <option value="hoymiles" disabled>Hoymiles (em breve)</option>
            <option value="huawei" disabled>Huawei (em breve)</option>
          </select>`)}

        <fieldset id="campos-solaredge">
          ${campo('<label for="api_key">API Key da conta SolarEdge</label>', `<input id="api_key" name="api_key" type="text" class="cc-us-mono" placeholder="cola aqui a API key gerada no painel SolarEdge">`,
            'Pega em: monitoring.solaredge.com → Admin → Site Access → API Access.')}
        </fieldset>

        <fieldset id="campos-deye" style="display:none" disabled>
          <div class="cc-us-campos">
            ${campo('Data Center', `<select name="dataCenter">
                <option value="us1">US1 (Americas — recomendado pra Brasil)</option>
                <option value="eu1">EU1 (Europa)</option>
              </select>`, 'Mesmo que o portal mostre "AMEA", a API real fica em US1 ou EU1.')}
            ${campo('AppId', '<input name="appId" type="text" class="cc-us-mono" placeholder="Ex: 202601151929002">')}
            ${campo('AppSecret', '<input name="appSecret" type="password" class="cc-us-mono" placeholder="cola o AppSecret do portal Deye">')}
            ${campo('E-mail da conta master Deye', '<input name="email" type="email" placeholder="seu email Deye">')}
            ${campo('Senha da conta Deye', '<input name="password" type="password" placeholder="senha Deye">')}
            ${campo('Company ID <span class="cc-faint">(opcional)</span>', `<div class="cc-us-linha">
                <input id="deye-companyId" name="companyId" type="text" class="cc-us-mono" placeholder="vazio = perfil pessoal · clique pra listar empresas">
                <button type="button" id="deye-buscar-empresas" class="cc-btn">🔍 Buscar empresas</button>
              </div>
              <div id="deye-empresas-result" class="cc-us-deye-res"></div>`)}
          </div>
          ${nota('atencao', `<strong>Onde achar:</strong> developer.deyecloud.com → Application →
            AppId visível, AppSecret oculto (clica no olho). E-mail/senha são da conta
            Deye master que vê todas as plantas. Company ID aparece no app/portal Deye
            ao trocar entre Personal e empresas (super admin).`)}
        </fieldset>

        <fieldset id="campos-nep" style="display:none" disabled>
          <div class="cc-us-campos">
            ${campo('E-mail da conta NEPViewer', '<input name="nep_email" type="email" placeholder="email do instalador NEPViewer">')}
            ${campo('Senha da conta NEPViewer', '<input name="nep_password" type="password" placeholder="senha NEPViewer">')}
          </div>
          ${nota('ok', `<strong>Renovação automática (recomendado):</strong> com e-mail e senha, o sistema
            <strong>loga sozinho e renova o token quando expira</strong> — você <strong>nunca mais</strong>
            precisa mexer. Igual ABB/Deye.`)}
          <details class="cc-us-sites">
            <summary class="cc-link">Alternativa avançada: colar um token (JWT) direto</summary>
            <textarea id="nep_jwt" name="jwt" rows="2" class="cc-us-mono"
              placeholder="opcional — cola um JWT do localStorage do NEPViewer (expira em ~30 dias, sem renovação automática)"></textarea>
            <small class="cc-us-dica">Use só se preferir não guardar a senha. Captura: F12 → Console → <code>copy(JSON.parse(localStorage.getItem('userInfo')).token)</code>. Esse jeito expira em ~30 dias e precisa renovar na mão.</small>
          </details>
        </fieldset>

        <fieldset id="campos-abb" style="display:none" disabled>
          <div class="cc-us-campos">
            ${campo('E-mail (UserID Aurora Vision)', '<input name="userId" type="email" placeholder="email da conta instalador">')}
            ${campo('Senha Aurora Vision', '<input name="abb_password" type="password" placeholder="senha">')}
            ${campo('API Key', '<input name="apiKey" type="text" class="cc-us-mono" placeholder="X-AuroraVision-ApiKey">')}
          </div>
          ${nota('atencao', `<strong>Como pegar a API Key:</strong>
            <ol>
              <li>Loga em <a href="https://www.auroravision.net/" target="_blank" rel="noopener">auroravision.net</a> com a conta de instalador</li>
              <li>Menu superior → <strong>Account</strong> → <strong>API Access</strong> (ou Settings → Developer)</li>
              <li>Gera/copia a <strong>API Key</strong> (campo "X-AuroraVision-ApiKey")</li>
              <li>Cola aqui junto com seu e-mail e senha de login do portal</li>
            </ol>`)}
          ${nota('info', `<strong>Renovação automática:</strong> diferente do NEP, o adapter ABB faz o login
            sozinho usando o e-mail e senha. Token interno renova a cada 50 minutos sem você fazer nada.`)}
        </fieldset>

        <fieldset id="campos-foxess" style="display:none" disabled>
          ${campo('<label for="foxess_api_key">API Key da conta FoxESS</label>', '<input id="foxess_api_key" name="foxess_api_key" type="text" class="cc-us-mono" placeholder="cola aqui a API Key gerada no FoxESS Cloud">')}
          ${nota('atencao', `<strong>Como pegar a API Key (1 minuto):</strong>
            <ol>
              <li>Acessa <a href="https://www.foxesscloud.com" target="_blank" rel="noopener">www.foxesscloud.com</a> (com o <strong>www.</strong>) e faz login</li>
              <li>Canto superior direito → seu perfil → <strong>API Management</strong></li>
              <li>Clica em <strong>Generate API Key</strong> e <strong>copia na hora</strong> (só aparece uma vez)</li>
              <li>Cola aqui. A mesma chave lista todos os inversores da conta.</li>
            </ol>`)}
          ${nota('info', `<strong>Sem expiração / sem login:</strong> a API Key já é o acesso — o adapter usa
            ela direto (assinatura por chamada). Limite de ~1440 chamadas/dia por inversor, de sobra
            pro monitoramento diário.`)}
        </fieldset>

        <fieldset id="campos-goodwe" style="display:none" disabled>
          <div class="cc-us-campos">
            ${campo('E-mail da conta SEMS Portal', '<input name="goodwe_email" type="email" placeholder="e-mail do instalador SEMS">')}
            ${campo('Senha da conta SEMS Portal', '<input name="goodwe_password" type="password" placeholder="senha SEMS">')}
          </div>
          ${nota('ok', `<strong>Renovação automática:</strong> com e-mail e senha do SEMS Portal, o adapter
            <strong>loga sozinho e renova o token quando expira</strong> — você não mexe mais. A mesma
            conta de instalador lista <strong>todas as usinas</strong> (as novas aparecem sozinhas).`)}
        </fieldset>

        <fieldset id="campos-saj" style="display:none" disabled>
          <div class="cc-us-campos">
            ${campo('Usuário do portal elekeeper/eSolar', '<input name="saj_username" type="text" placeholder="login do instalador no portal SAJ">')}
            ${campo('Senha do portal elekeeper/eSolar', '<input name="saj_password" type="password" placeholder="senha do portal SAJ">')}
          </div>
          ${nota('ok', `<strong>Renovação automática:</strong> com usuário e senha do portal, o adapter
            <strong>loga sozinho e renova o token quando expira</strong>. A mesma conta de
            instalador lista <strong>todas as usinas</strong> (as novas aparecem sozinhas).`)}
        </fieldset>

        <fieldset id="campos-solis" style="display:none" disabled>
          <div class="cc-us-campos">
            ${campo('KeyId da API SolisCloud', '<input name="solis_key_id" type="text" class="cc-us-mono" placeholder="ex.: 1300386381676633638">')}
            ${campo('KeySecret da API SolisCloud', '<input name="solis_key_secret" type="text" class="cc-us-mono" placeholder="cola aqui o KeySecret">')}
            ${campo('API URL (opcional)', '<input name="solis_api_url" type="text" class="cc-us-mono" value="https://www.soliscloud.com:13333">')}
          </div>
          ${nota('atencao', `<strong>Como pegar (1 minuto):</strong>
            <ol>
              <li>No app <strong>SolisCloud</strong> (ou soliscloud.com) logado como instalador</li>
              <li>Menu <strong>Serviço → Gerenciamento de API</strong>, aceita os termos</li>
              <li>Gera e copia o <strong>KeyId</strong> e o <strong>KeySecret</strong></li>
              <li>A mesma chave lista <strong>todas as usinas</strong> da conta (as novas aparecem sozinhas).</li>
            </ol>`)}
          ${nota('info', `<strong>API oficial:</strong> a chave já é o acesso (assinatura por chamada, sem login).
            Limite de ~1 chamada/segundo — o sistema respeita o ritmo sozinho.`)}
        </fieldset>

        <fieldset id="campos-sungrow" style="display:none" disabled>
          <div class="cc-us-campos">
            ${campo('Appkey do app iSolarCloud', '<input name="sungrow_appkey" type="text" class="cc-us-mono" placeholder="ex.: 42A190E0D6873F64206A3AC1498A29EB">')}
            ${campo('Secret key (x-access-key)', '<input name="sungrow_secret" type="text" class="cc-us-mono" placeholder="cola aqui a Secret key do app">')}
            ${campo('Application ID', `<input id="sungrow_app_id" name="sungrow_app_id" type="text" class="cc-us-mono" placeholder="ex.: 3229"
                     oninput="var b=document.getElementById('sungrow-auth-link');var id=this.value.trim();var rd=encodeURIComponent((document.getElementById('sungrow_redirect')||{}).value||'');b.href=id?('https://web3.isolarcloud.com.hk/#/authorized-app?cloudId=2&applicationId='+id+'&redirectUrl='+rd):'#';b.style.pointerEvents=id?'auto':'none';b.style.opacity=id?'1':'0.5';">`)}
            ${campo('Redirect URL (igual à cadastrada no app)', `<input id="sungrow_redirect" name="sungrow_redirect" type="text" class="cc-us-mono" value="${escapeHtml(redirectPadrao)}" placeholder="https://… (a mesma cadastrada no seu app)">`)}
            ${campo('Código de autorização', '<input name="sungrow_code" type="text" class="cc-us-mono" placeholder="o code que aparece na URL depois de autorizar">')}
          </div>
          ${nota('atencao', `<strong>Como pegar o código (só na 1ª vez):</strong>
            <ol>
              <li>Preencha o <strong>Application ID</strong> acima e clique em
                <a id="sungrow-auth-link" href="#" target="_blank" rel="noopener" style="pointer-events:none;opacity:0.5">Abrir a tela de autorização →</a></li>
              <li>Logado como dono das usinas, <strong>selecione as usinas</strong>, aceite e clique em <strong>"Concordar e autorizar"</strong>.</li>
              <li>A página vai redirecionar pra <code>${escapeHtml(exemploRetorno)}/?code=<strong>XXXXXX</strong></code>. Copie o valor do <strong>code</strong> e cole aqui.</li>
            </ol>`)}
          ${nota('ok', `<strong>Depois disso, renova sozinho:</strong> o código é trocado por um token que o
            sistema renova automaticamente. Você só repete se revogar o acesso. Use um app
            <strong>só de Monitoring</strong> (com "Grid control" a autorização falha).`)}
        </fieldset>

        <button type="submit" class="cc-btn cc-btn-gold cc-us-enviar">📥 Importar agora</button>
      </form>`;

  const body = `<div class="cc-root cc-us">
    ${cabecalhoPagina({
      trilha: [{ rotulo: 'Usinas' }, { rotulo: 'Monitoramento', href: '/dashboard/monitoramento' }, { rotulo: 'Importar' }],
      titulo: 'Importar sistemas em massa',
      subtitulo: 'Cole a chave de acesso da conta e o sistema cadastra todas as usinas automaticamente.',
      acoesHtml: botao({ rotulo: '← Voltar pro monitoramento', href: '/dashboard/monitoramento' }),
    })}
    ${erro}
    ${sucesso}
    ${cartaoSecao({ titulo: 'Conta do portal do inversor', corpoHtml: form, classe: 'cc-us-imp' })}
    ${cartaoSecao({ titulo: 'Como funciona', classe: 'cc-us-imp cc-us-como', corpoHtml: `
      <p><strong>Importar:</strong> chamamos a API da marca selecionada com as suas credenciais,
      recebemos todas as usinas da conta e cadastramos cada uma no monitoramento.</p>
      <p><strong>Atualização automática:</strong> de hora em hora o sistema re-consulta a API e
      cadastra usinas novas que apareceram no painel da marca — sem você fazer nada.</p>
      <p><strong>Re-importar:</strong> rodar de novo é seguro — usinas que já existem só são atualizadas (apelido, potência, etc).</p>` })}
  </div>
  <style>${CSS_USINA}.cc-us-sites{margin-top:8px}.cc-us-sites ul{margin:6px 0 0;padding-left:18px;list-style:disc;font-size:12.5px}.cc-us-sites textarea{margin-top:8px;width:100%}</style>`;

  // JS pro botao "Buscar empresas Deye" — chama o endpoint AJAX, mostra a
  // lista de companyId / companyName, ao clicar numa preenche o input.
  // Tudo que vem da API é escapado antes de ir pro innerHTML.
  const scripts = `
<script>
  (function(){
    var btn = document.getElementById('deye-buscar-empresas');
    if (!btn) return;
    var resultDiv = document.getElementById('deye-empresas-result');
    var inputId = document.getElementById('deye-companyId');
    function esc(s){ var d=document.createElement('div'); d.appendChild(document.createTextNode(s==null?'':String(s))); return d.innerHTML; }
    function aviso(tom, html){ return '<div class="cc-aviso cc-aviso-'+tom+'">'+html+'</div>'; }
    btn.addEventListener('click', async function(){
      function v(name){ var el = document.querySelector('[name="'+name+'"]'); return el ? el.value : ''; }
      var creds = { appId: v('appId'), appSecret: v('appSecret'), email: v('email'), password: v('password'), dataCenter: v('dataCenter') };
      if (!creds.appId || !creds.appSecret || !creds.email || !creds.password) {
        resultDiv.innerHTML = aviso('erro', 'Preenche AppId, AppSecret, e-mail e senha primeiro.');
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
          resultDiv.innerHTML = aviso('atencao', 'Nenhuma empresa encontrada.');
        } else {
          var html = '<div class="cc-aviso cc-aviso-ok"><div><strong>Empresas encontradas — clica pra usar:</strong>';
          for (var i = 0; i < data.empresas.length; i++) {
            var e = data.empresas[i];
            html += '<button type="button" data-id="'+esc(e.companyId)+'" class="cc-us-mono"><strong>'+esc(e.companyId)+'</strong> · '+esc(e.companyName)+' <span class="cc-muted">('+esc(e.roleName)+')</span></button>';
          }
          html += '</div></div>';
          resultDiv.innerHTML = html;
          resultDiv.querySelectorAll('button[data-id]').forEach(function(b){
            b.addEventListener('click', function(){
              inputId.value = b.getAttribute('data-id');
              resultDiv.innerHTML = aviso('ok', 'Company ID '+esc(inputId.value)+' selecionado. Clica em "Importar agora".');
            });
          });
        }
      } catch(err) {
        resultDiv.innerHTML = aviso('erro', 'Erro: '+esc(err.message || err));
      } finally {
        btn.disabled = false; btn.textContent = '🔍 Buscar empresas';
      }
    });
  })();
</script>`;

  return renderLayout({
    active: 'monitoramento', title: 'Importar sites', body, scripts, user,
    tailwind: false, dark: temaDaTela(user, 'claro') === 'escuro',
  });
}

// =========================================================================
// MANUTENCAO — clientes com lembrete pendente
// =========================================================================

// Código morto (o router usa a de manutencao-views.ts) — sai no R13. Recebe
// `user` só pra passar no teto do R0 (renderLayout sempre com user).
export function renderManutencaoPage(rows: ManutencaoRow[], user?: DashUser): string {
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

  return renderLayout({ active: 'manutencao', title: 'Manutenção', body, user });
}
