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
import type { SupabaseClient } from '@supabase/supabase-js';

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
  criarSessionAuth,
  setSessionCookie,
  clearSessionCookie,
} from './auth.js';
import {
  fetchDashboardKpis,
  listPropostas,
  fetchPropostasPorMes,
  getTimelineAbordagens,
  getKPIsAbordagemMes,
} from './queries.js';
import {
  renderHomePage,
  renderPropostasPage,
  renderLoginPage,
  renderMonitoramentoPage,
  renderImportarSitesPage,
  renderDetalheSistemaPage,
  renderEditarSistemaPage,
  renderLayout,
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
import { renderUsuariosListPage, renderUsuarioEditPage } from './usuarios-views.js';
import { listUsers, listRoles, createUser, updateUser, getUserByLogin, touchLastLogin } from './users-store.js';
import { hashSenha, verificarSenha } from './password.js';
import { claimLead, podeVerLead, listLeads, leadsParaKanban } from './leads-queries.js';
import { ORDEM_ETAPAS } from './pipeline.js';
import { ETAPAS_USINA } from '../usina-etapas.js';
import { criarTarefa, concluirTarefa, adiarTarefa, cancelarTarefasPendentesDoLead } from './tarefas.js';
import { registrarAtividade, listarTimeline } from './atividades.js';
import { audit } from './audit.js';
import { can } from './permissions.js';
import type { AuthedRequest } from './auth.js';
import type { BlogGenerator, BlogDraft } from '../blog-generator.js';
import { renderBlogDraftsPage, renderBlogIndisponivel, renderBlogRevisarPage } from './blog-views.js';
import { listarClientesPosVenda, listarAgendaPosVenda } from './pos-venda-queries.js';
import { renderPosVendaPage } from './pos-venda-views.js';
import { objetivoManual, fallbackMensagem } from './pos-venda-mensagens.js';
import { registrarAbordagemManual } from '../monitoring/abordagem/abordagens-repo.js';
import { numerosTrimestre } from '../monitoring/abordagem/numeros-usina.js';
import { listarAgenda, prontuarioUsina, listarLeiturasPendentes, criarManutencao, marcarManutencaoFeita, reagendarManutencao, registrarLeituraManual } from './manutencao-queries.js';
import { renderManutencaoPage, renderProntuario } from './manutencao-views.js';
import type { ManutencaoTipo } from './manutencao-motor.js';
import { criarOS, abrirOSDeManutencao, getOS, salvarOS, addFotoOS, listFotosOS, fotoCountsPorItem, concluirOS } from './os-queries.js';
import { renderOSPage, renderOSLaudoHtml } from './os-views.js';
import { hidratarChecklist, resumoOS, type OSTipo } from './os-checklist.js';

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

// Retorna o lead_id da tarefa SE ela pertence a um lead da company; senão null.
async function leadDaTarefaNaCompany(supabase: SupabaseClient, tarefaId: string, companyId: string): Promise<string | null> {
  const { data: tarefa } = await supabase.from('lead_tarefas').select('lead_id').eq('id', tarefaId).maybeSingle();
  const leadId = (tarefa as { lead_id: string } | null)?.lead_id;
  if (!leadId) return null;
  const { data: lead } = await supabase.from('leads').select('id').eq('id', leadId).eq('company_id', companyId).maybeSingle();
  return lead ? leadId : null;
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
    engineerPhone?: string; // telefone do Junior — recebe o aviso "cliente fechou"
    blogGenerator?: BlogGenerator;
    // Wrapper que publica o draft espelhando o fluxo do WhatsApp (publishDraftToGitHub
    // com PAT/repo/branch da config + markPublished). Vem pronto do index.ts.
    publicarDraft?: (draft: BlogDraft) => Promise<{ url: string }>;
  } = {},
): Router {
  const router = Router();
  const supabase = supabaseService.getClient();

  // Middleware-fábrica de gating de permissão por área/nível. Aplicado ANTES
  // dos handlers das rotas por área. Sem permissão → 403. Compatível com o
  // req.dashUser carregado pelo middleware de sessão (Task 7/12).
  function exigir(area: import('./permissions.js').Area, nivel: import('./permissions.js').Nivel) {
    return (req: AuthedRequest, res: Response, next: import('express').NextFunction) => {
      if (can(req.dashUser, area, nivel)) { next(); return; }
      res.status(403).send('<h2>Sem permissão</h2><p>Fale com o administrador.</p>');
    };
  }

  // Parser dos forms internos (form-urlencoded). Limite maior porque a tela de
  // revisão do blog manda o markdown INTEIRO do post (acentos incham ~3x no
  // envio), o que estourava o antigo 10kb ("Payload Too Large"). 1mb sobra e é
  // seguro: são rotas internas, atrás de login.
  router.use(express.urlencoded({ extended: false, limit: '1mb' }));

  // ----------------------------------------------------------------------
  // Rotas publicas (sem auth)
  // ----------------------------------------------------------------------

  router.get('/login', (req: Request, res: Response) => {
    const next = typeof req.query.next === 'string' ? req.query.next : undefined;
    res.type('text/html').send(renderLoginPage({ next }));
  });

  router.post('/login', async (req: Request, res: Response) => {
    const login = String(req.body?.login ?? '').trim();
    const senha = String(req.body?.senha ?? '');
    const next = typeof req.body?.next === 'string' && req.body.next.startsWith('/dashboard')
      ? req.body.next
      : '/dashboard/cockpit';

    const found = login ? await getUserByLogin(supabase, ECOSUN, login) : null;
    const ok = found ? await verificarSenha(senha, found.senhaHash) : false;
    if (!ok || !found) {
      return res.status(401).type('text/html').send(
        renderLoginPage({ errorMsg: 'Login ou senha inválidos. Tenta de novo.', next }),
      );
    }
    setSessionCookie(res, found.user.id);
    await touchLastLogin(supabase, found.user.id);
    await audit(supabase, { companyId: found.user.companyId, userId: found.user.id, entidade: 'sessao', acao: 'login' });
    res.redirect(next.startsWith('/dashboard') ? next : '/dashboard/cockpit');
  });

  router.post('/logout', (_req: Request, res: Response) => {
    clearSessionCookie(res);
    res.redirect('/dashboard/login');
  });

  // ----------------------------------------------------------------------
  // Daqui pra baixo, tudo exige auth.
  // ----------------------------------------------------------------------

  router.use(criarSessionAuth(supabase));

  // Raiz redireciona pro cockpit (visao geral 1-tela). Era /home antes.
  router.get('/', (_req, res) => {
    res.redirect('/dashboard/cockpit');
  });

  // ----- USUARIOS (gestao de pessoas + papeis; so admin/gestao de usuarios) -----
  const ECOSUN = '00000000-0000-0000-0000-000000000001';

  router.get('/usuarios', async (req: AuthedRequest, res) => {
    if (!can(req.dashUser, 'usuarios', 'visualizar')) { res.status(403).send('Sem permissão'); return; }
    const cid = req.dashUser!.companyId;
    const [users, roles] = await Promise.all([listUsers(supabase, cid), listRoles(supabase, cid)]);
    res.type('html').send(renderUsuariosListPage(users, roles, req.dashUser));
  });

  router.post('/usuarios/novo', async (req: AuthedRequest, res) => {
    if (!can(req.dashUser, 'usuarios', 'criar')) { res.status(403).send('Sem permissão'); return; }
    const { nome, login, senha, role_id } = req.body ?? {};
    if (!nome || !login || !senha || !role_id) { res.status(400).send('Campos obrigatórios'); return; }
    const r = await createUser(supabase, {
      companyId: req.dashUser!.companyId, nome, login,
      senhaHash: await hashSenha(senha), roleId: role_id,
    });
    if ('error' in r) { res.status(400).send(r.error === 'login_em_uso' ? 'Login já existe' : r.error); return; }
    await audit(supabase, { companyId: req.dashUser!.companyId, userId: req.dashUser!.id, entidade: 'usuario', entidadeId: r.id, acao: 'criou' });
    res.redirect('/dashboard/usuarios');
  });

  router.get('/usuarios/:id', async (req: AuthedRequest, res) => {
    if (!can(req.dashUser, 'usuarios', 'visualizar')) { res.status(403).send('Sem permissão'); return; }
    const cid = req.dashUser!.companyId;
    const userId = String(req.params.id);
    const { data: u } = await supabase.from('dashboard_users')
      .select('id, nome, login, ativo, role_id').eq('id', userId).maybeSingle();
    if (!u) { res.status(404).send('Usuário não encontrado'); return; }
    const roles = await listRoles(supabase, cid);
    res.type('html').send(renderUsuarioEditPage(u as any, roles, req.dashUser));
  });

  router.post('/usuarios/:id', async (req: AuthedRequest, res) => {
    if (!can(req.dashUser, 'usuarios', 'editar')) { res.status(403).send('Sem permissão'); return; }
    const userId = String(req.params.id);
    const { nome, role_id, senha, ativo } = req.body ?? {};
    await updateUser(supabase, userId, {
      nome, roleId: role_id, ativo: ativo === 'on' || ativo === true,
      senhaHash: senha ? await hashSenha(senha) : undefined,
    });
    await audit(supabase, { companyId: req.dashUser!.companyId, userId: req.dashUser!.id, entidade: 'usuario', entidadeId: userId, acao: 'editar' });
    res.redirect('/dashboard/usuarios');
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
  router.get('/cockpit', async (req: Request, res: Response) => {
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
      res.type('text/html').send(renderCockpitPage(data, leadsAguardando, platformInsights, (req as AuthedRequest).dashUser));
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
    const { data: leadRow, error } = await supabase
      .from('leads')
      .update({ status: 'transferido', opt_out: true, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('name')
      .maybeSingle();
    if (error) return res.status(500).send(`erro: ${escapeHtmlSimple(error.message)}`);

    // Avisa o Junior no zap e já oferece gerar os documentos (botões disparam o
    // fluxo /fechar existente via evabt:fechar-doc:<cmd>:<leadId>). Best-effort:
    // falha no WhatsApp NÃO quebra o "Fechou" do dashboard.
    if (leadRow && options.metaService && options.engineerPhone) {
      const nome = leadRow?.name ?? 'Cliente';
      try {
        await options.metaService.sendInteractiveButtons(
          options.engineerPhone,
          `✅ *${nome}* fechou a venda! Quer gerar os documentos?`,
          [
            { id: `evabt:fechar-doc:contrato:${id}`, title: 'Contrato' },
            { id: `evabt:fechar-doc:procuracao:${id}`, title: 'Procuração' },
            { id: `evabt:fechar-doc:ambos:${id}`, title: 'Ambos' },
          ],
        );
      } catch (err) {
        console.warn('[cadencia/fechou] aviso WhatsApp falhou:', (err as Error).message);
      }
    }
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

  router.get('/leads', exigir('leads', 'visualizar'), async (req: Request, res: Response) => {
    try {
      const viewer = (req as AuthedRequest).dashUser!;
      const { renderLeadsListPage } = await import('./leads-views.js');
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const only_alerts = req.query.only_alerts === '1' || req.query.only_alerts === 'true';
      const atencao = req.query.atencao === '1' || req.query.atencao === 'true';
      const search = typeof req.query.q === 'string' ? req.query.q : '';
      const limit = Math.max(1, Math.min(200, parseInt(String(req.query.limit ?? '10')) || 10));
      const offset = Math.max(0, parseInt(String(req.query.offset ?? '0')) || 0);
      const { buildLeadsInsights } = await import('./ai-summary.js');
      const [result, insights] = await Promise.all([
        listLeads(supabase, { status, only_alerts, atencao, search, limit, offset, viewerId: viewer.id, viewerIsAdmin: viewer.isAdmin }),
        buildLeadsInsights(supabase),
      ]);
      res.send(renderLeadsListPage(result.rows, {
        status,
        only_alerts,
        atencao,
        search,
        limit,
        offset,
        total: result.total,
        countByStatus: result.countByStatus,
        atencaoCount: result.atencaoCount,
        insights,
      }, viewer));
    } catch (err) {
      console.error('[dashboard/leads]', err);
      res.status(500).send(`<h2>Erro ao carregar leads</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });

  // Kanban do funil: colunas por etapa, cards arrastáveis. Registrado ANTES de
  // /leads/:id pra não ser engolido pelo param (kanban não é UUID).
  router.get('/leads/kanban', exigir('leads', 'visualizar'), async (req: Request, res: Response) => {
    try {
      const viewer = (req as AuthedRequest).dashUser!;
      const { renderKanbanPage } = await import('./kanban-views.js');
      const grupos = await leadsParaKanban(supabase, viewer);
      res.type('text/html').send(renderKanbanPage(grupos, viewer));
    } catch (err) {
      console.error('[dashboard/leads/kanban]', err);
      res.status(500).send(`<h2>Erro ao carregar kanban</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });

  router.get('/leads/:id', exigir('leads', 'visualizar'), async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) return res.status(400).send('id inválido');
    try {
      const { getLeadDetail } = await import('./leads-queries.js');
      const { renderLeadDetailPage } = await import('./leads-views.js');
      const lead = await getLeadDetail(supabase, id);
      if (!lead) return res.status(404).send('lead não encontrado');

      // Claim automático: vendedor (não-admin) que abre um lead do balcão vira dono.
      const viewer = (req as AuthedRequest).dashUser!;
      if (!viewer.isAdmin && lead.claimed_by == null && can(viewer, 'leads', 'editar')) {
        const captured = await claimLead(supabase, id, viewer.id);
        if (captured) {
          await audit(supabase, { companyId: viewer.companyId, userId: viewer.id, entidade: 'lead', entidadeId: id, acao: 'claim' });
          lead.claimed_by = viewer.id; // reflete na renderização atual
        } else {
          // Corrida: outro vendedor capturou primeiro. O claimed_by em memória
          // ainda está nulo (lido antes do claim), então re-lê do banco pra que
          // o podeVerLead abaixo barre o perdedor (403) em vez de deixar passar 1×.
          const { data: atual } = await supabase
            .from('leads')
            .select('claimed_by')
            .eq('id', id)
            .maybeSingle();
          if (atual && atual.claimed_by != null) {
            lead.claimed_by = atual.claimed_by;
          }
        }
      }
      // Bloqueio: vendedor não pode abrir lead de OUTRO vendedor
      if (!podeVerLead(viewer, lead)) {
        return res.status(403).send('<h2>Lead de outro vendedor</h2>');
      }

      const conversaIA = await supabaseService.getConversaIA(id);
      res.send(renderLeadDetailPage(lead, conversaIA));
    } catch (err) {
      console.error('[dashboard/leads/:id]', err);
      res.status(500).send(`<h2>Erro ao carregar lead</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });

  // IA: explica economia/payback/geração pro vendedor mostrar ao cliente.
  router.post('/leads/:id/ia-explicar-economia', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) return res.status(400).json({ erro: 'id inválido' });
    try {
      const { data: lead } = await supabase
        .from('leads')
        .select('name, energy_data, opportunities')
        .eq('id', id)
        .maybeSingle();
      if (!lead) return res.status(404).json({ erro: 'Lead não encontrado.' });

      const ed = (lead.energy_data ?? {}) as Record<string, unknown>;
      const op = (lead.opportunities ?? {}) as Record<string, unknown>;

      const { explicarEconomia } = await import('../ia-engenharia.js');
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return res.json({ erro: 'Chave ANTHROPIC_API_KEY não configurada no .env.' });

      const texto = await explicarEconomia(new Anthropic({ apiKey }), {
        nomeCliente: lead.name ?? undefined,
        consumoMensalKwh: Number(ed.consumo_kwh ?? ed.consumoMensalKwh ?? 0),
        potenciaKwp: Number(op.potencia_kwp ?? op.potenciaKwp ?? 0),
        geracaoMensalKwh: Number(op.geracao_kwh ?? op.geracaoMensalKwh ?? 0),
        economiaMensalRs: Number(op.economia_mensal_rs ?? op.economiaMensalRs ?? 0),
        investimentoRs: Number(op.investimento_rs ?? op.investimentoRs ?? 0),
        paybackAnos: op.payback_anos != null ? Number(op.payback_anos) : null,
      });
      res.json({ texto });
    } catch (err) {
      res.status(500).json({ erro: (err as Error).message });
    }
  });

  // IA: gera rascunho de mensagem comercial para o lead.
  router.post('/leads/:id/ia-gerar-mensagem', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) return res.status(400).json({ erro: 'id inválido' });
    try {
      const { data: lead } = await supabase
        .from('leads')
        .select('name, status, energy_data')
        .eq('id', id)
        .maybeSingle();
      if (!lead) return res.status(404).json({ erro: 'Lead não encontrado.' });

      const { gerarMensagemComercial } = await import('../ia-comercial.js');
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return res.json({ erro: 'Chave ANTHROPIC_API_KEY não configurada no .env.' });

      const ed = (lead.energy_data ?? {}) as Record<string, unknown>;
      const etapasValidas = ['novo','qualificando','qualificado','agendado','proposta_enviada','negociacao'];
      const etapa = etapasValidas.includes(lead.status) ? lead.status : 'qualificando';

      const texto = await gerarMensagemComercial(new Anthropic({ apiKey }), {
        nomeLead: lead.name ?? 'Cliente',
        etapa,
        tipoMensagem: 'follow_up',
        economiaMensalRs: ed.economia_mensal_rs ? Number(ed.economia_mensal_rs) : undefined,
      });
      res.json({ texto });
    } catch (err) {
      res.status(500).json({ erro: (err as Error).message });
    }
  });

  // IA: copiloto CONVERSACIONAL do lead — responde com contexto + salva histórico.
  router.post('/leads/:id/ia-copiloto', exigir('leads', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) return res.status(400).json({ erro: 'id inválido' });
    const pergunta = String(req.body?.pergunta ?? '').trim();
    if (!pergunta) return res.status(400).json({ erro: 'Pergunta vazia.' });
    try {
      const { data: lead } = await supabase
        .from('leads')
        .select('name, status, city, energy_data, opportunities')
        .eq('id', id)
        .maybeSingle();
      if (!lead) return res.status(404).json({ erro: 'Lead não encontrado.' });

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return res.json({ erro: 'Chave ANTHROPIC_API_KEY não configurada no .env.' });
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const { responderCopiloto, carregarConhecimentoVendas } = await import('../ia-copiloto.js');

      const ed = (lead.energy_data ?? {}) as Record<string, unknown>;
      const op = (lead.opportunities ?? {}) as Record<string, unknown>;
      const num = (v: unknown): number | undefined => {
        const n = Number(v);
        return Number.isFinite(n) && n !== 0 ? n : undefined;
      };

      const historico = await supabaseService.getConversaIA(id);
      const texto = await responderCopiloto(new Anthropic({ apiKey }), {
        contextoLead: {
          nome: lead.name ?? undefined,
          cidade: (lead.city as string | null) ?? undefined,
          etapa: (lead.status as string | null) ?? undefined,
          consumoMensalKwh: num(ed.consumo_kwh ?? ed.consumoMensalKwh),
          potenciaKwp: num(op.potencia_kwp ?? op.potenciaKwp),
          economiaMensalRs: num(op.economia_mensal_rs ?? op.economiaMensalRs),
          paybackAnos: op.payback_anos != null ? Number(op.payback_anos) : null,
        },
        historico,
        pergunta,
        conhecimento: carregarConhecimentoVendas(),
      });

      // Salva as 2 mensagens (best-effort — não bloqueia a resposta).
      const userId = req.dashUser?.id ?? null;
      try {
        await supabaseService.addMensagemIA(id, 'user', pergunta, userId);
        await supabaseService.addMensagemIA(id, 'assistant', texto, null);
      } catch (e) {
        console.warn('[ia-copiloto] salvar conversa falhou (segue):', (e as Error).message);
      }
      res.json({ texto });
    } catch (err) {
      res.status(500).json({ erro: (err as Error).message });
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
  router.post('/leads/:id/set-status', exigir('leads', 'editar'), async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) return res.status(400).send('id inválido');
    const status = String(req.body?.status ?? '').trim();
    const allowed = ['novo', 'qualificando', 'agendado', 'transferido', 'perdido'];
    if (!allowed.includes(status)) return res.status(400).send('status inválido');
    // Posse: vendedor não pode mexer em lead de OUTRO vendedor (mesmo gate de /set-etapa).
    const user = (req as AuthedRequest).dashUser!;
    const { data: lead } = await supabase.from('leads').select('claimed_by').eq('id', id).maybeSingle();
    if (!lead || (user && !podeVerLead(user, lead))) return res.status(403).send('Lead de outro vendedor');
    const { error } = await supabase
      .from('leads')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return res.status(500).send(`erro: ${escapeHtmlSimple(error.message)}`);
    const viewer = (req as AuthedRequest).dashUser;
    if (viewer) await audit(supabase, { companyId: viewer.companyId, userId: viewer.id, entidade: 'lead', entidadeId: id, acao: 'etapa', valorNovo: status });
    res.redirect(`/dashboard/leads/${id}`);
  });

  // Move o lead de etapa via drag-drop do kanban. Responde 200 (o front é fetch,
  // não navega). Valida a etapa contra ORDEM_ETAPAS (não aceita 'perdido' etc.).
  router.post('/leads/:id/set-etapa', exigir('leads', 'editar'), async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) return res.status(400).send('id inválido');
    const etapa = String(req.body?.etapa ?? '').trim();
    if (!(ORDEM_ETAPAS as readonly string[]).includes(etapa)) return res.status(400).send('etapa inválida');
    // Posse: vendedor não pode mexer em lead de OUTRO vendedor (admin passa direto).
    const user = (req as AuthedRequest).dashUser!;
    const { data: leadDono } = await supabase.from('leads').select('claimed_by').eq('id', id).maybeSingle();
    if (!leadDono || !podeVerLead(user, leadDono)) return res.status(403).send('Lead de outro vendedor');
    const { error } = await supabase
      .from('leads')
      .update({ status: etapa, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return res.status(500).send(`erro: ${escapeHtmlSimple(error.message)}`);
    // Etapa 'ganho' é terminal: cancela tarefas pendentes pra não alertar SLA-fantasma.
    if (etapa === 'ganho') {
      try { await cancelarTarefasPendentesDoLead(supabase, id); } catch (e) { console.warn('[set-etapa] cancelar tarefas falhou (segue):', (e as Error).message); }
    }
    const viewer = (req as AuthedRequest).dashUser;
    if (viewer) {
      try {
        await registrarAtividade(supabase, {
          company_id: viewer.companyId, lead_id: id, tipo: 'etapa_mudou',
          titulo: `Etapa movida (kanban): → ${etapa}`, automatica: false, user_id: viewer.id,
        });
      } catch (err) {
        console.warn('[set-etapa] registrarAtividade falhou (segue):', (err as Error).message);
      }
      await audit(supabase, { companyId: viewer.companyId, userId: viewer.id, entidade: 'lead', entidadeId: id, acao: 'etapa', valorNovo: etapa });
    }
    res.status(200).send('ok');
  });

  // ----- TAREFAS DO LEAD (cockpit) -----

  // Cria tarefa manual no lead. Campos: titulo (obrig.), tipo, due_at, prioridade.
  router.post('/leads/:id/tarefa', exigir('leads', 'editar'), async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) return res.status(400).send('id inválido');
    const titulo = String(req.body?.titulo ?? '').trim().slice(0, 200);
    if (!titulo) return res.status(400).send('Título obrigatório. <a href="/dashboard/leads/' + id + '">← voltar</a>');
    const tipo = String(req.body?.tipo ?? 'custom').trim() || 'custom';
    const prioridade = String(req.body?.prioridade ?? 'media').trim() || 'media';
    const dueRaw = String(req.body?.due_at ?? '').trim();
    // datetime-local vem como 'YYYY-MM-DDTHH:mm' (hora local) → ISO. Vazio = sem prazo.
    let due_at: string | null = null;
    if (dueRaw) { const d = new Date(dueRaw); if (!isNaN(d.getTime())) due_at = d.toISOString(); }
    const viewer = (req as AuthedRequest).dashUser;
    // Posse: vendedor não pode criar tarefa em lead de OUTRO vendedor (admin passa direto).
    const { data: leadRow } = await supabase.from('leads').select('claimed_by').eq('id', id).maybeSingle();
    if (!leadRow || (viewer && !podeVerLead(viewer, leadRow))) return res.status(403).send('Lead de outro vendedor');
    // Dono da tarefa = quem já está com o lead (claimed_by), se houver.
    const assigned_to = (leadRow?.claimed_by as string | null) ?? null;
    try {
      await criarTarefa(supabase, {
        company_id: viewer?.companyId ?? ECOSUN,
        lead_id: id, titulo, tipo, due_at, prioridade,
        automatica: false, created_by: viewer?.id ?? null, assigned_to,
      });
    } catch (err) {
      return res.status(500).send(`erro: ${escapeHtmlSimple((err as Error).message)}`);
    }
    if (viewer) {
      await registrarAtividade(supabase, {
        company_id: viewer.companyId, lead_id: id, tipo: 'tarefa_criada',
        titulo, automatica: false, user_id: viewer.id,
      });
      await audit(supabase, { companyId: viewer.companyId, userId: viewer.id, entidade: 'lead', entidadeId: id, acao: 'tarefa_criada', valorNovo: titulo });
    }
    res.redirect(`/dashboard/leads/${id}`);
  });

  // Conclui uma tarefa do lead.
  router.post('/leads/:id/tarefa/:tid/concluir', exigir('leads', 'editar'), async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const tid = String(req.params.tid);
    if (!UUID_RE.test(id) || !UUID_RE.test(tid)) return res.status(400).send('id inválido');
    const viewer = (req as AuthedRequest).dashUser;
    // Posse: vendedor não pode mexer em tarefa de lead de OUTRO vendedor (admin passa direto).
    const { data: leadRow } = await supabase.from('leads').select('claimed_by').eq('id', id).maybeSingle();
    if (!leadRow || (viewer && !podeVerLead(viewer, leadRow))) return res.status(403).send('Lead de outro vendedor');
    try {
      // leadId amarra a tarefa ao lead da URL (evita concluir tarefa de outro lead via :tid).
      await concluirTarefa(supabase, tid, viewer?.id ?? null, id);
    } catch (err) {
      return res.status(500).send(`erro: ${escapeHtmlSimple((err as Error).message)}`);
    }
    if (viewer) {
      await registrarAtividade(supabase, {
        company_id: viewer.companyId, lead_id: id, tipo: 'tarefa_concluida',
        titulo: 'Tarefa concluída', automatica: false, user_id: viewer.id,
      });
      await audit(supabase, { companyId: viewer.companyId, userId: viewer.id, entidade: 'lead', entidadeId: id, acao: 'tarefa_concluida', valorNovo: tid });
    }
    res.redirect(`/dashboard/leads/${id}`);
  });

  // Adia uma tarefa do lead em 2 dias.
  router.post('/leads/:id/tarefa/:tid/adiar', exigir('leads', 'editar'), async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const tid = String(req.params.tid);
    if (!UUID_RE.test(id) || !UUID_RE.test(tid)) return res.status(400).send('id inválido');
    const viewer = (req as AuthedRequest).dashUser;
    // Posse: vendedor não pode mexer em tarefa de lead de OUTRO vendedor (admin passa direto).
    const { data: leadRow } = await supabase.from('leads').select('claimed_by').eq('id', id).maybeSingle();
    if (!leadRow || (viewer && !podeVerLead(viewer, leadRow))) return res.status(403).send('Lead de outro vendedor');
    try {
      // leadId amarra a tarefa ao lead da URL (evita adiar tarefa de outro lead via :tid).
      await adiarTarefa(supabase, tid, 2, id);
    } catch (err) {
      return res.status(500).send(`erro: ${escapeHtmlSimple((err as Error).message)}`);
    }
    if (viewer) await audit(supabase, { companyId: viewer.companyId, userId: viewer.id, entidade: 'lead', entidadeId: id, acao: 'tarefa_adiada', valorNovo: tid });
    res.redirect(`/dashboard/leads/${id}`);
  });

  // Registra nota/ligação manual no lead (conta como contato → atualiza last_contact_at).
  router.post('/leads/:id/atividade', exigir('leads', 'editar'), async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) return res.status(400).send('id inválido');
    const tipoRaw = String(req.body?.tipo ?? 'nota').trim();
    const tipo: 'nota' | 'ligacao' = tipoRaw === 'ligacao' ? 'ligacao' : 'nota';
    const titulo = String(req.body?.titulo ?? '').trim().slice(0, 200)
      || (tipo === 'ligacao' ? 'Ligação registrada' : 'Nota');
    const descricao = String(req.body?.descricao ?? '').trim().slice(0, 2000) || undefined;
    const viewer = (req as AuthedRequest).dashUser;
    // Posse: vendedor não pode registrar atividade em lead de OUTRO vendedor (admin passa direto).
    const { data: leadRow } = await supabase.from('leads').select('claimed_by').eq('id', id).maybeSingle();
    if (!leadRow || (viewer && !podeVerLead(viewer, leadRow))) return res.status(403).send('Lead de outro vendedor');
    try {
      if (viewer) {
        await registrarAtividade(supabase, {
          company_id: viewer.companyId, lead_id: id, tipo,
          titulo, descricao, automatica: false, user_id: viewer.id,
        });
      }
      // Nota/ligação contam como contato com o cliente.
      await supabase.from('leads')
        .update({ last_contact_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', id);
    } catch (err) {
      return res.status(500).send(`erro: ${escapeHtmlSimple((err as Error).message)}`);
    }
    if (viewer) await audit(supabase, { companyId: viewer.companyId, userId: viewer.id, entidade: 'lead', entidadeId: id, acao: tipo === 'ligacao' ? 'ligacao' : 'nota' });
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
  router.post('/leads/:id/delete', exigir('leads', 'editar'), async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) return res.status(400).send('id inválido');
    const r = await supabaseService.excluirLead(id);
    if (!r.ok) {
      return res.status(400).send(
        `<h2>Não foi possível excluir</h2><p>${escapeHtmlSimple(r.error ?? '')}</p><a href="/dashboard/leads/${id}">← voltar</a>`,
      );
    }
    const viewer = (req as AuthedRequest).dashUser;
    if (viewer) await audit(supabase, { companyId: viewer.companyId, userId: viewer.id, entidade: 'lead', entidadeId: id, acao: 'excluiu' });
    res.redirect('/dashboard/leads');
  });

  router.post('/leads/:id/arquivar', exigir('leads', 'editar'), async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) return res.status(400).send('id inválido');
    const r = await supabaseService.arquivarLead(id);
    if (!r.ok) return res.status(500).send(`erro: ${escapeHtmlSimple(r.error ?? '')}`);
    const viewer = (req as AuthedRequest).dashUser;
    if (viewer) await audit(supabase, { companyId: viewer.companyId, userId: viewer.id, entidade: 'lead', entidadeId: id, acao: 'arquivou' });
    res.redirect('/dashboard/leads');
  });

  router.post('/leads/:id/mark-lost', exigir('leads', 'editar'), async (req: Request, res: Response) => {
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
    const viewer = (req as AuthedRequest).dashUser;
    if (viewer) await audit(supabase, { companyId: viewer.companyId, userId: viewer.id, entidade: 'lead', entidadeId: id, acao: 'perdeu', valorNovo: reason });
    // Lead virou terminal (perdido): cancela tarefas pendentes pra não alertar SLA-fantasma.
    try { await cancelarTarefasPendentesDoLead(supabase, id); } catch (e) { console.warn('[mark-lost] cancelar tarefas falhou (segue):', (e as Error).message); }
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
  router.get('/marketing', exigir('marketing', 'visualizar'), async (req: Request, res: Response) => {
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
      }, (req as AuthedRequest).dashUser));
    } catch (err) {
      console.error('[dashboard/marketing]', err);
      res.status(500).send(`<h2>Erro ao carregar marketing</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });

  // ----------------------------------------------------------------------
  // Blog (sob o setor Marketing) — aprovar/publicar/descartar drafts sem
  // depender do WhatsApp. O fluxo do WhatsApp continua intacto em paralelo.
  // ----------------------------------------------------------------------
  router.get('/marketing/blog', exigir('marketing', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    const user = req.dashUser;
    if (!options.blogGenerator) {
      res.type('text/html').send(renderLayout({
        active: 'blog', title: 'Blog — aprovar posts', body: renderBlogIndisponivel(), user,
      }));
      return;
    }
    // Leitura best-effort: se o Supabase falhar, mostra aviso em vez de derrubar a tela.
    let drafts: BlogDraft[] = [];
    let avisoLeitura: string | undefined;
    try {
      drafts = await options.blogGenerator.getPendingDrafts();
    } catch (err) {
      avisoLeitura = (err as Error).message;
      console.warn('[dashboard/blog] falha ao ler drafts (segue com aviso):', avisoLeitura);
    }
    const ok = req.query.ok === '1';
    const erro = typeof req.query.erro === 'string' ? req.query.erro : undefined;
    res.type('text/html').send(renderLayout({
      active: 'blog',
      title: 'Blog — aprovar posts',
      body: renderBlogDraftsPage(drafts, { ok, erro, avisoLeitura }),
      user,
    }));
  });

  router.post('/marketing/blog/:id/publicar', exigir('marketing', 'editar'), async (req: AuthedRequest, res: Response) => {
    const id = String(req.params.id);
    if (!options.blogGenerator || !options.publicarDraft) {
      res.redirect('/dashboard/marketing/blog?erro=' + encodeURIComponent('Publicação não está configurada neste servidor.'));
      return;
    }
    try {
      const draft = (await options.blogGenerator.getPendingDrafts()).find((d) => d.id === id);
      if (!draft) {
        res.redirect('/dashboard/marketing/blog?erro=' + encodeURIComponent('Rascunho não encontrado (talvez já tenha sido publicado ou descartado).'));
        return;
      }
      await options.publicarDraft(draft);
      await audit(supabase, {
        companyId: req.dashUser!.companyId, userId: req.dashUser!.id,
        entidade: 'blog', entidadeId: draft.id, acao: 'blog_publicado', valorNovo: draft.slug,
      });
      res.redirect('/dashboard/marketing/blog?ok=1');
    } catch (err) {
      const msg = (err as Error).message;
      console.error('[dashboard/blog] publicar falhou:', msg);
      res.redirect('/dashboard/marketing/blog?erro=' + encodeURIComponent(msg));
    }
  });

  router.post('/marketing/blog/:id/descartar', exigir('marketing', 'editar'), async (req: AuthedRequest, res: Response) => {
    const id = String(req.params.id);
    if (!options.blogGenerator) {
      res.redirect('/dashboard/marketing/blog?erro=' + encodeURIComponent('Blog não está configurado neste servidor.'));
      return;
    }
    try {
      await options.blogGenerator.markFailed(id, 'descartado pelo Junior no dashboard');
      await audit(supabase, {
        companyId: req.dashUser!.companyId, userId: req.dashUser!.id,
        entidade: 'blog', entidadeId: id, acao: 'blog_descartado',
      });
      res.redirect('/dashboard/marketing/blog?ok=1');
    } catch (err) {
      const msg = (err as Error).message;
      console.error('[dashboard/blog] descartar falhou:', msg);
      res.redirect('/dashboard/marketing/blog?erro=' + encodeURIComponent(msg));
    }
  });

  // Tela de revisão: lê o post inteiro, edita e confere a foto antes de publicar.
  router.get('/marketing/blog/:id/revisar', exigir('marketing', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    const id = String(req.params.id);
    if (!options.blogGenerator) {
      res.redirect('/dashboard/marketing/blog?erro=' + encodeURIComponent('Blog não está configurado neste servidor.'));
      return;
    }
    const draft = await options.blogGenerator.getDraftById(id);
    if (!draft) {
      res.redirect('/dashboard/marketing/blog?erro=' + encodeURIComponent('Rascunho não encontrado.'));
      return;
    }
    const ok = req.query.ok === '1';
    const fotoOk = req.query.foto === '1';
    const erro = typeof req.query.erro === 'string' ? req.query.erro : undefined;
    res.type('text/html').send(renderLayout({
      active: 'blog', title: 'Revisar rascunho', body: renderBlogRevisarPage(draft, { ok, erro, fotoOk }), user: req.dashUser,
    }));
  });

  // Salva a edição (título/resumo/conteúdo) do rascunho.
  router.post('/marketing/blog/:id/editar', exigir('marketing', 'editar'), async (req: AuthedRequest, res: Response) => {
    const id = String(req.params.id);
    if (!options.blogGenerator) {
      res.redirect('/dashboard/marketing/blog?erro=' + encodeURIComponent('Blog não está configurado neste servidor.'));
      return;
    }
    try {
      await options.blogGenerator.updateDraftFields(id, {
        title: typeof req.body?.title === 'string' ? req.body.title : undefined,
        description: typeof req.body?.description === 'string' ? req.body.description : undefined,
        contentMd: typeof req.body?.contentMd === 'string' ? req.body.contentMd : undefined,
      });
      await audit(supabase, {
        companyId: req.dashUser!.companyId, userId: req.dashUser!.id,
        entidade: 'blog', entidadeId: id, acao: 'blog_editado',
      });
      res.redirect(`/dashboard/marketing/blog/${encodeURIComponent(id)}/revisar?ok=1`);
    } catch (err) {
      const msg = (err as Error).message;
      console.error('[dashboard/blog] editar falhou:', msg);
      res.redirect(`/dashboard/marketing/blog/${encodeURIComponent(id)}/revisar?erro=` + encodeURIComponent(msg));
    }
  });

  // Busca/troca a foto do hero (Pexels) no rascunho.
  router.post('/marketing/blog/:id/foto', exigir('marketing', 'editar'), async (req: AuthedRequest, res: Response) => {
    const id = String(req.params.id);
    if (!options.blogGenerator) {
      res.redirect('/dashboard/marketing/blog?erro=' + encodeURIComponent('Blog não está configurado neste servidor.'));
      return;
    }
    try {
      const url = await options.blogGenerator.refreshHeroPhoto(id);
      if (!url) {
        res.redirect(`/dashboard/marketing/blog/${encodeURIComponent(id)}/revisar?erro=` + encodeURIComponent('Não consegui buscar uma foto agora (confira a chave do Pexels).'));
        return;
      }
      res.redirect(`/dashboard/marketing/blog/${encodeURIComponent(id)}/revisar?foto=1`);
    } catch (err) {
      const msg = (err as Error).message;
      console.error('[dashboard/blog] foto falhou:', msg);
      res.redirect(`/dashboard/marketing/blog/${encodeURIComponent(id)}/revisar?erro=` + encodeURIComponent(msg));
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
  router.get('/propostas', exigir('propostas', 'visualizar'), async (req: Request, res: Response) => {
    try {
      const limit = Math.max(1, Math.min(200, parseInt((req.query.limit as string) ?? '50') || 50));
      const offset = Math.max(0, parseInt((req.query.offset as string) ?? '0') || 0);
      const search = (req.query.q as string) ?? '';

      const { rows, total } = await listPropostas(supabase, { limit, offset, search });
      res.send(renderPropostasPage({ rows, total, offset, limit, search }, (req as AuthedRequest).dashUser));
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

  // Pós-venda / Relacionamento: clientes com usina, guiados por atenção
  // (saúde + tempo sem contato). Botões manuais (mesma coisa que a Eva faz no
  // automático) mandam via wa.me e gravam na timeline + abordagem.
  router.get('/pos-venda', exigir('usinas', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    try {
      const [linhas, agenda] = await Promise.all([
        listarClientesPosVenda(supabase, req.dashUser!.companyId),
        listarAgendaPosVenda(supabase, req.dashUser!.companyId),
      ]);
      res.type('text/html').send(renderPosVendaPage(linhas, req.dashUser, agenda));
    } catch (err) {
      console.error('[pos-venda] GET falhou:', (err as Error).message);
      res.status(500).type('text/html').send('<h2>Erro ao carregar Pós-venda</h2>');
    }
  });

  // Copiloto de pós-venda: chat com a IA (escreve mensagem limpa) + salva histórico.
  // Espelha /leads/:id/ia-copiloto, mas com cérebro de pós-venda.
  router.post('/pos-venda/:leadId/copiloto', exigir('usinas', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    const leadId = String(req.params.leadId);
    if (!UUID_RE.test(leadId)) return res.status(400).json({ erro: 'id inválido' });
    const pergunta = String(req.body?.pergunta ?? '').trim();
    if (!pergunta) return res.status(400).json({ erro: 'Pergunta vazia.' });
    try {
      // Filtra por company (igual /pos-venda/:leadId/acao): não ler cliente de outra empresa.
      const { data: lead } = await supabase.from('leads').select('name, city')
        .eq('id', leadId).eq('company_id', req.dashUser!.companyId).maybeSingle();
      if (!lead) return res.status(404).json({ erro: 'Cliente não encontrado.' });
      // order antes do limit: cliente com várias usinas (ex: Superbom) -> pega a 1ª de forma determinística.
      const { data: sis } = await supabase.from('sistemas_clientes')
        .select('id, potencia_kwp, marca_inversor, data_instalacao, acompanhamento, api_credentials')
        .eq('lead_id', leadId).eq('ativo', true)
        .order('created_at', { ascending: true }).limit(1).maybeSingle();

      // Tem monitoramento? Reusa a fonte da verdade da lista de pós-venda (semApiUsina),
      // pra não divergir do selo "sem API" da tela.
      const { semApiUsina } = await import('./pos-venda-queries.js');
      const temMonitoramento = !!sis && !semApiUsina(sis as any);

      // Geração REAL dos últimos 30 dias (só se tiver monitoramento) — pra Eva nunca inventar.
      let geracaoResumo: string | null = null;
      if (temMonitoramento && (sis as any).id) {
        const desde = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
        const { data: ger } = await supabase.from('geracao_diaria')
          .select('geracao_kwh').eq('sistema_id', (sis as any).id).gte('data', desde);
        const total = (ger ?? []).reduce((s: number, g: any) => s + Number(g.geracao_kwh || 0), 0);
        if ((ger ?? []).length > 0) geracaoResumo = `Últimos 30 dias: ${Math.round(total)} kWh`;
      }

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return res.json({ erro: 'Chave ANTHROPIC_API_KEY não configurada no .env.' });
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const { responderCopilotoPosVenda, carregarConhecimentoPosVenda, montarContextoPosVenda } =
        await import('./pos-venda-copiloto.js');

      const contexto = montarContextoPosVenda({
        nome: (lead.name as string | null) ?? undefined,
        cidade: (lead.city as string | null) ?? null,
        potenciaKwp: (sis?.potencia_kwp as number | null) ?? null,
        marcaInversor: (sis?.marca_inversor as string | null) ?? null,
        dataInstalacao: (sis?.data_instalacao as string | null) ?? null,
        temMonitoramento,
        geracaoResumo,
        jaTeveDepoimento: undefined,
      });

      const historico = await supabaseService.getConversaIA(leadId);
      const texto = await responderCopilotoPosVenda(new Anthropic({ apiKey }), {
        contexto, historico, pergunta, conhecimento: carregarConhecimentoPosVenda(),
      });

      const userId = req.dashUser?.id ?? null;
      try {
        await supabaseService.addMensagemIA(leadId, 'user', pergunta, userId);
        await supabaseService.addMensagemIA(leadId, 'assistant', texto, null);
      } catch (e) {
        console.warn('[pos-venda/copiloto] salvar conversa falhou (segue):', (e as Error).message);
      }
      res.json({ texto });
    } catch (err) {
      res.status(500).json({ erro: (err as Error).message });
    }
  });

  // Botão de ação do pós-venda -> dispara o TEMPLATE aprovado pela Eva (funciona
  // dentro e fora da janela 24h). Corpo: { tipo: 'parabens'|'limpeza'|... }.
  router.post('/pos-venda/:leadId/enviar-template', exigir('usinas', 'editar'), async (req: AuthedRequest, res: Response) => {
    const leadId = String(req.params.leadId);
    if (!UUID_RE.test(leadId)) return res.status(400).json({ erro: 'id inválido' });
    if (!options.metaService) return res.status(500).json({ erro: 'WhatsApp não configurado.' });
    try {
      const { mapaBotaoTemplate, componenteNome, normalizarTelefone } = await import('./pos-venda-envio.js');
      const tipo = String(req.body?.tipo ?? '');
      const template = mapaBotaoTemplate(tipo);
      if (!template) return res.status(400).json({ erro: 'Ação sem template (ex: contato não envia).' });

      const companyId = req.dashUser!.companyId;
      const { data: lead } = await supabase.from('leads').select('name, phone')
        .eq('id', leadId).eq('company_id', companyId).maybeSingle();
      if (!lead) return res.status(404).json({ erro: 'Cliente não encontrado.' });
      const to = normalizarTelefone((lead.phone as string | null) ?? '');
      if (!to) return res.status(400).json({ erro: 'Cliente sem telefone.' });

      await options.metaService.sendTemplate(to, template, 'pt_BR', componenteNome((lead.name as string | null) ?? ''));

      // Registra o envio: auditoria (lead_atividades) + abordagem (monitoring_abordagens),
      // que é de onde a lista de pós-venda tira "último contato" e "já deu depoimento".
      // Sem isso o card ficaria vermelho pra sempre e reenviaria a mesma mensagem.
      const LABEL: Record<string, string> = {
        parabens: 'Parabéns enviado', relatorio: 'Relatório do mês enviado', limpeza: 'Oferta de limpeza enviada',
        depoimento: 'Pedido de depoimento enviado', upgrade: 'Oferta de upgrade enviada',
      };
      await registrarAtividade(supabase, {
        company_id: companyId, lead_id: leadId, tipo: 'whatsapp',
        titulo: LABEL[tipo] ?? 'Mensagem enviada pela Eva', descricao: `Template: ${template}`,
        automatica: false, user_id: req.dashUser!.id,
      });
      const MAP_EVA: Record<string, 'parabens' | 'depoimento' | 'queda'> = { parabens: 'parabens', depoimento: 'depoimento', limpeza: 'queda' };
      if (MAP_EVA[tipo]) {
        const { data: sistema } = await supabase.from('sistemas_clientes').select('id')
          .eq('lead_id', leadId).eq('ativo', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
        if (sistema) {
          await registrarAbordagemManual(supabase, {
            sistemaId: (sistema as { id: string }).id, leadId, tipo: MAP_EVA[tipo],
            mensagem: `[template ${template} enviado pela plataforma]`,
          });
        }
      }
      console.log(`[pos-venda/enviar-template] ${template} -> ${leadId} ok`);
      res.json({ ok: true, template });
    } catch (err) {
      console.error('[pos-venda/enviar-template]', err);
      res.status(500).json({ erro: 'Falha ao enviar. Tente de novo.' });
    }
  });

  // Chat do copiloto -> envia o TEXTO LIVRE pela Eva. Só funciona dentro da
  // janela de 24h do WhatsApp; se a Meta recusar, devolve aviso amigável.
  router.post('/pos-venda/:leadId/enviar-texto', exigir('usinas', 'editar'), async (req: AuthedRequest, res: Response) => {
    const leadId = String(req.params.leadId);
    if (!UUID_RE.test(leadId)) return res.status(400).json({ erro: 'id inválido' });
    if (!options.metaService) return res.status(500).json({ erro: 'WhatsApp não configurado.' });
    const texto = String(req.body?.texto ?? '').trim();
    if (!texto) return res.status(400).json({ erro: 'Mensagem vazia.' });
    try {
      const { normalizarTelefone } = await import('./pos-venda-envio.js');
      const companyId = req.dashUser!.companyId;
      const { data: lead } = await supabase.from('leads').select('phone')
        .eq('id', leadId).eq('company_id', companyId).maybeSingle();
      if (!lead) return res.status(404).json({ erro: 'Cliente não encontrado.' });
      const to = normalizarTelefone((lead.phone as string | null) ?? '');
      if (!to) return res.status(400).json({ erro: 'Cliente sem telefone.' });
      try {
        await options.metaService.sendText(to, texto);
        // Auditoria do envio (quem mandou o quê).
        await registrarAtividade(supabase, {
          company_id: companyId, lead_id: leadId, tipo: 'whatsapp',
          titulo: 'Mensagem enviada (copiloto)', descricao: texto.slice(0, 1000),
          automatica: false, user_id: req.dashUser!.id,
        });
        console.log(`[pos-venda/enviar-texto] -> ${leadId} ok`);
        res.json({ ok: true });
      } catch (sendErr) {
        // Texto livre fora da janela 24h é a causa mais comum, mas pode ser outra
        // (token, telefone inválido). Não cravamos a causa.
        console.warn('[pos-venda/enviar-texto] envio recusado:', (sendErr as Error).message);
        res.status(409).json({ erro: 'Não consegui enviar agora. Pode ser que o cliente esteja fora da janela de 24h (precisa ele responder primeiro) — nesse caso, use um botão de ação, que abre com um modelo.' });
      }
    } catch (err) {
      console.error('[pos-venda/enviar-texto]', err);
      res.status(500).json({ erro: 'Falha ao enviar. Tente de novo.' });
    }
  });

  // Ação manual de pós-venda em 2 fases pelo mesmo endpoint:
  //  - PREVIEW (sem `enviado`): gera a mensagem (redator da Eva → fallback) e
  //    devolve { mensagem, waBase }. Não grava nada.
  //  - CONFIRMAR (`enviado=1` + `mensagem`): grava na timeline + (tipos mapeados)
  //    abre abordagem encerrada pra Eva não re-mandar. Devolve { ok:true }.
  router.post('/pos-venda/:leadId/acao', exigir('usinas', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    const leadId = String(req.params.leadId);
    const tipo = String(req.body.tipo ?? '') as 'parabens' | 'relatorio' | 'limpeza' | 'depoimento' | 'upgrade' | 'contato';
    const enviado = req.body.enviado === '1' || req.body.enviado === 'true';
    const TIPOS_OK = ['parabens', 'relatorio', 'limpeza', 'depoimento', 'upgrade', 'contato'];
    if (!TIPOS_OK.includes(tipo)) { res.status(400).json({ error: 'tipo inválido' }); return; }
    const TARIFA_RS_KWH = 0.99; // média DF/GO — só pro número do relatório

    try {
      const companyId = req.dashUser!.companyId;
      const { data: lead } = await supabase.from('leads')
        .select('id, name, phone, company_id').eq('id', leadId).eq('company_id', companyId).maybeSingle();
      if (!lead) { res.status(404).json({ error: 'lead não encontrado' }); return; }
      const leadRow = lead as { id: string; name: string | null; phone: string | null };
      const { data: sistema } = await supabase.from('sistemas_clientes')
        .select('id, potencia_kwp').eq('lead_id', leadId).eq('ativo', true)
        .order('created_at', { ascending: true }).limit(1).maybeSingle();
      const sistemaRow = sistema as { id: string; potencia_kwp: number | null } | null;

      // ---- Fase CONFIRMAR ----
      if (enviado) {
        const msg = String(req.body.mensagem ?? '').slice(0, 1000);
        const LABEL: Record<string, string> = {
          parabens: 'Parabéns enviado', relatorio: 'Relatório do mês enviado', limpeza: 'Oferta de limpeza enviada',
          depoimento: 'Pedido de depoimento enviado', upgrade: 'Oferta de upgrade enviada', contato: 'Contato registrado',
        };
        await registrarAtividade(supabase, {
          company_id: companyId, lead_id: leadId,
          tipo: tipo === 'contato' ? 'contato' : 'whatsapp',
          titulo: LABEL[tipo], descricao: msg || undefined,
          automatica: false, user_id: req.dashUser!.id,
        });
        const MAP_EVA: Record<string, 'parabens' | 'depoimento' | 'queda'> = { parabens: 'parabens', depoimento: 'depoimento', limpeza: 'queda' };
        if (sistemaRow && MAP_EVA[tipo] && msg) {
          await registrarAbordagemManual(supabase, { sistemaId: sistemaRow.id, leadId, tipo: MAP_EVA[tipo], mensagem: msg });
        }
        res.json({ ok: true });
        return;
      }

      // ---- Fase PREVIEW ----
      if (tipo === 'contato') { res.json({ mensagem: '', waBase: '' }); return; }

      let trimestre: { kwh: number; reais: number } | null = null;
      if (sistemaRow) {
        const { data: ger } = await supabase.from('geracao_diaria')
          .select('data, geracao_kwh').eq('sistema_id', sistemaRow.id)
          .gte('data', new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10));
        trimestre = numerosTrimestre((ger ?? []).map((g: any) => ({ data: g.data, geracao_kwh: Number(g.geracao_kwh) })), TARIFA_RS_KWH, new Date());
      }

      // tenta a IA (mesmo tom da Eva); cai pro fallback se faltar chave/erro
      let mensagem: string | null = null;
      if (options.anthropicApiKey) {
        try {
          const { default: Anthropic } = await import('@anthropic-ai/sdk');
          const { redigirMensagem } = await import('../monitoring/abordagem/redator.js');
          const anthropic = new Anthropic({ apiKey: options.anthropicApiKey });
          mensagem = await redigirMensagem(anthropic, {
            tipo: tipo === 'limpeza' ? 'queda' : 'parabens',
            etapa: 1, objetivo: objetivoManual(tipo),
            clienteNome: leadRow.name ?? 'cliente',
            dados: { percentualQueda: null, diasOffline: null, trimestre: tipo === 'relatorio' ? trimestre : null, causaRaizAnterior: null },
            regrasTreino: [], ajusteDoJunior: null, mensagemAnterior: null,
          });
        } catch (e) {
          console.warn('[pos-venda] redator falhou, usando fallback:', (e as Error).message);
        }
      }
      if (!mensagem) mensagem = fallbackMensagem(tipo, { nome: leadRow.name ?? 'cliente', trimestre: tipo === 'relatorio' ? trimestre : null });

      const fone = String(leadRow.phone ?? '').replace(/\D/g, '');
      res.json({ mensagem, waBase: fone ? `https://wa.me/${fone}` : 'https://wa.me/' });
    } catch (err) {
      console.error('[pos-venda] POST acao falhou:', (err as Error).message);
      res.status(500).json({ error: 'falha ao processar ação' });
    }
  });

  // Cria um lembrete na agenda do cliente (lead_tarefas, tipo custom).
  router.post('/pos-venda/:leadId/lembrete', exigir('usinas', 'editar'), async (req: AuthedRequest, res: Response) => {
    const leadId = String(req.params.leadId);
    if (!UUID_RE.test(leadId)) return res.status(400).json({ erro: 'id inválido' });
    const titulo = String(req.body?.titulo ?? '').trim().slice(0, 200);
    if (!titulo) return res.status(400).json({ erro: 'Título vazio.' });
    const dueRaw = req.body?.dueAt ? String(req.body.dueAt) : null;
    let dueAt: string | null = null;
    if (dueRaw) {
      const d = new Date(dueRaw + (dueRaw.length === 10 ? 'T12:00:00Z' : ''));
      if (Number.isNaN(d.getTime())) return res.status(400).json({ erro: 'Data inválida.' });
      dueAt = d.toISOString();
    }
    try {
      const companyId = req.dashUser!.companyId;
      const { data: lead } = await supabase.from('leads').select('id')
        .eq('id', leadId).eq('company_id', companyId).maybeSingle();
      if (!lead) return res.status(404).json({ erro: 'Cliente não encontrado.' });
      await criarTarefa(supabase, {
        company_id: companyId, lead_id: leadId, titulo, tipo: 'custom',
        due_at: dueAt, prioridade: 'media', automatica: false, created_by: req.dashUser!.id,
      });
      res.json({ ok: true });
    } catch (err) {
      console.error('[pos-venda/lembrete]', err);
      res.status(500).json({ erro: 'Falha ao salvar lembrete.' });
    }
  });

  // Conclui um lembrete da agenda. Anti-IDOR: a tarefa precisa ser de um lead do pós-venda da company.
  router.post('/pos-venda/tarefa/:id/concluir', exigir('usinas', 'editar'), async (req: AuthedRequest, res: Response) => {
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) return res.status(400).json({ erro: 'id inválido' });
    try {
      const leadId = await leadDaTarefaNaCompany(supabase, id, req.dashUser!.companyId);
      if (!leadId) return res.status(404).json({ erro: 'Tarefa não encontrada.' });
      await concluirTarefa(supabase, id, req.dashUser!.id, leadId);
      res.json({ ok: true });
    } catch (err) {
      console.error('[pos-venda/tarefa/concluir]', err);
      res.status(500).json({ erro: 'Falha ao concluir.' });
    }
  });

  // Adia um lembrete (+N dias). Mesmo anti-IDOR.
  router.post('/pos-venda/tarefa/:id/adiar', exigir('usinas', 'editar'), async (req: AuthedRequest, res: Response) => {
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) return res.status(400).json({ erro: 'id inválido' });
    const dias = Math.min(Math.max(Number(req.body?.dias) || 1, 1), 30);
    try {
      const leadId = await leadDaTarefaNaCompany(supabase, id, req.dashUser!.companyId);
      if (!leadId) return res.status(404).json({ erro: 'Tarefa não encontrada.' });
      await adiarTarefa(supabase, id, dias, leadId);
      res.json({ ok: true });
    } catch (err) {
      console.error('[pos-venda/tarefa/adiar]', err);
      res.status(500).json({ erro: 'Falha ao adiar.' });
    }
  });

  // Grava uma nota interna do cliente (lead_atividades tipo nota). NÃO vai pro cliente.
  router.post('/pos-venda/:leadId/nota', exigir('usinas', 'editar'), async (req: AuthedRequest, res: Response) => {
    const leadId = String(req.params.leadId);
    if (!UUID_RE.test(leadId)) return res.status(400).json({ erro: 'id inválido' });
    const texto = String(req.body?.texto ?? '').trim().slice(0, 1000);
    if (!texto) return res.status(400).json({ erro: 'Nota vazia.' });
    try {
      const companyId = req.dashUser!.companyId;
      const { data: lead } = await supabase.from('leads').select('id')
        .eq('id', leadId).eq('company_id', companyId).maybeSingle();
      if (!lead) return res.status(404).json({ erro: 'Cliente não encontrado.' });
      await registrarAtividade(supabase, {
        company_id: companyId, lead_id: leadId, tipo: 'nota',
        titulo: 'Nota interna', descricao: texto, automatica: false, user_id: req.dashUser!.id,
      });
      res.json({ ok: true });
    } catch (err) {
      console.error('[pos-venda/nota]', err);
      res.status(500).json({ erro: 'Falha ao salvar nota.' });
    }
  });

  // Linha do tempo (repositório) do cliente: notas + envios + contatos.
  router.get('/pos-venda/:leadId/historico', exigir('usinas', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    const leadId = String(req.params.leadId);
    if (!UUID_RE.test(leadId)) return res.status(400).json({ erro: 'id inválido' });
    try {
      const companyId = req.dashUser!.companyId;
      const { data: lead } = await supabase.from('leads').select('id')
        .eq('id', leadId).eq('company_id', companyId).maybeSingle();
      if (!lead) return res.status(404).json({ erro: 'Cliente não encontrado.' });
      const itens = await listarTimeline(supabase, leadId, 50);
      res.json({ itens });
    } catch (err) {
      console.error('[pos-venda/historico]', err);
      res.status(500).json({ erro: 'Falha ao carregar histórico.' });
    }
  });

  // Monitoramento: lista de sistemas FV instalados com geracao do dia/mes.
  router.get('/monitoramento', exigir('usinas', 'visualizar'), async (req: Request, res: Response) => {
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
      res.send(renderMonitoramentoPage(filtered as any, qf, alertasResumo, sparkline7d, kpisEva, (req as AuthedRequest).dashUser));
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
      // Preferencial: email+senha (renova sozinho). Fallback: jwt direto.
      const email = String(req.body?.nep_email ?? '').trim();
      const password = String(req.body?.nep_password ?? '').trim();
      const jwt = String(req.body?.jwt ?? '').trim();
      if (email && password) {
        credenciais = { email, password };
      } else if (jwt) {
        credenciais = { jwt };
      } else {
        return res.status(400).send(renderImportarSitesPage({
          errorMsg: 'NEP precisa de e-mail + senha (renova sozinho) ou um JWT direto.',
        }));
      }
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
    } else if (marca === 'foxess') {
      // Campo renomeado pra foxess_api_key pra nao colidir com o api_key do
      // SolarEdge / apiKey do ABB ao alternar entre branches do select.
      const apiKey = String(req.body?.foxess_api_key ?? '').trim();
      if (!apiKey) {
        return res.status(400).send(renderImportarSitesPage({
          errorMsg: 'API Key obrigatoria pra FoxESS (gere no app FoxESS Cloud → API Management).',
        }));
      }
      credenciais = { apiKey };
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
      const [donoRow, timelineAbordagens, prontuario] = await Promise.all([
        donoLeadId ? supabaseService.getClienteByLeadId(donoLeadId) : Promise.resolve(null),
        getTimelineAbordagens(supabase, id).catch(() => [] as import('./queries.js').AbordagemTimelineRow[]),
        prontuarioUsina(supabase, id).catch(() => []),
      ]);
      res.send(renderDetalheSistemaPage(detalhe, donoRow ? { id: donoRow.id, name: donoRow.name } : null, timelineAbordagens, renderProntuario(prontuario)));
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

  // Manutencao: agenda guiada por atenção + prontuário + leitura manual.
  router.get('/manutencao', exigir('usinas', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    try {
      const [agenda, leiturasPendentes, usinasRes] = await Promise.all([
        listarAgenda(supabase),
        listarLeiturasPendentes(supabase),
        supabase.from('sistemas_clientes').select('id, apelido').eq('ativo', true).order('apelido'),
      ]);
      const usinas = (usinasRes.data ?? []).map((u: any) => ({ id: u.id, apelido: u.apelido }));
      res.type('text/html').send(renderManutencaoPage({ agenda, leiturasPendentes, usinas }, req.dashUser));
    } catch (err) {
      console.error('[manutencao] GET falhou:', (err as Error).message);
      res.status(500).type('text/html').send('<h2>Erro ao carregar Manutenção</h2>');
    }
  });

  router.post('/manutencao/agendar', exigir('usinas', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    try {
      const sistemaId = String(req.body.sistemaId ?? '');
      const tipo = String(req.body.tipo ?? '') as ManutencaoTipo;
      const dataAgendada = String(req.body.dataAgendada ?? '');
      const TIPOS = ['limpeza', 'revisao_inversor', 'revisao_eletrica', 'corretiva', 'inspecao'];
      if (!UUID_RE.test(sistemaId) || !TIPOS.includes(tipo) || !/^\d{4}-\d{2}-\d{2}$/.test(dataAgendada)) {
        res.status(400).send('dados inválidos'); return;
      }
      const { data: s } = await supabase.from('sistemas_clientes').select('lead_id').eq('id', sistemaId).maybeSingle();
      await criarManutencao(supabase, { sistemaId, leadId: (s as any)?.lead_id ?? null, tipo, origem: 'manual', dataAgendada });
      res.redirect('/dashboard/manutencao');
    } catch (err) {
      console.error('[manutencao] agendar falhou:', (err as Error).message);
      res.status(500).send('erro ao agendar');
    }
  });

  router.post('/manutencao/:id/feita', exigir('usinas', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      if (!UUID_RE.test(id)) { res.status(400).send('id inválido'); return; }
      const hoje = new Date().toISOString().slice(0, 10);
      await marcarManutencaoFeita(supabase, id, {
        feitaEm: String(req.body.feitaEm ?? hoje), feitoPor: req.dashUser!.id, notas: req.body.notas ? String(req.body.notas) : undefined,
      });
      const { data: m } = await supabase.from('manutencoes').select('lead_id, tipo').eq('id', id).maybeSingle();
      if ((m as any)?.lead_id) {
        await registrarAtividade(supabase, {
          company_id: req.dashUser!.companyId, lead_id: (m as any).lead_id, tipo: 'visita',
          titulo: `Manutenção feita: ${(m as any).tipo}`, automatica: false, user_id: req.dashUser!.id,
        });
      }
      res.redirect('/dashboard/manutencao');
    } catch (err) {
      console.error('[manutencao] feita falhou:', (err as Error).message);
      res.status(500).send('erro ao marcar feita');
    }
  });

  router.post('/manutencao/:id/reagendar', exigir('usinas', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      const novaData = String(req.body.dataAgendada ?? '');
      if (!UUID_RE.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(novaData)) { res.status(400).send('dados inválidos'); return; }
      await reagendarManutencao(supabase, id, novaData);
      res.redirect('/dashboard/manutencao');
    } catch (err) {
      console.error('[manutencao] reagendar falhou:', (err as Error).message);
      res.status(500).send('erro ao reagendar');
    }
  });

  // Kanban de obra: colunas por etapa_obra, cards arrastáveis. Registrado ANTES de
  // /:sistemaId pra não ser engolido pelo param ('kanban' não é UUID).
  router.get('/usinas/kanban', exigir('usinas', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    try {
      const { data, error } = await supabase
        .from('sistemas_clientes')
        .select('id, apelido, cidade, potencia_kwp, etapa_obra, etapa_obra_updated_at')
        .eq('ativo', true)
        .order('apelido', { ascending: true });
      if (error) throw new Error(`usinas/kanban: ${error.message}`);
      const { renderUsinasKanbanPage } = await import('./usinas-kanban-views.js');
      res.type('text/html').send(renderUsinasKanbanPage((data ?? []) as any, req.dashUser));
    } catch (err) {
      console.error('[dashboard/usinas/kanban]', err);
      res.status(500).send(`<h2>Erro ao carregar kanban de obras</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });

  // Mutirão de vínculo: usinas ativas SEM cliente -> sugere por nome -> tela de revisão.
  router.get('/usinas/vincular', exigir('usinas', 'editar'), async (req: AuthedRequest, res: Response) => {
    try {
      const companyId = req.dashUser!.companyId;
      const [usinasRes, leadsRes] = await Promise.all([
        supabase.from('sistemas_clientes')
          .select('id, apelido').eq('ativo', true).is('lead_id', null).order('apelido'),
        supabase.from('leads')
          .select('id, name').eq('company_id', companyId).order('name'),
      ]);
      if (usinasRes.error) throw new Error(usinasRes.error.message);
      if (leadsRes.error) throw new Error(leadsRes.error.message);
      const { sugerirVinculos } = await import('./vincular-usinas.js');
      const { renderVincularUsinasPage } = await import('./vincular-usinas-views.js');
      const leads = (leadsRes.data ?? []) as Array<{ id: string; name: string | null }>;
      const usinas = (usinasRes.data ?? []) as Array<{ id: string; apelido: string | null }>;
      const sugestoes = sugerirVinculos(usinas, leads);
      res.type('text/html').send(renderVincularUsinasPage({ sugestoes, leads, user: req.dashUser }));
    } catch (err) {
      console.error('[dashboard/usinas/vincular GET]', err);
      res.status(500).send(`<h2>Erro ao carregar vínculo de usinas</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });

  // Aplica os vínculos confirmados: seta lead_id + manda a usina pro pos_venda
  // (some do kanban) + registra auditoria. Corpo: { <usinaId>: <leadId>, ... }.
  router.post('/usinas/vincular', exigir('usinas', 'editar'), async (req: AuthedRequest, res: Response) => {
    try {
      const { sanitizarPares } = await import('./vincular-usinas.js');
      const pares = sanitizarPares((req.body ?? {}) as Record<string, unknown>);
      const viewer = req.dashUser!;
      // Defesa multi-empresa: só aceita vincular a leads da própria company.
      // (sistemas_clientes não tem company_id; o vínculo é o que define a dona.)
      const leadIds = [...new Set(pares.map((p) => p.leadId))];
      const { data: leadsValidos } = leadIds.length
        ? await supabase.from('leads').select('id').eq('company_id', viewer.companyId).in('id', leadIds)
        : { data: [] as Array<{ id: string }> };
      const idsValidos = new Set((leadsValidos ?? []).map((l: any) => l.id));
      const paresOk = pares.filter((p) => idsValidos.has(p.leadId));
      let aplicados = 0;
      for (const { usinaId, leadId } of paresOk) {
        const { error } = await supabase.from('sistemas_clientes')
          .update({ lead_id: leadId, etapa_obra: 'pos_venda', etapa_obra_updated_at: new Date().toISOString() })
          .eq('id', usinaId).eq('ativo', true);
        if (error) { console.warn(`[usinas/vincular] ${usinaId} falhou: ${error.message}`); continue; }
        aplicados++;
        await audit(supabase, {
          companyId: viewer.companyId, userId: viewer.id, entidade: 'usina',
          entidadeId: usinaId, acao: 'vincular_cliente', valorNovo: leadId,
        });
      }
      console.log(`[usinas/vincular] ${aplicados}/${paresOk.length} usinas vinculadas + enviadas ao pos_venda (de ${pares.length} recebidas)`);
      res.redirect('/dashboard/usinas/vincular');
    } catch (err) {
      console.error('[dashboard/usinas/vincular POST]', err);
      res.status(500).send('erro ao aplicar vínculos');
    }
  });

  // Move usina de etapa via drag-drop do kanban de obras. Responde 200 (o front é
  // fetch, não navega). Valida etapa contra ETAPAS_USINA.
  router.post('/usinas/:id/set-etapa-obra', exigir('usinas', 'editar'), async (req: AuthedRequest, res: Response) => {
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) return res.status(400).send('id inválido');
    const etapa = String(req.body?.etapa ?? '').trim();
    if (!ETAPAS_USINA.some((e) => e.slug === etapa)) return res.status(400).send('etapa inválida');
    const { error } = await supabase
      .from('sistemas_clientes')
      .update({ etapa_obra: etapa, etapa_obra_updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return res.status(500).send(`erro: ${escapeHtmlSimple(error.message)}`);
    const viewer = req.dashUser;
    if (viewer) {
      await audit(supabase, { companyId: viewer.companyId, userId: viewer.id, entidade: 'usina', entidadeId: id, acao: 'etapa_obra', valorNovo: etapa });
    }
    res.status(200).send('ok');
  });

  // Painel de contato (espiada rápida no kanban de obras): JSON com dados do
  // cliente vinculado + essenciais da usina. Reusa getClienteByLeadId. Exige
  // usinas/visualizar (mesmo nível da tela; o contato já aparece no detalhe).
  router.get('/usinas/:id/contato', exigir('usinas', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) return res.status(400).json({ erro: 'id inválido' });
    try {
      const { data: usina, error } = await supabase
        .from('sistemas_clientes')
        .select('id, apelido, cidade, uf, potencia_kwp, etapa_obra, etapa_obra_updated_at, lead_id')
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!usina) return res.status(404).json({ erro: 'usina não encontrada' });
      const u = usina as any;
      const lead = u.lead_id ? await supabaseService.getClienteByLeadId(u.lead_id) : null;
      const { montarContatoUsina } = await import('../monitoring/usinas-queries.js');
      res.json(montarContatoUsina(u, lead
        ? { name: lead.name ?? null, phone: lead.phone ?? null, email: lead.email ?? null }
        : null));
    } catch (err) {
      console.error('[dashboard/usinas/contato]', err);
      res.status(500).json({ erro: 'falha ao carregar contato' });
    }
  });

  // Move VÁRIAS usinas de etapa de uma vez (modo seleção do kanban). Corpo
  // urlencoded: ids=uuid1,uuid2,... & etapa=slug. Sanitiza via sanitizarMoverLote
  // (só UUIDs, sem duplicados) e valida a etapa. Exige usinas/editar.
  router.post('/usinas/set-etapa-obra-lote', exigir('usinas', 'editar'), async (req: AuthedRequest, res: Response) => {
    const etapa = String(req.body?.etapa ?? '').trim();
    const idsRaw = String(req.body?.ids ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const { sanitizarMoverLote } = await import('../monitoring/usinas-queries.js');
    const { etapaValida, ids } = sanitizarMoverLote(idsRaw, etapa);
    if (!etapaValida) return res.status(400).json({ erro: 'etapa inválida' });
    if (ids.length === 0) return res.status(400).json({ erro: 'nenhuma usina válida' });
    const { error } = await supabase
      .from('sistemas_clientes')
      .update({ etapa_obra: etapa, etapa_obra_updated_at: new Date().toISOString() })
      .in('id', ids);
    if (error) return res.status(500).json({ erro: error.message });
    const viewer = req.dashUser;
    if (viewer) {
      await audit(supabase, { companyId: viewer.companyId, userId: viewer.id, entidade: 'usina', entidadeId: ids.join(','), acao: 'etapa_obra_lote', valorNovo: etapa });
    }
    res.json({ ok: true, movidas: ids.length });
  });

  router.post('/usinas/:sistemaId/leitura', exigir('usinas', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    try {
      const sistemaId = String(req.params.sistemaId);
      const competencia = String(req.body.competencia ?? '');
      const kwh = Number(req.body.kwh);
      if (!UUID_RE.test(sistemaId) || !/^\d{4}-\d{2}$/.test(competencia) || !(kwh >= 0)) {
        res.status(400).json({ error: 'dados inválidos' }); return;
      }
      const fb = await registrarLeituraManual(supabase, { sistemaId, competencia, kwh });
      res.json(fb);
    } catch (err) {
      console.error('[manutencao] leitura falhou:', (err as Error).message);
      res.status(500).json({ error: 'erro ao registrar leitura' });
    }
  });

  // ===== Perfil do Cliente A1 =====
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
  });

  // ===== Ordem de Serviço (peça 2b) — "1 OS, 3 portas, 1 função que fecha" =====
  // Portas a/b: abrir OS de uma manutenção agendada.
  router.post('/manutencao/:id/os/abrir', exigir('usinas', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    try {
      const mid = String(req.params.id);
      if (!UUID_RE.test(mid)) { res.status(400).send('id inválido'); return; }
      const osId = await abrirOSDeManutencao(supabase, mid);
      res.redirect(`/dashboard/os/${osId}`);
    } catch (err) { console.error('[os] abrir falhou:', (err as Error).message); res.status(500).send('erro ao abrir OS'); }
  });

  // Porta c: nova OS avulsa.
  router.post('/os/nova', exigir('usinas', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    try {
      const sistemaId = String(req.body.sistemaId ?? '');
      const tipo = String(req.body.tipo ?? '') as OSTipo;
      if (!UUID_RE.test(sistemaId) || !['limpeza', 'revisao_inversor', 'revisao_eletrica', 'corretiva', 'inspecao'].includes(tipo)) {
        res.status(400).send('dados inválidos'); return;
      }
      const { data: s } = await supabase.from('sistemas_clientes').select('lead_id').eq('id', sistemaId).maybeSingle();
      const osId = await criarOS(supabase, { sistemaId, leadId: (s as any)?.lead_id ?? null, tipo });
      res.redirect(`/dashboard/os/${osId}`);
    } catch (err) { console.error('[os] nova falhou:', (err as Error).message); res.status(500).send('erro ao criar OS'); }
  });

  router.get('/os/:id', exigir('usinas', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      if (!UUID_RE.test(id)) { res.status(400).send('id inválido'); return; }
      const os = await getOS(supabase, id);
      if (!os) { res.status(404).send('OS não encontrada'); return; }
      const [fotos, counts] = await Promise.all([listFotosOS(supabase, id, true), fotoCountsPorItem(supabase, id)]);
      const itens = hidratarChecklist(os.tipo, os.checklist ?? {}, counts);
      res.type('text/html').send(renderOSPage(os, itens, fotos, req.dashUser));
    } catch (err) { console.error('[os] get falhou:', (err as Error).message); res.status(500).send('erro ao carregar OS'); }
  });

  // Monta o checklist a partir do form (checkbox 'on'=true; medição=string).
  function checklistDoForm(tipo: OSTipo, body: Record<string, any>): Record<string, any> {
    const checklist: Record<string, any> = {};
    for (const it of hidratarChecklist(tipo, {}, {})) {
      if (it.kind === 'check') checklist[it.chave] = body[it.chave] === 'on';
      else if (it.kind === 'medicao') checklist[it.chave] = String(body[it.chave] ?? '');
    }
    return checklist;
  }

  router.post('/os/:id/salvar', exigir('usinas', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      if (!UUID_RE.test(id)) { res.status(400).send('id inválido'); return; }
      const os = await getOS(supabase, id);
      if (!os) { res.status(404).send('OS não encontrada'); return; }
      await salvarOS(supabase, id, { checklist: checklistDoForm(os.tipo, req.body), observacoes: String(req.body.observacoes ?? '') });
      res.redirect(`/dashboard/os/${id}`);
    } catch (err) { console.error('[os] salvar falhou:', (err as Error).message); res.status(500).send('erro ao salvar'); }
  });

  router.post('/os/:id/foto', exigir('usinas', 'visualizar'), upload.single('foto'), async (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      if (!UUID_RE.test(id) || !req.file) { res.status(400).send('faltou a foto'); return; }
      const os = await getOS(supabase, id);
      if (!os) { res.status(404).send('OS não encontrada'); return; }
      const ext = (req.file.originalname.split('.').pop() ?? 'jpg').toLowerCase().slice(0, 5);
      await addFotoOS(supabase, id, {
        leadId: os.lead_id, itemChave: String(req.body.itemChave ?? ''),
        buffer: req.file.buffer, mimeType: req.file.mimetype, ext,
      });
      res.redirect(`/dashboard/os/${id}`);
    } catch (err) { console.error('[os] foto falhou:', (err as Error).message); res.status(500).send('erro no upload'); }
  });

  router.post('/os/:id/concluir', exigir('usinas', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      if (!UUID_RE.test(id)) { res.status(400).send('id inválido'); return; }
      const os = await getOS(supabase, id);
      if (!os) { res.status(404).send('OS não encontrada'); return; }
      await salvarOS(supabase, id, { checklist: checklistDoForm(os.tipo, req.body), observacoes: String(req.body.observacoes ?? '') });
      await concluirOS(supabase, id, { executor: req.dashUser!.id, notas: `OS ${os.tipo} concluída` });
      if (os.lead_id) {
        await registrarAtividade(supabase, {
          company_id: req.dashUser!.companyId, lead_id: os.lead_id, tipo: 'visita',
          titulo: `OS concluída: ${os.tipo}`, automatica: false, user_id: req.dashUser!.id,
        });
      }
      res.redirect(`/dashboard/os/${id}`);
    } catch (err) { console.error('[os] concluir falhou:', (err as Error).message); res.status(500).send('erro ao concluir'); }
  });

  router.get('/os/:id/laudo', exigir('usinas', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      if (!UUID_RE.test(id)) { res.status(400).send('id inválido'); return; }
      const os = await getOS(supabase, id);
      if (!os) { res.status(404).send('OS não encontrada'); return; }
      const [fotos, counts] = await Promise.all([listFotosOS(supabase, id, true), fotoCountsPorItem(supabase, id)]);
      const itens = hidratarChecklist(os.tipo, os.checklist ?? {}, counts);
      res.type('text/html').send(renderOSLaudoHtml(os, resumoOS(itens), fotos, 'Responsável Técnico CREA/CFT'));
    } catch (err) { console.error('[os] laudo falhou:', (err as Error).message); res.status(500).send('erro no laudo'); }
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

  router.get('/financeiro', exigir('financeiro', 'visualizar'), async (req: AuthedRequest, res) => {
    try {
      const { getFinanceiroData } = await import('./financeiro-queries.js');
      const { renderFinanceiroPage } = await import('./financeiro-views.js');
      const data = await getFinanceiroData(supabase, parseFiltrosFinanceiro(req.query));
      res.type('text/html').send(renderFinanceiroPage(data, req.dashUser));
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
