// src/modules/dashboard/marketing-views.ts
// Marketing › Campanhas (/dashboard/marketing).
// Renovação do miolo — R17 (28/09/2026): mesmos formulários (busca GET com q +
// status, "Recalcular canais" com o mesmo confirm), mesmos links de abas e de
// paginação; visual no padrão cc- do Command Center (protótipo 05-marketing),
// tema escuro (D4), sem Tailwind. KPIs só com os números que já vêm de
// marketing-queries. Tabelas de número rolam no celular; criativos em grade.
// Tenant: "assistente" no lugar de "Eva"; nada da casa (Analytics do site da
// casa, conta MCC do Google Ads, "Recalcular canais" de todos os leads,
// comando /criativo do WhatsApp do dono).
import { renderLayout, escapeHtml, brl } from './views.js';
import type { DashUser } from './permissions.js';
import type {
  MarketingKpis, CampaignRow, CreativeRow, AlertRow, ChannelFunnelRow,
} from './marketing-queries.js';
import type { Insight } from './ai-summary.js';
import type { GoogleAdsSummary } from './marketing-queries.js';
import type { GoogleAnalyticsSummary } from '../marketing/google-analytics/index.js';
import type { CampaignQualityReport } from '../marketing/campaign-quality.js';
import {
  cabecalhoPagina, faixaKpis, cartaoSecao, tabela, estadoVazio, pilulaStatus, botao, chipsFiltro,
  celulaDupla, barra,
} from './ui/componentes.js';
import type { Tom } from './ui/componentes.js';
import { temaDaTela } from './ui/tema.js';
import { ECOSUN_COMPANY_ID } from '../tenant-resolver.js';

const CSS_MARKETING = `
.cc-mk>*+*{margin-top:16px}
.cc-mk-duo{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.cc-mk .cc-mk-duo>.cc-panel{margin:0}
.cc-mk-busca{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.cc-mk-busca input[type=text]{width:240px;max-width:100%;min-width:0}
.cc-mk-busca .cc-link{font-size:12.5px;color:var(--cc-muted)}
.cc-mk-abas{margin-bottom:12px}
.cc-mk-criativos{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
.cc-mk-cri{border:1px solid var(--cc-line);border-radius:12px;padding:12px;background:rgba(255,255,255,.02);min-width:0}
.cc-mk-cri-t{display:flex;gap:8px;align-items:flex-start;justify-content:space-between}
.cc-mk-cri-t strong{font-size:13.5px;font-weight:600;line-height:1.35;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.cc-mk-cri small{display:block;margin-top:6px;font-size:11.5px;color:var(--cc-faint)}
.cc-mk-per{font-size:11.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--cc-muted);margin:0 0 8px}
.cc-mk-per+.cc-kstrip{margin-bottom:16px}
.cc-mk-nota{margin:10px 0 0;font-size:12px;color:var(--cc-faint)}
.cc-mk-sub{font-size:11.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--cc-muted);margin:0 0 8px}
.cc-mk-funil{display:flex;flex-direction:column;gap:5px;min-width:90px}
.cc-mk-funil .cc-bar{height:5px}
.cc-mk-path{font-family:ui-monospace,monospace;font-size:12px;overflow-wrap:anywhere}
.cc-mk-inline{display:inline;margin:0}
.cc-mk-leg{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
@media (max-width:1023px){.cc-mk-duo{grid-template-columns:minmax(0,1fr)}}
@media (max-width:760px){
  .cc-mk-criativos{grid-template-columns:minmax(0,1fr)}
  .cc-mk-busca{width:100%}
  .cc-mk-busca input[type=text]{flex:1 1 160px;width:auto}
}
`;

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

const ehCasa = (user: DashUser | undefined) => !user || user.companyId === ECOSUN_COMPANY_ID;

