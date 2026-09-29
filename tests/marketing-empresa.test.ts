// R17 — revisão de segurança do Marketing (28/09/2026).
// Achados: as consultas de /marketing e /cadencia não tinham company_id (o
// banco padrão do painel é o de SERVIÇO — bancoDoOperador só vira RLS com a
// flag), então um tenant com o módulo Marketing via as campanhas, gastos,
// funil e os LEADS (nome/telefone/e-mail) da casa e podia marcar "Fechou" /
// "Pediu pra parar" num lead de outra empresa pelo id. Blog e E-mail são da
// casa (site e jornada da EcoSun): o tenant podia publicar/descartar post no
// site da casa e pausar a sequência de e-mail da casa. "Recalcular canais"
// mexia em todos os leads de todas as empresas e não tinha trava nenhuma.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { bancoFalso } from './helpers/banco-falso.js';
import {
  fetchMarketingKpis, listActiveCampaigns, listRecentCreatives, listPendingAlerts, fetchChannelFunnel, fetchGoogleAdsSummary,
} from '../src/modules/dashboard/marketing-queries.js';
import { buildMarketingInsights } from '../src/modules/dashboard/ai-summary.js';
import { fetchCampaignQualityInputs } from '../src/modules/marketing/campaign-quality-data.js';
import { listCadenciaLeads, fecharLeadCadencia, optoutLeadCadencia } from '../src/modules/dashboard/cadencia-queries.js';
import { filtroEmpresa, EMPRESA_NENHUMA } from '../src/modules/dashboard/filtro-empresa.js';

const CASA = '00000000-0000-0000-0000-000000000001';
const OUTRA = 'aaaa1111-2222-3333-4444-555566667777';
const hoje = new Date().toISOString().slice(0, 10);
const agoraIso = new Date().toISOString();

function banco() {
  return bancoFalso({
    meta_ads_insights: [
      { company_id: CASA, campaign_id: 1, spend_cents: 10000, leads: 5, impressions: 1000, clicks: 10, date_start: hoje },
      { company_id: OUTRA, campaign_id: 2, spend_cents: 99900, leads: 1, impressions: 50, clicks: 5, date_start: hoje },
    ],
    marketing_campaigns: [
      { company_id: CASA, id: 1, name: 'Da casa', status: 'active', codigo_portfolio: 'C1', last_synced_at: agoraIso },
      { company_id: OUTRA, id: 2, name: 'Da outra', status: 'active', codigo_portfolio: 'C2', last_synced_at: agoraIso },
      { company_id: OUTRA, id: 3, name: 'Da outra pausada', status: 'paused', codigo_portfolio: 'C3', last_synced_at: '2020-01-01' },
    ],
    marketing_creatives: [
      { company_id: CASA, id: 1, briefing: 'casa', status: 'em_uso', created_at: agoraIso },
      { company_id: OUTRA, id: 2, briefing: 'outra', status: 'pending', created_at: agoraIso },
    ],
    marketing_alerts: [
      { company_id: CASA, id: 1, subject: 'casa', status: 'pending', created_at: agoraIso },
      { company_id: OUTRA, id: 2, subject: 'outra', status: 'pending', created_at: agoraIso },
    ],
    channel_daily_metrics: [
      { company_id: CASA, channel: 'google', date: hoje, spend_cents: 100, clicks: 1, impressions: 10, updated_at: agoraIso },
      { company_id: OUTRA, channel: 'google', date: hoje, spend_cents: 777, clicks: 7, impressions: 70, updated_at: agoraIso },
    ],
    leads: [
      { company_id: CASA, id: 'L1', channel: 'meta', status: 'novo', created_at: agoraIso, name: 'Ana', phone: '5561999990001', acquisition_source: 'terceirizada_recovered', opt_out: false },
      { company_id: OUTRA, id: 'L2', channel: 'meta', status: 'qualificado', created_at: agoraIso, name: 'Bia da outra', phone: '5561999990002', acquisition_source: 'terceirizada_recovered', opt_out: false },
    ],
  });
}

