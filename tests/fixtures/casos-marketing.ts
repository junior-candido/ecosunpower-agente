// Casos do Marketing (renovação do miolo, R17) — 4 telas: Campanhas
// (/marketing), Blog (/marketing/blog + revisar), E-mail (/marketing/email) e
// Cadência (/cadencia). Dados FICTÍCIOS: nomes inventados, nunca cliente real.
// Blog e E-mail: o router envolve o corpo na casca (renderBlogLayout /
// renderEmailLayout; antes da R17 era o renderLayout direto no router).
import { renderMarketingPage } from '../../src/modules/dashboard/marketing-views.js';
import { renderBlogDraftsPage, renderBlogIndisponivel, renderBlogRevisarPage, renderBlogLayout } from '../../src/modules/dashboard/blog-views.js';
import { renderEmailPage, renderEmailLayout, renderEmailIndisponivel } from '../../src/modules/dashboard/email-views.js';
import { renderCadenciaPage } from '../../src/modules/dashboard/cadencia-views.js';
import { calcKpis } from '../../src/modules/dashboard/cadencia-queries.js';
import type { LeadCadenciaRow } from '../../src/modules/dashboard/cadencia-queries.js';
import type { MarketingPageInput } from '../../src/modules/dashboard/marketing-views.js';
import type { BlogDraft } from '../../src/modules/blog-generator.js';
import type { DashUser } from '../../src/modules/dashboard/permissions.js';
import { USER_CASA, USER_TENANT } from './miolo-leads.js';

const hora = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

// ─── Campanhas ──────────────────────────────────────────────────────────────
const camp = (id: number, over: Record<string, unknown> = {}): any => ({
  id, codigo_portfolio: `C${id}`, name: `Campanha ${id}`, status: 'active', daily_budget_cents: 5000,
  cpl_alerta_brl: 40, cpl_critico_brl: 80, last_synced_at: hora(1), spend7d_brl: 210.5, leads7d: 7, cpl7d_brl: 30.07, ...over,
});

export const CAMPANHAS = [
  camp(1, { name: 'Conta de luz <script>alert(1)</script>', codigo_portfolio: 'RES-01' }),
  camp(2, { name: "Empresas — reduza o custo d'água", spend7d_brl: 900, leads7d: 9, cpl7d_brl: 100 }),
  camp(3, { name: 'Remarketing', status: 'paused', daily_budget_cents: null, spend7d_brl: 0, leads7d: 0, cpl7d_brl: null, last_synced_at: null }),
  camp(4, { name: 'Alerta morno', spend7d_brl: 450, leads7d: 10, cpl7d_brl: 45 }),
];

export const CANAIS = [
  { channel: 'meta', total: 128, qualificado: 40, agendado: 12, spend_cents: 396000, cpl: 3094, custo_por_agendamento: 33000 },
  { channel: 'google', total: 46, qualificado: 14, agendado: 4, spend_cents: 232000, cpl: 5043, custo_por_agendamento: 58000 },
  { channel: 'blog', total: 0, qualificado: 0, agendado: 0, spend_cents: 0, cpl: null, custo_por_agendamento: null },
  { channel: 'direto', total: 19, qualificado: 3, agendado: 0, spend_cents: 0, cpl: 0, custo_por_agendamento: null },
  { channel: 'indicacao', total: 14, qualificado: 8, agendado: 2, spend_cents: 0, cpl: 0, custo_por_agendamento: 0 },
  { channel: 'base_propria', total: 0, qualificado: 0, agendado: 0, spend_cents: 0, cpl: null, custo_por_agendamento: null },
  { channel: 'outro', total: 5, qualificado: 1, agendado: 0, spend_cents: 0, cpl: 0, custo_por_agendamento: null },
] as MarketingPageInput['channels'];

