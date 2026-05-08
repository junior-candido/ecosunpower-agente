// Router do dashboard interno EcoSun.
// Registrado em src/index.ts via app.use('/dashboard', createDashboardRouter(supabase)).

import { Router, type Request, type Response } from 'express';
import type { SupabaseService } from '../supabase.js';
import { dashboardBasicAuth } from './auth.js';
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
} from './views.js';

export function createDashboardRouter(supabaseService: SupabaseService): Router {
  const router = Router();
  const supabase = supabaseService.getClient();

  // Auth global pra todas as rotas /dashboard/*.
  router.use(dashboardBasicAuth);

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
