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

  // Raiz redireciona pro home.
  router.get('/', (_req, res) => {
    res.redirect('/dashboard/home');
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