const CHEIO: MarketingPageInput = {
  kpis: { spend7d_brl: 6280.4, leads7d: 212, cpl7d_brl: 29.6, impressions7d: 412000, ctr7d_pct: 2.4, activeCampaigns: 3, creativesEmUso: 5, alertasPendentes: 2 },
  campaigns: CAMPANHAS,
  creatives: [
    { id: 1, briefing: 'Família <b>economizando</b> na conta', status: 'em_uso', created_at: hora(5) },
    { id: 2, briefing: null, status: 'pending', created_at: hora(50) },
    { id: 3, briefing: 'Telhado com placas ao pôr do sol — versão vertical para stories', status: 'rascunho', created_at: hora(200) },
  ],
  alerts: [
    { id: 1, agent: 'analista', severity: 'critical', subject: 'CPL da <i>Empresas</i> passou do crítico', body: 'R$ 100 por lead nos últimos 7 dias.', action_required: 'Pausar ou trocar criativo', status: 'pending', created_at: hora(3) },
    { id: 2, agent: 'criativo', severity: 'warning', subject: 'Criativo cansado', body: 'CTR caiu 30% na semana.', action_required: null, status: 'pending', created_at: hora(30) },
    { id: 3, agent: 'coletor', severity: 'info', subject: 'Sync ok', body: 'Tudo certo.', action_required: null, status: 'pending', created_at: hora(80) },
  ],
  channels: CANAIS,
  campaignsFilters: { status: 'active', search: 'conta & "luz"', limit: 2, offset: 2 },
  campaignsCounts: { active: 3, paused: 1, total: 4 },
  campaignsTotal: 6,
  insights: [
    { text: '1 campanha(s) ativa(s) com CPL acima do crítico nos últimos 7 dias.', severity: 'critical', emoji: '🚨' },
    { text: '2 criativo(s) aguardando <sua> aprovação.', severity: 'info', emoji: '🎨' },
  ],
  googleAds7d: { spend_cents: 58000, clicks: 310, impressions: 12040, cpc_brl: 1.87, ctr_pct: 2.57, dias_com_dado: 7, ultima_sync_at: hora(1) },
  googleAds30d: { spend_cents: 232000, clicks: 1200, impressions: 50000, cpc_brl: 1.93, ctr_pct: 2.4, dias_com_dado: 30, ultima_sync_at: hora(1) },
  ga4_30d: {
    sessions: 3400, users: 2100, pageviews: 8900, dias_com_dado: 30,
    channels: [
      { channel: 'Organic Search', sessions: 1500, users: 1000, pageviews: 4000 },
      { channel: 'Paid <Social>', sessions: 900, users: 700, pageviews: 2000 },
      { channel: 'Direct', sessions: 1000, users: 400, pageviews: 2900 },
    ],
    top_pages: [{ path: '/blog/placa-<script>', pageviews: 1200 }, { path: '/', pageviews: 900 }],
  },
  campaignQuality: {
    mediaCostPerQualified: 88.3,
    rows: [
      { campaignId: 'a', name: 'Energia solar <b>Brasília</b>', spendBrl: 1200, qualified: 20, totalLeads: 40, costPerQualified: 60, status: 'campea' },
      { campaignId: 'b', name: 'Conta de luz alta', spendBrl: 900, qualified: 10, totalLeads: 30, costPerQualified: 90, status: 'ok' },
      { campaignId: 'c', name: 'Empresas', spendBrl: 1500, qualified: 8, totalLeads: 20, costPerQualified: 187.5, status: 'cara' },
      { campaignId: 'd', name: 'Teste novo', spendBrl: 80, qualified: 1, totalLeads: 3, costPerQualified: null, status: 'sem_dados' },
    ],
  },
};

const SEM_NADA: MarketingPageInput = {
  kpis: { spend7d_brl: 0, leads7d: 0, cpl7d_brl: null, impressions7d: 0, ctr7d_pct: null, activeCampaigns: 0, creativesEmUso: 0, alertasPendentes: 0 },
  campaigns: [], creatives: [], alerts: [],
  channels: CANAIS.map((c) => ({ ...c, total: 0, qualificado: 0, agendado: 0, spend_cents: 0, cpl: null, custo_por_agendamento: null })),
  campaignsFilters: { status: 'paused', search: '', limit: 20, offset: 0 },
  campaignsCounts: { active: 0, paused: 0, total: 0 },
  campaignsTotal: 0,
  insights: [],
  googleAds7d: { spend_cents: 0, clicks: 0, impressions: 0, cpc_brl: null, ctr_pct: null, dias_com_dado: 0, ultima_sync_at: null },
  googleAds30d: { spend_cents: 0, clicks: 0, impressions: 0, cpc_brl: null, ctr_pct: null, dias_com_dado: 0, ultima_sync_at: null },
  ga4_30d: { sessions: 0, users: 0, pageviews: 0, dias_com_dado: 0, channels: [], top_pages: [], error: 'GOOGLE_ANALYTICS_PROPERTY_ID nao configurado <x>' },
};