export interface MarketingPageInput {
  kpis: MarketingKpis;
  campaigns: CampaignRow[];
  creatives: CreativeRow[];
  alerts: AlertRow[];
  channels: ChannelFunnelRow[];
  campaignsFilters?: { status: 'active' | 'paused' | 'all'; search: string; limit: number; offset: number };
  campaignsCounts?: { active: number; paused: number; total: number };
  campaignsTotal?: number;
  insights?: Insight[];
  googleAds7d?: GoogleAdsSummary;
  googleAds30d?: GoogleAdsSummary;
  ga4_30d?: GoogleAnalyticsSummary;
  campaignQuality?: CampaignQualityReport;
}

const STATUS_QUALIDADE: Record<string, { tom: Tom; rotulo: string }> = {
  campea: { tom: 'normal', rotulo: 'Campeã' },
  ok: { tom: 'info', rotulo: 'OK' },
  cara: { tom: 'critico', rotulo: 'Cara' },
  sem_dados: { tom: 'acompanhar', rotulo: 'Juntando dados' },
};

export function renderCampaignQualitySection(report: CampaignQualityReport): string {
  const mediaStr = report.mediaCostPerQualified != null
    ? `Média geral: ${brl(report.mediaCostPerQualified)} por lead qualificado`
    : 'Média geral: dados insuficientes';

  const corpo = report.rows.length === 0
    ? estadoVazio({ tipo: 'sem_dado', titulo: 'Nenhuma campanha com dado no período.', compacto: true })
    : tabela({
      mobile: 'rolar',
      colunas: [{ titulo: 'Campanha' }, { titulo: 'Gasto', alinhar: 'dir', num: true }, { titulo: 'Qualificados / total', alinhar: 'dir', num: true }, { titulo: 'Custo por lead bom', alinhar: 'dir', num: true }],
      linhas: report.rows.map((r) => {
        const st = STATUS_QUALIDADE[r.status] ?? { tom: 'sem_dado' as Tom, rotulo: r.status };
        const custo = r.status === 'sem_dados'
          ? '<span class="cc-faint">juntando dados</span>'
          : r.costPerQualified != null
            ? `<span class="${r.status === 'campea' ? 'cc-okc' : r.status === 'cara' ? 'cc-critc' : ''}">${escapeHtml(brl(r.costPerQualified))}</span>`
            : '—';
        return [
          { html: `<div class="cc-mk-leg">${escapeHtml(r.name)} ${pilulaStatus(st.tom, st.rotulo)}</div>` },
          brl(r.spendBrl),
          `${r.qualified} / ${r.totalLeads}`,
          { html: custo },
        ];
      }),
    });

  return cartaoSecao({
    titulo: 'Qualidade por campanha',
    dica: `${mediaStr} · últimos 14 dias`,
    corpoHtml: `${corpo}<p class="cc-mk-nota">Do mais barato pro mais caro · "Juntando dados" = menos de 5 leads no período.</p>`,
  });
}