describe('Marketing — toda consulta filtra a empresa da sessão', () => {
  it('KPIs só com o gasto/campanhas/criativos/alertas da empresa', async () => {
    const { client } = banco();
    const k = await fetchMarketingKpis(client, CASA);
    expect(k.spend7d_brl).toBe(100);
    expect(k.activeCampaigns).toBe(1);
    expect(k.creativesEmUso).toBe(1);
    expect(k.alertasPendentes).toBe(1);
  });

  it('lista de campanhas, criativos e alertas só da empresa', async () => {
    const { client } = banco();
    const r = await listActiveCampaigns(client, OUTRA, { status: 'all' });
    expect(r.rows.map((c) => c.name)).toEqual(['Da outra', 'Da outra pausada']);
    expect(r.countByStatus).toEqual({ active: 1, paused: 1, total: 2 });
    expect(r.rows[0].spend7d_brl).toBe(999);
    expect((await listRecentCreatives(client, CASA)).map((c) => c.briefing)).toEqual(['casa']);
    expect((await listPendingAlerts(client, CASA)).map((a) => a.subject)).toEqual(['casa']);
  });

  it('funil por canal e Google Ads só da empresa', async () => {
    const { client } = banco();
    const f = await fetchChannelFunnel(client, CASA, { start: hoje, end: hoje });
    expect(f.find((c) => c.channel === 'meta')?.total).toBe(1);
    expect(f.find((c) => c.channel === 'google')?.spend_cents).toBe(100);
    expect((await fetchGoogleAdsSummary(client, 7, OUTRA)).spend_cents).toBe(777);
  });

  it('insights ("Eva/assistente está observando") só da empresa', async () => {
    const { client } = banco();
    const i = await buildMarketingInsights(client, CASA);
    expect(i.some((x) => x.text.includes('criativo'))).toBe(false); // o pendente é da outra
    const j = await buildMarketingInsights(client, OUTRA);
    expect(j.some((x) => x.text.includes('criativo'))).toBe(true);
  });

  it('qualidade por campanha pede company_id em campanhas, gasto e leads', async () => {
    const filtros: Array<[string, string, unknown]> = [];
    const fake = {
      from(tabela: string) {
        const q: any = new Proxy({}, {
          get(_a, p) {
            if (p === 'then') return (ok: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
            return (...args: unknown[]) => { if (p === 'or') filtros.push([tabela, 'or', args[0]]); return q; };
          },
        });
        return q;
      },
    };
    await fetchCampaignQualityInputs(fake as never, 14, new Date(), CASA);
    for (const t of ['marketing_campaigns', 'meta_ads_insights', 'leads']) expect(filtros).toContainEqual([t, 'or', filtroEmpresa(CASA)]);
  });
});

describe('Cadência — lista e ações presas à empresa', () => {
  it('lista só os leads da empresa', async () => {
    const { client } = banco();
    expect((await listCadenciaLeads(client, OUTRA)).map((l) => l.name)).toEqual(['Bia da outra']);
  });

  it('Fechou / Pediu pra parar num lead de OUTRA empresa não mexe em nada', async () => {
    const { client, tabelas } = banco();
    expect(await fecharLeadCadencia(client, CASA, 'L2')).toEqual({ ok: true, lead: null });
    expect(await optoutLeadCadencia(client, CASA, 'L2')).toEqual({ ok: true, alterou: false });
    const l2 = tabelas.leads.find((l) => l.id === 'L2')!;
    expect(l2.opt_out).toBe(false);
    expect(l2.status).toBe('qualificado');
  });

  it('na própria empresa marca como antes', async () => {
    const { client, tabelas } = banco();
    expect(await fecharLeadCadencia(client, CASA, 'L1')).toEqual({ ok: true, lead: { name: 'Ana' } });
    expect(tabelas.leads.find((l) => l.id === 'L1')).toMatchObject({ status: 'transferido', opt_out: true });
    const b = banco();
    expect(await optoutLeadCadencia(b.client, OUTRA, 'L2')).toEqual({ ok: true, alterou: true });
    expect(b.tabelas.leads.find((l) => l.id === 'L2')).toMatchObject({ opt_out: true, eva_active: false });
  });
});

describe('router — rotas do Marketing (teste estático)', () => {
  const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'router.ts'), 'utf-8');
  const rota = (metodo: 'get' | 'post', caminho: string) => {
    const i = fonte.indexOf(`router.${metodo}('${caminho}'`);
    expect(i, `${metodo} ${caminho}`).toBeGreaterThan(-1);
    const fim = fonte.indexOf('\n  router.', i + 10);
    return fonte.slice(i, fim === -1 ? undefined : fim);
  };

  it('/marketing passa a empresa da sessão a TODAS as consultas e não busca o Analytics da casa pro tenant', () => {
    const r = rota('get', '/marketing');
    expect(r).toContain('const companyId = (req as AuthedRequest).dashUser!.companyId');
    for (const c of ['fetchMarketingKpis(db, companyId)', 'listActiveCampaigns(db, companyId,', 'listRecentCreatives(db, companyId,', 'listPendingAlerts(db, companyId)', 'fetchChannelFunnel(db, companyId,', 'buildMarketingInsights(db, companyId)', 'fetchGoogleAdsSummary(db, 7, companyId)', 'fetchGoogleAdsSummary(db, 30, companyId)', 'fetchCampaignQualityInputs(db, 14, new Date(), companyId)']) {
      expect(r, c).toContain(c);
    }
    expect(r).toMatch(/ehCasa\s*\?\s*fetchGoogleAnalyticsSummary\(30\)/);
  });

  it('blog: publicar/descartar/editar/foto só a casa; tela do tenant é "indisponível"', () => {
    for (const p of ['publicar', 'descartar', 'editar', 'foto']) expect(rota('post', `/marketing/blog/:id/${p}`)).toContain('soDaCasa');
    expect(rota('get', '/marketing/blog')).toContain("renderBlogIndisponivel('empresa')");
    expect(rota('get', '/marketing/blog/:id/revisar')).toContain('soDaCasa');
  });

  it('e-mail: ligar/pausar só a casa (a flag é global); tela do tenant é "indisponível"', () => {
    expect(rota('post', '/marketing/email/ligar')).toContain('soDaCasa');
    expect(rota('post', '/marketing/email/pausar')).toContain('soDaCasa');
    expect(rota('get', '/marketing/email')).toContain('renderEmailIndisponivel()');
  });

  it('backfill-channels (todas as empresas): só a casa e com permissão de editar Marketing', () => {
    const r = rota('post', '/admin/backfill-channels');
    expect(r).toContain("exigir('marketing', 'editar')");
    expect(r).toContain('soDaCasa');
  });

  it('cadência: permissão de Marketing, empresa da sessão, aviso no zap do dono só para lead da casa', () => {
    const g = rota('get', '/cadencia');
    expect(g).toContain("exigir('marketing', 'visualizar')");
    expect(g).toContain('listCadenciaLeads(db, (req as AuthedRequest).dashUser!.companyId)');
    const f = rota('post', '/cadencia/fechou');
    expect(f).toContain("exigir('marketing', 'editar')");
    expect(f).toContain('fecharLeadCadencia(db, companyId, id)');
    expect(f).toContain('companyId === ECOSUN');
    const o = rota('post', '/cadencia/optout');
    expect(o).toContain("exigir('marketing', 'editar')");
    expect(o).toContain('optoutLeadCadencia(db, (req as AuthedRequest).dashUser!.companyId, id)');
    expect(f + o).not.toMatch(/\.from\('leads'\)/);
  });
});