// GA4 conectado mas sem sessão ainda; Google Ads só com 30 dias.
const GA_SEM_SESSAO: MarketingPageInput = {
  ...CHEIO,
  campaignsFilters: { status: 'all', search: '', limit: 20, offset: 0 },
  campaignsTotal: 4,
  googleAds7d: SEM_NADA.googleAds7d,
  ga4_30d: { sessions: 0, users: 0, pageviews: 0, dias_com_dado: 0, channels: [], top_pages: [] },
  campaignQuality: { mediaCostPerQualified: null, rows: [] },
};

// ─── Blog ───────────────────────────────────────────────────────────────────
export const DRAFT: BlogDraft = {
  id: 'draft_1', slug: 'placas-no-inverno', title: 'Placas solares <script>x</script> no inverno',
  description: "Quanto gera no frio? D'água & sol.", category: 'tecnico', tags: ['solar', 'inverno <b>', 'geração'],
  contentMd: '# Placas no inverno\n\nTexto do post com <b>negrito</b> e "aspas".', readingTime: 5,
  heroImageUrl: 'https://exemplo.invalid/foto.jpg', heroImageAlt: 'Telhado com placas',
  generatedAt: '2026-09-27T12:00:00Z', status: 'pending',
};
const DRAFT_SEM_FOTO: BlogDraft = {
  ...DRAFT, id: 'draft 2/ç', slug: 'lei-14300', title: 'Lei 14.300 em palavras simples', category: 'regulacao',
  tags: [], heroImageUrl: undefined, heroImageAlt: undefined, readingTime: 3,
};

const telaBlog = (body: string, title: string, user: DashUser) => renderBlogLayout({ title, body, user });

// ─── E-mail ─────────────────────────────────────────────────────────────────
const METRICAS = { enviados: 120, abertos: 54, clicados: 9, quentes: 3, descadastros: 1 };
const DESEMPENHO = [
  { step: 1, nome: 'Boas-vindas <b>', enviados: 60, abertos: 30, clicados: 5, taxaAbertura: 50, taxaClique: 8 },
  { step: 2, nome: 'Como funciona a conta', enviados: 40, abertos: 18, clicados: 3, taxaAbertura: 45, taxaClique: 8 },
  { step: 3, nome: 'Casos reais', enviados: 20, abertos: 6, clicados: 1, taxaAbertura: 30, taxaClique: 5 },
];
const telaEmail = (body: string, user: DashUser) => renderEmailLayout({ body, user });

// ─── Cadência ───────────────────────────────────────────────────────────────
const lc = (id: string, over: Partial<LeadCadenciaRow> = {}): LeadCadenciaRow => ({
  id, name: 'Ana Exemplo', phone: '5561999990001', email: 'ana@exemplo.invalid', status_db: 'novo',
  cadencia_status: 'aguardando', last_reactivation_sent_at: null, last_message_at: null,
  ultima_etapa_anterior: null, temperatura_anterior: null, motivo_perda_anterior: null, consumo_kwh: null,
  atendente_anterior: null, contato_criado_em_original: null, has_proposal: false, has_inbound_after_template: false, ...over,
});
export const LINHAS_CADENCIA: LeadCadenciaRow[] = [
  lc('11111111-1111-1111-1111-111111111111', { name: 'Ana Exemplo', consumo_kwh: 850 }),
  lc('22222222-2222-2222-2222-222222222222', { name: "Bruno D'Ávila <script>x</script>", email: null, cadencia_status: 'enviado_sem_resposta', last_reactivation_sent_at: hora(30), temperatura_anterior: 'morno', ultima_etapa_anterior: 'proposta', atendente_anterior: 'Carla' }),
  lc('33333333-3333-3333-3333-333333333333', { name: 'Carla Fictícia', cadencia_status: 'respondeu', last_reactivation_sent_at: hora(80), last_message_at: hora(2), has_inbound_after_template: true, temperatura_anterior: 'quente', motivo_perda_anterior: 'Achou caro na época e preferiu esperar a bandeira baixar — voltar em outubro' }),
  lc('44444444-4444-4444-4444-444444444444', { name: 'Davi Teste', cadencia_status: 'qualificando', last_reactivation_sent_at: hora(100), has_inbound_after_template: true, temperatura_anterior: 'frio', consumo_kwh: 1200 }),
  lc('55555555-5555-5555-5555-555555555555', { name: 'Eva Cliente', cadencia_status: 'cliente', last_reactivation_sent_at: hora(300) }),
  lc('66666666-6666-6666-6666-666666666666', { name: 'Fábio Parou', cadencia_status: 'opt_out' }),
  lc('77777777-7777-7777-7777-777777777777', { name: 'Gil Sumido', phone: '556199887766', cadencia_status: 'sem_resposta_7d', last_reactivation_sent_at: hora(24 * 9) }),
  lc('88888888-8888-8888-8888-888888888888', { name: 'Hana Proposta', cadencia_status: 'proposta_enviada', last_reactivation_sent_at: hora(24 * 3), has_inbound_after_template: true }),
];