function renderGoogleAnalyticsSection(s?: GoogleAnalyticsSummary): string {
  const titulo = 'Site e tráfego (Google Analytics)';
  if (!s || s.error) {
    return cartaoSecao({
      titulo,
      corpoHtml: estadoVazio({
        tipo: 'sem_dado',
        titulo: s?.error ? s.error : 'Aguardando dado',
        texto: s?.error ? undefined : 'O Analytics acabou de receber a marcação; os primeiros dados podem levar até 24 h para aparecer.',
        compacto: true,
      }),
    });
  }
  const dica = `Últimos 30 dias · propriedade ${String(process.env.GOOGLE_ANALYTICS_PROPERTY_ID ?? '—')}`;
  if (s.sessions === 0) {
    return cartaoSecao({
      titulo, dica,
      corpoHtml: estadoVazio({
        tipo: 'sem_dado', titulo: 'Conectado, mas ainda sem visita registrada.',
        texto: 'Pode levar de 24 a 48 h para os primeiros dados aparecerem. O Cloudflare Analytics já está coletando em paralelo.', compacto: true,
      }),
    });
  }
  const canais = s.channels.slice().sort((a, b) => b.sessions - a.sessions).slice(0, 5);
  const tabelaCanais = tabela({
    mobile: 'rolar', vazio: 'Sem dado de canal ainda.',
    colunas: [{ titulo: 'Canal' }, { titulo: 'Sessões', alinhar: 'dir', num: true }, { titulo: 'Usuários', alinhar: 'dir', num: true }, { titulo: 'Páginas vistas', alinhar: 'dir', num: true }],
    linhas: canais.map((c) => [c.channel, c.sessions, c.users, c.pageviews]),
  });
  const tabelaPaginas = tabela({
    mobile: 'rolar', vazio: 'Sem dado de página.',
    colunas: [{ titulo: 'Página' }, { titulo: 'Vistas', alinhar: 'dir', num: true }],
    linhas: s.top_pages.map((p) => [{ html: `<span class="cc-mk-path">${escapeHtml(p.path)}</span>` }, p.pageviews]),
  });
  return cartaoSecao({
    titulo, dica,
    corpoHtml: `${faixaKpis([
      { rotulo: 'Sessões', valor: s.sessions, detalhe: 'visitas no total' },
      { rotulo: 'Usuários', valor: s.users, detalhe: 'pessoas diferentes' },
      { rotulo: 'Páginas vistas', valor: s.pageviews, detalhe: 'no período' },
    ])}
    <div class="cc-mk-duo" style="margin-top:16px">
      <div><h4 class="cc-mk-sub">Tráfego por canal</h4>${tabelaCanais}</div>
      <div><h4 class="cc-mk-sub">5 páginas mais vistas</h4>${tabelaPaginas}</div>
    </div>`,
  });
}

function renderGoogleAdsSection(s7d: GoogleAdsSummary | undefined, s30d: GoogleAdsSummary | undefined, casa: boolean): string {
  const has7d = s7d && s7d.dias_com_dado > 0;
  const has30d = s30d && s30d.dias_com_dado > 0;

  const periodo = (label: string, s?: GoogleAdsSummary) => {
    if (!s || s.dias_com_dado === 0) return `<p class="cc-mk-per">${escapeHtml(label)}</p><p class="cc-faint" style="margin:0 0 16px">Sem dado em ${escapeHtml(label.toLowerCase())}.</p>`;
    return `<p class="cc-mk-per">${escapeHtml(label)} · ${s.dias_com_dado} dia(s) com dado</p>${faixaKpis([
      { rotulo: 'Gasto', valor: s.spend_cents / 100, prefixo: 'R$', casas: 2, detalhe: 'em anúncios' },
      { rotulo: 'Cliques', valor: s.clicks, detalhe: 'nos anúncios' },
      { rotulo: 'Impressões', valor: s.impressions, detalhe: 'vezes exibido' },
      { rotulo: 'CPC', valor: s.cpc_brl, prefixo: 'R$', casas: 2, detalhe: `CTR ${s.ctr_pct != null ? `${s.ctr_pct.toFixed(2).replace('.', ',')}%` : '—'}` },
    ])}`;
  };

  const ultima = s7d?.ultima_sync_at ?? s30d?.ultima_sync_at;
  const ultimaSync = ultima ? new Date(ultima).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'nunca';

  const corpo = !has7d && !has30d
    ? estadoVazio({
      tipo: 'sem_dado',
      titulo: 'Aguardando a primeira campanha rodar',
      texto: casa
        ? 'Credenciais OK, sincronização ligada. Quando você criar uma campanha no Google Ads (MCC 8617425872), o dado começa a aparecer aqui em até 30 min.'
        : 'Quando a conta do Google Ads da sua empresa estiver ligada e uma campanha rodar, o dado aparece aqui.',
    })
    : `${periodo('Últimos 7 dias', s7d)}${periodo('Últimos 30 dias', s30d)}`;

  // Tenant sem dado: sem a linha de sincronização (ele não tem sync ligado).
  const dica = casa || has7d || has30d ? `sincroniza a cada 30 min · última: ${ultimaSync}` : undefined;
  return cartaoSecao({ titulo: 'Google Ads', dica, corpoHtml: corpo });
}