// Regra comum das fatias (usinaPertenceAoOperador / leadEhDaEmpresa): para a
// casa, linha com company_id NULL (antiga, sem empresa) conta como da casa;
// tenant nunca vê linha sem empresa; sem empresa na sessão → nada.
describe('company_id NULL conta como da casa (e só da casa)', () => {
  it('filtroEmpresa: casa = casa OU null; tenant = só dele; sem empresa / valor estranho = nada', () => {
    expect(filtroEmpresa(CASA)).toBe(`company_id.eq.${CASA},company_id.is.null`);
    expect(filtroEmpresa(OUTRA)).toBe(`company_id.eq.${OUTRA}`);
    for (const x of [undefined, null, '', 'x,company_id.is.null', EMPRESA_NENHUMA]) expect(filtroEmpresa(x)).toBe(`company_id.eq.${EMPRESA_NENHUMA}`);
  });

  function comNulo() {
    return bancoFalso({
      meta_ads_insights: [{ company_id: null, campaign_id: 9, spend_cents: 5000, leads: 2, impressions: 100, clicks: 1, date_start: hoje }],
      marketing_campaigns: [{ company_id: null, id: 9, name: 'Antiga sem empresa', status: 'active', codigo_portfolio: 'C9', last_synced_at: agoraIso }],
      marketing_creatives: [{ company_id: null, id: 9, briefing: 'antigo', status: 'em_uso', created_at: agoraIso }],
      marketing_alerts: [{ company_id: null, id: 9, subject: 'antigo', status: 'pending', created_at: agoraIso }],
      channel_daily_metrics: [{ company_id: null, channel: 'google', date: hoje, spend_cents: 300, clicks: 3, impressions: 30, updated_at: agoraIso }],
      leads: [{ company_id: null, id: 'L9', channel: 'meta', status: 'novo', created_at: agoraIso, name: 'Lead antigo', phone: '5561999990009', acquisition_source: 'terceirizada_recovered', opt_out: false }],
    });
  }

  it('a casa vê as linhas sem empresa em todas as consultas', async () => {
    const { client } = comNulo();
    const k = await fetchMarketingKpis(client, CASA);
    expect(k.spend7d_brl).toBe(50);
    expect([k.activeCampaigns, k.creativesEmUso, k.alertasPendentes]).toEqual([1, 1, 1]);
    expect((await listActiveCampaigns(client, CASA)).rows[0]).toMatchObject({ name: 'Antiga sem empresa', spend7d_brl: 50 });
    expect(await listRecentCreatives(client, CASA)).toHaveLength(1);
    expect(await listPendingAlerts(client, CASA)).toHaveLength(1);
    expect((await fetchChannelFunnel(client, CASA, { start: hoje, end: hoje })).find((c) => c.channel === 'meta')?.total).toBe(1);
    expect((await fetchGoogleAdsSummary(client, 7, CASA)).spend_cents).toBe(300);
    expect((await listCadenciaLeads(client, CASA)).map((l) => l.name)).toEqual(['Lead antigo']);
  });

  it('o tenant NÃO vê as linhas sem empresa', async () => {
    const { client } = comNulo();
    const k = await fetchMarketingKpis(client, OUTRA);
    expect([k.spend7d_brl, k.activeCampaigns, k.creativesEmUso, k.alertasPendentes]).toEqual([0, 0, 0, 0]);
    expect((await listActiveCampaigns(client, OUTRA)).rows).toEqual([]);
    expect(await listRecentCreatives(client, OUTRA)).toEqual([]);
    expect(await listPendingAlerts(client, OUTRA)).toEqual([]);
    expect((await fetchChannelFunnel(client, OUTRA, { start: hoje, end: hoje })).every((c) => c.total === 0 && c.spend_cents === 0)).toBe(true);
    expect((await fetchGoogleAdsSummary(client, 7, OUTRA)).spend_cents).toBe(0);
    expect(await listCadenciaLeads(client, OUTRA)).toEqual([]);
    expect(await buildMarketingInsights(client, OUTRA)).toEqual([]);
  });

  it('sem empresa na sessão: nada', async () => {
    const { client } = comNulo();
    expect(await listCadenciaLeads(client, '')).toEqual([]);
    expect((await fetchMarketingKpis(client, '')).activeCampaigns).toBe(0);
  });

  it('Fechou / Pediu pra parar: a casa mexe no lead sem empresa; o tenant não', async () => {
    const t = comNulo();
    expect(await fecharLeadCadencia(t.client, OUTRA, 'L9')).toEqual({ ok: true, lead: null });
    expect(await optoutLeadCadencia(t.client, OUTRA, 'L9')).toEqual({ ok: true, alterou: false });
    expect(t.tabelas.leads[0]).toMatchObject({ status: 'novo', opt_out: false });
    const c = comNulo();
    expect(await fecharLeadCadencia(c.client, CASA, 'L9')).toEqual({ ok: true, lead: { name: 'Lead antigo' } });
    expect(c.tabelas.leads[0]).toMatchObject({ status: 'transferido', opt_out: true });
    const o = comNulo();
    expect(await optoutLeadCadencia(o.client, CASA, 'L9')).toEqual({ ok: true, alterou: true });
  });
});
