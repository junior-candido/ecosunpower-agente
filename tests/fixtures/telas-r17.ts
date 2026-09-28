// Onda 3 — R17: Marketing. Telas renovadas com dados FICTÍCIOS em volume n
// (usadas pelo teste "telas leves" e por scripts/medir-telas-leves.ts).
import type { DashUser } from '../../src/modules/dashboard/permissions.js';
import { renderMarketingPage } from '../../src/modules/dashboard/marketing-views.js';
import { renderBlogDraftsPage, renderBlogRevisarPage, renderBlogIndisponivel, renderBlogLayout } from '../../src/modules/dashboard/blog-views.js';
import { renderEmailPage, renderEmailLayout, renderEmailIndisponivel } from '../../src/modules/dashboard/email-views.js';
import { renderCadenciaPage } from '../../src/modules/dashboard/cadencia-views.js';
import { calcKpis } from '../../src/modules/dashboard/cadencia-queries.js';
import { ECOSUN_COMPANY_ID } from '../../src/modules/tenant-resolver.js';
import { CAMPANHAS, CANAIS, DRAFT, LINHAS_CADENCIA } from './casos-marketing.js';

/** Classes fora do padrão cc- que a tela usa de propósito (gancho de JS ou de teste antigo). */
export const CLASSES_R17: string[] = [];

const hora = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

export function telasR17(n: number, user: DashUser): Record<string, string> {
  const casa = user.companyId === ECOSUN_COMPANY_ID;
  const campanhas = Array.from({ length: n }, (_, i) => ({ ...CAMPANHAS[i % CAMPANHAS.length], id: i + 1, name: `Campanha ${i + 1}` }));
  const drafts = Array.from({ length: Math.max(1, Math.ceil(n / 5)) }, (_, i) => ({ ...DRAFT, id: `d${i}`, slug: `post-${i}` }));
  const linhas = Array.from({ length: n }, (_, i) => ({ ...LINHAS_CADENCIA[i % LINHAS_CADENCIA.length], id: `${String(i).padStart(8, '0')}-1111-1111-1111-111111111111`, name: `Lead ${i + 1}` }));
  return {
    'r17-marketing': renderMarketingPage({
      kpis: { spend7d_brl: 6280, leads7d: 212, cpl7d_brl: 29.6, impressions7d: 412000, ctr7d_pct: 2.4, activeCampaigns: n, creativesEmUso: 5, alertasPendentes: 2 },
      campaigns: campanhas,
      creatives: Array.from({ length: 8 }, (_, i) => ({ id: i, briefing: `Criativo ${i}`, status: 'em_uso', created_at: hora(i * 5) })),
      alerts: Array.from({ length: 5 }, (_, i) => ({ id: i, agent: 'analista', severity: ['critical', 'warning', 'info'][i % 3], subject: `Alerta ${i}`, body: 'Texto do alerta.', action_required: null, status: 'pending', created_at: hora(i) })),
      channels: CANAIS,
      campaignsFilters: { status: 'active', search: '', limit: n, offset: 0 },
      campaignsCounts: { active: n, paused: 0, total: n },
      campaignsTotal: n * 2,
      googleAds7d: { spend_cents: 58000, clicks: 310, impressions: 12040, cpc_brl: 1.87, ctr_pct: 2.57, dias_com_dado: 7, ultima_sync_at: hora(1) },
      googleAds30d: { spend_cents: 232000, clicks: 1200, impressions: 50000, cpc_brl: 1.93, ctr_pct: 2.4, dias_com_dado: 30, ultima_sync_at: hora(1) },
      ga4_30d: { sessions: 3400, users: 2100, pageviews: 8900, dias_com_dado: 30, channels: [{ channel: 'Direct', sessions: 1000, users: 400, pageviews: 2900 }], top_pages: [{ path: '/', pageviews: 900 }] },
      campaignQuality: { mediaCostPerQualified: 88.3, rows: campanhas.slice(0, 10).map((c, i) => ({ campaignId: String(i), name: c.name, spendBrl: 500, qualified: 5, totalLeads: 10, costPerQualified: 100, status: 'ok' as const })) },
    }, user),
    'r17-blog': casa
      ? renderBlogLayout({ title: 'Blog — aprovar posts', body: renderBlogDraftsPage(drafts, { ok: true }), user })
      : renderBlogLayout({ title: 'Blog — aprovar posts', body: renderBlogIndisponivel('empresa'), user }),
    'r17-blog-revisar': renderBlogLayout({ title: 'Revisar rascunho', body: renderBlogRevisarPage(DRAFT), user }),
    'r17-email': casa
      ? renderEmailLayout({ body: renderEmailPage({ enviados: 120, abertos: 54, clicados: 9, quentes: 3, descadastros: 1 }, true, Array.from({ length: 8 }, (_, i) => ({ step: i + 1, nome: `E-mail ${i + 1}`, enviados: 60, abertos: 30, clicados: 5, taxaAbertura: 50, taxaClique: 8 }))), user })
      : renderEmailLayout({ body: renderEmailIndisponivel(), user }),
    'r17-cadencia': renderCadenciaPage({ rows: linhas, kpis: calcKpis(linhas), user }),
  };
}
