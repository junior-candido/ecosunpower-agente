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
import { empresa } from '../empresa-config.js';
import type { MonitoringService } from '../monitoring/service.js';
import type { ProposalAssistant } from '../proposal-assistant.js';
import type { MetaWhatsAppService } from '../meta-whatsapp.js';
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
  getTimelineAbordagens,
  getKPIsAbordagemMes,
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
import {
  listVisualizacoesPorSlug,
  resumoVisualizacoesPorSlug,
} from './proposta-views-queries.js';
import {
  renderVisualizacoesPage,
  renderVisualizacoesCsv,
} from './proposta-views-view.js';
import type { MarcaInversor } from '../monitoring/types.js';
import type { ResultadoImport } from '../leads-import-meta-junho.js';
import { classificarSistema } from '../monitoring/classificacao.js';
import { garantiaInfo } from '../monitoring/garantia.js';
import { filtrarOrdenarSistemas } from '../monitoring/filtro.js';
import multer from 'multer';
import { listClientes, getClienteDetail } from './clientes-queries.js';
import { renderClientesListPage, renderClienteDetailPage, renderFormNovoCliente } from './clientes-views.js';
import { parseProprietarioInput } from './proprietario.js';
import { getEvaInsights } from '../clientes/insights.js';
import { uploadAnexo, deleteAnexoFile } from '../anexos/storage.js';
import { PosInstalacaoService } from '../relatorios/pos-instalacao/service.js';
import { renderPosInstalacaoHtml } from '../relatorios/pos-instalacao/template.js';
import { renderFormNovoRelatorio, renderPreviewRelatorio } from './relatorio-pi-views.js';
import {
  renderFormNovaProposta,
  renderPreviewProposta,
  CONCESSIONARIA_VALUES,
  FATORES_PERDA,
  MARCAS_MODULO,
  MARCAS_INVERSOR,
  TIPOS_ESTRUTURA,
} from './proposta-form-view.js';

// Página do botão de importação dos leads da campanha Meta junho/2026.
// didApply=false: prévia + botão pra gravar. didApply=true: resultado da gravação.
function renderImportLeadsJunhoPage(r: ResultadoImport, didApply: boolean): string {
  const cor = (s: string) => s === 'ok' ? '#34d399' : s === 'pulado' ? '#fbbf24' : '#f87171';
  const rows = r.linhas.map((l) => `
    <tr style="border-bottom:1px solid #1e293b">
      <td style="padding:8px 12px">${escapeHtmlSimple(l.nome)}</td>
      <td style="padding:8px 12px;color:#94a3b8">${escapeHtmlSimple(l.phone)}</td>
      <td style="padding:8px 12px;color:#94a3b8">${escapeHtmlSimple(l.faixa)}</td>
      <td style="padding:8px 12px;color:${cor(l.status)}">${escapeHtmlSimple(l.destino)}${l.erro ? ` — ${escapeHtmlSimple(l.erro)}` : ''}</td>
    </tr>`).join('');
  const banner = didApply
    ? `<div style="background:#064e3b;border:1px solid #34d399;border-radius:12px;padding:16px;margin-bottom:20px">
         ✅ <strong>Importado!</strong> ${r.gravados} gravados · ${r.pulados} pulados · ${r.erros} erros.
         Os "cadência Eva" entram na fila no próximo ciclo do cron. <a href="/dashboard/cockpit" style="color:#34d399">Ver dashboard →</a>
       </div>`
    : `<div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px;margin-bottom:20px">
         🔍 <strong>Prévia</strong> — ${r.gravados} prontos · ${r.pulados} pulados · ${r.erros} erros. Nada gravado ainda.
         <form method="POST" action="/dashboard/import-leads-junho" style="margin-top:12px">
           <button type="submit" style="background:#22c55e;color:#052e16;border:0;border-radius:10px;padding:12px 20px;font-weight:700;font-size:15px;cursor:pointer">✅ Importar agora (grava no banco)</button>
         </form>
       </div>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Importar leads — Campanha Meta Junho/2026</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0f172a;color:#e2e8f0;max-width:900px;margin:0 auto;padding:24px">
<h1 style="font-size:22px">📥 Importar leads — Campanha Meta Junho/2026</h1>
<p style="color:#94a3b8;margin-bottom:20px">Campanha <code>META_Leads_Solar_DF-Entorno_2026-06</code> · upsert por telefone (rodar de novo não duplica).</p>
${banner}
<table style="width:100%;border-collapse:collapse;font-size:14px;background:#0b1220;border-radius:12px;overflow:hidden">
  <thead><tr style="background:#1e293b;text-align:left"><th style="padding:10px 12px">Nome</th><th style="padding:10px 12px">Telefone</th><th style="padding:10px 12px">Conta</th><th style="padding:10px 12px">Destino</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
</body></html>`;
}

