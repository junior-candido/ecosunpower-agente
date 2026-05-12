// Router do dashboard interno EcoSun.
// Registrado em src/index.ts via app.use('/dashboard', createDashboardRouter(supabase)).
//
// Rotas publicas (sem auth):
//   GET  /login   - tela de login com logo + form
//   POST /login   - valida senha e seta cookie de sessao
//   POST /logout  - limpa cookie e redireciona pra /login
//
// Rotas protegidas (auth via cookie de sessao):
//   GET  /        - redirect pra /home
//   GET  /home    - KPIs + grafico
//   GET  /propostas - lista paginada
//   GET  /manutencao - lembretes pendentes

import express, { Router, type Request, type Response } from 'express';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Helper local pra mensagens de erro inline (sem importar das views pra
// evitar dependencia circular).
function escapeHtmlSimple(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
import type { SupabaseService } from '../supabase.js';
import type { MonitoringService } from '../monitoring/service.js';
import {
  dashboardSessionAuth,
  setSessionCookie,
  clearSessionCookie,
  senhaValida,
} from './auth.js';
import {
  fetchDashboardKpis,
  listPropostas,
  listManutencaoPendente,
  fetchPropostasPorMes,
} from './queries.js';
import {
  renderHomePage,
  renderPropostasPage,
  renderManutencaoPage,
  renderLoginPage,
  renderMonitoramentoPage,
  renderImportarSitesPage,
  renderDetalheSistemaPage,
  renderEditarSistemaPage,
} from './views.js';
import type { MarcaInversor } from '../monitoring/types.js';

export function createDashboardRouter(
  supabaseService: SupabaseService,
  monitoringService: MonitoringService,
  options: { metaWabaAccessToken?: string; anthropicApiKey?: string } = {},
): Router {
  const router = Router();
  const supabase = supabaseService.getClient();

  // Parser pra POST /login (form-urlencoded). Apenas pra rotas internas — body
  // gerado por form HTML padrao, sem necessidade de validar HMAC.
  router.use(express.urlencoded({ extended: false, limit: '10kb' }));

  // ----------------------------------------------------------------------
  // Rotas publicas (sem auth)
  // ----------------------------------------------------------------------

  router.get('/login', (req: Request, res: Response) => {
    const next = typeof req.query.next === 'string' ? req.query.next : undefined;
    res.type('text/html').send(renderLoginPage({ next }));
  });

  router.post('/login', (req: Request, res: Response) => {
    const senha = String(req.body?.senha ?? '');
    const next = typeof req.body?.next === 'string' && req.body.next.startsWith('/dashboard')
      ? req.body.next
      : '/dashboard/home';

    if (!senha) {
      return res.status(400).type('text/html').send(
        renderLoginPage({ errorMsg: 'Digite a senha pra entrar.', next }),
      );
    }
    if (!senhaValida(senha)) {
      return res.status(401).type('text/html').send(
        renderLoginPage({ errorMsg: 'Senha incorreta. Tenta de novo.', next }),
      );
    }
    setSessionCookie(res);
    res.redirect(next);
  });

  router.post('/logout', (_req: Request, res: Response) => {
    clearSessionCookie(res);
    res.redirect('/dashboard/login');
  });

  // ----------------------------------------------------------------------
  // Daqui pra baixo, tudo exige auth.
  // ----------------------------------------------------------------------

  router.use(dashboardSessionAuth);

  // Raiz redireciona pro cockpit (visao geral 1-tela). Era /home antes.
  router.get('/', (_req, res) => {
    res.redirect('/dashboard/cockpit');
  });

  // Cockpit: 1 tela dark neon com KPIs + gauges + funil + atividade + top leads.
  // Auto-refresh 30s (gauges) + 5min (page completa). ECharts via CDN.
  router.get('/cockpit', async (_req: Request, res: Response) => {
    try {
      const { getCockpitData } = await import('./cockpit-queries.js');
      const { renderCockpitPage } = await import('./cockpit-views.js');
      const data = await getCockpitData(supabase);
      // IA: sintese leads aguardando + insights gerais da plataforma.
      let leadsAguardando: Awaited<ReturnType<typeof import('./lead-synthesis.js').getLeadsAguardandoAcao>> = [];
      let platformInsights: Awaited<ReturnType<typeof import('./lead-synthesis.js').getPlatformInsights>> = [];
      if (options.anthropicApiKey) {
        try {
          const { default: Anthropic } = await import('@anthropic-ai/sdk');
          const { getLeadsAguardandoAcao, getPlatformInsights } = await import('./lead-synthesis.js');
          const anthropic = new Anthropic({ apiKey: options.anthropicApiKey });
          [leadsAguardando, platformInsights] = await Promise.all([
            getLeadsAguardandoAcao(supabase, anthropic, 6),
            getPlatformInsights(supabase, anthropic),
          ]);
        } catch (err) {
          console.warn('[cockpit] sintese IA falhou (segue sem):', (err as Error).message);
        }
      }
      res.type('text/html').send(renderCockpitPage(data, leadsAguardando, platformInsights));
    } catch (err) {
      console.error('[dashboard/cockpit]', err);
      res.status(500).type('text/html').send(
        `<h2 style="color:#f43f5e;background:#020617;font-family:monospace;padding:20px;">Erro Cockpit</h2>` +
        `<pre style="color:#cbd5e1;background:#020617;font-family:monospace;padding:20px;">${escapeHtmlSimple((err as Error).message)}</pre>`
      );
    }
  });

  // Forca recalculo dos insights IA do card "Eva olhando" (invalida cache).
  // Caller faz POST /cockpit/insights/refresh, depois GET /cockpit pra ver
  // os novos insights. Throttle natural pelo proprio TTL de 15min.
  router.post('/cockpit/insights/refresh', async (_req: Request, res: Response) => {
    try {
      const { invalidateInsightsCache } = await import('./lead-synthesis.js');
      invalidateInsightsCache();
      res.json({ ok: true, message: 'Cache de insights invalidado. Recarregue a página.' });
    } catch (err) {
      console.error('[dashboard/cockpit/insights/refresh]', err);
      res.status(500).json({ ok: false, error: (err as Error).message });
    }
  });

  // Endpoint JSON pro auto-refresh do cockpit (so dados, sem HTML).
  router.get('/cockpit/data', async (_req: Request, res: Response) => {
    try {
      const { getCockpitData } = await import('./cockpit-queries.js');
      const data = await getCockpitData(supabase);
      res.json(data);
    } catch (err) {
      console.error('[dashboard/cockpit/data]', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // SYNC AGORA: forca refresh de tudo que poderia estar defasado (Meta Ads
  // insights, monitoring SolarEdge, descoberta de plantas novas). Botao no
  // cockpit chama isso. Throttle 1x por minuto via app_flags lock.
  router.post('/cockpit/sync', async (_req: Request, res: Response) => {
    try {
      const lockKey = 'cockpit_sync_lock';
      const lockUntil = new Date(Date.now() + 60_000).toISOString();
      const { data: existing } = await supabase
        .from('app_flags').select('value').eq('key', lockKey).maybeSingle();
      if (existing?.value && existing.value > new Date().toISOString()) {
        return res.status(429).json({ ok: false, error: 'aguarde, sync recente em andamento' });
      }
      await supabase.from('app_flags').upsert({ key: lockKey, value: lockUntil }, { onConflict: 'key' });

      const tasks: Array<Promise<unknown>> = [];
      const summary: Record<string, string> = {};

      // Meta Ads insights (so se temos token)
      if (options.metaWabaAccessToken) {
        tasks.push((async () => {
          try {
            const { syncCampaignStatuses, collectInsights } = await import('../marketing/insights-collector.js');
            const sync = await syncCampaignStatuses(supabase, options.metaWabaAccessToken!);
            const ins = await collectInsights(supabase, options.metaWabaAccessToken!);
            summary.marketing = `${sync.synced} sync (${sync.changed} mudaram), ${ins.ok} insights ok / ${ins.failed} falha`;
          } catch (err) {
            summary.marketing = `erro: ${(err as Error).message.slice(0, 80)}`;
          }
        })());
      } else {
        summary.marketing = 'sem token Meta';
      }

      // Monitoring SolarEdge sync
      tasks.push((async () => {
        try {
          const r = await monitoringService.syncAll();
          summary.monitoring = `${r.sucessos}/${r.totalSistemas} ok, ${r.falhas} falhas`;
        } catch (err) {
          summary.monitoring = `erro: ${(err as Error).message.slice(0, 80)}`;
        }
      })());

      await Promise.all(tasks);
      res.json({ ok: true, summary, syncedAt: new Date().toISOString() });
    } catch (err) {
      console.error('[dashboard/cockpit/sync]', err);
      res.status(500).json({ ok: false, error: (err as Error).message });
    }
  });

  // Home: KPIs + grafico mensal.
  router.get('/home', async (_req: Request, res: Response) => {
    try {
      const [kpis, grafico] = await Promise.all([
        fetchDashboardKpis(supabase),
        fetchPropostasPorMes(supabase),
      ]);
      res.send(renderHomePage(kpis, grafico));
    } catch (err) {
      console.error('[dashboard/home]', err);
      res.status(500).send(`<h2>Erro ao carregar dashboard</h2><pre>${(err as Error).message}</pre>`);
    }
  });

  // POST /cadencia/fechou — marca lead como cliente (status=transferido + opt_out=true).
  // Remove da cadência automaticamente.
  router.post('/cadencia/fechou', async (req: Request, res: Response) => {
    const id = String(req.body?.id ?? '').trim();
    if (!UUID_RE.test(id)) return res.status(400).send('id inválido');
    const { error } = await supabase
      .from('leads')
      .update({ status: 'transferido', opt_out: true, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return res.status(500).send(`erro: ${escapeHtmlSimple(error.message)}`);
    res.redirect('/dashboard/cadencia');
  });

  // POST /cadencia/optout — marca lead como opt_out (não atende mais).
  router.post('/cadencia/optout', async (req: Request, res: Response) => {
    const id = String(req.body?.id ?? '').trim();
    if (!UUID_RE.test(id)) return res.status(400).send('id inválido');
    const { error } = await supabase
      .from('leads')
      .update({ opt_out: true, eva_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return res.status(500).send(`erro: ${escapeHtmlSimple(error.message)}`);
    res.redirect('/dashboard/cadencia');
  });

  // Cadência: acompanhamento da reativação de leads da base terceirizada.
  router.get('/cadencia', async (req: Request, res: Response) => {
    try {
      const { listCadenciaLeads, calcKpis } = await import('./cadencia-queries.js');
      const { renderCadenciaPage } = await import('./cadencia-views.js');
      const rows = await listCadenciaLeads(supabase);
      const kpis = calcKpis(rows);
      const filterStatus = typeof req.query.status === 'string' ? req.query.status : undefined;
      res.send(renderCadenciaPage({ rows, kpis, filterStatus }));
    } catch (err) {
      console.error('[dashboard/cadencia]', err);
      res.status(500).send(`<h2>Erro ao carregar cadência</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });

  // ----- LEADS -----
  // Lista de leads com filtros (alertas, status) + acoes rapidas (pausar Eva,
  // retomar, iniciar cadencia manual). Detalhe mostra conversa Eva ↔ cliente.

  router.get('/leads', async (req: Request, res: Response) => {
    try {
      const { listLeads } = await import('./leads-queries.js');
      const { renderLeadsListPage } = await import('./leads-views.js');
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const only_alerts = req.query.only_alerts === '1' || req.query.only_alerts === 'true';
      const rows = await listLeads(supabase, { status, only_alerts });
      res.send(renderLeadsListPage(rows, { status, only_alerts }));
    } catch (err) {
      console.error('[dashboard/leads]', err);
      res.status(500).send(`<h2>Erro ao carregar leads</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });

  router.get('/leads/:id', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) return res.status(400).send('id inválido');
    try {
      const { getLeadDetail } = await import('./leads-queries.js');
      const { renderLeadDetailPage } = await import('./leads-views.js');
      const lead = await getLeadDetail(supabase, id);
      if (!lead) return res.status(404).send('lead não encontrado');
      res.send(renderLeadDetailPage(lead));
    } catch (err) {
      console.error('[dashboard/leads/:id]', err);
      res.status(500).send(`<h2>Erro ao carregar lead</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });

  // Pausa Eva pra este lead (equivalente a /eva off no zap).
  router.post('/leads/:id/pause-eva', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) return res.status(400).send('id inválido');
    const { error } = await supabase
      .from('leads')
      .update({ eva_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return res.status(500).send(`erro: ${escapeHtmlSimple(error.message)}`);
    res.redirect(`/dashboard/leads/${id}`);
  });

  // Reativa Eva (equivalente a /eva on no zap).
  router.post('/leads/:id/resume-eva', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) return res.status(400).send('id inválido');
    const { error } = await supabase
      .from('leads')
      .update({ eva_active: true, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return res.status(500).send(`erro: ${escapeHtmlSimple(error.message)}`);
    res.redirect(`/dashboard/leads/${id}`);
  });

  // Cancela TODOS os toques pendentes de cadencia deste lead.
  router.post('/leads/:id/cancel-cadence', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) return res.status(400).send('id inválido');
    const { error } = await supabase
      .from('eva_cadence')
      .update({ status: 'cancelled', cancelled_reason: 'manual_dashboard' })
      .eq('lead_id', id)
      .eq('status', 'pending');
    if (error) return res.status(500).send(`erro: ${escapeHtmlSimple(error.message)}`);
    res.redirect(`/dashboard/leads/${id}`);
  });

  // Marca opt-out: cliente nao quer ser contatado. Pausa Eva tambem.
  router.post('/leads/:id/opt-out', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) return res.status(400).send('id inválido');
    const now = new Date().toISOString();
    const { error: e1 } = await supabase
      .from('leads')
      .update({ opt_out: true, eva_active: false, updated_at: now })
      .eq('id', id);
    if (e1) return res.status(500).send(`erro: ${escapeHtmlSimple(e1.message)}`);
    // Cancela cadencia pendente tambem
    await supabase
      .from('eva_cadence')
      .update({ status: 'cancelled', cancelled_reason: 'opt_out' })
      .eq('lead_id', id)
      .eq('status', 'pending');
    res.redirect(`/dashboard/leads/${id}`);
  });

  // Remove opt-out (lead volta a poder ser contatado).
  router.post('/leads/:id/opt-in', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) return res.status(400).send('id inválido');
    const { error } = await supabase
      .from('leads')
      .update({ opt_out: false, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return res.status(500).send(`erro: ${escapeHtmlSimple(error.message)}`);
    res.redirect(`/dashboard/leads/${id}`);
  });

  // Muda status do lead (novo, qualificando, agendado, transferido, perdido).
  router.post('/leads/:id/set-status', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) return res.status(400).send('id inválido');
    const status = String(req.body?.status ?? '').trim();
    const allowed = ['novo', 'qualificando', 'agendado', 'transferido', 'perdido'];
    if (!allowed.includes(status)) return res.status(400).send('status inválido');
    const { error } = await supabase
      .from('leads')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return res.status(500).send(`erro: ${escapeHtmlSimple(error.message)}`);
    res.redirect(`/dashboard/leads/${id}`);
  });

  // Edita o nome do lead (campo simples).
  router.post('/leads/:id/edit-name', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) return res.status(400).send('id inválido');
    const name = String(req.body?.name ?? '').trim().slice(0, 100);
    const { error } = await supabase
      .from('leads')
      .update({ name: name || null, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return res.status(500).send(`erro: ${escapeHtmlSimple(error.message)}`);
    res.redirect(`/dashboard/leads/${id}`);
  });

  // REMOVE LEAD PERMANENTEMENTE (acao destrutiva; cascata exclui cadencia,
  // conversas e demais FKs por ON DELETE CASCADE no schema).
  router.post('/leads/:id/delete', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) return res.status(400).send('id inválido');
    const { error } = await supabase.from('leads').delete().eq('id', id);
    if (error) return res.status(500).send(`erro: ${escapeHtmlSimple(error.message)}`);
    res.redirect('/dashboard/leads');
  });

  // Agenda cadencia manual (10 toques + auto-renovacao).
  router.post('/leads/:id/start-cadence', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) return res.status(400).send('id inválido');
    try {
      // supabase aqui e o SupabaseClient cru; precisamos do service.
      // Workaround: chama scheduleCadence via SQL direto seguindo mesmo padrao.
      const now = Date.now();
      const intervals = [0, 1, 3, 7, 14, 30, 60, 90, 180, 365];
      const rows = intervals.map((days, idx) => ({
        lead_id: id,
        step: idx + 1,
        scheduled_for: new Date(now + days * 24 * 60 * 60_000).toISOString(),
        status: 'pending',
      }));
      // Cancela toques pendentes antigos primeiro (idempotencia)
      await supabase.from('eva_cadence').update({ status: 'cancelled', cancelled_reason: 'superseded' })
        .eq('lead_id', id).eq('status', 'pending');
      const { error } = await supabase.from('eva_cadence').upsert(rows, { onConflict: 'lead_id,step', ignoreDuplicates: false });
      if (error) return res.status(500).send(`erro: ${escapeHtmlSimple(error.message)}`);
      res.redirect(`/dashboard/leads/${id}`);
    } catch (err) {
      res.status(500).send(`erro: ${escapeHtmlSimple((err as Error).message)}`);
    }
  });

  // Marketing: KPIs 7d + campanhas ativas + criativos + alertas.
  router.get('/marketing', async (_req: Request, res: Response) => {
    try {
      const { fetchMarketingKpis, listActiveCampaigns, listRecentCreatives, listPendingAlerts } =
        await import('./marketing-queries.js');
      const { renderMarketingPage } = await import('./marketing-views.js');
      const [kpis, campaigns, creatives, alerts] = await Promise.all([
        fetchMarketingKpis(supabase),
        listActiveCampaigns(supabase),
        listRecentCreatives(supabase, 8),
        listPendingAlerts(supabase),
      ]);
      res.send(renderMarketingPage({ kpis, campaigns, creatives, alerts }));
    } catch (err) {
      console.error('[dashboard/marketing]', err);
      res.status(500).send(`<h2>Erro ao carregar marketing</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });

  // Propostas: lista + paginacao + busca.
  router.get('/propostas', async (req: Request, res: Response) => {
    try {
      const limit = Math.max(1, Math.min(200, parseInt((req.query.limit as string) ?? '50') || 50));
      const offset = Math.max(0, parseInt((req.query.offset as string) ?? '0') || 0);
      const search = (req.query.q as string) ?? '';

      const { rows, total } = await listPropostas(supabase, { limit, offset, search });
      res.send(renderPropostasPage({ rows, total, offset, limit, search }));
    } catch (err) {
      console.error('[dashboard/propostas]', err);
      res.status(500).send(`<h2>Erro ao listar propostas</h2><pre>${(err as Error).message}</pre>`);
    }
  });

  // Monitoramento: lista de sistemas FV instalados com geracao do dia/mes.
  router.get('/monitoramento', async (_req: Request, res: Response) => {
    try {
      const sistemas = await monitoringService.listarParaDashboard();
      const rows = sistemas.map((s) => ({
        id: s.id,
        apelido: s.apelido,
        marca_inversor: s.marca_inversor,
        potencia_kwp: s.potencia_kwp,
        cidade: s.cidade,
        uf: s.uf,
        ativo: s.ativo,
        ultima_sincronizacao: s.ultima_sincronizacao,
        ultimo_erro: s.ultimo_erro,
        geracao_hoje_kwh: s.geracao_hoje_kwh,
        geracao_mes_kwh: s.geracao_mes_kwh,
      }));
      res.send(renderMonitoramentoPage(rows));
    } catch (err) {
      console.error('[dashboard/monitoramento]', err);
      res.status(500).send(`<h2>Erro ao listar monitoramento</h2><pre>${(err as Error).message}</pre>`);
    }
  });

  // Importar sites em massa: form GET + POST.
  router.get('/monitoramento/importar', (_req: Request, res: Response) => {
    res.send(renderImportarSitesPage());
  });

  // AJAX: lista empresas/companies da conta Deye (pra Junior pegar o companyId
  // sem caçar no portal). Retorna JSON.
  router.post('/monitoramento/buscar-empresas-deye', async (req: Request, res: Response) => {
    const { listarEmpresasDeye } = await import('../monitoring/adapters/deye.js');
    const credenciais: Record<string, unknown> = {
      appId: String(req.body?.appId ?? '').trim(),
      appSecret: String(req.body?.appSecret ?? '').trim(),
      email: String(req.body?.email ?? '').trim(),
      password: String(req.body?.password ?? '').trim(),
      dataCenter: String(req.body?.dataCenter ?? 'us1').trim().toLowerCase(),
    };
    const result = await listarEmpresasDeye(credenciais);
    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.reason });
    }
    res.json({ ok: true, empresas: result.empresas });
  });

  router.post('/monitoramento/importar', async (req: Request, res: Response) => {
    const marca = String(req.body?.marca ?? '').trim() as MarcaInversor;
    if (!marca) {
      return res.status(400).send(renderImportarSitesPage({
        errorMsg: 'Marca obrigatoria.',
      }));
    }

    // Monta credenciais conforme a marca (cada API tem seu shape)
    let credenciais: Record<string, unknown> = {};
    if (marca === 'solaredge') {
      const apiKey = String(req.body?.api_key ?? '').trim();
      if (!apiKey) {
        return res.status(400).send(renderImportarSitesPage({
          errorMsg: 'API key obrigatoria pra SolarEdge.',
        }));
      }
      credenciais = { api_key: apiKey };
    } else if (marca === 'deye') {
      const appId = String(req.body?.appId ?? '').trim();
      const appSecret = String(req.body?.appSecret ?? '').trim();
      const email = String(req.body?.email ?? '').trim();
      const password = String(req.body?.password ?? '').trim();
      const dataCenter = String(req.body?.dataCenter ?? 'us1').trim().toLowerCase();
      const companyId = String(req.body?.companyId ?? '').trim();
      if (!appId || !appSecret || !email || !password) {
        return res.status(400).send(renderImportarSitesPage({
          errorMsg: 'AppId, AppSecret, email e senha obrigatorios pra Deye.',
        }));
      }
      credenciais = { appId, appSecret, email, password, dataCenter };
      if (companyId) credenciais.companyId = companyId;
    } else {
      return res.status(400).send(renderImportarSitesPage({
        errorMsg: `Marca ${marca} ainda nao tem adapter implementado.`,
      }));
    }

    try {
      const result = await monitoringService.importarSitesEmMassa(marca, credenciais);
      if (!result.ok) {
        return res.status(400).send(renderImportarSitesPage({
          errorMsg: result.reason ?? 'Falha ao importar.',
        }));
      }
      res.send(renderImportarSitesPage({
        successMsg: `Importacao concluida (${marca})`,
        novos: result.novos,
        atualizados: result.atualizados,
        total: result.total,
        sitesNomes: result.sitesPorNome,
      }));
    } catch (err) {
      console.error('[dashboard/importar]', err);
      res.status(500).send(renderImportarSitesPage({
        errorMsg: `Erro inesperado: ${(err as Error).message}`,
      }));
    }
  });

  // Detalhe de UMA usina: KPIs (hoje/mes/ano/total), grafico 30 dias,
  // grafico mensal 12m, alertas. Auto-refresh 30s.
  router.get('/monitoramento/:id', async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return res.status(400).send('UUID invalido');
    }
    // Periodo: ?preset=30d|90d|6m|1a|2a|5a|tudo  OU  ?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
    const preset = typeof req.query.preset === 'string' ? req.query.preset : undefined;
    const inicio = typeof req.query.inicio === 'string' ? req.query.inicio : undefined;
    const fim = typeof req.query.fim === 'string' ? req.query.fim : undefined;
    const isDate = (s?: string) => s && /^\d{4}-\d{2}-\d{2}$/.test(s);
    const validPreset = ['30d', '90d', '6m', '1a', '2a', '5a', 'tudo'].includes(preset ?? '');

    const options: Parameters<typeof monitoringService.getDetalheSistema>[1] = {};
    if (isDate(inicio) && isDate(fim)) {
      options.inicio = inicio;
      options.fim = fim;
    } else if (validPreset) {
      options.preset = preset as '30d' | '90d' | '6m' | '1a' | '2a' | '5a' | 'tudo';
    }

    try {
      const detalhe = await monitoringService.getDetalheSistema(id, options);
      if (!detalhe) {
        return res.status(404).send('<h2>Sistema nao encontrado</h2><a href="/dashboard/monitoramento">← voltar</a>');
      }
      res.send(renderDetalheSistemaPage(detalhe));
    } catch (err) {
      console.error('[dashboard/monitoramento/detalhe]', err);
      res.status(500).send(`<h2>Erro ao carregar detalhe</h2><pre>${(err as Error).message}</pre>`);
    }
  });

  // Editar dados detalhados do sistema (paineis, telhado, etc).
  router.get('/monitoramento/:id/editar', async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).send('UUID invalido');
    const detalhe = await monitoringService.getDetalheSistema(id);
    if (!detalhe) return res.status(404).send('<h2>Sistema nao encontrado</h2><a href="/dashboard/monitoramento">← voltar</a>');
    res.send(renderEditarSistemaPage(detalhe.sistema));
  });

  router.post('/monitoramento/:id/editar', async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).send('UUID invalido');
    const body = req.body ?? {};
    // Conversoes de tipo. Strings vazias viram null pra permitir clear de campos.
    const numOuNull = (v: unknown): number | null => {
      if (v === undefined || v === null || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const strOuNull = (v: unknown): string | null => {
      if (v === undefined || v === null) return null;
      const s = String(v).trim();
      return s === '' ? null : s;
    };
    const fields = {
      apelido: strOuNull(body.apelido) ?? '',
      potencia_kwp: numOuNull(body.potencia_kwp),
      cidade: strOuNull(body.cidade),
      uf: strOuNull(body.uf)?.toUpperCase() ?? null,
      data_instalacao: strOuNull(body.data_instalacao),
      ativo: String(body.ativo) === 'true',
      painel_marca: strOuNull(body.painel_marca),
      painel_modelo: strOuNull(body.painel_modelo),
      qtd_paineis: numOuNull(body.qtd_paineis),
      inversor_modelo: strOuNull(body.inversor_modelo),
      telhado_tipo: strOuNull(body.telhado_tipo),
      telhado_orientacao: strOuNull(body.telhado_orientacao),
      telhado_inclinacao_graus: numOuNull(body.telhado_inclinacao_graus),
      sombreamento_pct: numOuNull(body.sombreamento_pct),
      observacoes: strOuNull(body.observacoes),
    };
    if (!fields.apelido) {
      return res.status(400).send('<h2>Apelido eh obrigatorio</h2><a href="javascript:history.back()">← voltar</a>');
    }
    const r = await monitoringService.atualizarSistema(id, fields);
    if (!r.ok) {
      return res.status(500).send(`<h2>Erro: ${escapeHtmlSimple(r.reason ?? 'desconhecido')}</h2><a href="javascript:history.back()">← voltar</a>`);
    }
    res.redirect(`/dashboard/monitoramento/${id}`);
  });

  // Backfill: puxa historico completo (ate 24 meses) via API.
  // Usado pra preencher gaps de sistemas recem-cadastrados.
  router.post('/monitoramento/:id/backfill', async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).send('UUID invalido');
    try {
      const r = await monitoringService.backfillHistorico(id);
      if (!r.ok) {
        return res.status(500).send(`<h2>Erro ao carregar historico</h2><pre>${escapeHtmlSimple(r.reason ?? 'desconhecido')}</pre><a href="/dashboard/monitoramento/${id}">← voltar</a>`);
      }
      res.redirect(`/dashboard/monitoramento/${id}`);
    } catch (err) {
      console.error('[dashboard/backfill]', err);
      res.status(500).send(`<h2>Erro</h2><pre>${(err as Error).message}</pre>`);
    }
  });

  // Sync manual de TODOS os sistemas (botao "Atualizar todas agora" no dashboard).
  // Importante: declarar antes da rota /:id/sync pra Express nao confundir
  // 'sync-todos' com um UUID.
  router.post('/monitoramento/sync-todos', async (_req: Request, res: Response) => {
    try {
      await monitoringService.syncAll();
      res.redirect('/dashboard/monitoramento');
    } catch (err) {
      console.error('[dashboard/monitoramento/sync-todos]', err);
      res.status(500).send(`<h2>Erro</h2><pre>${(err as Error).message}</pre><a href="/dashboard/monitoramento">← voltar</a>`);
    }
  });

  // Sync manual de um sistema. Re-busca dados da API e popula geracao_diaria.
  router.post('/monitoramento/:id/sync', async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return res.status(400).send('UUID invalido');
    }
    try {
      const result = await monitoringService.syncOne(id);
      if (!result.ok) {
        return res.status(500).send(`<h2>Erro</h2><pre>${result.reason}</pre><a href="/dashboard/monitoramento">← voltar</a>`);
      }
      res.redirect('/dashboard/monitoramento');
    } catch (err) {
      console.error('[dashboard/monitoramento/sync]', err);
      res.status(500).send(`<h2>Erro</h2><pre>${(err as Error).message}</pre>`);
    }
  });

  // Manutencao: lembretes pendentes nos proximos 30 dias.
  router.get('/manutencao', async (_req: Request, res: Response) => {
    try {
      const rows = await listManutencaoPendente(supabase);
      res.send(renderManutencaoPage(rows));
    } catch (err) {
      console.error('[dashboard/manutencao]', err);
      res.status(500).send(`<h2>Erro ao listar manutencao</h2><pre>${(err as Error).message}</pre>`);
    }
  });

  return router;
}