const CHANNEL_LABELS: Record<string, string> = {
  meta: 'Meta',
  google: 'Google',
  blog: 'Blog',
  direto: 'Direto',
  indicacao: 'Indicação',
  base_propria: 'Base própria',
  outro: 'Outro',
};

function renderChannelsSection(channels: ChannelFunnelRow[], casa: boolean): string {
  const linhas = channels.map((ch) => {
    const vazio = ch.total === 0;
    const pct = ch.total > 0 ? Math.round((ch.qualificado / ch.total) * 100) : 0;
    const leads = vazio
      ? null
      : { html: `<div class="cc-mk-funil"><span>${escapeHtml(String(ch.total))}</span>${barra(pct, pct >= 50 ? 'ok' : pct >= 25 ? 'warn' : 'crit')}</div>` };
    return [
      { html: `<strong>${escapeHtml(CHANNEL_LABELS[ch.channel] ?? ch.channel)}</strong>` },
      leads,
      vazio ? null : ch.qualificado,
      vazio ? null : ch.agendado,
      vazio ? null : brl(ch.spend_cents / 100),
      ch.cpl != null ? brl(ch.cpl / 100) : null,
      ch.custo_por_agendamento != null ? brl(ch.custo_por_agendamento / 100) : null,
    ];
  });

  // "Recalcular canais" mexe em TODOS os leads (de todas as empresas): só a casa.
  const recalcular = casa
    ? `<form method="POST" action="/dashboard/admin/backfill-channels" onsubmit="return confirm('Recalcular canais de TODOS os leads sem channel preenchido? Idempotente, pode rodar varias vezes.')" class="cc-mk-inline">
        ${botao({ rotulo: 'Recalcular canais', tipo: 'submit', tamanho: 'sm', icone: 'down' })}
      </form>`
    : '';

  return cartaoSecao({
    titulo: 'Canais — funil por origem',
    dica: 'mesmo período dos KPIs',
    acoesHtml: recalcular,
    corpoHtml: `${tabela({
      mobile: 'rolar',
      colunas: [{ titulo: 'Canal' }, { titulo: 'Leads', num: true }, { titulo: 'Qualificados', alinhar: 'dir', num: true }, { titulo: 'Agendados', alinhar: 'dir', num: true }, { titulo: 'Gasto', alinhar: 'dir', num: true }, { titulo: 'CPL', alinhar: 'dir', num: true }, { titulo: 'Custo por agend.', alinhar: 'dir', num: true }],
      linhas,
    })}<p class="cc-mk-nota">CPL = custo por lead · Custo por agend. = custo por agendamento · "—" = sem dado no período.</p>`,
  });
}

function renderInsights(insights: Insight[], casa: boolean): string {
  if (insights.length === 0) return '';
  const tom: Record<Insight['severity'], string> = { critical: 'critico', warning: 'atencao', info: 'info' };
  return cartaoSecao({
    titulo: casa ? 'Eva está observando' : 'A assistente está observando',
    corpoHtml: `<div class="cc-evs">${insights.map((i) =>
      `<div class="cc-ev cc-ev-${tom[i.severity] ?? 'info'}"><div class="cc-ev-t">${escapeHtml(i.emoji)} ${escapeHtml(i.text)}</div></div>`).join('')}</div>`,
  });
}

const SEVERIDADE: Record<string, { classe: string; rotulo: string }> = {
  critical: { classe: 'critico', rotulo: 'crítico' },
  warning: { classe: 'atencao', rotulo: 'atenção' },
  info: { classe: 'info', rotulo: 'info' },
};