export function createDashboardRouter(
  supabaseService: SupabaseService,
  monitoringService: MonitoringService,
  options: {
    metaWabaAccessToken?: string;
    anthropicApiKey?: string;
    sendText?: (to: string, text: string) => Promise<void>;
    proposalAssistant?: ProposalAssistant;
    metaService?: MetaWhatsAppService;
  } = {},
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

  // Botão one-off pra importar os leads da campanha de formulário Meta junho/2026
  // (sem mexer em terminal de prod). GET = prévia + botão; POST = grava. Idempotente.
  router.get('/import-leads-junho', async (_req: Request, res: Response) => {
    try {
      const { importarLeadsMetaJunho } = await import('../leads-import-meta-junho.js');
      const r = await importarLeadsMetaJunho(supabaseService, false);
      res.type('text/html').send(renderImportLeadsJunhoPage(r, false));
    } catch (err) {
      res.status(500).type('text/html').send(`<p>Erro: ${escapeHtmlSimple((err as Error).message)}</p>`);
    }
  });
  router.post('/import-leads-junho', async (_req: Request, res: Response) => {
    try {
      const { importarLeadsMetaJunho } = await import('../leads-import-meta-junho.js');
      const r = await importarLeadsMetaJunho(supabaseService, true);
      res.type('text/html').send(renderImportLeadsJunhoPage(r, true));
    } catch (err) {
      res.status(500).type('text/html').send(`<p>Erro ao importar: ${escapeHtmlSimple((err as Error).message)}</p>`);
    }
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
      const search = typeof req.query.q === 'string' ? req.query.q : '';
      const limit = Math.max(1, Math.min(200, parseInt(String(req.query.limit ?? '10')) || 10));
      const offset = Math.max(0, parseInt(String(req.query.offset ?? '0')) || 0);
      const { buildLeadsInsights } = await import('./ai-summary.js');
      const [result, insights] = await Promise.all([
        listLeads(supabase, { status, only_alerts, search, limit, offset }),
        buildLeadsInsights(supabase),
      ]);
      res.send(renderLeadsListPage(result.rows, {
        status,
        only_alerts,
        search,
        limit,
        offset,
        total: result.total,
        countByStatus: result.countByStatus,
        insights,
      }));
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

  // REMOVE LEAD PERMANENTEMENTE — usa excluirLead pra ganhar o guard:
  // bloqueia se houver proposta ou sistema FV vinculado, caso contrario
  // deleta e CASCADE limpa cadencia, conversas, anexos, relatorios, etc.
  router.post('/leads/:id/delete', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) return res.status(400).send('id inválido');
    const r = await supabaseService.excluirLead(id);
    if (!r.ok) {
      return res.status(400).send(
        `<h2>Não foi possível excluir</h2><p>${escapeHtmlSimple(r.error ?? '')}</p><a href="/dashboard/leads/${id}">← voltar</a>`,
      );
    }
    res.redirect('/dashboard/leads');
  });

  router.post('/leads/:id/arquivar', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) return res.status(400).send('id inválido');
    const r = await supabaseService.arquivarLead(id);
    if (!r.ok) return res.status(500).send(`erro: ${escapeHtmlSimple(r.error ?? '')}`);
    res.redirect('/dashboard/leads');
  });

  router.post('/leads/:id/mark-lost', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) return res.status(400).send('id inválido');
    const reason = String((req.body as any)?.reason ?? '').trim();
    const notes = String((req.body as any)?.notes ?? '').trim();
    if (!reason) {
      return res.status(400).send('Motivo obrigatório. <a href="/dashboard/leads/' + id + '">← voltar</a>');
    }
    const r = await supabaseService.marcarLeadPerdido(id, reason, notes || null);
    if (!r.ok) {
      return res.status(400).send(
        `<h2>Erro ao marcar perdido</h2><p>${escapeHtmlSimple(r.error ?? '')}</p><a href="/dashboard/leads/${id}">← voltar</a>`,
      );
    }
    res.redirect(`/dashboard/leads/${id}`);
  });

  router.post('/leads/:id/unmark-lost', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) return res.status(400).send('id inválido');
    const r = await supabaseService.desmarcarLeadPerdido(id);
    if (!r.ok) return res.status(500).send(`erro: ${escapeHtmlSimple(r.error ?? '')}`);
    res.redirect(`/dashboard/leads/${id}`);
  });

  router.post('/leads/:id/desarquivar', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) return res.status(400).send('id inválido');
    const r = await supabaseService.desarquivarLead(id);
    if (!r.ok) return res.status(500).send(`erro: ${escapeHtmlSimple(r.error ?? '')}`);
    res.redirect(`/dashboard/leads/${id}`);
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

  // Marketing: KPIs 7d + campanhas (tabs+busca+pag) + criativos + alertas + funil por canal.
  router.get('/marketing', async (req: Request, res: Response) => {
    try {
      const { fetchMarketingKpis, listActiveCampaigns, listRecentCreatives, listPendingAlerts, fetchChannelFunnel, fetchGoogleAdsSummary } =
        await import('./marketing-queries.js');
      const { renderMarketingPage } = await import('./marketing-views.js');
      // Período padrão: últimos 7 dias (alinhado com os KPIs da página)
      const hoje = new Date();
      const endDate = hoje.toISOString().slice(0, 10);
      const startDate = new Date(hoje.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const periodo = { start: startDate, end: endDate };
      const statusParam = String(req.query.status ?? 'active');
      const status: 'active' | 'paused' | 'all' = (statusParam === 'paused' || statusParam === 'all') ? statusParam : 'active';
      const search = typeof req.query.q === 'string' ? req.query.q : '';
      const limit = Math.max(1, Math.min(200, parseInt(String(req.query.limit ?? '20')) || 20));
      const offset = Math.max(0, parseInt(String(req.query.offset ?? '0')) || 0);
      const { buildMarketingInsights } = await import('./ai-summary.js');
      const { fetchGoogleAnalyticsSummary } = await import('../marketing/google-analytics/index.js');
      const [kpis, campaignsResult, creatives, alerts, channels, insights, googleAds7d, googleAds30d, ga4_30d] = await Promise.all([
        fetchMarketingKpis(supabase),
        listActiveCampaigns(supabase, { status, search, limit, offset }),
        listRecentCreatives(supabase, 8),
        listPendingAlerts(supabase),
        fetchChannelFunnel(supabase, periodo),
        buildMarketingInsights(supabase),
        fetchGoogleAdsSummary(supabase, 7),
        fetchGoogleAdsSummary(supabase, 30),
        fetchGoogleAnalyticsSummary(30).catch((err) => ({
          sessions: 0, users: 0, pageviews: 0, dias_com_dado: 0, channels: [], top_pages: [],
          error: (err as Error).message,
        })),
      ]);
      // Qualidade por campanha: janela 14 dias. Falha silenciosa — não quebra a página.
      let campaignQuality: import('../marketing/campaign-quality.js').CampaignQualityReport | undefined;
      try {
        const { fetchCampaignQualityInputs } = await import('../marketing/campaign-quality-data.js');
        const { analyzeCampaignQuality } = await import('../marketing/campaign-quality.js');
        const inputs = await fetchCampaignQualityInputs(supabase, 14);
        campaignQuality = analyzeCampaignQuality(inputs.spends, inputs.leads);
      } catch (err) {
        console.warn('[dashboard/marketing] campaignQuality falhou (segue sem):', (err as Error).message);
      }
      res.send(renderMarketingPage({
        kpis,
        campaigns: campaignsResult.rows,
        creatives,
        alerts,
        channels,
        campaignsFilters: { status, search, limit, offset },
        campaignsCounts: campaignsResult.countByStatus,
        campaignsTotal: campaignsResult.total,
        insights,
        googleAds7d,
        googleAds30d,
        ga4_30d,
        campaignQuality,
      }));
    } catch (err) {
      console.error('[dashboard/marketing]', err);
      res.status(500).send(`<h2>Erro ao carregar marketing</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });

  // Backfill manual de leads.channel — alternativa ao CLI quando Easypanel não
  // expoe shell. Botao chamando esta rota fica na secao Canais.
  router.post('/admin/backfill-channels', async (req: Request, res: Response) => {
    try {
      const { runBackfillChannels } = await import('./backfill-channel-runner.js');
      const recomputaTodos = req.query.all === '1';
      const { processados, breakdown } = await runBackfillChannels(supabaseService, { recomputaTodos });
      const breakdownStr = Object.entries(breakdown)
        .map(([c, n]) => `<li><strong>${c}</strong>: ${n}</li>`)
        .join('');
      res.type('text/html').send(`
        <div style="font-family: system-ui; max-width: 600px; margin: 40px auto; padding: 24px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
          <h2 style="color: #059669; margin: 0 0 8px;">✅ Backfill concluído</h2>
          <p style="color: #475569; margin: 0 0 16px;">Modo: ${recomputaTodos ? 'recomputou TODOS os leads' : 'apenas leads sem channel'}.</p>
          <p style="margin: 0 0 8px;"><strong>Processados:</strong> ${processados} leads</p>
          <p style="margin: 0 0 8px;"><strong>Breakdown por canal:</strong></p>
          <ul style="margin: 0 0 20px;">${breakdownStr}</ul>
          <a href="/dashboard/marketing" style="display: inline-block; padding: 8px 16px; background: #0284c7; color: white; text-decoration: none; border-radius: 6px;">← Voltar para Marketing</a>
        </div>
      `);
    } catch (err) {
      console.error('[admin/backfill-channels]', err);
      res.status(500).send(`<h2>Erro no backfill</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre><a href="/dashboard/marketing">← voltar</a>`);
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

  // Visualizacoes detalhadas de UMA proposta (timeline + KPIs).
  // ?preview=1 inclui aberturas preview admin no timeline (default: exclui).
  router.get('/propostas/:slug/visualizacoes', async (req: Request, res: Response) => {
    try {
      const slug = String(req.params.slug ?? '');
      if (!/^[A-Za-z0-9_-]{8,64}$/.test(slug)) {
        return res.status(400).send('<h2>Slug inválido</h2>');
      }
      const incluirPreview = req.query.preview === '1';

      const [resumo, visualizacoes] = await Promise.all([
        resumoVisualizacoesPorSlug(supabase, slug),
        listVisualizacoesPorSlug(supabase, slug, { incluir_preview: incluirPreview }),
      ]);

      if (!resumo) {
        return res.status(404).send('<h2>Proposta não encontrada</h2>');
      }

      res.send(renderVisualizacoesPage({ resumo, visualizacoes, incluirPreview }));
    } catch (err) {
      console.error('[dashboard/visualizacoes]', err);
      res.status(500).send(`<h2>Erro ao listar visualizações</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });

  // Export CSV das visualizacoes (mesmo filtro do HTML acima).
  router.get('/propostas/:slug/visualizacoes.csv', async (req: Request, res: Response) => {
    try {
      const slug = String(req.params.slug ?? '');
      if (!/^[A-Za-z0-9_-]{8,64}$/.test(slug)) {
        return res.status(400).type('text/plain').send('slug inválido');
      }
      const incluirPreview = req.query.preview === '1';
      const visualizacoes = await listVisualizacoesPorSlug(supabase, slug, {
        incluir_preview: incluirPreview,
      });
      const csv = renderVisualizacoesCsv(visualizacoes);
      res.setHeader('Content-Disposition', `attachment; filename="visualizacoes-${slug}.csv"`);
      res.type('text/csv').send(csv);
    } catch (err) {
      console.error('[dashboard/visualizacoes.csv]', err);
      res.status(500).type('text/plain').send(`Erro: ${(err as Error).message}`);
    }
  });

  // Monitoramento: lista de sistemas FV instalados com geracao do dia/mes.
  router.get('/monitoramento', async (req: Request, res: Response) => {
    try {
      const sistemas = await monitoringService.listarParaDashboard();
      const hoje = new Date();
      const enriched = sistemas.map((s) => {
        const cls = classificarSistema({
          ativo: s.ativo,
          ultimoErro: s.ultimo_erro ?? null,
          potenciaKwp: s.potencia_kwp,
          uf: s.uf,
          diasSemGeracao: (s.geracao_7d_kwh ?? 0) === 0 && s.ativo ? 7 : 0,
          realUltimos7: s.geracao_7d_kwh ?? 0,
        });
        const g = garantiaInfo(
          { data_instalacao: s.data_instalacao, marca_inversor: s.marca_inversor, painel_marca: (s as { painel_marca?: string | null }).painel_marca ?? null },
          hoje,
        );
        const ecosunTxt = g.ecosun.status === 'vigente' ? `vigente (${g.ecosun.mesesRestantes} meses)`
          : g.ecosun.status === 'encerrada' ? `encerrada há ${g.ecosun.mesesDesdeFim} meses` : 'indefinida';
        return {
          ...s,
          nivel: cls.nivel,
          alertaTexto: cls.alerta?.texto ?? null,
          garantiaIdade: g.idadeTexto,
          garantiaEcosun: ecosunTxt,
        };
      });
      const qf = {
        q: typeof req.query.q === 'string' ? req.query.q : undefined,
        marca: typeof req.query.marca === 'string' ? req.query.marca : undefined,
        cidade: typeof req.query.cidade === 'string' ? req.query.cidade : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        ord: typeof req.query.ord === 'string' ? req.query.ord : undefined,
      };
      const filtered = filtrarOrdenarSistemas(enriched as any, qf);
      const { getAlertasAtivosResumo, getAlertasEnviadosUltimos7d } = await import('./queries.js');
      const [alertasResumo, sparkline7d, kpisEva] = await Promise.all([
        getAlertasAtivosResumo(supabase),
        getAlertasEnviadosUltimos7d(supabase),
        getKPIsAbordagemMes(supabase).catch(() => undefined),
      ]);
      res.send(renderMonitoramentoPage(filtered as any, qf, alertasResumo, sparkline7d, kpisEva));
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
    } else if (marca === 'nep') {
      const jwt = String(req.body?.jwt ?? '').trim();
      if (!jwt) {
        return res.status(400).send(renderImportarSitesPage({
          errorMsg: 'JWT obrigatorio pra NEP. Siga as 4 instrucoes do form pra capturar.',
        }));
      }
      credenciais = { jwt };
    } else if (marca === 'abb') {
      // Campo password renomeado pra abb_password no form pra nao colidir com
      // o password do Deye quando o usuario alterna entre branches do select.
      const userId = String(req.body?.userId ?? '').trim();
      const password = String(req.body?.abb_password ?? '').trim();
      const apiKey = String(req.body?.apiKey ?? '').trim();
      if (!userId || !password || !apiKey) {
        return res.status(400).send(renderImportarSitesPage({
          errorMsg: 'ABB precisa de e-mail, senha e API Key (vide instrucoes no form).',
        }));
      }
      credenciais = { userId, password, apiKey };
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
      const donoLeadId = detalhe.sistema.lead_id;
      const [donoRow, timelineAbordagens] = await Promise.all([
        donoLeadId ? supabaseService.getClienteByLeadId(donoLeadId) : Promise.resolve(null),
        getTimelineAbordagens(supabase, id).catch(() => [] as import('./queries.js').AbordagemTimelineRow[]),
      ]);
      res.send(renderDetalheSistemaPage(detalhe, donoRow ? { id: donoRow.id, name: donoRow.name } : null, timelineAbordagens));
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
    const leadId = detalhe.sistema.lead_id;
    const donoRow = leadId ? await supabaseService.getClienteByLeadId(leadId) : null;
    const dono = donoRow ? { id: donoRow.id, name: donoRow.name, phone: donoRow.phone } : null;
    res.send(renderEditarSistemaPage(detalhe.sistema, dono));
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
    // Proprietário (vincular / trocar / desvincular). Pode vir do botão
    // "Desvincular" (name=desvincular value=1) ou do seletor (lead_id UUID
    // de cliente existente, OU novo_name+novo_phone pra criar na hora).
    const prop = parseProprietarioInput(body);
    if (prop.acao === 'erro') {
      return res.status(400).send('<h2>Proprietário inválido</h2><a href="javascript:history.back()">← voltar</a>');
    }
    // undefined = não mexe no lead_id; null = desvincular; string UUID = vincular
    let leadIdParaVincular: string | null | undefined = undefined;
    if (prop.acao === 'desvincular') {
      leadIdParaVincular = null;
    } else if (prop.acao === 'vincular') {
      leadIdParaVincular = prop.lead_id;
    } else {
      // 'manter' — mas pode ser criação de novo cliente
      const novoName = String(body.novo_name ?? '').trim();
      const novoPhone = String(body.novo_phone ?? '').replace(/\D/g, '');
      if (novoName.length >= 2 && novoPhone.length >= 10) {
        const novo = await supabaseService.vincularNovoLeadAoSistema({ sistema_id: id, name: novoName, phone: novoPhone });
        if (!novo.ok) {
          return res.status(500).send(`<h2>Erro ao criar cliente: ${escapeHtmlSimple(novo.error ?? '')}</h2><a href="javascript:history.back()">← voltar</a>`);
        }
        // vincularNovoLeadAoSistema já setou o lead_id; não repetir no fields
      }
    }

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
    const fieldsComProp: Record<string, unknown> = { ...fields };
    if (leadIdParaVincular !== undefined) fieldsComProp.lead_id = leadIdParaVincular;
    const r = await monitoringService.atualizarSistema(id, fieldsComProp);
    if (!r.ok) {
      return res.status(500).send(`<h2>Erro: ${escapeHtmlSimple(r.reason ?? 'desconhecido')}</h2><a href="javascript:history.back()">← voltar</a>`);
    }
    res.redirect(`/dashboard/monitoramento/${id}`);
  });

  // Busca de clientes pra vínculo de proprietário (autocomplete).
  router.get('/api/clientes/search', async (req: Request, res: Response) => {
    try {
      const q = String(req.query.q ?? '');
      const rows = await supabaseService.searchClientesParaVinculo(q, 10);
      res.json(rows);
    } catch (err) {
      console.error('[dashboard/clientes/search]', err);
      res.status(500).json([]);
    }
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

  router.post('/monitoramento/:id/excluir', async (req: Request, res: Response) => {
    try {
      const r = await monitoringService.excluirSistema(String(req.params.id ?? ''));
      if (!r.ok) {
        return res.status(500).send(`<h2>Erro ao excluir</h2><pre>${r.reason ?? ''}</pre><a href="/dashboard/monitoramento">← voltar</a>`);
      }
      return res.redirect('/dashboard/monitoramento');
    } catch (err) {
      console.error('[dashboard/monitoramento/excluir]', err);
      return res.status(500).send(`<h2>Erro ao excluir</h2><pre>${(err as Error).message}</pre>`);
    }
  });

  // Gera o Relatorio da Usina sob demanda (gancho do botao da tela S1).
  // Cria slug novo (link compartilhavel) + QR. NAO envia a ninguem (envio
  // ao cliente = S4). Modo 'acompanhamento' (uso do Junior).
  router.get('/monitoramento/:id/relatorio', async (req: Request, res: Response) => {
    try {
      const { gerarRelatorio } = await import('../monitoring/relatorio/gerar.js');
      const { htmlToPdf, gerarQrCodeDataUrl } = await import('../proposal/pdf-generator.js');
      // [ECOSOF] Logo resolvida em runtime (Storage com fallback embutido).
      const { obterLogoBase64 } = await import('../proposal/assets/logo-base64.js');
      const id = String(req.params.id ?? '');
      const r = await gerarRelatorio({
        getDetalhe: (sid: string) => monitoringService.getDetalheSistema(sid),
        criarSlug: (sid: string) => supabaseService.criarRelatorioSlug(sid),
        htmlToPdf,
        gerarQr: gerarQrCodeDataUrl,
        baseUrl: process.env.PUBLIC_BASE_URL ?? 'https://propostas.ecosunpower.eng.br',
        logoBase64: await obterLogoBase64(supabaseService.getClient()),
      }, id, 'acompanhamento');
      if (!r.ok) {
        return res.status(500).send(`<h2>Erro ao gerar relatório</h2><pre>${r.reason}</pre><a href="/dashboard/monitoramento">← voltar</a>`);
      }
      res.type('text/html').send(`<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;max-width:520px;margin:40px auto;text-align:center">
        <h2>Relatório gerado ✅</h2>
        <p>Link público (TTL 60 dias):</p>
        <p><a href="${r.publicUrl}">${r.publicUrl}</a></p>
        <img src="${r.qrDataUrl}" alt="QR" style="width:180px;height:180px">
        <p><a href="${r.publicUrl}?pdf=1">Baixar PDF</a></p>
        <p style="color:#64748b;font-size:13px">Este relatório NÃO foi enviado a ninguém — é só pra você. (Envio ao cliente = S4)</p>
        <p><a href="/dashboard/monitoramento">← voltar ao monitoramento</a></p></body>`);
    } catch (err) {
      console.error('[dashboard/relatorio]', err);
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

  // ===== Perfil do Cliente A1 =====
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
  });

  router.get('/clientes', async (req: Request, res: Response) => {
    try {
      const limit = Math.max(1, Math.min(200, parseInt((req.query.limit as string) ?? '50') || 50));
      const offset = Math.max(0, parseInt((req.query.offset as string) ?? '0') || 0);
      const mostrarArquivados = req.query.show === 'arquivados';
      const filters = {
        q: typeof req.query.q === 'string' ? req.query.q : undefined,
        concessionaria: typeof req.query.concessionaria === 'string' ? req.query.concessionaria : undefined,
        cidade: typeof req.query.cidade === 'string' ? req.query.cidade : undefined,
        ord: typeof req.query.ord === 'string' ? req.query.ord : undefined,
        limit,
        offset,
        mostrarArquivados,
      };
      const { clientes, sistemasOrfaos, total } = await listClientes(supabaseService, filters);
      res.type('text/html').send(renderClientesListPage(clientes as any, filters, sistemasOrfaos, { total, limit, offset, mostrarArquivados }));
    } catch (err) {
      console.error('[dashboard/clientes]', err);
      res.status(500).send(`<h2>Erro ao listar clientes</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });

  router.post('/clientes/:id/arquivar', async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    if (!UUID_RE.test(id)) return res.status(400).send('UUID inválido');
    const r = await supabaseService.arquivarLead(id);
    if (!r.ok) {
      return res.status(500).send(`<h2>Erro: ${escapeHtmlSimple(r.error ?? '')}</h2><a href="/dashboard/clientes/${id}">← voltar</a>`);
    }
    res.redirect(303, '/dashboard/clientes');
  });

  router.post('/clientes/:id/desarquivar', async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    if (!UUID_RE.test(id)) return res.status(400).send('UUID inválido');
    const r = await supabaseService.desarquivarLead(id);
    if (!r.ok) {
      return res.status(500).send(`<h2>Erro: ${escapeHtmlSimple(r.error ?? '')}</h2><a href="/dashboard/clientes?show=arquivados">← voltar</a>`);
    }
    res.redirect(303, `/dashboard/clientes/${id}`);
  });

  // ========================================================================
  // Criar cliente novo (A4-V2.1) — desbloqueia cadastro avulso pra qualquer
  // integrador. Antes só havia criação via vinculação de sistema órfão.
  // DEVE vir ANTES de /clientes/:id pra Express não tentar casar "novo" como UUID.
  // ========================================================================

  router.get('/clientes/novo', async (_req: Request, res: Response) => {
    res.type('text/html').send(renderFormNovoCliente({}));
  });

  router.post('/clientes/novo', async (req: Request, res: Response) => {
    const b = req.body ?? {};
    const erros: string[] = [];

    const name = String(b.name ?? '').trim();
    const phone = String(b.phone ?? '').trim();

    if (!name) erros.push('Campo "Nome" obrigatório');
    if (!phone) erros.push('Campo "Telefone" obrigatório');

    const consumoRaw = String(b.consumo_medio_kwh ?? '').trim();
    let consumo: number | null = null;
    if (consumoRaw) {
      const n = Number(consumoRaw);
      if (!isFinite(n) || n < 0) erros.push('Consumo médio inválido');
      else consumo = n;
    }

    if (erros.length > 0) {
      return res.status(400).type('text/html').send(renderFormNovoCliente({
        erros,
        values: {
          name, phone,
          email: b.email, cpf_cnpj: b.cpf_cnpj,
          city: b.city, uf: b.uf,
          concessionaria: b.concessionaria,
          consumo_medio_kwh: consumoRaw,
          profile: b.profile,
        },
      }));
    }

    const r = await supabaseService.criarLeadAvulso({
      name,
      phone,
      email: b.email || null,
      cpf_cnpj: b.cpf_cnpj || null,
      city: b.city || null,
      uf: b.uf || null,
      concessionaria: b.concessionaria || null,
      consumo_medio_kwh: consumo,
      profile: (b.profile as any) || 'indefinido',
    });

    if (!r.ok) {
      return res.status(400).type('text/html').send(renderFormNovoCliente({
        erros: [r.error ?? 'Falha ao criar cliente'],
        values: {
          name, phone,
          email: b.email, cpf_cnpj: b.cpf_cnpj,
          city: b.city, uf: b.uf,
          concessionaria: b.concessionaria,
          consumo_medio_kwh: consumoRaw,
          profile: b.profile,
        },
      }));
    }

    res.redirect(303, `/dashboard/clientes/${r.lead_id}`);
  });

  router.get('/clientes/:id', async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    if (!UUID_RE.test(id)) return res.status(400).send('UUID inválido');
    try {
      const detail = await getClienteDetail(supabaseService, monitoringService, id);
      if (!detail) return res.status(404).send('<h2>Cliente não encontrado</h2><a href="/dashboard/clientes">← voltar</a>');
      const insights = getEvaInsights(detail as any, new Date());
      res.type('text/html').send(renderClienteDetailPage(detail, insights));
    } catch (err) {
      console.error('[dashboard/clientes/detail]', err);
      res.status(500).send(`<h2>Erro</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });

  router.post('/clientes/:id/edit', async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    if (!UUID_RE.test(id)) return res.status(400).send('UUID inválido');
    const body = req.body ?? {};
    const ALLOWED_INSTALLATION_STATUSES = new Set([
      'novo','qualificando','qualificado','proposta_aceita','contrato_assinado',
      'instalado','medidor_trocado','operando','pos_venda_concluido',
    ]);
    const allowedFields = [
      'name', 'phone', 'email', 'cpf_cnpj', 'data_nascimento', 'estado_civil', 'profile',
      'cep', 'endereco_rua', 'endereco_numero', 'endereco_complemento', 'neighborhood', 'city', 'uf',
      'concessionaria', 'uc_numero', 'tarifa_classe', 'tarifa_modalidade',
      'consumo_medio_kwh', 'conta_media_brl',
      'forma_pagamento', 'banco_financiamento',
      'eh_consumidor_rateio', 'uc_geradora_lead_id', 'percentual_rateio', 'credito_esperado_kwh',
      'vendedor_responsavel', 'lead_source', 'installation_status', 'observacoes_perfil',
    ];
    const fields: Record<string, any> = {};
    for (const k of allowedFields) {
      if (body[k] === undefined) continue;
      let v: any = body[k];
      if (v === '') v = null;
      if (k === 'eh_consumidor_rateio') v = v === 'true' || v === true;
      if (['consumo_medio_kwh', 'credito_esperado_kwh'].includes(k) && v != null) {
        const s = String(v).replace(',', '.');
        const n = Number(s);
        v = Number.isFinite(n) ? n : null;
      }
      if (['conta_media_brl', 'percentual_rateio'].includes(k) && v != null) {
        const s = String(v).replace(',', '.');
        const n = Number(s);
        v = Number.isFinite(n) ? n : null;
      }
      if (k === 'installation_status' && v != null && !ALLOWED_INSTALLATION_STATUSES.has(String(v))) {
        return res.status(400).send(`installation_status inválido: ${escapeHtmlSimple(String(v))}`);
      }
      fields[k] = v;
    }
    if (!fields.name) return res.status(400).send('Nome obrigatório');
    if (!fields.phone) return res.status(400).send('Telefone obrigatório');

    const r = await supabaseService.updateClienteFields(id, fields);
    if (!r.ok) return res.status(500).send(`<h2>Erro: ${escapeHtmlSimple(r.error ?? '')}</h2>`);
    res.redirect(303, `/dashboard/clientes/${id}#dados`);
  });

  router.post('/clientes/:id/excluir', async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    if (!UUID_RE.test(id)) return res.status(400).send('UUID inválido');

    const r = await supabaseService.excluirLead(id);
    if (!r.ok) {
      return res.status(400).send(
        `<h2>Não foi possível excluir</h2><p>${escapeHtmlSimple(r.error ?? '')}</p><a href="/dashboard/clientes/${id}">← voltar</a>`
      );
    }
    res.redirect(303, '/dashboard/clientes');
  });

  router.post('/clientes/:id/anexos', upload.single('file'), async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    if (!UUID_RE.test(id)) return res.status(400).send('UUID inválido');
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).send('Arquivo obrigatório');
    const ALLOWED_ANEXO_TIPOS = new Set([
      'parecer_acesso','foto_telhado','foto_instalacao','foto_inversor',
      'foto_visita_tecnica','contrato','outros',
    ]);
    const tipoRaw = String(req.body?.tipo ?? 'outros');
    const tipo = ALLOWED_ANEXO_TIPOS.has(tipoRaw) ? tipoRaw : 'outros';
    const descricao = req.body?.descricao ? String(req.body.descricao) : null;

    const mimeOk = file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf';
    if (!mimeOk) return res.status(415).send('Tipo de arquivo não suportado');

    const ext = (file.originalname.split('.').pop() ?? 'bin').toLowerCase().slice(0, 8);
    const up = await uploadAnexo(supabaseService.getClient(), id, tipo, file.buffer, file.mimetype, ext);
    if (!up.ok || !up.storage_path) return res.status(500).send(`Upload falhou: ${escapeHtmlSimple(up.error ?? '')}`);

    const ins = await supabaseService.insertAnexo({
      lead_id: id, tipo, descricao,
      storage_path: up.storage_path, mime_type: file.mimetype, size_bytes: file.size,
      created_by: 'junior',
    });
    if (!ins.ok) {
      await deleteAnexoFile(supabaseService.getClient(), up.storage_path).catch(() => {});
      return res.status(500).send(`Erro DB: ${escapeHtmlSimple(ins.error ?? '')}`);
    }
    res.redirect(303, `/dashboard/clientes/${id}#anexos`);
  });

  router.post('/clientes/:id/anexos/:anexoId', async (req: Request, res: Response) => {
    if (req.body?._method !== 'delete') return res.status(400).send('Bad method');
    const id = String(req.params.id ?? '');
    const anexoId = String(req.params.anexoId ?? '');
    if (!UUID_RE.test(id) || !UUID_RE.test(anexoId)) return res.status(400).send('UUID inválido');
    const r = await supabaseService.deleteAnexo(anexoId);
    if (r.ok && r.storage_path) {
      await deleteAnexoFile(supabaseService.getClient(), r.storage_path).catch((e) => console.warn('[clientes/anexos] storage cleanup falhou:', e));
    }
    res.redirect(303, `/dashboard/clientes/${id}#anexos`);
  });

  router.post('/clientes/eva-action', async (req: Request, res: Response) => {
    const action = String(req.body?.action ?? '');
    const leadId = String(req.body?.lead_id ?? '');
    if (!UUID_RE.test(leadId)) return res.status(400).send('lead_id inválido');

    let topic: string | null = null;
    if (action === 'eva_pedir_depoimento') topic = 'pedido_depoimento';
    else if (action === 'agendar_revisao_aniversario') {
      let anos = 1;
      try { anos = JSON.parse(req.body?.extra ?? '{}').anos ?? 1; } catch {}
      topic = `aniversario_${anos}a`;
    }
    if (!topic) return res.status(400).send('Ação desconhecida');

    await supabaseService.upsertMaintenanceReminderPublic({
      lead_id: leadId,
      scheduled_date: new Date().toISOString().slice(0, 10),
      topic,
    });
    res.redirect(303, `/dashboard/clientes/${leadId}`);
  });

  // Vincular sistema órfão a um cliente novo (cria lead + linka)
  router.post('/clientes/vincular-sistema', async (req: Request, res: Response) => {
    const sistemaId = String(req.body?.sistema_id ?? '');
    if (!UUID_RE.test(sistemaId)) return res.status(400).send('Sistema inválido');

    const leadId = String(req.body?.lead_id ?? '').trim();
    // Caminho 1: cliente existente escolhido no seletor
    if (UUID_RE.test(leadId)) {
      const r = await supabaseService.vincularClienteExistente({ sistema_id: sistemaId, lead_id: leadId });
      if (!r.ok) return res.status(500).send(`<h2>Erro: ${escapeHtmlSimple(r.error ?? '')}</h2><a href="/dashboard/clientes">← voltar</a>`);
      return res.redirect(303, `/dashboard/clientes/${leadId}`);
    }

    // Caminho 2: criar cliente novo
    const name = String(req.body?.novo_name ?? '').trim();
    const phone = String(req.body?.novo_phone ?? '').replace(/\D/g, '');
    if (name.length < 2) return res.status(400).send('Escolha um cliente existente ou preencha nome (mín 2 chars)');
    if (phone.length < 10) return res.status(400).send('Telefone inválido — use formato 5561999990000');
    const r = await supabaseService.vincularNovoLeadAoSistema({ sistema_id: sistemaId, name, phone });
    if (!r.ok) return res.status(500).send(`<h2>Erro: ${escapeHtmlSimple(r.error ?? '')}</h2><a href="/dashboard/clientes">← voltar</a>`);
    res.redirect(303, `/dashboard/clientes/${r.lead_id}`);
  });

  // ===== A5 — Relatório Pós-Instalação =====

  // Helper pra criar instância (resolve sistema injection)
  const posInstService = new PosInstalacaoService(supabaseService, async (leadId) => {
    const sistemas = await monitoringService.listarParaDashboard() as any[];
    const s = sistemas.find((x: any) => x.lead_id === leadId);
    if (!s) return null;
    return {
      id: s.id,
      apelido: s.apelido,
      marca_inversor: s.marca_inversor,
      potencia_kwp: s.potencia_kwp,
      qtd_paineis: s.qtd_paineis ?? null,
      painel_marca: s.painel_marca ?? null,
      painel_modelo: s.painel_modelo ?? null,
      inversor_modelo: s.inversor_modelo ?? null,
    };
  });

  // GET form de novo relatório
  router.get('/clientes/:id/relatorio-pos-instalacao/novo', async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    if (!UUID_RE.test(id)) return res.status(400).send('UUID inválido');
    const lead = await supabaseService.getClienteByLeadId(id);
    if (!lead) return res.status(404).send('Cliente não encontrado');
    res.type('text/html').send(renderFormNovoRelatorio({
      lead_id: id,
      cliente_nome: lead.name,
      data_instalacao_pre: lead.installed_at ? String(lead.installed_at).slice(0, 10) : null,
    }));
  });

  // POST submit do form
  router.post('/clientes/:id/relatorio-pos-instalacao',
    upload.array('fotos', 10),
    async (req: Request, res: Response) => {
      const id = String(req.params.id ?? '');
      if (!UUID_RE.test(id)) return res.status(400).send('UUID inválido');

      const files = ((req as any).files ?? []) as Express.Multer.File[];
      // Validação MIME
      for (const f of files) {
        if (!f.mimetype.startsWith('image/')) {
          return res.status(415).send(`Tipo inválido: ${escapeHtmlSimple(f.mimetype)}. Só imagens.`);
        }
      }

      const fotos = files.map((f) => ({
        buffer: f.buffer,
        mimeType: f.mimetype,
        ext: (f.originalname.split('.').pop() ?? 'jpg').toLowerCase().slice(0, 8),
        caption: null,
      }));

      const mensagem = req.body?.mensagem_personalizada ? String(req.body.mensagem_personalizada).trim() : null;
      const dataInstRaw = req.body?.data_instalacao ? String(req.body.data_instalacao) : null;
      if (dataInstRaw && !/^\d{4}-\d{2}-\d{2}$/.test(dataInstRaw)) {
        return res.status(400).send('Data de instalação inválida — use formato YYYY-MM-DD');
      }
      const dataInst = dataInstRaw;

      const r = await posInstService.criarDraft({
        lead_id: id,
        mensagem_personalizada: mensagem || null,
        data_instalacao: dataInst,
        fotos,
      });
      if (!r.ok) return res.status(500).send(`<h2>Erro: ${escapeHtmlSimple(r.error ?? '')}</h2>`);
      res.redirect(303, `/dashboard/clientes/${id}/relatorio-pos-instalacao/${r.id}/preview`);
    },
  );

  // GET preview de um relatório específico
  router.get('/clientes/:id/relatorio-pos-instalacao/:rid/preview', async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    const rid = String(req.params.rid ?? '');
    if (!UUID_RE.test(id) || !UUID_RE.test(rid)) return res.status(400).send('UUID inválido');

    const rel = await supabaseService.getRelatorioPosInstalacaoById(rid);
    if (!rel || rel.lead_id !== id) return res.status(404).send('Relatório não encontrado');

    const view = await posInstService.resolverView(rel, false);
    if (!view) return res.status(500).send('Erro resolvendo relatório');
    const htmlPreview = renderPosInstalacaoHtml(view);

    res.type('text/html').send(renderPreviewRelatorio({
      lead_id: id,
      relatorio_id: rid,
      slug: rel.slug,
      html_preview: htmlPreview,
      ja_enviado: !!rel.enviado_em,
      enviado_em: rel.enviado_em,
    }));
  });

  // POST enviar pelo WhatsApp
  router.post('/clientes/:id/relatorio-pos-instalacao/:rid/enviar', async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    const rid = String(req.params.rid ?? '');
    if (!UUID_RE.test(id) || !UUID_RE.test(rid)) return res.status(400).send('UUID inválido');

    const sendText = options.sendText;
    if (!sendText) return res.status(500).send('sendText não configurado neste ambiente.');

    const r = await posInstService.enviarPorWhatsApp(rid, sendText);
    if (!r.ok) return res.status(400).send(`<h2>Não foi possível enviar: ${escapeHtmlSimple(r.reason ?? '')}</h2><a href="/dashboard/clientes/${id}">← voltar</a>`);
    res.redirect(303, `/dashboard/clientes/${id}/relatorio-pos-instalacao/${rid}/preview`);
  });

  // ========================================================================
  // A4 — Tela admin "Nova proposta"
  // GET form pré-preenchido, POST gera proposta, GET preview, POST envia
  // ========================================================================

  // Faz o parsing+validação do form A4 de proposta a partir do request (body+files).
  // Compartilhado por POST /propostas/novo e POST /propostas/:slug/reabrir, pra os
  // dois fluxos montarem `data`/`attachments`/`tipo` exatamente do mesmo jeito.
  // Comportamento idêntico ao miolo que estava inline no handler `novo`.
  function parseFormProposta(req: Request): {
    data: any;
    attachments: Array<{ buffer: Buffer; mimeType: string; legenda: string }>;
    tipo: 'basica' | 'personalizada';
    erros: string[];
  } {
    const b = req.body;
    const erros: string[] = [];

    // Campos básicos
    const nomeCliente = String(b.nomeCliente ?? '').trim();
    const valorTotalRs = Number(b.valorTotalRs);
    const potenciaKwp = Number(b.potenciaKwp);
    const fatorPerda = Number(b.fatorPerda);
    const consumoMensalKwh = Number(b.consumoMensalKwh);
    const concessionariaRaw = String(b.concessionaria ?? '');
    // Fix 1: resolve label pela lista exportada (fonte única da verdade)
    const concessionariaOpt = CONCESSIONARIA_VALUES.find((c) => c.value === concessionariaRaw);

    // Fix 2: parse numérico de módulo/inversor antes das validações
    const moduloPotenciaW = Number(b.moduloPotenciaW);
    const moduloQuantidade = Number(b.moduloQuantidade);
    const inversorPotenciaW = Number(b.inversorPotenciaW);
    const inversorQuantidade = Number(b.inversorQuantidade);

    // Validações — campos obrigatórios
    if (!nomeCliente) erros.push('Campo "Nome" obrigatório');
    if (!isFinite(valorTotalRs) || valorTotalRs <= 0) erros.push('Campo "Valor total" inválido');
    if (!isFinite(potenciaKwp) || potenciaKwp <= 0) erros.push('Campo "Potência kWp" inválido');
    if (!isFinite(consumoMensalKwh) || consumoMensalKwh <= 0) erros.push('Campo "Consumo médio" inválido');
    if (!concessionariaRaw) erros.push('Campo "Concessionária" obrigatório');

    // Fix 1: validações de selects contra constantes exportadas
    if (concessionariaRaw && !concessionariaOpt) erros.push('Concessionária inválida');
    const fatorPerdaStr = String(b.fatorPerda ?? '');
    if (fatorPerdaStr && !(FATORES_PERDA as ReadonlyArray<string>).includes(fatorPerdaStr)) erros.push('Fator de perda inválido');
    if (b.moduloFabricante && !(MARCAS_MODULO as ReadonlyArray<string>).includes(String(b.moduloFabricante))) erros.push('Marca do módulo inválida');
    if (b.inversorFabricante && !(MARCAS_INVERSOR as ReadonlyArray<string>).includes(String(b.inversorFabricante))) erros.push('Marca do inversor inválida');
    if (b.estruturaTipo && !(TIPOS_ESTRUTURA as ReadonlyArray<string>).includes(String(b.estruturaTipo))) erros.push('Tipo de estrutura inválido');

    // Fix 2: validações NaN/zero módulo e inversor
    if (!isFinite(moduloPotenciaW) || moduloPotenciaW <= 0) erros.push('Potência do módulo inválida');
    if (!isFinite(moduloQuantidade) || moduloQuantidade <= 0) erros.push('Quantidade de módulos inválida');
    if (!isFinite(inversorPotenciaW) || inversorPotenciaW <= 0) erros.push('Potência do inversor inválida');
    if (!isFinite(inversorQuantidade) || inversorQuantidade <= 0) erros.push('Quantidade de inversores inválida');

    // Fix 1: label via lista exportada (fonte única da verdade)
    const concessionariaLabel = concessionariaOpt?.label ?? concessionariaRaw;

    // Parse opcional do array 12 meses
    let consumoMensalKwhDistribuido: number[] | undefined;
    if (b.consumoMensalKwhDistribuido) {
      try {
        const arr = JSON.parse(String(b.consumoMensalKwhDistribuido));
        if (Array.isArray(arr) && arr.length === 12 && arr.every((v) => typeof v === 'number' && isFinite(v) && v >= 0)) {
          consumoMensalKwhDistribuido = arr;
        }
      } catch {}
    }

    // Detecta tipo do inversor pelo fabricante (mesma regra do prompt do Claude)
    const inversorFab = String(b.inversorFabricante ?? '').toLowerCase();
    const tipoInversor: string =
      ['hoymiles', 'enphase', 'nep', 'apsystems'].includes(inversorFab) ? 'microinversor'
      : inversorFab === 'solaredge' ? 'solaredge'
      : 'string';
    const garantiaInversor =
      tipoInversor === 'microinversor' ? 12
      : tipoInversor === 'solaredge' ? 12
      : 10;

    const data: any = {
      nomeCliente,
      documentoCliente: b.documentoCliente || undefined,
      enderecoCliente: b.enderecoCliente || undefined,
      telefoneCliente: b.telefoneCliente || undefined,
      emailCliente: b.emailCliente || undefined,
      tipoCliente: b.tipoCliente || 'residencial',
      modalidade: b.modalidade || 'autoconsumo local',
      concessionaria: concessionariaLabel,
      potenciaKwp,
      fatorPerda,
      consumoMensalKwh,
      consumoMensalKwhDistribuido,
      geracaoMensalKwh: b.geracaoMensalKwh ? Number(b.geracaoMensalKwh) : undefined, // geração do estudo (PVSol)
      tarifaRsKwh: b.tarifaRsKwh ? Number(b.tarifaRsKwh) : undefined,
      custoDisponibilidadeMensal: b.custoDisponibilidadeMensal ? Number(b.custoDisponibilidadeMensal) : undefined,
      modulo: {
        fabricante: b.moduloFabricante,
        modelo: b.moduloModelo,
        potenciaW: moduloPotenciaW,
        quantidade: moduloQuantidade,
        garantiaDefeito: 12,
        garantiaEficiencia: 30,
        tecnologia: 'TOPCon N-Type Bifacial',
      },
      inversor: {
        fabricante: b.inversorFabricante,
        modelo: b.inversorModelo,
        potenciaW: inversorPotenciaW,
        quantidade: inversorQuantidade,
        garantia: garantiaInversor,
        eficiencia: 0.985,
        tipoInversor,
      },
      estruturaFixacao: {
        tipo: b.estruturaTipo || 'Telha cerâmica',
        material: b.estruturaMaterial || 'Alumínio anodizado + parafusos inox',
        descricao: '',
      },
      valorTotalRs,
      validadeDias: b.validadeDias ? Number(b.validadeDias) : undefined,
    };

    // Coleta anexos do multer
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const attachments: Array<{ buffer: Buffer; mimeType: string; legenda: string }> = [];
    if (files) {
      for (const i of [1, 2, 3]) {
        const f = files[`foto${i}`]?.[0];
        if (f) {
          attachments.push({
            buffer: f.buffer,
            mimeType: f.mimetype,
            legenda: String((b as any)[`fotoLegenda${i}`] ?? `Foto ${i}`).slice(0, 100),
          });
        }
      }
      const v = files.video?.[0];
      if (v) {
        attachments.push({
          buffer: v.buffer,
          mimeType: v.mimetype,
          legenda: String(b.videoLegenda ?? 'Simulação').slice(0, 100),
        });
      }
    }

    const tipo: 'basica' | 'personalizada' = attachments.length > 0 ? 'personalizada' : 'basica';

    // Com estudo (anexos): a geração TEM de ser a do estudo, nunca o cálculo HSP.
    // Valida aqui com erro claro em vez de deixar o core estourar.
    if (tipo === 'personalizada' && !(Number(b.geracaoMensalKwh) > 0)) {
      erros.push('Proposta com estudo (fotos) precisa da "Geração do estudo (kWh/mês)" — preenche esse campo.');
    }

    return { data, attachments, tipo, erros };
  }

  router.get('/propostas/novo', async (req: Request, res: Response) => {
    const lead_id = String(req.query.lead_id ?? '');
    if (!lead_id) {
      return res.status(400).send('Parâmetro <code>lead_id</code> obrigatório. Abra esta tela pelo botão "Nova proposta" no perfil de um cliente.');
    }
    if (!UUID_RE.test(lead_id)) {
      return res.status(400).send('UUID inválido');
    }

    const lead = await supabaseService.getClienteByLeadId(lead_id);
    if (!lead) return res.status(404).send('Cliente não encontrado');

    res.type('text/html').send(renderFormNovaProposta({
      lead_id,
      lead: lead as any,
      erros: [],
    }));
  });

  // Multer instance para A4 (até 100MB por arquivo pra acomodar vídeo)
  const uploadProposta = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 },
  });

  router.post('/propostas/novo',
    uploadProposta.fields([
      { name: 'foto1', maxCount: 1 },
      { name: 'foto2', maxCount: 1 },
      { name: 'foto3', maxCount: 1 },
      { name: 'video', maxCount: 1 },
    ]),
    async (req: Request, res: Response) => {
      const lead_id = String(req.body.lead_id ?? '');
      if (!UUID_RE.test(lead_id)) return res.status(400).send('UUID inválido');
      if (!options.proposalAssistant) {
        return res.status(500).send('ProposalAssistant não injetado');
      }

      const lead = await supabaseService.getClienteByLeadId(lead_id);
      if (!lead) return res.status(404).send('Cliente não encontrado');

      // Parsing+validação compartilhado com o fluxo de reabrir (DRY).
      const parsed = parseFormProposta(req);
      const { data, attachments, tipo } = parsed;

      if (parsed.erros.length > 0) {
        return res.status(400).type('text/html').send(renderFormNovaProposta({
          lead_id,
          lead: lead as any,
          erros: parsed.erros,
        }));
      }

      // Fix 3: sanitiza mensagem de erro pra não vazar paths, tokens, schema names.
      // Mesma lógica do shim zap em proposal-assistant.ts.
      function sanitizeProposalError(raw: string): string {
        if (/timeout|ECONN|chromium|puppeteer/i.test(raw)) {
          return 'PDF demorou demais ou Chromium falhou. Tenta de novo em 30s.';
        }
        if (/refresh|token|auth/i.test(raw)) {
          return 'Token Google expirou — regerar GOOGLE_REFRESH_TOKEN com scope drive.file.';
        }
        return raw.length > 120 ? raw.slice(0, 120) + '...' : raw;
      }

      try {
        const result = await options.proposalAssistant.generateProposalCore({
          data,
          modoEnvio: 'junior_envia',
          tipo,
          attachments: attachments.length > 0 ? attachments : undefined,
        });
        return res.redirect(303, `/dashboard/propostas/${result.slug}/preview?lead_id=${lead_id}`);
      } catch (err) {
        // Fix 4: status 400 pra erros de validação, 500 pra falhas de infraestrutura
        const rawMsg = (err as Error).message ?? 'erro desconhecido';
        const friendly = sanitizeProposalError(rawMsg);
        const isValidation = /Campo .* inválido|precisa da geração do estudo/.test(rawMsg);
        return res.status(isValidation ? 400 : 500).type('text/html').send(renderFormNovaProposta({
          lead_id,
          lead: lead as any,
          erros: [`Erro ao gerar proposta: ${friendly}`],
        }));
      }
    },
  );

  router.get('/propostas/:slug/preview', async (req: Request, res: Response) => {
    const slug = String(req.params.slug ?? '');
    if (!/^[A-Za-z0-9_-]{16,32}$/.test(slug)) return res.status(400).send('Slug inválido');

    const result = await supabaseService.getPropostaPublicaBySlug(slug);
    if (result.status !== 'ok') return res.status(404).send('Proposta não encontrada');

    const lead_id = String(req.query.lead_id ?? '');
    const clienteNome = result.clienteNome ?? 'Cliente';

    const extras = await supabaseService.getPropostaPublicaExtras(slug);

    let canEnviar = true;
    let reasonNaoEnviar: string | null = null;
    if (!options.metaService) {
      canEnviar = false;
      reasonNaoEnviar = 'MetaWhatsApp não configurado';
    } else if (!extras.cliente_telefone) {
      canEnviar = false;
      reasonNaoEnviar = 'Sem telefone cadastrado';
    } else if (extras.opt_out) {
      canEnviar = false;
      reasonNaoEnviar = 'Cliente em opt-out';
    }

    const publicBase = process.env.PROPOSAL_PUBLIC_BASE_URL ?? 'https://propostas.ecosunpower.eng.br';
    const publicUrl = `${publicBase}/p/${slug}`;

    res.type('text/html').send(renderPreviewProposta({
      slug,
      htmlPreview: result.html ?? '',
      publicUrl,
      clienteNome,
      clienteTelefone: extras.cliente_telefone ?? '',
      lead_id,
      jaEnviado: !!extras.sent_to_client_at,
      canEnviar,
      reasonNaoEnviar,
    }));
  });

  router.post('/propostas/:slug/enviar', async (req: Request, res: Response) => {
    const slug = String(req.params.slug ?? '');
    if (!/^[A-Za-z0-9_-]{16,32}$/.test(slug)) return res.status(400).send('Slug inválido');
    if (!options.metaService) return res.status(500).send('MetaWhatsApp não configurado');

    const result = await supabaseService.getPropostaPublicaBySlug(slug);
    if (result.status !== 'ok' || !result.html) return res.status(404).send('Proposta não encontrada');

    const extras = await supabaseService.getPropostaPublicaExtras(slug);
    if (!extras.cliente_telefone) return res.status(400).send('Cliente sem telefone');
    if (extras.opt_out) return res.status(400).send('Cliente em opt-out');

    // Re-gera PDF do html salvo (não armazenamos pdf buffer pra economizar storage)
    const { htmlToPdf } = await import('../proposal/pdf-generator.js');
    const pdfBuffer = await htmlToPdf(result.html, { waitForChartMs: 2000 });

    const { enviarPropostaParaCliente } = await import('../eva-sender.js');
    const publicBase = process.env.PROPOSAL_PUBLIC_BASE_URL ?? 'https://propostas.ecosunpower.eng.br';
    const publicUrl = `${publicBase}/p/${slug}`;
    const nomeCliente = result.clienteNome ?? 'Cliente';
    const safeName = nomeCliente.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '-');

    const send = await enviarPropostaParaCliente(options.metaService, {
      telefoneCliente: extras.cliente_telefone,
      nomeCliente,
      linkWebPublico: publicUrl,
      pdfBuffer,
      pdfFilename: `Proposta-${empresa().nomeFantasia}-${safeName}.pdf`,
    });

    if (!send.ok) {
      return res.status(500).send(`Erro ao enviar: ${escapeHtmlSimple(send.reason).slice(0, 200)}`);
    }

    await supabaseService.marcarPropostaPublicaEnviada(slug);

    const lead_id = String(req.body.lead_id ?? '');
    res.redirect(303, `/dashboard/propostas/${slug}/preview${lead_id ? `?lead_id=${lead_id}` : ''}`);
  });

  // ========================================================================
  // Reabrir / ajustar uma proposta — recarrega o form pré-preenchido com os
  // dados_input salvos e permite (a) atualizar o MESMO slug ou (b) gerar nova versão.
  // ========================================================================
  router.get('/propostas/:slug/reabrir', async (req: Request, res: Response) => {
    try {
      const slug = String(req.params.slug);
      if (!/^[A-Za-z0-9_-]{16,32}$/.test(slug)) return res.status(400).type('text/html').send('<p>Link inválido.</p>');
      const { prefillFormFromDadosInput } = await import('./proposta-prefill.js');
      const prop = await supabaseService.getPropostaInputBySlug(slug);
      if (!prop) return res.status(404).type('text/html').send('<p>Proposta não encontrada (ou revogada).</p>');
      if (!prop.dadosInput) return res.status(404).type('text/html').send('<p>Essa proposta é antiga e não tem os dados salvos pra reabrir. Gere uma proposta nova pra esse cliente.</p>');
      const valoresIniciais = prefillFormFromDadosInput(prop.dadosInput as Record<string, any>);
      res.type('text/html').send(renderFormNovaProposta({ lead_id: '', lead: null, valoresIniciais, reabrirSlug: slug }));
    } catch (err) {
      res.status(500).type('text/html').send(`<p>Erro: ${escapeHtmlSimple((err as Error).message)}</p>`);
    }
  });

  router.post('/propostas/:slug/reabrir', uploadProposta.fields([{ name: 'foto1', maxCount: 1 }, { name: 'foto2', maxCount: 1 }, { name: 'foto3', maxCount: 1 }, { name: 'video', maxCount: 1 }]), async (req: Request, res: Response) => {
    try {
      if (!options.proposalAssistant) return res.status(503).type('text/html').send('<p>ProposalAssistant não disponível neste ambiente.</p>');
      const slug = String(req.params.slug);
      const modo = String(req.body?.modo ?? 'atualizar');
      const parsed = parseFormProposta(req);
      if (parsed.erros.length) {
        const { prefillFormFromDadosInput } = await import('./proposta-prefill.js');
        // parsed.data tem o shape aninhado (modulo/inversor/estruturaFixacao) que o
        // prefill espera — req.body é achatado e perderia os equipamentos.
        return res.status(400).type('text/html').send(renderFormNovaProposta({ lead_id: '', lead: null, erros: parsed.erros, reabrirSlug: slug, valoresIniciais: prefillFormFromDadosInput(parsed.data) }));
      }
      const attachments = parsed.attachments.length ? parsed.attachments : undefined;
      if (modo === 'nova') {
        const result = await options.proposalAssistant.generateProposalCore({ data: parsed.data, modoEnvio: 'junior_envia', tipo: parsed.tipo, attachments });
        return res.redirect(303, `/dashboard/propostas/${result.slug}/preview?lead_id=`);
      }
      // Reabrir "atualizar essa": preserva o número da proposta original.
      const orig = await supabaseService.getPropostaInputBySlug(slug);
      await options.proposalAssistant.generateProposalCore({ data: parsed.data, modoEnvio: 'junior_envia', tipo: parsed.tipo, attachments, reopenSlug: slug, numeroProposta: orig?.numeroProposta });
      return res.redirect(303, `/dashboard/propostas/${slug}/preview?lead_id=`);
    } catch (err) {
      res.status(500).type('text/html').send(`<p>Erro ao reabrir: ${escapeHtmlSimple((err as Error).message)}</p>`);
    }
  });

  // ============================================
  // Financeiro: tela + endpoint JSON
  // ============================================

  function parseFiltrosFinanceiro(query: Request['query']) {
    return {
      competencia: typeof query.mes === 'string' ? query.mes : undefined,
      categoria: typeof query.categoria === 'string' ? query.categoria : undefined,
      pfpj: query.pfpj === 'PF' || query.pfpj === 'PJ' ? query.pfpj as 'PF' | 'PJ' : undefined,
      tipo: query.tipo === 'despesa' || query.tipo === 'entrada' ? query.tipo as 'despesa' | 'entrada' : undefined,
    };
  }

  router.get('/financeiro', async (req, res) => {
    try {
      const { getFinanceiroData } = await import('./financeiro-queries.js');
      const { renderFinanceiroPage } = await import('./financeiro-views.js');
      const data = await getFinanceiroData(supabase, parseFiltrosFinanceiro(req.query));
      res.type('text/html').send(renderFinanceiroPage(data));
    } catch (err) {
      res.status(500).type('text/html').send(`<h2>Erro</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });

  router.get('/financeiro/data', async (req, res) => {
    try {
      const { getFinanceiroData } = await import('./financeiro-queries.js');
      res.json(await getFinanceiroData(supabase, parseFiltrosFinanceiro(req.query)));
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return router;
}