export const CASOS_MARKETING = {
  // Campanhas
  'campanhas': () => renderMarketingPage(CHEIO, USER_CASA),
  'campanhas-sem-google': () => renderMarketingPage(SEM_NADA, USER_CASA),
  'campanhas-ga-sem-sessao': () => renderMarketingPage(GA_SEM_SESSAO, USER_CASA),
  'campanhas-tenant': () => renderMarketingPage(CHEIO, USER_TENANT),
  // Blog
  'blog': () => telaBlog(renderBlogDraftsPage([DRAFT, DRAFT_SEM_FOTO], { ok: true }), 'Blog — aprovar posts', USER_CASA),
  'blog-vazio': () => telaBlog(renderBlogDraftsPage([], { erro: 'Falhou <b>feio</b>', avisoLeitura: 'timeout "supabase"' }), 'Blog — aprovar posts', USER_CASA),
  'blog-indisponivel': () => telaBlog(renderBlogIndisponivel(), 'Blog — aprovar posts', USER_CASA),
  'blog-revisar': () => telaBlog(renderBlogRevisarPage(DRAFT, { ok: true, fotoOk: true }), 'Revisar rascunho', USER_CASA),
  'blog-revisar-sem-foto': () => telaBlog(renderBlogRevisarPage(DRAFT_SEM_FOTO, { erro: 'Não consegui buscar uma foto <agora>' }), 'Revisar rascunho', USER_CASA),
  // E-mail
  'email': () => telaEmail(renderEmailPage(METRICAS, true, DESEMPENHO), USER_CASA),
  'email-pausado': () => telaEmail(renderEmailPage({ enviados: 0, abertos: 0, clicados: 0, quentes: 0, descadastros: 0 }, false, []), USER_CASA),
  // Cadência
  'cadencia': () => renderCadenciaPage({ rows: LINHAS_CADENCIA, kpis: calcKpis(LINHAS_CADENCIA), user: USER_CASA }),
  'cadencia-filtro': () => renderCadenciaPage({ rows: LINHAS_CADENCIA, kpis: calcKpis(LINHAS_CADENCIA), filterStatus: 'enviado_sem_resposta', user: USER_CASA }),
  'cadencia-vazia': () => renderCadenciaPage({ rows: [], kpis: calcKpis([]), user: USER_CASA }),
  'cadencia-tenant': () => renderCadenciaPage({ rows: LINHAS_CADENCIA.slice(0, 3), kpis: calcKpis(LINHAS_CADENCIA.slice(0, 3)), user: USER_TENANT }),
};

/** Casos que só existem na tela nova (não têm contrato antigo): visão de tenant
 *  do Blog e do E-mail (antes o tenant via os da casa) e campanhas vazias. */
export const CASOS_MARKETING_NOVOS = {
  'campanhas-tenant-vazia': () => renderMarketingPage(SEM_NADA, USER_TENANT),
  'blog-tenant': () => telaBlog(renderBlogIndisponivel('empresa'), 'Blog — aprovar posts', USER_TENANT),
  'email-tenant': () => telaEmail(renderEmailIndisponivel(), USER_TENANT),
};