export function renderMarketingPage(input: MarketingPageInput, user?: DashUser): string {
  const { kpis, campaigns, creatives, alerts, channels } = input;
  const casa = ehCasa(user);
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
  const aba = (id: 'active' | 'paused' | 'all', rotulo: string, valor: number) => ({
    rotulo, valor, ativo: filters.status === id,
    href: `/dashboard/marketing?status=${id}${filters.search ? `&q=${encodeURIComponent(filters.search)}` : ''}`,
  });

  const kpisHtml = faixaKpis([
    { rotulo: 'Gasto 7d', valor: kpis.spend7d_brl, prefixo: 'R$', detalhe: 'investimento Meta Ads', destaque: true },
    { rotulo: 'Leads 7d', valor: kpis.leads7d, detalhe: 'capturados via campanha' },
    { rotulo: 'CPL médio 7d', valor: kpis.cpl7d_brl, prefixo: 'R$', casas: 2, detalhe: 'por lead', semDadoTexto: 'sem leads ainda' },
    { rotulo: 'CTR 7d', valor: kpis.ctr7d_pct, casas: 2, unidade: '%', detalhe: `${kpis.impressions7d.toLocaleString('pt-BR')} impressões` },
    { rotulo: 'Campanhas ativas', valor: kpis.activeCampaigns, detalhe: 'rodando agora' },
    { rotulo: 'Criativos em uso', valor: kpis.creativesEmUso, detalhe: 'gerados pelo Agente Criativo' },
    { rotulo: 'Alertas pendentes', valor: kpis.alertasPendentes, detalhe: 'aguardando ação' },
  ]);

  const busca = `<form action="/dashboard/marketing" method="get" class="cc-form cc-mk-busca">
      <input type="hidden" name="status" value="${escapeHtml(filters.status)}">
      <input type="text" name="q" value="${escapeHtml(filters.search)}" placeholder="Buscar campanha…" aria-label="Buscar campanha">
      ${botao({ rotulo: 'Buscar', tipo: 'submit', tom: 'ouro', tamanho: 'sm', icone: 'search' })}
      ${filters.search ? `<a class="cc-link" href="/dashboard/marketing?status=${escapeHtml(filters.status)}">limpar</a>` : ''}
    </form>`;

  const tabelaCampanhas = campaigns.length === 0
    ? estadoVazio({ tipo: 'vazio', titulo: 'Nenhuma campanha cadastrada.', icone: 'mega', compacto: true })
    : tabela({
      mobile: 'rolar',
      colunas: [{ titulo: 'Campanha' }, { titulo: 'Status' }, { titulo: 'Orçamento diário', alinhar: 'dir', num: true }, { titulo: 'Gasto 7d', alinhar: 'dir', num: true }, { titulo: 'Leads 7d', alinhar: 'dir', num: true }, { titulo: 'CPL 7d', alinhar: 'dir', num: true }, { titulo: 'Última sync' }],
      linhas: campaigns.map((c) => {
        const cpl = c.cpl7d_brl;
        const cor = cpl == null ? ''
          : (c.cpl_critico_brl && cpl > c.cpl_critico_brl) ? 'cc-critc'
            : (c.cpl_alerta_brl && cpl > c.cpl_alerta_brl) ? 'cc-warnc'
              : 'cc-okc';
        return [
          { html: celulaDupla(c.name, c.codigo_portfolio) },
          { html: c.status === 'paused' ? pilulaStatus('sem_dado', 'Pausada') : pilulaStatus('normal', 'Ativa') },
          c.daily_budget_cents != null ? brl(c.daily_budget_cents / 100) : null,
          brl(c.spend7d_brl),
          c.leads7d,
          cpl != null ? { html: `<span class="${cor}">${escapeHtml(brl(cpl))}</span>` } : null,
          timeAgo(c.last_synced_at),
        ];
      }),
    });

  // Mesma regra de antes: Anterior = offset−limit (mín. 0) se offset > 0;
  // Próxima = offset+limit se ainda houver (vale também p/ offset desalinhado).
  const pag = total > filters.limit
    ? (() => {
      const link = (ok: boolean, offset: number, rel: 'prev' | 'next', txt: string) => ok
        ? `<a class="cc-btn cc-btn-sm" href="/dashboard/marketing?${escapeHtml(qsSemOffset({ offset }))}" rel="${rel}">${txt}</a>`
        : `<span class="cc-btn cc-btn-sm cc-btn-off" aria-disabled="true">${txt}</span>`;
      return `<nav class="cc-pg" aria-label="Paginação"><span class="cc-pg-info">Mostrando ${filters.offset + 1}–${Math.min(filters.offset + filters.limit, total)} de ${total} · Página ${pagina} de ${totalPaginas}</span><span class="cc-sp"></span>`
        + `${link(filters.offset > 0, Math.max(0, filters.offset - filters.limit), 'prev', '← Anterior')}${link(filters.offset + filters.limit < total, filters.offset + filters.limit, 'next', 'Próxima →')}</nav>`;
    })()
    : '';

  const campanhas = cartaoSecao({
    titulo: 'Campanhas — últimos 7 dias',
    acoesHtml: busca,
    corpoHtml: `<div class="cc-mk-abas">${chipsFiltro([
      aba('active', 'Ativas', counts.active),
      aba('paused', 'Pausadas', counts.paused),
      aba('all', 'Todas', counts.total),
    ])}</div>${tabelaCampanhas}${pag}`,
  });

  const criativos = cartaoSecao({
    titulo: 'Criativos recentes',
    corpoHtml: creatives.length === 0
      ? estadoVazio({
        tipo: 'vazio', titulo: 'Nenhum criativo cadastrado ainda.', compacto: true,
        texto: casa ? 'Use /criativo no WhatsApp pra gerar.' : undefined,
      })
      : `<div class="cc-mk-criativos">${creatives.map((cr) => `
        <div class="cc-mk-cri">
          <div class="cc-mk-cri-t"><strong>${escapeHtml(cr.briefing ?? 'sem briefing')}</strong>${pilulaStatus(cr.status === 'em_uso' ? 'normal' : cr.status === 'pending' ? 'acompanhar' : 'sem_dado', cr.status)}</div>
          <small>${escapeHtml(timeAgo(cr.created_at))}</small>
        </div>`).join('')}</div>`,
  });

  const alertas = cartaoSecao({
    titulo: 'Alertas pendentes',
    corpoHtml: alerts.length === 0
      ? estadoVazio({ tipo: 'vazio', titulo: 'Nenhum alerta pendente — tudo em ordem.', compacto: true })
      : `<div class="cc-evs">${alerts.map((a) => {
        const sv = SEVERIDADE[a.severity] ?? { classe: 'info', rotulo: a.severity };
        return `<div class="cc-ev cc-ev-${sv.classe}">
          <div class="cc-ev-m"><span class="cc-ev-sv">${escapeHtml(sv.rotulo)}</span><span>${escapeHtml(a.agent)} · ${escapeHtml(timeAgo(a.created_at))}</span></div>
          <div class="cc-ev-t">${escapeHtml(a.subject)}</div>
          <div class="cc-ev-d">${escapeHtml(a.body)}</div>
          ${a.action_required ? `<div class="cc-ev-imp">Ação: <b>${escapeHtml(a.action_required)}</b></div>` : ''}
        </div>`;
      }).join('')}</div>`,
  });

  const body = `
    ${cabecalhoPagina({
      trilha: [{ rotulo: 'Marketing' }, { rotulo: 'Campanhas', href: '/dashboard/marketing' }],
      titulo: 'Marketing',
      subtitulo: 'Desempenho dos últimos 7 dias, campanhas, criativos gerados e alertas pendentes.',
    })}
    ${renderInsights(input.insights ?? [], casa)}
    ${kpisHtml}
    ${campanhas}
    <div class="cc-mk-duo">${criativos}${alertas}</div>
    ${renderGoogleAdsSection(input.googleAds7d, input.googleAds30d, casa)}
    ${casa ? renderGoogleAnalyticsSection(input.ga4_30d) : ''}
    ${renderChannelsSection(channels, casa)}
    ${input.campaignQuality ? renderCampaignQualitySection(input.campaignQuality) : ''}
  `;

  return renderLayout({
    active: 'marketing', title: 'Marketing', user,
    body: `<div class="cc-root cc-mk">${body}</div><style>${CSS_MARKETING}</style>`,
    tailwind: false, dark: temaDaTela(user, 'escuro') === 'escuro', largo: true,
  });
}
