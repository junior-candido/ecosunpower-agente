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
import { empresa, empresaDe } from '../empresa-config.js';
import { registrarEvento } from '../elo/eventos.js';
import type { MonitoringService } from '../monitoring/service.js';
import { TelemetriaService } from '../monitoring/telemetria-service.js';
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
  fetchVendasPorMes,
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
  renderTelemetriaPage,
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
import { classificarSistema, medianaEspecifica7d } from '../monitoring/classificacao.js';
import { getAdapter } from '../monitoring/adapter-registry.js';
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
import { listUsers, listRoles, createUser, updateUser, getUserByLoginTodasEmpresas, touchLastLogin } from './users-store.js';
import { hashSenha, verificarSenha } from './password.js';
import { claimLead, podeVerLead, listLeads, leadsParaKanban } from './leads-queries.js';
import { ORDEM_ETAPAS } from './pipeline.js';
import { ETAPAS_USINA } from '../usina-etapas.js';
import { criarTarefa, concluirTarefa, adiarTarefa, cancelarTarefasPendentesDoLead } from './tarefas.js';
import { registrarAtividade, listarTimeline } from './atividades.js';
import { audit } from './audit.js';
import { registrarVenda } from '../vendas/registrar-venda.js';
import { renderFecharVendaPage, type PropostaAberta } from './vendas-views.js';
import { renderContratosPage, type ContratoCliente } from './contratos-views.js';
import { renderContratoFormPage } from './contrato-form-views.js';
import type { SugestaoIa } from '../closing/revisar-contrato.js';
import { CLIENTE_STATUSES } from './clientes-queries.js';
import { can, podeDispararMensagens, usinaPertenceAoOperador } from './permissions.js';
import type { AuthedRequest } from './auth.js';
import type { BlogGenerator, BlogDraft } from '../blog-generator.js';
import { renderBlogDraftsPage, renderBlogIndisponivel, renderBlogRevisarPage } from './blog-views.js';
import { renderEmailPage } from './email-views.js';
import { desempenhoPorStep } from './email-metricas.js';
import { listarClientesPosVenda, listarAgendaPosVenda } from './pos-venda-queries.js';
import { renderPosVendaPage } from './pos-venda-views.js';
import { objetivoManual, fallbackMensagem } from './pos-venda-mensagens.js';
import { snoozeAte } from './pos-venda-sugestao-memoria.js';
import { registrarAbordagemManual } from '../monitoring/abordagem/abordagens-repo.js';
import { numerosMes } from '../monitoring/abordagem/numeros-usina.js';
import { listarAgenda, prontuarioUsina, listarLeiturasPendentes, criarManutencao, marcarManutencaoFeita, reagendarManutencao, registrarLeituraManual } from './manutencao-queries.js';
import { renderManutencaoPage, renderProntuario } from './manutencao-views.js';
import type { ManutencaoTipo } from './manutencao-motor.js';
import { criarOS, abrirOSDeManutencao, getOS, salvarOS, addFotoOS, listFotosOS, fotoCountsPorItem, concluirOS } from './os-queries.js';
import { renderOSPage, renderOSLaudoHtml } from './os-views.js';
import { hidratarChecklist, resumoOS, type OSTipo } from './os-checklist.js';
import { bancoDoOperador } from '../tenant-client.js';   // strangler RLS Fase B (flag RLS_TENANT_ROTAS)

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
    infinitepayHandle?: string; // InfiniteTag pra gerar link de cobrança (peça 1 pagamento)
    appBaseUrl?: string;        // URL pública do app (pro webhook_url da InfinitePay)
    calculadoraUrl?: string;        // ponte de acesso da calculadora (fatia 3a)
    assinaturasSyncToken?: string;  // token compartilhado da ponte
    // Salva contrato+procuração no Drive/Workspace (vem pronto do index.ts quando
    // o Google está configurado). Retorna o link da pasta do cliente.
    salvarContratoNoDrive?: (input: {
      nomeTitular: string; cpfTitular: string; version: number;
      contratoPdf?: Buffer; procuracaoPdf?: Buffer;
      extras?: Array<{ nome: string; pdf: Buffer }>;
      dadosInputJson: string;
    }) => Promise<{ folderWebViewLink: string }>;
    blogGenerator?: BlogGenerator;
    // Wrapper que publica o draft espelhando o fluxo do WhatsApp (publishDraftToGitHub
    // com PAT/repo/branch da config + markPublished). Vem pronto do index.ts.
    publicarDraft?: (draft: BlogDraft) => Promise<{ url: string }>;
  } = {},
): Router {
  const router = Router();
  const supabase = supabaseService.getClient();
  const telemetriaService = new TelemetriaService(supabaseService, monitoringService);
  // Upload em memória, reusado por várias rotas (fotos, anexos, docs do contrato).
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
  });

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

    // [Fase 2 A1] Login MULTI-EMPRESA: candidatos de todas as empresas (EcoSun
    // primeiro — comportamento antigo preservado), a senha desempata.
    const candidatos = login ? await getUserByLoginTodasEmpresas(supabase, login) : [];
    let found: { user: (typeof candidatos)[number]['user']; senhaHash: string | null } | null = null;
    for (const c of candidatos) {
      if (await verificarSenha(senha, c.senhaHash)) { found = c; break; }
    }
    if (!found) {
      return res.status(401).type('text/html').send(
        renderLoginPage({ errorMsg: 'Login ou senha inválidos. Tenta de novo.', next }),
      );
    }
    // Checkbox "Continuar conectado": marcada (padrão) = cookie 60d; desmarcada = só a sessão.
    setSessionCookie(res, found.user.id, req.body?.manter === '1');
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

  // ----- COBRANÇAS (InfinitePay) — gera link de pagamento pro cliente -----
  // Cria a cobrança PENDENTE + o link. O cliente paga → o webhook /webhook/
  // infinitepay confirma e marca "pago". Pré-preenche os dados do lead pra o
  // cliente não redigitar. Retorna JSON com o link (o front mostra/copia).
  router.post('/cobrancas', async (req: AuthedRequest, res) => {
    try {
      const handle = options.infinitepayHandle;
      if (!handle) { res.status(503).json({ erro: 'Cobrança não configurada (falta INFINITEPAY_HANDLE).' }); return; }
      const descricao = String(req.body?.descricao ?? '').trim();
      // aceita "1.234,56" (pt-BR) ou "1234.56"
      const valorReais = Number(String(req.body?.valor ?? '').replace(/\./g, '').replace(',', '.'));
      let leadId = req.body?.lead_id ? String(req.body.lead_id) : null;
      if (!descricao) { res.status(400).json({ erro: 'Descrição obrigatória.' }); return; }
      if (!(valorReais > 0)) { res.status(400).json({ erro: 'Valor inválido.' }); return; }
      const valorCentavos = Math.round(valorReais * 100);
      const companyId = req.dashUser!.companyId;
      const telefone = String(req.body?.telefone ?? '').trim();

      let cliente: { nome?: string; email?: string; telefone?: string } | undefined;
      if (leadId) {
        // lead pelo crachá do operador (RLS Fase B) — não vaza lead de outra empresa
        const db = bancoDoOperador(req, supabase);
        const { data: lead } = await db.from('leads').select('name, email, phone')
          .eq('id', leadId).eq('company_id', companyId).maybeSingle();
        if (lead) cliente = { nome: (lead as { name?: string }).name ?? undefined, email: (lead as { email?: string }).email ?? undefined, telefone: (lead as { phone?: string }).phone ?? undefined };
      } else if (telefone) {
        // telefone digitado na página → vincula ao lead (variantes do 9º dígito)
        const { acharLeadPorTelefone } = await import('./cobrancas-store.js');
        const lead = await acharLeadPorTelefone(bancoDoOperador(req, supabase), companyId, telefone);
        if (lead) { leadId = lead.id; cliente = { nome: lead.nome, email: lead.email, telefone: lead.telefone }; }
        else cliente = { telefone: telefone.replace(/\D/g, '') || undefined }; // sem lead: ao menos pré-preenche o checkout
      }

      const cob = await supabaseService.criarCobranca({ companyId, leadId, descricao, valorCentavos });
      const { criarLinkPagamento } = await import('../infinitepay.js');
      const base = (options.appBaseUrl ?? '').replace(/\/$/, '');
      const r = await criarLinkPagamento({
        handle, orderNsu: cob.orderNsu, itens: [{ descricao, valorCentavos }],
        redirectUrl: base ? `${base}/pago` : undefined,
        webhookUrl: base ? `${base}/webhook/infinitepay` : undefined,
        cliente,
      });
      if (!r.ok) { res.status(502).json({ erro: `Falha ao gerar link: ${r.reason}` }); return; }
      await supabaseService.salvarLinkCobranca(cob.id, r.url);
      res.json({ ok: true, link: r.url, cobrancaId: cob.id });
    } catch (err) {
      console.error('[dashboard/cobrancas]', err);
      res.status(500).json({ erro: 'Falha ao criar cobrança.' });
    }
  });

  // Página simples pra gerar uma cobrança (descrição + valor → link).
  router.get('/cobrar', (req: AuthedRequest, res) => {
    const off = !options.infinitepayHandle;
    res.type('html').send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Cobrar cliente</title>
<style>body{font-family:system-ui,Segoe UI,sans-serif;background:#0b1c2b;color:#eaf2f8;margin:0;padding:24px}
.card{max-width:520px;margin:0 auto;background:#12324a;border-radius:14px;padding:22px}
h1{font-size:19px;margin:0 0 4px}p.sub{color:#9fb6c7;font-size:13px;margin:0 0 16px}
label{display:block;font-size:13px;color:#c4d6e4;margin:12px 0 4px}
input{width:100%;box-sizing:border-box;padding:11px;border-radius:9px;border:1px solid #2a4a63;background:#0e2233;color:#fff;font-size:15px}
button{margin-top:18px;width:100%;padding:13px;border:0;border-radius:10px;background:#17a6e0;color:#fff;font-size:16px;font-weight:600;cursor:pointer}
button:disabled{opacity:.5}.res{margin-top:18px;display:none}.res a.link{display:block;word-break:break-all;background:#0e2233;border:1px solid #2a4a63;border-radius:9px;padding:11px;color:#17a6e0;font-size:13px}
.row{display:flex;gap:10px;margin-top:10px}.row button{margin:0;background:#1fa968}.row button.copy{background:#2a4a63}
.err{color:#ff9a9a;font-size:13px;margin-top:12px}.off{background:#5a3d00;color:#ffd27a;padding:12px;border-radius:9px;font-size:13px;margin-bottom:14px}</style></head>
<body><div class="card"><h1>💳 Cobrar cliente</h1><p class="sub">Gera um link de pagamento (Pix ou cartão) pra mandar pro cliente.</p>
${off ? '<div class="off">⚠️ Falta configurar o <b>INFINITEPAY_HANDLE</b> no servidor pra ativar a cobrança.</div>' : ''}
<label>Descrição</label><input id="d" placeholder="ex: Reorganização e limpeza — Superbom">
<label>Valor (R$)</label><input id="v" inputmode="decimal" placeholder="ex: 15.000,00">
<label>Telefone do cliente (opcional — vincula ao lead)</label><input id="t" placeholder="ex: 5561999998888">
<button id="b" ${off ? 'disabled' : ''}>Gerar link de pagamento</button>
<div class="err" id="e"></div>
<div class="res" id="r"><label>Link gerado — manda pro cliente:</label><a class="link" id="l" target="_blank"></a>
<div class="row"><button class="copy" id="c">Copiar</button><button id="w">Enviar no WhatsApp</button></div></div></div>
<script>
var b=document.getElementById('b');
b.onclick=async function(){
  var d=document.getElementById('d').value.trim(),v=document.getElementById('v').value.trim(),t=document.getElementById('t').value.trim();
  var e=document.getElementById('e');e.textContent='';
  if(!d||!v){e.textContent='Preencha descrição e valor.';return;}
  b.disabled=true;b.textContent='Gerando…';
  try{
    var resp=await fetch('/dashboard/cobrancas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({descricao:d,valor:v,telefone:t})});
    var j=await resp.json();
    if(!resp.ok||!j.link){e.textContent=j.erro||'Falha ao gerar.';return;}
    var l=document.getElementById('l');l.href=j.link;l.textContent=j.link;
    document.getElementById('r').style.display='block';
    document.getElementById('c').onclick=function(){navigator.clipboard.writeText(j.link);this.textContent='Copiado!';};
    var msg='Segue o link pra pagamento (Pix ou cartão): '+j.link;
    document.getElementById('w').onclick=function(){window.open('https://wa.me/'+(t.replace(/\\D/g,''))+'?text='+encodeURIComponent(msg),'_blank');};
  }catch(err){e.textContent='Erro de rede.';}
  finally{b.disabled=false;b.textContent='Gerar link de pagamento';}
};
</script></body></html>`);
  });

  // ----- ASSINATURAS (central de mensalidades — spec 2026-07-29) -----
  // Fatia 1: lista + botões manuais. Avisos/trava automática = fatia 2.
  const parseReais = (v: unknown): number => Math.round(Number(String(v ?? '').replace(/\./g, '').replace(',', '.')) * 100);
  const hojeISO = () => new Date().toISOString().slice(0, 10);

  router.get('/assinaturas', exigir('financeiro', 'visualizar'), async (req: AuthedRequest, res) => {
    try {
      const { listarAssinaturas, listarProdutos, listarEmpresasSimples, contarUsinasAtivas } = await import('./assinaturas-store.js');
      const { renderAssinaturasPage } = await import('./assinaturas-views.js');
      const [produtos, assinaturas, empresas] = await Promise.all([
        listarProdutos(supabase), listarAssinaturas(supabase), listarEmpresasSimples(supabase),
      ]);
      // Uso do plano ("87/110 usinas") pras assinaturas de monitoramento com limite.
      const usoPorAssinatura: Record<string, number> = {};
      await Promise.all(assinaturas
        .filter((a) => a.produtoId === 'monitoramento' && a.companyId && a.limite !== null)
        .map(async (a) => {
          try { usoPorAssinatura[a.id] = await contarUsinasAtivas(supabase, a.companyId!); } catch { /* sem uso na tela */ }
        }));
      const q = req.query as Record<string, string | undefined>;
      // link só se for https de verdade (vem da URL — não confiar cego)
      const link = q.link && /^https:\/\//.test(q.link) ? q.link : undefined;
      const aviso = q.ok ? { tipo: 'ok' as const, texto: q.ok, link } : q.erro ? { tipo: 'erro' as const, texto: q.erro } : undefined;
      res.type('html').send(renderAssinaturasPage(produtos, assinaturas, hojeISO(), req.dashUser, aviso, empresas, usoPorAssinatura));
    } catch (err) {
      console.error('[assinaturas]', err);
      res.status(500).send('Falha ao carregar as assinaturas. A migration 090 já foi aplicada no banco?');
    }
  });

  router.post('/assinaturas/nova', exigir('financeiro', 'editar'), async (req: AuthedRequest, res) => {
    try {
      const { criarAssinatura } = await import('./assinaturas-store.js');
      const b = (req.body ?? {}) as Record<string, unknown>;
      const valorCentavos = parseReais(b.valor);
      if (!b.produto || !String(b.nome ?? '').trim() || !(valorCentavos > 0) || !b.vence_em) {
        res.redirect('/dashboard/assinaturas?erro=' + encodeURIComponent('Preencha produto, nome, valor e vencimento.')); return;
      }
      await criarAssinatura(supabase, {
        produtoId: String(b.produto), nome: String(b.nome).trim(),
        email: String(b.email ?? '').trim() || null, telefone: String(b.telefone ?? '').replace(/\D/g, '') || null,
        valorCentavos, limite: b.limite ? Number(b.limite) : null, venceEm: String(b.vence_em),
        companyId: b.company_id ? String(b.company_id) : null,
      });
      res.redirect('/dashboard/assinaturas?ok=' + encodeURIComponent('Assinatura criada.'));
    } catch (err) {
      console.error('[assinaturas/nova]', err);
      res.redirect('/dashboard/assinaturas?erro=' + encodeURIComponent('Falha ao criar assinatura.'));
    }
  });

  router.post('/assinaturas/:id/cobrar', exigir('financeiro', 'editar'), async (req: AuthedRequest, res) => {
    try {
      const handle = options.infinitepayHandle;
      if (!handle) { res.redirect('/dashboard/assinaturas?erro=' + encodeURIComponent('Falta INFINITEPAY_HANDLE no servidor.')); return; }
      const { getAssinatura } = await import('./assinaturas-store.js');
      const a = await getAssinatura(supabase, String(req.params.id));
      if (!a) { res.redirect('/dashboard/assinaturas?erro=' + encodeURIComponent('Assinatura não achada.')); return; }
      const descricao = `${a.produtoNome} — mensalidade (${a.nome})`;
      const cob = await supabaseService.criarCobranca({ companyId: req.dashUser!.companyId, leadId: null, assinaturaId: a.id, descricao, valorCentavos: a.valorCentavos });
      const { criarLinkPagamento } = await import('../infinitepay.js');
      const base = (options.appBaseUrl ?? '').replace(/\/$/, '');
      const r = await criarLinkPagamento({
        handle, orderNsu: cob.orderNsu, itens: [{ descricao, valorCentavos: a.valorCentavos }],
        redirectUrl: base ? `${base}/pago` : undefined,
        webhookUrl: base ? `${base}/webhook/infinitepay` : undefined,
        cliente: { nome: a.nome, email: a.email ?? undefined, telefone: a.telefone ?? undefined },
      });
      if (!r.ok) { res.redirect('/dashboard/assinaturas?erro=' + encodeURIComponent(`Falha ao gerar link: ${r.reason}`)); return; }
      await supabaseService.salvarLinkCobranca(cob.id, r.url);
      res.redirect('/dashboard/assinaturas?ok=' + encodeURIComponent('Link gerado — manda pro assinante:') + '&link=' + encodeURIComponent(r.url));
    } catch (err) {
      console.error('[assinaturas/cobrar]', err);
      res.redirect('/dashboard/assinaturas?erro=' + encodeURIComponent('Falha ao gerar cobrança.'));
    }
  });

  router.post('/assinaturas/:id/status', exigir('financeiro', 'editar'), async (req: AuthedRequest, res) => {
    try {
      const status = String(req.body?.status ?? '');
      if (!['ativa', 'travada', 'cancelada'].includes(status)) { res.redirect('/dashboard/assinaturas?erro=' + encodeURIComponent('Status inválido.')); return; }
      const { setStatusAssinatura, getAssinatura } = await import('./assinaturas-store.js');
      const id = String(req.params.id);
      await setStatusAssinatura(supabase, id, status as 'ativa' | 'travada' | 'cancelada');
      // O acesso REAL acompanha (calculadora via ponte, monitoramento via
      // companies.ativo). Falha da ponte não desfaz o status — avisa na tela.
      const a = await getAssinatura(supabase, id);
      let pontinha = '';
      if (a && status !== 'cancelada') {
        const { aplicarAcesso } = await import('../assinaturas-sync.js');
        const ok = await aplicarAcesso(supabase, a, status === 'travada' ? 'travar' : 'liberar', {
          env: { calculadoraUrl: options.calculadoraUrl, syncToken: options.assinaturasSyncToken },
          avisarFalha: options.sendText && options.engineerPhone
            ? (t) => options.sendText!(options.engineerPhone!, t).then(() => undefined)
            : undefined,
        });
        if (!ok) pontinha = ' ⚠️ Mas a ponte de acesso falhou — tente de novo em instantes.';
      }
      res.redirect('/dashboard/assinaturas?ok=' + encodeURIComponent((status === 'travada' ? 'Assinatura travada.' : 'Assinatura liberada.') + pontinha));
    } catch (err) {
      console.error('[assinaturas/status]', err);
      res.redirect('/dashboard/assinaturas?erro=' + encodeURIComponent('Falha ao mudar o status.'));
    }
  });

  router.post('/assinaturas/:id/editar', exigir('financeiro', 'editar'), async (req: AuthedRequest, res) => {
    try {
      const { editarAssinatura } = await import('./assinaturas-store.js');
      const b = (req.body ?? {}) as Record<string, unknown>;
      const campos: { valorCentavos?: number; telefone?: string | null; limite?: number | null; venceEm?: string } = {};
      if (b.valor) { const v = parseReais(b.valor); if (v > 0) campos.valorCentavos = v; }
      if (b.telefone !== undefined) campos.telefone = String(b.telefone).replace(/\D/g, '') || null;
      if (b.limite !== undefined) campos.limite = b.limite ? Number(b.limite) : null;
      if (b.vence_em) campos.venceEm = String(b.vence_em);
      // checkbox: desmarcado nem vem no body → false
      (campos as { zapConfirmado?: boolean }).zapConfirmado = b.zap_ok === '1';
      await editarAssinatura(supabase, String(req.params.id), campos);
      res.redirect('/dashboard/assinaturas?ok=' + encodeURIComponent('Assinatura atualizada.'));
    } catch (err) {
      console.error('[assinaturas/editar]', err);
      res.redirect('/dashboard/assinaturas?erro=' + encodeURIComponent('Falha ao salvar.'));
    }
  });

  // ----- SERVIÇOS (Diário de campo — spec 2026-07-29) -----
  // Mobile-first. Papel "Campo" tem SÓ a área servicos e enxerga só isso.
  // Mídia: navegador sobe DIRETO pro bucket client-attachments via URL
  // assinada (vídeo de até 100MB não passa pelo Express).
  const BUCKET_SERVICOS = 'client-attachments';
  const extDoContentType = (ct: string): string => {
    if (/jpe?g/.test(ct)) return 'jpg';
    if (/png/.test(ct)) return 'png';
    if (/mp4/.test(ct)) return 'mp4';
    if (/quicktime/.test(ct)) return 'mov';
    if (/webm/.test(ct)) return 'webm';
    return 'bin';
  };

  router.get('/servicos', exigir('servicos', 'visualizar'), async (req: AuthedRequest, res) => {
    try {
      const { listarServicos } = await import('./servicos-store.js');
      const { renderServicosPage } = await import('./servicos-views.js');
      const q = req.query as Record<string, string | undefined>;
      const aviso = q.ok ? { tipo: 'ok' as const, texto: q.ok } : q.erro ? { tipo: 'erro' as const, texto: q.erro } : undefined;
      res.type('html').send(renderServicosPage(await listarServicos(supabase), req.dashUser, aviso));
    } catch (err) {
      console.error('[servicos]', err);
      res.status(500).send('Falha ao carregar os serviços. A migration 092 já foi aplicada?');
    }
  });

  router.get('/servicos/novo', exigir('servicos', 'criar'), async (req: AuthedRequest, res) => {
    const { listarTipos } = await import('./servicos-store.js');
    const { renderNovoServicoPage } = await import('./servicos-views.js');
    const { listUsers } = await import('./users-store.js');
    const usuarios = (await listUsers(supabase, req.dashUser!.companyId))
      .filter((u) => u.ativo)
      .map((u) => ({ id: u.id, nome: u.nome }));
    res.type('html').send(renderNovoServicoPage(await listarTipos(supabase), req.dashUser, usuarios));
  });

  router.get('/servicos/buscar-cliente', exigir('servicos', 'criar'), async (req: AuthedRequest, res) => {
    const q = String(req.query.q ?? '').trim().replace(/[,%]/g, ' ');
    if (q.length < 2) { res.json({ clientes: [] }); return; }
    const db = bancoDoOperador(req, supabase);
    const { data } = await db.from('leads').select('id, name, phone')
      .eq('company_id', req.dashUser!.companyId)
      .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(8);
    res.json({ clientes: (data ?? []).map((l: any) => ({ id: l.id, nome: l.name ?? '(sem nome)', telefone: l.phone ?? '' })) });
  });

  router.get('/servicos/buscar-usina', exigir('servicos', 'criar'), async (req: AuthedRequest, res) => {
    const q = String(req.query.q ?? '').trim().replace(/[,%]/g, ' ');
    if (q.length < 2) { res.json({ usinas: [] }); return; }
    const db = bancoDoOperador(req, supabase);
    const { data } = await db.from('sistemas_clientes').select('id, apelido')
      .ilike('apelido', `%${q}%`).eq('ativo', true).limit(8);
    res.json({ usinas: (data ?? []).map((s: any) => ({ id: s.id, nome: s.apelido })) });
  });

  router.post('/servicos/nova', exigir('servicos', 'criar'), async (req: AuthedRequest, res) => {
    try {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const tipo = String(b.tipo ?? '').trim();
      const dataServico = String(b.data ?? '').trim();
      if (!tipo || !dataServico) { res.status(400).json({ ok: false, erro: 'Tipo e data são obrigatórios.' }); return; }

      // Cliente: existente OU criado na hora (nome+telefone, dedup do 9º dígito)
      let leadId = b.leadId ? String(b.leadId) : null;
      if (!leadId) {
        const novo = b.clienteNovo as { nome?: string; telefone?: string } | null;
        const nome = String(novo?.nome ?? '').trim();
        const tel = String(novo?.telefone ?? '').replace(/\D/g, '');
        if (!nome || tel.length < 10) { res.status(400).json({ ok: false, erro: 'Cliente: escolha um existente ou informe nome + telefone.' }); return; }
        leadId = await supabaseService.getOrCreateLeadByPhone(tel, nome, req.dashUser!.companyId);
      }

      const midias = (Array.isArray(b.midias) ? b.midias : []) as { nome?: string; tipoMidia?: string; contentType?: string }[];
      if (midias.filter((m) => m.tipoMidia === 'video').length > 2) {
        res.status(400).json({ ok: false, erro: 'Máximo de 2 vídeos por registro.' }); return;
      }

      const { criarServico } = await import('./servicos-store.js');
      const { randomUUID } = await import('crypto');
      // Atribuiu a alguém → nasce 🟡 pendente pra pessoa completar no campo.
      const atribuidoA = b.atribuidoA ? String(b.atribuidoA) : null;
      const servicoId = await criarServico(supabase, {
        companyId: req.dashUser!.companyId, tipoId: tipo, leadId,
        sistemaId: b.sistemaId ? String(b.sistemaId) : null,
        observacoes: String(b.observacoes ?? '').trim() || null,
        dataServico, criadoPor: req.dashUser!.id,
        atribuidoA, status: atribuidoA ? 'atribuido' : 'concluido',
      });

      const uploads: { path: string; url: string }[] = [];
      for (const m of midias) {
        const path = `${leadId}/servico/${servicoId}/${randomUUID()}.${extDoContentType(String(m.contentType ?? ''))}`;
        const { data, error } = await supabase.storage.from(BUCKET_SERVICOS).createSignedUploadUrl(path);
        if (error || !data) { console.warn('[servicos] signed upload falhou:', error?.message); continue; }
        uploads.push({ path, url: data.signedUrl });
      }
      res.json({ ok: true, id: servicoId, uploads });
    } catch (err) {
      console.error('[servicos/nova]', err);
      res.status(500).json({ ok: false, erro: 'Falha ao criar o registro.' });
    }
  });

  // Mais mídias num serviço EXISTENTE (o instalador completando o atribuído).
  router.post('/servicos/:id/uploads', exigir('servicos', 'criar'), async (req: AuthedRequest, res) => {
    try {
      const servicoId = String(req.params.id);
      const { getServico } = await import('./servicos-store.js');
      const { randomUUID } = await import('crypto');
      const s = await getServico(supabase, servicoId);
      if (!s) { res.status(404).json({ ok: false, erro: 'Registro não achado.' }); return; }
      const midias = (Array.isArray(req.body?.midias) ? req.body.midias : []) as { tipoMidia?: string; contentType?: string }[];
      if (s.videos + midias.filter((m) => m.tipoMidia === 'video').length > 2) {
        res.status(400).json({ ok: false, erro: 'Máximo de 2 vídeos por registro.' }); return;
      }
      const uploads: { path: string; url: string }[] = [];
      for (const m of midias) {
        const path = `${s.leadId}/servico/${servicoId}/${randomUUID()}.${extDoContentType(String(m.contentType ?? ''))}`;
        const { data, error } = await supabase.storage.from(BUCKET_SERVICOS).createSignedUploadUrl(path);
        if (error || !data) { console.warn('[servicos] signed upload falhou:', error?.message); continue; }
        uploads.push({ path, url: data.signedUrl });
      }
      res.json({ ok: true, uploads });
    } catch (err) {
      console.error('[servicos/uploads]', err);
      res.status(500).json({ ok: false, erro: 'Falha ao preparar os envios.' });
    }
  });

  // Instalador terminou: concluir + zap pro Junior.
  router.post('/servicos/:id/concluir', exigir('servicos', 'criar'), async (req: AuthedRequest, res) => {
    try {
      const servicoId = String(req.params.id);
      const { getServico, concluirServico } = await import('./servicos-store.js');
      const antes = await getServico(supabase, servicoId);
      if (!antes) { res.status(404).json({ ok: false, erro: 'Registro não achado.' }); return; }
      const obsFinais = String(req.body?.observacoes ?? '').trim();
      const observacoes = obsFinais
        ? (antes.observacoes ? `${antes.observacoes}\n---\n${obsFinais}` : obsFinais)
        : null;
      await concluirServico(supabase, servicoId, observacoes);
      if (options.sendText && options.engineerPhone) {
        const depois = await getServico(supabase, servicoId);
        options.sendText(options.engineerPhone,
          `✅ Serviço concluído: ${antes.tipoNome} — ${antes.clienteNome}` +
          ` (${depois?.fotos ?? 0} fotos, ${depois?.videos ?? 0} vídeo${(depois?.videos ?? 0) === 1 ? '' : 's'})` +
          ` por ${req.dashUser!.nome}. Veja na tela Serviços.`,
        ).catch(() => { /* best-effort */ });
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('[servicos/concluir]', err);
      res.status(500).json({ ok: false, erro: 'Falha ao concluir.' });
    }
  });

  router.post('/servicos/:id/confirmar-midias', exigir('servicos', 'criar'), async (req: AuthedRequest, res) => {
    try {
      const servicoId = String(req.params.id);
      const { getServico, registrarMidias } = await import('./servicos-store.js');
      const s = await getServico(supabase, servicoId);
      if (!s) { res.status(404).json({ ok: false, erro: 'Registro não achado.' }); return; }
      const prefixo = `${s.leadId}/servico/${servicoId}/`;
      const midias = ((Array.isArray(req.body?.midias) ? req.body.midias : []) as { path?: string; tipoMidia?: string }[])
        .filter((m) => typeof m.path === 'string' && m.path.startsWith(prefixo)) // só paths DESTE registro
        .map((m) => ({ path: String(m.path), tipoMidia: (m.tipoMidia === 'video' ? 'video' : 'foto') as 'foto' | 'video' }));
      await registrarMidias(supabase, servicoId, req.dashUser!.companyId, midias);
      res.json({ ok: true, registradas: midias.length });
    } catch (err) {
      console.error('[servicos/confirmar]', err);
      res.status(500).json({ ok: false, erro: 'Falha ao registrar as mídias.' });
    }
  });

  router.get('/servicos/:id', exigir('servicos', 'visualizar'), async (req: AuthedRequest, res) => {
    try {
      const { getServico, midiasDoServico } = await import('./servicos-store.js');
      const { renderDetalheServicoPage } = await import('./servicos-views.js');
      const { getSignedUrls } = await import('../anexos/storage.js');
      const s = await getServico(supabase, String(req.params.id));
      if (!s) { res.status(404).send('Registro não achado.'); return; }
      const midias = await midiasDoServico(supabase, s.id);
      const urls = await getSignedUrls(supabase, midias.map((m) => m.path), 3600);
      const comUrl = midias.map((m) => ({ tipoMidia: m.tipoMidia, url: urls[m.path] ?? '' })).filter((m) => m.url);
      res.type('html').send(renderDetalheServicoPage(s, comUrl, req.dashUser));
    } catch (err) {
      console.error('[servicos/detalhe]', err);
      res.status(500).send('Falha ao carregar o registro.');
    }
  });

  // ----- MINHA ASSINATURA (tela do TENANT — fatia 4) -----
  // O assinante vê a própria mensalidade (situação, vencimento, uso do plano,
  // link de pagar) e cadastra o zap com código. Escopo: SEMPRE a empresa da
  // sessão — tenant nunca enxerga assinatura dos outros.
  const confirmadorZapPromise = import('./zap-confirmacao.js').then((m) => m.criarConfirmadorZap());

  router.get('/minha-assinatura', async (req: AuthedRequest, res) => {
    try {
      const { assinaturaDaEmpresa, contarUsinasAtivas, linkPendente } = await import('./assinaturas-store.js');
      const { renderMinhaAssinaturaPage } = await import('./minha-assinatura-views.js');
      const cid = req.dashUser!.companyId;
      const a = await assinaturaDaEmpresa(supabase, cid);
      const uso = a && a.limite !== null ? await contarUsinasAtivas(supabase, cid).catch(() => null) : null;
      const linkPagar = a ? await linkPendente(supabase, a.id) : null;
      const q = req.query as Record<string, string | undefined>;
      const aviso = q.ok ? { tipo: 'ok' as const, texto: q.ok } : q.erro ? { tipo: 'erro' as const, texto: q.erro } : undefined;
      res.type('html').send(renderMinhaAssinaturaPage(a, hojeISO(), uso, linkPagar, req.dashUser, aviso));
    } catch (err) {
      console.error('[minha-assinatura]', err);
      res.status(500).send('Falha ao carregar a assinatura.');
    }
  });

  router.post('/minha-assinatura/zap/solicitar', async (req: AuthedRequest, res) => {
    try {
      const telefone = String(req.body?.telefone ?? '').replace(/\D/g, '');
      if (telefone.length < 10) { res.redirect('/dashboard/minha-assinatura?erro=' + encodeURIComponent('Telefone inválido — use DDI+DDD+número, ex: 5561999998888.')); return; }
      if (!options.sendText) { res.redirect('/dashboard/minha-assinatura?erro=' + encodeURIComponent('Envio de WhatsApp indisponível no momento.')); return; }
      const { assinaturaDaEmpresa } = await import('./assinaturas-store.js');
      const a = await assinaturaDaEmpresa(supabase, req.dashUser!.companyId);
      if (!a) { res.redirect('/dashboard/minha-assinatura?erro=' + encodeURIComponent('Assinatura não encontrada.')); return; }
      const confirmador = await confirmadorZapPromise;
      const r = confirmador.solicitar(a.id, telefone);
      if (!r.ok) { res.redirect('/dashboard/minha-assinatura?erro=' + encodeURIComponent(r.erro)); return; }
      await options.sendText(telefone, `Seu código de confirmação é: ${r.codigo}\n\nDigite ele na tela "Minha assinatura" pra ativar os avisos por aqui. (Se não foi você, ignore.)`);
      res.redirect('/dashboard/minha-assinatura?ok=' + encodeURIComponent('Código enviado no seu WhatsApp — digite ele aqui embaixo.'));
    } catch (err) {
      console.error('[minha-assinatura/zap]', err);
      res.redirect('/dashboard/minha-assinatura?erro=' + encodeURIComponent('Falha ao enviar o código.'));
    }
  });

  router.post('/minha-assinatura/zap/confirmar', async (req: AuthedRequest, res) => {
    try {
      const codigo = String(req.body?.codigo ?? '').trim();
      const { assinaturaDaEmpresa, editarAssinatura } = await import('./assinaturas-store.js');
      const a = await assinaturaDaEmpresa(supabase, req.dashUser!.companyId);
      if (!a) { res.redirect('/dashboard/minha-assinatura?erro=' + encodeURIComponent('Assinatura não encontrada.')); return; }
      const confirmador = await confirmadorZapPromise;
      const telefone = confirmador.telefonePendente(a.id);
      if (!confirmador.confirmar(a.id, codigo) || !telefone) {
        res.redirect('/dashboard/minha-assinatura?erro=' + encodeURIComponent('Código errado ou vencido — peça um novo.')); return;
      }
      await editarAssinatura(supabase, a.id, { telefone, zapConfirmado: true });
      res.redirect('/dashboard/minha-assinatura?ok=' + encodeURIComponent('✅ WhatsApp confirmado! Os avisos da assinatura vão chegar por lá.'));
    } catch (err) {
      console.error('[minha-assinatura/zap-confirmar]', err);
      res.redirect('/dashboard/minha-assinatura?erro=' + encodeURIComponent('Falha ao confirmar.'));
    }
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

  // ----- EMPRESAS/TENANTS (Fase 2 A1 — docs/ecosof/07): SÓ admin da EcoSun.
  // Provisiona tenant: empresa + papel Administrador + 1º usuário. Roda no
  // client de SERVIÇO de propósito (operação cross-tenant de identidade).
  const ehAdminEcosun = (u: AuthedRequest['dashUser']): boolean =>
    !!u && u.companyId === ECOSUN && can(u, 'usuarios', 'administrar');

  router.get('/empresas', async (req: AuthedRequest, res) => {
    if (!ehAdminEcosun(req.dashUser)) { res.status(403).send('Sem permissão'); return; }
    const { listCompaniesComUsuarios } = await import('./empresas-store.js');
    const { renderEmpresasPage } = await import('./empresas-views.js');
    const empresas = await listCompaniesComUsuarios(supabase);
    const aviso = req.query.ok
      ? { tipo: 'ok' as const, texto: 'Empresa criada! Entregue o login/senha ao administrador do tenant.' }
      : req.query.erro
        ? { tipo: 'erro' as const, texto: String(req.query.erro) }
        : undefined;
    res.type('html').send(renderEmpresasPage(empresas, req.dashUser, aviso));
  });

  router.post('/empresas/nova', async (req: AuthedRequest, res) => {
    if (!ehAdminEcosun(req.dashUser)) { res.status(403).send('Sem permissão'); return; }
    const { nome, admin_nome, admin_login, admin_senha } = req.body ?? {};
    if (!nome || !admin_nome || !admin_login || !admin_senha) { res.status(400).send('Campos obrigatórios'); return; }
    if (String(admin_senha).length < 8) { res.status(400).send('Senha inicial precisa de 8+ caracteres'); return; }
    const { criarEmpresaComAdmin } = await import('./empresas-store.js');
    const r = await criarEmpresaComAdmin(supabase, {
      nome: String(nome).trim(),
      adminNome: String(admin_nome).trim(),
      adminLogin: String(admin_login).trim().toLowerCase(),
      senhaHash: await hashSenha(String(admin_senha)),
    });
    if ('error' in r) { res.redirect(`/dashboard/empresas?erro=${encodeURIComponent(r.error)}`); return; }
    await audit(supabase, { companyId: req.dashUser!.companyId, userId: req.dashUser!.id, entidade: 'empresa', entidadeId: r.companyId, acao: 'criou' });
    res.redirect('/dashboard/empresas?ok=1');
  });

  // ===== O PRÉDIO VIVO (F1 — spec 2026-07-28): multi-tenant em 3D, SÓ EcoSun =====
  router.get('/predio', async (req: AuthedRequest, res) => {
    if (!ehAdminEcosun(req.dashUser)) { res.status(403).send('Sem permissão'); return; }
    const { renderPredioPage } = await import('./predio-views.js');
    res.type('html').send(renderPredioPage());
  });

  router.get('/api/predio', async (req: AuthedRequest, res) => {
    if (!ehAdminEcosun(req.dashUser)) { res.status(403).json({ erro: 'só EcoSun' }); return; }
    try {
      const client = supabase;
      const { montarPredio } = await import('../predio/dados.js');
      const { data: companies } = await client.from('companies').select('id, nome, created_at').order('created_at');
      const porCompany: Record<string, { usinas: number; assentos: number; leads: number; ultimoLoginISO: string | null; ultimoEventoISO: string | null }> = {};
      for (const c of (companies ?? []) as Array<{ id: string }>) {
        const [usinas, users, leads, evento] = await Promise.all([
          client.from('sistemas_clientes').select('id', { count: 'exact', head: true }).eq('company_id', c.id),
          client.from('dashboard_users').select('last_login').eq('company_id', c.id).order('last_login', { ascending: false }),
          client.from('leads').select('id', { count: 'exact', head: true }).eq('company_id', c.id),
          client.from('eventos_elo').select('created_at').eq('company_id', c.id).order('created_at', { ascending: false }).limit(1),
        ]);
        porCompany[c.id] = {
          usinas: usinas.count ?? 0,
          assentos: (users.data ?? []).length,
          leads: leads.count ?? 0,
          ultimoLoginISO: ((users.data ?? [])[0] as { last_login?: string } | undefined)?.last_login ?? null,
          ultimoEventoISO: ((evento.data ?? [])[0] as { created_at?: string } | undefined)?.created_at ?? null,
        };
      }
      // manutencoes_predio (migration 083 — nome com sufixo: `manutencoes` já
      // era a manutenção de USINAS!): pode ainda não existir — degrada pra [].
      let manutencoes: Array<{ company_id: string | null; titulo: string; status: string }> = [];
      try {
        const r = await client.from('manutencoes_predio').select('company_id, titulo, status').order('criado_em', { ascending: false }).limit(100);
        if (!r.error) manutencoes = (r.data ?? []) as typeof manutencoes;
      } catch { /* sem a 083 aplicada ainda — letreiro vazio */ }
      const predio = montarPredio({
        agoraISO: new Date().toISOString(),
        companies: (companies ?? []) as never,
        porCompany,
        manutencoes,
      });
      res.json({ ...predio, manutencoes });
    } catch (err) {
      console.error('[predio] dados falharam:', (err as Error).message);
      res.status(500).json({ erro: (err as Error).message });
    }
  });

  // ----- RH (Trabalhe Conosco): vagas + funil de candidatos -----
  router.get('/rh', (_req: AuthedRequest, res) => { res.redirect('/dashboard/rh/candidatos'); });

  router.get('/rh/vagas', async (req: AuthedRequest, res) => {
    if (!can(req.dashUser, 'rh', 'visualizar')) { res.status(403).send('Sem permissão'); return; }
    const { listarVagas } = await import('../rh/store.js');
    const { renderVagasPage } = await import('./rh-views.js');
    // Fatia 4 (strangler RLS): rota de leitura no client-do-operador.
    const db = bancoDoOperador(req, supabase);
    res.type('html').send(renderVagasPage(await listarVagas(db), req.dashUser));
  });

  router.get('/rh/vagas/nova', async (req: AuthedRequest, res) => {
    if (!can(req.dashUser, 'rh', 'criar')) { res.status(403).send('Sem permissão'); return; }
    const { renderVagaFormPage } = await import('./rh-views.js');
    res.type('html').send(renderVagaFormPage(null, req.dashUser));
  });

  router.post('/rh/vagas', async (req: AuthedRequest, res) => {
    if (!can(req.dashUser, 'rh', 'criar')) { res.status(403).send('Sem permissão'); return; }
    const b = req.body ?? {};
    const { criarVaga } = await import('../rh/store.js');
    const r = await criarVaga(supabase, {
      titulo: String(b.titulo ?? ''), descricao: String(b.descricao ?? ''),
      requisitos: String(b.requisitos ?? ''), cidade: String(b.cidade ?? 'Brasília-DF'),
      tipo: String(b.tipo ?? 'CLT'),
    });
    if (!r.ok) { res.status(400).send(r.error ?? 'Erro ao criar vaga'); return; }
    await audit(supabase, { companyId: req.dashUser!.companyId, userId: req.dashUser!.id, entidade: 'rh_vaga', entidadeId: r.id, acao: 'criou' });
    res.redirect('/dashboard/rh/vagas');
  });

  router.get('/rh/vagas/:id', async (req: AuthedRequest, res) => {
    if (!can(req.dashUser, 'rh', 'visualizar')) { res.status(403).send('Sem permissão'); return; }
    const { getVaga } = await import('../rh/store.js');
    const { renderVagaFormPage } = await import('./rh-views.js');
    // Fatia 4 (strangler RLS): rota de leitura no client-do-operador.
    const db = bancoDoOperador(req, supabase);
    const vaga = await getVaga(db, String(req.params.id));
    if (!vaga) { res.status(404).send('Vaga não encontrada'); return; }
    res.type('html').send(renderVagaFormPage(vaga, req.dashUser));
  });

  router.post('/rh/vagas/:id', async (req: AuthedRequest, res) => {
    if (!can(req.dashUser, 'rh', 'editar')) { res.status(403).send('Sem permissão'); return; }
    const b = req.body ?? {};
    if (!String(b.titulo ?? '').trim()) { res.status(400).send('Título da vaga é obrigatório.'); return; }
    const { atualizarVaga } = await import('../rh/store.js');
    await atualizarVaga(supabase, String(req.params.id), {
      titulo: String(b.titulo ?? ''), descricao: String(b.descricao ?? ''),
      requisitos: String(b.requisitos ?? ''), cidade: String(b.cidade ?? ''),
      tipo: String(b.tipo ?? 'CLT'),
    });
    await audit(supabase, { companyId: req.dashUser!.companyId, userId: req.dashUser!.id, entidade: 'rh_vaga', entidadeId: String(req.params.id), acao: 'editar' });
    res.redirect('/dashboard/rh/vagas');
  });

  router.post('/rh/vagas/:id/status', async (req: AuthedRequest, res) => {
    if (!can(req.dashUser, 'rh', 'editar')) { res.status(403).send('Sem permissão'); return; }
    const status = req.body?.status === 'fechada' ? 'fechada' as const : 'aberta' as const;
    const { atualizarVaga } = await import('../rh/store.js');
    await atualizarVaga(supabase, String(req.params.id), { status });
    await audit(supabase, { companyId: req.dashUser!.companyId, userId: req.dashUser!.id, entidade: 'rh_vaga', entidadeId: String(req.params.id), acao: status === 'fechada' ? 'fechou' : 'reabriu' });
    res.redirect('/dashboard/rh/vagas');
  });

  router.get('/rh/candidatos', async (req: AuthedRequest, res) => {
    if (!can(req.dashUser, 'rh', 'visualizar')) { res.status(403).send('Sem permissão'); return; }
    const { listarCandidatos, listarVagas } = await import('../rh/store.js');
    const { renderCandidatosPage } = await import('./rh-views.js');
    const filtros = {
      vagaId: typeof req.query.vaga === 'string' && req.query.vaga ? req.query.vaga : undefined,
      status: typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined,
      q: typeof req.query.q === 'string' && req.query.q ? req.query.q : undefined,
    };
    // Fatia 4 (strangler RLS): rota de leitura no client-do-operador.
    const db = bancoDoOperador(req, supabase);
    const [candidatos, vagas] = await Promise.all([listarCandidatos(db, filtros), listarVagas(db)]);
    res.type('html').send(renderCandidatosPage(candidatos, vagas, filtros, req.dashUser));
  });

  router.post('/rh/candidatos/:id/status', async (req: AuthedRequest, res) => {
    if (!can(req.dashUser, 'rh', 'editar')) { res.status(403).send('Sem permissão'); return; }
    const { mudarStatus } = await import('../rh/store.js');
    const novoStatus = String(req.body?.status ?? '');
    const r = await mudarStatus(supabase, String(req.params.id), novoStatus, req.dashUser?.nome ?? '?');
    if (!r.ok) { res.status(400).send(r.error ?? 'Erro'); return; }
    await audit(supabase, { companyId: req.dashUser!.companyId, userId: req.dashUser!.id, entidade: 'rh_candidato', entidadeId: String(req.params.id), acao: `status:${novoStatus}` });
    res.redirect('/dashboard/rh/candidatos');
  });

  router.get('/rh/candidatos/:id/curriculo', async (req: AuthedRequest, res) => {
    if (!can(req.dashUser, 'rh', 'visualizar')) { res.status(403).send('Sem permissão'); return; }
    const { urlCurriculoDoCandidato } = await import('../rh/store.js');
    // Fatia 4 (strangler RLS): rota de leitura no client-do-operador.
    const db = bancoDoOperador(req, supabase);
    // Tabela via crachá (RLS); URL assinada via SERVIÇO (storage fica fora da 079).
    const url = await urlCurriculoDoCandidato(db, String(req.params.id), supabase);
    if (!url) { res.status(404).send('Currículo não encontrado — tenta de novo em instantes.'); return; }
    res.redirect(url);
  });

  router.get('/rh/busca', async (req: AuthedRequest, res) => {
    if (!can(req.dashUser, 'rh', 'visualizar')) { res.status(403).send('Sem permissão'); return; }
    const { renderBuscaPage } = await import('./rh-views.js');
    const pergunta = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!pergunta) { res.type('html').send(renderBuscaPage('', null, req.dashUser)); return; }
    if (!options.anthropicApiKey) {
      res.type('html').send(renderBuscaPage(pergunta, null, req.dashUser, 'IA não configurada neste ambiente.'));
      return;
    }
    try {
      const { buscarNoBanco } = await import('../rh/busca.js');
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const anthropic = new Anthropic({ apiKey: options.anthropicApiKey });
      // Fatia 4 (strangler RLS): rota de leitura no client-do-operador.
      const db = bancoDoOperador(req, supabase);
      const resultados = await buscarNoBanco(anthropic, db, pergunta);
      res.type('html').send(renderBuscaPage(pergunta, resultados, req.dashUser));
    } catch (err) {
      console.warn('[rh-busca]', (err as Error).message);
      res.type('html').send(renderBuscaPage(pergunta, null, req.dashUser, 'A busca falhou agora — tenta de novo em instantes.'));
    }
  });

  router.post('/rh/candidatos/:id/excluir', async (req: AuthedRequest, res) => {
    if (!can(req.dashUser, 'rh', 'excluir')) { res.status(403).send('Sem permissão'); return; }
    const { excluirCandidato } = await import('../rh/store.js');
    const r = await excluirCandidato(supabase, String(req.params.id));
    if (!r.ok) { res.status(400).send(r.error ?? 'Erro ao excluir'); return; }
    await audit(supabase, { companyId: req.dashUser!.companyId, userId: req.dashUser!.id, entidade: 'rh_candidato', entidadeId: String(req.params.id), acao: 'excluiu' });
    res.redirect('/dashboard/rh/candidatos');
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
      // Fatia 4 (strangler RLS): rota de leitura no client-do-operador.
      const db = bancoDoOperador(req as AuthedRequest, supabase);
      const data = await getCockpitData(db);
      // IA: sintese leads aguardando + insights gerais da plataforma.
      let leadsAguardando: Awaited<ReturnType<typeof import('./lead-synthesis.js').getLeadsAguardandoAcao>> = [];
      let platformInsights: Awaited<ReturnType<typeof import('./lead-synthesis.js').getPlatformInsights>> = [];
      if (options.anthropicApiKey) {
        try {
          const { default: Anthropic } = await import('@anthropic-ai/sdk');
          const { getLeadsAguardandoAcao, getPlatformInsights } = await import('./lead-synthesis.js');
          const anthropic = new Anthropic({ apiKey: options.anthropicApiKey });
          [leadsAguardando, platformInsights] = await Promise.all([
            getLeadsAguardandoAcao(db, anthropic, 6),
            getPlatformInsights(db, anthropic),
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
  router.get('/cockpit/data', async (req: Request, res: Response) => {
    try {
      const { getCockpitData } = await import('./cockpit-queries.js');
      // Fatia 4 (strangler RLS): rota de leitura no client-do-operador.
      const db = bancoDoOperador(req as AuthedRequest, supabase);
      const data = await getCockpitData(db);
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

  // Home: KPIs + grafico mensal. ?mes=YYYY-MM filtra os cards por um mês passado.
  router.get('/home', async (req: Request, res: Response) => {
    try {
      const agora = new Date();
      const mesParam = String(req.query.mes ?? '').match(/^(\d{4})-(\d{2})$/);
      const ehAtual = !mesParam;
      const mesRef = mesParam
        ? new Date(parseInt(mesParam[1], 10), parseInt(mesParam[2], 10) - 1, 1)
        : agora;
      const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
      const mesLabel = ehAtual ? 'Este mês' : `${MESES[mesRef.getMonth()]} de ${mesRef.getFullYear()}`;
      const mesValue = `${mesRef.getFullYear()}-${String(mesRef.getMonth() + 1).padStart(2, '0')}`;
      // Fatia 4 (strangler RLS): rota de leitura no client-do-operador.
      const db = bancoDoOperador(req as AuthedRequest, supabase);
      const [kpis, grafico, graficoVendas] = await Promise.all([
        fetchDashboardKpis(db, mesRef),
        fetchPropostasPorMes(db),
        fetchVendasPorMes(db),
      ]);
      res.send(renderHomePage(kpis, grafico, graficoVendas, mesLabel, mesValue));
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
    // Fatia 4 (strangler RLS): escrita de dado do tenant no client-do-operador.
    const db = bancoDoOperador(req as AuthedRequest, supabase);
    const { data: leadRow, error } = await db
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
    // Fatia 4 (strangler RLS): escrita de dado do tenant no client-do-operador.
    const db = bancoDoOperador(req as AuthedRequest, supabase);
    const { error } = await db
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
      // Fatia 4 (strangler RLS): rota de leitura no client-do-operador.
      const db = bancoDoOperador(req as AuthedRequest, supabase);
      const rows = await listCadenciaLeads(db);
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
      // Fatia 3 (strangler RLS): 1ª rota no client-do-operador. Com a flag desligada
      // (padrão) é o mesmo supabase de serviço — zero mudança até o Junior virar a chave.
      const db = bancoDoOperador(req as AuthedRequest, supabase);
      const [result, insights] = await Promise.all([
        listLeads(db, { status, only_alerts, atencao, search, limit, offset, viewerId: viewer.id, viewerIsAdmin: viewer.isAdmin }),
        buildLeadsInsights(db),
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
      // Fatia 4 (strangler RLS): rota de leitura no client-do-operador.
      const db = bancoDoOperador(req as AuthedRequest, supabase);
      const grupos = await leadsParaKanban(db, viewer);
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
      const { servicosDoLead } = await import('./servicos-store.js');
      const servicosDoCliente = await servicosDoLead(supabase, id).catch(() => []);
      res.send(renderLeadDetailPage(lead, conversaIA, String(req.query.docs ?? ''), String(req.query.envio ?? ''), servicosDoCliente));
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
    // Fatia 4 (strangler RLS): escrita de dado do tenant no client-do-operador.
    const db = bancoDoOperador(req as AuthedRequest, supabase);
    const { error } = await db
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
    // Fatia 4 (strangler RLS): escrita de dado do tenant no client-do-operador.
    const db = bancoDoOperador(req as AuthedRequest, supabase);
    const { error } = await db
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
    // Fatia 4 (strangler RLS): escrita de dado do tenant no client-do-operador.
    const db = bancoDoOperador(req as AuthedRequest, supabase);
    const { error } = await db
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
    // Fatia 4 (strangler RLS): escrita de dado do tenant no client-do-operador.
    const db = bancoDoOperador(req as AuthedRequest, supabase);
    const now = new Date().toISOString();
    const { error: e1 } = await db
      .from('leads')
      .update({ opt_out: true, eva_active: false, updated_at: now })
      .eq('id', id);
    if (e1) return res.status(500).send(`erro: ${escapeHtmlSimple(e1.message)}`);
    // Cancela cadencia pendente tambem
    await db
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
    // Fatia 4 (strangler RLS): escrita de dado do tenant no client-do-operador.
    const db = bancoDoOperador(req as AuthedRequest, supabase);
    const { error } = await db
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
    // Fatia 4 (strangler RLS): escrita de dado do tenant no client-do-operador.
    const db = bancoDoOperador(req as AuthedRequest, supabase);
    // Posse: vendedor não pode mexer em lead de OUTRO vendedor (mesmo gate de /set-etapa).
    const user = (req as AuthedRequest).dashUser!;
    const { data: lead } = await db.from('leads').select('claimed_by').eq('id', id).maybeSingle();
    if (!lead || (user && !podeVerLead(user, lead))) return res.status(403).send('Lead de outro vendedor');
    const { error } = await db
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
    // Fatia 4 (strangler RLS): escrita de dado do tenant no client-do-operador.
    const db = bancoDoOperador(req as AuthedRequest, supabase);
    // Posse: vendedor não pode mexer em lead de OUTRO vendedor (admin passa direto).
    const user = (req as AuthedRequest).dashUser!;
    const { data: leadDono } = await db.from('leads').select('claimed_by').eq('id', id).maybeSingle();
    if (!leadDono || !podeVerLead(user, leadDono)) return res.status(403).send('Lead de outro vendedor');
    const { error } = await db
      .from('leads')
      .update({ status: etapa, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return res.status(500).send(`erro: ${escapeHtmlSimple(error.message)}`);
    // Etapa 'ganho' é terminal: cancela tarefas pendentes pra não alertar SLA-fantasma.
    if (etapa === 'ganho') {
      try { await cancelarTarefasPendentesDoLead(db, id); } catch (e) { console.warn('[set-etapa] cancelar tarefas falhou (segue):', (e as Error).message); }
    }
    const viewer = (req as AuthedRequest).dashUser;
    if (viewer) {
      try {
        await registrarAtividade(db, {
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
    // Fatia 4 (strangler RLS): escrita de dado do tenant no client-do-operador.
    const db = bancoDoOperador(req as AuthedRequest, supabase);
    // Posse: vendedor não pode criar tarefa em lead de OUTRO vendedor (admin passa direto).
    const { data: leadRow } = await db.from('leads').select('claimed_by').eq('id', id).maybeSingle();
    if (!leadRow || (viewer && !podeVerLead(viewer, leadRow))) return res.status(403).send('Lead de outro vendedor');
    // Dono da tarefa = quem já está com o lead (claimed_by), se houver.
    const assigned_to = (leadRow?.claimed_by as string | null) ?? null;
    try {
      await criarTarefa(db, {
        company_id: viewer?.companyId ?? ECOSUN,
        lead_id: id, titulo, tipo, due_at, prioridade,
        automatica: false, created_by: viewer?.id ?? null, assigned_to,
      });
    } catch (err) {
      return res.status(500).send(`erro: ${escapeHtmlSimple((err as Error).message)}`);
    }
    if (viewer) {
      await registrarAtividade(db, {
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
    // Fatia 4 (strangler RLS): escrita de dado do tenant no client-do-operador.
    const db = bancoDoOperador(req as AuthedRequest, supabase);
    // Posse: vendedor não pode mexer em tarefa de lead de OUTRO vendedor (admin passa direto).
    const { data: leadRow } = await db.from('leads').select('claimed_by').eq('id', id).maybeSingle();
    if (!leadRow || (viewer && !podeVerLead(viewer, leadRow))) return res.status(403).send('Lead de outro vendedor');
    try {
      // leadId amarra a tarefa ao lead da URL (evita concluir tarefa de outro lead via :tid).
      await concluirTarefa(db, tid, viewer?.id ?? null, id);
    } catch (err) {
      return res.status(500).send(`erro: ${escapeHtmlSimple((err as Error).message)}`);
    }
    if (viewer) {
      await registrarAtividade(db, {
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
    // Fatia 4 (strangler RLS): escrita de dado do tenant no client-do-operador.
    const db = bancoDoOperador(req as AuthedRequest, supabase);
    // Posse: vendedor não pode mexer em tarefa de lead de OUTRO vendedor (admin passa direto).
    const { data: leadRow } = await db.from('leads').select('claimed_by').eq('id', id).maybeSingle();
    if (!leadRow || (viewer && !podeVerLead(viewer, leadRow))) return res.status(403).send('Lead de outro vendedor');
    try {
      // leadId amarra a tarefa ao lead da URL (evita adiar tarefa de outro lead via :tid).
      await adiarTarefa(db, tid, 2, id);
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
    // Fatia 4 (strangler RLS): escrita de dado do tenant no client-do-operador.
    const db = bancoDoOperador(req as AuthedRequest, supabase);
    // Posse: vendedor não pode registrar atividade em lead de OUTRO vendedor (admin passa direto).
    const { data: leadRow } = await db.from('leads').select('claimed_by').eq('id', id).maybeSingle();
    if (!leadRow || (viewer && !podeVerLead(viewer, leadRow))) return res.status(403).send('Lead de outro vendedor');
    try {
      if (viewer) {
        await registrarAtividade(db, {
          company_id: viewer.companyId, lead_id: id, tipo,
          titulo, descricao, automatica: false, user_id: viewer.id,
        });
      }
      // Nota/ligação contam como contato com o cliente.
      await db.from('leads')
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
    // Fatia 4 (strangler RLS): escrita de dado do tenant no client-do-operador.
    const db = bancoDoOperador(req as AuthedRequest, supabase);
    const { error } = await db
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
    // Fatia 4 (strangler RLS): escrita de dado do tenant no client-do-operador.
    const db = bancoDoOperador(req as AuthedRequest, supabase);
    // Lead virou terminal (perdido): cancela tarefas pendentes pra não alertar SLA-fantasma.
    try { await cancelarTarefasPendentesDoLead(db, id); } catch (e) { console.warn('[mark-lost] cancelar tarefas falhou (segue):', (e as Error).message); }
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
    // Fatia 4 (strangler RLS): escrita de dado do tenant no client-do-operador.
    const db = bancoDoOperador(req as AuthedRequest, supabase);
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
      await db.from('eva_cadence').update({ status: 'cancelled', cancelled_reason: 'superseded' })
        .eq('lead_id', id).eq('status', 'pending');
      const { error } = await db.from('eva_cadence').upsert(rows, { onConflict: 'lead_id,step', ignoreDuplicates: false });
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
      // Fatia 4 (strangler RLS): rota de leitura no client-do-operador.
      const db = bancoDoOperador(req as AuthedRequest, supabase);
      const [kpis, campaignsResult, creatives, alerts, channels, insights, googleAds7d, googleAds30d, ga4_30d] = await Promise.all([
        fetchMarketingKpis(db),
        listActiveCampaigns(db, { status, search, limit, offset }),
        listRecentCreatives(db, 8),
        listPendingAlerts(db),
        fetchChannelFunnel(db, periodo),
        buildMarketingInsights(db),
        fetchGoogleAdsSummary(db, 7),
        fetchGoogleAdsSummary(db, 30),
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
        const inputs = await fetchCampaignQualityInputs(db, 14);
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

  // ----------------------------------------------------------------------
  // E-mail Marketing (sob o setor Marketing) — métricas da sequência (a
  // partir de eventos_elo) + botão ligar/pausar. O motor (EmailSequenceService)
  // checa a flag 'email_seq_ligado' em app_flags antes de mandar.
  // ----------------------------------------------------------------------
  router.get('/marketing/email', exigir('marketing', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    let metricas = { enviados: 0, abertos: 0, clicados: 0, quentes: 0, descadastros: 0 };
    try {
      const counts = await supabaseService.contarEventosPorTipo([
        'email_enviado', 'email_aberto', 'email_clicado', 'lead_quente_email', 'email_descadastro',
      ]);
      metricas = {
        enviados: counts.email_enviado,
        abertos: counts.email_aberto,
        clicados: counts.email_clicado,
        quentes: counts.lead_quente_email,
        descadastros: counts.email_descadastro,
      };
    } catch (err) {
      console.warn('[dashboard/email] falha ao contar eventos_elo (segue com zeros):', (err as Error).message);
    }
    let desempenho: Awaited<ReturnType<typeof desempenhoPorStep>> = [];
    try {
      desempenho = await desempenhoPorStep(supabaseService.getClient());
    } catch (err) {
      console.warn('[dashboard/email] falha ao montar desempenho por step (segue vazio):', (err as Error).message);
    }
    const ligado = (await supabaseService.getFlag('email_seq_ligado')) ?? true;
    res.type('text/html').send(renderLayout({
      active: 'email',
      title: 'E-mail Marketing',
      body: renderEmailPage(metricas, ligado, desempenho),
      user: req.dashUser,
    }));
  });

  router.post('/marketing/email/ligar', exigir('marketing', 'editar'), async (req: AuthedRequest, res: Response) => {
    await supabaseService.setFlag('email_seq_ligado', true);
    await audit(supabase, {
      companyId: req.dashUser!.companyId, userId: req.dashUser!.id,
      entidade: 'email_seq', entidadeId: 'email_seq_ligado', acao: 'email_seq_ligada',
    });
    res.redirect('/dashboard/marketing/email?ok=1');
  });

  router.post('/marketing/email/pausar', exigir('marketing', 'editar'), async (req: AuthedRequest, res: Response) => {
    await supabaseService.setFlag('email_seq_ligado', false);
    await audit(supabase, {
      companyId: req.dashUser!.companyId, userId: req.dashUser!.id,
      entidade: 'email_seq', entidadeId: 'email_seq_ligado', acao: 'email_seq_pausada',
    });
    res.redirect('/dashboard/marketing/email?ok=1');
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

      // Fatia 4 (strangler RLS): rota de leitura no client-do-operador.
      const db = bancoDoOperador(req as AuthedRequest, supabase);
      const { rows, total } = await listPropostas(db, { limit, offset, search });
      res.send(renderPropostasPage({ rows, total, offset, limit, search }, (req as AuthedRequest).dashUser));
    } catch (err) {
      console.error('[dashboard/propostas]', err);
      res.status(500).send(`<h2>Erro ao listar propostas</h2><pre>${(err as Error).message}</pre>`);
    }
  });

  // ❤️ CORAÇÃO DA VENDA — botão "Fechou!". Busca as propostas em aberto pelo
  // nome do cliente; o Junior clica na que fechou e registra. Registrar chama
  // registrarVenda (a mesma função que a Eva usa) → sistema todo alinhado.
  router.get('/vendas/fechar', exigir('propostas', 'visualizar'), async (req: Request, res: Response) => {
    try {
      const q = String(req.query.q ?? '').trim();
      const okNome = req.query.ok ? String(req.query.ok) : null;
      const hoje = new Date().toISOString().slice(0, 10);
      const buscou = q.length > 0;
      let resultados: PropostaAberta[] = [];
      if (buscou) {
        // Busca em LEADS (nome/telefone) — não só em propostas_publicas. Antes só
        // achava quem tinha proposta PUBLICADA; quem fechou sem proposta (indicação,
        // venda direta) ficava invisível e não dava pra registrar a venda.
        const { searchLeadByName } = await import('../closing/closing-data-fetcher.js');
        // searchLeadByName é service-role e company-blind (compartilhada com a Eva);
        // filtra por empresa AQUI pra não expor lead de outra empresa na tela.
        const cid = (req as AuthedRequest).dashUser?.companyId;
        const leads = (await searchLeadByName(supabase, q))
          .filter((l: any) => !cid || l.company_id === cid);
        // Enriquece com a última proposta (nº + data) SÓ pra mostrar/pré-preencher —
        // não é mais requisito pra aparecer.
        const leadIds = leads.map((l: any) => l.id);
        const propPorLead = new Map<string, any>();
        if (leadIds.length) {
          const { data: props } = await supabase
            .from('propostas_publicas')
            .select('id, lead_id, numero_proposta, created_at, revoked')
            .in('lead_id', leadIds)
            .order('created_at', { ascending: false });
          for (const p of (props ?? []) as any[]) {
            if (p.revoked === true) continue;
            if (!propPorLead.has(p.lead_id)) propPorLead.set(p.lead_id, p);
          }
        }
        resultados = leads.map((l: any) => {
          const p = propPorLead.get(l.id);
          return {
            leadId: l.id,
            propostaId: p?.id ?? null,
            clienteNome: l.name ?? '(sem nome)',
            numeroProposta: p?.numero_proposta ?? null,
            createdAt: p?.created_at ?? l.created_at ?? null,
            jaVenda: CLIENTE_STATUSES.includes(String(l.installation_status ?? '')),
          };
        });
      }
      res.send(renderFecharVendaPage({
        q, buscou, resultados, hoje,
        ok: okNome ? { nome: okNome } : null,
        user: (req as AuthedRequest).dashUser,
      }));
    } catch (err) {
      console.error('[dashboard/vendas/fechar]', err);
      res.status(500).send(`<h2>Erro</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });

  router.post('/vendas/registrar', exigir('propostas', 'editar'), async (req: Request, res: Response) => {
    try {
      const leadId = String(req.body?.leadId ?? '').trim();
      const nome = String(req.body?.nome ?? '').trim();
      if (!UUID_RE.test(leadId)) return res.status(400).send('lead inválido');
      // Trava de empresa: sem isso, com a busca agora varrendo TODOS os leads, um
      // operador poderia registrar venda no lead de outra empresa (mesmo padrão do
      // /leads/:id/fechou).
      if (!(await leadDaEmpresa(req, leadId))) return res.status(404).send('Lead não encontrado');
      const tipo = req.body?.tipo === 'servico' ? 'servico' : 'sistema';
      const valorReais = parseFloat(String(req.body?.valor ?? '').replace(',', '.'));
      const kwp = parseFloat(String(req.body?.kwp ?? ''));
      const data = String(req.body?.data ?? '').trim() || null;
      const r = await registrarVenda(supabase, {
        leadId, tipo,
        valorCents: Number.isFinite(valorReais) ? Math.round(valorReais * 100) : null,
        kwp: Number.isFinite(kwp) ? kwp : null,
        data, origem: 'dashboard',
      });
      if (!r.ok) return res.status(500).send(`erro ao registrar: ${escapeHtmlSimple(r.erro ?? '')}`);
      const viewer = (req as AuthedRequest).dashUser;
      if (viewer) await audit(supabase, { companyId: viewer.companyId, userId: viewer.id, entidade: 'lead', entidadeId: leadId, acao: 'venda', valorNovo: tipo });
      res.redirect(`/dashboard/vendas/fechar?ok=${encodeURIComponent(nome || 'cliente')}`);
    } catch (err) {
      console.error('[dashboard/vendas/registrar]', err);
      res.status(500).send(`<h2>Erro</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });

  // 📄 Gerador CONFIÁVEL de contrato/procuração: monta os dados do cadastro +
  // proposta (buildInitialData), preenche brancos onde faltar e gera o PDF na
  // hora. Determinístico — SEMPRE gera, nunca trava por falta de dado.
  // Pra onde voltar depois de ler/enviar doc: se veio da tela de Contratos
  // (next=contratos), volta pra ela com o CLIENTE ainda selecionado no dropdown
  // (?lead=<id>) e o mesmo TIPO (?tipo=); senão, volta pra tela do lead.
  function voltarDoc(req: Request, leadId: string, params: string): string {
    const next = String((req.body?.next ?? req.query?.next ?? '')).trim();
    if (next === 'form') {
      const t = String(req.body?.tipo_contrato ?? 'fv').trim();
      return `/dashboard/leads/${leadId}/contrato-form?tipo=${encodeURIComponent(t)}&${params}`;
    }
    if (next === 'contratos') {
      // Volta pro cliente SELECIONADO na Central (dropdown), não pra uma busca —
      // assim ler docs/gerar/enviar mantém o cliente E o tipo na barra de ações.
      const tc = String(req.body?.tipo_central ?? '').trim();
      const tParam = tc ? `&tipo=${encodeURIComponent(tc)}` : '';
      return `/dashboard/contratos?lead=${encodeURIComponent(leadId)}${tParam}&${params}`;
    }
    return `/dashboard/leads/${leadId}?${params}`;
  }
  // Qual tipo da central gerar. O corpo antigo mandava tipo=contrato|procuracao
  // (só existiam esses dois) — 'contrato' agora quer dizer o de sistema FV.
  function tipoDaCentral(raw: unknown): string {
    const t = String(raw ?? 'fv').trim();
    return t === 'contrato' ? 'fv' : t;
  }
  // Gera o PDF de QUALQUER contrato registrado na central: monta os dados
  // (cadastro + proposta + IA + o rascunho do formulário) e passa pro template
  // daquele tipo. Tipo novo entra no registro e passa por aqui sem mudar nada.
  // O lead é mesmo da empresa de quem está logado? Sem isso, um operador de outra
  // empresa poderia abrir (e gravar) o contrato de um cliente que não é dele só
  // sabendo o id da URL. Sem usuário na sessão (ambiente sem login), deixa passar.
  async function leadDaEmpresa(req: Request, leadId: string): Promise<boolean> {
    const viewer = (req as AuthedRequest).dashUser;
    if (!viewer?.companyId) return true;
    const { data } = await supabase.from('leads').select('id').eq('id', leadId).eq('company_id', viewer.companyId).maybeSingle();
    return !!data;
  }
  // O que mostrar nos campos: o que está salvo (cadastro + proposta + IA + rascunho)
  // e, por cima, o que o operador acabou de digitar e ainda não salvou. Sem isso, o
  // botão da IA (ou o da prévia) apagaria da tela o que ele tinha acabado de escrever.
  async function valoresDaTela(
    def: import('../closing/contratos-registry.js').DefinicaoContrato,
    cru: Partial<import('../closing/types.js').DadosFechamento>,
    body: Record<string, unknown> | undefined,
  ): Promise<Record<string, string>> {
    const { valoresDoFormulario, limparTexto } = await import('../closing/contratos-registry.js');
    const valores = valoresDoFormulario(def, cru);
    for (const c of def.campos) {
      if (c.somenteLeitura) continue;
      const digitado = limparTexto(String(body?.[c.id] ?? ''));
      if (digitado) valores[c.id] = digitado;
    }
    return valores;
  }
  // O carimbo do contrato congelado, do jeito que a tela mostra.
  function vigenteDaTela(r: { vigente?: { congeladoEm: string; dados: { comercial: { valor_total_brl: number; forma_pagamento: string } } } | null }) {
    if (!r.vigente) return null;
    return {
      congeladoEm: r.vigente.congeladoEm,
      valor: r.vigente.dados.comercial?.valor_total_brl ?? 0,
      formaPagamento: r.vigente.dados.comercial?.forma_pagamento ?? '',
    };
  }
  // O documento que o cliente recebe nunca leva o id interno no nome: sai
  // "contrato-antonio.pdf", não "fv-antonio.pdf".
  function nomeDoArquivo(arquivo: string, nome: string): string {
    return `${arquivo}-${nome.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`;
  }
  async function gerarDocBuffer(
    leadId: string,
    tipoContrato: string,
  ): Promise<{ pdf: Buffer; nome: string; arquivo: string; faltando: number } | null> {
    const tipo = tipoDaCentral(tipoContrato);
    const { montarFechamentoAuto } = await import('../closing/fechamento-auto.js');
    const { getContrato } = await import('../closing/contratos-registry.js');
    const def = getContrato(tipo);
    if (!def) return null;
    const r = await montarFechamentoAuto(supabase, leadId, tipo);
    if (!r) return null;
    const { renderHtmlToPdf } = await import('../closing/closing-render.js');
    const pdf = await renderHtmlToPdf(def.render(r.dados));
    return { pdf, nome: r.nome || 'cliente', arquivo: def.arquivo, faltando: r.faltando.length };
  }
  // 🧠 O cérebro (Elo) tem que saber de tudo: contrato gerado, mandado no zap,
  // salvo no Drive — datado, ligado ao lead. Best-effort: nunca derruba o fluxo.
  async function eventoContrato(
    req: Request,
    leadId: string,
    tipo: string,
    acao: 'gerado' | 'enviado' | 'no_drive' | 'dados_conferidos' | 'ia_revisou' | 'congelado',
    payload: Record<string, unknown> = {},
  ): Promise<void> {
    await registrarEvento(supabase, {
      tipo: `comercial:contrato_${acao}`,
      departamento: 'comercial',
      canal: acao === 'enviado' ? 'whatsapp' : 'sistema',
      origem: 'central_contratos',
      leadId,
      payload: { tipo_contrato: tipo, usuario: (req as AuthedRequest).dashUser?.nome ?? null, ...payload },
    });
  }
  async function gerarDocPdf(req: Request, res: Response, tipoPadrao: string) {
    try {
      const id = String(req.params.id);
      if (!UUID_RE.test(id)) return res.status(400).send('id inválido');
      if (!(await leadDaEmpresa(req, id))) return res.status(404).send('Lead não encontrado');
      const tipo = tipoDaCentral(req.query.tipo ?? tipoPadrao);
      const doc = await gerarDocBuffer(id, tipo);
      if (!doc) return res.status(404).send('Lead não encontrado');
      await eventoContrato(req, id, tipo, 'gerado', { campos_em_branco: doc.faltando });
      res.type('application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${nomeDoArquivo(doc.arquivo, doc.nome)}"`);
      res.send(doc.pdf);
    } catch (err) {
      console.error('[dashboard/doc-pdf]', err);
      res.status(500).send(`<h2>Erro ao gerar</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  }

  // 📝 O FORMULÁRIO da central de contratos: mostra todos os campos do tipo
  // escolhido já preenchidos (cadastro + proposta + IA), com os brancos em
  // vermelho. O que o Junior digitar aqui vence na hora de gerar o PDF.
  router.get('/leads/:id/contrato-form', exigir('propostas', 'visualizar'), async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      if (!UUID_RE.test(id)) return res.status(400).send('id inválido');
      const { CONTRATOS, getContrato, valoresDoFormulario, camposFaltando } = await import('../closing/contratos-registry.js');
      const def = getContrato(tipoDaCentral(req.query.tipo));
      if (!def) return res.status(400).send('Tipo de contrato desconhecido');
      if (!(await leadDaEmpresa(req, id))) return res.status(404).send('Lead não encontrado');

      const { montarFechamentoAuto } = await import('../closing/fechamento-auto.js');
      const r = await montarFechamentoAuto(supabase, id, def.tipo);
      if (!r) return res.status(404).send('Lead não encontrado');
      res.send(renderContratoFormPage({
        leadId: id,
        nome: r.nome,
        def,
        vigente: vigenteDaTela(r),
        congelou: req.query.congelou === '1',
        tipos: CONTRATOS.map((c) => ({ tipo: c.tipo, nome: c.nome, emoji: c.emoji })),
        valores: valoresDoFormulario(def, r.cru),
        faltando: camposFaltando(def, r.cru),
        temProposta: r.temProposta,
        salvo: req.query.salvo === '1',
        docsResultado: String(req.query.docs ?? ''),
        envioResultado: String(req.query.envio ?? ''),
        driveResultado: String(req.query.drive ?? ''),
        user: (req as AuthedRequest).dashUser,
      }));
    } catch (err) {
      console.error('[dashboard/contrato-form]', err);
      res.status(500).send(`<h2>Erro</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });

  // 👀 A PRÉVIA do documento: o contrato montado em HTML, exatamente o mesmo que
  // vira PDF. Vai dentro do quadro na tela do formulário — o Junior lê antes de
  // mandar pro cliente.
  // Aceita GET (documento como está salvo) e POST (documento com o que está
  // DIGITADO na tela agora, mesmo sem salvar) — é o "ver como vai ficar".
  async function contratoPreview(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      if (!UUID_RE.test(id)) return res.status(400).send('id inválido');
      const { getContrato, dadosDaTela } = await import('../closing/contratos-registry.js');
      const def = getContrato(tipoDaCentral(req.body?.tipo ?? req.query.tipo));
      if (!def) return res.status(400).send('Tipo de contrato desconhecido');
      if (!(await leadDaEmpresa(req, id))) return res.status(404).send('Lead não encontrado');

      const { montarFechamentoAuto, completarComPlaceholders } = await import('../closing/fechamento-auto.js');
      const { deepMerge } = await import('../closing/closing-assistant.js');
      const r = await montarFechamentoAuto(supabase, id, def.tipo);
      if (!r) return res.status(404).send('Lead não encontrado');

      let dados = r.dados;
      if (req.method === 'POST' && req.body) {
        // o que está DIGITADO na tela (mesmo sem salvar) entra por cima, só pra ver
        const naTela = dadosDaTela(def, req.body);
        dados = completarComPlaceholders(deepMerge(r.cru as any, naTela as any));
      }

      // O documento vai dentro de um quadro no painel: mesmo com os dados já
      // escapados no template, o quadro é trancado (nada de script, nada de rede).
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:");
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.type('html').send(def.render(dados));
    } catch (err) {
      console.error('[dashboard/contrato-preview]', err);
      res.status(500).send('<p>Não consegui montar a prévia agora.</p>');
    }
  }
  router.get('/leads/:id/contrato-preview', exigir('propostas', 'visualizar'), contratoPreview);
  router.post('/leads/:id/contrato-preview', exigir('propostas', 'visualizar'), contratoPreview);

  // 🤖 A IA completa os brancos (procurando no cadastro, na proposta e na conversa
  // do zap) e revisa o contrato. Ela só SUGERE: devolve a tela com os campos
  // preenchidos em roxo, pro Junior conferir e salvar. Nada vai pro banco aqui.
  router.post('/leads/:id/contrato-ia', exigir('propostas', 'editar'), async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      if (!UUID_RE.test(id)) return res.status(400).send('id inválido');
      const { CONTRATOS, getContrato, camposQueIaPodeSugerir } = await import('../closing/contratos-registry.js');
      const def = getContrato(tipoDaCentral(req.body?.tipo));
      if (!def) return res.status(400).send('Tipo de contrato desconhecido');
      if (!(await leadDaEmpresa(req, id))) return res.status(404).send('Lead não encontrado');

      const { montarFechamentoAuto } = await import('../closing/fechamento-auto.js');
      const r = await montarFechamentoAuto(supabase, id, def.tipo);
      if (!r) return res.status(404).send('Lead não encontrado');

      // O botão da IA fica DENTRO do formulário: o que o Junior já digitou (e
      // ainda não salvou) vem no corpo e continua na tela depois que a IA roda.
      const valores = await valoresDaTela(def, r.cru, req.body);
      const tela = {
        leadId: id, nome: r.nome, def,
        tipos: CONTRATOS.map((c) => ({ tipo: c.tipo, nome: c.nome, emoji: c.emoji })),
        temProposta: r.temProposta,
        faltando: def.campos.filter((c) => c.obrigatorio && !valores[c.id]),
        vigente: vigenteDaTela(r),
        user: (req as AuthedRequest).dashUser,
      };

      if (!options.anthropicApiKey) {
        return res.send(renderContratoFormPage({ ...tela, valores, iaIndisponivel: true }));
      }

      // As fontes onde a IA pode procurar. Nada de inventar: o que ela sugerir tem
      // que estar escrito aqui dentro (a conferência do trecho é feita no parse).
      const { fetchByLeadId } = await import('../closing/closing-data-fetcher.js');
      const { lead, proposta } = await fetchByLeadId(supabase, id);
      const { data: conv } = await supabase
        .from('conversations').select('messages').eq('lead_id', id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      const bruto = (conv as { messages?: unknown } | null)?.messages;
      const mensagens = Array.isArray(bruto) ? (bruto as Array<{ role?: string; content?: string }>) : [];
      const conversa = mensagens
        .slice(-40)
        .map((m) => `${m?.role === 'assistant' ? 'Eva' : 'cliente'}: ${String(m?.content ?? '').slice(0, 400)}`)
        .join('\n');

      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const { revisarContrato } = await import('../closing/revisar-contrato.js');
      // maxRetries baixo: é uma tela esperando. Melhor avisar "não revisei" rápido
      // do que deixar o Junior olhando pra página travada por 2 minutos.
      const anthropic = new Anthropic({ apiKey: options.anthropicApiKey, maxRetries: 1 });
      const revisao = await revisarContrato(anthropic, {
        nomeContrato: def.nome,
        // A IA vê TODOS os campos (pra revisar o contrato inteiro)...
        campos: def.campos
          .filter((c) => !c.somenteLeitura)
          .map((c) => ({ id: c.id, label: c.label, valor: valores[c.id] ?? '', obrigatorio: c.obrigatorio })),
        lead: (lead ?? {}) as Record<string, unknown>,
        proposta: proposta?.dados_input ?? null,
        conversa,
      });

      // ...mas só pode SUGERIR dado de cadastro. Valor e cláusula, nem que ela ache
      // "escrito na conversa" — sobre dinheiro ela só avisa (achado).
      const podeSugerir = new Set(camposQueIaPodeSugerir(def).map((c) => c.id));
      const sugestoes: Record<string, SugestaoIa> = {};
      for (const [campo, s] of Object.entries(revisao.sugestoes)) {
        if (!podeSugerir.has(campo)) continue;
        if (valores[campo]) continue; // não mexe no que já está preenchido
        sugestoes[campo] = s;
      }
      await eventoContrato(req, id, def.tipo, 'ia_revisou', {
        sugeridos: Object.keys(sugestoes),
        achados: revisao.achados.length,
        respondeu: revisao.ok,
      });

      res.send(renderContratoFormPage({
        ...tela,
        valores, // ← a sugestão NÃO entra no campo. Fica do lado, com botão "usar".
        sugestoes,
        achados: revisao.achados,
        iaRodou: true,
        iaFalhou: !revisao.ok,
      }));
    } catch (err) {
      console.error('[dashboard/contrato-ia]', err);
      res.status(500).send(`<h2>Erro</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });

  // 📌 "Este é o contrato que vale": congela o retrato do que foi combinado
  // (valor, kWp, módulos, forma de pagamento, dados do cliente) com data e autor.
  // Sem isso não existe ADITIVO — o aditivo precisa citar "o contrato firmado em
  // tal data", e hoje o PDF é montado do zero toda vez. Reusa a tabela
  // `fechamentos` (dados_snapshot + parent_id), que já existia parada.
  router.post('/leads/:id/contrato-congelar', exigir('propostas', 'editar'), async (req: Request, res: Response) => {
    const id = String(req.params.id);
    try {
      if (!UUID_RE.test(id)) return res.status(400).send('id inválido');
      const { getContrato } = await import('../closing/contratos-registry.js');
      const def = getContrato(tipoDaCentral(req.body?.tipo)) ?? getContrato('fv')!;
      if (!(await leadDaEmpresa(req, id))) return res.status(404).send('Lead não encontrado');

      // SALVA o que está na tela ANTES de carimbar. Sem isso, quem preenchesse o
      // formulário e clicasse direto em "este é o contrato que vale" congelaria os
      // dados VELHOS, em silêncio — e o aditivo citaria o contrato errado.
      await salvarFormulario(req, id, def);

      const { montarFechamentoAuto } = await import('../closing/fechamento-auto.js');
      const r = await montarFechamentoAuto(supabase, id, 'fv'); // o retrato é o do CONTRATO
      if (!r) return res.status(404).send('Lead não encontrado');

      const viewer = (req as AuthedRequest).dashUser;
      const { congelarContrato } = await import('../closing/contrato-vigente.js');
      await congelarContrato(supabase, id, r.dados, viewer?.nome ?? 'dashboard');

      if (viewer) await audit(supabase, { companyId: viewer.companyId, userId: viewer.id, entidade: 'lead', entidadeId: id, acao: 'contrato_congelado', valorNovo: String(r.dados.comercial.valor_total_brl) });
      await eventoContrato(req, id, def.tipo, 'congelado', {
        valor: r.dados.comercial.valor_total_brl,
        forma_pagamento: r.dados.comercial.forma_pagamento,
      });
      res.redirect(`/dashboard/leads/${id}/contrato-form?tipo=${encodeURIComponent(def.tipo)}&congelou=1`);
    } catch (err) {
      console.error('[dashboard/contrato-congelar]', err);
      res.status(500).send(`<h2>Erro ao congelar</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });

  // 💳 Calcula a tabela do cartão em cima do valor que está na tela. A conta é
  // feita AQUI (no servidor, pelo mesmo módulo dos testes) — nada de reescrever a
  // fórmula em JavaScript na página e ter duas verdades sobre dinheiro.
  router.post('/leads/:id/contrato-parcelas', exigir('propostas', 'visualizar'), async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      if (!UUID_RE.test(id)) return res.status(400).send('id inválido');
      const { CONTRATOS, getContrato, numeroBR } = await import('../closing/contratos-registry.js');
      const def = getContrato(tipoDaCentral(req.body?.tipo));
      if (!def) return res.status(400).send('Tipo de contrato desconhecido');
      if (!(await leadDaEmpresa(req, id))) return res.status(404).send('Lead não encontrado');

      const { montarFechamentoAuto } = await import('../closing/fechamento-auto.js');
      const r = await montarFechamentoAuto(supabase, id, def.tipo);
      if (!r) return res.status(404).send('Lead não encontrado');

      const valores = await valoresDaTela(def, r.cru, req.body);
      // No contrato, parcela o valor da venda. No ADITIVO, parcela o valor do
      // contrato congelado — é ele que o cliente vai repassar pro cartão.
      const valor = def.tipo === 'aditivo'
        ? (r.vigente?.dados.comercial?.valor_total_brl ?? numeroBR(valores.adit_valor_anterior ?? ''))
        : numeroBR(valores.com_valor ?? '');

      // A MESMA tabela que a proposta mostrou pro cliente. Nunca outra.
      const { tabelaCartaoSolar, frasePagamentoCartao } = await import('../closing/../proposal/cartao-solar.js');
      const tela = {
        leadId: id, nome: r.nome, def,
        tipos: CONTRATOS.map((c) => ({ tipo: c.tipo, nome: c.nome, emoji: c.emoji })),
        temProposta: r.temProposta,
        faltando: def.campos.filter((c) => c.obrigatorio && !valores[c.id]),
        valores,
        vigente: vigenteDaTela(r),
        user: (req as AuthedRequest).dashUser,
      };

      if (!valor || valor <= 0) {
        return res.send(renderContratoFormPage({ ...tela, parcelamentoSemValor: true }));
      }
      // A frase vem PRONTA daqui (frasePagamentoCartao, a mesma que os testes
      // cobrem) — a tela não remonta texto de dinheiro por conta própria.
      const linhas = tabelaCartaoSolar(valor).map((l) => ({
        parcelas: l.parcelas,
        parcela: l.parcela,
        total: l.total,
        frase: frasePagamentoCartao(valor, l.parcelas),
      }));
      res.send(renderContratoFormPage({ ...tela, parcelamento: { valor, linhas } }));
    } catch (err) {
      console.error('[dashboard/contrato-parcelas]', err);
      res.status(500).send(`<h2>Erro</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });

  // Salvar o formulário faz DUAS coisas, e é aí que o ecossistema se amarra:
  //  1. o que é dado do CLIENTE (CPF, RG, estado civil, endereço, UC...) vai pras
  //     colunas do lead — vale pra todo contrato, pra Eva e pro CRM;
  //  2. o que é daquele negócio (valor, sistema, combinados) vai pro rascunho
  //     leads.contrato_dados[tipo].
  // Campo em branco fica de fora dos dois: salvar nunca apaga o que já existia.
  // Grava o formulário: cadastro → colunas do lead; negócio → contrato_dados[tipo].
  // Usada pelo botão Salvar E pelo Congelar (que salva antes de congelar, senão
  // ele carimbaria os dados velhos de quem preencheu e clicou direto em congelar).
  async function salvarFormulario(
    req: Request,
    id: string,
    def: import('../closing/contratos-registry.js').DefinicaoContrato,
  ): Promise<string[]> {
    const { parseFormulario } = await import('../closing/contratos-registry.js');
    const { cadastro, rascunho } = parseFormulario(def, req.body ?? {});
    // Fatia 4 (strangler RLS): dado do tenant no client-do-operador.
    const db = bancoDoOperador(req as AuthedRequest, supabase);

    const { data: lead } = await db.from('leads').select('contrato_dados').eq('id', id).maybeSingle();
    const atual = (lead as { contrato_dados?: Record<string, unknown> } | null)?.contrato_dados;
    const base = atual && typeof atual === 'object' && !Array.isArray(atual) ? atual : {};

    const patch: Record<string, unknown> = {
      ...cadastro,
      contrato_dados: { ...base, [def.tipo]: rascunho },
      updated_at: new Date().toISOString(),
    };
    const { error } = await db.from('leads').update(patch).eq('id', id);
    if (error) throw error;

    const viewer = (req as AuthedRequest).dashUser;
    if (viewer) await audit(supabase, { companyId: viewer.companyId, userId: viewer.id, entidade: 'lead', entidadeId: id, acao: 'contrato_dados', valorNovo: def.tipo });
    return Object.keys(cadastro);
  }

  router.post('/leads/:id/contrato-form', exigir('propostas', 'editar'), async (req: Request, res: Response) => {
    const id = String(req.params.id);
    try {
      if (!UUID_RE.test(id)) return res.status(400).send('id inválido');
      const { getContrato } = await import('../closing/contratos-registry.js');
      const def = getContrato(tipoDaCentral(req.body?.tipo));
      if (!def) return res.status(400).send('Tipo de contrato desconhecido');
      if (!(await leadDaEmpresa(req, id))) return res.status(404).send('Lead não encontrado');

      const campos = await salvarFormulario(req, id, def);
      await eventoContrato(req, id, def.tipo, 'dados_conferidos', { campos_cadastro: campos });
      res.redirect(`/dashboard/leads/${id}/contrato-form?tipo=${encodeURIComponent(def.tipo)}&salvo=1`);
    } catch (err) {
      console.error('[dashboard/contrato-form/salvar]', err);
      res.status(500).send(`<h2>Erro ao salvar</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });

  // 📤 Entrega: gera o PDF e ENVIA pelo WhatsApp — pro cliente (lead.phone) ou
  // pro zap do Junior (engineerPhone). Upload buffer → media_id → sendDocumentById.
  router.post('/leads/:id/enviar-doc', exigir('propostas', 'editar'), async (req: Request, res: Response) => {
    const id = String(req.params.id);
    try {
      if (!UUID_RE.test(id)) return res.status(400).send('id inválido');
      // tipo_contrato vem do formulário (qualquer tipo da central); `tipo` é o
      // caminho antigo (contrato|procuracao) dos botões diretos.
      const tipo = tipoDaCentral(req.body?.tipo_contrato ?? req.body?.tipo);
      const destino = req.body?.destino === 'cliente' ? 'cliente' : 'eu';
      if (!(await leadDaEmpresa(req, id))) return res.status(404).send('Lead não encontrado');
      const meta = options.metaService;
      if (!meta) return res.redirect(voltarDoc(req, id, 'envio=off'));
      let to: string | null | undefined = options.engineerPhone;
      if (destino === 'cliente') {
        // Fatia 4 (strangler RLS): dado do tenant no client-do-operador.
        const db = bancoDoOperador(req as AuthedRequest, supabase);
        const { data: lead } = await db.from('leads').select('phone').eq('id', id).maybeSingle();
        to = (lead as { phone?: string } | null)?.phone ?? null;
      }
      if (!to) return res.redirect(voltarDoc(req, id, 'envio=semzap'));
      const doc = await gerarDocBuffer(id, tipo);
      if (!doc) return res.redirect(voltarDoc(req, id, 'envio=erro'));
      const filename = nomeDoArquivo(doc.arquivo, doc.nome);
      const up = await meta.uploadMedia(doc.pdf, 'application/pdf', filename);
      // A legenda sai do REGISTRO: o aditivo chegava no zap do cliente anunciado
      // como "Segue o contrato".
      const { getContrato } = await import('../closing/contratos-registry.js');
      const defEnvio = getContrato(tipo);
      const caption = defEnvio ? `${defEnvio.emoji} Segue ${defEnvio.nome.toLowerCase()}` : 'Segue o documento 📄';
      await meta.sendDocumentById(to, up.mediaId, filename, caption);
      await eventoContrato(req, id, tipo, 'enviado', { destino, campos_em_branco: doc.faltando });
      res.redirect(voltarDoc(req, id, `envio=ok-${destino}`));
    } catch (err) {
      console.error('[dashboard/enviar-doc]', err);
      res.redirect(voltarDoc(req, id, 'envio=erro'));
    }
  });
  // 📄 Tela dedicada de Contratos & Procurações: busca o cliente pelo nome e
  // mostra os botões (ler docs / gerar / enviar). Reusa as rotas por lead_id.
  router.get('/contratos', exigir('propostas', 'visualizar'), async (req: Request, res: Response) => {
    try {
      const q = String(req.query.q ?? '').trim();
      const buscou = q.length > 0;
      const cid = (req as AuthedRequest).dashUser?.companyId;
      const leadSel = String(req.query.lead ?? '').trim();
      const tipoSel = String(req.query.tipo ?? '').trim() || undefined;
      // Fatia 4 (strangler RLS): dado do tenant no client-do-operador.
      const db = bancoDoOperador(req as AuthedRequest, supabase);

      let resultados: ContratoCliente[] = [];
      if (buscou) {
        const { searchLeadByName } = await import('../closing/closing-data-fetcher.js');
        // filtra por empresa (searchLeadByName é company-blind por ser compartilhada
        // com a Eva) — não expor cliente de outra empresa na Central.
        const leads = (await searchLeadByName(db, q))
          .filter((l: any) => !cid || l.company_id === cid);
        resultados = leads.slice(0, 10).map((l: any) => ({
          leadId: l.id,
          nome: l.name ?? '(sem nome)',
          status: l.installation_status ?? l.status ?? null,
        }));
      }

      // Recentes = contratos JÁ FECHADOS (venda registrada), pela data do fechamento —
      // NÃO leads crus (Junior 15/07). Sempre carregado: popula o dropdown E os 2 cards
      // de acesso rápido. Filtro por company como o resto do dashboard.
      let rec = db
        .from('leads')
        .select('id, name, installation_status, contract_signed_at')
        .in('installation_status', CLIENTE_STATUSES)
        .is('archived_at', null)
        .order('contract_signed_at', { ascending: false, nullsFirst: false })
        .limit(20);
      if (cid) rec = rec.eq('company_id', cid);
      const { data: recData } = await rec;
      const recentes: ContratoCliente[] = (recData ?? []).map((l: any) => ({
        leadId: l.id,
        nome: l.name ?? '(sem nome)',
        status: l.installation_status ?? null,
      }));

      // Cliente escolhido no dropdown (?lead=) — valida empresa e pega nome/status.
      let selecionado: ContratoCliente | null = null;
      if (UUID_RE.test(leadSel) && (await leadDaEmpresa(req, leadSel))) {
        const { data: l } = await db
          .from('leads').select('id, name, installation_status, status').eq('id', leadSel).maybeSingle();
        if (l) selecionado = {
          leadId: (l as any).id,
          nome: (l as any).name ?? '(sem nome)',
          status: (l as any).installation_status ?? (l as any).status ?? null,
        };
      }

      const { CONTRATOS } = await import('../closing/contratos-registry.js');
      res.send(renderContratosPage({
        q, buscou, resultados, recentes, selecionado, tipoSel,
        tipos: CONTRATOS.map((c) => ({ tipo: c.tipo, nome: c.nome, emoji: c.emoji, descricao: c.descricao })),
        docsResultado: String(req.query.docs ?? ''),
        envioResultado: String(req.query.envio ?? ''),
        driveResultado: String(req.query.drive ?? ''),
        novoResultado: String(req.query.novo ?? ''),
        user: (req as AuthedRequest).dashUser,
      }));
    } catch (err) {
      console.error('[dashboard/contratos]', err);
      res.status(500).send(`<h2>Erro</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });

  // ➕ Criar contrato MANUAL: cria (ou reusa) o cadastro do cliente e cai DIRETO
  // no formulário do contrato pra preencher na mão. Não depende de proposta nem
  // de IA — é o caminho garantido (contrato é receita, não pode travar).
  router.post('/contratos/novo', exigir('propostas', 'editar'), async (req: Request, res: Response) => {
    try {
      const name = String(req.body?.name ?? '').trim();
      const phone = String(req.body?.phone ?? '').replace(/\D/g, '');
      if (!name || phone.length < 8) return res.redirect('/dashboard/contratos?novo=faltou');
      const cid = (req as AuthedRequest).dashUser?.companyId;
      const { CONTRATOS } = await import('../closing/contratos-registry.js');
      const tipo = CONTRATOS[0]?.tipo ?? 'fv';
      // Fatia 4 (strangler RLS): dado do tenant no client-do-operador.
      const db = bancoDoOperador(req as AuthedRequest, supabase);
      // Já existe cliente com esse telefone NA MINHA EMPRESA? REUSA (não trava, não
      // duplica). Filtra por company: telefone da MESMA pessoa pode ser cliente de
      // outra empresa — não pode reusar (nem travar) por causa dela.
      let lookup = db.from('leads').select('id').eq('phone', phone).limit(1);
      if (cid) lookup = lookup.eq('company_id', cid);
      const { data: existentes } = await lookup;
      let leadId = (existentes as Array<{ id?: string }> | null)?.[0]?.id;
      if (!leadId) {
        const r = await supabaseService.criarLeadAvulso({ name, phone, companyId: cid ?? null });
        if (!r.ok || !r.lead_id) return res.redirect('/dashboard/contratos?novo=erro');
        leadId = r.lead_id;
      }
      res.redirect(303, `/dashboard/leads/${leadId}/contrato-form?tipo=${encodeURIComponent(tipo)}`);
    } catch (err) {
      console.error('[dashboard/contratos/novo]', err);
      res.redirect('/dashboard/contratos?novo=erro');
    }
  });

  // ✅ Fechou! DIRETO da ficha do lead — registra a venda (Coração da Venda) sem
  // ter que ir na tela separada. Volta pra ficha.
  router.post('/leads/:id/fechou', exigir('propostas', 'editar'), async (req: Request, res: Response) => {
    const id = String(req.params.id);
    try {
      if (!UUID_RE.test(id)) return res.status(400).send('id inválido');
      if (!(await leadDaEmpresa(req, id))) return res.status(404).send('Lead não encontrado');
      const tipo = req.body?.tipo === 'servico' ? 'servico' : 'sistema';
      const valorReais = parseFloat(String(req.body?.valor ?? '').replace(',', '.'));
      const kwp = parseFloat(String(req.body?.kwp ?? ''));
      const data = String(req.body?.data ?? '').trim() || null;
      const r = await registrarVenda(supabase, {
        leadId: id, tipo,
        valorCents: Number.isFinite(valorReais) ? Math.round(valorReais * 100) : null,
        kwp: Number.isFinite(kwp) ? kwp : null,
        data, origem: 'dashboard-ficha',
      });
      const viewer = (req as AuthedRequest).dashUser;
      if (viewer && r.ok) await audit(supabase, { companyId: viewer.companyId, userId: viewer.id, entidade: 'lead', entidadeId: id, acao: 'venda', valorNovo: tipo });
      res.redirect(303, `/dashboard/leads/${id}`);
    } catch (err) {
      console.error('[dashboard/leads/fechou]', err);
      res.redirect(303, `/dashboard/leads/${id}`);
    }
  });

  // ☁️ Salva contrato + procuração no Drive/Workspace (pasta do cliente).
  router.post('/leads/:id/salvar-drive', exigir('propostas', 'editar'), async (req: Request, res: Response) => {
    const id = String(req.params.id);
    try {
      if (!UUID_RE.test(id)) return res.status(400).send('id inválido');
      if (!(await leadDaEmpresa(req, id))) return res.status(404).send('Lead não encontrado');
      if (!options.salvarContratoNoDrive) return res.redirect(voltarDoc(req, id, 'drive=off'));
      const { montarFechamentoAuto } = await import('../closing/fechamento-auto.js');
      const info = await montarFechamentoAuto(supabase, id);
      if (!info) return res.redirect(voltarDoc(req, id, 'drive=erro'));
      // O tipo que está na tela vai junto: o ADITIVO nunca era arquivado (o botão
      // salvava contrato+procuração chumbados).
      const tipoTela = tipoDaCentral(req.body?.tipo_contrato);
      const [contrato, procuracao, extra] = await Promise.all([
        gerarDocBuffer(id, 'fv'),
        gerarDocBuffer(id, 'procuracao'),
        tipoTela !== 'fv' && tipoTela !== 'procuracao' ? gerarDocBuffer(id, tipoTela) : Promise.resolve(null),
      ]);
      await options.salvarContratoNoDrive({
        nomeTitular: info.nome,
        cpfTitular: (info.dados.titular_uc as { cpf?: string }).cpf ?? '',
        version: 1,
        contratoPdf: contrato?.pdf,
        procuracaoPdf: procuracao?.pdf,
        extras: extra ? [{ nome: extra.arquivo, pdf: extra.pdf }] : undefined,
        dadosInputJson: JSON.stringify(info.dados),
      });
      await eventoContrato(req, id, tipoDaCentral(req.body?.tipo_contrato), 'no_drive', {});
      res.redirect(voltarDoc(req, id, 'drive=ok'));
    } catch (err) {
      console.error('[dashboard/salvar-drive]', err);
      res.redirect(voltarDoc(req, id, 'drive=erro'));
    }
  });

  router.get('/leads/:id/contrato.pdf', exigir('propostas', 'visualizar'), (req: Request, res: Response) => gerarDocPdf(req, res, 'fv'));
  router.get('/leads/:id/procuracao.pdf', exigir('propostas', 'visualizar'), (req: Request, res: Response) => gerarDocPdf(req, res, 'procuracao'));

  // 🤖 Sessão Contrato — IA lê conta de luz + CNH e preenche o cadastro
  // (CPF, RG, endereço, UC). Robusto: o que a IA não ler fica como está (não
  // sobrescreve com vazio). Depois é só gerar o contrato — os dados já vêm.
  router.post('/leads/:id/ler-documentos', exigir('propostas', 'editar'), upload.array('docs', 4), async (req: Request, res: Response) => {
    const id = String(req.params.id);
    try {
      if (!UUID_RE.test(id)) return res.status(400).send('id inválido');
      if (!(await leadDaEmpresa(req, id))) return res.status(404).send('Lead não encontrado');
      const files = ((req.files as Express.Multer.File[] | undefined) ?? []);
      if (files.length === 0) return res.redirect(voltarDoc(req, id, 'docs=vazio'));
      if (!options.anthropicApiKey) return res.redirect(voltarDoc(req, id, 'docs=off'));
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const anthropic = new Anthropic({ apiKey: options.anthropicApiKey });
      const { extrairDocsContrato } = await import('../closing/extrair-docs-contrato.js');
      const arquivos = files.map((f) => ({ base64: f.buffer.toString('base64'), mimeType: f.mimetype }));
      const d = await extrairDocsContrato(anthropic, arquivos);
      // Patch só com o que a IA leu (nunca sobrescreve dado bom com vazio).
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (d.cpf) patch.cpf_cnpj = d.cpf;
      if (d.rg) patch.rg = d.rg;
      if (d.orgao_emissor_rg) patch.orgao_emissor_rg = d.orgao_emissor_rg;
      if (d.data_nascimento) patch.data_nascimento = d.data_nascimento;
      // estado civil CANÔNICO na coluna (id: 'casado', 'uniao_estavel'...) — a IA
      // devolve "Casado(a)"; sem normalizar, telas que casam estrito pelo id (ex.:
      // cadastro do cliente) mostram vazio. idEstadoCivil resolve o texto no id.
      if (d.estado_civil) {
        const { idEstadoCivil } = await import('../closing/contratos-registry.js');
        patch.estado_civil = idEstadoCivil(d.estado_civil) || d.estado_civil;
      }
      if (d.uc_numero) patch.uc_numero = d.uc_numero;
      if (d.concessionaria) patch.concessionaria = d.concessionaria;
      if (d.endereco?.rua) patch.endereco_rua = d.endereco.rua;
      if (d.endereco?.numero) patch.endereco_numero = d.endereco.numero;
      if (d.endereco?.bairro) patch.neighborhood = d.endereco.bairro;
      if (d.endereco?.cidade) patch.city = d.endereco.cidade;
      if (d.endereco?.cep) patch.cep = d.endereco.cep;
      if (d.endereco?.uf) patch.uf = d.endereco.uf;
      const lidos = Object.keys(patch).filter((k) => k !== 'updated_at').length;
      if (lidos > 0) {
        // Fatia 4 (strangler RLS): dado do tenant no client-do-operador.
        const db = bancoDoOperador(req as AuthedRequest, supabase);
        await db.from('leads').update(patch).eq('id', id);
      }
      res.redirect(voltarDoc(req, id, `docs=${lidos}`));
    } catch (err) {
      console.error('[dashboard/ler-documentos]', err);
      res.redirect(voltarDoc(req, id, 'docs=erro'));
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

      // Fatia 4 (strangler RLS): rota de leitura no client-do-operador.
      const db = bancoDoOperador(req as AuthedRequest, supabase);
      const [resumo, visualizacoes] = await Promise.all([
        resumoVisualizacoesPorSlug(db, slug),
        listVisualizacoesPorSlug(db, slug, { incluir_preview: incluirPreview }),
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
      // Fatia 4 (strangler RLS): rota de leitura no client-do-operador.
      const db = bancoDoOperador(req as AuthedRequest, supabase);
      const visualizacoes = await listVisualizacoesPorSlug(db, slug, {
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
      // Fatia 4 (strangler RLS): rota de leitura no client-do-operador.
      const db = bancoDoOperador(req, supabase);
      const [linhas, agenda] = await Promise.all([
        listarClientesPosVenda(db, req.dashUser!.companyId),
        listarAgendaPosVenda(db, req.dashUser!.companyId),
      ]);
      res.type('text/html').send(renderPosVendaPage(linhas, req.dashUser, agenda));
    } catch (err) {
      console.error('[pos-venda] GET falhou:', (err as Error).message);
      res.status(500).type('text/html').send('<h2>Erro ao carregar Pós-venda</h2>');
    }
  });

  // "Agora não": o operador dispensa uma sugestão proativa -> grava a memória com
  // o snooze (o tipo some da tela pelo tempo de descanso). Best-effort no upsert.
  router.post('/pos-venda/sugestao/dispensar', exigir('usinas', 'editar'), async (req: AuthedRequest, res: Response) => {
    const leadId = String(req.body?.leadId ?? '').trim();
    const tipo = String(req.body?.tipo ?? '').trim();
    const TIPOS = ['geracao_saudavel', 'queda', 'marco', 'upgrade', 'contato'];
    if (!leadId || !TIPOS.includes(tipo)) {
      return res.status(400).json({ ok: false, error: 'leadId/tipo invalido' });
    }
    const agora = new Date();
    await supabaseService.upsertSugestaoMemoria({
      leadId, sistemaId: null, tipo, acao: 'dispensada',
      snoozedUntil: snoozeAte(tipo, agora), agoraIso: agora.toISOString(),
    });
    res.json({ ok: true });
  });

  // Copiloto de pós-venda: chat com a IA (escreve mensagem limpa) + salva histórico.
  // Espelha /leads/:id/ia-copiloto, mas com cérebro de pós-venda.
  router.post('/pos-venda/:leadId/copiloto', exigir('usinas', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    // [Gate B5 provisório] copiloto gasta IA da casa e redige em nome da Eva —
    // exclusivo EcoSun até virar item de plano do tenant.
    if (!podeDispararMensagens(req.dashUser?.companyId)) {
      return res.status(403).json({ erro: 'Copiloto ainda não está disponível pra sua empresa.' });
    }
    const leadId = String(req.params.leadId);
    if (!UUID_RE.test(leadId)) return res.status(400).json({ erro: 'id inválido' });
    const pergunta = String(req.body?.pergunta ?? '').trim();
    if (!pergunta) return res.status(400).json({ erro: 'Pergunta vazia.' });
    try {
      // Fatia 4 (strangler RLS): dado do tenant no client-do-operador.
      const db = bancoDoOperador(req, supabase);
      // Filtra por company (igual /pos-venda/:leadId/acao): não ler cliente de outra empresa.
      const { data: lead } = await db.from('leads').select('name, city')
        .eq('id', leadId).eq('company_id', req.dashUser!.companyId).maybeSingle();
      if (!lead) return res.status(404).json({ erro: 'Cliente não encontrado.' });
      // order antes do limit: cliente com várias usinas (ex: Superbom) -> pega a 1ª de forma determinística.
      const { data: sis } = await db.from('sistemas_clientes')
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
        const { data: ger } = await db.from('geracao_diaria')
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
    // [Gate B5 provisório] tenant edita cadastro, mas NUNCA dispara pela WABA da casa.
    if (!podeDispararMensagens(req.dashUser?.companyId)) {
      return res.status(403).json({ erro: 'Envio de mensagens ainda não está disponível pra sua empresa.' });
    }
    const leadId = String(req.params.leadId);
    if (!UUID_RE.test(leadId)) return res.status(400).json({ erro: 'id inválido' });
    if (!options.metaService) return res.status(500).json({ erro: 'WhatsApp não configurado.' });
    try {
      const { mapaBotaoTemplate, componenteNome, normalizarTelefone } = await import('./pos-venda-envio.js');
      const tipo = String(req.body?.tipo ?? '');
      const template = mapaBotaoTemplate(tipo);
      if (!template) return res.status(400).json({ erro: 'Ação sem template (ex: contato não envia).' });

      const companyId = req.dashUser!.companyId;
      // Fatia 4 (strangler RLS): dado do tenant no client-do-operador.
      const db = bancoDoOperador(req, supabase);
      const { data: lead } = await db.from('leads').select('name, phone')
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
        const { data: sistema } = await db.from('sistemas_clientes').select('id')
          .eq('lead_id', leadId).eq('ativo', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
        if (sistema) {
          await registrarAbordagemManual(supabase, {
            sistemaId: (sistema as { id: string }).id, leadId, tipo: MAP_EVA[tipo],
            mensagem: `[template ${template} enviado pela plataforma]`,
          });
        }
      }
      // Memória: envio de template também é "atender aquela situação" -> entra em
      // descanso (não re-sugere logo). Depoimento fica de fora (é botão manual, não
      // uma das situações proativas). O upsert engole erro: não bloqueia o envio.
      const TPL_SITUACAO: Record<string, string> = {
        relatorio: 'geracao_saudavel', parabens: 'marco', limpeza: 'queda', upgrade: 'upgrade', contato: 'contato',
      };
      const situacao = TPL_SITUACAO[tipo];
      if (situacao) {
        const agoraMem = new Date();
        await supabaseService.upsertSugestaoMemoria({
          leadId, sistemaId: null, tipo: situacao, acao: 'enviada',
          snoozedUntil: snoozeAte(situacao, agoraMem), agoraIso: agoraMem.toISOString(),
        });
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
    // [Gate B5 provisório] tenant edita cadastro, mas NUNCA dispara pela WABA da casa.
    if (!podeDispararMensagens(req.dashUser?.companyId)) {
      return res.status(403).json({ erro: 'Envio de mensagens ainda não está disponível pra sua empresa.' });
    }
    const leadId = String(req.params.leadId);
    if (!UUID_RE.test(leadId)) return res.status(400).json({ erro: 'id inválido' });
    if (!options.metaService) return res.status(500).json({ erro: 'WhatsApp não configurado.' });
    const texto = String(req.body?.texto ?? '').trim();
    if (!texto) return res.status(400).json({ erro: 'Mensagem vazia.' });
    try {
      const { normalizarTelefone } = await import('./pos-venda-envio.js');
      const companyId = req.dashUser!.companyId;
      // Fatia 4 (strangler RLS): dado do tenant no client-do-operador.
      const db = bancoDoOperador(req, supabase);
      const { data: lead } = await db.from('leads').select('phone')
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
      // Fatia 4 (strangler RLS): dado do tenant no client-do-operador.
      const db = bancoDoOperador(req, supabase);
      const { data: lead } = await db.from('leads')
        .select('id, name, phone, company_id').eq('id', leadId).eq('company_id', companyId).maybeSingle();
      if (!lead) { res.status(404).json({ error: 'lead não encontrado' }); return; }
      const leadRow = lead as { id: string; name: string | null; phone: string | null };
      const { data: sistema } = await db.from('sistemas_clientes')
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

      let mes: { kwh: number; reais: number; mesLabel: string; parcial: boolean } | null = null;
      if (sistemaRow) {
        const { data: ger } = await db.from('geracao_diaria')
          .select('data, geracao_kwh').eq('sistema_id', sistemaRow.id)
          .gte('data', new Date(Date.now() - 62 * 86400000).toISOString().slice(0, 10));
        mes = numerosMes((ger ?? []).map((g: any) => ({ data: g.data, geracao_kwh: Number(g.geracao_kwh) })), TARIFA_RS_KWH, new Date());
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
            dados: { percentualQueda: null, diasOffline: null, mes: tipo === 'relatorio' ? mes : null, causaRaizAnterior: null },
            regrasTreino: [], ajusteDoJunior: null, mensagemAnterior: null,
          });
        } catch (e) {
          console.warn('[pos-venda] redator falhou, usando fallback:', (e as Error).message);
        }
      }
      if (!mensagem) mensagem = fallbackMensagem(tipo, { nome: leadRow.name ?? 'cliente', mes: tipo === 'relatorio' ? mes : null });

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
      // Fatia 4 (strangler RLS): dado do tenant no client-do-operador.
      const db = bancoDoOperador(req, supabase);
      const { data: lead } = await db.from('leads').select('id')
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
      // Fatia 4 (strangler RLS): dado do tenant no client-do-operador.
      const db = bancoDoOperador(req, supabase);
      const leadId = await leadDaTarefaNaCompany(db, id, req.dashUser!.companyId);
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
      // Fatia 4 (strangler RLS): dado do tenant no client-do-operador.
      const db = bancoDoOperador(req, supabase);
      const leadId = await leadDaTarefaNaCompany(db, id, req.dashUser!.companyId);
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
      // Fatia 4 (strangler RLS): dado do tenant no client-do-operador.
      const db = bancoDoOperador(req, supabase);
      const { data: lead } = await db.from('leads').select('id')
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
      // Fatia 4 (strangler RLS): dado do tenant no client-do-operador.
      const db = bancoDoOperador(req, supabase);
      const { data: lead } = await db.from('leads').select('id')
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
      // [Fase 2 A3] só as usinas da EMPRESA do operador (Sabion não vê EcoSun
      // e vice-versa — o serviço filtra por company_id).
      const sistemas = await monitoringService.listarParaDashboard((req as AuthedRequest).dashUser?.companyId ?? null);
      const hoje = new Date();
      // Régua relativa (29/07): a lista já é da empresa do operador — a
      // mediana de kWh/kWp desta carteira vira a referência de queda.
      const medianaCarteira = medianaEspecifica7d(sistemas.map((s) => ({
        potenciaKwp: s.potencia_kwp, realUltimos7: s.geracao_7d_kwh ?? 0,
      })));
      const enriched = sistemas.map((s) => {
        const cls = classificarSistema({
          ativo: s.ativo,
          ultimoErro: s.ultimo_erro ?? null,
          potenciaKwp: s.potencia_kwp,
          uf: s.uf,
          // 7d completos zerados E nada hoje = parada; usina que estreia/volta
          // HOJE tem 7d=0 mas hoje>0 — não é offline (achado reviews 29/07).
          diasSemGeracao: (s.geracao_7d_kwh ?? 0) === 0 && (s.geracao_hoje_kwh ?? 0) === 0 && s.ativo ? 7 : 0,
          realUltimos7: s.geracao_7d_kwh ?? 0,
          // 084/085: motivo no card + régua da empresa dona da usina
          statusInversor: (s.status_inversor as 'ok' | 'offline' | 'falha' | 'desconhecido' | null | undefined) ?? null,
          corteAtencao: empresaDe(s.company_id).reguaAtencaoPct / 100,
          medianaCarteira7d: medianaCarteira,
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
        // Board filtrado por status (pedido Thiago 28/07) — só a view usa;
        // filtrarOrdenarSistemas ignora (a tabela tem o filtro `status` dela).
        painel: typeof req.query.painel === 'string' ? req.query.painel : undefined,
      };
      const filtered = filtrarOrdenarSistemas(enriched as any, qf);
      // KPIs GLOBAIS da operação EcoSun (alertas proativos + Eva no mês): as
      // queries são SEM filtro de empresa — só entram na tela da PRÓPRIA
      // EcoSun. Tenant não vê agregado de outra casa (achado na degustação
      // Sabion 27/07: os números da EcoSun vazavam na tela do Sabion).
      const ehEcosun = (req as AuthedRequest).dashUser?.companyId === ECOSUN;
      const { getAlertasAtivosResumo, getAlertasEnviadosUltimos7d } = await import('./queries.js');
      const [alertasResumo, sparkline7d, kpisEva] = ehEcosun
        ? await Promise.all([
            getAlertasAtivosResumo(supabase),
            getAlertasEnviadosUltimos7d(supabase),
            getKPIsAbordagemMes(supabase).catch(() => undefined),
          ])
        : [undefined, undefined, undefined];
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
    } else if (marca === 'goodwe') {
      // Campos renomeados pra goodwe_* pra nao colidir com email/password do
      // Deye ao alternar entre branches do select.
      const email = String(req.body?.goodwe_email ?? '').trim();
      const password = String(req.body?.goodwe_password ?? '').trim();
      if (!email || !password) {
        return res.status(400).send(renderImportarSitesPage({
          errorMsg: 'GoodWe precisa de e-mail e senha da conta SEMS Portal (login do instalador).',
        }));
      }
      credenciais = { email, password };
    } else if (marca === 'solis') {
      const keyId = String(req.body?.solis_key_id ?? '').trim();
      const keySecret = String(req.body?.solis_key_secret ?? '').trim();
      const apiUrl = String(req.body?.solis_api_url ?? '').trim();
      if (!keyId || !keySecret) {
        return res.status(400).send(renderImportarSitesPage({
          errorMsg: 'Solis precisa de KeyId e KeySecret (gere no app SolisCloud → Gerenciamento de API).',
        }));
      }
      credenciais = { keyId, keySecret };
      if (apiUrl) credenciais.apiUrl = apiUrl;
    } else if (marca === 'sungrow') {
      // Sungrow é OAuth2: appkey + secret (x-access-key) + o código de
      // autorização (uso único) que sai no redirect ao autorizar o app. O
      // adapter troca o code por refresh_token na 1a importação (bootstrap).
      const appkey = String(req.body?.sungrow_appkey ?? '').trim();
      const accessKey = String(req.body?.sungrow_secret ?? '').trim();
      const appId = String(req.body?.sungrow_app_id ?? '').trim();
      const redirectUri = String(req.body?.sungrow_redirect ?? '').trim();
      const code = String(req.body?.sungrow_code ?? '').trim();
      if (!appkey || !accessKey || !redirectUri || !code) {
        return res.status(400).send(renderImportarSitesPage({
          errorMsg: 'Sungrow precisa de Appkey, Secret key, a Redirect URL e o código de autorização (gere autorizando o app SÓ-Monitoring).',
        }));
      }
      credenciais = { appkey, accessKey, redirectUri, code };
      if (appId) credenciais.appId = appId;
    } else if (marca === 'saj') {
      // Campos saj_* pra nao colidir com username/password de outros branches.
      const username = String(req.body?.saj_username ?? '').trim();
      const password = String(req.body?.saj_password ?? '').trim();
      if (!username || !password) {
        return res.status(400).send(renderImportarSitesPage({
          errorMsg: 'SAJ precisa de usuário e senha do portal elekeeper/eSolar (login do instalador).',
        }));
      }
      credenciais = { username, password };
    } else {
      return res.status(400).send(renderImportarSitesPage({
        errorMsg: `Marca ${marca} ainda nao tem adapter implementado.`,
      }));
    }

    try {
      // [Fase 2 A3] usinas importadas nascem na EMPRESA DO OPERADOR logado —
      // o admin do tenant importando a conta dele cria as usinas DELE.
      const companyDoOperador = (req as AuthedRequest).dashUser?.companyId ?? null;

      // [Fatia 3b assinaturas] Trava do patamar: empresa com plano limitado
      // (ex: fundador 110 usinas) não importa acima do limite. Fluxo do Junior:
      // atingiu o patamar → aviso (zap pro Junior) → upgrade de plano na tela.
      if (companyDoOperador) {
        const { infoLimiteMonitoramento, contarUsinasAtivas } = await import('./assinaturas-store.js');
        const plano = await infoLimiteMonitoramento(supabase, companyDoOperador);
        if (plano) {
          const uso = await contarUsinasAtivas(supabase, companyDoOperador);
          if (uso >= plano.limite) {
            if (options.sendText && options.engineerPhone) {
              options.sendText(options.engineerPhone,
                `📈 ${plano.nome} bateu o patamar do plano (${uso}/${plano.limite} usinas) e tentou importar mais. Hora do upgrade! (editar valor+limite na tela Assinaturas)`,
              ).catch(() => { /* best-effort */ });
            }
            return res.status(400).send(renderImportarSitesPage({
              errorMsg: `Seu plano vai até ${plano.limite} usinas (você já tem ${uso}). Fale com a EcoSun pra ampliar o plano — liberamos na hora.`,
            }));
          }
        }
      }

      const result = await monitoringService.importarSitesEmMassa(marca, credenciais, companyDoOperador);
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
    // Calendario: ?vista=dia|mes|ano&ref=YYYY-MM-DD (default mes, hoje).
    const vistasOk = ['dia', 'mes', 'ano'] as const;
    const vista = (vistasOk as readonly string[]).includes(String(req.query.vista))
      ? String(req.query.vista) as 'dia' | 'mes' | 'ano'
      : 'mes';
    const refQ = typeof req.query.ref === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.ref)
      ? req.query.ref
      : new Date().toISOString().slice(0, 10);

    try {
      const detalhe = await monitoringService.getDetalheCalendario(id, { vista, ref: refQ });
      // [Degustação Sabion 27/07] usina só abre pra empresa dona — a lista já
      // filtrava, mas o detalhe abria pra qualquer logado com o link.
      if (!detalhe || !usinaPertenceAoOperador(detalhe.sistema.company_id ?? null, (req as AuthedRequest).dashUser?.companyId)) {
        return res.status(404).send('<h2>Sistema nao encontrado</h2><a href="/dashboard/monitoramento">← voltar</a>');
      }

      // Vista Dia: curva de potencia AO VIVO (fetchIntraday). Degrada com aviso
      // se o adapter nao suporta ou a chamada falha — nunca derruba a pagina.
      let curvaDia: import('../monitoring/types.js').IntradayPonto[] | null = null;
      let curvaMsg: string | null = null;
      if (vista === 'dia') {
        const adapter = getAdapter(detalhe.sistema.marca_inversor);
        if (adapter?.fetchIntraday) {
          try {
            const r = await adapter.fetchIntraday(detalhe.sistema.api_credentials, refQ, monitoringService.buildAdapterContext(detalhe.sistema));
            if (r.ok && r.pontos.length > 0) curvaDia = r.pontos;
            else curvaMsg = (!r.ok && r.reason) ? r.reason : 'Sem curva pra esse dia.';
          } catch { curvaMsg = 'Não consegui buscar a curva agora.'; }
        } else {
          curvaMsg = 'Curva minuto a minuto não disponível para este inversor.';
        }
      }

      const donoLeadId = detalhe.sistema.lead_id;
      const [donoRow, timelineAbordagens, prontuario] = await Promise.all([
        donoLeadId ? supabaseService.getClienteByLeadId(donoLeadId) : Promise.resolve(null),
        getTimelineAbordagens(supabase, id).catch(() => [] as import('./queries.js').AbordagemTimelineRow[]),
        prontuarioUsina(supabase, id).catch(() => []),
      ]);
      res.send(renderDetalheSistemaPage(detalhe, curvaDia, curvaMsg, donoRow ? { id: donoRow.id, name: donoRow.name } : null, timelineAbordagens, renderProntuario(prontuario), (req as AuthedRequest).dashUser));
    } catch (err) {
      console.error('[dashboard/monitoramento/detalhe]', err);
      res.status(500).send(`<h2>Erro ao carregar detalhe</h2><pre>${(err as Error).message}</pre>`);
    }
  });

  // Tela "Dados" — telemetria completa (tensão/corrente/potência/etc no tempo).
  router.get('/monitoramento/:id/dados', async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).send('UUID invalido');
    try {
      const db = bancoDoOperador(req as AuthedRequest, supabase);
      const { data: sistema } = await db.from('sistemas_clientes').select('id,apelido,marca_inversor').eq('id', id).maybeSingle();
      if (!sistema) return res.status(404).send('<h2>Sistema nao encontrado</h2><a href="/dashboard/monitoramento">← voltar</a>');

      const { devices, grandezas } = await telemetriaService.listarGrandezas(id, (sistema as { marca_inversor: string }).marca_inversor);
      const periodosOk = ['dia', 'semana', 'mes'] as const;
      const periodo = (periodosOk as readonly string[]).includes(String(req.query.periodo)) ? String(req.query.periodo) as 'dia' | 'semana' | 'mes' : 'dia';
      const device = typeof req.query.device === 'string' && devices.includes(req.query.device) ? req.query.device : (devices[0] ?? '');
      const ponto = typeof req.query.ponto === 'string' && grandezas.some((g) => g.ponto === req.query.ponto) ? req.query.ponto : (grandezas[0]?.ponto ?? '');

      const diasAtras = periodo === 'dia' ? 1 : periodo === 'semana' ? 7 : 30;
      const inicioIso = new Date(Date.now() - diasAtras * 24 * 60 * 60 * 1000).toISOString();
      const serie = (device && ponto) ? await telemetriaService.serieTelemetria(id, device, ponto, inicioIso) : [];

      res.send(renderTelemetriaPage(sistema as { id: string; apelido: string }, devices, grandezas, { device, ponto, periodo }, serie, (req as AuthedRequest).dashUser));
    } catch (err) {
      console.error('[dashboard/monitoramento/dados]', err);
      res.status(500).send(`<h2>Erro ao carregar dados</h2><pre>${(err as Error).message}</pre>`);
    }
  });

  // Editar dados detalhados do sistema (paineis, telhado, etc).
  router.get('/monitoramento/:id/editar', async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).send('UUID invalido');
    const detalhe = await monitoringService.getDetalheSistema(id);
    // [Degustação Sabion 27/07] editar tambem so pra empresa dona da usina.
    if (!detalhe || !usinaPertenceAoOperador(detalhe.sistema.company_id ?? null, (req as AuthedRequest).dashUser?.companyId)) {
      return res.status(404).send('<h2>Sistema nao encontrado</h2><a href="/dashboard/monitoramento">← voltar</a>');
    }
    const leadId = detalhe.sistema.lead_id;
    const donoRow = leadId ? await supabaseService.getClienteByLeadId(leadId) : null;
    const dono = donoRow ? { id: donoRow.id, name: donoRow.name, phone: donoRow.phone } : null;
    res.send(renderEditarSistemaPage(detalhe.sistema, dono, (req as AuthedRequest).dashUser));
  });

  router.post('/monitoramento/:id/editar', async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).send('UUID invalido');
    // [Degustação Sabion 27/07] gravar tambem so pra empresa dona da usina.
    const sisDono = await supabaseService.getSistemaById(id);
    if (!sisDono || !usinaPertenceAoOperador((sisDono.company_id as string | null) ?? null, (req as AuthedRequest).dashUser?.companyId)) {
      return res.status(404).send('<h2>Sistema nao encontrado</h2><a href="/dashboard/monitoramento">← voltar</a>');
    }
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
      // [Degustação Sabion 27/07] busca presa à empresa do operador — rodava
      // sem filtro e o tenant via nome/telefone dos clientes da EcoSun.
      const rows = await supabaseService.searchClientesParaVinculo(q, (req as AuthedRequest).dashUser?.companyId, 10);
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
    // [Degustação Sabion 27/07] backfill so pra empresa dona da usina.
    const sisDono = await supabaseService.getSistemaById(id);
    if (!sisDono || !usinaPertenceAoOperador((sisDono.company_id as string | null) ?? null, (req as AuthedRequest).dashUser?.companyId)) {
      return res.status(404).send('<h2>Sistema nao encontrado</h2><a href="/dashboard/monitoramento">← voltar</a>');
    }
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
    // [Degustação Sabion 27/07] sync manual so pra empresa dona da usina.
    const sisDono = await supabaseService.getSistemaById(id);
    if (!sisDono || !usinaPertenceAoOperador((sisDono.company_id as string | null) ?? null, (req as AuthedRequest).dashUser?.companyId)) {
      return res.status(404).send('<h2>Sistema nao encontrado</h2><a href="/dashboard/monitoramento">← voltar</a>');
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
      if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).send('UUID invalido');
      // [Degustação Sabion 27/07] relatório só pra empresa dona da usina; e
      // usina de tenant sai com a marca NEUTRA dele (sem logo/CNPJ da casa).
      const sisDono = await supabaseService.getSistemaById(id);
      if (!sisDono || !usinaPertenceAoOperador((sisDono.company_id as string | null) ?? null, (req as AuthedRequest).dashUser?.companyId)) {
        return res.status(404).send('<h2>Sistema nao encontrado</h2><a href="/dashboard/monitoramento">← voltar</a>');
      }
      const { resolverMarcaRelatorio } = await import('../monitoring/relatorio/marca.js');
      const marca = await resolverMarcaRelatorio(supabaseService.getClient(), (sisDono.company_id as string | null) ?? null);
      // [Decisão do Junior 27/07] usina de TENANT não ganha link público — o
      // endereço é da casa (propostas.ecosunpower...) e apareceria pro cliente
      // do tenant. Sai SÓ O PDF (neutro), direto no navegador. Link com
      // domínio próprio = item do plano white-label (Junior oferece no zap).
      if (marca) {
        const { montarDadosRelatorio } = await import('../monitoring/relatorio/dados.js');
        const { renderRelatorioHtml } = await import('../monitoring/relatorio/template.js');
        const dados = await montarDadosRelatorio(
          { getDetalhe: (sid: string) => monitoringService.getDetalheSistema(sid) }, id, 'acompanhamento');
        if ('erro' in dados) {
          return res.status(500).send(`<h2>Erro ao gerar relatório</h2><pre>${escapeHtmlSimple(dados.erro)}</pre><a href="/dashboard/monitoramento">← voltar</a>`);
        }
        const pdf = await htmlToPdf(renderRelatorioHtml(dados, 'acompanhamento', undefined, marca));
        res.type('application/pdf').set('Content-Disposition', 'inline; filename="relatorio-usina.pdf"').send(pdf);
        return;
      }
      const r = await gerarRelatorio({
        getDetalhe: (sid: string) => monitoringService.getDetalheSistema(sid),
        criarSlug: (sid: string) => supabaseService.criarRelatorioSlug(sid),
        htmlToPdf,
        gerarQr: gerarQrCodeDataUrl,
        baseUrl: process.env.PUBLIC_BASE_URL ?? 'https://propostas.ecosunpower.eng.br',
        logoBase64: await obterLogoBase64(supabaseService.getClient()),
        marca,
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
      // Fatia 4 (strangler RLS): rota de leitura no client-do-operador.
      const db = bancoDoOperador(req, supabase);
      const [agenda, leiturasPendentes, usinasRes] = await Promise.all([
        listarAgenda(db),
        listarLeiturasPendentes(db),
        db.from('sistemas_clientes').select('id, apelido').eq('ativo', true).order('apelido'),
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
      // Fatia 4 (strangler RLS): dado do tenant no client-do-operador.
      const db = bancoDoOperador(req, supabase);
      const { data: s } = await db.from('sistemas_clientes').select('lead_id').eq('id', sistemaId).maybeSingle();
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
      // Fatia 4 (strangler RLS): dado do tenant no client-do-operador.
      const db = bancoDoOperador(req, supabase);
      const { data: m } = await db.from('manutencoes').select('lead_id, tipo').eq('id', id).maybeSingle();
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
      // Fatia 4 (strangler RLS): rota de leitura no client-do-operador.
      const db = bancoDoOperador(req, supabase);
      const { data, error } = await db
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
      // Fatia 4 (strangler RLS): dado do tenant no client-do-operador.
      const db = bancoDoOperador(req, supabase);
      const [usinasRes, leadsRes] = await Promise.all([
        db.from('sistemas_clientes')
          .select('id, apelido').eq('ativo', true).is('lead_id', null).order('apelido'),
        db.from('leads')
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
      // Fatia 4 (strangler RLS): dado do tenant no client-do-operador.
      const db = bancoDoOperador(req, supabase);
      // Defesa multi-empresa: só aceita vincular a leads da própria company.
      // (sistemas_clientes não tem company_id; o vínculo é o que define a dona.)
      const leadIds = [...new Set(pares.map((p) => p.leadId))];
      const { data: leadsValidos } = leadIds.length
        ? await db.from('leads').select('id').eq('company_id', viewer.companyId).in('id', leadIds)
        : { data: [] as Array<{ id: string }> };
      const idsValidos = new Set((leadsValidos ?? []).map((l: any) => l.id));
      const paresOk = pares.filter((p) => idsValidos.has(p.leadId));
      let aplicados = 0;
      for (const { usinaId, leadId } of paresOk) {
        const { error } = await db.from('sistemas_clientes')
          .update({ lead_id: leadId, etapa_obra: 'pos_venda', etapa_obra_updated_at: new Date().toISOString() })
          .eq('id', usinaId).eq('ativo', true);
        if (error) { console.warn(`[usinas/vincular] ${usinaId} falhou: ${error.message}`); continue; }
        aplicados++;
        await audit(supabase, {
          companyId: viewer.companyId, userId: viewer.id, entidade: 'usina',
          entidadeId: usinaId, acao: 'vincular_cliente', valorNovo: leadId,
        });
        // Elo (casa Pós-venda/Relacionamento): a usina virou cliente e entrou no
        // pós-venda. Fecha a última casa que faltava na espinha. Best-effort.
        await registrarEvento(supabase, {
          tipo: 'relacionamento:cliente_novo',
          departamento: 'relacionamento',
          canal: 'sistema',
          origem: 'crm',
          clienteId: leadId,
          payload: { usinaId },
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
      // Fatia 4 (strangler RLS): dado do tenant no client-do-operador.
      const db = bancoDoOperador(req, supabase);
      const { data: s } = await db.from('sistemas_clientes').select('lead_id').eq('id', sistemaId).maybeSingle();
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

  // [Fase 2 A3½] /clientes e /cerebro ainda leem pelo SERVIÇO (refactor de
  // injeção pendente — "shape errado" do 05/07): pra um TENANT essas telas
  // mostrariam dados da EcoSun. Até a migração, ficam EcoSun-only com aviso
  // honesto (o menu já esconde; isto cobre URL digitada na mão).
  const soEcosunPorEnquanto = (req: Request, res: Response, next: () => void): void => {
    const u = (req as AuthedRequest).dashUser;
    if (u && u.companyId !== ECOSUN) {
      res.status(403).type('html').send(
        '<div style="font-family:sans-serif;text-align:center;padding:60px 20px;color:#334155">'
        + '<h2>🔒 Em breve para a sua empresa</h2>'
        + '<p>Esta área ainda está sendo preparada no ambiente multi-empresa.</p>'
        + '<a href="/dashboard/cockpit">← voltar ao painel</a></div>',
      );
      return;
    }
    next();
  };
  router.use('/clientes', soEcosunPorEnquanto);
  router.use('/cerebro', soEcosunPorEnquanto);

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
          // [B1b] proposta nasce na EMPRESA do operador (marca/carimbo do tenant)
          companyId: (req as AuthedRequest).dashUser?.companyId ?? null,
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
        const result = await options.proposalAssistant.generateProposalCore({ data: parsed.data, modoEnvio: 'junior_envia', tipo: parsed.tipo, attachments, companyId: (req as AuthedRequest).dashUser?.companyId ?? null });
        return res.redirect(303, `/dashboard/propostas/${result.slug}/preview?lead_id=`);
      }
      // Reabrir "atualizar essa": preserva o número da proposta original.
      const orig = await supabaseService.getPropostaInputBySlug(slug);
      // Campos que o FORM não edita (vêm da Eva): sem este merge, salvar pelo
      // dashboard APAGAVA observações/serviços/bateria/comparação/remoto da
      // proposta original EM SILÊNCIO (achado de review 21/07). O form manda
      // undefined pra eles — se um dia o form ganhar o campo, o form vence.
      {
        const di = (orig?.dadosInput ?? {}) as Record<string, unknown>;
        const alvo = parsed.data as Record<string, unknown>;
        for (const k of ['observacoes', 'observacao', 'servicos', 'bateria', 'comparacao', 'consumoRemotoMensalKwh', 'consumoRemotoRestante']) {
          if (alvo[k] === undefined && di[k] !== undefined) alvo[k] = di[k];
        }
      }
      await options.proposalAssistant.generateProposalCore({ data: parsed.data, modoEnvio: 'junior_envia', tipo: parsed.tipo, attachments, reopenSlug: slug, numeroProposta: orig?.numeroProposta, companyId: (req as AuthedRequest).dashUser?.companyId ?? null });
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
      // Fatia 4 (strangler RLS): rota de leitura no client-do-operador.
      const db = bancoDoOperador(req, supabase);
      const data = await getFinanceiroData(db, parseFiltrosFinanceiro(req.query));
      res.type('text/html').send(renderFinanceiroPage(data, req.dashUser));
    } catch (err) {
      res.status(500).type('text/html').send(`<h2>Erro</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });

  router.get('/financeiro/data', exigir('financeiro', 'visualizar'), async (req: AuthedRequest, res) => {
    try {
      const { getFinanceiroData } = await import('./financeiro-queries.js');
      // Fatia 4 (strangler RLS): rota de leitura no client-do-operador.
      const db = bancoDoOperador(req as AuthedRequest, supabase);
      res.json(await getFinanceiroData(db, parseFiltrosFinanceiro(req.query)));
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ============================================
  // Cérebro do Elo: tela viva full-screen (sem sidebar, feita pra
  // apresentação) + "Pergunte ao Elo" ancorado no snapshot real.
  // ============================================

  router.get('/cerebro', exigir('relatorios', 'visualizar'), async (_req: Request, res: Response) => {
    try {
      const { montarSnapshotElo } = await import('./cerebro-data.js');
      const { montarFalasElo } = await import('./cerebro-elo.js');
      const { renderCerebroPage } = await import('./cerebro-views.js');
      const snap = await montarSnapshotElo(supabaseService);
      const falas = montarFalasElo(snap);
      res.type('text/html').send(renderCerebroPage(snap, falas));
    } catch (err) {
      console.error('[dashboard/cerebro]', err);
      res.status(500).type('text/html').send(`<h2>Erro Cérebro</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });

  router.post('/cerebro/perguntar', exigir('relatorios', 'visualizar'), async (req: Request, res: Response) => {
    const pergunta = String(req.body?.pergunta ?? '').slice(0, 500);
    let resposta = 'Não entendi, pode repetir?';
    try {
      if (!options.anthropicApiKey) {
        resposta = 'IA não configurada neste ambiente.';
      } else {
        const { montarSnapshotElo } = await import('./cerebro-data.js');
        const { responderComoElo } = await import('./cerebro-elo.js');
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const anthropic = new Anthropic({ apiKey: options.anthropicApiKey });
        const snap = await montarSnapshotElo(supabaseService);
        const viewer = (req as AuthedRequest).dashUser;
        // Memória do Elo: pega as últimas trocas desse usuário pra dar contexto.
        const { getMemoriaRecenteElo, salvarMemoriaElo } = await import('./cerebro-memoria.js');
        const historico = await getMemoriaRecenteElo(supabaseService, viewer?.id);
        resposta = await responderComoElo(anthropic, pergunta, snap, {
          isCeo: !!viewer?.isAdmin,
          nome: viewer?.nome,
          historico,
        });
        // guarda a troca pra o Elo lembrar na próxima (best-effort, não bloqueia).
        void salvarMemoriaElo(supabaseService, { userId: viewer?.id, quem: viewer?.nome, pergunta, resposta });
      }
    } catch (err) {
      console.warn('[cerebro-perguntar]', (err as Error)?.message);
    }
    res.json({ resposta });
  });

  // ===== Cofre de Custos (camuflado no Elo) — SÓ CEO/admin + PIN =====
  // Dado sensível: o custo NUNCA entra no snapshot público do Elo. Só sai por
  // aqui, e só se: (1) usuário logado é admin (isAdmin) E (2) o PIN bate com
  // CUSTOS_PIN (env). Sem CUSTOS_PIN setado, o cofre fica fechado (403).
  router.post('/cerebro/custos', exigir('relatorios', 'visualizar'), async (req: Request, res: Response) => {
    const viewer = (req as AuthedRequest).dashUser;
    const pin = String(req.body?.pin ?? '');
    const esperado = process.env.CUSTOS_PIN ?? '';
    if (!viewer?.isAdmin || !esperado || pin !== esperado) {
      res.status(403).json({ erro: 'acesso negado' });
      return;
    }
    try {
      const { montarCustosMes } = await import('./custos-data.js');
      const custos = await montarCustosMes(supabaseService);
      res.json(custos);
    } catch (err) {
      console.warn('[cerebro-custos]', (err as Error)?.message);
      res.status(500).json({ erro: 'falha ao montar custos' });
    }
  });

  // Cadastrar um custo fixo (servidor/assinatura) — mesmo cofre (admin + PIN).
  router.post('/cerebro/custos/fixo', exigir('relatorios', 'visualizar'), async (req: Request, res: Response) => {
    const viewer = (req as AuthedRequest).dashUser;
    const pin = String(req.body?.pin ?? '');
    const esperado = process.env.CUSTOS_PIN ?? '';
    if (!viewer?.isAdmin || !esperado || pin !== esperado) {
      res.status(403).json({ erro: 'acesso negado' });
      return;
    }
    const nome = String(req.body?.nome ?? '').slice(0, 80).trim();
    const valorReais = Number(req.body?.valor);
    if (!nome || !(valorReais > 0)) {
      res.status(400).json({ erro: 'nome e valor (em reais) são obrigatórios' });
      return;
    }
    try {
      await supabaseService.getClient()
        .from('custos_fixos')
        .insert({ nome, valor_cents: Math.round(valorReais * 100) });
      res.json({ ok: true });
    } catch (err) {
      console.warn('[cerebro-custos-fixo]', (err as Error)?.message);
      res.status(500).json({ erro: 'falha ao salvar' });
    }
  });

  return router;
}
