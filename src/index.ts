import express from 'express';
import { loadConfig } from './config.js';
import { EvolutionService } from './modules/evolution.js';
import { MessageQueue } from './modules/queue.js';
import { criarTenantResolver, ECOSUN_COMPANY_ID } from './modules/tenant-resolver.js';
import { SupabaseService } from './modules/supabase.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { KnowledgeBase } from './modules/knowledge.js';
import { detectTopics } from './modules/knowledge-topics.js';
import { conhecimentoDirDoModo, isVitrineEcosof } from './modules/eva-modo.js';
import { BlogGenerator, publishDraftToGitHub } from './modules/blog-generator.js';
import { MetaWhatsAppService } from './modules/meta-whatsapp.js';
import { Brain } from './modules/brain.js';
import { DossierBuilder } from './modules/dossier.js';
import { calculateSolarEstimate, formatEstimateForPrompt } from './modules/solar.js';
import { archiveInboundMedia } from './modules/inbound-media.js';
import { Transcriber } from './modules/transcriber.js';
import { VisionAnalyzer } from './modules/vision.js';
import Anthropic from '@anthropic-ai/sdk';
import { LearningModule } from './modules/learning.js';
import { FollowupModule } from './modules/followup.js';
import { MaintenanceService } from './modules/maintenance.js';
import { CadenceService } from './modules/cadence.js';
import { ingestCanalSolar } from './modules/canal-solar.js';
import { TakeoverService } from './modules/takeover.js';
import { CalendarService } from './modules/calendar.js';
import { MetaService } from './modules/meta.js';
import { ImageGenerator } from './modules/image-gen.js';
import { VideoGenerator } from './modules/video-gen.js';
import { MarketingService } from './modules/marketing.js';
import { HiggsfieldImageGenerator } from './modules/marketing/higgsfield-gen.js';
import { CreativeAgent } from './modules/marketing/creative-agent.js';
import { ReengagementCadence } from './modules/reengagement-cadence.js';
import { PostInstallService, INSTALLATION_STATUSES } from './modules/post-install.js';
import { TestimonialService, TestimonialFormat } from './modules/testimonials.js';
import { SiteDeployService } from './modules/site-deploy.js';
import { PublicReviewsService } from './modules/public-reviews.js';
import { CaseCreatorAssistant } from './modules/case-creator-assistant.js';
import { MetaLeadgenService, LeadgenPayload, normalizeBrazilianPhone, registrarEventosMinimos } from './modules/meta-leadgen.js';
import { extrairRespostasForm, mesclarEnergyData, blocoContinuacaoForm } from './modules/leadgen-form-respostas.js';
import { deveAvisarConversaIniciada, montarAvisoConversaIniciada } from './modules/aviso-conversa-iniciada.js';
import { emailValido } from './modules/email/email-util.js';
import { enviarTemplateInicial, TEMPLATE_FALLBACK } from './modules/template-inicial.js';
import { parseTrackingTag } from './modules/tracking.js';
import { generateWeeklyReport, formatReportForWhatsApp } from './modules/ads-report.js';
import { PricingAssistant } from './modules/pricing-assistant.js';
import { SchedulingAssistant } from './modules/scheduling-assistant.js';
import { ProposalAssistant } from './modules/proposal-assistant.js';
import { analyzeCampaignQuality } from './modules/marketing/campaign-quality.js';
import { buildCampaignDigest } from './modules/marketing/campaign-recommender.js';
import { fetchCampaignQualityInputs } from './modules/marketing/campaign-quality-data.js';
import { MetaCapi } from './modules/meta-capi.js';
import { makeCapiReporter, type CapiReporter } from './modules/capi-reporter.js';
import { ProposalFollowupService } from './modules/proposal-followup.js';
import { construirMenu, rowsCategorias, rowsSubmenu } from './modules/menu/menu.js';
import {
  ClosingAssistant,
  ClosingDriveUploader,
  ClosingPersist,
  createAnthropicLlmCaller,
  fetchByLeadId,
  searchLeadByName,
  buildInitialData,
  renderContrato,
  renderProcuracao,
  renderHtmlToPdf,
  findMissingRequired,
  humanizeMissing,
  parseClosingCommand,
  buildFecharPickButtons,
  type ClosingCommand,
  type DadosFechamento,
  type ClosingState,
} from './modules/closing/index.js';
import { google } from 'googleapis';
import { templateParaAdMeta } from './modules/ctwa-template-mapping.js';
import RedisModule from 'ioredis';
// ESM/CJS interop: ioredis as vezes vem como { default: class }, as vezes direto.
const IORedis = (RedisModule as any).default ?? RedisModule;
import { NewsScraperService } from './modules/news-scraper.js';
import { DriveUploader } from './modules/proposal/drive-uploader.js';
import { montarRespostaAtualizar } from './modules/proposal/atualizar-proposta.js';
import { contarPropostasSemDados, resgatarDadosInput } from './modules/proposal/resgatar-dados-input.js';
import { MonitoringService } from './modules/monitoring/service.js';
import { TelemetriaService } from './modules/monitoring/telemetria-service.js';
import { criarRhRoutesPublicas } from './modules/rh/routes-publicas.js';
import { limparCandidatosAntigos, corteRetencao } from './modules/rh/store.js';
import { TriagemService } from './modules/rh/triagem.js';
import { createDashboardRouter } from './modules/dashboard/router.js';
import { ensureSeed } from './modules/dashboard/seed.js';
import { resolveChannel } from './modules/dashboard/resolve-channel.js';
import { leadRowToChannelInput } from './modules/dashboard/channel-mapper.js';
import { ProactiveAlertService } from './modules/monitoring/proactive-alerts/service.js';
import { runDispatchCycle, type DispatchCtx } from './modules/monitoring/proactive-alerts/dispatcher.js';
import { runSlaCycle } from './modules/dashboard/tarefas.js';
import { notificarSlaVencidos, type Aviso } from './modules/dashboard/sla-notifier.js';
import { runAnniversaryEnqueue } from './modules/monitoring/proactive-alerts/anniversary.js';
import type { DonoCadState } from './modules/monitoring/dono-cad/types.js';
import { camposVaziosUsina, proximoCampoNovo, campoObrigatorioNovo, perguntaNovo, perguntaUsina, ehPular } from './modules/monitoring/dono-cad/machine.js';
import { CAMPOS_USINA } from './modules/monitoring/dono-cad/types.js';
import { sendAdminWithButtons } from './modules/eva-admin-buttons.js';
import { makeImpostoHandler, montarRespostaImposto, parseValorReais } from './modules/financeiro/comando-imposto.js';
import { makeRelatorioHandler } from './modules/financeiro/comando-relatorio.js';
import { makeMaterialQueryHandler } from './modules/financeiro/materiais.js';
import { runPosInstalacaoNotifCycle } from './modules/relatorios/pos-instalacao/cron.js';
import { PosInstalacaoService } from './modules/relatorios/pos-instalacao/service.js';
import { renderPosInstalacaoHtml } from './modules/relatorios/pos-instalacao/template.js';
import { buildCtwaPatch, shouldAttributeCtwa, resolveCampaignIdFromAd } from './modules/marketing/ctwa-attribution.js';
import { carregarEmpresaConfig, carregarKits, empresa, listaMarcasTexto } from './modules/empresa-config.js';
import { mapResendEvento } from './modules/email/resend-events.js';
import { EmailSequenceService } from './modules/email/email-sequence.js';
import { EmailSender } from './modules/email/resend-client.js';
import { CampanhaService, botoesPreviewCampanha, type CampanhaGerada } from './modules/email/campanha.js';
import { registrarEvento } from './modules/elo/eventos.js';
import { registrarVenda } from './modules/vendas/registrar-venda.js';
// Escape pra páginas públicas que interpolam campos da empresa_config em HTML
// (config é admin-controlled, mas vem do banco — defesa em profundidade).
import { escapeHtml } from './modules/dashboard/views.js';

// RFC 4122 UUID regex. Usado pra validar :id na URL antes de consultar o DB.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Pagina de erro pra /p/:slug (proposta nao encontrada, expirada ou erro tecnico).
// Standalone HTML com cores EcoSunPower (navy/amarelo).
function propostaErrorHtml(kind: 'not_found' | 'expired' | 'error'): string {
  const titles = {
    not_found: 'Proposta não encontrada',
    expired: 'Proposta expirada',
    error: 'Erro ao carregar proposta',
  };
  const messages = {
    not_found: `O link que você acessou não existe ou foi removido. Se você recebeu esse link da ${escapeHtml(empresa().nomeFantasia)} e ele deveria estar ativo, fale com a gente no WhatsApp.`,
    expired: 'Essa proposta passou da data de validade (60 dias após geração). Pra receber uma proposta atualizada, fale com a gente no WhatsApp.',
    error: 'Tivemos um problema temporário ao carregar essa proposta. Tente de novo em alguns minutos ou fale com a gente no WhatsApp.',
  };
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${titles[kind]} — ${escapeHtml(empresa().nomeFantasia)}</title>
<style>
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #0a1f3d 0%, #1a3a5c 100%); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #fff; padding: 20px; }
.box { max-width: 480px; text-align: center; }
.icon { font-size: 64px; margin-bottom: 16px; }
h1 { font-size: clamp(24px,5vw,32px); margin: 0 0 16px; color: #ffd23f; }
p { font-size: 16px; line-height: 1.6; margin: 0 0 24px; opacity: 0.92; }
a.btn { display: inline-block; background: #25d366; color: #fff; padding: 14px 28px; border-radius: 999px; text-decoration: none; font-weight: 600; font-size: 16px; transition: transform .15s; }
a.btn:hover { transform: translateY(-2px); }
.brand { margin-top: 32px; opacity: 0.6; font-size: 13px; }
</style>
</head>
<body>
<div class="box">
<div class="icon">${kind === 'expired' ? '⏰' : kind === 'error' ? '⚠️' : '🔍'}</div>
<h1>${titles[kind]}</h1>
<p>${messages[kind]}</p>
${empresa().telefoneAtendente ? `<a class="btn" href="https://wa.me/${(empresa().telefoneAtendente ?? '').replace(/\D/g, '')}">Falar no WhatsApp</a>` : ''}
<div class="brand">${escapeHtml(empresa().nomeFantasia)} Energia Solar · ${escapeHtml(empresa().siteUrl.replace(/^https?:\/\//, ''))}</div>
</div>
</body>
</html>`;
}

// Helper de fuso: retorna hour/minute/weekday/dateISO em America/Sao_Paulo
// SEM depender do TZ do servidor. O truque antigo `new Date(toLocaleString('en-US'))`
// so funcionava por acidente quando servidor rodava em UTC — trocamos por
// Intl.DateTimeFormat.formatToParts que e timezone-safe em qualquer servidor.
function getBrtParts(): {
  hour: number;
  minute: number;
  weekday: number; // 0=domingo, 1=segunda, ..., 6=sabado
  dateISO: string; // YYYY-MM-DD
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(new Date());
  const o: Record<string, string> = {};
  for (const p of parts) o[p.type] = p.value;
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    hour: parseInt(o.hour, 10),
    minute: parseInt(o.minute, 10),
    weekday: weekdayMap[o.weekday] ?? 0,
    dateISO: `${o.year}-${o.month}-${o.day}`,
  };
}
import { buildHealthStatus } from './health.js';
import { BUILD_VERSION } from './build-info.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { montarBlocoProposta } from './modules/proposal-context.js';
import { corrigirOrtografia } from './modules/corretor-ortografico.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Postura de consultora/fechamento — injetada no cérebro da Eva quando o cliente
// que está falando JÁ tem proposta pública (Fatia 2). Lida 1x no boot.
const consultoraPropostaPrompt = readFileSync(
  join(__dirname, 'prompts', 'consultora-proposta.md'),
  'utf-8',
);

async function main() {
  const config = loadConfig();
  const isSandbox = config.nodeEnv === 'sandbox';

  console.log(`[init] Starting Ecosunpower Agent (${config.nodeEnv} mode)`);

  const evolution = new EvolutionService(config);

  // WABA Cloud API (Meta oficial). Quando USE_WABA_CLOUD_API=true, vira o
  // canal padrao de envio E recebimento. Mantemos Evolution instanciado
  // pra fallback/transicao mas messaging-layer usa apenas um por vez.
  const metaWaba = (config.useWabaCloudApi
    && config.metaWabaPhoneNumberId
    && config.metaWabaAccessToken
    && config.metaAppSecret
    && config.metaWabaVerifyToken)
    ? new MetaWhatsAppService(config)
    : null;
  if (metaWaba) {
    console.log('[waba] ✅ WhatsApp Business Cloud API ATIVA — Eva opera via Meta oficial');
    console.log(`[waba] Phone Number ID: ${config.metaWabaPhoneNumberId}`);
    console.log(`[waba] Business Account ID: ${config.metaWabaBusinessAccountId ?? '(nao setado)'}`);
  } else if (config.useWabaCloudApi) {
    console.warn('[waba] ⚠️ USE_WABA_CLOUD_API=true mas faltam env vars. WABA NAO ativada — usando Evolution. Necessarios: META_WABA_PHONE_NUMBER_ID, META_WABA_ACCESS_TOKEN, META_APP_SECRET, META_WABA_VERIFY_TOKEN');
  } else {
    console.log('[waba] WhatsApp Cloud API desativada (USE_WABA_CLOUD_API=false). Usando Evolution.');
  }

  // Camada de mensagens unificada — usa WABA se disponivel, senao Evolution.
  // Ambos implementam a mesma interface (sendText, parseWebhook, etc).
  const messaging = metaWaba ?? evolution;

  // Instagram Direct Messaging (qualificador IG DM).
  // Reusa META_WABA_ACCESS_TOKEN + META_APP_SECRET (mesma App Meta).
  // IG_USER_ID = IG-Scoped Business User ID (ex: 17841...). Diferente do
  // META_INSTAGRAM_BUSINESS_ID (que eh o ID da conta business pra Graph API).
  let igDirect: import('./modules/messaging/instagram-direct.js').InstagramDirectService | null = null;
  if (config.metaWabaAccessToken && config.metaAppSecret && config.igUserId) {
    const { InstagramDirectService } = await import('./modules/messaging/instagram-direct.js');
    igDirect = new InstagramDirectService(
      config.igUserId,
      config.metaWabaAccessToken,
      config.metaAppSecret,
    );
    console.log(`[ig] Service initialized for IG user: ${config.igUserId}`);
  } else {
    console.warn('[ig] Disabled: faltam IG_USER_ID, META_WABA_ACCESS_TOKEN ou META_APP_SECRET');
  }

  const supabase = new SupabaseService(config);

  // Resolver de tenant (multi-tenant fatia 1): phone_number_id do webhook →
  // company_id (mapa da migration 081). Com a coluna NULL em todo mundo, tudo
  // resolve EcoSun = comportamento de hoje. Cache 5min, best-effort.
  const tenantResolver = criarTenantResolver(supabase.getClient());

  // [Corretor] Corretor de português compartilhado (1 cliente Anthropic) injetado
  // nos assistants que recebem texto livre do Junior (cases, fechamento). Corrige
  // só ortografia, protege número/nome, degrada seguro. Forward-only.
  const anthropicCorretor = new Anthropic({ apiKey: config.anthropicApiKey });
  const corrigirTexto = (texto: string | null | undefined, opts?: { conservador?: boolean }) =>
    corrigirOrtografia(anthropicCorretor, texto, opts);

  // EcoSof Kit Clone: carrega empresa_config no boot (fallback = defaults EcoSun
  // hardcoded — banco sem a tabela continua funcionando com comportamento idêntico).
  // Ignora o retorno { ok, config } — falha no boot com defaults é aceitável.
  await carregarEmpresaConfig(supabase.getClient());

  const brain = new Brain(config.anthropicApiKey, process.env.GOOGLE_REVIEW_URL ?? '');
  const vision = new VisionAnalyzer(config.anthropicApiKey);
  const transcriber = config.openaiApiKey ? new Transcriber(config.openaiApiKey) : null;
  // Modo solar → pasta 'conhecimento'; vitrine_ecosof → 'conhecimento-ecosof'. No
  // modo vitrine, o atendimento usa knowledgeBase.getContent() (toda a pasta do EcoSof)
  // — ver a montagem do `knowledge` no loop de resposta. As refs a 'conhecimento' dos
  // modos solares (proposta/preço) não se aplicam à vitrine.
  const knowledgeBase = new KnowledgeBase(join(__dirname, '..', conhecimentoDirDoModo()));
  const newsScraper = new NewsScraperService(supabase.getClient());
  const blogGenerator = new BlogGenerator(
    new Anthropic({ apiKey: config.anthropicApiKey }),
    supabase.getClient(),
    join(__dirname, '..', 'conhecimento'),
    newsScraper,
    config.pexelsApiKey,
  );
  // [ECOSOF] GITHUB_SITE_REPO perdeu o default (identidade EcoSun): sem PAT OU
  // sem repo, a publicação no site fica off (drafts continuam no Supabase).
  if (config.githubPat && config.githubSiteRepo) {
    console.log(`[blog] Auto-blog enabled (GitHub repo: ${config.githubSiteRepo}@${config.githubSiteBranch})`);
  } else {
    console.log('[blog] Auto-blog: drafts vao salvar no Supabase mas publicacao no site precisa GITHUB_PAT e GITHUB_SITE_REPO setados.');
  }
  const takeover = new TakeoverService(config.redisHost, config.redisPort, config.redisPassword);
  const calendar = (config.googleClientId && config.googleClientSecret
    && config.googleRefreshToken && config.googleCalendarId)
    ? new CalendarService({
      clientId: config.googleClientId,
      clientSecret: config.googleClientSecret,
      refreshToken: config.googleRefreshToken,
      calendarId: config.googleCalendarId,
      timezone: config.timezone,
    })
    : null;
  if (calendar) {
    console.log('[calendar] Google Calendar integration enabled');
  } else {
    const missing = [
      !config.googleClientId && 'GOOGLE_CLIENT_ID',
      !config.googleClientSecret && 'GOOGLE_CLIENT_SECRET',
      !config.googleRefreshToken && 'GOOGLE_REFRESH_TOKEN',
      !config.googleCalendarId && 'GOOGLE_CALENDAR_ID',
    ].filter(Boolean).join(', ');
    console.log(`[calendar] Google Calendar disabled. Missing env vars: ${missing}`);
  }

  const meta = (config.metaAccessToken && config.metaFacebookPageId && config.metaInstagramBusinessId)
    ? new MetaService({
      accessToken: config.metaAccessToken,
      pageId: config.metaFacebookPageId,
      instagramId: config.metaInstagramBusinessId,
    })
    : null;
  if (meta) {
    console.log('[meta] Marketing integration enabled (Facebook + Instagram)');
  } else {
    const missing = [
      !config.metaAccessToken && 'META_ACCESS_TOKEN',
      !config.metaFacebookPageId && 'META_FACEBOOK_PAGE_ID',
      !config.metaInstagramBusinessId && 'META_INSTAGRAM_BUSINESS_ID',
    ].filter(Boolean).join(', ');
    console.log(`[meta] Marketing integration disabled. Missing env vars: ${missing}`);
  }

  // Lead Ads webhook — recebe leads de formularios do IG/FB direto no sistema
  const metaLeadgen = (meta && config.metaAppSecret && config.metaVerifyToken)
    ? new MetaLeadgenService(
        config.metaAppSecret,
        config.metaVerifyToken,
        () => meta.getPageAccessToken(),
        supabase.getClient(),
        new Anthropic({ apiKey: config.anthropicApiKey }),
      )
    : null;
  if (metaLeadgen) {
    console.log('[meta-leadgen] Lead Ads webhook enabled');
  } else if (meta) {
    const missing = [
      !config.metaAppSecret && 'META_APP_SECRET',
      !config.metaVerifyToken && 'META_VERIFY_TOKEN',
    ].filter(Boolean).join(', ');
    console.log(`[meta-leadgen] Webhook disabled. Missing: ${missing}`);
  }

  // Higgsfield (imagem top + logo) pros posts de imagem. Construção TOLERANTE:
  // credencial ausente OU mal formatada apenas DESABILITA o Higgsfield (cai pro
  // FLUX) — NUNCA derruba o app no boot. O SDK valida o formato KEY_ID:KEY_SECRET
  // no construtor e lança; aqui a gente captura e segue sem Higgsfield.
  let higgsfieldGen: HiggsfieldImageGenerator | undefined;
  if (config.higgsfieldCredentials) {
    try {
      higgsfieldGen = new HiggsfieldImageGenerator(config.higgsfieldCredentials);
      console.log('[marketing] Higgsfield habilitado (imagem premium + logo)');
    } catch (err) {
      console.error(
        `[marketing] Higgsfield DESABILITADO — credencial inválida (use KEY_ID:KEY_SECRET): ${(err as Error).message}. Seguindo com FLUX.`,
      );
    }
  }

  const marketing = (config.replicateApiToken && meta)
    ? new MarketingService(
      config.anthropicApiKey,
      supabase.getClient(),
      new ImageGenerator(config.replicateApiToken),
      // Prefere businessPhone (WhatsApp do negocio onde Eva opera).
      // Se nao setado, fallback pra engineerPhone por compat (mas com warn).
      config.businessPhone ?? config.engineerPhone,
      new VideoGenerator(config.replicateApiToken),
      higgsfieldGen,
    )
    : null;
  if (marketing && !config.businessPhone) {
    console.warn('[marketing] WARNING: BUSINESS_PHONE nao setado. wa.me links no caption apontam pro engineerPhone (pessoal). Defina BUSINESS_PHONE=55XXXXXXXXXX (numero do Evolution onde Eva opera).');
  }
  if (marketing) {
    console.log('[marketing] Content generator enabled (Claude + FLUX 1.1 Pro + Luma Ray Flash 2)');
  } else {
    const missing = [
      !config.replicateApiToken && 'REPLICATE_API_TOKEN',
      !meta && 'Meta config',
    ].filter(Boolean).join(', ');
    console.log(`[marketing] Content generator disabled. Missing: ${missing}`);
  }

  // Agente Criativo (Task 3.x): orquestra personas + copy + 3 imagens estilizadas
  // + filtros + storage. Disparado por /criativo no zap pelo Junior.
  // Independente do `marketing` (este precisa de Meta pra publicar; o /criativo
  // so precisa do Replicate pra gerar — Junior aprova manualmente).
  const creativeAgent = config.replicateApiToken
    ? new CreativeAgent(supabase.getClient(), config.replicateApiToken)
    : null;
  if (creativeAgent) {
    console.log('[creative-agent] Initialized — comando /criativo ativo');
  } else {
    console.warn('[creative-agent] Disabled: REPLICATE_API_TOKEN nao setado');
  }

  // Simulate human typing delay: ~35ms per char, clamped between 900ms and 3500ms.
  const typingDelay = (text: string): number => {
    const ms = Math.round(text.length * 35);
    return Math.max(900, Math.min(3500, ms));
  };

  // Wrapped sendText: shows "digitando..." presence and tracks bot-sent IDs.
  // Roteia automaticamente WABA Cloud API ou Evolution conforme USE_WABA_CLOUD_API.
  const sendText = async (to: string, text: string): Promise<void> => {
    const delay = typingDelay(text);
    const { messageId } = await messaging.sendText(to, text, delay);
    if (messageId) await takeover.markBotSent(messageId);
  };

  // "Campanha via Eva": /campanha no zap -> gera e-mail (Claude + FLUX) -> manda
  // preview pro Junior com botões (aprovar/refazer/descartar) -> ao aprovar,
  // dispara pra base elegível. Precisa do Replicate (FLUX); sem token = null.
  const campanha = config.replicateApiToken
    ? new CampanhaService({
        anthropic: new Anthropic({ apiKey: config.anthropicApiKey }),
        imageGen: new ImageGenerator(config.replicateApiToken),
        supabase: supabase.getClient(),
        sender: new EmailSender(process.env.RESEND_API_KEY ?? '', process.env.EMAIL_FROM ?? ''),
        listarDestinatarios: (max) => supabase.listarDestinatariosCampanha(max),
        baseUrl: config.publicProposalBaseUrl,
        siteUrl: config.siteUrl,
        empresa: empresa().nomeFantasia,
        // Preview no WhatsApp: imagem hero + legenda (assunto/título/nº destinatários)
        // + botões. Fallback sem WABA: texto com a URL da imagem.
        enviarPreview: async (c: CampanhaGerada) => {
          const to = config.engineerPhone;
          const dest = await supabase.listarDestinatariosCampanha(1000).catch(() => []);
          const caption = `${c.assunto}\n\n${c.titulo}\n\n~${dest.length} destinatários\n👀 Ver completo: ${config.publicProposalBaseUrl}/e/campanha/${c.id}`;
          const botoes = botoesPreviewCampanha(c.id);
          if (metaWaba) {
            try {
              const resp = await fetch(c.image_url);
              const buf = Buffer.from(await resp.arrayBuffer());
              const { mediaId } = await metaWaba.uploadMedia(buf, 'image/png', `campanha-${c.id}.png`);
              await metaWaba.sendImageById(to, mediaId, caption);
            } catch (err) {
              console.warn('[campanha] preview com imagem falhou, mando texto:', (err as Error).message);
              await sendText(to, `${caption}\n\n🖼 ${c.image_url}`);
            }
            await sendAdminWithButtons({ metaWaba, sendText }, to, 'Aprova essa campanha?', botoes, 'Campanha de e-mail');
          } else {
            await sendText(to, `${caption}\n\n🖼 ${c.image_url}\n\nResponda: aprovar / refazer / descartar`);
          }
        },
      })
    : null;
  if (campanha) {
    console.log('[campanha] Campanha via Eva ativa — comando /campanha');
  } else {
    console.warn('[campanha] Disabled: REPLICATE_API_TOKEN nao setado');
  }

  // Registra na conversa que a 1ª mensagem ao lead foi um template aprovado
  // (WABA). Sem esse registro o message_count fica 0 e o auto-ack re-dispara
  // o MESMO template quando o lead responde ("sessão nova" falsa => cliente
  // recebe abertura duplicada). O marcador também dá contexto pra Eva sobre
  // o que o lead está respondendo. Falha aqui não pode derrubar o envio —
  // chamadores usam .catch().
  // Rótulo amigável (PT) de qual abertura a Eva mandou — pro aviso no zap e a
  // conversa no painel. Distingue a abertura NOVA (certa) da de reativação (fallback).
  const rotuloAbertura = (templateUsado: string): string =>
    templateUsado === TEMPLATE_FALLBACK
      ? '⚠️ Abertura de *reativação* enviada (a abertura nova não tava disponível)'
      : '✅ Abertura nova enviada (a certa)';

  const registrarTemplateNaConversa = async (leadId: string, templateUsado: string): Promise<void> => {
    const conversation = await supabase.getOrCreateConversation(leadId);
    await supabase.updateConversation(conversation.id, {
      messages: [
        ...conversation.messages,
        {
          role: 'assistant' as const,
          content: `📨 ${rotuloAbertura(templateUsado)} (com o nome do cliente). Aguardando ele responder.`,
          timestamp: new Date().toISOString(),
        },
      ],
      message_count: conversation.message_count + 1,
    });
  };

  const learning = new LearningModule(supabase.getClient());
  const followup = new FollowupModule(
    supabase.getClient(),
    sendText,
    new Anthropic({ apiKey: config.anthropicApiKey }),
  );
  const reengagement = new ReengagementCadence(
    supabase.getClient(),
    new Anthropic({ apiKey: config.anthropicApiKey }),
    sendText,
    () => knowledgeBase.getContent(),
  );
  const maintenance = new MaintenanceService(
    supabase,
    new Anthropic({ apiKey: config.anthropicApiKey }),
    sendText,
  );
  const cadence = new CadenceService(
    supabase,
    new Anthropic({ apiKey: config.anthropicApiKey }),
    sendText,
    metaWaba ?? null,
  );

  // Eva Precificadora: modo /preco conversacional pra Junior calcular projetos
  // (solar, híbrido, carregador VE, padrão de entrada). Usa Redis pra estado
  // de modo ativo + histórico Claude. Acessível APENAS pelo engineerPhone.
  const pricingAssistant = new PricingAssistant(
    config.anthropicApiKey,
    config.redisHost,
    config.redisPort,
    config.redisPassword,
    join(__dirname, '..', 'conhecimento'),
  );

  // Eva Agendadora: modo /agenda conversacional pra Junior gerenciar Calendar
  // (Meet, visita técnica, instalação, etc). Acessível APENAS pelo engineerPhone.
  // Requer CalendarService — só ativa se config Google Calendar OK.
  const schedulingAssistant = calendar ? new SchedulingAssistant(
    config.anthropicApiKey,
    config.redisHost,
    config.redisPort,
    config.redisPassword,
    join(__dirname, '..', 'conhecimento'),
    calendar,
  ) : null;
  if (schedulingAssistant) {
    console.log('[scheduling] Eva Agendadora ATIVA (Google Calendar integrado)');
  } else {
    console.log('[scheduling] Eva Agendadora DESATIVADA — Google Calendar não configurado');
  }

  // Eva Proposta: modo /proposta conversacional pra Junior gerar propostas
  // comerciais (PDF + web no Drive). Reusa OAuth do Calendar pra Drive API.
  // Requer scope drive.file no refresh_token. Acessível APENAS pelo engineerPhone.
  const driveUploader = (config.googleClientId && config.googleClientSecret && config.googleRefreshToken)
    ? new DriveUploader({
        clientId: config.googleClientId,
        clientSecret: config.googleClientSecret,
        refreshToken: config.googleRefreshToken,
      })
    : null;

  const proposalAssistant = new ProposalAssistant({
    apiKey: config.anthropicApiKey,
    redisHost: config.redisHost,
    redisPort: config.redisPort,
    redisPassword: config.redisPassword,
    knowledgeBaseDir: join(__dirname, '..', 'conhecimento'),
    driveUploader,
    engineerPhone: config.engineerPhone,
    supabaseService: supabase,
    publicProposalBaseUrl: config.publicProposalBaseUrl,
    metaService: metaWaba,
    siteUrl: config.siteUrl,
    googleNota: config.googleNota,
    googleQtdAvaliacoes: config.googleQtdAvaliacoes,
    proposalPreviewToken: config.proposalPreviewToken,
  });

  const driveOk = !!driveUploader;
  console.log(`[proposal] Eva Proposta ATIVA — Drive: ${driveOk ? 'on' : 'off'}, Web publica: on (${config.publicProposalBaseUrl})`);

  // Meta Conversions API (CAPI): devolve eventos de funil CTWA pra Meta otimizar
  // a veiculacao (buscar mais gente parecida com quem qualifica/fecha). So liga
  // se tiver token + WABA id; senao vira no-op silencioso. NUNCA quebra o handler.
  // [ECOSOF] META_CAPI_DATASET_ID perdeu o default (identidade EcoSun) e agora
  // faz parte do gate: sem a env o CAPI fica off com aviso (nunca quebra boot).
  const capiOn = !!(config.metaCapiToken && config.metaWabaBusinessAccountId && config.metaCapiDatasetId);
  const capiReporter: CapiReporter = capiOn
    ? makeCapiReporter({
        capi: new MetaCapi({ datasetId: config.metaCapiDatasetId!, token: config.metaCapiToken! }),
        wabaId: config.metaWabaBusinessAccountId!,
        // [MT fatia 3d] db opcional = SupabaseService do crachá (caminho da
        // mensagem); sem db, singleton (crons/HTTP). Cast é local: o tipo do
        // capi-reporter usa unknown pra não acoplar no SupabaseService.
        getLeadForCapi: (id, db) => ((db as SupabaseService | undefined) ?? supabase).getLeadForCapi(id),
        recordCapiStage: (id, stage, db) => ((db as SupabaseService | undefined) ?? supabase).recordCapiStage(id, stage),
      })
    : async () => { /* CAPI off: falta META_CAPI_TOKEN, META_WABA_BUSINESS_ACCOUNT_ID ou META_CAPI_DATASET_ID */ };
  console.log(`[capi] Conversions API ${capiOn ? 'ATIVA' : 'off (falta token/WABA id/dataset)'} — dataset ${config.metaCapiDatasetId ?? 'NAO SETADO'}`);

  // CAPI estagio "lead_respondeu": lead de FORMULARIO ja existente respondeu
  // no zap — texto, foto ou PDF (a resposta mais comum e a foto da conta de
  // luz). CTWA fica DE FORA de proposito: quem clicou no anuncio do zap ja
  // conversa por definicao (o estagio 'Lead' cobre) e o sinal so discrimina
  // no formulario. `stages.includes('Lead')` cobre o lead quente que
  // preencheu o form mantendo lead_source antigo (o webhook preserva a
  // origem original de quem ja estava no funil). Guarda barata pelos campos
  // do lead ja carregado (select *): lead organico nao gera query extra; a
  // idempotencia real fica no reporter (capi_stages_sent).
  const maybeCapiRespondeu = (lead: unknown, db?: unknown, previewResposta?: string): void => {
    const l = lead as import('./modules/aviso-conversa-iniciada.js').LeadParaAviso | null;
    // Régua única no módulo (deveAvisarConversaIniciada = MESMA guarda de
    // sempre do lead_respondeu) pros DOIS efeitos: CAPI + aviso ao Junior.
    if (!l || !deveAvisarConversaIniciada(l)) return;
    void capiReporter(l.id!, 'lead_respondeu', { db });
    // [28/07 — pedido do Junior] o momento de ouro no zap dele: "fulano
    // começou a conversar" com botões Ver conversa / Assumir. Fire-and-forget.
    void (async () => {
      try {
        const { texto, botoes, footer } = montarAvisoConversaIniciada(l, previewResposta ?? null);
        if (metaWaba) await metaWaba.sendInteractiveButtons(config.engineerPhone, texto, botoes, footer);
        else await sendText(config.engineerPhone, texto);
      } catch (err) {
        console.warn('[conversa-iniciada] aviso pro Junior falhou:', (err as Error).message);
      }
    })();
  };

  // Follow-up automatico de proposta: notifica Junior toda vez que cliente
  // abre o link publico (throttle 5min), e na primeira abertura manda
  // mensagem pro cliente perguntando se ficou alguma duvida. Preview admin
  // (?eu=<token>) bypassa tracking. Trigger fire-and-forget.
  const followupRedis = new IORedis({
    host: config.redisHost,
    port: config.redisPort,
    password: config.redisPassword,
    maxRetriesPerRequest: null,
  });
  const proposalFollowup = new ProposalFollowupService({
    supabase,
    metaService: metaWaba,
    sendText,
    engineerPhone: config.engineerPhone,
    proposalBaseUrl: config.publicProposalBaseUrl,
    redis: followupRedis,
    // Template de abordagem da proposta. ⚠️ TROCAR pelo nome FINAL que o Junior
    // confirmar ao aprovar na Meta (o de lead virou '_eva_qualificacao_v1').
    templateAbordagem: 'eva_proposta_aberta_v1',
    // [Fatia 2 — Parte B] closures lazy: os helpers são definidos mais abaixo no
    // main(); estas funções só são CHAMADAS em runtime (reabertura), quando os
    // consts já estão inicializados.
    janela24hAberta: (p: string) => janela24hAberta(p),
    gerarAbordagemInteligente: (slug: string, tel: string) => gerarAbordagemInteligente(slug, tel),
  });
  console.log('[proposal-followup] Servico ativo (notifica toda abertura, throttle 5min)');

  // Eva Fechamento: modo /fechar conversacional pra Junior fechar venda
  // (gera contrato + procuração no Drive). Reusa OAuth do Drive proposal.
  const closingAssistant = new ClosingAssistant({
    llm: createAnthropicLlmCaller(config.anthropicApiKey),
    corrigirTexto,
  });
  const closingPersist = new ClosingPersist(supabase.getClient());
  let closingDriveUploader: ClosingDriveUploader | null = null;
  if (config.googleClientId && config.googleClientSecret && config.googleRefreshToken) {
    const oauth = new google.auth.OAuth2(config.googleClientId, config.googleClientSecret);
    oauth.setCredentials({ refresh_token: config.googleRefreshToken });
    const driveApi = google.drive({ version: 'v3', auth: oauth });
    closingDriveUploader = new ClosingDriveUploader(driveApi);
    console.log('[closing] Eva Fechamento ATIVA — Drive: on');
  } else {
    console.log('[closing] Eva Fechamento PARCIAL — Drive: off (faltando config Google)');
  }

  // Redis state pro modo closing (key: closing:<phone>, TTL 1h)
  const closingRedis = new IORedis({
    host: config.redisHost,
    port: config.redisPort,
    password: config.redisPassword,
    maxRetriesPerRequest: null,
  });
  async function getClosingState(phone: string): Promise<ClosingState | null> {
    const raw = await closingRedis.get(`closing:${phone}`);
    return raw ? (JSON.parse(raw) as ClosingState) : null;
  }
  async function setClosingState(phone: string, state: ClosingState | { stage: 'cancelled' }): Promise<void> {
    if (state.stage === 'cancelled') {
      await closingRedis.del(`closing:${phone}`);
      return;
    }
    await closingRedis.set(`closing:${phone}`, JSON.stringify(state), 'EX', 3600);
  }
  async function clearClosingState(phone: string): Promise<void> {
    await closingRedis.del(`closing:${phone}`);
  }

  // Estado do fluxo de cadastro de dono de usina (key: dono-cad:<phone>).
  // TTL de 1h (igual ao /fechar): o passo do modelo do inversor costuma obrigar o
  // Junior a ir consultar o equipamento/datasheet — com 10min o estado expirava no
  // meio e a resposta dele caía no vazio (a Eva ficava muda).
  const DONO_CAD_TTL_SECONDS = 3600;
  async function getDonoCadState(phone: string): Promise<DonoCadState | null> {
    const raw = await closingRedis.get(`dono-cad:${phone}`);
    return raw ? (JSON.parse(raw) as DonoCadState) : null;
  }
  async function setDonoCadState(phone: string, state: DonoCadState): Promise<void> {
    await closingRedis.set(`dono-cad:${phone}`, JSON.stringify(state), 'EX', DONO_CAD_TTL_SECONDS);
  }
  async function clearDonoCadState(phone: string): Promise<void> {
    await closingRedis.del(`dono-cad:${phone}`);
  }

  // Modo "Calcular imposto" do submenu Financeiro: ao tocar, marca que a PRÓXIMA
  // mensagem do admin é o valor da venda (pra ele digitar SÓ o número). Janela de
  // 1h (igual closing/dono-cad — 5min era curto demais). Logado pra diagnosticar.
  // Rede de segurança extra: número solto nunca vira lançamento (guard no caixa-entrada).
  const IMPOSTO_AWAIT_TTL = 3600;
  async function impostoAwaitActive(phone: string): Promise<boolean> {
    return (await closingRedis.get(`fin-imposto-await:${phone}`)) === '1';
  }
  async function setImpostoAwait(phone: string): Promise<void> {
    await closingRedis.set(`fin-imposto-await:${phone}`, '1', 'EX', IMPOSTO_AWAIT_TTL);
    console.log(`[imposto-await] SET ${phone}`);
  }
  async function clearImpostoAwait(phone: string): Promise<void> {
    await closingRedis.del(`fin-imposto-await:${phone}`);
  }

  // Modulo 5 — Monitoramento de sistemas FV via API dos inversores.
  // Adapter SolarEdge ja implementado; demais marcas adicionadas conforme
  // Junior cadastrar credenciais.
  const monitoringService = new MonitoringService(supabase);
  // Lista marcas dinamicamente do registry pra confirmar deploy/registry.
  const { marcasSuportadas } = await import('./modules/monitoring/adapter-registry.js');
  console.log(`[monitoring] Servico ativo. Marcas suportadas: ${marcasSuportadas().join(', ')}`);
  console.log(`[monitoring] BUILD_MARKER ${BUILD_VERSION} (boot ${new Date().toISOString()})`);

  const googleReviewUrl = process.env.GOOGLE_REVIEW_URL ?? '';
  const postInstall = googleReviewUrl
    ? new PostInstallService(
        supabase.getClient(),
        new Anthropic({ apiKey: config.anthropicApiKey }),
        sendText,
        googleReviewUrl,
      )
    : null;
  if (!googleReviewUrl) {
    console.warn('[init] GOOGLE_REVIEW_URL not set — post-install flow disabled');
  }

  const testimonials = new TestimonialService(supabase.getClient());
  const siteDeploy = new SiteDeployService({ hookUrl: config.cloudflareDeployHookUrl });
  const publicReviews = new PublicReviewsService(supabase.getClient());

  const caseCreator = (config.githubPat && config.githubSiteRepo && metaWaba)
    ? new CaseCreatorAssistant({
        redisHost: config.redisHost,
        redisPort: config.redisPort,
        redisPassword: config.redisPassword,
        supabase: supabase.getClient(),
        metaService: metaWaba,
        siteDeploy,
        githubPat: config.githubPat,
        githubRepo: config.githubSiteRepo,
        githubBranch: config.githubSiteBranch,
        corrigirTexto,
      })
    : null;
  if (!caseCreator) {
    console.warn('[case-creator] /novo-case desabilitado (faltando GITHUB_PAT, GITHUB_SITE_REPO ou WABA service)');
  }

  // Valida que o bucket 'testimonials' existe. Se nao existir, videos de
  // depoimento nao serao salvos (fluxo continua funcionando mas sem storage).
  // Junior precisa criar o bucket no Supabase -> Storage -> "New bucket".
  (async () => {
    try {
      const { data: buckets } = await supabase.getClient().storage.listBuckets();
      const hasBucket = (buckets ?? []).some((b) => b.name === 'testimonials');
      if (!hasBucket) {
        console.warn('[init] WARNING: bucket "testimonials" not found in Supabase Storage.');
        console.warn('[init] Videos de depoimento NAO serao salvos. Crie o bucket em: Supabase -> Storage -> New bucket -> name "testimonials" -> public off recomendado');
      } else {
        console.log('[init] Bucket "testimonials" found, video testimonials will be stored');
      }
    } catch (err) {
      console.warn('[init] Could not verify testimonials bucket:', (err as Error).message);
    }
  })();

  if (!transcriber) {
    console.warn('[init] OPENAI_API_KEY not set — audio transcription disabled');
  }

  knowledgeBase.load();
  if (knowledgeBase.isOverLimit()) {
    console.warn('[knowledge] WARNING: knowledge base exceeds 15,000 token estimate.');
  }
  console.log(`[knowledge] Loaded. Estimated tokens: ${knowledgeBase.getTokenEstimate()}`);

  knowledgeBase.startWatching(() => {
    console.log('[knowledge] Reloaded after file change');
  });

  // Pre-compute lista de phones admin normalizados (engineerPhone + extras).
  // Usado pelos gates de comandos /preco, /agenda, blog. Notificacoes outbound
  // continuam indo so pro engineerPhone (o "primario" nao muda).
  const adminPhonesNormalized = [
    normalizeBrazilianPhone(config.engineerPhone),
    ...config.adminExtraPhones.map(p => normalizeBrazilianPhone(p)),
  ].filter((p): p is string => !!p);
  console.log(`[admin] Phones autorizados pra comandos admin: ${adminPhonesNormalized.join(', ')}`);

  function isAdminPhone(from: string): boolean {
    const fromNorm = normalizeBrazilianPhone(from);
    if (!fromNorm) return false;
    return adminPhonesNormalized.includes(fromNorm);
  }

  // /imposto <valor> — Núcleo Financeiro: imposto por anexo + Fator R + salto de faixa
  const tryHandleImpostoCommand = makeImpostoHandler(supabase.getClient(), isAdminPhone, sendText);

  // "relatório [mês]" — resumo financeiro do mês no zap (Peça 3)
  const tryHandleRelatorioCommand = makeRelatorioHandler(supabase.getClient(), isAdminPhone, sendText);
  const tryHandleConsultaMaterial = makeMaterialQueryHandler(supabase.getClient(), isAdminPhone, sendText);

  // Correção tardia de preço de material ("a curva da Itaiaia era 8") — antes do gate da Caixa.
  const tryHandleCorrecaoPreco = async (from: string, text: string): Promise<boolean> => {
    if (!isAdminPhone(from) || !metaWaba) return false;
    const { parseCorrecaoPrecoMaterial, buscarComprasPorMaterial, maisRecentePorLoja, montarConfirmacaoCorrecao } =
      await import('./modules/financeiro/correcao-preco.js');
    const c = parseCorrecaoPrecoMaterial(text);
    if (!c) return false;
    try {
      const rows = await buscarComprasPorMaterial(supabase.getClient(), c);
      const msg = montarConfirmacaoCorrecao(maisRecentePorLoja(rows), c.valorNovo);
      if (!msg) return false; // não achou material → deixa seguir o fluxo normal (não engole)
      await metaWaba.sendInteractiveButtons(from, msg.body, msg.buttons, 'Comparador de preços · Financeiro');
      return true;
    } catch (err) {
      // Já reconhecemos como correção (parseou) — NÃO deixar cair no caixa como gasto novo.
      console.error('[correcao-preco] busca/envio falhou:', (err as Error).message);
      await sendText(from, '❌ Deu erro pra buscar esse material no banco. Tenta de novo daqui a pouco.');
      return true;
    }
  };

  // "abordar <nome>" — dispara a abordagem da Eva na hora pro cliente, mesmo que
  // ele já tenha aberto a proposta antes (o automático só pega a 1ª abertura).
  const tryHandleAbordarCommand = async (from: string, text: string): Promise<boolean> => {
    if (!isAdminPhone(from)) return false;
    const m = text.trim().match(/^abordar\s+(.+)$/i);
    if (!m) return false;
    const resposta = await proposalFollowup.abordarManual(m[1]);
    await sendText(from, resposta);
    return true;
  };

  // /recarregar-config — recarrega empresa_config do banco sem redeploy. Útil
  // depois de editar a tabela no SQL Editor do Supabase.
  async function tryHandleRecarregarConfigCommand(from: string, text: string): Promise<boolean> {
    if (!isAdminPhone(from)) return false;
    const trimmed = text.trim().toLowerCase().replace(/^\//, '');
    if (trimmed !== 'recarregar-config') return false;
    const result = await carregarEmpresaConfig(supabase.getClient());
    if (result.ok) {
      await sendText(from, `⚙️ Config recarregada: ${result.config.nomeFantasia} (atendente: ${result.config.nomeAtendente})`);
    } else {
      const e = empresa();
      await sendText(from, `⚠️ Erro ao recarregar — mantida a config anterior: ${e.nomeFantasia} (atendente: ${e.nomeAtendente})`);
    }
    return true;
  }

  // Caixa de Entrada Universal (Fatia 3): deps montadas sob demanda
  const getCaixaDeps = () => ({
    supabase: supabase.getClient(),
    anthropic: new Anthropic({ apiKey: config.anthropicApiKey }),
    waba: metaWaba!,
    sendText: async (to: string, t: string) => { await sendText(to, t); },
  });

  // Eva Monitoramento Evolutivo (Task 8): janela 24h CONSERVADORA.
  // Só considera ABERTA quando a ÚLTIMA mensagem 'user' registrada na conversa
  // do lead tem menos de 23h (1h de margem de segurança). QUALQUER dúvida
  // (sem lead, sem conversa, sem timestamp, erro de leitura) → FECHADA:
  // template é o caminho seguro — nunca arriscar um 131047 silencioso.
  const janela24hAberta = async (phone: string): Promise<boolean> => {
    try {
      const lead = await supabase.getLeadByPhone(phone);
      if (!lead?.id) return false;
      const { data, error } = await supabase.getClient()
        .from('conversations')
        .select('messages')
        .eq('lead_id', lead.id)
        .order('last_message_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) return false;
      const msgs = (data.messages ?? []) as Array<{ role?: string; timestamp?: string }>;
      const lastUser = [...msgs].reverse().find((m) => m.role === 'user' && m.timestamp);
      if (!lastUser?.timestamp) return false;
      const idadeMs = Date.now() - new Date(lastUser.timestamp).getTime();
      return Number.isFinite(idadeMs) && idadeMs >= 0 && idadeMs < 23 * 60 * 60 * 1000;
    } catch {
      return false;
    }
  };

  // Fatia 2 — Eva consultora: se o cliente que está falando JÁ tem proposta
  // pública, monta um bloco com os números reais dela + a postura de consultora,
  // pra injetar no cérebro. Busca pela última proposta cujo telefone bate (match
  // pelos últimos 8 dígitos — robusto a formatos/DDI). Nunca lança → '' degrada
  // pro fluxo normal da Eva.
  const montarContextoProposta = async (from: string, client: SupabaseClient = supabase.getClient()): Promise<string> => {
    try {
      const alvo = normalizeBrazilianPhone(from);
      const digits = (from || '').replace(/\D/g, '');
      if (!alvo || digits.length < 10) return ''; // normalize já exige >= 10
      const ultimos8 = digits.slice(-8);
      // O ilike é só um PRÉ-FILTRO grosseiro (cliente_telefone é texto livre, sem
      // normalização). A checagem AUTORITATIVA é igualdade do telefone normalizado
      // no código — senão um substring poderia trazer a proposta de OUTRO cliente
      // (mesmos 8 dígitos finais em DDD diferente) e a Eva falaria nome/números
      // errados (vazamento). Sem match EXATO → '' (degrada pro fluxo normal).
      const { data, error } = await client
        .from('propostas_publicas')
        .select('cliente_nome, cliente_telefone, dados_input')
        .ilike('cliente_telefone', `%${ultimos8}%`)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error || !Array.isArray(data) || data.length === 0) return '';
      const match = data.find((p) => {
        const tel = normalizeBrazilianPhone(String((p as any).cliente_telefone ?? '').replace(/\D/g, ''));
        return tel !== null && tel === alvo;
      });
      if (!match) return '';
      const bloco = montarBlocoProposta((match as any).dados_input, (match as any).cliente_nome);
      if (!bloco) return '';
      return `\n\n${consultoraPropostaPrompt}\n\n${bloco}`;
    } catch (err) {
      console.warn('[consultora-proposta] montarContextoProposta falhou:', (err as Error).message);
      return '';
    }
  };

  // [Fatia 2 — Parte B] Gera UMA mensagem inteligente e variada de reabordagem,
  // usada quando o cliente reabre a proposta E já respondeu (janela 24h aberta).
  // Busca a proposta pelo SLUG (exato, sem ambiguidade de telefone) + histórico
  // recente, e pede ao Haiku uma mensagem humana, consultiva e não-repetitiva.
  // Nunca lança → null (cai no "só notifica" do proposal-followup).
  const anthropicReabordagem = new Anthropic({ apiKey: config.anthropicApiKey });
  const gerarAbordagemInteligente = async (slug: string, telefone: string): Promise<string | null> => {
    try {
      const { data } = await supabase.getClient()
        .from('propostas_publicas')
        .select('cliente_nome, dados_input')
        .eq('slug', slug)
        .maybeSingle();
      if (!data) return null;
      const bloco = montarBlocoProposta((data as any).dados_input, (data as any).cliente_nome);
      if (!bloco) return null;
      let historico = '';
      try {
        const lead = await supabase.getLeadByPhone(telefone);
        if (lead?.id) {
          const { data: conv } = await supabase.getClient()
            .from('conversations')
            .select('messages')
            .eq('lead_id', lead.id)
            .order('last_message_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          const msgs = ((conv as any)?.messages ?? []) as Array<{ role?: string; content?: string }>;
          const ult = msgs
            .slice(-6)
            .map((m) => `${m.role === 'user' ? 'Cliente' : 'Eva'}: ${m.content ?? ''}`)
            .join('\n');
          if (ult.trim()) historico = `\n\n## Conversa recente\n${ult}`;
        }
      } catch { /* segue sem histórico */ }
      const sys = `Você é a Eva, CONSULTORA de energia solar da EcoSunPower (NÃO é engenheira; o Responsável Técnico CREA/CFT é o Junior). O cliente acabou de REABRIR a proposta dele agora — sinal de interesse. Escreva UMA mensagem curta (no máximo 2 frases), humana, calorosa e VARIADA (varie a abertura, nada de template engessado). Note de leve que ele voltou a olhar e ofereça ajuda ESPECÍFICA usando os números REAIS da proposta dele (comparar opções, tirar dúvida, explicar equipamento/garantia/payback). Seja consultiva, NUNCA insistente. Não invente nada fora da proposta nem prometa preço/condição. Responda só a mensagem (sem aspas, sem assinatura).\n\n${bloco}${historico}`;
      const resp = await anthropicReabordagem.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 220,
        system: sys,
        messages: [{ role: 'user', content: 'Gere agora a mensagem de reabordagem.' }],
      });
      const out = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();
      return out || null;
    } catch (err) {
      console.warn('[reabordagem] gerar falhou:', (err as Error).message);
      return null;
    }
  };

  // Deps do orquestrador de abordagens (mesmo padrão da getCaixaDeps: sob
  // demanda, dynamic import nos handlers). dryRun acompanha o mesmo env dos
  // alertas proativos — em DRY nada chega no cliente. O waba é um adaptador
  // fino: OrqDeps declara components como unknown[] (não conhece o tipo do
  // MetaWhatsAppService) — o cast é só ponte de tipo, o valor passa intacto.
  const getOrqDeps = (client?: SupabaseClient) => ({
    supabase: client ?? supabase.getClient(),
    anthropic: new Anthropic({ apiKey: config.anthropicApiKey }),
    waba: {
      sendInteractiveButtons: (to: string, body: string, buttons: Array<{ id: string; title: string }>, footer?: string) =>
        metaWaba!.sendInteractiveButtons(to, body, buttons, footer),
      sendTemplate: (to: string, name: string, lang: string, components: unknown[]) =>
        metaWaba!.sendTemplate(to, name, lang, components as Parameters<NonNullable<typeof metaWaba>['sendTemplate']>[3]),
    },
    sendText: async (to: string, t: string) => { await sendText(to, t); },
    adminPhone: config.engineerPhone,
    dryRun: process.env.PROACTIVE_ALERTS_DRY_RUN === '1',
    janela24hAberta,
    // I7: takeover também vale pros envios do cron (lembrete/reagendada/
    // pós-limpeza) — Junior na conversa, a Eva espera o próximo ciclo.
    estaEmTakeover: (p: string) => takeover.isPaused(p),
    // 29/07: régua relativa — o recomputo da queda (reescrita/lembrete) usa a
    // MESMA mediana do radar (cache 5 min por empresa no MonitoringService).
    medianaDaCarteira7d: (companyId: string | null) =>
      monitoringService.medianaDaCarteira7d(companyId),
  });

  // Helper pra detectar e processar comandos de blog vindos do Junior.
  // Junior recebe notificacao de novo draft no WhatsApp dele e responde
  // "publicar" ou "descartar" — OU clica nos botoes interativos
  // ("publish-blog:<slug>" / "discard-blog:<slug>"), que normalizamos pro
  // mesmo formato textual logo abaixo pra reusar a logica.
  // Retorna true se comando foi processado (handler deve return depois).
  async function tryHandleJuniorBlogCommand(from: string, text: string): Promise<boolean> {
    if (!isAdminPhone(from)) return false;
    const raw = text.trim().toLowerCase();
    // Botao WABA → comando textual equivalente
    const btnMatch = raw.match(/^(publish|discard)-blog:([\w-]+)$/);
    const norm = btnMatch
      ? `${btnMatch[1] === 'publish' ? 'publicar' : 'descartar'} ${btnMatch[2]}`
      : raw;

    const publishMatch = norm.match(/^publicar(?:\s+([\w-]+))?$/);
    if (publishMatch) {
      const slug = publishMatch[1];
      let draft = slug
        ? (await blogGenerator.getPendingDrafts()).find((d) => d.slug === slug)
        : await blogGenerator.getMostRecentPending();

      if (!draft) {
        await sendText(from, slug
          ? `Nao achei draft pendente com slug "${slug}". Manda "publicar" sem o slug pra publicar o mais recente.`
          : 'Nao tem draft pendente agora. Vou avisar quando o proximo sair.');
        return true;
      }

      if (!config.githubPat || !config.githubSiteRepo) {
        // NAO marca como aprovado: deixa em pending pra Junior retentar quando configurar
        // o PAT/repo. Marcar como aprovado fazia o draft sumir de getPendingDrafts e quebrava
        // o retry sem intervencao manual no banco.
        await sendText(from, `⚠️ GitHub nao configurado no Easypanel (env GITHUB_PAT e/ou GITHUB_SITE_REPO). Draft "${draft.title}" segue como pendente — configure e responda "publicar" de novo.`);
        return true;
      }

      try {
        await blogGenerator.markApproved(draft.id);
        const { commitSha, url } = await publishDraftToGitHub({
          pat: config.githubPat,
          repo: config.githubSiteRepo,
          branch: config.githubSiteBranch,
          draft,
        });
        await blogGenerator.markPublished(draft.id);
        await sendText(from, `✅ Publicado!

📝 ${draft.title}
🔗 https://ecosunpower.eng.br/blog/${draft.slug}/

Cloudflare Pages publica em ~2 min. Commit: ${commitSha.slice(0, 7)}.`);
        console.log(`[blog] Junior publicou ${draft.slug} via WhatsApp. Commit: ${url}`);
      } catch (err) {
        const msg = (err as Error).message;
        await blogGenerator.markFailed(draft.id, msg);
        await sendText(from, `❌ Falha ao publicar: ${msg}`);
        console.error('[blog] Publish failed:', err);
      }
      return true;
    }

    const discardMatch = norm.match(/^descartar(?:\s+([\w-]+))?$/);
    if (discardMatch) {
      const slug = discardMatch[1];
      const draft = slug
        ? (await blogGenerator.getPendingDrafts()).find((d) => d.slug === slug)
        : await blogGenerator.getMostRecentPending();
      if (!draft) {
        await sendText(from, 'Nao tem draft pendente pra descartar.');
        return true;
      }
      await blogGenerator.markDiscarded(draft.id, 'descartado_pelo_junior');
      await sendText(from, `🗑️ Descartado: "${draft.title}". Vou gerar outro no proximo ciclo.`);
      return true;
    }

    if (norm === 'blog status' || norm === 'status blog') {
      const pending = await blogGenerator.getPendingDrafts();
      if (pending.length === 0) {
        await sendText(from, 'Nenhum draft pendente. O proximo gera no proximo ciclo (todo dia).');
      } else {
        const lines = pending.slice(0, 5).map((d, i) => `${i + 1}. ${d.title}\n   slug: ${d.slug}`).join('\n\n');
        await sendText(from, `📋 Drafts pendentes (${pending.length}):\n\n${lines}\n\nResponde "publicar" pra publicar o primeiro, ou "publicar <slug>" pra escolher.`);
      }
      return true;
    }

    return false;
  }

  // Eva Fechamento: handler do botão evabt:fechar:<leadId>. Busca lead +
  // última proposta, monta dados iniciais, entra em modo collecting.
  async function handleFecharStart(
    leadId: string,
    adminPhone: string,
    docsPedidos: ('procuracao' | 'contrato')[] = ['procuracao', 'contrato'],
  ): Promise<void> {
    try {
      const { lead, proposta } = await fetchByLeadId(supabase.getClient(), leadId);
      if (!lead) {
        await sendText(adminPhone, '⚠️ Lead não encontrado.');
        return;
      }
      const initialData = buildInitialData(lead, proposta);
      initialData.docs_pedidos = docsPedidos;
      const missing = findMissingRequired(initialData);
      const nome = lead.name;
      // Label amigavel do(s) doc(s) pedido(s)
      const docsLabel = docsPedidos.length === 1
        ? (docsPedidos[0] === 'procuracao' ? 'procuração' : 'contrato')
        : 'contrato + procuração';
      if (missing.length === 0) {
        await setClosingState(adminPhone, { stage: 'awaiting_confirm', data: initialData as DadosFechamento });
        if (metaWaba) {
          try {
            await metaWaba.sendInteractiveButtons(
              adminPhone,
              `Bora fechar ${nome}. Já tenho tudo. Confirma pra emitir ${docsLabel}.`,
              [
                { id: 'evabt:fechar-gerar', title: 'Gerar' },
                { id: 'evabt:fechar-ajustar', title: 'Ajustar' },
                { id: 'evabt:fechar-sair', title: 'Cancelar' },
              ],
            );
            return;
          } catch (err) {
            console.warn('[closing] sendInteractiveButtons fechar-gerar falhou:', (err as Error).message);
          }
        }
        await sendText(adminPhone, `Bora fechar ${nome}. Já tenho tudo. Confirma "gerar" pra emitir ${docsLabel}.`);
      } else {
        await setClosingState(adminPhone, { stage: 'collecting', data: initialData, pending_questions: missing });
        const bullets = humanizeMissing(missing);
        const corpo = `Bora fechar ${nome}. Achei os dados, falta:\n${bullets}\n\nPode mandar tudo junto.`;
        if (metaWaba) {
          try {
            await metaWaba.sendInteractiveButtons(
              adminPhone,
              corpo,
              [{ id: 'evabt:fechar-sair', title: 'Cancelar' }],
            );
            return;
          } catch (err) {
            console.warn('[closing] sendInteractiveButtons fechar-sair falhou:', (err as Error).message);
          }
        }
        await sendText(adminPhone, corpo);
      }
    } catch (err) {
      console.error('[closing] handleFecharStart erro:', (err as Error).message);
      await sendText(adminPhone, `⚠️ Erro: ${(err as Error).message.slice(0, 200)}`);
    }
  }

  // Gera os PDFs, sobe no Drive e responde ao Junior com botões.
  async function handleFecharGenerate(adminPhone: string): Promise<void> {
    const state = await getClosingState(adminPhone);
    if (!state || state.stage !== 'awaiting_confirm') {
      await sendText(adminPhone, '⚠️ Modo fechamento não está em fase de geração.');
      return;
    }
    if (!closingDriveUploader) {
      await sendText(adminPhone, '⚠️ Drive não configurado — não consigo subir os PDFs.');
      return;
    }
    const dados = state.data;
    try {
      const titularNome = dados.titular_uc.tipo === 'PF' ? dados.titular_uc.nome : dados.titular_uc.razao_social;
      const titularCpf = dados.titular_uc.tipo === 'PF' ? dados.titular_uc.cpf : dados.titular_uc.cnpj;
      // descobrir leadId do estado se houver — buscar por telefone
      const leadByPhone = await supabase.getLeadByPhone(adminPhone).catch(() => null);
      const leadId = leadByPhone?.id ?? null;

      const fechamentoId = await closingPersist.createFechamento({
        leadId,
        propostaPublicaId: null,
        dados,
        createdBy: adminPhone,
      });

      const version = leadId ? await closingPersist.nextVersionForLead(leadId) : 1;

      const wantsContrato = dados.docs_pedidos.includes('contrato');
      const wantsProcuracao = dados.docs_pedidos.includes('procuracao');

      let contratoHtml: string | undefined;
      let contratoPdf: Buffer | undefined;
      let procuracaoHtml: string | undefined;
      let procuracaoPdf: Buffer | undefined;

      if (wantsContrato) {
        contratoHtml = renderContrato(dados);
        contratoPdf = await renderHtmlToPdf(contratoHtml);
      }
      if (wantsProcuracao) {
        procuracaoHtml = renderProcuracao(dados);
        procuracaoPdf = await renderHtmlToPdf(procuracaoHtml);
      }

      const links = await closingDriveUploader.uploadFechamento({
        nomeTitular: titularNome,
        cpfTitular: titularCpf,
        ano: new Date().getFullYear().toString(),
        version,
        contratoHtml,
        contratoPdf,
        procuracaoHtml,
        procuracaoPdf,
        dadosInputJson: JSON.stringify(dados, null, 2),
      });

      await closingPersist.updateDriveLinks(fechamentoId, {
        contratoDriveId: links.contratoDriveId,
        contratoDriveLink: links.contratoDriveLink,
        procuracaoDriveId: links.procuracaoDriveId,
        procuracaoDriveLink: links.procuracaoDriveLink,
        driveFolderId: links.folderId,
      });

      await clearClosingState(adminPhone);

      const body = [
        `✅ Pronto pra ${titularNome}.`,
        links.contratoDriveLink ? `📄 Contrato: ${links.contratoDriveLink}` : null,
        links.procuracaoDriveLink ? `📄 Procuração: ${links.procuracaoDriveLink}` : null,
        `📁 Pasta: ${links.folderWebViewLink}`,
      ].filter(Boolean).join('\n');

      if (metaWaba) {
        try {
          await metaWaba.sendInteractiveButtons(adminPhone, body, [
            { id: `evabt:fechar-aprovar:${fechamentoId}`, title: 'Aprovar' },
            { id: `evabt:fechar-refazer:${fechamentoId}`, title: 'Refazer' },
            { id: `evabt:fechar-cancelar:${fechamentoId}`, title: 'Cancelar' },
          ]);
          // Engate Núcleo Financeiro: oferece lançar a venda como conta a
          // receber (escolha da atividade por botão). try/catch próprio —
          // falha aqui NÃO pode quebrar o /fechar.
          try {
            const valorVenda = Number(dados.comercial?.valor_total_brl ?? 0);
            if (valorVenda > 0) {
              const { getAtividades } = await import('./modules/financeiro/repo.js');
              const ativs = await getAtividades(supabase.getClient());
              // WhatsApp permite no máx 3 botões — 4ª atividade futura fica de fora daqui
              const botoes = ativs.slice(0, 3).map(a => ({
                id: `finrec:${fechamentoId}:${a.id}`,
                title: a.nome.slice(0, 20),
              }));
              if (botoes.length > 0) {
                await metaWaba.sendInteractiveButtons(
                  adminPhone,
                  `💰 Lançar ${valorVenda.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} no financeiro. Qual tipo de receita?`,
                  botoes,
                  'Núcleo Financeiro',
                );
              }
            }
          } catch (err) {
            console.warn('[financeiro] convite de lançamento falhou:', (err as Error).message);
          }
          return;
        } catch (err) {
          console.warn('[closing] WABA botões falhou, fallback texto:', (err as Error).message);
        }
      }
      await sendText(adminPhone, body + `\n\nResponde "/aprovar ${fechamentoId}", "/refazer ${fechamentoId}" ou "/cancelar ${fechamentoId}".`);
    } catch (err) {
      console.error('[closing] handleFecharGenerate erro:', (err as Error).message);
      await sendText(adminPhone, `⚠️ Erro ao gerar: ${(err as Error).message.slice(0, 200)}`);
    }
  }

  async function handleFecharApprove(fechamentoId: string, adminPhone: string): Promise<void> {
    try {
      await closingPersist.updateStatus(fechamentoId, 'aprovado_junior');
      // marca lead como 'cliente' (transferido) se houver lead vinculado
      const { data: fec } = await supabase.getClient()
        .from('fechamentos').select('lead_id').eq('id', fechamentoId).maybeSingle();
      const leadId = (fec as any)?.lead_id as string | null | undefined;
      if (leadId) {
        await supabase.getClient()
          .from('leads').update({ status: 'transferido', updated_at: new Date().toISOString() }).eq('id', leadId);
      }
      await sendText(adminPhone, '✅ Marcado como fechado. Lead virou cliente. Pode mandar pro cliente quando quiser.');
    } catch (err) {
      await sendText(adminPhone, `⚠️ Erro: ${(err as Error).message.slice(0, 200)}`);
    }
  }

  async function handleFecharRefazer(_fechamentoId: string, adminPhone: string): Promise<void> {
    await sendText(adminPhone, '🔄 Refazer ainda não implementado. Manda /fechar de novo pra recomeçar.');
  }

  // Handler do botão "Gerar" — chamado quando Junior tá em awaiting_confirm e
  // clica Gerar (em vez de digitar "gera").
  async function handleFecharGerarConfirm(adminPhone: string): Promise<void> {
    const state = await getClosingState(adminPhone);
    if (!state || state.stage !== 'awaiting_confirm') {
      await sendText(adminPhone, '⚠️ Nenhum fechamento pendente. Manda /fechar pra começar.');
      return;
    }
    await sendText(adminPhone, '⏳ Gerando PDFs...');
    await handleFecharGenerate(adminPhone);
  }

  // Handler do botão "Ajustar" — volta pra collecting mantendo dados.
  async function handleFecharAjustar(adminPhone: string): Promise<void> {
    const state = await getClosingState(adminPhone);
    if (!state) {
      await sendText(adminPhone, '⚠️ Nenhum fechamento pendente.');
      return;
    }
    const data = (state as any).data ?? {};
    await setClosingState(adminPhone, { stage: 'collecting', data, pending_questions: [] });
    await sendText(adminPhone, '✏️ Beleza. Manda o que quer mudar (ex: "valor 42 mil", "RG 1234567 SSP-DF", "contrato no nome do marido").');
  }

  // Handler do botão "Cancelar" — limpa o estado e sai do modo.
  async function handleFecharSair(adminPhone: string): Promise<void> {
    await clearClosingState(adminPhone);
    await sendText(adminPhone, '❌ Fechamento cancelado. Pra começar de novo manda /fechar.');
  }

  async function handleFecharCancel(fechamentoId: string, adminPhone: string): Promise<void> {
    try {
      await closingPersist.updateStatus(fechamentoId, 'cancelado');
      await sendText(adminPhone, '❌ Fechamento cancelado.');
    } catch (err) {
      await sendText(adminPhone, `⚠️ Erro: ${(err as Error).message.slice(0, 200)}`);
    }
  }

  // Comando /fechar [nome do cliente]
  async function tryHandleClosingCommand(from: string, text: string): Promise<boolean> {
    const isAdmin = isAdminPhone(from);
    const t = text.trim();
    const isTrigger = parseClosingCommand(t) !== null;
    let state = isAdmin ? await getClosingState(from) : null;
    const inMode = !!state;
    console.log(`[closing] gate from=${from}(${normalizeBrazilianPhone(from)}) admin=${isAdmin} inMode=${inMode} isTrigger=${isTrigger} text="${t.slice(0,40)}"`);
    if (!isAdmin) return false;
    if (!inMode && !isTrigger) return false;

    // Comando /fechar (com ou sem barra) sempre RESETA o modo, mesmo que já
    // exista estado leftover de tentativa anterior. Evita que o LLM trate o
    // novo /fechar como continuação do fluxo antigo.
    if (isTrigger && state) {
      console.log(`[closing] reset state leftover for ${from}`);
      await clearClosingState(from);
      state = null;
    }
    if (state) {
      try {
        const result = await closingAssistant.processMessage(t, state);
        if (result.newState.stage === 'cancelled') {
          await clearClosingState(from);
          await sendText(from, result.replyText);
          return true;
        }
        if (result.newState.stage === 'awaiting_confirm' && /^(gera|gerar|ok|sim|manda)$/i.test(t)) {
          await setClosingState(from, result.newState);
          await sendText(from, '⏳ Gerando PDFs...');
          await handleFecharGenerate(from);
          return true;
        }
        await setClosingState(from, result.newState);
        await sendText(from, result.replyText);
        return true;
      } catch (err) {
        console.error('[closing] processMessage erro:', (err as Error).message);
        await sendText(from, `⚠️ Erro: ${(err as Error).message.slice(0, 200)}`);
        return true;
      }
    }

    // Sem estado: precisa ser comando reconhecido (procuracao/contrato/fechar)
    const parsed = parseClosingCommand(t);
    if (!parsed) return false;
    const arg = parsed.name;
    const cmd = parsed.command;
    // Mapeia comando -> docs_pedidos (null = mostra botoes pra escolher quando match unico)
    const docsByCmd: Record<ClosingCommand, ('procuracao' | 'contrato')[] | null> = {
      procuracao: ['procuracao'],
      contrato: ['contrato'],
      fechar: null,
    };
    const docs = docsByCmd[cmd];

    if (!arg) {
      await setClosingState(from, { stage: 'collecting', data: { docs_pedidos: docs ?? undefined } as any, pending_questions: [] });
      const exemplo = cmd === 'procuracao' ? '/procuracao Camila'
                    : cmd === 'contrato' ? '/contrato Camila'
                    : '/fechar Camila';
      await sendText(from, `Pra qual cliente? Manda nome (ex: ${exemplo}) ou os dados completos.`);
      return true;
    }

    try {
      const termoBusca = arg.split(/[,;]/)[0].trim();
      const matches = await searchLeadByName(supabase.getClient(), termoBusca);
      const termoEhUmaPalavra = termoBusca.split(/\s+/).length === 1;

      if (matches.length === 0) {
        await setClosingState(from, { stage: 'collecting', data: { docs_pedidos: docs ?? undefined } as any, pending_questions: [] });
        await sendText(from, `Não achei "${arg}" no cadastro. Cliente novo? Manda os dados completos.`);
        return true;
      }

      // Match único só quando Junior passa termo específico (2+ palavras).
      // Termo genérico (1 palavra) SEMPRE mostra lista pra evitar fechar no
      // lead errado quando o nome se repete (ex: 2 Fernandas no banco).
      if (matches.length === 1 && !termoEhUmaPalavra) {
        if (docs) {
          await handleFecharStart(matches[0].id, from, docs);
        } else {
          // /fechar SEM doc especifico: mostra botoes [Procuracao] [Contrato] [Ambos]
          if (metaWaba) {
            await metaWaba.sendInteractiveButtons(from,
              `Achei: ${matches[0].name}. O que você quer gerar?`,
              [
                { id: `evabt:fechar-doc:procuracao:${matches[0].id}`, title: 'Procuração' },
                { id: `evabt:fechar-doc:contrato:${matches[0].id}`, title: 'Contrato' },
                { id: `evabt:fechar-doc:ambos:${matches[0].id}`, title: 'Ambos' },
              ],
            );
          } else {
            await sendText(from, `Achei: ${matches[0].name}. Manda "procuracao ${matches[0].name}", "contrato ${matches[0].name}" ou "fechar ${matches[0].name} ambos".`);
          }
        }
        return true;
      }

      // Lista de opções (1 match com termo genérico OU múltiplos)
      const linhaInfo = (mlead: typeof matches[0]) => {
        const tel = mlead.phone ? mlead.phone.slice(-11) : 's/ tel';
        return `${mlead.name} — ${tel}`;
      };

      if (metaWaba && matches.length <= 3) {
        // Quando cmd e procuracao/contrato, ja embute o doc no botao pra nao perder
        // contexto entre pick e handleFecharStart. Quando cmd=fechar, mantem o
        // pick generico (onFecharPick depois pergunta o modo).
        // Título do botão tem de ser único e ≤20 chars (nomes iguais → WABA "Duplicate
        // button title"). buildFecharPickButtons numera (1./2./3.) e deduplica por id.
        const btns = buildFecharPickButtons(matches, cmd);
        const corpo = matches.length === 1
          ? `Achei 1 lead "${termoBusca}":\n${linhaInfo(matches[0])}\n\nÉ esse?`
          : `Achei ${matches.length} leads com "${termoBusca}":\n${matches.slice(0, 3).map((m, i) => `${i + 1}. ${linhaInfo(m)}`).join('\n')}\n\nToca no número certo:`;
        await metaWaba.sendInteractiveButtons(from, corpo, btns);
      } else {
        const lista = matches.slice(0, 10).map((mlead, i) => `${i + 1}. ${linhaInfo(mlead)}`).join('\n');
        await sendText(from, `Achei ${matches.length} leads "${termoBusca}":\n${lista}\n\nManda /${cmd} <nome completo> pra escolher.`);
      }
      return true;
    } catch (err) {
      console.error(`[closing] /${cmd} erro:`, (err as Error).message);
      await sendText(from, `⚠️ Erro buscando lead: ${(err as Error).message.slice(0, 200)}`);
      return true;
    }
  }

  // ===== Fluxo dono-cad (cadastro de dono de usina órfã via WhatsApp) =====

  async function donoEnviarEscolha(from: string): Promise<void> {
    if (metaWaba) {
      await metaWaba.sendInteractiveButtons(from, 'Esse cliente já existe ou é novo?', [
        { id: 'evabt:dono-existe', title: 'Já existe' },
        { id: 'evabt:dono-novo', title: 'Criar novo' },
        { id: 'evabt:dono-cancelar', title: 'Cancelar' },
      ]);
    } else {
      await sendText(from, 'Esse cliente já existe ou é novo? Responda: existe / novo / cancelar');
    }
  }

  async function donoIniciarEtapaUsina(from: string, sistemaId: string): Promise<void> {
    const sistema = await supabase.getSistemaById(sistemaId);
    const pendentes = sistema ? camposVaziosUsina(sistema) : [...CAMPOS_USINA];
    if (pendentes.length === 0) { await donoFinalizar(from, sistemaId); return; }
    await setDonoCadState(from, { etapa: 'usina', sistemaId, pendentes, idx: 0 });
    await donoPerguntarUsina(from, pendentes[0]);
  }

  async function donoPerguntarUsina(from: string, campo: typeof CAMPOS_USINA[number]): Promise<void> {
    if (metaWaba) {
      await metaWaba.sendInteractiveButtons(from, perguntaUsina(campo), [
        { id: 'evabt:dono-pular', title: 'Pular' },
        { id: 'evabt:dono-pular-tudo', title: 'Pular tudo' },
        { id: 'evabt:dono-cancelar', title: 'Cancelar' },
      ]);
    } else {
      await sendText(from, `${perguntaUsina(campo)} (ou: pular / pular tudo / cancelar)`);
    }
  }

  async function donoFinalizar(from: string, sistemaId: string): Promise<void> {
    await clearDonoCadState(from);
    const sistema = await supabase.getSistemaById(sistemaId);
    const lead = sistema?.lead_id ? await supabase.getLeadById(sistema.lead_id) : null;
    await sendText(from, `✅ Tudo cadastrado! A usina ${sistema?.apelido ?? ''} agora é de ${lead?.name ?? 'cliente'}. Próximos alertas já vêm certinhos.`);
  }

  async function donoAvancarNovo(
    from: string,
    st: Extract<DonoCadState, { etapa: 'novo' }>,
    valor: string | undefined,
  ): Promise<void> {
    const dados = { ...st.dados };
    if (valor !== undefined) {
      if (st.campo === 'phone') dados.phone = valor.replace(/\D/g, '');
      else if (st.campo === 'uf') dados.uf = valor.trim().toUpperCase().slice(0, 2);
      else (dados as Record<string, unknown>)[st.campo] = valor.trim();
    }
    if (valor !== undefined && st.campo === 'phone' && (dados.phone ?? '').length < 10) {
      await sendText(from, '⚠️ Telefone inválido. Manda com DDD, ex: 61 99999-8888.');
      return; // não avança, mantém o estado em phone
    }
    const prox = proximoCampoNovo(st.campo);
    if (prox === 'fim') {
      if (!dados.name || !dados.phone || dados.phone.length < 10) {
        await sendText(from, '⚠️ Nome e telefone válidos são obrigatórios. Recomeça pelo botão Cadastrar dono.');
        await clearDonoCadState(from);
        return;
      }
      const r = await supabase.vincularNovoLeadAoSistema({
        sistema_id: st.sistemaId,
        name: dados.name, phone: dados.phone,
        email: dados.email ?? null, city: dados.city ?? null, uf: dados.uf ?? null, cep: dados.cep ?? null,
      });
      if (!r.ok) { await sendText(from, `⚠️ ${r.error ?? 'Falha ao criar cliente'}`); await clearDonoCadState(from); return; }
      if (r.reused) {
        await sendText(from, `ℹ️ Esse telefone já era do cliente *${r.reusedName ?? dados.name}* — liguei ele na usina (não dupliquei). Agora os dados da usina.`);
      } else {
        await sendText(from, `✅ Cliente ${dados.name} criado e ligado à usina. Agora os dados da usina.`);
      }
      await donoIniciarEtapaUsina(from, st.sistemaId);
      return;
    }
    await setDonoCadState(from, { ...st, campo: prox, dados });
    if (campoObrigatorioNovo(prox)) await sendText(from, perguntaNovo(prox));
    else if (metaWaba) await metaWaba.sendInteractiveButtons(from, perguntaNovo(prox), [
      { id: 'evabt:dono-pular', title: 'Pular' }, { id: 'evabt:dono-cancelar', title: 'Cancelar' },
    ]);
    else await sendText(from, `${perguntaNovo(prox)} (ou: pular / cancelar)`);
  }

  async function donoAvancarUsina(
    from: string,
    st: Extract<DonoCadState, { etapa: 'usina' }>,
    valor: string | undefined,
  ): Promise<void> {
    const campo = st.pendentes[st.idx];
    if (valor !== undefined && campo) {
      const patch: Record<string, unknown> = {};
      if (campo === 'potencia_kwp') { const n = Number(valor.replace(',', '.')); if (Number.isFinite(n)) patch.potencia_kwp = n; }
      else if (campo === 'uf') patch.uf = valor.trim().toUpperCase().slice(0, 2);
      else patch[campo] = valor.trim();
      if (Object.keys(patch).length > 0) await monitoringService.atualizarSistema(st.sistemaId, patch);
    }
    const proxIdx = st.idx + 1;
    if (proxIdx >= st.pendentes.length) { await donoFinalizar(from, st.sistemaId); return; }
    await setDonoCadState(from, { ...st, idx: proxIdx });
    await donoPerguntarUsina(from, st.pendentes[proxIdx]);
  }

  async function tryHandleDonoCadCommand(from: string, text: string): Promise<boolean> {
    if (!isAdminPhone(from)) return false;
    const st = await getDonoCadState(from);
    if (!st) return false;
    const t = text.trim();
    if (/^cancelar$/i.test(t)) { await clearDonoCadState(from); await sendText(from, 'Cadastro cancelado.'); return true; }

    if (st.etapa === 'busca') {
      // Fluxo do zap do ADMIN EcoSun (isAdminPhone acima) → busca presa à casa.
      const achados = await supabase.searchClientesParaVinculo(t, ECOSUN_COMPANY_ID, 3);
      if (achados.length === 0) {
        if (metaWaba) await metaWaba.sendInteractiveButtons(from, 'Não achei ninguém com esse nome. Quer criar novo?', [
          { id: 'evabt:dono-novo', title: 'Criar novo' }, { id: 'evabt:dono-cancelar', title: 'Cancelar' },
        ]);
        else await sendText(from, 'Não achei. Responda: novo / cancelar');
        return true;
      }
      const botoes = achados.slice(0, 2).map((c) => ({ id: `evabt:dono-pick:${c.id}`, title: (c.name ?? 'sem nome').slice(0, 20) }));
      botoes.push({ id: 'evabt:dono-novo', title: 'Criar novo' });
      const corpo = 'Achei estes — escolha:\n' + achados.map((c) => `• ${c.name ?? '(sem nome)'} — ${[c.phone, c.city].filter(Boolean).join(' · ')}`).join('\n');
      if (metaWaba) await metaWaba.sendInteractiveButtons(from, corpo, botoes);
      else await sendText(from, corpo + '\n(responda o nome exato ou: novo)');
      return true;
    }

    if (st.etapa === 'novo') {
      if (ehPular(t) && !campoObrigatorioNovo(st.campo)) { await donoAvancarNovo(from, st, undefined); return true; }
      await donoAvancarNovo(from, st, t);
      return true;
    }

    if (st.etapa === 'usina') {
      if (ehPular(t)) { await donoAvancarUsina(from, st, undefined); return true; }
      await donoAvancarUsina(from, st, t);
      return true;
    }

    if (/^existe$/i.test(t)) { await setDonoCadState(from, { etapa: 'busca', sistemaId: st.sistemaId }); await sendText(from, 'Qual o nome do cliente?'); return true; }
    if (/^novo$/i.test(t)) { await setDonoCadState(from, { etapa: 'novo', sistemaId: st.sistemaId, campo: 'name', dados: {} }); await sendText(from, perguntaNovo('name')); return true; }
    return true;
  }

  // Eva Precificadora: prioridade ABSOLUTA quando Junior está em modo precificação,
  // ou quando ele dispara /preco. So responde pro engineerPhone (numero do Junior),
  // pra cliente comum nem entra nesse caminho. Helper de phone tolera variação de formato
  // entre WABA e Evolution (com/sem +55, com/sem @c.us) — mesma logica do blog command.
  async function tryHandlePricingCommand(from: string, text: string): Promise<boolean> {
    const isAdmin = isAdminPhone(from);
    const inMode = isAdmin ? await pricingAssistant.isInPricingMode(from) : false;
    const isTrigger = isAdmin ? PricingAssistant.isPricingTrigger(text) : false;

    console.log(`[pricing] gate from=${from}(${normalizeBrazilianPhone(from)}) admin=${isAdmin} inMode=${inMode} isTrigger=${isTrigger} text="${text.slice(0,40)}"`);

    if (!isAdmin) return false;
    if (!inMode && !isTrigger) return false;

    try {
      let reply: string;
      if (!inMode && isTrigger) {
        reply = await pricingAssistant.startPricingMode(from, text);
      } else {
        reply = await pricingAssistant.processPricingMessage(from, text);
      }
      await sendText(from, reply);
    } catch (err) {
      console.error('[pricing] Error:', (err as Error).message);
      await sendText(from, '⚠️ Erro no cálculo. Tenta de novo ou /sair pra fechar.');
    }
    return true;
  }

  // Eva Proposta: prioridade alta. Junior digita /proposta + dados do cliente,
  // Eva coleta conversacionalmente, gera PDF + HTML, salva Drive, retorna links.
  async function tryHandleProposalCommand(from: string, text: string): Promise<boolean> {
    const isAdmin = isAdminPhone(from);
    const inMode = isAdmin ? await proposalAssistant.isInProposalMode(from) : false;
    const isTrigger = isAdmin ? ProposalAssistant.isProposalTrigger(text) : false;

    console.log(`[proposal] gate from=${from}(${normalizeBrazilianPhone(from)}) admin=${isAdmin} inMode=${inMode} isTrigger=${isTrigger} text="${text.slice(0,40)}"`);

    if (!isAdmin) return false;
    if (!inMode && !isTrigger) return false;

    try {
      let reply: string;
      if (!inMode && isTrigger) {
        reply = await proposalAssistant.startProposalMode(from, text);
      } else {
        reply = await proposalAssistant.processProposalMessage(from, text);
      }
      // Se proposta foi gerada com sucesso (mensagem contém "Proposta gerada"),
      // adiciona botão "Fechou venda" pra Junior fechar venda direto. Busca o
      // lead_id real pela proposta_publica mais recente (cliente_telefone).
      if (/Proposta (de serviço )?gerada/i.test(reply) && metaWaba) {
        let leadId: string | null = null;
        try {
          const { data: ultimaProp } = await supabase.getClient()
            .from('propostas_publicas')
            .select('cliente_telefone')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          const clienteTel = (ultimaProp as { cliente_telefone?: string } | null)?.cliente_telefone;
          if (clienteTel) {
            const leadCliente = await supabase.getLeadByPhone(clienteTel).catch(() => null);
            leadId = (leadCliente as { id?: string } | null)?.id ?? null;
          }
        } catch (err) {
          console.warn('[proposal] busca lead pra botão fechar falhou:', (err as Error).message);
        }
        // Botões pós-geração (sem /), 1 balão só: caminho limpo entre clientes.
        // eva_envia: Enviar · Ajustar · Nova proposta. junior_envia: Ajustar · Nova
        // proposta · Fechou venda (quando achou o lead). "Nova proposta" zera o rascunho.
        let modoEnvioPos: string | undefined;
        try { modoEnvioPos = (await proposalAssistant.getSessionState(from))?.modoEnvio; } catch { /* noop */ }
        const botoesPos = modoEnvioPos === 'eva_envia'
          ? [
              { id: 'prop:enviar', title: '✅ Enviar' },
              { id: 'prop:ajustar', title: '✏️ Ajustar' },
              { id: 'prop:nova', title: '🆕 Nova proposta' },
            ]
          : [
              { id: 'prop:ajustar', title: '✏️ Ajustar' },
              { id: 'prop:nova', title: '🆕 Nova proposta' },
              ...(leadId ? [{ id: `evabt:fechar:${leadId}`, title: '💰 Fechou venda' }] : []),
            ];
        try {
          await metaWaba.sendInteractiveButtons(from, reply, botoesPos);
        } catch {
          await sendText(from, reply);
        }
      } else {
        await sendText(from, reply);
      }
    } catch (err) {
      console.error('[proposal] Error:', (err as Error).message);
      await sendText(from, '⚠️ Erro na proposta. Tenta de novo ou /sair pra fechar.');
    }
    return true;
  }

  // Eva Agendadora: prioridade absoluta apos pricing. Mesmo padrao de gate.
  async function tryHandleSchedulingCommand(from: string, text: string): Promise<boolean> {
    if (!schedulingAssistant) return false;

    const isAdmin = isAdminPhone(from);
    const inMode = isAdmin ? await schedulingAssistant.isInSchedulingMode(from) : false;
    const isTrigger = isAdmin ? SchedulingAssistant.isSchedulingTrigger(text) : false;

    console.log(`[scheduling] gate from=${from}(${normalizeBrazilianPhone(from)}) admin=${isAdmin} inMode=${inMode} isTrigger=${isTrigger} text="${text.slice(0,40)}"`);

    if (!isAdmin) return false;
    if (!inMode && !isTrigger) return false;

    try {
      let reply: string;
      if (!inMode && isTrigger) {
        reply = await schedulingAssistant.startSchedulingMode(from, text);
      } else {
        reply = await schedulingAssistant.processSchedulingMessage(from, text);
      }
      await sendText(from, reply);
    } catch (err) {
      console.error('[scheduling] Error:', (err as Error).message);
      await sendText(from, '⚠️ Erro no agendamento. Tenta de novo ou /sair pra fechar.');
    }
    return true;
  }

  // Comandos admin de depoimento (tabela testimonials) e review publico (tabela public_reviews).
  // /aprovar-depoimento <id>  -> testimonials.usable_for_marketing=true + rebuild
  // /google-postou <id>       -> testimonials.google_posted=true + rebuild
  // /aprovar-review <id>      -> public_reviews.approved_for_marketing=true + rebuild
  // /reviews-pendentes        -> lista as ultimas 10 public_reviews aguardando aprovacao
  async function tryHandleTestimonialAdminCommand(from: string, text: string): Promise<boolean> {
    if (!isAdminPhone(from)) return false;

    const trimmed = text.trim();
    const matchAprovar = trimmed.match(/^\/aprovar-depoimento\s+(\S+)$/i);
    const matchGoogle = trimmed.match(/^\/google-postou\s+(\S+)$/i);
    const matchAprovarReview = trimmed.match(/^\/aprovar-review\s+(\S+)$/i);
    const matchListarReviews = /^\/reviews-pendentes$/i.test(trimmed);
    // Botoes interativos enviam id no formato "approve:<reviewId>" ou "ignore:<reviewId>"
    const matchApproveBtn = trimmed.match(/^approve:(.+)$/);
    const matchIgnoreBtn = trimmed.match(/^ignore:(.+)$/);
    // Botoes de depoimento (testimonials) — disparados pelo aviso de depoimento positivo
    const matchApproveTest = trimmed.match(/^approve-testimonial:(.+)$/);
    const matchIgnoreTest = trimmed.match(/^ignore-testimonial:(.+)$/);

    if (!matchAprovar && !matchGoogle && !matchAprovarReview && !matchListarReviews && !matchApproveBtn && !matchIgnoreBtn && !matchApproveTest && !matchIgnoreTest) return false;

    try {
      if (matchAprovar) {
        const id = matchAprovar[1];
        await testimonials.setUsableForMarketing(id, true);
        const ok = await siteDeploy.dispatchRebuild();
        const tail = ok ? 'Site rebuildando em ~30s.' : 'CLOUDFLARE_DEPLOY_HOOK_URL nao configurado — depoimento aprovado mas site nao rebuildou.';
        await sendText(from, `✅ Depoimento ${id} aprovado pra marketing. ${tail}`);
      } else if (matchGoogle) {
        const id = matchGoogle[1];
        await testimonials.markGooglePosted(id);
        const ok = await siteDeploy.dispatchRebuild();
        const tail = ok ? 'Selo "Verificado no Google" aparece apos rebuild.' : 'Site nao rebuildou (deploy hook ausente).';
        await sendText(from, `✅ Depoimento ${id} marcado como postado no Google. ${tail}`);
      } else if (matchAprovarReview) {
        const id = matchAprovarReview[1];
        const row = await publicReviews.approve(id);
        const ok = await siteDeploy.dispatchRebuild();
        const tail = ok ? 'Site rebuildando em ~30s.' : 'CLOUDFLARE_DEPLOY_HOOK_URL nao configurado — review aprovado mas site nao rebuildou.';
        await sendText(from, `✅ Review ${row.cliente_nome} (${row.estrelas}⭐) aprovado. ${tail}`);
      } else if (matchListarReviews) {
        const pending = await publicReviews.listPending(10);
        if (pending.length === 0) {
          await sendText(from, 'Nenhum review pendente de aprovacao 🎉');
        } else {
          const lines = pending.map(r => {
            const cidade = r.cliente_cidade ? ` · ${r.cliente_cidade}` : '';
            const texto = r.texto ? `\n   "${r.texto.slice(0, 120)}${r.texto.length > 120 ? '...' : ''}"` : '';
            return `• ${r.cliente_nome} (${r.estrelas}⭐)${cidade}${texto}\n   id: ${r.id}`;
          });
          await sendText(from, `📝 ${pending.length} review(s) pendente(s):\n\n${lines.join('\n\n')}\n\nPra aprovar: /aprovar-review <id>`);
        }
      } else if (matchApproveBtn) {
        const id = matchApproveBtn[1];
        const row = await publicReviews.approve(id);
        const ok = await siteDeploy.dispatchRebuild();
        const tail = ok ? 'Site rebuildando em ~30s.' : 'Deploy hook nao configurado.';
        await sendText(from, `✅ Review do ${row.cliente_nome} aprovada e publicada. ${tail}`);
      } else if (matchIgnoreBtn) {
        // Ignorar = nao publicar. Review fica em public_reviews mas approved=false.
        // Ja foi marcado como notified, entao nao notifica de novo. Suficiente.
        await sendText(from, '🗑️ Review ignorada. Não vai aparecer no site.');
      } else if (matchApproveTest) {
        const id = matchApproveTest[1];
        await testimonials.setUsableForMarketing(id, true);
        const ok = await siteDeploy.dispatchRebuild();
        const tail = ok ? 'Site rebuildando em ~30s.' : 'CLOUDFLARE_DEPLOY_HOOK_URL nao configurado — depoimento aprovado mas site nao rebuildou.';
        await sendText(from, `✅ Depoimento ${id} aprovado pra marketing. ${tail}`);
      } else if (matchIgnoreTest) {
        const id = matchIgnoreTest[1];
        // Ignorar = nao usar no marketing. Depoimento fica em testimonials mas
        // usable_for_marketing=false (default). Suficiente — nao precisa deletar.
        // Log barato pra rastrear caso Junior reclame "perdi um depoimento".
        console.log(`[testimonial-admin] ignored ${id}`);
        await sendText(from, '🗑️ Depoimento ignorado. Não vai aparecer no marketing.');
      }
    } catch (err) {
      console.error('[testimonial-admin] Error:', (err as Error).message);
      await sendText(from, `⚠️ Erro: ${(err as Error).message}`);
    }
    return true;
  }

  // Eva /novo-case — Junior cadastra obra (case) via WhatsApp.
  // Estado em Redis. Aceita texto (perguntas) e midia (foto/video) na fase final.
  async function tryHandleCaseCreatorCommand(from: string, text: string): Promise<boolean> {
    if (!caseCreator) return false;
    if (!isAdminPhone(from)) return false;

    const inMode = await caseCreator.isInCreatorMode(from);
    const isTrigger = CaseCreatorAssistant.isCaseCreatorTrigger(text);

    if (!inMode && !isTrigger) return false;

    try {
      let reply: string;
      if (!inMode && isTrigger) {
        reply = await caseCreator.startMode(from);
      } else {
        reply = await caseCreator.processMessage(from, text);
      }
      if (reply) await sendText(from, reply);
    } catch (err) {
      console.error('[case-creator] Error:', (err as Error).message);
      await sendText(from, '⚠️ Erro no /novo-case. Tenta de novo ou /cancelar-case pra abortar.');
    }
    return true;
  }

  // Captura midia (foto/video) quando Junior esta em modo /novo-case.
  async function tryHandleCaseCreatorMedia(from: string, mediaId: string, type: 'image' | 'video'): Promise<boolean> {
    if (!caseCreator) return false;
    if (!isAdminPhone(from)) return false;
    if (!(await caseCreator.isInCreatorMode(from))) return false;

    try {
      const reply = await caseCreator.processMedia(from, mediaId, type);
      if (reply) await sendText(from, reply);
    } catch (err) {
      console.error('[case-creator] media error:', (err as Error).message);
    }
    return true;
  }

  // Eva /criativo — Junior dispara geracao de pacote criativo (3 copies + 3 imagens)
  // por uma persona/briefing. Eva responde com preview + botoes Aprovar/Regenerar/Descartar.
  // Botoes interativos chegam no webhook como text com content = button_id (ex:
  // "criativo_aprovar_42") — handler unifica os dois caminhos (texto livre /criativo e
  // tap em botao) na mesma funcao, mesmo padrao do tryHandleTestimonialAdminCommand.
  //
  // FLUXO CONVERSACIONAL (refatorado 10/05 — feedback Junior: texto livre + codigo
  // com underscore = UX terrivel + persona faltava porque lista era hard-coded):
  //   1. Junior digita "criativo" (sem barra) ou "/criativo" sozinho
  //   2. Eva manda Interactive List com personas DO BANCO (sem hard-code)
  //   3. Junior toca uma persona → id "criativo_persona_<codigo>" chega como texto
  //   4. Eva pergunta o briefing texto livre (estado em creativeFlowState)
  //   5. Junior responde briefing → generatePackage dispara
  //
  // Compat: parse antigo "/criativo <persona> <briefing>" continua funcionando.

  // Estado conversacional do fluxo /criativo. In-memory (replicas separadas tem
  // estados independentes — aceitavel pq fluxo dura segundos/minutos e Junior
  // sempre fala com a mesma replica via WhatsApp). Auto-cleanup 10min.
  const creativeFlowState = new Map<string, {
    step: 'awaiting_persona' | 'awaiting_briefing';
    persona_codigo?: string;
    createdAt: number;
  }>();

  // Estado do "Fechei uma venda" clicável: depois que o Junior toca no cliente,
  // a Eva pergunta o valor e guarda aqui quem está esperando resposta. Expira em
  // 10min (a limpeza abaixo cuida). In-memory: se o processo reinicia, o pior
  // caso é o Junior somar o valor pelo painel — a venda já ficou registrada.
  const fecheiValorState = new Map<string, { leadId: string; nome: string; createdAt: number }>();

  setInterval(() => {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [k, v] of creativeFlowState) {
      if (v.createdAt < cutoff) creativeFlowState.delete(k);
    }
    for (const [k, v] of fecheiValorState) {
      if (v.createdAt < cutoff) fecheiValorState.delete(k);
    }
  }, 5 * 60 * 1000).unref();

  // Estado conversacional do /banner — in-memory, limpa apos 30min de inatividade.
  interface BannerModeState {
    step: 'titulo' | 'kit' | 'kwh' | 'preco'
        | 'modulo' | 'modulo_livre'
        | 'inversor' | 'inversor_livre'
        | 'tipo'
        | 'bateria' | 'bateria_livre'
        | 'estrutura' | 'estrutura_livre'
        | 'confirm';
    data: {
      titulo?: string;
      kit?: number;
      kwh?: number;
      preco?: number;
      marca_modulo?: string;
      marca_inversor?: string;
      marca_bateria?: string;
      tipo_inversor?: 'micro' | 'string' | 'otimizado' | 'hibrido';
      tipo_estrutura?: string;
    };
    started_at: number;
  }
  const bannerModes = new Map<string, BannerModeState>();
  const BANNER_MODE_TIMEOUT_MS = 30 * 60 * 1000;

  function clearStaleBannerModes() {
    const now = Date.now();
    for (const [phone, state] of bannerModes.entries()) {
      if (now - state.started_at > BANNER_MODE_TIMEOUT_MS) bannerModes.delete(phone);
    }
  }

  // Gera banner com state pronto + envia via WABA + persiste em marketing_creatives.
  async function generateAndSendBanner(from: string, state: BannerModeState) {
    const d = state.data;
    if (!d.titulo || !d.kit || !d.kwh || !d.preco) {
      await sendText(from, '❌ Faltam campos obrigatórios.');
      return;
    }
    try {
      const { renderBannerMegaOferta } = await import('./modules/marketing/banner-renderer.js');
      const png = await renderBannerMegaOferta({
        titulo: d.titulo,
        kit_placas: d.kit,
        kwh_mes: d.kwh,
        preco_brl: d.preco,
        ...(d.marca_modulo ? { marca_modulo: d.marca_modulo } : {}),
        ...(d.marca_inversor ? { marca_inversor: d.marca_inversor } : {}),
        ...(d.tipo_inversor ? { tipo_inversor: d.tipo_inversor } : {}),
        ...(d.tipo_estrutura ? { tipo_estrutura: d.tipo_estrutura } : {}),
      });
      if (!metaWaba) {
        await sendText(from, '❌ metaWaba nao configurado.');
        return;
      }
      const ts = Date.now();
      const slug = `${ts}-${d.titulo?.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) ?? 'banner'}`;

      // Upload pro Supabase Storage (bucket ad-creatives) pra dar link em
      // qualidade TOTAL (WhatsApp comprime imagem enviada). Junior usa o link
      // pra baixar/subir no Meta Ads Manager sem perda.
      let publicUrl: string | null = null;
      try {
        const { CreativeStorage } = await import('./modules/marketing/creative-storage.js');
        const storage = new CreativeStorage(supabase.getClient());
        const uploaded = await storage.uploadBanner(png, slug);
        publicUrl = uploaded.publicUrl;
        console.log(`[banner] uploaded to Storage: ${publicUrl}`);
      } catch (err) {
        console.warn(`[banner] Storage upload falhou (bucket ad-creatives existe e e publico?):`, (err as Error).message);
      }

      const { mediaId } = await metaWaba.uploadMedia(png, 'image/png', `banner-${ts}.png`);
      const caption = `🎨 *${d.titulo}*\nKit ${d.kit} placas · ${d.kwh} kWh/mês · R$ ${d.preco.toFixed(2).replace('.', ',')}` +
        (publicUrl ? `\n\n🔗 *Qualidade total (use no Meta Ads):*\n${publicUrl}` : '');
      await metaWaba.sendImageById(from, mediaId, caption);

      // Persiste briefing pra reaproveitar (regenerar variacoes depois)
      try {
        await supabase.getClient().from('marketing_creatives').insert({
          persona_id: 1, // placeholder; banners nao tem persona dedicada
          briefing: `Banner promo: ${d.titulo}`,
          status: 'em_uso',
          imagens: JSON.stringify([{ type: 'banner_promo', briefing_json: d }]),
          copies: JSON.stringify([{ headline: d.titulo, body: `${d.kit} placas · ${d.kwh} kWh · R$ ${d.preco.toFixed(2)}`, cta: 'Faça já o seu orçamento GRÁTIS' }]),
          cta_primario: 'Faça já o seu orçamento GRÁTIS',
          created_by_model: 'satori-banner-renderer',
          approved_by_phone: from,
        });
        console.log(`[banner] persistido em marketing_creatives pra ${from}`);
      } catch (err) {
        console.warn('[banner] persistencia falhou (banner ja enviado, ok):', (err as Error).message);
      }
    } catch (err) {
      console.error('[banner] geracao falhou:', err);
      await sendText(from, `❌ Falhou ao gerar: ${(err as Error).message}`);
    }
  }

  // Handler conversacional do /banner: processa respostas durante modo ativo.
  // Roda ANTES do tryHandleBannerCommand pra capturar mensagens sem trigger.
  async function tryHandleBannerModeStep(from: string, text: string): Promise<boolean> {
    if (!isAdminPhone(from)) return false;
    clearStaleBannerModes();
    const state = bannerModes.get(from);
    if (!state) return false;

    const t = text.trim();
    if (/^cancelar$/i.test(t)) {
      bannerModes.delete(from);
      await sendText(from, '❌ Banner cancelado. Manda "menu" pra recomecar.');
      return true;
    }
    if (/^\/?banner\b/i.test(t)) {
      // Reinicia se digitar /banner de novo no meio
      bannerModes.set(from, { step: 'titulo', data: {}, started_at: Date.now() });
      await sendText(from, `🔄 Reiniciando.\n\n*1/9 — Qual o título?*\nExemplo: "OFERTA DE MAIO"`);
      return true;
    }

    const pular = /^(pular|skip|nao|não|-|x)$/i.test(t);

    switch (state.step) {
      case 'titulo':
        state.data.titulo = t || 'OFERTA ESPECIAL';
        state.step = 'kit';
        await sendText(from, `*2/8 — Quantas placas no kit?*\nDigite só o número (ex: 8)`);
        return true;

      case 'kit': {
        const n = parseInt(t.replace(/\D/g, ''), 10);
        if (!n || n < 1 || n > 200) {
          await sendText(from, `❌ Quantidade invalida. Manda so o numero (ex: 8).`);
          return true;
        }
        state.data.kit = n;
        state.step = 'kwh';
        await sendText(from, `*3/8 — Quanto gera por mês (kWh)?*\nEx: 700`);
        return true;
      }

      case 'kwh': {
        const n = parseInt(t.replace(/\D/g, ''), 10);
        if (!n || n < 1) {
          await sendText(from, `❌ Valor invalido. Manda so o numero (ex: 700).`);
          return true;
        }
        state.data.kwh = n;
        state.step = 'preco';
        await sendText(from, `*4/8 — Qual o preço final?*\nEx: 15443.17 (use ponto ou vírgula pros centavos)`);
        return true;
      }

      case 'preco': {
        const cleaned = t.replace(/[^\d.,]/g, '');
        let n: number;
        if (cleaned.includes(',')) {
          // Formato BR: pontos = milhares, virgula = decimal
          // Ex: 15.443,00 -> remove pontos -> 15443,00 -> troca virgula -> 15443.00
          n = parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
        } else {
          // So pontos: heuristica
          const parts = cleaned.split('.');
          if (parts.length === 1) {
            // Sem ponto: int puro
            n = parseFloat(cleaned);
          } else if (parts.length === 2 && parts[1].length === 3) {
            // 1 ponto, 3 digitos depois: milhar (ex: 15.443 = 15443)
            n = parseFloat(parts.join(''));
          } else if (parts.length === 2) {
            // 1 ponto, 1-2 digitos depois: decimal (ex: 15443.17, 17.5)
            n = parseFloat(cleaned);
          } else {
            // 2+ pontos: ultimo eh decimal se tem 1-2 digitos, resto eh milhar
            const last = parts[parts.length - 1];
            if (last.length <= 2) {
              n = parseFloat(parts.slice(0, -1).join('') + '.' + last);
            } else {
              // Todos pontos sao milhares
              n = parseFloat(parts.join(''));
            }
          }
        }
        if (!Number.isFinite(n) || n < 100) {
          await sendText(from, `❌ Preço invalido. Tenta formatos: 15443.17, 15443,17, 15.443,17, 15443`);
          return true;
        }
        state.data.preco = n;
        return await askModulo(from, state);
      }

      case 'modulo': {
        // Mapeia id de lista clicada
        const modulosMap: Record<string, string> = {
          bm_risen: 'Risen 700W HJT',
          bm_longi: 'LONGi Hi-MO X10',
          bm_ja: 'JA Solar 590W',
          bm_trina: 'Trina Solar',
        };
        if (modulosMap[t]) {
          state.data.marca_modulo = modulosMap[t];
          return await askInversor(from, state);
        }
        if (t === 'bm_outra') {
          state.step = 'modulo_livre';
          await sendText(from, `Digita a marca/modelo do módulo:\nEx: "Canadian Solar 555W"`);
          return true;
        }
        if (t === 'bm_pular') {
          return await askInversor(from, state);
        }
        // Se digitou texto sem clicar botão, aceita
        if (!pular && t.length > 1) state.data.marca_modulo = t;
        return await askInversor(from, state);
      }

      case 'modulo_livre':
        if (!pular) state.data.marca_modulo = t;
        return await askInversor(from, state);

      case 'inversor': {
        const inversorMap: Record<string, string> = {
          bi_hoymiles: 'Hoymiles 2,25 kW',
          bi_sungrow: 'Sungrow SG10RT',
          bi_deye: 'Deye SUN-10K-SG04LP3',
          bi_solis: 'Solis S6-GR1P',
          bi_huawei: 'Huawei SUN2000',
          bi_solaredge: 'SolarEdge SE7600H',
          bi_foxess: 'FoxESS T10-G3',
        };
        if (inversorMap[t]) {
          state.data.marca_inversor = inversorMap[t];
          return await askTipo(from, state);
        }
        if (t === 'bi_outra') {
          state.step = 'inversor_livre';
          await sendText(from, `Digita a marca/modelo do inversor:\nEx: "Growatt MIN 5000TL-X"`);
          return true;
        }
        if (t === 'bi_pular') {
          return await askTipo(from, state);
        }
        if (!pular && t.length > 1) state.data.marca_inversor = t;
        return await askTipo(from, state);
      }

      case 'inversor_livre':
        if (!pular) state.data.marca_inversor = t;
        return await askTipo(from, state);

      case 'tipo': {
        const tipoMap: Record<string, 'micro' | 'string' | 'otimizado' | 'hibrido'> = {
          bt_micro: 'micro',
          bt_string: 'string',
          bt_otim: 'otimizado',
          bt_hibrido: 'hibrido',
        };
        if (tipoMap[t]) {
          state.data.tipo_inversor = tipoMap[t];
        } else if (!pular) {
          const tipo = t.toLowerCase();
          if (tipo === 'micro' || tipo === 'string' || tipo === 'otimizado' || tipo === 'hibrido' || tipo === 'híbrido') {
            state.data.tipo_inversor = tipo === 'híbrido' ? 'hibrido' : tipo as 'micro' | 'string' | 'otimizado' | 'hibrido';
          }
        }
        return await askBateria(from, state);
      }

      case 'bateria': {
        const bateriaMap: Record<string, string> = {
          bb_deye: 'Deye 5,1 kWh',
          bb_byd: 'BYD HVS 5.1',
          bb_pylontech: 'Pylontech US3000',
          bb_growatt: 'Growatt ARK 2.5L',
        };
        if (bateriaMap[t]) {
          state.data.marca_bateria = bateriaMap[t];
          return await askEstrutura(from, state);
        }
        if (t === 'bb_outra') {
          state.step = 'bateria_livre';
          await sendText(from, `Digita a marca/modelo da bateria:\nEx: "Deye BATDE-51V-5.1kWh"`);
          return true;
        }
        if (t === 'bb_pular') {
          return await askEstrutura(from, state);
        }
        if (!pular && t.length > 1) state.data.marca_bateria = t;
        return await askEstrutura(from, state);
      }

      case 'bateria_livre':
        if (!pular) state.data.marca_bateria = t;
        return await askEstrutura(from, state);

      case 'estrutura': {
        const estruturaMap: Record<string, string> = {
          be_ceramico: 'Telhado cerâmico',
          be_fibrocimento: 'Telhado fibrocimento',
          be_solo: 'Solo',
          be_laje: 'Laje',
          be_carport: 'Carport',
        };
        if (estruturaMap[t]) {
          state.data.tipo_estrutura = estruturaMap[t];
        } else if (t === 'be_outra') {
          state.step = 'estrutura_livre';
          await sendText(from, `Digita o tipo de estrutura/telhado:`);
          return true;
        } else if (t === 'be_pular') {
          // skip
        } else if (!pular && t.length > 1) {
          state.data.tipo_estrutura = t;
        }
        return await askConfirm(from, state);
      }

      case 'estrutura_livre':
        if (!pular) state.data.tipo_estrutura = t;
        return await askConfirm(from, state);

      case 'confirm':
        if (t === 'bnr_gerar' || /^gerar|sim|ok|confirmar$/i.test(t)) {
          bannerModes.delete(from);
          await sendText(from, `🎨 Gerando banner...`);
          await generateAndSendBanner(from, state);
        } else if (t === 'bnr_cancelar') {
          bannerModes.delete(from);
          await sendText(from, `❌ Banner cancelado.`);
        } else {
          await askConfirm(from, state);
        }
        return true;
    }
    return false;
  }

  // Helpers pra avançar steps com botões/listas interativas
  async function askModulo(from: string, state: BannerModeState): Promise<boolean> {
    state.step = 'modulo';
    if (metaWaba) {
      try {
        await metaWaba.sendInteractiveList(from, {
          header: '5/8 Módulo',
          body: 'Qual a marca do módulo?',
          buttonText: 'Escolher',
          sections: [{
            title: 'Marcas',
            rows: [
              { id: 'bm_risen', title: 'Risen 700W HJT', description: 'Heterojunção bifacial' },
              { id: 'bm_longi', title: 'LONGi Hi-MO X10', description: 'Premium' },
              { id: 'bm_ja', title: 'JA Solar 590W' },
              { id: 'bm_trina', title: 'Trina Solar' },
              { id: 'bm_outra', title: '✏️ Outra', description: 'Digitar marca/modelo livre' },
              { id: 'bm_pular', title: '⏭️ Pular' },
            ],
          }],
        });
        return true;
      } catch { /* fallback */ }
    }
    await sendText(from, `*5/8 — Marca do módulo* (ou "pular")\nEx: "Risen 700W HJT"`);
    return true;
  }

  async function askInversor(from: string, state: BannerModeState): Promise<boolean> {
    state.step = 'inversor';
    if (metaWaba) {
      try {
        await metaWaba.sendInteractiveList(from, {
          header: '6/8 Inversor',
          body: 'Qual a marca do inversor?',
          buttonText: 'Escolher',
          sections: [{
            title: 'Marcas',
            rows: [
              { id: 'bi_hoymiles', title: 'Hoymiles', description: 'Microinversor 2,25 kW' },
              { id: 'bi_sungrow', title: 'Sungrow', description: 'Inversor string' },
              { id: 'bi_deye', title: 'Deye', description: 'Híbrido SUN-10K' },
              { id: 'bi_solis', title: 'Solis', description: 'S6-GR1P' },
              { id: 'bi_huawei', title: 'Huawei', description: 'SUN2000' },
              { id: 'bi_solaredge', title: 'SolarEdge', description: 'Otimizado SE7600H' },
              { id: 'bi_foxess', title: 'FoxESS', description: 'T10-G3' },
              { id: 'bi_outra', title: '✏️ Outra', description: 'Digitar marca/modelo livre' },
              { id: 'bi_pular', title: '⏭️ Pular', description: 'Sem inversor especificado' },
            ],
          }],
        });
        return true;
      } catch { /* fallback texto */ }
    }
    await sendText(from, `*6/8 — Inversor* (ou "pular")\nEx: "Hoymiles 2,25 kW"`);
    return true;
  }

  async function askTipo(from: string, state: BannerModeState): Promise<boolean> {
    state.step = 'tipo';
    if (metaWaba) {
      try {
        await metaWaba.sendInteractiveList(from, {
          header: '7/9 Tipo Inversor',
          body: 'Qual o tipo de inversor?',
          buttonText: 'Escolher',
          sections: [{
            title: 'Tipos',
            rows: [
              { id: 'bt_micro', title: 'Micro', description: 'Microinversor (Hoymiles)' },
              { id: 'bt_string', title: 'String', description: 'On-grid tradicional (Sungrow, FoxESS)' },
              { id: 'bt_otim', title: 'Otimizado', description: 'Com otimizadores (SolarEdge)' },
              { id: 'bt_hibrido', title: 'Híbrido', description: 'Suporta bateria (Deye, Huawei)' },
            ],
          }],
        });
        return true;
      } catch { /* fallback */ }
    }
    await sendText(from, `*7/9 — Tipo de inversor?*\nResponde: micro, string, otimizado ou hibrido`);
    return true;
  }

  async function askBateria(from: string, state: BannerModeState): Promise<boolean> {
    state.step = 'bateria';
    if (metaWaba) {
      try {
        await metaWaba.sendInteractiveList(from, {
          header: '8/9 Bateria (opcional)',
          body: 'Tem bateria no kit? (Kit Anti Apagão / Híbrido)',
          buttonText: 'Escolher',
          sections: [{
            title: 'Baterias',
            rows: [
              { id: 'bb_deye', title: 'Deye 5,1 kWh', description: 'BATDE-51V-5.1kWh BT' },
              { id: 'bb_byd', title: 'BYD HVS 5.1', description: 'Battery-Box Premium' },
              { id: 'bb_pylontech', title: 'Pylontech US3000', description: 'Lítio 3.5 kWh' },
              { id: 'bb_growatt', title: 'Growatt ARK 2.5L', description: 'Modular' },
              { id: 'bb_outra', title: '✏️ Outra', description: 'Digitar marca/modelo livre' },
              { id: 'bb_pular', title: '⏭️ Pular', description: 'Sem bateria (on-grid puro)' },
            ],
          }],
        });
        return true;
      } catch { /* fallback */ }
    }
    await sendText(from, `*8/9 — Bateria* (ou "pular")\nEx: "Deye 5,1 kWh", "BYD HVS"`);
    return true;
  }

  async function askEstrutura(from: string, state: BannerModeState): Promise<boolean> {
    state.step = 'estrutura';
    if (metaWaba) {
      try {
        await metaWaba.sendInteractiveList(from, {
          header: '9/9 Estrutura',
          body: 'Qual tipo de estrutura/telhado?',
          buttonText: 'Escolher',
          sections: [{
            title: 'Tipos',
            rows: [
              { id: 'be_ceramico', title: 'Telhado cerâmico' },
              { id: 'be_fibrocimento', title: 'Telhado fibrocimento' },
              { id: 'be_solo', title: 'Solo' },
              { id: 'be_laje', title: 'Laje' },
              { id: 'be_carport', title: 'Carport' },
              { id: 'be_outra', title: '✏️ Outra', description: 'Digitar tipo livre' },
              { id: 'be_pular', title: '⏭️ Pular' },
            ],
          }],
        });
        return true;
      } catch { /* fallback */ }
    }
    await sendText(from, `*9/9 — Estrutura/telhado* (ou "pular")`);
    return true;
  }

  async function askConfirm(from: string, state: BannerModeState): Promise<boolean> {
    state.step = 'confirm';
    const d = state.data;
    const resumo = `📋 *Resumo:*\n\n` +
      `• Título: ${d.titulo}\n` +
      `• Kit: ${d.kit} placas\n` +
      `• Geração: ${d.kwh} kWh/mês\n` +
      `• Preço: R$ ${(d.preco ?? 0).toFixed(2).replace('.', ',')}\n` +
      (d.marca_modulo ? `• Módulo: ${d.marca_modulo}\n` : '') +
      (d.marca_inversor ? `• Inversor: ${d.marca_inversor}${d.tipo_inversor ? ` (${d.tipo_inversor})` : ''}\n` : '') +
      (d.tipo_estrutura ? `• Estrutura: ${d.tipo_estrutura}\n` : '');
    if (metaWaba) {
      try {
        await metaWaba.sendInteractiveButtons(
          from,
          resumo + '\nGerar agora?',
          [
            { id: 'bnr_gerar', title: '✅ Gerar' },
            { id: 'bnr_cancelar', title: '❌ Cancelar' },
          ],
        );
        return true;
      } catch { /* fallback */ }
    }
    await sendText(from, resumo + `\nResponde *gerar* pra criar ou *cancelar* pra abortar.`);
    return true;
  }

  // Detecta opt-out do CLIENTE (qualquer pessoa, nao só admin).
  // Aceita quick reply "Sair" do template reativacao_lead_v1 + palavras-chave
  // universais de unsubscribe. Marca opt_out=true + eva_active=false.
  async function tryHandleClienteOptOut(from: string, text: string): Promise<boolean> {
    const raw = text.trim();
    const t = raw.toLowerCase();
    // Quick reply do template tem title "Sair" (case-sensitive WABA encaminha como texto).
    // Aceita variacoes comuns de unsubscribe pt-BR.
    const isOptOut =
      raw === 'Sair' ||
      /^(sair|parar|stop|unsubscribe|cancelar|cancela|nao quero (mais|receber)|n[ãa]o quero mais)$/i.test(t) ||
      /^(remov[ea]\s*me|sai\s+da(qui)?|para\s+de\s+mandar|nao perturbe)$/i.test(t);
    if (!isOptOut) return false;

    // Busca lead pelo phone
    const { data: lead } = await supabase.getClient()
      .from('leads')
      .select('id, name, opt_out')
      .eq('phone', from)
      .maybeSingle();
    if (!lead) {
      // Nao tem lead cadastrado — ainda assim responde respeitoso
      await sendText(from, '✅ Tudo bem, vamos parar por aqui. Se mudar de ideia, é só mandar "oi". Obrigado!');
      return true;
    }
    if (lead.opt_out) {
      // Ja estava opt-out — so confirma
      await sendText(from, '✅ Já estava registrado. Não vou mais te mandar mensagens. Pra voltar, manda "oi".');
      return true;
    }
    await supabase.getClient()
      .from('leads')
      .update({ opt_out: true, eva_active: false, status: 'inativo', updated_at: new Date().toISOString() })
      .eq('id', lead.id);
    console.log(`[opt-out] cliente ${from} (${lead.name}) optou por sair via "${raw}"`);
    await sendText(
      from,
      `✅ Tudo certo, ${(lead.name ?? '').split(' ')[0] || 'amigo(a)'}. Não vou mais te mandar mensagens.\n\nSe um dia mudar de ideia sobre energia solar, é só mandar "oi" pra cá. Obrigado pela atenção e sucesso! ☀️`,
    );
    return true;
  }

  // /email <fone-ou-nome> <email>: adiciona/atualiza email de um lead.
  async function tryHandleEmailCommand(from: string, text: string): Promise<boolean> {
    if (!isAdminPhone(from)) return false;
    const t = text.trim();
    const m = t.match(/^\/?email\s+(\S+)\s+(\S+@\S+\.\S+)$/i);
    if (!m) {
      // Help message se parecer comando email mas formato errado
      if (/^\/?email\b/i.test(t)) {
        await sendText(from, `📧 *Comando /email*\n\nUso: /email <fone ou nome> <email>\n\nExemplos:\n/email 5561992169105 tania@gmail.com\n/email Jucelda jucelda.pontes@hotmail.com`);
        return true;
      }
      return false;
    }
    const queryRaw = m[1];
    const email = m[2].toLowerCase();
    const digitsOnly = queryRaw.replace(/\D/g, '');

    let leads: Array<{ id: string; name: string; phone: string; email: string | null }> = [];
    if (digitsOnly.length >= 8) {
      const r = await supabase.getClient()
        .from('leads')
        .select('id, name, phone, email')
        .ilike('phone', `%${digitsOnly.slice(-9)}`);
      leads = r.data ?? [];
    } else {
      const r = await supabase.getClient()
        .from('leads')
        .select('id, name, phone, email')
        .ilike('name', `%${queryRaw}%`)
        .limit(5);
      leads = r.data ?? [];
    }

    if (leads.length === 0) {
      await sendText(from, `❌ Nenhum lead encontrado pra "${queryRaw}".`);
      return true;
    }
    if (leads.length > 1) {
      const lista = leads.slice(0, 5).map((l, i) => `${i + 1}. ${l.name} (${l.phone})`).join('\n');
      await sendText(from, `Achei ${leads.length} leads:\n\n${lista}\n\nUsa fone exato pra precisar: /email 5561999999999 email@dom.com`);
      return true;
    }

    const lead = leads[0];
    const { error } = await supabase.getClient()
      .from('leads')
      .update({ email, updated_at: new Date().toISOString() })
      .eq('id', lead.id);
    if (error) {
      await sendText(from, `❌ Erro: ${error.message}`);
      return true;
    }
    await sendText(from, `✅ Email atualizado:\n\n*${lead.name}*\n📞 ${lead.phone}\n✉️ ${email}${lead.email ? `\n\n(antes era: ${lead.email})` : ''}`);
    return true;
  }

  // /campanha [tema]: gera uma campanha de e-mail (copy do Claude + imagem FLUX)
  // e manda o preview pro Junior no zap. Sem tema = tema rotativo do dia; com
  // tema = texto livre vence. Geração em segundo plano (leva ~1 min).
  async function tryHandleCampanhaCommand(from: string, text: string): Promise<boolean> {
    if (!isAdminPhone(from)) return false;
    const m = text.trim().match(/^\/?campanha(?:\s+(.+))?$/i);
    if (!m) return false;
    if (!campanha) {
      await sendText(from, '❌ Geração de campanha está desativada (falta REPLICATE_API_TOKEN).');
      return true;
    }
    const tema = m[1]?.trim() || undefined;
    await sendText(from, '🎨 Montando a campanha... te mando o preview em ~1 min.');
    // Fire-and-forget: a geração (Claude + FLUX) leva ~1 min, não pode travar o webhook.
    void (async () => {
      try {
        await campanha!.gerar(tema);
      } catch (err) {
        console.error('[campanha] gerar falhou:', err);
        await sendText(from, `❌ Não consegui montar a campanha agora: ${(err as Error).message}`);
      }
    })();
    return true;
  }

  // /fechei <nome ou telefone>: marca lead como cliente fechado.
  // status=transferido + opt_out=true => removido da cadencia automaticamente.
  async function tryHandleFecheiCommand(from: string, text: string): Promise<boolean> {
    if (!isAdminPhone(from)) return false;
    const t = text.trim();
    const m = t.match(/^\/?fechei\s+(.+)$/i);
    if (!m) return false;
    const query = m[1].trim();

    // Busca por telefone (digitos) ou nome (ilike)
    const digitsOnly = query.replace(/\D/g, '');
    let leads: Array<{ id: string; name: string; phone: string; status: string }> = [];
    if (digitsOnly.length >= 8) {
      // Busca por telefone — tolera 1-2 digitos a mais ou menos (normalizado)
      const r = await supabase.getClient()
        .from('leads')
        .select('id, name, phone, status')
        .ilike('phone', `%${digitsOnly.slice(-9)}`); // ultimos 9 digitos pra tolerar prefix
      leads = r.data ?? [];
    } else {
      const r = await supabase.getClient()
        .from('leads')
        .select('id, name, phone, status')
        .ilike('name', `%${query}%`)
        .limit(5);
      leads = r.data ?? [];
    }

    if (leads.length === 0) {
      await sendText(from, `❌ Nenhum lead encontrado pra "${query}".\nUsa: /fechei NOME ou /fechei 5561999999999`);
      return true;
    }
    if (leads.length > 1) {
      const lista = leads.slice(0, 5).map((l, i) => `${i + 1}. ${l.name} (${l.phone}) — status: ${l.status}`).join('\n');
      await sendText(from, `Achei ${leads.length} leads:\n\n${lista}\n\nUsa o telefone exato pra precisar: /fechei 5561999999999`);
      return true;
    }

    const lead = leads[0];
    await supabase.getClient()
      .from('leads')
      .update({ status: 'transferido', opt_out: true, updated_at: new Date().toISOString() })
      .eq('id', lead.id);
    // ❤️ Coração da Venda: "fechei" também MARCA A VENDA no funil (contrato_assinado
    // + data do fechamento) e avisa o Elo — mesma função do botão "Fechou!" do
    // dashboard. Assim fechar pela Eva alinha o dashboard, o Elo e as métricas.
    // Best-effort: nunca quebra o "tirar da cadência" que já funcionava.
    let virouVenda = false;
    try {
      const r = await registrarVenda(supabase.getClient(), { leadId: lead.id, tipo: 'sistema', origem: 'eva' });
      virouVenda = r.ok;
    } catch (e) {
      console.warn('[fechei] registrarVenda (best-effort) falhou:', (e as Error)?.message);
    }
    const extra = virouVenda
      ? '\nRegistrado como *venda fechada* — o dashboard e o Elo já sabem. 🎉'
      : '';
    await sendText(from, `✅ *${lead.name}* (${lead.phone}) marcado como cliente fechado.\nRemovido da cadência automaticamente. Eva não vai disparar mais template pra ele.${extra}`);
    return true;
  }

  // Toque numa linha da lista "Fechei uma venda" (id 'fechei_pick:<leadId>'):
  // registra a venda direto pelo Coração da Venda + tira da cadência.
  async function tryHandleFecheiPick(from: string, text: string): Promise<boolean> {
    if (!isAdminPhone(from)) return false;
    const m = text.trim().match(/^fechei_pick:([0-9a-f-]{36})$/i);
    if (!m) return false;
    const leadId = m[1];
    const { data: lead } = await supabase.getClient()
      .from('leads').select('id, name, phone').eq('id', leadId).maybeSingle();
    if (!lead) { await sendText(from, '❌ Não achei esse lead. Abre o menu e tenta de novo.'); return true; }
    await supabase.getClient()
      .from('leads')
      .update({ status: 'transferido', opt_out: true, updated_at: new Date().toISOString() })
      .eq('id', leadId);
    let virouVenda = false;
    try {
      const r = await registrarVenda(supabase.getClient(), { leadId, tipo: 'sistema', origem: 'eva' });
      virouVenda = r.ok;
    } catch (e) {
      console.warn('[fechei_pick] registrarVenda (best-effort) falhou:', (e as Error)?.message);
    }
    const nome = (lead as { name?: string }).name ?? 'Cliente';
    if (virouVenda) {
      // Pergunta o valor logo em seguida (guarda o estado) — assim fecha 100%
      // pelo zap e o faturamento do cofre já pega o valor.
      fecheiValorState.set(from, { leadId, nome, createdAt: Date.now() });
      await sendText(from, `✅ *${nome}* marcado como *venda fechada*! 🎉 O dashboard e o Elo já sabem.\n\n💰 Qual foi o valor da venda? Manda o número (ex: *25000* ou *25 mil*), ou responde *pular*.`);
    } else {
      await sendText(from, `✅ *${nome}* marcado como fechado. Saiu da cadência também.`);
    }
    return true;
  }

  // "contrato <nome>" / "procuracao <nome>" — gera o PDF confiável (proposta +
  // cadastro, preenche brancos onde faltar) e manda no zap do Junior. Nunca trava.
  async function tryHandleContratoRapido(from: string, text: string): Promise<boolean> {
    if (!isAdminPhone(from)) return false;
    const m = text.trim().match(/^\/?(contrato|procuracao|procuração)\s+(.+)$/i);
    if (!m) return false;
    const tipo: 'contrato' | 'procuracao' = m[1].toLowerCase().startsWith('proc') ? 'procuracao' : 'contrato';
    const nome = m[2].trim();
    const rotulo = tipo === 'contrato' ? 'contrato' : 'procuração';
    try {
      const { searchLeadByName } = await import('./modules/closing/closing-data-fetcher.js');
      const leads = await searchLeadByName(supabase.getClient(), nome);
      if (leads.length === 0) {
        await sendText(from, `Não achei ninguém com "${nome}". Confere o nome e manda de novo.`);
        return true;
      }
      if (leads.length > 1) {
        const lista = leads.slice(0, 5).map((l, i) => `${i + 1}. ${l.name}`).join('\n');
        await sendText(from, `Achei mais de um com "${nome}":\n${lista}\nManda o nome mais completo.`);
        return true;
      }
      const lead = leads[0];
      await sendText(from, `Gerando ${rotulo} de *${lead.name}*... 📄`);
      // Mesmo motor e mesmo registro da central de contratos do dashboard — a Eva
      // não pode gerar de um jeito e a tela de outro (nem pegar o rascunho errado).
      const { montarFechamentoAuto } = await import('./modules/closing/fechamento-auto.js');
      const { getContrato } = await import('./modules/closing/contratos-registry.js');
      const def = getContrato(tipo === 'contrato' ? 'fv' : 'procuracao')!;
      const r = await montarFechamentoAuto(supabase.getClient(), lead.id, def.tipo);
      if (!r) { await sendText(from, 'Não achei os dados desse cliente.'); return true; }
      const { renderHtmlToPdf } = await import('./modules/closing/closing-render.js');
      const pdf = await renderHtmlToPdf(def.render(r.dados));
      const filename = `${def.arquivo}-${r.nome.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`;
      if (!metaWaba) { await sendText(from, 'Envio de documento indisponível agora.'); return true; }
      const up = await metaWaba.uploadMedia(pdf, 'application/pdf', filename);
      const falta = r.faltando.length ? `\n\n⚠️ Faltou preencher: ${r.faltando.join(', ')} — completa na tela de Contratos que refaço.` : '';
      await metaWaba.sendDocumentById(from, up.mediaId, filename, `Segue ${rotulo} de ${r.nome}. 📄${falta}`);
      await registrarEvento(supabase.getClient(), {
        tipo: 'comercial:contrato_enviado',
        departamento: 'comercial',
        canal: 'whatsapp',
        origem: 'eva',
        leadId: lead.id,
        payload: { tipo_contrato: def.tipo, destino: 'eu', campos_em_branco: r.faltando.length },
      });
      return true;
    } catch (err) {
      console.error('[contrato-rapido]', err);
      await sendText(from, `Deu um problema gerando o ${rotulo} agora. Tenta pelo dashboard (tela do cliente).`);
      return true;
    }
  }

  // Resposta com o VALOR logo após o toque em "Fechei uma venda" (fecheiValorState).
  // Só age se há uma venda esperando valor desse número. "pular" encerra sem valor.
  async function tryHandleFecheiValor(from: string, text: string): Promise<boolean> {
    if (!isAdminPhone(from)) return false;
    const pend = fecheiValorState.get(from);
    if (!pend) return false;
    if (Date.now() - pend.createdAt > 10 * 60 * 1000) { fecheiValorState.delete(from); return false; }
    const t = text.trim().toLowerCase();
    if (['pular', 'pula', 'nao', 'não', 'skip', '-', 'depois'].includes(t)) {
      fecheiValorState.delete(from);
      await sendText(from, '👍 Beleza, venda registrada sem valor. Dá pra somar depois pelo painel, se quiser.');
      await perguntarTipoVenda(from, pend.leadId, pend.nome);
      return true;
    }
    const valor = parseValorReais(text);
    if (valor == null) {
      // Não parece um valor — solta o estado e deixa a mensagem seguir o fluxo
      // normal (não prende o Junior num "modo valor").
      fecheiValorState.delete(from);
      return false;
    }
    fecheiValorState.delete(from);
    await supabase.getClient()
      .from('leads')
      .update({ venda_valor_cents: Math.round(valor * 100), updated_at: new Date().toISOString() })
      .eq('id', pend.leadId);
    const brl = valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    await sendText(from, `💰 Valor de *${pend.nome}* salvo: *${brl}*. Já entra no faturamento do mês. 🎉`);
    await perguntarTipoVenda(from, pend.leadId, pend.nome);
    return true;
  }

  // Pergunta (com botões) se a venda foi sistema ou serviço — 1 toque, fecha o
  // registro completo pelo zap. A venda já foi salva; isto só refina o tipo.
  async function perguntarTipoVenda(from: string, leadId: string, nome: string): Promise<void> {
    if (!metaWaba) return;
    try {
      await metaWaba.sendInteractiveButtons(
        from,
        `Pra fechar o registro de *${nome}*: foi sistema solar ou serviço?`,
        [
          { id: `venda_tipo:${leadId}:sistema`, title: '🔆 Sistema' },
          { id: `venda_tipo:${leadId}:servico`, title: '🔧 Serviço' },
        ],
        'Marca o tipo da venda',
      );
    } catch (e) {
      console.warn('[venda-tipo] botões falharam (best-effort):', (e as Error)?.message);
    }
  }

  // Toque no botão "Sistema/Serviço" (id 'venda_tipo:<leadId>:<tipo>').
  async function tryHandleVendaTipo(from: string, text: string): Promise<boolean> {
    if (!isAdminPhone(from)) return false;
    const m = text.trim().match(/^venda_tipo:([0-9a-f-]{36}):(sistema|servico)$/i);
    if (!m) return false;
    const [, leadId, tipo] = m;
    await supabase.getClient()
      .from('leads')
      .update({ venda_tipo: tipo, updated_at: new Date().toISOString() })
      .eq('id', leadId);
    await sendText(from, tipo === 'servico' ? '🔧 Marcado como *serviço*. Prontinho! ✅' : '🔆 Marcado como *sistema*. Prontinho! ✅');
    return true;
  }

  // /google [dias]: snapshot Google Ads no zap pra admin. Sem dias = 7d default.
  // /google 30 = ultimos 30 dias. Reusa fetchGoogleAdsSummary do dashboard.
  // Resposta inclui comparativo 7d vs 30d quando dias=7 (default) e dashboard
  // link pra detalhes.
  async function tryHandleGoogleAdsCommand(from: string, text: string): Promise<boolean> {
    if (!isAdminPhone(from)) return false;
    const t = text.trim().toLowerCase();
    const m = t.match(/^\/(google|ads|adwords)(?:\s+(\d+))?$/);
    if (!m) return false;
    const dias = m[2] ? parseInt(m[2], 10) : 7;
    if (dias < 1 || dias > 90) {
      await sendText(from, '❌ Período inválido. Use entre 1 e 90 dias. Ex: /google 30');
      return true;
    }

    try {
      const { fetchGoogleAdsSummary } = await import('./modules/dashboard/marketing-queries.js');
      const client = supabase.getClient();
      const periodo = await fetchGoogleAdsSummary(client, dias);

      const fmtBRL = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
      const fmtN = (n: number) => n.toLocaleString('pt-BR');
      const fmtCPC = (v: number | null) => v != null ? `R$ ${v.toFixed(2).replace('.', ',')}` : '--';
      const fmtCTR = (v: number | null) => v != null ? `${v.toFixed(1).replace('.', ',')}%` : '--';

      // Se ainda nao tem dado nenhum, mostra estado amigavel
      if (periodo.dias_com_dado === 0) {
        const ultimaSync = periodo.ultima_sync_at
          ? new Date(periodo.ultima_sync_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
          : 'nunca';
        await sendText(from,
          `📊 *Google Ads — sem dado ainda*\n\n` +
          `🚦 Aguardando primeira veiculação.\n` +
          `Última sync do cron: ${ultimaSync}\n\n` +
          `Quando campanha aprovar e gastar primeiro real, retorna em até 30min.`,
        );
        return true;
      }

      const linhas = [
        `📊 *Google Ads — últimos ${dias}d*`,
        ``,
        `💰 ${fmtBRL(periodo.spend_cents)} gastos`,
        `👆 ${fmtN(periodo.clicks)} cliques | CPC ${fmtCPC(periodo.cpc_brl)}`,
        `👁️ ${fmtN(periodo.impressions)} impressões | CTR ${fmtCTR(periodo.ctr_pct)}`,
      ];

      // Comparativo 30d quando default 7d pedido
      if (dias === 7) {
        const m30 = await fetchGoogleAdsSummary(client, 30);
        if (m30.dias_com_dado > 0) {
          linhas.push(``);
          linhas.push(`*30 dias:* ${fmtBRL(m30.spend_cents)} | ${fmtN(m30.clicks)} cliques | CPC ${fmtCPC(m30.cpc_brl)} | CTR ${fmtCTR(m30.ctr_pct)}`);
        }
      }

      if (periodo.ultima_sync_at) {
        const sync = new Date(periodo.ultima_sync_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
        linhas.push(``);
        linhas.push(`_Sync: ${sync}_`);
      }

      linhas.push(`🔗 dashboard.ecosunpower.eng.br/dashboard/marketing`);

      await sendText(from, linhas.join('\n'));
      return true;
    } catch (err) {
      console.warn('[google-cmd] falhou:', (err as Error).message);
      await sendText(from, `❌ Erro ao buscar Google Ads: ${(err as Error).message}`);
      return true;
    }
  }

  // /reativar-base [N]: dispara template MARKETING 'reativacao_lead_v1' pra
  // ate N leads com acquisition_source='terceirizada_recovered' que ainda
  // nao foram reativados. Delay 30-90s entre cada pra nao acender alerta
  // spam Meta. Marca opportunities.last_reactivation_sent_at quando OK.
  // Default N=10 (1a onda pequena pra medir taxa de bloqueio).
  async function tryHandleReativarBaseCommand(from: string, text: string): Promise<boolean> {
    if (!isAdminPhone(from)) return false;
    const t = text.trim().toLowerCase();
    const m = t.match(/^\/reativar-base(?:\s+(\d+))?$/);
    if (!m) return false;
    const N = m[1] ? parseInt(m[1], 10) : 10;
    if (!metaWaba) {
      await sendText(from, '❌ metaWaba nao configurado.');
      return true;
    }
    await sendText(from, `🔄 Iniciando reativação de até ${N} leads da base terceirizada...\n\nDelay 30-90s entre cada disparo. Vou te avisar no fim.`);

    // Busca leads pra reativar: terceirizada_recovered + sem last_reactivation_sent_at + tem nome
    const { data: leads, error } = await supabase.getClient()
      .from('leads')
      .select('id, phone, name, opportunities')
      .eq('acquisition_source', 'terceirizada_recovered')
      .eq('eva_active', true)
      .order('created_at', { ascending: true })
      .limit(N * 2); // pega o dobro pra filtrar os ja reativados em memoria
    if (error) {
      await sendText(from, `❌ Erro ao buscar leads: ${error.message}`);
      return true;
    }

    const naoReativados = (leads ?? []).filter((l) => {
      const opps = (l.opportunities ?? {}) as Record<string, unknown>;
      return !opps.last_reactivation_sent_at;
    }).slice(0, N);

    if (naoReativados.length === 0) {
      await sendText(from, '✅ Todos os leads terceirizada ja foram reativados. Nada a fazer.');
      return true;
    }

    let ok = 0;
    let fail = 0;
    for (let i = 0; i < naoReativados.length; i++) {
      const lead = naoReativados[i];
      const firstName = (lead.name ?? '').split(' ')[0] || 'tudo bem';
      try {
        await metaWaba.sendTemplate(lead.phone, 'reativacao_lead_v1', 'pt_BR', [
          {
            type: 'body',
            parameters: [{ type: 'text', text: firstName }],
          },
        ]);
        // Marca como reativado
        const opps = { ...(lead.opportunities ?? {}), last_reactivation_sent_at: new Date().toISOString() };
        await supabase.getClient().from('leads').update({ opportunities: opps }).eq('id', lead.id);
        ok++;
        console.log(`[reativar-base] template enviado pra ${lead.phone} (${firstName})`);
      } catch (err) {
        fail++;
        console.error(`[reativar-base] falhou ${lead.phone}:`, (err as Error).message);
      }
      // Delay 30-90s aleatorio (exceto no ultimo)
      if (i < naoReativados.length - 1) {
        const delay = 30000 + Math.floor(Math.random() * 60000);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    await sendText(
      from,
      `✅ *Reativação concluida*\n\n` +
      `📤 ${ok} templates enviados\n` +
      `❌ ${fail} falharam\n\n` +
      `Aguarde 2-4h pra medir taxa de resposta+bloqueio.\n` +
      `Quando clientes responderem (quick reply ou texto), Eva atende automatico com contexto rico do banco.\n\n` +
      `Pra mais ondas: /reativar-base ${N}`,
    );
    return true;
  }

  // /resgatar-forms [N]: dispara template inicial aprovado pra leads de
  // FORMULARIO Meta (ad_ig_leadform/ad_fb_leadform) parados em 'novo' que
  // nunca receberam a 1a mensagem (welcome_sent_at null) — leads pagos que o
  // webhook perdeu ou cuja boas-vindas por texto livre a Meta rejeitou (regra
  // 24h WABA). Delay 30-90s entre disparos pra nao acender alerta spam.
  // Marca welcome_sent_at quando OK. Default N=10.
  let resgateFormsEmAndamento = false;
  async function tryHandleResgatarFormsCommand(from: string, text: string): Promise<boolean> {
    if (!isAdminPhone(from)) return false;
    const m = text.trim().toLowerCase().match(/^\/resgatar-forms(?:\s+(\d+))?$/);
    if (!m) return false;
    const N = m[1] ? parseInt(m[1], 10) : 10;
    if (!metaWaba) {
      await sendText(from, '❌ metaWaba nao configurado.');
      return true;
    }
    // Guarda anti-duplo-disparo: o loop roda em background, entao um segundo
    // /resgatar-forms antes do primeiro acabar pegaria os MESMOS leads ainda
    // nao marcados e mandaria template duplicado.
    if (resgateFormsEmAndamento) {
      await sendText(from, '⏳ Já tem um resgate rodando. Aguarda o relatório final antes de disparar outro.');
      return true;
    }

    const { data: leads, error } = await supabase.getClient()
      .from('leads')
      .select('id, phone, name, ad_campaign_id')
      .in('lead_source', ['ad_ig_leadform', 'ad_fb_leadform'])
      .eq('status', 'novo')
      .is('welcome_sent_at', null)
      .eq('eva_active', true)
      .order('created_at', { ascending: false })
      .limit(N);
    if (error) {
      await sendText(from, `❌ Erro ao buscar leads: ${error.message}`);
      return true;
    }
    if (!leads || leads.length === 0) {
      await sendText(from, '✅ Nenhum lead de formulario esperando 1ª mensagem. Nada a fazer.');
      return true;
    }

    await sendText(
      from,
      `🛟 Resgatando ${leads.length} leads de formulário (template aprovado, delay 30-90s entre cada).\n\nVou te avisar no fim.`,
    );

    // Loop roda em BACKGROUND: a fila de mensagens tem concurrency=1, entao
    // aguardar N×90s aqui deixaria a Eva surda pra TODO MUNDO durante o
    // resgate (lead quente chegando ficaria sem resposta por ~15 min).
    // welcome_sent_at marca o progresso — se o app reiniciar no meio, rodar
    // o comando de novo continua de onde parou sem duplicar.
    const waba = metaWaba;
    resgateFormsEmAndamento = true;
    void (async () => {
      let ok = 0;
      let fail = 0;
      // Cache por execucao: todos os leads da mesma campanha compartilham o
      // mesmo template — evita N consultas identicas.
      const templatePorCampanha = new Map<string, string | null>();
      try {
        for (let i = 0; i < leads.length; i++) {
          const lead = leads[i];
          try {
            const campKey = lead.ad_campaign_id ?? '';
            let mapped = templatePorCampanha.get(campKey);
            if (mapped === undefined) {
              mapped = await supabase.getTemplateInicialPorCampanha(lead.ad_campaign_id ?? null);
              templatePorCampanha.set(campKey, mapped);
            }
            const { templateUsado } = await enviarTemplateInicial(
              waba,
              lead.phone,
              lead.name,
              mapped || '_eva_qualificacao_v1', // || (nao ??): string vazia do DB tambem cai no default
            );
            await supabase.getClient()
              .from('leads')
              .update({ welcome_sent_at: new Date().toISOString() })
              .eq('id', lead.id);
            await registrarTemplateNaConversa(lead.id, templateUsado).catch((err) => {
              console.warn(`[resgatar-forms] marcador de conversa falhou pra ${lead.phone}:`, (err as Error).message);
            });
            ok++;
            console.log(`[resgatar-forms] ${templateUsado} enviado pra ${lead.phone} (${lead.name ?? 'sem nome'})`);
          } catch (err) {
            fail++;
            console.error(`[resgatar-forms] falhou ${lead.phone}:`, (err as Error).message);
          }
          // Delay 30-90s aleatorio (exceto no ultimo)
          if (i < leads.length - 1) {
            const delay = 30000 + Math.floor(Math.random() * 60000);
            await new Promise((r) => setTimeout(r, delay));
          }
        }

        await sendText(
          from,
          `🛟 *Resgate de leads de formulário concluído*\n\n` +
          `📤 ${ok} templates enviados\n` +
          `❌ ${fail} falharam\n\n` +
          `Quando responderem, a Eva qualifica automático com os dados do form.\n` +
          `Próxima onda: /resgatar-forms ${N}`,
        );
      } catch (err) {
        console.error('[resgatar-forms] loop de resgate morreu:', (err as Error).message);
        await sendText(from, `❌ Resgate interrompido por erro: ${(err as Error).message}\n\nEnviados até aqui: ${ok}. Rode /resgatar-forms de novo pra continuar.`).catch(() => {});
      } finally {
        resgateFormsEmAndamento = false;
      }
    })();

    return true;
  }

  // /banner: gera banner promocional Mega Oferta com satori + envia via WABA.
  // Sintaxe: /banner titulo="..." kit=12 kwh=900 preco=17354.32
  // Opcionais: subtitulo, descricao, cta. Obrigatorio: preco.
  async function tryHandleBannerCommand(from: string, text: string): Promise<boolean> {
    if (!isAdminPhone(from)) return false;
    const t = text.trim();
    if (!/^\/banner\b/i.test(t) && !/^banner\b/i.test(t)) return false;

    const helpMsg = `🎨 *Eva Banner Maker*\n\n` +
      `Exemplo completo:\n` +
      `/banner titulo="MEGA OFERTA DE MAIO" kit=12 kwh=900 preco=17354 modulo="LONGi Hi-MO X10" inversor="Sungrow SG10RT" tipo=string estrutura="Telhado cerâmico"\n\n` +
      `*Obrigatorio:* preco\n\n` +
      `*Comerciais (com default):*\n` +
      `• titulo (default: "OFERTA ESPECIAL")\n` +
      `• kit, kwh, subtitulo, descricao, cta\n\n` +
      `*Técnicos (opcionais):*\n` +
      `• modulo="LONGi Hi-MO X10"\n` +
      `• inversor="Sungrow SG10RT"\n` +
      `• tipo=micro | string | otimizado\n` +
      `• estrutura="Telhado cerâmico" | "Solo" | "Laje" | "Carport"`;

    // Parser de params (regex)
    const args = t.replace(/^\/?banner\s*/i, '');
    if (!args.trim()) {
      // MODO CONVERSACIONAL: sem args = inicia perguntas passo a passo
      clearStaleBannerModes();
      bannerModes.set(from, { step: 'titulo', data: {}, started_at: Date.now() });
      await sendText(from,
        `🎨 *Eva Banner Maker*\n\nVou te perguntar o que tem no banner. Pode mandar "cancelar" a qualquer momento.\n\n` +
        `*1/9 — Qual o título?*\nExemplo: "OFERTA DE MAIO", "MEGA OFERTA", "ÚLTIMAS UNIDADES"`);
      return true;
    }

    function pick(key: string): string | undefined {
      const re = new RegExp(`${key}\\s*=\\s*(?:"([^"]+)"|'([^']+)'|([^\\s]+))`, 'i');
      const m = args.match(re);
      return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
    }
    const titulo = pick('titulo') ?? 'OFERTA ESPECIAL';
    const subtitulo = pick('subtitulo') ?? pick('sub');
    const descricao = pick('descricao') ?? pick('desc');
    const cta_text = pick('cta');
    const kit = parseInt(pick('kit') ?? '12', 10);
    const kwh = parseInt(pick('kwh') ?? '900', 10);
    const precoStr = pick('preco') ?? pick('preço');
    const marca_modulo = pick('modulo') ?? pick('modulos') ?? pick('marca_modulo');
    const marca_inversor = pick('inversor') ?? pick('marca_inversor');
    const marca_bateria = pick('bateria') ?? pick('marca_bateria');
    const tipo_inversor = pick('tipo_inversor') ?? pick('tipo'); // micro | string | otimizado | hibrido
    const tipo_estrutura = pick('estrutura') ?? pick('telhado');

    if (!precoStr) {
      await sendText(from, `❌ Faltou o *preço*. Exemplo: /banner preco=17354.32\n\n${helpMsg}`);
      return true;
    }
    const preco = parseFloat(precoStr.replace(',', '.'));
    if (!Number.isFinite(preco) || preco <= 0) {
      await sendText(from, `❌ Preço inválido: "${precoStr}". Use formato numérico, ex: preco=17354.32`);
      return true;
    }

    await sendText(from, `🎨 Gerando banner "${titulo}"...`);
    try {
      const { renderBannerMegaOferta } = await import('./modules/marketing/banner-renderer.js');
      const png = await renderBannerMegaOferta({
        titulo,
        ...(subtitulo ? { subtitulo } : {}),
        ...(descricao ? { descricao } : {}),
        ...(cta_text ? { cta_text } : {}),
        ...(marca_modulo ? { marca_modulo } : {}),
        ...(marca_inversor ? { marca_inversor } : {}),
        ...(marca_bateria ? { marca_bateria } : {}),
        ...(tipo_inversor ? { tipo_inversor } : {}),
        ...(tipo_estrutura ? { tipo_estrutura } : {}),
        kit_placas: kit,
        kwh_mes: kwh,
        preco_brl: preco,
      });

      if (!metaWaba) {
        await sendText(from, '❌ metaWaba nao configurado, nao consigo enviar imagem.');
        return true;
      }

      const { mediaId } = await metaWaba.uploadMedia(png, 'image/png', `banner-${Date.now()}.png`);
      const caption = `🎨 *${titulo}*\nKit ${kit} placas · ${kwh} kWh/mês · R$ ${preco.toFixed(2).replace('.', ',')}\n\nMande /banner com outros parâmetros pra gerar variações.`;
      await metaWaba.sendImageById(from, mediaId, caption);
      console.log(`[banner] gerado e enviado pra ${from}: ${titulo}`);
    } catch (err) {
      console.error('[banner] falhou:', err);
      await sendText(from, `❌ Falhou ao gerar banner: ${(err as Error).message}`);
    }
    return true;
  }

  // /sync-marketing: forca sync imediato Meta -> DB + collect insights.
  // Util pra ver mudancas no dashboard sem esperar o cron de 2h.
  async function tryHandleSyncMarketingCommand(from: string, text: string): Promise<boolean> {
    if (!isAdminPhone(from)) return false;
    const t = text.trim().toLowerCase();
    if (t !== '/sync-marketing' && t !== '/sync-mkt') return false;
    if (!config.metaWabaAccessToken) {
      await sendText(from, '❌ META_WABA_ACCESS_TOKEN nao configurado no Easypanel.');
      return true;
    }
    await sendText(from, '🔄 Sincronizando campanhas com Meta...');
    try {
      const { syncCampaignStatuses, collectInsights } = await import('./modules/marketing/insights-collector.js');
      const sync = await syncCampaignStatuses(supabase.getClient(), config.metaWabaAccessToken);
      const ins = await collectInsights(supabase.getClient(), config.metaWabaAccessToken);

      // Google Ads (best-effort) — mesma sync do cron, agora on-demand. Mostra o
      // resultado (ou o erro completo) direto na resposta pra Junior ver na hora.
      let googleLine = '';
      if (process.env.GOOGLE_ADS_DEVELOPER_TOKEN && process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) {
        try {
          const { syncGoogleAdsToChannelMetrics } = await import('./modules/marketing/google-ads/sync.js');
          const g = await syncGoogleAdsToChannelMetrics(supabase.getClient());
          googleLine = g.ok
            ? `🟢 *Google Ads:* ${g.dias_processados} dias, R$ ${(g.total_spend_cents / 100).toFixed(2)} gasto, ${g.total_clicks} clicks.\n`
            : `🔴 *Google Ads falhou:* ${g.error}\n`;
        } catch (err) {
          googleLine = `🔴 *Google Ads erro:* ${(err as Error).message}\n`;
        }
      }

      await sendText(
        from,
        `✅ Sync concluido.\n\n` +
        `📊 *Status Meta -> DB:* ${sync.synced} sincronizadas, ${sync.changed} mudaram.\n` +
        `📈 *Insights coletados:* ${ins.ok} ok, ${ins.failed} falharam.\n` +
        googleLine +
        `\nVeja: /dashboard/marketing`,
      );
    } catch (err) {
      console.error('[sync-marketing] failed:', err);
      await sendText(from, `❌ Falhou: ${(err as Error).message}`);
    }
    return true;
  }

  // /post-fb <texto> — posta um conteudo curto no FB Ecosunpower (Junior dispara
  // quando quer exercitar a permission pages_manage_posts pro App Review do Meta).
  // Cada execucao = 1 chamada de pages_manage_posts no painel "Analisar > Teste".
  // Texto fica como mensagem direta no feed da page (publico).
  async function tryHandlePostFbCommand(from: string, text: string): Promise<boolean> {
    if (!isAdminPhone(from)) return false;
    const t = text.trim();
    const m = t.match(/^\/post-fb\s+(.+)$/is);
    if (!m) return false;
    const message = m[1].trim();
    if (message.length < 5) {
      await sendText(from, '❌ Texto muito curto. Manda algo com pelo menos 5 caracteres.');
      return true;
    }
    if (!config.metaWabaAccessToken) {
      await sendText(from, '❌ META_WABA_ACCESS_TOKEN nao configurado.');
      return true;
    }

    await sendText(from, '📝 Postando no FB Ecosunpower...');
    try {
      // 1) Pega a page do user com page_access_token
      const pagesUrl = `https://graph.facebook.com/v22.0/me/accounts?fields=id,name,access_token&limit=1&access_token=${config.metaWabaAccessToken}`;
      const r1 = await fetch(pagesUrl);
      if (!r1.ok) {
        await sendText(from, `❌ Falha listar pages: HTTP ${r1.status}`);
        return true;
      }
      const d1 = await r1.json() as { data?: Array<{ id: string; name: string; access_token?: string }> };
      const page = d1.data?.[0];
      if (!page?.id || !page.access_token) {
        await sendText(from, '❌ Nenhuma page com access_token disponivel.');
        return true;
      }

      // 2) Faz o post no feed da page com page_access_token
      const postUrl = `https://graph.facebook.com/v22.0/${page.id}/feed`;
      const r2 = await fetch(postUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, access_token: page.access_token }),
      });
      if (!r2.ok) {
        const body = await r2.text();
        await sendText(from, `❌ Post falhou HTTP ${r2.status}: ${body.slice(0, 200)}`);
        return true;
      }
      const d2 = await r2.json() as { id?: string };
      const postId = d2.id ?? '?';
      const pageNum = page.id;
      const fbUrl = postId.includes('_') ? `https://www.facebook.com/${postId.split('_')[0]}/posts/${postId.split('_')[1]}` : `https://www.facebook.com/${pageNum}`;
      await sendText(from, `✅ Postado!\n\n📄 Post ID: ${postId}\n🔗 ${fbUrl}\n\n+1 chamada de pages_manage_posts no painel Meta.`);
      console.log(`[post-fb] sucesso: page=${pageNum} post=${postId}`);
    } catch (err) {
      console.error('[post-fb] erro:', err);
      await sendText(from, `❌ Erro: ${(err as Error).message}`);
    }
    return true;
  }

  // /banner-kits — gera banner premium tabela com os kits OnGrid da empresa.
  // [ECOSOF] Kits vêm da tabela empresa_kits (seed = tabela canonica 2026 da
  // EcoSunPower). Admin pode usar direto como criativo Meta Ads ou pra mandar
  // pra clientes prospects. Sem kit cadastrado = avisa e aborta (preço é do
  // cliente — NUNCA inventa fallback hardcoded).
  async function tryHandleBannerKitsCommand(from: string, text: string): Promise<boolean> {
    if (!isAdminPhone(from)) return false;
    const t = text.trim().toLowerCase();
    const m = t.match(/^\/banner-(kits|tabela)(?:\s+(\S+))?$/);
    if (!m) return false;

    // Variant aprovada padrao: white-corporate (gradiente fim de tarde).
    // Sintaxe: /banner-kits           -> white-corporate (default)
    //          /banner-kits azul      -> azul-degrade
    //          /banner-kits dark      -> dark-premium
    //          /banner-kits yellow    -> bold-yellow
    //          /banner-kits forest    -> forest-green
    const v = (m[2] ?? 'white').toLowerCase();
    const variantMap: Record<string, 'white-corporate' | 'azul-degrade' | 'dark-premium' | 'bold-yellow' | 'forest-green'> = {
      white: 'white-corporate', 'white-corporate': 'white-corporate', tarde: 'white-corporate',
      azul: 'azul-degrade', 'azul-degrade': 'azul-degrade', blue: 'azul-degrade',
      dark: 'dark-premium', 'dark-premium': 'dark-premium', premium: 'dark-premium',
      yellow: 'bold-yellow', amarelo: 'bold-yellow', 'bold-yellow': 'bold-yellow',
      forest: 'forest-green', verde: 'forest-green', 'forest-green': 'forest-green',
    };
    const variant = variantMap[v] ?? 'white-corporate';

    // [ECOSOF] Kits do banco (empresa_kits, só ativos, em ordem). Lista vazia
    // aborta com instrução — sem fallback hardcoded, preço é dado do cliente.
    const kitsDb = await carregarKits(supabase.getClient());
    if (kitsDb.length === 0) {
      await sendText(from, '⚠️ Nenhum kit cadastrado em empresa_kits — cadastre no banco e rode /recarregar-config.');
      return true;
    }

    await sendText(from, `🎨 Gerando banner premium (${variant}) com ${kitsDb.length} kits OnGrid...`);
    try {
      const { renderBannerTabelaKitsHtml } = await import('./modules/marketing/banner-tabela-kits-html.js');
      // Shape snake_case que o renderer espera (KitItem). microinversores é
      // opcional no banco; null vira 0 (o seed EcoSun preenche todos — kit sem
      // micro mostraria "0" na coluna de equipamento do banner).
      const kits = kitsDb.map((k) => ({
        kwp: k.kwp,
        modulos: k.modulos,
        microinversores: k.microinversores ?? 0,
        geracao_kwh_mes: k.geracaoKwhMes,
        preco_brl: k.precoBrl,
      }));
      const buf = await renderBannerTabelaKitsHtml({ kits, variant });

      // Upload pro Supabase Storage com nome profissional pro Meta Ads
      // Formato: OnGrid_Tabela_Mai_v<seq>_<variant>
      const variantLabel = variant === 'white-corporate' ? 'fim-de-tarde'
        : variant === 'azul-degrade' ? 'azul'
        : variant === 'dark-premium' ? 'premium'
        : variant === 'bold-yellow' ? 'amarelo'
        : variant === 'forest-green' ? 'verde'
        : variant;
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const slug = `OnGrid_Tabela_Mai_${variantLabel}_${dateStr}_${Date.now() % 1000}`;
      const { CreativeStorage } = await import('./modules/marketing/creative-storage.js');
      const storage = new CreativeStorage(supabase.getClient());
      const { publicUrl } = await storage.uploadBanner(buf, slug);

      if (metaWaba) {
        try {
          const { mediaId } = await metaWaba.uploadMedia(buf, 'image/png', `${slug}.png`);
          await metaWaba.sendImageById(from, mediaId, `🎨 *Banner ${variant}*\n\n${kits.length} kits OnGrid (tabela empresa_kits)\n\n📎 URL alta qualidade (sem compressão WhatsApp):\n${publicUrl}\n\nPra Meta Ads, salvar essa URL e usar como criativo.`);
        } catch (err) {
          console.warn('[banner-kits] sendImage falhou, fallback texto:', (err as Error).message);
          await sendText(from, `🎨 Banner gerado!\n\n${publicUrl}`);
        }
      } else {
        await sendText(from, `🎨 Banner gerado!\n\n${publicUrl}`);
      }
      console.log(`[banner-kits] variant=${variant} gerado: ${publicUrl}`);
    } catch (err) {
      console.error('[banner-kits] erro:', err);
      await sendText(from, `❌ Erro ao gerar banner: ${(err as Error).message}`);
    }
    return true;
  }

  async function tryHandleCreativeCommand(from: string, text: string): Promise<boolean> {
    if (!isAdminPhone(from)) return false;
    const trimmed = text.trim();
    const trimmedLower = trimmed.toLowerCase();

    // 1. Botoes existentes (aprovar/regenerar/descartar) — mantidos inalterados
    const aprovarBtn = trimmed.match(/^criativo_aprovar_(\d+)$/);
    const descartarBtn = trimmed.match(/^criativo_descartar_(\d+)$/);
    const regenerarBtn = trimmed.match(/^criativo_regenerar_(\d+)$/);

    if (aprovarBtn) {
      const id = parseInt(aprovarBtn[1], 10);
      try {
        const { error } = await supabase.getClient()
          .from('marketing_creatives')
          .update({
            status: 'aprovado',
            approved_at: new Date().toISOString(),
            approved_by_phone: from,
          })
          .eq('id', id);
        if (error) throw error;
        await sendText(from, `✅ Criativo #${id} aprovado. Pronto pra usar em campanha.`);
      } catch (err) {
        console.error('[creative-agent] aprovar erro:', (err as Error).message);
        await sendText(from, `⚠️ Erro ao aprovar criativo #${id}: ${(err as Error).message}`);
      }
      return true;
    }

    if (descartarBtn) {
      const id = parseInt(descartarBtn[1], 10);
      try {
        const { error } = await supabase.getClient()
          .from('marketing_creatives')
          .update({ status: 'descartado' })
          .eq('id', id);
        if (error) throw error;
        await sendText(from, `🗑 Criativo #${id} descartado.`);
      } catch (err) {
        console.error('[creative-agent] descartar erro:', (err as Error).message);
        await sendText(from, `⚠️ Erro ao descartar criativo #${id}: ${(err as Error).message}`);
      }
      return true;
    }

    if (regenerarBtn) {
      await sendText(from, `🔄 Pra regenerar, manda "criativo" de novo com o briefing ajustado (ou mesma persona).`);
      return true;
    }

    // 2. Clique em persona da lista interativa: id = "criativo_persona_<codigo>"
    const personaClick = trimmed.match(/^criativo_persona_(.+)$/);
    if (personaClick) {
      if (!creativeAgent) {
        await sendText(from, '❌ Agente Criativo desabilitado (REPLICATE_API_TOKEN faltando no Easypanel).');
        return true;
      }
      const personaCodigo = personaClick[1].trim();
      try {
        const allPersonas = await creativeAgent.listPersonas();
        const persona = allPersonas.find(p => p.codigo === personaCodigo);
        if (!persona) {
          await sendText(from, `❌ Persona "${personaCodigo}" não encontrada. Manda "criativo" pra ver a lista de novo.`);
          creativeFlowState.delete(from);
          return true;
        }
        creativeFlowState.set(from, {
          step: 'awaiting_briefing',
          persona_codigo: personaCodigo,
          createdAt: Date.now(),
        });
        await sendText(from,
          `✅ Persona: *${persona.nome}*\n\n` +
          `Agora me conta o briefing — onde fica, conta de luz, detalhes do imóvel. Pode ser 1 frase corrida.\n\n` +
          `Exemplo: _"Casa Lago Sul, conta R$ 4500, projeto moderno com piscina"_`);
      } catch (err) {
        console.error('[creative-agent] persona click erro:', (err as Error).message);
        await sendText(from, `⚠️ Erro buscando persona: ${(err as Error).message}`);
      }
      return true;
    }

    // 3. Trigger inicial: "criativo", "/criativo" (sem args) → mostra lista de personas DO BANCO
    if (trimmedLower === 'criativo' || trimmedLower === '/criativo') {
      if (!creativeAgent) {
        await sendText(from, '❌ Agente Criativo desabilitado (REPLICATE_API_TOKEN faltando no Easypanel).');
        return true;
      }
      let personas;
      try {
        personas = await creativeAgent.listPersonas();
      } catch (err) {
        console.error('[creative-agent] listPersonas erro:', (err as Error).message);
        await sendText(from, `⚠️ Erro buscando personas: ${(err as Error).message}`);
        return true;
      }
      if (!personas || personas.length === 0) {
        await sendText(from, '❌ Nenhuma persona cadastrada no banco. Roda o seed `npm run seed:marketing-personas`.');
        return true;
      }

      // WABA Interactive List suporta ate 10 rows totais — exatamente o que precisamos
      const sections = [{
        title: 'Personas',
        rows: personas.slice(0, 10).map(p => ({
          id: `criativo_persona_${p.codigo}`,
          title: p.nome.slice(0, 24),
          description: `Conta ≥ R$ ${p.conta_minima_brl} · ${p.regiao_alvo}`,
        })),
      }];

      let listSent = false;
      if (metaWaba) {
        try {
          await metaWaba.sendInteractiveList(from, {
            header: '🎨 Novo Criativo',
            body: 'Pra qual persona vou gerar?',
            buttonText: 'Escolher persona',
            sections,
            footer: 'Toque pra escolher',
          });
          listSent = true;
        } catch (err) {
          console.warn('[creative-agent] lista interativa falhou, fallback texto:', (err as Error).message);
        }
      }

      if (!listSent) {
        // Fallback texto — lista do BANCO, nunca hard-code
        let msg = '🎨 *Pra qual persona vou gerar?*\n\n';
        personas.forEach((p, i) => {
          msg += `${i + 1}. *${p.nome}*\n   Conta ≥ R$ ${p.conta_minima_brl} · ${p.regiao_alvo}\n   _código: ${p.codigo}_\n\n`;
        });
        msg += `Responde com: /criativo <codigo> <briefing>`;
        await sendText(from, msg);
      }

      creativeFlowState.set(from, { step: 'awaiting_persona', createdAt: Date.now() });
      return true;
    }

    // 4. Estado awaiting_briefing → texto livre vira briefing → dispara generatePackage
    const flow = creativeFlowState.get(from);
    if (
      flow &&
      flow.step === 'awaiting_briefing' &&
      flow.persona_codigo &&
      trimmed.length > 5 &&
      !trimmed.startsWith('/') &&
      !trimmed.startsWith('criativo_') &&
      trimmedLower !== 'criativo' &&
      trimmedLower !== 'menu'
    ) {
      if (!creativeAgent) {
        await sendText(from, '❌ Agente Criativo desabilitado (REPLICATE_API_TOKEN faltando no Easypanel).');
        creativeFlowState.delete(from);
        return true;
      }
      const personaCodigo = flow.persona_codigo;
      const briefing = trimmed;
      creativeFlowState.delete(from);
      await runCreativeGeneration(from, personaCodigo, briefing);
      return true;
    }

    // 5. Compat: parse antigo "/criativo <persona> <briefing>" (one-shot)
    if (trimmedLower.startsWith('/criativo ')) {
      if (!creativeAgent) {
        await sendText(from, '❌ Agente Criativo desabilitado (REPLICATE_API_TOKEN faltando no Easypanel).');
        return true;
      }
      const args = trimmed.slice('/criativo'.length).trim();
      const firstSpace = args.indexOf(' ');
      if (!args || firstSpace === -1) {
        await sendText(from, 'Faltou o briefing. Manda assim: /criativo <persona_codigo> <briefing>\n\nOu manda só "criativo" pra abrir a lista interativa.');
        return true;
      }
      const personaCodigo = args.slice(0, firstSpace).trim();
      const briefing = args.slice(firstSpace + 1).trim();
      if (!briefing) {
        await sendText(from, 'Faltou o briefing. Manda assim: /criativo <persona_codigo> <briefing>');
        return true;
      }
      creativeFlowState.delete(from);
      await runCreativeGeneration(from, personaCodigo, briefing);
      return true;
    }

    return false;
  }

  // Helper extraido pra ser reusado pelos caminhos: (a) clique persona + briefing texto
  // e (b) parse antigo /criativo <persona> <briefing>. Mesmo bloco que existia
  // no handler original, agora reutilizavel.
  async function runCreativeGeneration(from: string, personaCodigo: string, briefing: string): Promise<void> {
    if (!creativeAgent) return; // ja gateado pelos callers, defensive

    await sendText(from, `🎨 Gerando pacote criativo pra *${personaCodigo}*...\n\nBriefing: "${briefing}"\n\nIsso leva 2-3 min (3 imagens + 3 copies). Aguarda.`);

    try {
      const { creative_id, pkg, persona } = await creativeAgent.generatePackage({
        briefing,
        persona_codigo: personaCodigo,
      });

      let preview = `🎨 *Criativo #${creative_id}* — ${persona.nome}\n\n📝 *Copies (3 variacoes):*\n`;
      pkg.copies.forEach((c, i) => {
        preview += `\n${i + 1}. [${c.length}]\n*${c.headline}*\n${c.body}\n→ CTA: _${c.cta}_\n`;
      });
      preview += `\n🖼 3 imagens chegando...`;
      await sendText(from, preview);

      // Manda as 3 imagens (Eva ja persistiu URLs em Supabase Storage — duraveis)
      for (const img of pkg.imagens) {
        if (metaWaba) {
          try {
            await metaWaba.sendMedia(from, img.url, `[${img.style}]`, 'image');
          } catch (err) {
            console.warn(`[creative-agent] sendMedia falhou (${img.style}):`, (err as Error).message);
            await sendText(from, `🖼 [${img.style}]\n${img.url}`);
          }
        } else {
          await sendText(from, `🖼 [${img.style}]\n${img.url}`);
        }
      }

      // Botoes de aprovacao
      const buttonBody = `O que faço com o criativo #${creative_id}?`;
      if (metaWaba) {
        try {
          await metaWaba.sendInteractiveButtons(
            from,
            buttonBody,
            [
              { id: `criativo_aprovar_${creative_id}`, title: '✅ Aprovar' },
              { id: `criativo_regenerar_${creative_id}`, title: '🔄 Regenerar' },
              { id: `criativo_descartar_${creative_id}`, title: '❌ Descartar' },
            ],
            'Toque pra responder',
          );
        } catch (err) {
          console.warn('[creative-agent] botoes falharam, fallback texto:', (err as Error).message);
          await sendText(from,
            `${buttonBody}\n\n` +
            `✅ criativo_aprovar_${creative_id}\n` +
            `🔄 criativo_regenerar_${creative_id}\n` +
            `❌ criativo_descartar_${creative_id}`);
        }
      } else {
        await sendText(from,
          `${buttonBody}\n\n` +
          `✅ Responde: criativo_aprovar_${creative_id}\n` +
          `🔄 Responde: criativo_regenerar_${creative_id}\n` +
          `❌ Responde: criativo_descartar_${creative_id}`);
      }
    } catch (err) {
      console.error('[creative-agent] erro:', (err as Error).message);
      await sendText(from, `❌ Erro gerando criativo: ${(err as Error).message}`);
    }
  }

  // Eva /menu — lista interativa com TODOS os modos admin disponiveis. Aceita
  // "menu" (sem barra) e "/menu". Toque numa row dispara o modo correspondente
  // chamando o tryHandle*Command com a string-trigger natural daquele modo
  // (ex: "criativo", "/preco", "/agenda"...). Reaproveita os triggers ja
  // existentes — nao duplica logica de cada modo aqui.
  //
  // Aplica feedback_botoes_zap + feedback_opcoes_abc: comando admin sempre
  // fluxo conversacional + opcoes rotuladas, nunca texto livre + memorizar codigos.
  async function tryHandleMenuCommand(from: string, text: string): Promise<boolean> {
    if (!isAdminPhone(from)) return false;
    const trimmedLower = text.trim().toLowerCase();

    // Triggers: "menu" abre as categorias; "menucat_<cat>" abre o submenu da
    // categoria; "menu_<modo>" executa o comando (ou manda a dica de uso).
    const isMenuTrigger = trimmedLower === 'menu' || trimmedLower === '/menu';
    const catClick = text.trim().match(/^menucat_([a-z_]+)$/);
    const itemClick = text.trim().match(/^menu_([a-z_]+)$/);
    if (!isMenuTrigger && !catClick && !itemClick) return false;

    // Estrutura em 2 níveis. Cada item: ou reroteia pro handler do modo (trigger +
    // handler já existentes), ou manda uma DICA de texto (hint) — pros comandos que
    // precisam de um nome (ajustar/contrato) ou não têm handler de comando próprio.
    const MENU_CATEGORIES = construirMenu({
      pricing: tryHandlePricingCommand,
      proposal: tryHandleProposalCommand,
      closing: tryHandleClosingCommand,
      creative: tryHandleCreativeCommand,
      banner: tryHandleBannerCommand,
      bannerKits: tryHandleBannerKitsCommand,
      reativarBase: tryHandleReativarBaseCommand,
      juniorBlog: tryHandleJuniorBlogCommand,
      scheduling: tryHandleSchedulingCommand,
      caseCreator: tryHandleCaseCreatorCommand,
      testimonialAdmin: tryHandleTestimonialAdminCommand,
      relatorio: tryHandleRelatorioCommand,
      resgatarForms: tryHandleResgatarFormsCommand,
      googleAds: tryHandleGoogleAdsCommand,
      campanha: tryHandleCampanhaCommand,
      acaoImposto: async (to: string) => {
        await setImpostoAwait(to);
        await sendText(to, '🧾 Qual o valor da venda? Manda só o número (ex: *30000* ou *30 mil*).');
      },
      acaoApagar: async (to: string) => {
        const { montarListaApagar } = await import('./modules/financeiro/apagar-menu.js');
        const lista = await montarListaApagar(supabase.getClient());
        if (!lista) { await sendText(to, 'Nenhum lançamento nos últimos 30 dias. 👍'); return; }
        if (metaWaba) {
          const footer = lista.total >= 10 ? 'Os 10 mais recentes' : 'Toque pra escolher';
          await metaWaba.sendInteractiveList(to, { header: '🗑️ Apagar', body: 'Qual lançamento você quer apagar?', buttonText: 'Escolher', sections: [{ title: 'Últimos 30 dias', rows: lista.rows }], footer });
        } else {
          await sendText(to, 'Apaga pelo painel: dashboard.ecosunpower.eng.br/dashboard/financeiro');
        }
      },
      acaoFecheiVenda: async (to: string) => {
        // Clicável: manda a lista de propostas em aberto; o Junior toca no cliente
        // que fechou e o toque volta como texto 'fechei_pick:<leadId>' (tratado
        // em tryHandleFecheiPick). "Tudo no menu, fácil de clicar".
        const { listarPropostasAbertas } = await import('./modules/vendas/propostas-abertas.js');
        const rows = await listarPropostasAbertas(supabase.getClient(), 9);
        if (rows.length === 0) {
          await sendText(to, 'Nenhuma proposta em aberto encontrada. Se já vendeu mesmo assim, manda: *fechei nome do cliente*');
          return;
        }
        if (metaWaba) {
          await metaWaba.sendInteractiveList(to, {
            header: '✅ Fechei uma venda',
            body: 'Toque no cliente que fechou a venda:',
            buttonText: 'Escolher',
            sections: [{ title: 'Propostas em aberto', rows: rows.map((r) => ({ id: r.id, title: r.title, description: r.description })) }],
            footer: 'Marca a venda e avisa o Elo',
          });
        } else {
          await sendText(to, 'Pra registrar a venda, manda: *fechei nome do cliente*');
        }
      },
      acaoGerarPost: async (to: string) => {
        if (!marketing) { await sendText(to, '❌ Geração de posts está desativada.'); return; }
        await sendText(to, '✨ Gerando um post de teste (imagem)... chega aqui em ~1 min.');
        // Em segundo plano: a geração leva ~1 min, não pode travar o toque do menu.
        void (async () => {
          try {
            const draft = await marketing.generateDraft(undefined, false); // false = imagem (não vídeo)
            await sendDraftToJunior(draft.id);
          } catch (err) {
            console.error('[marketing] gerar-post teste falhou:', err);
            await sendText(to, `❌ Não consegui gerar o post agora: ${(err as Error).message}`);
          }
        })();
      },
    });

    const enviarLista = async (header: string, body: string, rows: Array<{ id: string; title: string; description: string }>, secTitle: string): Promise<void> => {
      if (metaWaba) {
        try {
          await metaWaba.sendInteractiveList(from, { header, body, buttonText: 'Escolher', sections: [{ title: secTitle, rows }], footer: 'Toque pra abrir' });
          return;
        } catch (err) {
          console.warn('[menu-admin] lista interativa falhou, fallback texto:', (err as Error).message);
        }
      }
      const linhas = rows.map(r => `${r.title}\n   _${r.description}_`).join('\n\n');
      await sendText(from, `*${header}*\n\n${body}\n\n${linhas}`);
    };

    // Nível 1: "menu" → categorias
    if (isMenuTrigger) {
      const rows = rowsCategorias(MENU_CATEGORIES);
      await enviarLista('⚙️ Menu', 'Escolha uma categoria:', rows, 'Categorias');
      return true;
    }

    // Nível 2: "menucat_<cat>" → comandos da categoria
    if (catClick) {
      const cat = MENU_CATEGORIES.find(c => c.id === catClick[1]);
      if (!cat) {
        await sendText(from, '⚠️ Categoria não encontrada. Manda *menu* de novo.');
        return true;
      }
      const rows = rowsSubmenu(cat);
      await enviarLista(cat.title, 'O que você quer fazer?', rows, cat.title.replace(/^\S+\s/, ''));
      return true;
    }

    // Nível 3: "menu_<modo>" → executa o comando ou manda a dica
    if (itemClick) {
      const item = MENU_CATEGORIES.flatMap(c => c.items).find(i => i.id === `menu_${itemClick[1]}`);
      if (!item) {
        await sendText(from, `⚠️ Opção não reconhecida. Manda *menu* pra ver de novo.`);
        return true;
      }
      if (item.action) {
        await item.action(from);
        return true;
      }
      if (item.hint) {
        await sendText(from, item.hint);
        return true;
      }
      if (item.handler && item.trigger) {
        // Cada handler já gateia em isAdminPhone e não chama o menu de volta (sem loop).
        const handled = await item.handler(from, item.trigger);
        if (!handled) {
          await sendText(from, `⚠️ "${item.title}" indisponível agora (provável env var faltando). Olha os logs do Easypanel.`);
        }
        return true;
      }
      await sendText(from, `⚠️ Opção sem ação configurada. Manda *menu* de novo.`);
      return true;
    }

    return false;
  }

  // Message handler
  async function handleTextMessage(
    from: string,
    text: string,
    ctwaReferral?: import('./modules/evolution.js').IncomingMessage['referral'],
    companyId?: string,
  ) {
    // EVA MT FATIA 3a — o banco DESTA mensagem: com RLS_EVA=1 + env + companyId
    // resolvido, as escritas rodam com o crachá da empresa (RLS 079 impõe o
    // isolamento). Flag desligada → `db === supabase` (mesma instância, zero
    // mudança). Núcleo (3a), actions (3b), helpers (3c) e singletons (3d) já
    // recebem este db; crons/HTTP/admin seguem no singleton de propósito.
    const db = supabase.paraMensagem(companyId);

    // Hook: se essa mensagem eh de cliente que recebeu followup automatico
    // de proposta, marca como "cliente respondeu" no banco. Fire-and-forget,
    // nao bloqueia o handler. No-op se nao houver proposta correspondente.
    // [MT 3d] escrita pelo crachá; os botões admin logo abaixo ficam no
    // singleton (admin = EcoSun, fora do caminho do tenant).
    proposalFollowup.markClienteRespondeu(from, db);

    // Botoes do followup de proposta (junior_envia, modo "Eva pergunta antes
    // de mandar"). So Junior (admin) toca esses botoes — early return.
    const fwupBtn = text.trim().toLowerCase().match(/^prop:fwup-(eva|junior|esperar):([\w-]{8,40})$/);
    if (fwupBtn && isAdminPhone(from)) {
      const acao = fwupBtn[1];
      const slug = fwupBtn[2];
      if (acao === 'eva') proposalFollowup.triggerEnvioPorBotao(slug);
      else if (acao === 'junior') proposalFollowup.marcarJuniorVaiContatar(slug);
      else if (acao === 'esperar') proposalFollowup.postergarFollowup(slug);
      return;
    }

    // Botões do Núcleo Financeiro (só admin recebe esses botões).
    // finrec:<fechamentoId>:<atividadeId> — cria a conta a receber da venda.
    if (isAdminPhone(from) && text.trim().startsWith('finrec:')) {
      const [, finFechamentoId, finAtividadeId] = text.trim().split(':');
      try {
        if (!metaWaba) throw new Error('WABA indisponível pros botões do financeiro');
        if (!finFechamentoId || !finAtividadeId) throw new Error('botão finrec sem fechamento/atividade');
        const { createFechamentoConta } = await import('./modules/financeiro/engate-fechar.js');
        await createFechamentoConta(supabase.getClient(), metaWaba, from, finFechamentoId, finAtividadeId);
        // Hook de funil (Fase 2) — venda confirmada (botão finrec cria a conta a
        // receber). Avança o lead pra 'ganho' + loga na timeline. Best-effort:
        // erro de funil nunca quebra o lançamento financeiro.
        try {
          const { data: fch } = await supabase.getClient()
            .from('fechamentos').select('lead_id').eq('id', finFechamentoId).maybeSingle();
          const leadGanhoId = (fch as { lead_id?: string | null } | null)?.lead_id ?? null;
          if (leadGanhoId) await supabase.onLeadGanho(leadGanhoId);
        } catch (e) {
          console.warn('[funil] onLeadGanho falhou:', (e as Error).message);
        }
      } catch (err) {
        console.error('[financeiro] finrec falhou:', (err as Error).message);
        await sendText(from, `❌ Erro ao lançar no financeiro: ${(err as Error).message}`);
      }
      return;
    }

    // finrcv:<acao>:<contaId> — recebido total/parcial/cancelar; atualiza
    // RBT12 + imposto confirmado. 'noop' é o botão "OK" das confirmações:
    // só fecha o balão, sem resposta (id solto cairia no fluxo da Eva).
    if (isAdminPhone(from) && text.trim().startsWith('finrcv:')) {
      const [, finAcao, finContaId] = text.trim().split(':');
      if (finAcao === 'noop') return;
      if (finAcao !== 'total' && finAcao !== 'parcial' && finAcao !== 'cancelar') {
        console.warn(`[financeiro] finrcv ação desconhecida: ${finAcao}`);
        return;
      }
      try {
        if (!metaWaba) throw new Error('WABA indisponível pros botões do financeiro');
        if (!finContaId) throw new Error('botão finrcv sem conta');
        const { handleRecebimento } = await import('./modules/financeiro/engate-fechar.js');
        await handleRecebimento(supabase.getClient(), metaWaba, from, finAcao, finContaId);
      } catch (err) {
        console.error('[financeiro] finrcv falhou:', (err as Error).message);
        await sendText(from, `❌ ${(err as Error).message}`);
      }
      return;
    }

    // matcorr:<acao>:<compraId>:<centavos> — confirmação da correção tardia de preço.
    if (isAdminPhone(from) && metaWaba && text.trim().startsWith('matcorr:')) {
      const [, acao, compraId, centavos] = text.trim().split(':');
      if (acao === 'no') { await sendText(from, 'Beleza, deixei como tava. 👍'); return; }
      if (acao === 'ok') {
        const { atualizarPrecoCompra } = await import('./modules/financeiro/correcao-preco.js');
        const novo = Number(centavos) / 100;
        const ok = await atualizarPrecoCompra(supabase.getClient(), compraId, novo).catch(() => false);
        await sendText(from, ok
          ? `✅ Atualizei pra ${novo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`
          : 'Não achei mais esse registro pra atualizar. 🤔');
      } else {
        console.warn(`[correcao-preco] matcorr ação desconhecida: ${acao}`);
      }
      return;
    }

    // finlan:<acao>:<id>[:<extra>] — botões da Caixa de Entrada (Fatia 3).
    if (isAdminPhone(from) && text.trim().startsWith('finlan:')) {
      if (!metaWaba) {
        console.warn('[caixa-entrada] WABA indisponível');
        await sendText(from, '❌ WABA indisponível pros botões do financeiro');
        return;
      }
      const { handleFinlanButton } = await import('./modules/financeiro/caixa-entrada.js');
      await handleFinlanButton(getCaixaDeps(), from, text.trim());
      return;
    }

    // mab:<acao>:<id|tipo> — botões do Monitoramento Evolutivo (aprovar/ajustar/
    // descartar abordagem, feedback 👍/👎, autonomia, pós-sem-resposta).
    // ORDEM DOS BLOCOS ADMIN (decisão Task 8): finrec → finrcv → finlan → mab →
    // ...comandos/modos... → pré-checagem de ajuste do monitoramento (ANTES do
    // gate financeiro, pra "tira o emoji" não pagar Haiku à toa) → gate
    // financeiro → takeover. Gateado em isAdminPhone — cliente nem entra.
    if (isAdminPhone(from) && text.trim().startsWith('mab:')) {
      if (!metaWaba) {
        console.warn('[abordagem] WABA indisponível pros botões mab');
        await sendText(from, '❌ WABA indisponível pros botões do monitoramento');
        return;
      }
      const { handleMabButton } = await import('./modules/monitoring/abordagem/orquestrador.js');
      await handleMabButton(getOrqDeps(), text.trim());
      return;
    }

    // Opt-out do CLIENTE — detecta "sair"/"parar"/"stop"/etc antes de qualquer
    // outro handler pra parar de mandar mensagens imediatamente.
    if (await tryHandleClienteOptOut(from, text)) return;

    // Submenu Financeiro — "Apagar lançamento": clique na row da lista (findel:<id>),
    // confirmar (findel-go:<id>) ou cancelar (findel-no). Admin-only.
    if (isAdminPhone(from) && text.trim().startsWith('findel')) {
      const t = text.trim();
      const { montarConfirmacaoApagarLancamento, executarApagarLancamento } = await import('./modules/financeiro/apagar-menu.js');
      if (t === 'findel-no') { await sendText(from, 'Ok, não apaguei nada. 👍'); return; }
      const idValido = (id: string) => /^[0-9a-f-]{30,40}$/i.test(id); // uuid (evita erro técnico com id quebrado)
      if (t.startsWith('findel-go:')) {
        const id = t.slice('findel-go:'.length);
        if (!idValido(id)) { await sendText(from, 'Lançamento inválido 🤔'); return; }
        await sendText(from, await executarApagarLancamento(supabase.getClient(), id));
        return;
      }
      if (t.startsWith('findel:')) {
        const id = t.slice('findel:'.length);
        if (!idValido(id)) { await sendText(from, 'Lançamento inválido 🤔'); return; }
        const conf = await montarConfirmacaoApagarLancamento(supabase.getClient(), id);
        if (!conf) { await sendText(from, 'Não achei esse lançamento (talvez já apagado) 🤔'); return; }
        if (metaWaba) await metaWaba.sendInteractiveButtons(from, conf.body, conf.buttons);
        else await sendText(from, conf.body);
        return;
      }
    }

    // Submenu Financeiro — "Calcular imposto": o admin tocou e está digitando o
    // valor. Calcula aqui (ANTES do caixa) e nunca deixa virar lançamento. Se o
    // texto não parece valor (ex: "menu"), sai do modo e segue o roteamento normal.
    if (isAdminPhone(from) && (await impostoAwaitActive(from))) {
      const valorImposto = parseValorReais(text);
      console.log(`[imposto-await] CHECK ${from} parsed=${valorImposto}`);
      if (valorImposto !== null) {
        if (valorImposto < 100) {
          // Venda real nunca é < R$100 (ex: "85.50" lido como R$85,50). Repergunta
          // e mantém o modo aberto em vez de calcular 100× menor calado.
          await setImpostoAwait(from);
          const fmt = valorImposto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
          await sendText(from, `🤔 ${fmt}? Parece baixo pra uma venda. Manda o valor de novo (ex: *30000* ou *30 mil*).`);
          return;
        }
        await clearImpostoAwait(from);
        await sendText(from, await montarRespostaImposto(supabase.getClient(), valorImposto));
        return;
      }
      await clearImpostoAwait(from); // não era valor → sai do modo e segue
    }

    // /menu (Junior) — lista interativa com TODOS os modos admin. Vem ANTES de
    // tudo pra Junior conseguir abrir o menu mesmo dentro de outro modo (escapa).
    // Cliques nas rows tambem chegam aqui (id "menu_<modo>") e re-roteiam pra
    // tryHandle* correspondente. Gateado em isAdminPhone — cliente nem entra.
    if (await tryHandleMenuCommand(from, text)) return;

    // "rascunho" (Junior) — resume a proposta em andamento (cliente + o que falta).
    // Vem ANTES do modo proposta normal pra funcionar mesmo dentro da sessão: o
    // Junior saiu pra atender um alerta e quer voltar de onde parou.
    {
      const rascunhoTxt = text.trim().toLowerCase();
      if (isAdminPhone(from) && (rascunhoTxt === 'rascunho' || rascunhoTxt === '/rascunho')) {
        // handleRascunho retorna null quando já mandou o resumo + botões via
        // metaService (balão único) — nesse caso não reenviamos texto.
        const reply = await proposalAssistant.handleRascunho(from);
        if (reply) await sendText(from, reply);
        return;
      }
    }

    // "/resgatar-propostas" (Junior) — resgata o dados_input das propostas antigas
    // (que ficaram sem dados e não reabrem) a partir do JSON salvo no Drive. Passo 1:
    // conta + pede confirmação por botão. Passo 2 (tap no botão, id chega como texto):
    // executa e reporta. SEGURO: só toca proposta com dados_input nulo, não refaz nada.
    {
      const tr = text.trim().toLowerCase();
      const ehBotaoResgatar = tr.startsWith('resgatar:');
      const ehConfirmarResgate = tr === 'resgatar:confirmar';
      const ehCancelarResgate = tr === 'resgatar:cancelar';
      const ehPedidoResgate = !ehBotaoResgatar && /^\/?resgatar(-propostas|\s+propostas)?$/.test(tr);
      if (isAdminPhone(from) && (ehPedidoResgate || ehConfirmarResgate || ehCancelarResgate)) {
        if (ehCancelarResgate) {
          await sendText(from, '👍 Beleza, não resgatei nada.');
          return;
        }
        if (!driveUploader) {
          await sendText(from, '⚠️ O Drive não está configurado aqui — não dá pra resgatar.');
          return;
        }
        if (ehPedidoResgate) {
          try {
            const n = await contarPropostasSemDados(supabase);
            if (n === 0) {
              await sendText(from, '✅ Nenhuma proposta antiga sem dados. Tá tudo certo!');
              return;
            }
            const corpo = `Tem *${n}* proposta(s) antiga(s) sem os dados salvos (não reabrem). Posso resgatar do Drive agora?`;
            if (metaWaba) {
              await metaWaba.sendInteractiveButtons(from, corpo, [
                { id: 'resgatar:confirmar', title: `✅ Resgatar (${n})`.slice(0, 20) },
                { id: 'resgatar:cancelar', title: 'Cancelar' },
              ]);
            } else {
              await sendText(from, `${corpo}\nResponda *resgatar:confirmar* pra prosseguir.`);
            }
          } catch (err) {
            console.error('[resgatar] contagem falhou:', (err as Error).message);
            await sendText(from, '⚠️ Deu erro contando as propostas. Tenta de novo.');
          }
          return;
        }
        // ehConfirmarResgate
        await sendText(from, '🔄 Resgatando do Drive, aguarde (pode levar alguns segundos)...');
        try {
          const res = await resgatarDadosInput({ supabase, drive: driveUploader, apply: true });
          await sendText(
            from,
            `✅ Resgate concluído:\n• ${res.resgatadas} recuperada(s)\n• ${res.semJson} sem backup no Drive\n• ${res.falhas} falha(s)\n\nAs recuperadas já reabrem normal no dashboard.`,
          );
        } catch (err) {
          console.error('[resgatar] execução falhou:', (err as Error).message);
          await sendText(from, '⚠️ Deu erro no resgate. Me chama que a gente vê o log.');
        }
        return;
      }
    }

    // Comandos admin de blog (publicar/descartar/blog status) PRECISAM vir primeiro,
    // antes dos modos /preco /proposta /agenda — porque Junior pode estar em qualquer
    // modo e ainda assim querer publicar/descartar um draft. tryHandleJuniorBlogCommand
    // ja gateia em isAdminPhone, entao nao afeta clientes.
    if (await tryHandleJuniorBlogCommand(from, text)) return;

    // Comandos admin de depoimento — alta prioridade pra Junior poder aprovar
    // mesmo no meio de outro modo (precificacao/proposta/agenda).
    if (await tryHandleTestimonialAdminCommand(from, text)) return;

    // Botoes interativos enviados pelos alertas/digest da Eva. Id no formato
    // "evabt:<acao>[:<leadId>]". Quando Junior toca, vem como text aqui.
    // So processa pra admin — clientes nunca recebem esses botoes.
    if (isAdminPhone(from)) {
      // Botões do aviso de SLA (Task 11): "sla_cobrar|eufalo|adiar:<tarefaId>".
      // Roteia ANTES do evabt pra não cair em "botão não reconhecido".
      if (text.trim().startsWith('sla_')) {
        try {
          const { handleSlaButton } = await import('./modules/dashboard/sla-notifier.js');
          if (await handleSlaButton(supabase.getClient(), text.trim(), (t) => sendText(from, t))) return;
        } catch (err) {
          console.warn('[sla-buttons] falha:', (err as Error).message);
          await sendText(from, '⚠️ Deu erro ao processar o botão de SLA.');
          return;
        }
      }

      const { tryHandleEvaAdminButton } = await import('./modules/eva-admin-buttons.js');
      const forceCadenceForSilentes = async (): Promise<{ acionados: number }> => {
        const silentes = await supabase.getSilentLeadsWithoutCadence(24);
        let acionados = 0;
        for (const l of silentes) {
          try {
            await supabase.scheduleCadenceContinuation(l.id, 0);
            acionados++;
          } catch (err) {
            console.warn(`[admin-buttons] falha pra agendar lead ${l.id}:`, (err as Error).message);
          }
        }
        return { acionados };
      };
      if (await tryHandleEvaAdminButton({
        client: supabase.getClient(),
        sendText,
        from,
        text,
        forceCadenceForSilentes,
        supabase,
        // Botoes que vem SEM modo embutido (alertas antigos, pick generico)
        // perguntam o modo antes de entrar no fluxo. Evita default ambos
        // sempre que o admin escolheu o lead sem ter dito qual doc quer.
        onFecharStart: async (leadId) => {
          if (metaWaba) {
            await metaWaba.sendInteractiveButtons(from,
              'O que você quer gerar?',
              [
                { id: `evabt:fechar-doc:procuracao:${leadId}`, title: 'Procuração' },
                { id: `evabt:fechar-doc:contrato:${leadId}`, title: 'Contrato' },
                { id: `evabt:fechar-doc:ambos:${leadId}`, title: 'Ambos' },
              ],
            );
          } else {
            await sendText(from, 'Manda: procuracao <nome>, contrato <nome>, ou fechar <nome> + Ambos.');
          }
        },
        onFecharPick: async (leadId) => {
          if (metaWaba) {
            await metaWaba.sendInteractiveButtons(from,
              'O que você quer gerar?',
              [
                { id: `evabt:fechar-doc:procuracao:${leadId}`, title: 'Procuração' },
                { id: `evabt:fechar-doc:contrato:${leadId}`, title: 'Contrato' },
                { id: `evabt:fechar-doc:ambos:${leadId}`, title: 'Ambos' },
              ],
            );
          } else {
            await sendText(from, 'Manda: procuracao <nome>, contrato <nome>, ou fechar <nome> + Ambos.');
          }
        },
        onFecharApprove: (fechamentoId) => handleFecharApprove(fechamentoId, from),
        onFecharRefazer: (fechamentoId) => handleFecharRefazer(fechamentoId, from),
        onFecharCancel: (fechamentoId) => handleFecharCancel(fechamentoId, from),
        onFecharGerarConfirm: () => handleFecharGerarConfirm(from),
        onFecharAjustar: () => handleFecharAjustar(from),
        onFecharSair: () => handleFecharSair(from),
        onFecharDocPick: (cmd, leadId) => {
          const docs: ('procuracao' | 'contrato')[] =
            cmd === 'procuracao' ? ['procuracao'] :
            cmd === 'contrato' ? ['contrato'] :
            ['procuracao', 'contrato'];
          return handleFecharStart(leadId, from, docs);
        },
        onDonoCadStart: async (sistemaId) => {
          const sistema = await supabase.getSistemaById(sistemaId);
          if (!sistema) { await sendText(from, '⚠️ Usina não encontrada.'); return; }
          if (sistema.lead_id) {
            const lead = await supabase.getLeadById(sistema.lead_id);
            await sendText(from, `Essa usina já está vinculada a ${lead?.name ?? 'um cliente'}.`);
            return;
          }
          await setDonoCadState(from, { etapa: 'escolha', sistemaId });
          await donoEnviarEscolha(from);
        },
        onDonoExiste: async () => {
          const st = await getDonoCadState(from);
          if (!st) return;
          await setDonoCadState(from, { etapa: 'busca', sistemaId: st.sistemaId });
          await sendText(from, 'Qual o nome do cliente? (digite parte do nome)');
        },
        onDonoNovo: async () => {
          const st = await getDonoCadState(from);
          if (!st) return;
          await setDonoCadState(from, { etapa: 'novo', sistemaId: st.sistemaId, campo: 'name', dados: {} });
          await sendText(from, perguntaNovo('name'));
        },
        onDonoPick: async (leadId) => {
          const st = await getDonoCadState(from);
          if (!st) return;
          const r = await supabase.vincularClienteExistente({ sistema_id: st.sistemaId, lead_id: leadId });
          if (!r.ok) { await sendText(from, `⚠️ ${r.error ?? 'Falha ao vincular'}`); return; }
          const lead = await supabase.getLeadById(leadId);
          await sendText(from, `✅ Usina vinculada a ${lead?.name ?? 'cliente'}. Agora vou completar os dados da usina.`);
          await donoIniciarEtapaUsina(from, st.sistemaId);
        },
        onDonoPular: async () => {
          const st = await getDonoCadState(from);
          if (!st) return;
          if (st.etapa === 'novo') { await donoAvancarNovo(from, st, undefined); return; }
          if (st.etapa === 'usina') { await donoAvancarUsina(from, st, undefined); return; }
        },
        onDonoPularTudo: async () => {
          const st = await getDonoCadState(from);
          if (st?.etapa === 'usina') { await donoFinalizar(from, st.sistemaId); }
        },
        onDonoCancelar: async () => {
          await clearDonoCadState(from);
          await sendText(from, 'Cadastro cancelado. O alerta volta na próxima rodada.');
        },
        // Campanha via Eva: botões do preview. Aprovar dispara o envio (pesado,
        // roda em segundo plano); refazer gera outra; descartar só arquiva.
        onCampanhaAprovar: campanha ? async (id) => {
          const dest = await supabase.listarDestinatariosCampanha(1000).catch(() => []);
          await sendText(from, `📤 Enviando pra ${dest.length} leads...`);
          void (async () => {
            try {
              const r = await campanha!.aprovar(id);
              await sendText(from, `✅ Campanha enviada pra ${r.enviados} leads!`);
            } catch (err) {
              await sendText(from, `❌ Erro ao enviar a campanha: ${(err as Error).message}`);
            }
          })();
        } : undefined,
        onCampanhaRefazer: campanha ? async (id) => {
          await sendText(from, '🔄 Refazendo... te mando um novo preview em ~1 min.');
          void (async () => {
            try {
              await campanha!.refazer(id);
            } catch (err) {
              await sendText(from, `❌ Não consegui refazer: ${(err as Error).message}`);
            }
          })();
        } : undefined,
        onCampanhaDescartar: campanha ? async (id) => {
          await campanha!.descartar(id);
          await sendText(from, '🗑️ Campanha descartada.');
        } : undefined,
      })) return;
    }

    // /sync-marketing — forca sync Meta -> DB + collect insights. One-shot.
    if (await tryHandleSyncMarketingCommand(from, text)) return;

    // /post-fb <texto> — posta no FB Ecosunpower (exercita pages_manage_posts)
    if (await tryHandlePostFbCommand(from, text)) return;

    // /banner-kits — gera banner tabela 6 kits OnGrid (criativo Meta Ads)
    if (await tryHandleBannerKitsCommand(from, text)) return;

    // /google [dias] — snapshot Google Ads (gasto, cliques, CPC, CTR) via WhatsApp
    if (await tryHandleGoogleAdsCommand(from, text)) return;

    // /reativar-base — dispara template MARKETING pra leads frios da base terceirizada
    if (await tryHandleReativarBaseCommand(from, text)) return;

    // /imposto <valor> — imposto por anexo + Fator R + salto de faixa (Núcleo Financeiro)
    if (await tryHandleImpostoCommand(from, text)) return;

    // Consulta de preço de material ("preço do DPS") — antes do gate do caixa.
    if (await tryHandleConsultaMaterial(from, text)) return;

    // Correção tardia de preço de material (precisa vir antes do gate do caixa).
    if (await tryHandleCorrecaoPreco(from, text)) return;

    // "relatório [mês]" — resumo financeiro do mês (Peça 3); antes do gate da Caixa de Entrada
    if (await tryHandleRelatorioCommand(from, text)) return;

    // /recarregar-config — recarrega empresa_config do banco sem redeploy
    if (await tryHandleRecarregarConfigCommand(from, text)) return;

    // /resgatar-forms — dispara template inicial pra leads de formulário Meta sem 1ª mensagem
    if (await tryHandleResgatarFormsCommand(from, text)) return;

    // Toque no botão de tipo (sistema/serviço) logo após registrar a venda.
    if (await tryHandleVendaTipo(from, text)) return;

    // Resposta com o VALOR logo após tocar em "Fechei uma venda" — vem antes de
    // tudo (inclusive do gate financeiro) pra o número não virar outra coisa.
    if (await tryHandleFecheiValor(from, text)) return;

    // Toque na lista "Fechei uma venda" (fechei_pick:<leadId>) — vem antes do
    // /fechei por texto, pra o id da linha não cair no parser de nome.
    if (await tryHandleFecheiPick(from, text)) return;

    // /fechei — marca lead como cliente fechado (remove da cadência)
    if (await tryHandleFecheiCommand(from, text)) return;

    // /email — adiciona/atualiza email de um lead
    if (await tryHandleEmailCommand(from, text)) return;

    // /campanha — gera campanha de e-mail (Claude + FLUX) e manda preview pro Junior
    if (await tryHandleCampanhaCommand(from, text)) return;

    // /banner — modo conversacional (captura respostas durante fluxo) + comando inicial
    if (await tryHandleBannerModeStep(from, text)) return;
    if (await tryHandleBannerCommand(from, text)) return;

    // Eva /criativo — Junior gera pacote criativo (3 copies + 3 imagens) por
    // persona/briefing. Tambem captura cliques nos botoes Aprovar/Regenerar/Descartar.
    // Comando one-shot (nao tem modo conversacional persistente), seguro chamar antes.
    if (await tryHandleCreativeCommand(from, text)) return;

    // Eva /novo-case — cadastrar obra via WhatsApp. Captura tudo enquanto em modo,
    // entao precisa vir antes dos outros assistants pra eles nao "roubarem" a msg.
    if (await tryHandleCaseCreatorCommand(from, text)) return;

    // Eva dono-cad — Junior cadastra dono de usina órfã (só age se em modo).
    // Sobe ANTES dos handlers de modo (pricing/proposal/closing): quando Junior está no
    // meio do fluxo dono-cad, o texto dele tem prioridade e não colide com outro gatilho.
    // Só retorna true se há estado dono-cad ativo (guard if (!st) return false).
    if (await tryHandleDonoCadCommand(from, text)) return;

    // Eva Precificadora tem prioridade total quando Junior usa /preco ou esta em modo
    if (await tryHandlePricingCommand(from, text)) return;

    // Eva Proposta — Junior gera proposta comercial completa (PDF + web)
    if (await tryHandleProposalCommand(from, text)) return;

    // 📄 Gerador CONFIÁVEL na Eva: "contrato <nome>" / "procuracao <nome>" gera o
    // PDF direto dos dados (proposta+cadastro) e MANDA no zap. Nunca trava. Vem
    // ANTES do /fechar conversacional (que travava) pra ser o caminho padrão.
    if (await tryHandleContratoRapido(from, text)) return;

    // Eva Fechamento — Junior gera contrato + procuração via /fechar
    if (await tryHandleClosingCommand(from, text)) return;

    // Eva Agendadora — prioridade depois do pricing
    if (await tryHandleSchedulingCommand(from, text)) return;

    // "abordar <nome>" — Eva aborda o cliente na hora (proposta aberta antes do
    // automático). DEPOIS dos gates de modo: se Junior tá no meio de um fluxo
    // (proposta/preço/agenda) e a frase começar com "abordar", o modo trata —
    // o comando não sequestra a conversa. Fora de modo, dispara normal.
    if (await tryHandleAbordarCommand(from, text)) return;

    // "ajustar <nome>" / "atualizar <nome>" (Junior) — reabre uma proposta JÁ
    // ENVIADA DENTRO do zap: a Eva carrega os dados e o Junior ajusta conversando,
    // regerando no MESMO link. DEPOIS dos handlers de modo de propósito: se Junior
    // já está numa proposta e digita "ajusta o valor", o modo pega primeiro — aqui
    // só chega texto FORA de modo. Antes do gate financeiro pra não virar "gasto".
    {
      const tRaw = text.trim();
      const mBotaoAjustar = /^ajustar:([A-Za-z0-9_-]{16,32})$/.exec(tRaw);
      const mCmdAjustar = /^\/?(ajustar|atualizar)\b\s*(.*)$/i.exec(tRaw);
      if (isAdminPhone(from) && (mBotaoAjustar || mCmdAjustar)) {
        const dashboardBaseUrl = (process.env.DASHBOARD_BASE_URL ?? 'https://dashboard.ecosunpower.eng.br').replace(/\/$/, '');
        const abrirReopen = async (slug: string): Promise<void> => {
          const prop = await supabase.getPropostaInputBySlug(slug);
          if (!prop) {
            await sendText(from, 'Não achei essa proposta (pode ter sido revogada).');
            return;
          }
          if (!prop.dadosInput) {
            await sendText(from, `A proposta *${prop.numeroProposta}* é antiga e não tem os dados salvos pra ajustar. Manda */resgatar-propostas* primeiro que eu recupero do Drive.`);
            return;
          }
          const reply = await proposalAssistant.startReopenMode(from, {
            slug,
            numeroProposta: prop.numeroProposta,
            clienteNome: prop.clienteNome,
            modoEnvio: prop.modoEnvio,
            tipo: prop.tipo,
            dadosInput: prop.dadosInput as Record<string, unknown>,
            dashboardUrl: `${dashboardBaseUrl}/propostas/${slug}/preview`,
          });
          await sendText(from, reply);
        };

        if (mBotaoAjustar) {
          await abrirReopen(mBotaoAjustar[1]);
          return;
        }

        const nome = (mCmdAjustar![2] ?? '').trim();
        if (!nome) {
          await sendText(from, 'Manda assim: *ajustar nome do cliente*.\nEx: _ajustar Olavo_');
          return;
        }
        try {
          const matches = await supabase.buscarPropostasPorNome(nome, 5);
          if (matches.length === 0) {
            await sendText(from, `🔍 Não achei proposta pra *${nome}*. Confere o nome ou veja em ${dashboardBaseUrl}/propostas`);
          } else if (matches.length === 1) {
            await abrirReopen(matches[0].slug);
          } else if (metaWaba) {
            const corpo = `Achei ${matches.length} propostas pra *${nome}*. Qual você quer ajustar?`;
            const botoes = matches.slice(0, 3).map((m) => ({ id: `ajustar:${m.slug}`, title: (m.numeroProposta || m.clienteNome).slice(0, 20) }));
            await metaWaba.sendInteractiveButtons(from, corpo, botoes);
          } else {
            await sendText(from, montarRespostaAtualizar(nome, matches, dashboardBaseUrl));
          }
        } catch (err) {
          console.error('[ajustar] busca falhou:', (err as Error).message);
          await sendText(from, '⚠️ Deu erro buscando a proposta. Tenta de novo daqui a pouco.');
        }
        return;
      }
    }

    // "clonar <nome>" (Junior) — clona uma proposta pra um NOVO cliente: carrega o
    // kit/sistema/valores da base e gera uma proposta NOVA (link novo) só trocando o
    // cliente. Ágil pra rodar vários parecidos. DEPOIS dos modos (igual ajustar).
    {
      const tRawC = text.trim();
      const mBotaoClonar = /^clonar:([A-Za-z0-9_-]{16,32})$/.exec(tRawC);
      const mCmdClonar = /^\/?clonar\b\s*(.*)$/i.exec(tRawC);
      if (isAdminPhone(from) && (mBotaoClonar || mCmdClonar)) {
        const dashboardBaseUrlC = (process.env.DASHBOARD_BASE_URL ?? 'https://dashboard.ecosunpower.eng.br').replace(/\/$/, '');
        const abrirClone = async (slug: string): Promise<void> => {
          const prop = await supabase.getPropostaInputBySlug(slug);
          if (!prop) {
            await sendText(from, 'Não achei essa proposta (pode ter sido revogada).');
            return;
          }
          if (!prop.dadosInput) {
            await sendText(from, `A proposta *${prop.numeroProposta}* é antiga e não tem os dados salvos pra clonar. Manda */resgatar-propostas* primeiro.`);
            return;
          }
          const reply = await proposalAssistant.startCloneMode(from, {
            numeroPropostaBase: prop.numeroProposta,
            clienteNomeBase: prop.clienteNome,
            modoEnvio: prop.modoEnvio,
            tipo: prop.tipo,
            dadosInput: prop.dadosInput as Record<string, unknown>,
          });
          await sendText(from, reply);
        };

        if (mBotaoClonar) {
          await abrirClone(mBotaoClonar[1]);
          return;
        }

        const nomeBase = (mCmdClonar![2] ?? '').trim();
        if (!nomeBase) {
          await sendText(from, 'Manda assim: *clonar nome do cliente base*.\nEx: _clonar Marcio_ (gera uma proposta igual pra outro cliente)');
          return;
        }
        try {
          const matches = await supabase.buscarPropostasPorNome(nomeBase, 5);
          if (matches.length === 0) {
            await sendText(from, `🔍 Não achei proposta pra *${nomeBase}* pra usar de base.`);
          } else if (matches.length === 1) {
            await abrirClone(matches[0].slug);
          } else if (metaWaba) {
            const corpo = `Achei ${matches.length} propostas pra *${nomeBase}*. Qual você quer clonar?`;
            const botoes = matches.slice(0, 3).map((m) => ({ id: `clonar:${m.slug}`, title: (m.numeroProposta || m.clienteNome).slice(0, 20) }));
            await metaWaba.sendInteractiveButtons(from, corpo, botoes);
          } else {
            await sendText(from, montarRespostaAtualizar(nomeBase, matches, dashboardBaseUrlC));
          }
        } catch (err) {
          console.error('[clonar] busca falhou:', (err as Error).message);
          await sendText(from, '⚠️ Deu erro buscando a proposta. Tenta de novo daqui a pouco.');
        }
        return;
      }
    }

    // Monitoramento Evolutivo: resposta do Junior a um [Ajustar]/[👎 Errou]
    // (ou "apaga essa regra"). Vem ANTES do gate financeiro da Fatia 3 de
    // propósito: a pré-checagem custa 1-2 queries baratas e só quando há
    // pendência REAL é que o handler roda — um ajuste tipo "tira o emoji"
    // não paga Haiku do gate financeiro à toa.
    if (isAdminPhone(from) && metaWaba) {
      try {
        const ehApagaRegra = /^apaga essa regra[\s.!…]*$/i.test(text.trim());
        const { getAbordagemAjustando, getAbordagemErrouPendente } =
          await import('./modules/monitoring/abordagem/abordagens-repo.js');
        const temPendencia = ehApagaRegra
          || Boolean(await getAbordagemAjustando(supabase.getClient()))
          || Boolean(await getAbordagemErrouPendente(supabase.getClient()));
        if (temPendencia) {
          const { handleTextoAdminAjuste } = await import('./modules/monitoring/abordagem/orquestrador.js');
          if (await handleTextoAdminAjuste(getOrqDeps(), text)) return;
        }
      } catch (err) {
        // Falha aqui NUNCA derruba o fluxo do admin — segue pro gate financeiro.
        console.warn('[abordagem] pré-checagem de ajuste falhou:', (err as Error).message);
      }
    }

    // Caixa de Entrada (Fatia 3): texto do Junior fora de modo pode ser gasto/
    // entrada ("gastei 380 no posto"). Gate Haiku barato decide; se não for
    // financeiro, segue o fluxo normal da Eva. Inclui transcrições de áudio.
    if (isAdminPhone(from) && metaWaba) {
      const { tryHandleFinanceiroTexto } = await import('./modules/financeiro/caixa-entrada.js');
      if (await tryHandleFinanceiroTexto(getCaixaDeps(), from, text)) return;
    }

    if (await takeover.isPaused(from)) {
      console.log(`[takeover] Skipping message from ${from} — human takeover active`);
      return;
    }
    try {
      let lead = await db.getLeadByPhone(from);

      // Bloqueio: se lead existe e Eva esta INATIVA pra ele, ignora (Junior atende manual)
      // Lead novo (lead == null) sempre passa — sera criado com eva_active=true (default).
      if (lead && (lead as any).eva_active === false) {
        console.log(`[eva-active] Skipping message from ${from} — eva_active=false (Junior atende)`);
        return;
      }

      // Se cliente respondeu antes do delay 2h da intro automatica, cancela a intro.
      // (lead?.id pode ser null aqui pra primeira mensagem de lead novo — sem intro pra cancelar)
      if (lead?.id) {
        await db.cancelEvaIntro(lead.id, 'client_replied').catch(() => {});
      }

      // If this lead has an active reengagement cadence, cancel it — they replied
      // [MT 3d] escrita pelo crachá (db); leitura hasPendingTouches fica no
      // singleton (fatia de escrita; flag-off é idêntico de qualquer jeito).
      if (lead?.id && await reengagement.hasPendingTouches(lead.id)) {
        const canceled = await reengagement.cancelAllTouches(lead.id, db.getClient());
        console.log(`[reengagement] Canceled ${canceled} pending touches for ${from} (replied)`);
      }
      // Cliente respondeu — reseta cadencia de auto-followup pro proximo silencio
      // comecar do step 1. NAO aplica pra leads 'perdido' (esses tem cadencia
      // semestral propria — resetForLead ja filtra step<100 internamente mas
      // melhor nem chamar se for perdido).
      // Cast porque LeadData.status enum nao lista 'perdido' mas codigo usa.
      if (lead?.id && (lead.status as string) !== 'perdido') {
        await followup.resetForLead(lead.id, db.getClient()).catch(() => { /* nao critico */ });
      }
      const isNewLead = !lead;

      if (!lead) {
        // Multi-tenant fatia 1: carimba a empresa dona na CRIACAO do lead novo.
        // Ausente → EcoSun (default). Fatia 3a: escrita pelo `db` (crachá).
        const result = await db.upsertLead({ phone: from, status: 'novo', company_id: companyId ?? ECOSUN_COMPANY_ID });
        lead = { id: result.id, phone: from } as NonNullable<typeof lead>;
      }

      const leadId = lead.id;

      // CAPI estagio 1 (Lead): se o lead chegou por anuncio Click-to-WhatsApp,
      // o referral traz o ctwa_clid. Guarda no lead (pra usar nos estagios
      // seguintes) e devolve o evento "Lead" pra Meta. Fire-and-forget.
      if (ctwaReferral?.ctwaClid) {
        // [MT 3d] escrita do ctwa_clid e o estágio CAPI pelo crachá (db).
        await db
          .upsertLead({ phone: from, ctwa_clid: ctwaReferral.ctwaClid })
          .catch((err) => console.warn('[capi] falha ao salvar ctwa_clid:', (err as Error).message));
        void capiReporter(leadId, 'Lead', { db });
      }

      // CAPI "lead_respondeu": sinal de ouro pro "Leads de conversao" do Meta
      // — o algoritmo aprende a trazer gente que RESPONDE, nao so quem
      // preenche formulario. Regras e guarda no helper (definido junto do
      // capiReporter). Lead novo nao e "resposta" (acabou de nascer aqui).
      if (!isNewLead) maybeCapiRespondeu(lead, db, text);

      // TRACKING DE ORIGEM: se e a primeira mensagem e contem tag tipo
      // #ig-abc123 / #fb-xyz / #ad-ca1 / #rem-x, extrai e classifica lead_source.
      // So atualiza pra leads NOVOS (preserva atribuicao de leads que ja engajaram
      // por outro canal antes).
      let detectedOrigin: { source: string; campaign: string; hint: string } | null = null;
      if (isNewLead) {
        const parsed = parseTrackingTag(text);
        if (parsed) {
          let source: string = parsed.source;
          let hint: string = parsed.source;

          // Se for tag "post-*" generica, tenta descobrir a plataforma real
          // cruzando com marketing_drafts (temos published_results la com
          // permalinks do IG e FB). Se nao achar, mantem default organico_ig.
          if (parsed.campaign.startsWith('post-')) {
            try {
              const { data: draftRow } = await supabase.getClient()
                .from('marketing_drafts')
                .select('published_results, content_type')
                .eq('tracking_tag', parsed.campaign)
                .maybeSingle();
              const results = draftRow?.published_results as Record<string, { permalink?: string }> | null;
              const hasIG = results?.instagram?.permalink;
              const hasFB = results?.facebook?.permalink;
              // Se so saiu em uma plataforma OU uma tem permalink valido,
              // classifica como aquela. Se ambas, mantem ig (mais provavel
              // em mobile onde link nao clica no IG mas clica no FB).
              if (hasFB && !hasIG) source = 'organico_fb';
              else if (hasIG && !hasFB) source = 'organico_ig';
              else source = 'organico_ig'; // default (ambas ou indefinido)
              hint = source;
            } catch (err) {
              console.warn(`[tracking] Platform lookup failed:`, (err as Error).message);
            }
          }

          try {
            const trackingRow = {
              lead_source: source,
              utm_source: source,
              utm_campaign: parsed.campaign,
              origin: source,
            };
            await db.getClient()
              .from('leads')
              .update({
                ...trackingRow,
                utm_content: parsed.content ?? null,
                channel: resolveChannel(leadRowToChannelInput(trackingRow)),
                updated_at: new Date().toISOString(),
              })
              .eq('id', leadId);
            detectedOrigin = { source, campaign: parsed.campaign, hint };
            console.log(`[tracking] Lead ${leadId} classificado como ${source} via tag ${parsed.rawTag}`);
          } catch (err) {
            console.error(`[tracking] Failed to classify lead:`, (err as Error).message);
          }
        }
      }

      // ATRIBUIÇÃO CTWA: persiste o ad_id do anúncio Meta no lead. Antes o
      // referral era usado só pro template de auto-ack — por isso lead de
      // anúncio CTWA virava 'direto'. Espelha o guard do fluxo Lead Form.
      if (ctwaReferral?.sourceId && (isNewLead || shouldAttributeCtwa(lead as any))) {
        try {
          const adId = ctwaReferral.sourceId;
          const campaignId = config.metaWabaAccessToken
            ? await resolveCampaignIdFromAd(adId, config.metaWabaAccessToken)
            : null;
          const patch = buildCtwaPatch(adId, campaignId);
          await db.getClient()
            .from('leads')
            .update({ ...patch, updated_at: new Date().toISOString() })
            .eq('id', leadId);
          console.log(`[ctwa-attrib] lead ${leadId} atribuído: ad_id=${adId} campaign=${campaignId ?? 'n/a'} channel=meta`);
        } catch (err) {
          console.error('[ctwa-attrib] falha ao gravar atribuição:', (err as Error).message);
        }
      }

      // 🎯 Alerta proativo Eva → Junior: lead novo Google Ads (Search).
      // Dispara so na PRIMEIRA mensagem do lead com tag #gad-*, idempotente
      // via app_flags (lock_key=alert_new_gads_<leadId>). Texto rico parseando
      // cidade/conta da mensagem pre-preenchida da landing /cotacao.
      // Fire-and-forget: nunca bloqueia processamento normal.
      if (isNewLead && detectedOrigin && detectedOrigin.source === 'ad_google_cta_wa') {
        void (async () => {
          try {
            const { alertNewLeadGoogleAds } = await import('./modules/eva-alerts.js');
            const freshLead = await db.getLeadByPhone(from);
            await alertNewLeadGoogleAds(
              { client: supabase.getClient(), engineerPhone: config.engineerPhone, sendText, metaWaba: metaWaba ?? null },
              leadId,
              freshLead?.name ?? null,
              from,
              text,
              detectedOrigin.campaign,
            );
          } catch (err) {
            console.warn('[alerts] alertNewLeadGoogleAds falhou:', (err as Error).message);
          }
        })();
      }

      // Eva Monitoramento Evolutivo: cliente com abordagem ATIVA (Eva abordou
      // proativamente sobre a usina dele). Registra a resposta no diário e:
      // - quick reply do template ("Pode contar"/"Agora não") → o orquestrador
      //   já responde (manda a mensagem da escada / reagenda) e RETORNA aqui —
      //   não vai pra Eva;
      // - qualquer outra mensagem → contexto da abordagem entra no prompt da
      //   Eva (injetado no knowledge mais abaixo) e a conversa segue normal.
      // Cliente SEM abordagem ativa: abordagemAtiva=null e o caminho é
      // bit a bit o de sempre (só a query barata de lookup roda).
      let abordagemAtiva: import('./modules/monitoring/abordagem/tipos.js').AbordagemRow | null = null;
      let contextoAbordagem = '';
      if (!isNewLead && !isAdminPhone(from) && metaWaba) {
        try {
          const { getAbordagemAbertaPorLeadPhone } =
            await import('./modules/monitoring/abordagem/abordagens-repo.js');
          abordagemAtiva = await getAbordagemAbertaPorLeadPhone(db.getClient(), leadId);
        } catch (err) {
          console.warn('[abordagem] lookup de abordagem ativa falhou:', (err as Error).message);
        }
        if (abordagemAtiva) {
          try {
            const { handleRespostaCliente, montarContextoAbordagem } =
              await import('./modules/monitoring/abordagem/orquestrador.js');
            // O retorno é o contrato: 'respondi' = o orquestrador JÁ respondeu
            // o cliente (quick reply ou mensagem real da escada pós-template) —
            // seguir pra Eva mandaria uma 2ª mensagem redundante com contexto
            // stale. 'segue_eva' = só registrou; injeta o contexto e segue.
            const resultado = await handleRespostaCliente(getOrqDeps(db.getClient()), abordagemAtiva, text);
            if (resultado === 'respondi') return;
            contextoAbordagem = montarContextoAbordagem(abordagemAtiva);
          } catch (err) {
            console.warn('[abordagem] resposta do cliente falhou:', (err as Error).message);
          }
        }
      }

      const conversation = await db.getOrCreateConversation(leadId, companyId);

      // Auto-ack template: dispara template Utility em primeira sessao ou pausa
      // >1h pra UX (cliente nao fica esperando 5-30s no vacuo enquanto Eva processa
      // via Claude). So roda no canal WABA (Evolution nao tem template formal).
      // Fire-and-forget; nao bloqueia processamento principal.
      //
      // Ordem de prioridade pra escolher o template:
      //  1. CTWA referral (`ctwaReferral.sourceId` = ad_id Meta) — mapping
      //     hardcoded em ctwa-template-mapping.ts. Permite A/B por anuncio.
      //  2. DB mapping por campaign_id (marketing_campaigns.template_inicial)
      //     — usado quando lead nao veio de anuncio mas tem campaign_id legado.
      //  3. Default global `_eva_qualificacao_v1` — lead sem anuncio nem
      //     campanha. Se nao estiver aprovado na Meta (erro 132001), cai
      //     no fallback `reativacao_lead_v1` (aprovado). TODOS os templates
      //     roteados aqui usam 1 var de body {{1}}=primeiro nome.
      //
      // Cliente com abordagem de monitoramento ATIVA fica FORA do auto-ack:
      // ele está respondendo a Eva sobre a usina dele — mandar template de
      // qualificação no meio seria ruído (cliente sem abordagem: intacto).
      if (metaWaba && !abordagemAtiva) {
        const isNewSession = conversation.message_count === 0;
        const elapsedMs = Date.now() - new Date(conversation.last_message_at).getTime();
        const isLongPause = elapsedMs > 60 * 60 * 1000; // 1h
        if (isNewSession || isLongPause) {
          const reason = isNewSession ? 'new-session' : 'long-pause';
          // 1. CTWA referral (ad_id Meta -> template hardcoded)
          const adId = ctwaReferral?.sourceId ?? null;
          let mappedTemplate = templateParaAdMeta(adId);
          // 2. Fallback DB mapping por campaign_id (legado/manual)
          if (!mappedTemplate) {
            const adCampaignId = lead?.ad_campaign_id ?? null;
            mappedTemplate = await supabase.getTemplateInicialPorCampanha(adCampaignId);
          }
          // 3. Default global (templates Meta aprovados 15/05)
          const templateName = mappedTemplate ?? '_eva_qualificacao_v1';
          // Todos os templates aqui (CTWA/campanha/default) tem {{1}}=primeiro
          // nome. Sem o componente a Meta REJEITA o envio (era bug silencioso:
          // lead de anuncio ficava sem auto-ack). Fallback "tudo bem" igual
          // ao reativacao_lead_v1.
          const ackFirstName = (lead?.name ?? '').split(' ')[0] || 'tudo bem';
          // Fallback: se o template (default/CTWA/campanha) nao estiver
          // aprovado na Meta (erro 132001 "does not exist"), usa o
          // `reativacao_lead_v1` (aprovado). Mesmo padrao da cadencia
          // (cadence.ts). Fire-and-forget — nunca bloqueia o processamento.
          void (async () => {
            try {
              await metaWaba.sendTemplate(from, templateName, 'pt_BR', [
                { type: 'body', parameters: [{ type: 'text', text: ackFirstName }] },
              ]);
              console.log(`[auto-ack] Template ${templateName} enviado pra ${from} lead=${leadId} (${reason}, ad_id=${adId ?? 'none'})`);
            } catch (err) {
              const isUnknownTemplate = /\b132001\b|does not exist/i.test((err as Error).message);
              if (templateName !== 'reativacao_lead_v1' && isUnknownTemplate) {
                try {
                  await metaWaba.sendTemplate(from, 'reativacao_lead_v1', 'pt_BR', [
                    { type: 'body', parameters: [{ type: 'text', text: ackFirstName }] },
                  ]);
                  console.log(`[auto-ack] ${templateName} indisponivel, fallback reativacao_lead_v1 enviado pra ${from} lead=${leadId} (${reason})`);
                } catch (err2) {
                  console.warn(`[auto-ack] fallback reativacao_lead_v1 tambem falhou pra ${from} lead=${leadId}: ${(err2 as Error).message}`);
                }
              } else {
                console.warn(`[auto-ack] Template send falhou pra ${from} lead=${leadId} template=${templateName}: ${(err as Error).message}`);
              }
            }
          })();
        }
      }

      // Build history from conversation messages
      const history = (conversation.messages ?? []).map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      // Build lead context so Claude knows what was already collected
      let leadContext = '';
      if (!isNewLead) {
        leadContext = '\n\n## ATENCAO: Este e um contato que JA EXISTE no sistema\n';
        leadContext += 'NAO trate como novo. NAO peca consentimento LGPD de novo (se ja dado).\n';
        leadContext += 'Use as informacoes abaixo e continue a conversa naturalmente.\n\n';
        leadContext += '### Dados ja coletados (NAO pergunte de novo):\n';
        if (lead.name) leadContext += `- Nome: ${lead.name}\n`;
        if (lead.city) leadContext += `- Cidade: ${lead.city}\n`;
        if (lead.neighborhood) leadContext += `- Bairro: ${lead.neighborhood}\n`;
        if (lead.profile && lead.profile !== 'indefinido') leadContext += `- Perfil: ${lead.profile}\n`;
        if (lead.consent_given) leadContext += `- Consentimento LGPD: JA DADO - nao peca novamente!\n`;
        if (lead.status) leadContext += `- Status: ${lead.status}\n`;
        if (lead.energy_data && Object.keys(lead.energy_data).length > 0) {
          const ed = lead.energy_data as Record<string, unknown>;
          if (ed.monthly_bill) leadContext += `- Valor da conta: R$ ${ed.monthly_bill}/mes\n`;
          if (ed.consumption_kwh) leadContext += `- Consumo: ${ed.consumption_kwh} kWh/mes\n`;
          if (ed.group) leadContext += `- Grupo: ${ed.group}\n`;
          if (ed.contracted_demand_kw) leadContext += `- Demanda contratada: ${ed.contracted_demand_kw} kW\n`;
          if (ed.tariff_type) leadContext += `- Tarifa: ${ed.tariff_type}\n`;
        }
        // Modo continuacao (Fase 3 do funil): lead do formulario Meta ja
        // respondeu faixa da conta / tipo de imovel — Eva confirma e aprofunda
        // (pede foto da conta) em vez de re-perguntar o que o form ja perguntou.
        const blocoForm = blocoContinuacaoForm(lead.energy_data as Record<string, unknown> | null);
        if (blocoForm) leadContext += blocoForm + '\n';
        if (lead.future_demand) leadContext += `- Demanda futura: ${lead.future_demand}\n`;
        if (lead.opportunities && Object.keys(lead.opportunities).length > 0) {
          const opp = lead.opportunities as Record<string, boolean>;
          const identified = Object.entries(opp).filter(([, v]) => v).map(([k]) => k);
          if (identified.length > 0) leadContext += `- Oportunidades identificadas: ${identified.join(', ')}\n`;
        }
        if (!lead.name) leadContext += '\nObs: Ainda nao temos o nome deste contato. Pergunte de forma natural.\n';

        // Calculate solar estimate if we have city and consumption/bill
        if (lead.city && lead.energy_data) {
          const ed = lead.energy_data as Record<string, unknown>;
          if (ed.monthly_bill || ed.consumption_kwh) {
            try {
              // Dica de local pro resolver de solar-params (le neoenergia/equatorial/DF/GO).
              // concessionaria + UF sao os sinais confiaveis; cidade entra so como reforco.
              const l = lead as any;
              const localHint = [l.concessionaria, ed.distributor, lead.city, l.uf]
                .filter(Boolean).join(' ') || lead.city;
              const estimate = await calculateSolarEstimate(
                localHint,
                ed.monthly_bill as number | undefined,
                ed.consumption_kwh as number | undefined
              );
              if (estimate) {
                leadContext += '\n' + formatEstimateForPrompt(estimate);
              }
            } catch (err) {
              console.error('[solar] Calculation error:', err);
            }
          }
        }
      } else {
        leadContext = '\n\n## Este e um CONTATO NOVO - primeira vez que escreve\n';
        leadContext += 'Siga o fluxo de primeiro contato: saudacao + LGPD + conversa natural.\n';
        if (detectedOrigin) {
          const sourceLabel: Record<string, string> = {
            organico_ig: 'Instagram (post organico)',
            organico_fb: 'Facebook (post organico)',
            ad_ig_cta_wa: 'anuncio do Instagram',
            ad_fb_cta_wa: 'anuncio do Facebook',
            reengajamento_link: 'link de reengajamento',
          };
          const label = sourceLabel[detectedOrigin.source] ?? detectedOrigin.source;
          leadContext += `\n### Origem detectada do lead\n`;
          leadContext += `Este contato chegou via ${label}. A mensagem inicial dele inclui uma tag de rastreamento — IGNORE a tag no seu retorno mas leve em conta a origem pra contextualizar o atendimento.\n`;

          // LEAD QUENTE DE CAMPANHA PAGA: postura comercial ativa
          if (detectedOrigin.source === 'ad_ig_cta_wa' || detectedOrigin.source === 'ad_fb_cta_wa') {
            // Tenta achar campanha real no DB pra mencionar oferta especifica
            let ofertaInfo = '';
            try {
              const { data: camp } = await supabase.getClient()
                .from('marketing_campaigns')
                .select('name, objective, daily_budget_cents')
                .ilike('name', `%${detectedOrigin.campaign}%`)
                .limit(1)
                .maybeSingle();
              if (camp?.name) {
                ofertaInfo = `\nA campanha que ele clicou e: **${camp.name}** (objetivo: ${camp.objective ?? 'N/D'}).`;
              }
            } catch { /* fail silently */ }

            leadContext += `
### 🔥 LEAD QUENTE DE CAMPANHA PAGA — POSTURA COMERCIAL ATIVA
Este cliente VIU UM ANUNCIO PAGO e clicou — interesse confirmado, esta em modo "quero saber/comprar".${ofertaInfo}

**ABORDAGEM (importantissimo — leia antes de responder):**

1. **Saudacao curta + LGPD direto** (1 paragrafo so). Nao gaste turno em small talk.

2. **Confirme rapidamente o interesse na oferta especifica** que ele viu. Ex: "Vi que voce chegou pela nossa oferta de [tipo]. Pra confirmar o melhor kit pra voce, posso te perguntar 2 coisas rapidas?"

3. **Qualifique em 1-2 perguntas, NAO em 5.** Pergunta-chave: valor da conta de luz OU consumo kWh/mes. Se ele disser o valor, voce JA pode estimar o kit ideal.

4. **Se conta >= R$${empresa().criterioLeadValor} OU consumo >= ${empresa().criterioLeadKwh} kWh:** lead qualificado. Pivota IMEDIATAMENTE pra:
   - Agendar visita tecnica (use /agenda no admin) OU
   - Enviar proposta personalizada (use /proposta no admin)
   Nao fica em loop de "deixa eu te explicar como funciona".

5. **Se conta < R$${empresa().criterioLeadValor}:** explica polidamente que o investimento nao retorna bem com conta abaixo desse patamar, oferece kit menor de demonstracao ou agradece e fecha.

6. **Senso de urgencia respeitoso:** pode mencionar "essa condicao da campanha vai ate o final do mes" ou "esses kits sao limitados pelo estoque do mes" — SEM mentir, SEM forcar.

7. **Fechamento direto:** sempre termine o turno com uma pergunta acionavel ou um CTA claro. NUNCA termine com "qualquer duvida estou aqui" — termine com "posso te mandar a proposta agora?" ou "que dia voce esta livre pra eu visitar?".

8. **Tom:** mais firme que de costume. Cliente quer COMPRAR — voce e a vendedora consultiva que ajuda ele a escolher rapido, nao a tecnica que explica fisica solar por 20 minutos.
`;
          }
        }
      }

      // Conhecimento injetado no brain. Modo VITRINE (EcoSof): injeta a base de
      // produto inteira (conhecimento-ecosof/, via knowledgeBase mode-aware), SEM o
      // RAG do tenant solar — senão a vendedora responderia com conhecimento de solar.
      // Modo SOLAR: híbrido (6 core files + chunks RAG), como sempre.
      let baseKnowledge: string;
      if (isVitrineEcosof()) {
        baseKnowledge = knowledgeBase.getContent();
        console.log(`[vitrine] conhecimento EcoSof injetado (${baseKnowledge.length} chars)`);
      } else {
        // retrieveChunks nunca lança — retorna [] em qualquer falha (fallback core-only).
        const { loadCoreContent } = await import('./modules/rag/core-files.js');
        const { retrieveChunks } = await import('./modules/rag/retrieve.js');
        const { makeClient, embedTexts } = await import('./modules/rag/embeddings.js');
        const { buildHybridKnowledge } = await import('./modules/rag/hybrid.js');
        const coreContent = loadCoreContent(join(__dirname, '..', conhecimentoDirDoModo()));
        const chunks = config.openaiApiKey
          ? await retrieveChunks(text, supabase.getClient(), config,
              (q) => embedTexts(q, makeClient(config.openaiApiKey!)))
          : [];
        if (chunks.length > 0) {
          console.log(`[rag] ${chunks.length} chunk(s) recuperados para o brain`);
        }
        baseKnowledge = buildHybridKnowledge(coreContent, chunks);
      }
      // contextoAbordagem: bloco do Monitoramento Evolutivo (vazio pra todo
      // mundo, exceto cliente com abordagem ativa) — mesmo canal do leadContext.
      // contextoProposta (Fatia 2): números reais da proposta do cliente + postura
      // de consultora — vazio pra quem não tem proposta. SOMADO ao conhecimento
      // técnico (não substitui): a Eva mantém toda a base (normas, rateio, etc.).
      const contextoProposta = await montarContextoProposta(from, db.getClient());
      const knowledge = baseKnowledge + leadContext
        + (contextoAbordagem ? `\n\n${contextoAbordagem}` : '')
        + contextoProposta;

      // Elo (casa Atendimento): mensagem do lead chegou e vai ser processada
      // pela Eva. Ponto único e central — depois de todos os early-returns de
      // comando/botão do admin, então só conta mensagem real de cliente que a
      // Eva atende. Best-effort, nunca bloqueia a resposta.
      await registrarEvento(db.getClient(), {
        tipo: 'atendimento:mensagem',
        departamento: 'atendimento',
        canal: 'whatsapp',
        leadId,
        payload: { direcao: 'in' },
        companyId: db.companyIdDaMensagem, // [3e] carimbo; undefined = default EcoSun
      });

      // Elo (casa Site): lead veio da COTACAO do site. O site e estatico e nao
      // pode guardar segredo, entao em vez de ele mandar bilhete (token
      // exposto), o Elo RECONHECE a mensagem-assinatura que o site pre-preenche
      // no WhatsApp ("Fiz a cotacao rapida no site"). Seguro, sem tocar no site.
      // Best-effort. Normaliza acento/caixa pra casar mesmo com variacao.
      const textoNorm = String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      if (textoNorm.includes('cotacao rapida no site')) {
        await registrarEvento(db.getClient(), {
          tipo: 'site:cotacao',
          departamento: 'marketing',
          canal: 'web',
          origem: 'site',
          leadId,
          payload: { fonte: 'cotacao' },
          companyId: db.companyIdDaMensagem, // [3e]
        });
      }

      const response = await brain.processMessage(
        text,
        history,
        knowledge,
        conversation.summary,
        conversation.qualification_step
      );

      // TRAVA-NÚMERO: no fluxo novo a Eva NÃO crava preço/dimensionamento (faz handoff).
      // Se QUALQUER balão vazou um número desses, troca a resposta inteira por um único
      // balão de handoff e loga o original pra revisão. Rede de segurança caso o prompt falhe.
      const { detectarNumeroProibido, MENSAGEM_HANDOFF_NUMERO } = await import('./modules/eva-trava-numero.js');
      const motivosTrava = response.displayMessages
        .flatMap(p => detectarNumeroProibido(p).motivos);
      let baloesParaEnviar = response.displayMessages;
      if (motivosTrava.length > 0) {
        console.warn(`[trava-numero] resposta da Eva barrada (${motivosTrava.join(',')}) — substituída por handoff. Original: ${response.displayMessages.join(' | ').slice(0, 300)}`);
        baloesParaEnviar = [MENSAGEM_HANDOFF_NUMERO];
      }

      // Send response (possibly split across multiple WhatsApp messages)
      if (!isSandbox) {
        for (const part of baloesParaEnviar) {
          await sendText(from, part);
        }
      } else {
        for (const part of baloesParaEnviar) {
          console.log(`[sandbox] Would send to ${from}: ${part}`);
        }
      }

      // Elo (casa Atendimento): a Eva respondeu o lead. Ponto único (1 evento
      // por turno, mesmo com resposta quebrada em vários balões). Best-effort.
      await registrarEvento(db.getClient(), {
        tipo: 'atendimento:eva_respondeu',
        departamento: 'atendimento',
        canal: 'whatsapp',
        leadId,
        payload: { direcao: 'out' },
        companyId: db.companyIdDaMensagem, // [3e]
      });

      // Update conversation
      const updatedMessages = [
        ...conversation.messages,
        { role: 'user' as const, content: text, timestamp: new Date().toISOString() },
        { role: 'assistant' as const, content: response.text, timestamp: new Date().toISOString() },
      ];

      const messagesToKeep = updatedMessages.slice(-20);

      await db.updateConversation(conversation.id, {
        messages: messagesToKeep,
        summary: conversation.summary,
        message_count: conversation.message_count + 2,
        qualification_step: conversation.qualification_step,
      });

      // Handle actions from Claude (may be multiple in a single response)
      for (const act of response.actions) {
        try {
          await handleAction(act, leadId, from, conversation.id, db);
        } catch (err) {
          console.error(`[action] Failed to handle "${act.action}":`, err);
        }
      }

      // Gatilhos de ESCALONAMENTO (Sub-projeto 1 — Eva Vendedora DNA).
      // Roda DEPOIS da rede de hot-lead por dados (que dispara no update_lead
      // acima) e a COMPLEMENTA: detecta urgencia/conta-alta/concorrente/
      // hostilidade no texto do cliente e avisa o Junior NA HORA pelo MESMO
      // canal do hot-lead (sendAdminWithButtons -> engineerPhone). Idempotente
      // 1x/lead/motivo/dia. Fire-and-forget: nunca bloqueia nem quebra o fluxo.
      void (async () => {
        try {
          const { motivoEscalonamento, alertEscalonamento, leadEncerrado } = await import('./modules/eva-alerts.js');
          const freshEscal = await db.getLeadByPhone(from);
          // Lead desqualificado/encerrado NESTE turno (disqualify_lead seta
          // eva_active=false/descartado/inviavel) -> NAO escalar: senao o Junior
          // recebe "Eva pediu reforco" contradizendo "Eva encerrou lead inviavel
          // com dignidade". Espelha o gate eva_active do handler.
          if (leadEncerrado(freshEscal)) return;
          const ed = (freshEscal?.energy_data ?? {}) as Record<string, unknown>;
          const contaMensal = typeof ed.monthly_bill === 'number'
            ? ed.monthly_bill
            : Number(String(ed.monthly_bill ?? '').replace(',', '.')) || undefined;
          const motivo = motivoEscalonamento({ text, contaMensal });
          if (motivo && freshEscal) {
            await alertEscalonamento(
              { client: supabase.getClient(), engineerPhone: config.engineerPhone, sendText, metaWaba: metaWaba ?? null },
              { id: freshEscal.id, name: freshEscal.name ?? null, phone: from },
              motivo,
              text,
            );
          }
        } catch (err) {
          console.warn('[escal] gatilho de escalonamento falhou:', (err as Error).message);
        }
      })().catch(() => {});

      await supabase.logEvent('info', 'brain', `Processed message from ${from}`, {
        lead_id: leadId,
        is_new: isNewLead,
        actions: response.actions.map(a => a.action),
      });

      // Learn from conversation
      const wasTransferred = response.actions.some(a => a.action === 'transfer_to_human');
      learning.analyzeConversation(
        messagesToKeep.map(m => ({ role: m.role, content: m.content })),
        leadId,
        wasTransferred
      ).catch(err => console.error('[learning] Error:', err));

    } catch (error) {
      console.error(`[handler] Error processing message from ${from}:`, error);
      await supabase.logEvent('error', 'handler', `Error processing message from ${from}`, {
        error: error instanceof Error ? error.message : String(error),
      });

      const fallbackMsg = 'Estou com uma dificuldade tecnica. Um momento, por favor.';
      if (!isSandbox) {
        try { await sendText(from, fallbackMsg); } catch { /* ignore */ }
      }
    }
  }

  async function handleAction(
    action: { action: string; data: Record<string, unknown> },
    leadId: string,
    from: string,
    conversationId: string,
    db: SupabaseService = supabase,
  ) {
    switch (action.action) {
      case 'update_lead': {
        // Save ALL data from Claude, not just limited fields
        const leadUpdate: Record<string, unknown> = { phone: from };
        const d = action.data;
        if (d.name) leadUpdate.name = d.name;
        if (d.city) leadUpdate.city = d.city;
        if (d.profile) leadUpdate.profile = d.profile;
        if (d.consent_given !== undefined) {
          leadUpdate.consent_given = d.consent_given;
          if (d.consent_given) leadUpdate.consent_date = new Date().toISOString();
        }
        if (d.energy_data) leadUpdate.energy_data = d.energy_data;
        if (d.opportunities) leadUpdate.opportunities = d.opportunities;
        if (d.future_demand) leadUpdate.future_demand = d.future_demand;
        leadUpdate.status = 'qualificando';
        // [MT 3e] carimbo no fallback-INSERT (igual aos irmãos qualificado/
        // transferido/agendado; update descarta company_id, idêntico)
        leadUpdate.company_id = db.companyIdDaMensagem ?? ECOSUN_COMPANY_ID;

        await db.upsertLead(leadUpdate as unknown as Parameters<typeof db.upsertLead>[0]);
        console.log(`[action] Updated lead ${from}:`, Object.keys(leadUpdate).join(', '));

        // Rede de proteção: se o lead acabou de cruzar o criterio minimo
        // (conta>=R$700 ou >=700 kWh), avisa o Junior NA HORA — independente
        // da Eva emitir qualification_complete depois (ela as vezes trava, ex
        // pedindo CPF, e nunca fecha). Idempotente 1x/lead (lock compartilhado
        // com a varredura). Best-effort: nunca quebra o fluxo da action.
        if (leadUpdate.energy_data) {
          try {
            const fresh = await db.getLeadByPhone(from);
            if (fresh) {
              const { alertHotLeadBackstop } = await import('./modules/eva-alerts.js');
              await alertHotLeadBackstop(
                { client: supabase.getClient(), engineerPhone: config.engineerPhone, sendText, metaWaba: metaWaba ?? null },
                { id: fresh.id, name: fresh.name ?? null, phone: from, energy_data: fresh.energy_data },
                'fresh',
              );
            }
          } catch (err) {
            console.warn('[hotlead] alerta imediato falhou:', (err as Error).message);
          }
        }
        break;
      }

      case 'qualification_complete': {
        // IMPORTANTE: NAO fechar a sessao. Top vendedora consultiva NUNCA para
        // depois de coletar dados — ela usa o que coletou pra fechar agendamento.
        // Status fica 'qualificado' como sinal de que dossier esta pronto, mas
        // Eva CONTINUA conversando (sessao ativa) ate cliente agendar visita
        // ou recusar explicitamente.
        //
        // Dedup: se o lead JA esta 'agendado' (cliente fechou rapido e
        // qualification_complete chega depois do schedule_visit), nao
        // re-marca pra qualificado nem manda alerta — agendamento ja
        // gerou o alerta certo.
        const existingLead = await db.getLeadByPhone(from);
        if (existingLead?.status === 'agendado') {
          console.log(`[qualification_complete] lead ${from} ja agendado — pula alerta duplicado`);
          break;
        }
        // [MT 3e] carimbo no fallback-INSERT (lead sumido = raro, mas sob crachá
        // o insert sem company_id caía no default EcoSun e o WITH CHECK rejeitava)
        await db.upsertLead({ phone: from, status: 'qualificado', company_id: db.companyIdDaMensagem ?? ECOSUN_COMPANY_ID });
        // CAPI estagio 2: lead passou no criterio (R$700/700kWh). Carimbo
        // 'lead_qualificado' pra Meta — alvo de otimizacao. Fire-and-forget.
        void capiReporter(leadId, 'lead_qualificado', { db });
        await db.updateConversation(conversationId, {
          qualification_step: 'qualificacao_completa',
          // session_status removido — Eva fica ativa pra continuar buscando agendamento.
        });

        const lead = await db.getLeadByPhone(from);
        if (lead) {
          const dossierText = DossierBuilder.format({
            leadNumber: Date.now() % 10000,
            name: lead.name ?? 'Nao informado',
            phone: from,
            city: lead.city ?? 'Nao informada',
            profile: lead.profile ?? 'indefinido',
            origin: lead.origin ?? 'Nao identificada',
            energyData: (lead.energy_data ?? {}) as Record<string, unknown>,
            opportunities: (lead.opportunities ?? {}) as Record<string, boolean>,
            futureDemand: lead.future_demand,
            conversationSummary: ['Qualificacao completa via agente'],
            recommendation: 'Entrar em contato para apresentar proposta.',
          });

          // [MT fatia 3e] carimbo explícito da empresa: sem ele, sob tenant B o
          // dossiê caía no default EcoSun e o WITH CHECK da 079 REJEITAVA — o
          // dossiê sumia falha-fechado (achado do review da 3c).
          await db.saveDossier({
            lead_id: leadId,
            content: action.data,
            formatted_text: dossierText,
            status: 'sent',
            company_id: db.companyIdDaMensagem ?? ECOSUN_COMPANY_ID,
          });

          if (!isSandbox) {
            // Manda dossier com BOTOES WABA: Junior bate o olho, decide em 1 toque
            // se assume, ve perfil ou deixa Eva continuar tentando fechamento.
            // Antes era texto puro que se perdia no chat. Agora alerta visual.
            // Heuristica de prontidao baseada em conta de luz (proxy mais
            // confiavel hoje pra ticket potencial — bill alta + qualificacao
            // completa = lead quente).
            const bill = (lead.energy_data as { monthly_bill?: number } | null)?.monthly_bill;
            const prontidao = bill && bill >= 1500 ? '🔥 QUENTE'
              : bill && bill >= empresa().criterioLeadValor ? '🟠 MORNO'
              : '🔵 FRIO';
            const dossierHeader = `📋 *Eva qualificou — ${lead.name ?? 'lead sem nome'}* ${prontidao}\n\n${dossierText}\n\n_Eva esta tentando fechar agendamento agora. Voce pode assumir se preferir._`;
            if (metaWaba) {
              try {
                await metaWaba.sendInteractiveButtons(
                  config.engineerPhone,
                  dossierHeader.slice(0, 1024),
                  [
                    { id: `evabt:lead-view:${lead.id}`, title: '👤 Ver perfil' },
                    { id: `evabt:lead-pause:${lead.id}`, title: '✋ Assumir' },
                  ],
                  'Toque pra agir',
                );
              } catch (err) {
                console.warn('[qualification_complete] botoes WABA falharam, fallback texto:', (err as Error).message);
                await sendText(config.engineerPhone, dossierText);
              }
            } else {
              await sendText(config.engineerPhone, dossierText);
            }
          } else {
            console.log(`[sandbox] Dossier for engineer:\n${dossierText}`);
          }
        }
        console.log(`[action] Qualification complete for ${from} — Eva continua buscando agendamento`);
        break;
      }

      case 'transfer_to_human': {
        await db.upsertLead({ phone: from, status: 'transferido', company_id: db.companyIdDaMensagem ?? ECOSUN_COMPANY_ID }); // [3e]
        await db.updateConversation(conversationId, {
          qualification_step: 'transferido',
          session_status: 'completed',
        });
        // Eva se cala NA HORA (não só quando o Junior toca "Assumir"): a própria
        // mensagem ao Junior promete "a Eva fica em pausa nesse chat". Pausa 24h;
        // o Junior assume / a Eva volta sozinha depois. Handoff da proposta
        // (cliente pediu o Junior) cai aqui via consultora-proposta.md.
        await takeover.pauseFor(from).catch((err) =>
          console.warn('[transfer] pauseFor falhou:', (err as Error).message),
        );

        const lead = await db.getLeadByPhone(from) as (Record<string, unknown> | null);
        const contactType = lead?.contact_type as string | undefined;
        const contactTypeLabel = contactType ? ` (${contactType})` : '';
        const leadName = lead?.name as string | undefined;
        const nameLabel = leadName ? ` - ${leadName}` : '';
        const reason = (action.data as Record<string, string>).reason ?? 'Solicitado pelo cliente';

        // Fornecedor/parceiro/spam = contato que oferece algo PRA Ecosunpower.
        // Junior decide num toque: Responder (assume e fala direto pelo wa.me)
        // ou Ignorar (Eva para de vez). Os demais transfers (cliente, amigo,
        // cliente antigo, cliente que pediu humano) NAO ganham "Ignorar" — sao
        // contatos pra engajar, nao pra descartar; viram "Assumir / Ver perfil".
        const isContatoComercial = contactType === 'fornecedor'
          || contactType === 'parceiro'
          || contactType === 'spam';

        // Estimativa DETERMINÍSTICA (calculadora) pro Junior já entrar com o número CERTO
        // ao assumir — nunca o chute da Eva. Só quando a conta foi capturada e é lead (não comercial).
        let estimativaMsg = '';
        {
          const ed = (lead?.energy_data ?? {}) as Record<string, unknown>;
          const contaMensal = typeof ed.monthly_bill === 'number'
            ? ed.monthly_bill
            : Number(String(ed.monthly_bill ?? '').replace(',', '.')) || 0;
          if (!isContatoComercial && contaMensal > 0) {
            try {
              const { estimarPorConta } = await import('./modules/proposal/lead-estimativa.js');
              const e = estimarPorConta(contaMensal);
              const fmt = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
              estimativaMsg = `\n\n📐 Estimativa (calculadora · conta ${fmt(contaMensal)}): ~${e.paineis} painéis · ${e.kWp.toFixed(1)} kWp · ${fmt(e.precoRs)} · economia ~${fmt(e.economiaMensalRs)}/mês\n_(base sua pra fechar o valor exato)_`;
            } catch (err) {
              console.warn('[transfer] estimativa falhou:', (err as Error).message);
            }
          }
        }

        let transferMsg: string;
        let buttons: Array<{ id: string; title: string }>;
        if (isContatoComercial) {
          transferMsg = `🔔 CONTATO COMERCIAL${contactTypeLabel}\n\nContato: ${from}${nameLabel}\nFalar direto: wa.me/${from}\n\nMotivo:\n${reason}\n\nA Eva deu uma resposta curta e está em pausa nesse chat. O que você quer fazer?`;
          buttons = [
            { id: `evabt:lead-pause:${leadId}`, title: 'Responder' },
            { id: `evabt:lead-optout:${leadId}`, title: 'Ignorar' },
          ];
        } else {
          transferMsg = `🔔 TRANSFERENCIA DE ATENDIMENTO${contactTypeLabel}\n\nContato: ${from}${nameLabel}\nFalar direto: wa.me/${from}\n\nMotivo:\n${reason}${estimativaMsg}\n\nVocê pode assumir esse atendimento. A Eva fica em pausa nesse chat (se foi engano, é só Reativar).`;
          buttons = [
            { id: `evabt:lead-pause:${leadId}`, title: 'Assumir' },
            { id: `evabt:lead-view:${leadId}`, title: 'Ver perfil' },
            { id: `evabt:lead-resume:${leadId}`, title: '↩️ Reativar Eva' },
          ];
        }

        if (!isSandbox) {
          await sendAdminWithButtons({ metaWaba: metaWaba ?? null, sendText }, config.engineerPhone, transferMsg, buttons);
        } else {
          console.log(`[sandbox] Transfer to engineer:\n${transferMsg}\n[buttons] ${buttons.map(b => b.title).join(' | ')}`);
        }
        console.log(`[action] Transfer to human for ${from}`);
        break;
      }

      case 'schedule_visit': {
        const d = action.data as Record<string, unknown>;
        const startISO = d.datetime_iso as string | undefined;
        // visit_type: 'meet' (Google Meet 30min) ou 'on_site' (visita presencial 60min).
        // Default 'on_site' pra compat retroativa com prompts antigos.
        const visitType = (d.visit_type as string | undefined) === 'meet' ? 'meet' : 'on_site';
        const isMeet = visitType === 'meet';
        const durationMinutes = (d.duration_minutes as number | undefined) ?? (isMeet ? 30 : 60);
        const clientEmail = (d.client_email as string | undefined)?.trim();
        const clientAddress = (d.client_address as string | undefined)?.trim();
        let clientCoordinates = (d.client_coordinates as string | undefined)?.trim();
        // Fall back to coords saved from a shared WhatsApp location
        if (!clientCoordinates) {
          const leadNow = await db.getLeadByPhone(from);
          const ed = leadNow?.energy_data as Record<string, unknown> | undefined;
          if (ed?.shared_coordinates && typeof ed.shared_coordinates === 'string') {
            clientCoordinates = ed.shared_coordinates;
          }
        }

        if (!startISO) {
          console.warn(`[calendar] schedule_visit without datetime_iso for ${from}`);
          break;
        }

        if (!calendar) {
          console.warn(`[calendar] schedule_visit requested but Calendar integration disabled`);
          break;
        }

        try {
          const endISO = new Date(new Date(startISO).getTime() + durationMinutes * 60000).toISOString();

          // Business hours check (America/Sao_Paulo): Mon-Fri, 08:00-16:00
          const fmt = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Sao_Paulo',
            weekday: 'short',
            hour: 'numeric',
            minute: 'numeric',
            hour12: false,
          });
          const parts = fmt.formatToParts(new Date(startISO));
          const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
          const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
          const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');

          const endParts = fmt.formatToParts(new Date(new Date(startISO).getTime() + durationMinutes * 60000));
          const endHour = Number(endParts.find((p) => p.type === 'hour')?.value ?? '0');
          const endMinute = Number(endParts.find((p) => p.type === 'minute')?.value ?? '0');

          const isWeekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(weekday);
          const startsInRange = (hour > 8) || (hour === 8 && minute >= 0);
          const endsInRange = (endHour < 16) || (endHour === 16 && endMinute === 0);
          const inBusinessHours = hour >= 8 && (endHour < 16 || (endHour === 16 && endMinute === 0));

          if (!isWeekday || !startsInRange || !endsInRange || !inBusinessHours) {
            const msg = 'ops, so consigo agendar de segunda a sexta, das 8h as 16h. pode ser outro dia ou horario dentro desse intervalo?';
            if (!isSandbox) await sendText(from, msg);
            console.log(`[calendar] Outside business hours for ${from} at ${startISO} (weekday=${weekday}, ${hour}:${minute}-${endHour}:${endMinute})`);
            break;
          }

          const available = await calendar.isAvailable(startISO, endISO);

          if (!available) {
            const msg = 'opa, o junior ja tem compromisso nesse horario. pode ser outro dia ou horario?';
            if (!isSandbox) await sendText(from, msg);
            console.log(`[calendar] Conflict for ${from} at ${startISO} — asked for another time`);
            break;
          }

          const lead = await db.getLeadByPhone(from);
          const summary = isMeet
            ? `Meet - ${lead?.name ?? from} - apresentacao estudo`
            : `Visita tecnica - ${lead?.name ?? from} - ${lead?.city ?? ''}`.trim();
          const description = [
            `Tipo: ${isMeet ? 'Google Meet (online)' : 'Visita tecnica presencial'}`,
            `Cliente: ${lead?.name ?? 'Nao informado'}`,
            `WhatsApp: ${from}`,
            `Cidade: ${lead?.city ?? 'Nao informada'}`,
            `Perfil: ${lead?.profile ?? 'indefinido'}`,
            lead?.energy_data && typeof lead.energy_data === 'object'
              ? `Conta: R$ ${(lead.energy_data as Record<string, unknown>).monthly_bill ?? '-'}/mes`
              : '',
            clientEmail ? `Email cliente: ${clientEmail}` : '',
            !isMeet && clientAddress ? `Endereco: ${clientAddress}` : '',
            !isMeet && clientCoordinates ? `Coordenadas: ${clientCoordinates}` : '',
            !isMeet && clientCoordinates ? `Maps: https://www.google.com/maps?q=${clientCoordinates}` : '',
            d.notes ? `\nObservacoes: ${d.notes}` : '',
          ].filter(Boolean).join('\n');

          // Meet: cria evento COM Google Meet (link gerado automatico), sem location.
          // Visita: cria evento com location (endereco + maps), sem Meet.
          const eventLocation = isMeet
            ? undefined
            : (clientCoordinates
              ? (clientAddress ? `${clientAddress} (${clientCoordinates})` : clientCoordinates)
              : (clientAddress || undefined));
          const event = await calendar.createEvent({
            summary,
            description,
            startISO,
            endISO,
            location: eventLocation,
            withMeet: isMeet,
          });
          console.log(`[calendar] Event created for ${from}: type=${visitType} ${event.htmlLink} meet=${event.meetLink ?? 'none'} location=${eventLocation ?? 'none'}`);

          // Se Meet: manda link pro cliente no zap imediatamente.
          if (isMeet && event.meetLink && !isSandbox) {
            await sendText(from, `Pronto! 🎥\n\nLink do Meet: ${event.meetLink}\n\nÉ só clicar no horário marcado. Se precisar reagendar é só me chamar.`);
          }

          await supabase.logEvent('info', 'calendar', `Visit scheduled for ${from}`, {
            event_id: event.eventId,
            html_link: event.htmlLink,
            start: startISO,
            client_email: clientEmail ?? null,
            has_location: Boolean(clientAddress),
          });

          // Lead -> status agendado (sai do limbo). Cadencia automatica pra
          // este lead deve parar — Eva ja fechou o objetivo principal.
          await db.upsertLead({ phone: from, status: 'agendado', company_id: db.companyIdDaMensagem ?? ECOSUN_COMPANY_ID }); // [3e]
          await db.cancelCadence(leadId, 'visita_agendada').catch(() => {});

          // Alerta WABA pro Junior — agendamento eh sinal QUENTE, ele precisa
          // ver na hora pra confirmar logistica e equipamento. NUNCA silencia,
          // mesmo se lead for null (Calendar foi criado, Junior tem que saber).
          if (!isSandbox) {
            const leadName = lead?.name ?? 'cliente';
            const leadCity = lead?.city ?? null;
            const dataFmt = new Date(startISO).toLocaleString('pt-BR', {
              timeZone: 'America/Sao_Paulo',
              day: '2-digit', month: '2-digit', weekday: 'short',
              hour: '2-digit', minute: '2-digit',
            });
            const tipoLabel = isMeet ? '🎥 Google Meet (30min)' : '🚗 Visita presencial (60min)';
            const alertBody = [
              `📅 *${isMeet ? 'Meet agendado' : 'Visita agendada'} — ${leadName}*`,
              ``,
              `${tipoLabel}`,
              `🕒 ${dataFmt}`,
              isMeet && event.meetLink ? `🔗 ${event.meetLink}` : '',
              !isMeet && clientAddress ? `📍 ${clientAddress}` : '',
              `📞 ${from}`,
              leadCity ? `🏙️ ${leadCity}` : '',
              ``,
              `Eva fechou o agendamento. Calendar criado.`,
            ].filter(Boolean).join('\n');

            // So usa botoes WABA se temos lead.id (botoes precisam do uuid).
            // Sem lead, fallback texto puro pra nao silenciar — Junior vai
            // abrir dashboard manualmente se precisar agir.
            if (metaWaba && lead?.id) {
              try {
                await metaWaba.sendInteractiveButtons(
                  config.engineerPhone,
                  alertBody.slice(0, 1024),
                  [
                    { id: `evabt:lead-view:${lead.id}`, title: '👤 Ver perfil' },
                    { id: `evabt:lead-pause:${lead.id}`, title: '✋ Assumir' },
                  ],
                  'Toque pra agir',
                );
              } catch (err) {
                console.warn('[schedule_visit] botoes WABA falharam, fallback texto:', (err as Error).message);
                await sendText(config.engineerPhone, alertBody);
              }
            } else {
              await sendText(config.engineerPhone, alertBody);
            }
          }
        } catch (err) {
          console.error(`[calendar] Failed to schedule visit for ${from}:`, err);
          const msg = 'tive uma dificuldade pra agendar aqui, mas ja anotei. o junior confirma com voce.';
          if (!isSandbox) await sendText(from, msg);
        }
        break;
      }

      case 'opt_out': {
        // Client requested to stop receiving messages
        // [MT 3e] blindagem: sob crachá, 0 linhas = lead invisível pro tenant
        // (leitura errada a montante) — loga ALTO em vez de fingir sucesso.
        const { data: optOutRows } = await db.getClient()
          .from('leads')
          .update({ opt_out: true, updated_at: new Date().toISOString() })
          .eq('phone', from)
          .select('id');
        if (!optOutRows?.length) console.warn(`[action][3e] opt_out atualizou 0 linhas pra ${from} — lead fora do tenant?`);
        // Also cancel any pending reengagement touches
        const canceled = await reengagement.cancelAllTouches(leadId, db.getClient());
        if (canceled > 0) console.log(`[reengagement] Canceled ${canceled} touches after opt-out`);
        // Also cancel pending post-install touches
        if (postInstall) {
          const canceledPost = await postInstall.cancelAll(leadId, db.getClient());
          if (canceledPost > 0) console.log(`[post-install] Canceled ${canceledPost} touches after opt-out`);
        }
        console.log(`[action] Opt-out registered for ${from}`);
        break;
      }

      case 'mark_off_topic': {
        // Eva detectou que o cliente pergunta sobre tema completamente fora do
        // escopo Ecosunpower (faca, comida, eletrodomestico, lavagem, etc).
        // Marca opt_out + eva_active=false + cancela tudo + notifica Junior
        // com botoes pra ele confirmar/desfazer manualmente.
        const reason = (action.data as Record<string, unknown> | undefined)?.reason as string | undefined ?? 'tema fora do escopo';
        const now = new Date().toISOString();
        const { data: offTopicRows } = await db.getClient()
          .from('leads')
          .update({ opt_out: true, eva_active: false, status: 'perdido', updated_at: now })
          .eq('phone', from)
          .select('id');
        if (!offTopicRows?.length) console.warn(`[action][3e] mark_off_topic atualizou 0 linhas pra ${from} — lead fora do tenant?`);
        // Cancela cadencia/reengagement/postinstall pendente
        await db.cancelCadence(leadId, 'off_topic').catch(() => {});
        await reengagement.cancelAllTouches(leadId, db.getClient()).catch(() => 0);
        if (postInstall) await postInstall.cancelAll(leadId, db.getClient()).catch(() => 0);
        // Notifica Junior com botoes pra desfazer se foi falso positivo
        if (!isSandbox) {
          const lead = await db.getLeadByPhone(from);
          const alertBody = [
            `🚫 *Eva marcou contato fora de escopo*`,
            ``,
            `${lead?.name ?? 'Sem nome'} — ${from}`,
            `Motivo: ${reason}`,
            ``,
            `Eva nao fala mais com ele. Se foi engano, clica em Desfazer.`,
          ].join('\n');
          if (metaWaba && lead?.id) {
            try {
              await metaWaba.sendInteractiveButtons(
                config.engineerPhone,
                alertBody.slice(0, 1024),
                [
                  { id: `evabt:lead-view:${lead.id}`, title: '👤 Ver perfil' },
                  { id: `evabt:lead-resume:${lead.id}`, title: '↩️ Desfazer' },
                ],
              );
            } catch {
              await sendText(config.engineerPhone, alertBody);
            }
          } else {
            await sendText(config.engineerPhone, alertBody);
          }
        }
        console.log(`[action] mark_off_topic registrado pra ${from}: ${reason}`);
        break;
      }

      case 'disqualify_lead': {
        // Lead ON-TOPIC (energia/conta) mas inviavel/vulneravel: baixa renda,
        // tarifa social, conta << criterio R$700/700kWh. NAO e troll — por
        // isso status/contact_type/notificacao distintos do mark_off_topic.
        // Mesmo efeito funcional: eva_active=false (gate 2299 para a Eva) +
        // opt_out + cancela toques. Eva manda 1 msg digna e cala.
        const { buildDisqualifyPlan } = await import('./modules/lead-disqualify.js');
        const dqReason = (action.data as Record<string, unknown> | undefined)?.reason as string | undefined ?? `lead fora do criterio (R$${empresa().criterioLeadValor}/${empresa().criterioLeadKwh}kWh) ou vulneravel`;
        // Fetch UMA vez (id imutavel) e reusa pra nome + botoes — parity com
        // mark_off_topic, sem round-trip extra de DB nesse path terminal.
        const dqLead = await db.getLeadByPhone(from);
        const { leadPatch, notifyBody } = buildDisqualifyPlan({
          reason: dqReason,
          leadName: dqLead?.name,
          phone: from,
        });
        const { data: dqRows } = await db.getClient()
          .from('leads')
          .update(leadPatch)
          .eq('phone', from)
          .select('id');
        if (!dqRows?.length) console.warn(`[action][3e] disqualify_lead atualizou 0 linhas pra ${from} — lead fora do tenant?`);
        await db.cancelCadence(leadId, 'disqualify_lead').catch(() => {});
        await reengagement.cancelAllTouches(leadId, db.getClient()).catch(() => 0);
        if (postInstall) await postInstall.cancelAll(leadId, db.getClient()).catch(() => 0);
        if (!isSandbox) {
          if (metaWaba && dqLead?.id) {
            try {
              await metaWaba.sendInteractiveButtons(
                config.engineerPhone,
                notifyBody.slice(0, 1024),
                [
                  { id: `evabt:lead-view:${dqLead.id}`, title: '👤 Ver perfil' },
                  { id: `evabt:lead-resume:${dqLead.id}`, title: '↩️ Desfazer' },
                ],
              );
            } catch {
              await sendText(config.engineerPhone, notifyBody);
            }
          } else {
            await sendText(config.engineerPhone, notifyBody);
          }
        }
        console.log(`[action] disqualify_lead registrado pra ${from}: ${dqReason}`);
        break;
      }

      case 'mark_review_confirmed': {
        // Eva detectou que o cliente ja avaliou no Google. Cancela toques
        // pendentes de review e marca timestamp no lead.
        if (postInstall) {
          await postInstall.markReviewConfirmed(leadId, db.getClient());
          console.log(`[action] Review confirmed for ${from}`);
        } else {
          console.warn(`[action] mark_review_confirmed received but postInstall disabled`);
        }
        break;
      }

      case 'save_testimonial': {
        // Eva capturou um depoimento espontaneo do cliente (texto/audio/video).
        // Payload esperado:
        //   data: { format: 'audio'|'video'|'text'|'screenshot',
        //           content?: string, media_url?: string,
        //           google_posted?: boolean, sentiment?: 'positivo'|'neutro'|'negativo',
        //           source_message_id?: string, notes?: string }
        const d = action.data as Record<string, unknown>;
        const fmt = d.format as TestimonialFormat | undefined;
        if (!fmt || !['audio', 'video', 'text', 'screenshot'].includes(fmt)) {
          console.warn(`[action] save_testimonial invalid format: ${fmt}`);
          break;
        }
        // Sentiment vem do modelo — pode vir "positive" em vez de "positivo" se
        // ele alucinar em ingles. CHECK constraint do DB rejeitaria. Normaliza.
        const rawSent = (d.sentiment as string | undefined)?.toLowerCase();
        const sentimentMap: Record<string, 'positivo' | 'neutro' | 'negativo'> = {
          positivo: 'positivo', positive: 'positivo', good: 'positivo',
          neutro: 'neutro', neutral: 'neutro',
          negativo: 'negativo', negative: 'negativo', bad: 'negativo',
        };
        const sentiment = rawSent ? sentimentMap[rawSent] : undefined;
        try {
          const saved = await testimonials.save({
            leadId,
            format: fmt,
            content: (d.content as string) ?? null,
            mediaUrl: (d.media_url as string) ?? null,
            googlePosted: Boolean(d.google_posted),
            sentiment,
            sourceMessageId: (d.source_message_id as string) ?? null,
            notes: (d.notes as string) ?? null,
          }, db.getClient());
          if (saved.duplicate) {
            console.log(`[action] Testimonial already existed ${saved.id} (${fmt}), skipping notification`);
            break;
          }
          console.log(`[action] Testimonial saved ${saved.id} (${fmt}) for ${from}`);
          // Se depoimento em video ou audio positivo, avisar Junior pra usar no marketing
          if ((fmt === 'video' || fmt === 'audio') && sentiment === 'positivo' && !isSandbox) {
            // getLeadByPhone e best-effort: falha aqui nao deve estourar o handler
            const lead = await db.getLeadByPhone(from).catch(() => null);
            const leadName = lead?.name ?? from;
            const body = `🎤 *Depoimento em ${fmt} chegou!*\n\nDe: ${leadName}\nSalvei no banco. Aprovar pra usar no marketing?`;
            const fallback = `${body}\n\n✅ /aprovar-depoimento ${saved.id}\n❌ Ignora se nao for usavel`;
            if (metaWaba) {
              try {
                await metaWaba.sendInteractiveButtons(
                  config.engineerPhone,
                  body,
                  [
                    { id: `approve-testimonial:${saved.id}`, title: '✅ Aprovar' },
                    { id: `ignore-testimonial:${saved.id}`, title: '❌ Ignorar' },
                  ],
                  'Toque pra responder',
                );
              } catch (err) {
                console.warn('[testimonial] botoes falharam, fallback texto:', (err as Error).message);
                await sendText(config.engineerPhone, fallback).catch(() => {});
              }
            } else {
              await sendText(config.engineerPhone, fallback).catch(() => { /* nao bloqueante */ });
            }
          }
        } catch (err) {
          console.error(`[action] save_testimonial failed:`, (err as Error).message);
        }
        break;
      }

      case 'abordagem_update': {
        // Monitoramento Evolutivo: a Eva registra o andamento/desfecho da
        // conversa sobre a usina. CONTRATO (C1 do review): IGNORA o
        // abordagem_id vindo da action — prompt injection na conversa não
        // pode apontar pra abordagem alheia; usa a abordagem aberta do
        // PRÓPRIO lead. Desfecho validado por whitelist; textos truncados.
        if (!metaWaba) break;
        const { getAbordagemAbertaPorLeadPhone } =
          await import('./modules/monitoring/abordagem/abordagens-repo.js');
        const aberta = await getAbordagemAbertaPorLeadPhone(db.getClient(), leadId);
        if (!aberta) {
          console.warn(`[abordagem] abordagem_update sem abordagem aberta (lead=${leadId}) — ignorada`);
          break;
        }
        const d = (action.data ?? {}) as Record<string, unknown>;
        const DESFECHOS_VALIDOS = [
          'resolvido_sozinho', 'limpeza_fechada', 'visita_agendada',
          'transferido_junior', 'sem_resposta', 'descartada_junior',
        ] as const;
        const desfecho = DESFECHOS_VALIDOS.find((x) => x === d.desfecho) ?? null;
        const resumo = typeof d.resumo === 'string' && d.resumo.trim()
          ? d.resumo.trim().slice(0, 300) : null;
        const causaRaiz = typeof d.causa_raiz === 'string' && d.causa_raiz.trim()
          ? d.causa_raiz.trim().slice(0, 300) : null;
        const { atualizarPorConversa } = await import('./modules/monitoring/abordagem/orquestrador.js');
        await atualizarPorConversa(getOrqDeps(db.getClient()), aberta.id, { resumo, desfecho, causaRaiz });
        console.log(`[action] abordagem_update lead=${leadId} abordagem=${aberta.id} desfecho=${desfecho ?? 'null'}`);
        break;
      }
    }

    // Handle contact_type if present
    if (action.data.contact_type) {
      await db.getClient()
        .from('leads')
        .update({ contact_type: action.data.contact_type, updated_at: new Date().toISOString() })
        .eq('phone', from);
    }

    // Handle "perdido" status (bought from competitor)
    if (action.data.status === 'perdido') {
      await db.getClient()
        .from('leads')
        .update({ status: 'inativo', contact_type: 'perdido', updated_at: new Date().toISOString() })
        .eq('phone', from);
      console.log(`[action] Lead ${from} marked as lost (bought from competitor)`);
    }
  }

  // Helper: se cliente respondeu (qualquer midia/texto), cancela intro pendente
  // E CADENCIA PENDENTE pra Eva nao mandar toques automatizados depois da
  // conversa ja iniciada. Eva entra no fluxo normal de qualificacao.
  async function cancelIntroIfPending(from: string, db: SupabaseService = supabase): Promise<void> {
    const lead = await db.getLeadByPhone(from);
    if (!lead?.id) return;
    await db.cancelEvaIntro(lead.id, 'client_replied').catch(() => {});
    const cancelled = await db.cancelCadence(lead.id, 'client_replied').catch(() => 0);
    // Cliente respondeu no zap -> para tambem a sequencia de e-mail pendente
    // (nao faz sentido continuar mandando e-mail frio pra quem ja respondeu).
    await db.cancelEmailSequence(lead.id, 'respondeu').catch(() => {});
    if (cancelled > 0) {
      console.log(`[cadence] ${cancelled} toques cancelados pra ${from} (cliente respondeu)`);
      // 🔥 Sinal quente — notifica Junior imediatamente (nao espera digest 3x/dia)
      try {
        const { alertCadenceReplied } = await import('./modules/eva-alerts.js');
        await alertCadenceReplied(
          { client: supabase.getClient(), engineerPhone: config.engineerPhone, sendText, metaWaba: metaWaba ?? null },
          lead.id,
          lead.name ?? null,
          from,
          cancelled,
        );
      } catch (err) {
        console.warn('[alerts] alertCadenceReplied import/run falhou:', (err as Error).message);
      }
    }
  }

  // Handle audio messages
  async function handleAudioMessage(from: string, messageId: string, companyId?: string) {
    const db = supabase.paraMensagem(companyId); // EVA MT 3c: crachá nos cancelamentos
    if (await takeover.isPaused(from)) {
      console.log(`[takeover] Skipping audio from ${from} — human takeover active`);
      return;
    }
    if (!(await db.isEvaActiveForPhone(from))) { // [3e] gate pelo crachá
      console.log(`[eva-active] Skipping audio from ${from} — eva_active=false`);
      return;
    }
    await cancelIntroIfPending(from, db);
    if (!transcriber) {
      const msg = 'Nao consegui ouvir o audio. Pode me enviar por texto, por favor? 😊';
      if (!isSandbox) await sendText(from, msg);
      return;
    }

    try {
      if (!isSandbox) await sendText(from, 'Ouvindo seu audio... 🎧');

      // Download audio via Evolution API
      const media = await messaging.getMediaBase64(messageId);
      if (!media) {
        const msg = 'Nao consegui baixar o audio. Pode mandar de novo? 😊';
        if (!isSandbox) await sendText(from, msg);
        return;
      }

      // Arquiva o audio original no cofre do lead (Junior quer TUDO em maos)
      const audioLead = await db.getLeadByPhone(from).catch(() => null);
      if (audioLead) await archiveInboundMedia(supabase, audioLead.id, 'audio', media.base64, media.mimetype, messageId, { db, companyId: db.companyIdDaMensagem ?? ECOSUN_COMPANY_ID });

      const text = await transcriber.transcribeFromBase64(media.base64, media.mimetype);
      if (!text) {
        const msg = 'O audio ficou um pouco dificil de entender. Pode mandar de novo ou escrever por texto? 😊';
        if (!isSandbox) await sendText(from, msg);
        return;
      }

      console.log(`[audio] Transcribed from ${from}: "${text.substring(0, 80)}..."`);
      await handleTextMessage(from, text, undefined, companyId);
    } catch (error) {
      console.error(`[audio] Error processing audio from ${from}:`, error);
      const msg = 'Nao consegui processar o audio. Pode me enviar por texto? 😊';
      if (!isSandbox) await sendText(from, msg);
    }
  }

  // Handle image messages
  async function handleImageMessage(from: string, messageId: string, companyId?: string) {
    const db = supabase.paraMensagem(companyId); // EVA MT 3a: crachá nas escritas de conversa
    if (await tryHandleCaseCreatorMedia(from, messageId, 'image')) return;
    if (await tryHandleProposalMedia(from, messageId, 'image')) return;

    // Caixa de Entrada (Fatia 3): foto de comprovante do Junior vira lançamento.
    // Baixa a mídia aqui só pro admin; pro cliente nada muda.
    if (isAdminPhone(from) && metaWaba) {
      const media = await messaging.getMediaBase64(messageId);
      if (media) {
        const { tryHandleFinanceiroMedia } = await import('./modules/financeiro/caixa-entrada.js');
        const tratou = await tryHandleFinanceiroMedia(
          getCaixaDeps(), from,
          { base64: media.base64, mimeType: media.mimetype, messageId },
          'imagem',
        );
        if (tratou) return;
      }
    }

    if (await takeover.isPaused(from)) {
      console.log(`[takeover] Skipping image from ${from} — human takeover active`);
      return;
    }
    if (!(await db.isEvaActiveForPhone(from))) { // [3e] gate pelo crachá
      console.log(`[eva-active] Skipping image from ${from} — eva_active=false`);
      return;
    }
    await cancelIntroIfPending(from, db);
    try {
      const lead = await db.getLeadByPhone(from);
      // Foto e RESPOSTA (geralmente a conta de luz) — conta pro CAPI tambem.
      maybeCapiRespondeu(lead, db, '📷 Enviou uma foto (provavelmente a conta de luz)');
      const context = lead?.name
        ? `Cliente: ${lead.name}, Cidade: ${lead.city ?? 'nao informada'}, Perfil: ${lead.profile ?? 'indefinido'}`
        : 'Cliente novo, ainda sem dados coletados';

      if (!isSandbox) await sendText(from, 'Recebi a foto! Analisando... 📋');

      // Download image via Evolution API
      const media = await messaging.getMediaBase64(messageId);
      if (!media) {
        const msg = 'Nao consegui abrir a foto. Pode enviar novamente? 📸';
        if (!isSandbox) await sendText(from, msg);
        return;
      }

      // Arquiva a foto original no cofre do lead (conta de luz, telhado, etc.)
      if (lead) await archiveInboundMedia(supabase, lead.id, 'imagem', media.base64, media.mimetype, messageId, { db, companyId: db.companyIdDaMensagem ?? ECOSUN_COMPANY_ID });

      const imageDataUrl = `data:${media.mimetype};base64,${media.base64}`;
      const analysisText = await vision.analyzeImage(imageDataUrl, context);
      const displayText = brain.getDisplayText(analysisText);
      const action = brain.parseAction(analysisText);
      // Guard: se o sanitizer/getDisplayText zerou tudo (modelo so mandou
      // scaffolding), nunca manda mensagem vazia pro cliente que enviou foto.
      const safeDisplay = displayText.trim()
        ? displayText
        : 'Recebi sua imagem! 📸 Pra eu te ajudar certinho — é energia solar pra você? Se puder, me manda também o valor médio da sua conta de luz.';

      // TRAVA-NÚMERO também no caminho da FOTO da conta (onde a Eva lê valores) —
      // leitura da conta do cliente passa; preço/dimensionamento calculado vira handoff.
      const { travarTexto: travarFoto } = await import('./modules/eva-trava-numero.js');
      const safeDisplayTravado = travarFoto(safeDisplay, 'foto');

      if (!isSandbox) {
        await sendText(from, safeDisplayTravado);
      } else {
        console.log(`[sandbox] Image analysis for ${from}: ${safeDisplayTravado}`);
      }

      // Save to conversation
      if (lead) {
        const conversation = await db.getOrCreateConversation(lead.id, companyId);
        const updatedMessages = [
          ...conversation.messages,
          { role: 'user' as const, content: '[Enviou uma foto]', timestamp: new Date().toISOString() },
          { role: 'assistant' as const, content: safeDisplay, timestamp: new Date().toISOString() },
        ];
        await db.updateConversation(conversation.id, {
          messages: updatedMessages.slice(-20),
          message_count: conversation.message_count + 2,
        });

        // Handle actions (update_lead with energy data from bill photo)
        if (action) {
          await handleAction(action, lead.id, from, conversation.id, db);
        }
      }

      await supabase.logEvent('info', 'vision', `Analyzed image from ${from}`);
    } catch (error) {
      console.error(`[vision] Error processing image from ${from}:`, error);
      const msg = 'A foto ficou um pouco dificil de ler. Consegue tirar outra mais nitida? 📸';
      if (!isSandbox) await sendText(from, msg);
    }
  }

  // Handle video messages (depoimentos, casos, registros)
  async function handleVideoMessage(from: string, messageId: string, caption?: string, companyId?: string) {
    const db = supabase.paraMensagem(companyId); // EVA MT 3c: crachá nos cancelamentos
    if (await tryHandleCaseCreatorMedia(from, messageId, 'video')) return;
    if (await tryHandleProposalMedia(from, messageId, 'video')) return;

    if (await takeover.isPaused(from)) {
      console.log(`[takeover] Skipping video from ${from} — human takeover active`);
      return;
    }
    if (!(await db.isEvaActiveForPhone(from))) { // [3e] gate pelo crachá
      console.log(`[eva-active] Skipping video from ${from} — eva_active=false`);
      return;
    }
    await cancelIntroIfPending(from, db);
    try {
      const lead = await db.getLeadByPhone(from);
      if (!isSandbox) await sendText(from, 'Recebi o video! Deixa eu dar uma olhada...');

      const media = await messaging.getMediaBase64(messageId);
      if (!media) {
        if (!isSandbox) await sendText(from, 'nao consegui baixar o video aqui, pode tentar enviar de novo?');
        return;
      }

      // Arquiva no cofre do lead (alem do bucket testimonials) — Junior quer TUDO em maos
      if (lead) await archiveInboundMedia(supabase, lead.id, 'video', media.base64, media.mimetype, messageId, { db, companyId: db.companyIdDaMensagem ?? ECOSUN_COMPANY_ID });

      // Upload to Supabase Storage pra preservar o original
      const videoBuffer = Buffer.from(media.base64, 'base64');
      const filename = `${Date.now()}-${from}-${messageId.slice(0, 8)}.mp4`;
      let mediaUrl: string | null = null;
      try {
        const { error: uploadErr } = await supabase.getClient().storage
          .from('testimonials')
          .upload(filename, videoBuffer, {
            contentType: media.mimetype || 'video/mp4',
            upsert: false,
          });
        if (uploadErr) {
          console.warn(`[video] Upload failed (bucket "testimonials" existe?):`, uploadErr.message);
        } else {
          mediaUrl = supabase.getClient().storage
            .from('testimonials')
            .getPublicUrl(filename).data.publicUrl;
          console.log(`[video] Uploaded to ${mediaUrl}`);
        }
      } catch (e) {
        console.warn(`[video] Storage upload exception:`, (e as Error).message);
      }

      // Tentar transcrever o audio do video. Whisper aceita mp4 direto mas
      // o cap hard e 25MB — usamos 20MB pra deixar margem (o container inclui
      // video + audio, a API julga pelo tamanho total do upload).
      let transcription: string | null = null;
      const WHISPER_SAFE_CAP = 20 * 1024 * 1024;
      if (transcriber && videoBuffer.byteLength <= WHISPER_SAFE_CAP) {
        transcription = await transcriber.transcribeFromBase64(media.base64, 'video/mp4');
      } else if (videoBuffer.byteLength > WHISPER_SAFE_CAP) {
        console.log(`[video] Too large to transcribe safely (${(videoBuffer.byteLength / 1024 / 1024).toFixed(1)}MB > 20MB)`);
      }

      // Passa pra Eva decidir o que fazer com o conteudo do video.
      // Passamos source_message_id pra ela ecoar no save_testimonial,
      // o que previne duplicatas caso a mensagem volte pela fila.
      const parts: string[] = ['[Cliente enviou um VIDEO.'];
      if (caption) parts.push(`Legenda: "${caption}".`);
      if (transcription) {
        parts.push(`Transcricao do audio do video: "${transcription}".`);
      } else {
        parts.push('(audio do video nao foi transcrito).');
      }
      if (mediaUrl) {
        parts.push(`Video salvo em: ${mediaUrl}.`);
      } else {
        parts.push('(nao consegui salvar o video no storage — bucket "testimonials" pode nao existir). ');
      }
      parts.push(`source_message_id desta mensagem: "${messageId}".`);
      parts.push(
        'Se este video parecer ser um DEPOIMENTO ou avaliacao positiva do sistema/servico, ' +
        'dispare save_testimonial com format="video", content=transcricao (se houver), ' +
        'media_url=URL acima (se houver), sentiment="positivo", source_message_id=valor acima. ' +
        'Depois responda calorosamente ao cliente agradecendo. Se o cliente NAO mencionou ' +
        'que postou no Google, aproveite e peca gentilmente pra colar a mesma ideia na ' +
        'avaliacao do Google. Se o video nao for depoimento (ex: foto de conta, telhado, ' +
        'etc.), responda adequadamente ao conteudo sem salvar depoimento.]',
      );
      await handleTextMessage(from, parts.join(' '), undefined, companyId);

      if (lead) {
        await supabase.logEvent('info', 'video', `Received video from ${from} (${(videoBuffer.byteLength / 1024).toFixed(0)}KB, transcribed=${Boolean(transcription)})`);
      }
    } catch (error) {
      console.error(`[video] Error processing video from ${from}:`, error);
      if (!isSandbox) await sendText(from, 'tive um problema pra processar o video. pode tentar reenviar?');
    }
  }

  // Helper: se admin em modo proposta personalizada, intercepta midia pro
  // fluxo de anexos (estudo personalizado). Retorna true se tratou.
  async function tryHandleProposalMedia(
    from: string,
    messageId: string,
    mediaType: 'image' | 'video' | 'document',
  ): Promise<boolean> {
    if (!isAdminPhone(from)) return false;
    if (!(await proposalAssistant.isInProposalMode(from))) return false;
    const reply = await proposalAssistant.handleIncomingMedia(from, messageId, mediaType);
    if (reply === null) return false; // nao era personalizada
    await sendText(from, reply);
    return true;
  }

  // Handle document messages (PDF)
  async function handleDocumentMessage(from: string, messageId: string, mimetype: string, companyId?: string) {
    const db = supabase.paraMensagem(companyId); // EVA MT 3a: crachá nas escritas de conversa
    // PRIORIDADE: se Junior anexou doc pra proposta personalizada, captura aqui
    if (await tryHandleProposalMedia(from, messageId, 'document')) return;

    // Caixa de Entrada (Fatia 3): PDF de comprovante/nota do Junior.
    if (isAdminPhone(from) && metaWaba && mimetype.includes('pdf')) {
      const media = await messaging.getMediaBase64(messageId);
      if (media) {
        const { tryHandleFinanceiroMedia } = await import('./modules/financeiro/caixa-entrada.js');
        const tratou = await tryHandleFinanceiroMedia(
          getCaixaDeps(), from,
          { base64: media.base64, mimeType: media.mimetype, messageId },
          'pdf',
        );
        if (tratou) return;
      }
    }

    if (await takeover.isPaused(from)) {
      console.log(`[takeover] Skipping document from ${from} — human takeover active`);
      return;
    }
    if (!(await db.isEvaActiveForPhone(from))) { // [3e] gate pelo crachá
      console.log(`[eva-active] Skipping document from ${from} — eva_active=false`);
      return;
    }
    await cancelIntroIfPending(from, db);
    try {
      if (!mimetype.includes('pdf')) {
        const msg = 'Recebi o arquivo! Por enquanto consigo analisar PDFs e imagens. Se for uma conta de luz, pode mandar como foto ou PDF 😊';
        if (!isSandbox) await sendText(from, msg);
        return;
      }

      const lead = await db.getLeadByPhone(from);
      // PDF e RESPOSTA (geralmente a conta de luz) — conta pro CAPI tambem.
      maybeCapiRespondeu(lead, db, '📄 Enviou um PDF (provavelmente a conta de luz)');
      const context = lead?.name
        ? `Cliente: ${lead.name}, Cidade: ${lead.city ?? 'nao informada'}, Perfil: ${lead.profile ?? 'indefinido'}`
        : 'Cliente novo, ainda sem dados coletados';

      if (!isSandbox) await sendText(from, 'Recebi o PDF! Analisando... 📄');

      // Download PDF via Evolution API
      const media = await messaging.getMediaBase64(messageId);
      if (!media) {
        const msg = 'Nao consegui abrir o PDF. Pode enviar novamente? 📄';
        if (!isSandbox) await sendText(from, msg);
        return;
      }

      // Arquiva o original no cofre do lead (Junior precisa ter a conta em maos)
      if (lead) await archiveInboundMedia(supabase, lead.id, 'pdf', media.base64, media.mimetype, messageId, { db, companyId: db.companyIdDaMensagem ?? ECOSUN_COMPANY_ID });

      // Guarda: PDF pesado trava a leitura (chamada demora minutos). Barra na
      // entrada com uma saida amigavel em vez de deixar a Eva muda.
      const { pdfGrandeDemais, bytesParaMB, tamanhoBase64Bytes, PDF_TIMEOUT_MS } = await import('./modules/pdf-guard.js');
      if (pdfGrandeDemais(media.base64)) {
        const mb = bytesParaMB(tamanhoBase64Bytes(media.base64));
        if (!isSandbox) await sendText(from, `Esse PDF ta pesado (${mb}MB) e eu nao consigo ler ele inteiro por aqui 😅. Manda so a pagina da conta como *foto*, que eu leio rapidinho!`);
        return;
      }

      // Use Claude to analyze the PDF (Opus; fallback Haiku se Opus indisponivel)
      const pdfClient = new Anthropic({ apiKey: config.anthropicApiKey });
      const pdfMessages: Anthropic.Messages.MessageParam[] = [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: media.base64 },
              },
              {
                type: 'text',
                text: `Voce e a ${empresa().nomeAtendente}, consultora de energia solar da ${empresa().nomeFantasia}.
O cliente enviou este PDF. Provavelmente e uma conta de luz.

Leia com ATENCAO e extraia EXATAMENTE o que esta impresso (nao arredonde, nao chute):
- Distribuidora (Neoenergia/CEB ou Equatorial/CELG)
- Consumo em kWh do mes (o numero REAL impresso na fatura)
- Valor total em R$
- Grupo (A ou B)
- Demanda contratada em kW (se Grupo A)

CONFERENCIA DE COERENCIA (obrigatoria antes de responder):
A tarifa cheia na regiao e ~R$ 1,00/kWh. Entao o valor em R$ deve ser proximo do
consumo em kWh (ex.: conta de R$ 500 => ~450-500 kWh). Se o consumo que voce leu
NAO bater com o valor (ex.: leu 85 kWh numa conta de R$ 490), VOCE LEU ERRADO ou a
conta tem varias unidades — NAO invente: releia, e se ainda nao bater, diga ao cliente
de forma leve que quer confirmar e pergunte o consumo em kWh. NAO emita o JSON nesse caso.

Se os numeros baterem, confirme de forma natural e curta com o cliente e inclua no FINAL:
\`\`\`json\n{"action":"update_lead","data":{"energy_data":{"monthly_bill":VALOR,"consumption_kwh":CONSUMO,"group":"B"}}}\n\`\`\`

Se NAO for conta de luz, descreva o que e e responda naturalmente (sem JSON).
Contexto: ${context}
Responda CURTO, no maximo 2 paragrafos, tom de WhatsApp. Nunca escreva laudo/titulo interno.`,
              },
            ],
          },
      ];
      // Opus pra ler conta sem erro grosseiro (dinheiro em jogo). Fallback Haiku em
      // erro de API (429/overloaded/5xx) — melhor ler com modelo menor do que rejeitar
      // conta legivel. A trava de coerencia (prompt + solar.ts) ainda protege.
      // timeout curto: se a leitura travar, falha rapido e cai no catch (que
      // avisa o cliente) em vez de pendurar a mensagem por minutos.
      let analysisResponse;
      try {
        analysisResponse = await pdfClient.messages.create({ model: 'claude-opus-4-7', max_tokens: 1500, messages: pdfMessages }, { timeout: PDF_TIMEOUT_MS });
      } catch (apiErr) {
        console.warn('[document] Opus indisponivel, fallback Haiku:', (apiErr as Error).message);
        analysisResponse = await pdfClient.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 1500, messages: pdfMessages }, { timeout: PDF_TIMEOUT_MS });
      }

      const analysisText = analysisResponse.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('');

      const displayText = brain.getDisplayText(analysisText);
      const action = brain.parseAction(analysisText);

      // TRAVA-NÚMERO também no caminho do PDF da conta (leitura passa; cálculo vira handoff).
      const { travarTexto: travarPdf } = await import('./modules/eva-trava-numero.js');
      const displayTextTravado = travarPdf(displayText, 'pdf');

      if (!isSandbox) {
        await sendText(from, displayTextTravado);
      } else {
        console.log(`[sandbox] PDF analysis for ${from}: ${displayTextTravado}`);
      }

      // Save to conversation
      if (lead) {
        const conversation = await db.getOrCreateConversation(lead.id, companyId);
        const updatedMessages = [
          ...conversation.messages,
          { role: 'user' as const, content: '[Enviou um PDF]', timestamp: new Date().toISOString() },
          { role: 'assistant' as const, content: analysisText, timestamp: new Date().toISOString() },
        ];
        await db.updateConversation(conversation.id, {
          messages: updatedMessages.slice(-20),
          message_count: conversation.message_count + 2,
        });
        if (action) await handleAction(action, lead.id, from, conversation.id, db);
      }

      await supabase.logEvent('info', 'document', `Analyzed PDF from ${from}`);
    } catch (error) {
      console.error(`[document] Error processing PDF from ${from}:`, error);
      const msg = 'Nao consegui ler o PDF. Pode mandar como foto ou tentar novamente? 📸';
      if (!isSandbox) await sendText(from, msg);
    }
  }

  // Initialize queue
  const queue = new MessageQueue(config.redisHost, config.redisPort, async (msg) => {
    // Empresa dona (multi-tenant fatia 1): resolvida no webhook. Jobs antigos na
    // fila / canal Evolution nao trazem → EcoSun (comportamento de hoje).
    const companyId = msg.companyId ?? ECOSUN_COMPANY_ID;
    // [MT 3e] o banco DESTE job do consumer: seed/localização liam e escreviam
    // pelo SINGLETON — sob 2 tenants com o MESMO telefone, o nome/coordenadas do
    // cliente do tenant B iam parar no lead da EcoSun (achado do review). Flag
    // off = mesma instância, idêntico.
    const dbMsg = supabase.paraMensagem(msg.companyId);

    // Seed WhatsApp profile name as lead.name if we don't have a name yet
    if (msg.pushName) {
      const trimmed = msg.pushName.trim();
      const looksLikeNumber = /^\+?\d/.test(trimmed);
      if (trimmed && !looksLikeNumber) {
        try {
          const existing = await dbMsg.getLeadByPhone(msg.from);
          if (!existing?.name) {
            await dbMsg.upsertLead({ phone: msg.from, name: trimmed, company_id: companyId });
            console.log(`[lead] Seeded pushName "${trimmed}" for ${msg.from}`);
          }
        } catch (err) {
          console.warn('[lead] Failed to seed pushName:', (err as Error).message);
        }
      }
    }

    // WABA usa media_id pra baixar midia (vindo em msg.content do parseMessage),
    // enquanto Evolution usa messageId. Roteamento condicional pra ambos funcionarem.
    const mediaRef = (mediaContent: string, fallbackId: string) =>
      metaWaba ? mediaContent : fallbackId;

    switch (msg.type) {
      case 'text':
        await handleTextMessage(msg.from, msg.content, msg.referral, companyId);
        break;
      case 'audio':
        await handleAudioMessage(msg.from, mediaRef(msg.content, msg.messageId), companyId);
        break;
      case 'image':
        await handleImageMessage(msg.from, mediaRef(msg.content, msg.messageId), companyId);
        break;
      case 'video':
        await handleVideoMessage(msg.from, mediaRef(msg.content, msg.messageId), msg.caption, companyId);
        break;
      case 'document':
        // Apos fix do parseMessage: msg.content = media_id (igual image/video),
        // msg.mimeType = mime_type. Permite tryHandleProposalMedia baixar pelo media_id.
        await handleDocumentMessage(
          msg.from,
          mediaRef(msg.content, msg.messageId),
          msg.mimeType ?? msg.content,
          companyId,
        );
        break;
      case 'location': {
        try {
          const parsed = JSON.parse(msg.content) as { lat?: number; lng?: number };
          if (typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
            const coords = `${parsed.lat.toFixed(6)},${parsed.lng.toFixed(6)}`;
            const mapsUrl = `https://www.google.com/maps?q=${coords}`;
            // Persist on the lead so Eva can use in schedule_visit later
            // [MT 3e] pelo crachá do job — nunca no lead de outra empresa
            const existing = await dbMsg.getLeadByPhone(msg.from);
            const mergedEnergy = {
              ...(existing?.energy_data as Record<string, unknown> | undefined ?? {}),
              shared_coordinates: coords,
              shared_maps_url: mapsUrl,
            };
            await dbMsg.upsertLead({ phone: msg.from, energy_data: mergedEnergy, company_id: companyId });
            console.log(`[location] Saved coords for ${msg.from}: ${coords}`);
            await handleTextMessage(
              msg.from,
              `[O cliente acabou de compartilhar a localizacao exata pelo WhatsApp. Coordenadas: ${coords}. Link do Maps: ${mapsUrl}. Use essas coordenadas no campo client_coordinates quando for agendar a visita. Agora pergunte o endereco textual (rua/numero/bairro) pra complementar, caso ainda nao tenha.]`,
              undefined,
              companyId,
            );
          } else {
            await handleTextMessage(msg.from, `[Cliente compartilhou localizacao mas nao foi possivel ler as coordenadas.]`, undefined, companyId);
          }
        } catch {
          await handleTextMessage(msg.from, `[Cliente compartilhou localizacao: ${msg.content}]`, undefined, companyId);
        }
        break;
      }
      default:
        console.log(`[router] Unknown message type "${msg.type}" from ${msg.from}`);
    }
  }, config.redisPassword);

  // Express server
  const app = express();
  // Limit 50mb: webhooks da Evolution API chegam com imagem/video em base64
  // inline (PayloadTooLargeError no default de 100kb). 50mb cobre videos curtos
  // do zap (~25mb MP4 + overhead base64 ~33%).
  // `verify` captura o buffer bruto antes de parsear JSON — necessario pra
  // validar o HMAC-SHA256 do webhook Lead Ads da Meta (o X-Hub-Signature-256
  // e calculado sobre o body bytewise, e JSON.stringify(parsed) nao bate).
  app.use(express.json({
    limit: '50mb',
    verify: (req, _res, buf) => {
      (req as unknown as { rawBody: string }).rawBody = buf.toString('utf8');
    },
  }));

  // Webhook endpoint
  // ==========================================================================
  // META LEAD ADS WEBHOOK
  // ==========================================================================

  // GET: challenge de verificacao (Meta chama 1x pra confirmar que o endpoint e nosso)
  app.get('/webhook/meta/leadgen', (req, res) => {
    if (!metaLeadgen) {
      res.status(503).send('Meta leadgen disabled');
      return;
    }
    const mode = req.query['hub.mode'] as string;
    const token = req.query['hub.verify_token'] as string;
    const challenge = req.query['hub.challenge'] as string;
    if (metaLeadgen.validateChallenge(mode, token)) {
      console.log('[meta-leadgen] Challenge verified, subscribing');
      res.status(200).send(challenge);
    } else {
      console.warn('[meta-leadgen] Challenge failed (bad mode or token)');
      res.status(403).send('Forbidden');
    }
  });

  // Processa UM evento leadgen JA GRAVADO em meta_leadgen_events (passos 2+
  // do fluxo): Graph API -> lead no CRM -> CAPI 'Lead' -> template/welcome ->
  // aviso ao Junior. Compartilhado entre o webhook e o /meta-leadgen/reprocess
  // (resgate manual de lead perdido). Lanca em falha — cada chamador decide
  // como avisar (webhook: zap + markEventFailed; reprocess: resposta HTTP).
  async function processarEventoLeadgen(leadgenId: string): Promise<
    | { status: 'sem_telefone'; nome: string | null }
    | { status: 'welcome_ja_enviado'; leadId: string }
    | { status: 'ok'; leadId: string; phone: string; nome: string | null; template: string | null }
  > {
    if (!metaLeadgen) throw new Error('Meta leadgen disabled');

          // 2) Graph API pra detalhes completos (field_data nao vem no webhook)
          const details = await metaLeadgen.fetchLeadDetails(leadgenId);

          // 3) Detecta plataforma via adset targeting (mais preciso que nome).
          //    Se nome tiver "instagram" e shortcut. Se nao, consulta adset.
          let platform: 'facebook' | 'instagram' = 'facebook';
          const nameSignal = (details.ad_name ?? '') + (details.adset_name ?? '') + (details.campaign_name ?? '');
          if (nameSignal.toLowerCase().includes('instagram')) {
            platform = 'instagram';
          } else if (details.adset_id) {
            try {
              const pageToken = await meta!.getPageAccessToken();
              const pRes = await fetch(
                `https://graph.facebook.com/v21.0/${details.adset_id}?fields=targeting&access_token=${pageToken}`,
              );
              const pData = await pRes.json() as {
                targeting?: { publisher_platforms?: string[] };
              };
              const platforms = pData.targeting?.publisher_platforms ?? [];
              if (platforms.length === 1 && platforms[0] === 'instagram') {
                platform = 'instagram';
              }
              // Se tem ambas (fb+ig), nao sabemos qual exatamente disparou esse lead —
              // mantem default facebook e flagea em notes pra analise depois.
            } catch (err) {
              console.warn(`[meta-leadgen] Platform detection via adset failed:`, (err as Error).message);
            }
          }

          const normalized = metaLeadgen.normalize(details, platform);

          if (!normalized.phone) {
            console.warn(`[meta-leadgen] Lead ${leadgenId} sem telefone, salvando so evento`);
            await metaLeadgen.markEventFailed(leadgenId, 'phone missing');
            // Avisa o Junior MESMO ASSIM: a Eva nao consegue atender (sem
            // telefone valido), entao ele precisa resgatar manual na central
            // de leads do Meta. Sem este aviso o lead pago morre invisivel
            // (caso Adriana 03/06).
            try {
              await sendText(
                config.engineerPhone,
                `⚠️ *Lead Meta chegou SEM telefone válido — Eva não consegue atender*\n` +
                `👤 ${normalized.name ?? 'sem nome'}${normalized.city ? ` · ${normalized.city}` : ''}\n` +
                (normalized.email ? `📧 ${normalized.email}\n` : '') +
                (details.campaign_name ? `📣 ${details.campaign_name}\n` : '') +
                `_Resgata manual na central de leads do Meta._`,
              );
            } catch (err) {
              console.warn('[meta-leadgen] aviso de lead sem telefone falhou:', (err as Error).message);
            }
            return { status: 'sem_telefone', nome: normalized.name };
          }

          // Checa se lead ja existe pra decidir se podemos sobrescrever lead_source.
          // Lead que JA avancou no funil (status != 'novo') nao tem origem
          // sobrescrita — preserva historico.
          const existing = await supabase.getLeadByPhone(normalized.phone);
          const isHot = existing && existing.status && existing.status !== 'novo';

          const { id: leadId } = await supabase.upsertLead({
            phone: normalized.phone,
            name: normalized.name ?? undefined,
            city: normalized.city ?? undefined,
            // Mantem 'origin' historico so pra leads novos
            origin: isHot ? existing.origin : normalized.source,
          });

          // Atualiza campos do funil de ads APENAS se for lead novo ou ainda
          // nao tinha source. Protege atribuicao de leads que ja estavam
          // engajando via outro canal.
          const updatePayload: Record<string, unknown> = {
            ad_campaign_id: details.campaign_id ?? null,
            ad_id: details.ad_id ?? null,
            ad_form_id: details.form_id ?? null,
            updated_at: new Date().toISOString(),
          };
          if (!isHot) {
            updatePayload.lead_source = normalized.source;
          }
          // Fase 3 do funil: respostas do form (faixa da conta / tipo de
          // imovel) viram energy_data — merge preserva monthly_bill exato de
          // conversa anterior. E a base do modo continuacao da Eva.
          const energyDataForm = mesclarEnergyData(
            (existing?.energy_data as Record<string, unknown> | null) ?? null,
            extrairRespostasForm(normalized.extraFields),
          );
          if (energyDataForm) updatePayload.energy_data = energyDataForm;
          // Computa canal canônico a partir dos campos de atribuição desta
          // atualização. ad_campaign_id tem prioridade máxima em resolveChannel
          // (qualquer campaign_id = meta). lead_source entra se for lead novo.
          updatePayload.channel = resolveChannel(leadRowToChannelInput(updatePayload));
          await supabase.getClient()
            .from('leads')
            .update(updatePayload)
            .eq('id', leadId);

          // Elo (casa Marketing): lead veio de anúncio (Meta Lead Ads). Evento
          // ESPECÍFICO de ads — ADICIONAL ao comercial:lead_novo genérico que o
          // upsertLead já dispara. Best-effort, nunca derruba o processamento.
          await registrarEvento(supabase.getClient(), {
            tipo: 'marketing:lead_ads',
            departamento: 'marketing',
            leadId,
            canal: 'web',
            origem: 'meta',
            payload: {
              formId: details.form_id ?? null,
              campanha: details.campaign_id ?? null,
              adId: details.ad_id ?? null,
              plataforma: platform,
            },
          });

          // E-mail (Task 16 — Elo + Maquina de E-mail): se o form trouxe um
          // endereco com formato valido, grava em leads.email/email_origem e
          // matricula o lead na sequencia de nutricao (6 toques, Task 6).
          // Best-effort em cada etapa: setLeadEmail() ja nao lanca (so loga e
          // retorna false), e scheduleEmailSequence() tem .catch proprio —
          // nunca deve derrubar o resto da intake (welcome message etc).
          if (normalized.email && emailValido(normalized.email)) {
            const emailOk = await supabase.setLeadEmail(leadId, normalized.email, 'lead_ad');
            const optedOut = Boolean((existing as Record<string, unknown> | null)?.email_opt_out);
            if (emailOk && !optedOut) {
              await supabase.scheduleEmailSequence(leadId).catch((err) => {
                console.warn(`[meta-leadgen] scheduleEmailSequence falhou para lead ${leadId}:`, (err as Error).message);
              });
            }
          }

          try {
            await metaLeadgen.markEventProcessed(leadgenId, leadId);
          } catch (err) {
            console.error(`[meta-leadgen] markEventProcessed failed for ${leadgenId}:`, (err as Error).message);
          }

          // CAPI estagio "Lead" (formulario): devolve a chegada pro Meta via
          // CRM integration (system_generated + lead_id). DEPOIS do
          // markEventProcessed — e ele quem grava o lead_id no evento, e o
          // getLeadForCapi acha o leadgen_id por esse vinculo. Fire-and-forget;
          // webhook e caminho service-role (sem crachá), reporter no singleton.
          void capiReporter(leadId, 'Lead');

          // C3 — anti double-welcome: se welcome_sent_at ja tem valor, nao
          // agenda de novo. Cliente ja recebeu a primeira mensagem.
          // Cast dinamico porque LeadData interface nao lista colunas de migrations recentes.
          const existingWelcome = (existing as Record<string, unknown> | null)?.welcome_sent_at as string | null | undefined;
          if (existingWelcome) {
            console.log(`[meta-leadgen] Welcome already sent for ${normalized.phone} at ${existingWelcome}, skipping`);
            return { status: 'welcome_ja_enviado', leadId };
          }

          // Manda a abertura NA HORA que o lead chega (speed-to-lead). Sem timer na
          // memória → um restart/deploy nunca mais perde o welcome de um lead.
          let aberturaEnviada: string | null = null; // qual template foi (pro aviso no zap)
          await (async () => {
            try {
              // Recheck (mais uma camada contra race de webhooks concorrentes)
              const beforeSend = await supabase.getLeadByPhone(normalized.phone as string);
              const beforeWelcome = (beforeSend as Record<string, unknown> | null)?.welcome_sent_at;
              if (beforeWelcome) {
                console.log(`[meta-leadgen] Welcome already sent (race de webhooks concorrentes), skipping`);
                return;
              }

              if (metaWaba) {
                // Lead de formulario NUNCA mandou mensagem => janela 24h
                // fechada => a Cloud API rejeita texto livre (131047). A 1a
                // mensagem TEM que ser template aprovado. Mesma rota do
                // auto-ack: ad_id (CTWA mapping) -> campanha (DB) -> default.
                const mapped = templateParaAdMeta(details.ad_id ?? null)
                  ?? await supabase.getTemplateInicialPorCampanha(details.campaign_id ?? null);
                const { templateUsado } = await enviarTemplateInicial(
                  metaWaba,
                  normalized.phone as string,
                  normalized.name,
                  mapped || '_eva_qualificacao_v1', // || (nao ??): string vazia do DB tambem cai no default
                );
                aberturaEnviada = templateUsado;
                await registrarTemplateNaConversa(leadId, templateUsado).catch((err) => {
                  console.warn(`[meta-leadgen] marcador de conversa falhou pra ${normalized.phone}:`, (err as Error).message);
                });
                console.log(`[meta-leadgen] Template ${templateUsado} enviado pra ${normalized.phone} (lead ${leadId}) na hora`);
              } else {
                // Evolution (nao-oficial) nao tem regra de janela 24h — mantem
                // o welcome personalizado gerado.
                const welcome = await metaLeadgen.generateWelcome(
                  normalized,
                  details,
                  knowledgeBase.getCore(),
                );
                await sendText(normalized.phone as string, welcome);

                const conversation = await supabase.getOrCreateConversation(leadId);
                await supabase.updateConversation(conversation.id, {
                  messages: [
                    ...conversation.messages,
                    { role: 'assistant' as const, content: welcome, timestamp: new Date().toISOString() },
                  ],
                  message_count: conversation.message_count + 1,
                });
                console.log(`[meta-leadgen] Welcome sent to ${normalized.phone} (lead ${leadId}) na hora`);
              }

              // Marca welcome_sent_at pra bloquear futuros re-welcomes
              await supabase.getClient()
                .from('leads')
                .update({ welcome_sent_at: new Date().toISOString() })
                .eq('id', leadId);
            } catch (err) {
              console.error(`[meta-leadgen] Welcome failed for ${leadId}:`, (err as Error).message);
            }
          })();

          console.log(`[meta-leadgen] Lead ${leadgenId} -> ${leadId} (${normalized.phone}, ${platform}, hot=${isHot}), welcome enviado na hora`);

          // Avisa o Junior NA HORA que entrou lead novo e a Eva vai atender. So pra
          // lead NOVO (isHot=false) pra nao re-notificar quem ja estava no funil.
          if (!isHot) {
            try {
              const respostas = details.field_data ?? [];
              // Acha a resposta por fragmentos do nome do campo (slug do form Meta).
              // Form atual: "qual_o_valor_médio_da_sua_conta..." e "qual_o_tipo_de_imóvel?".
              const achaResposta = (...frags: string[]) =>
                respostas.find((f) => frags.some((fr) => (f.name ?? '').toLowerCase().includes(fr)))?.values?.[0];
              const contaLuz = achaResposta('valor', 'conta', 'fatura');
              const tipoImovel = achaResposta('tipo', 'imóv', 'imov');
              const canalTxt = platform === 'instagram' ? 'Instagram' : 'Facebook';
              const aviso = [
                '🔔 *Novo lead Meta — Eva vai atender*',
                `👤 ${normalized.name ?? 'sem nome'}`,
                `📱 ${normalized.phone}`,
                contaLuz ? `💡 Conta: ${contaLuz}${tipoImovel ? ` · ${tipoImovel}` : ''}` : '',
                details.campaign_name ? `📣 ${details.campaign_name} (${canalTxt})` : `📣 ${canalTxt}`,
                aberturaEnviada ? rotuloAbertura(aberturaEnviada) : '',
                `_Enviada na hora — aí a Eva assume a qualificação._`,
              ].filter(Boolean).join('\n');
              await sendText(config.engineerPhone, aviso);
            } catch (err) {
              console.warn('[meta-leadgen] aviso pro Junior falhou:', (err as Error).message);
            }
          }

    return { status: 'ok', leadId, phone: normalized.phone, nome: normalized.name, template: aberturaEnviada };
  }

  // POST: evento real de novo lead preenchido no formulario do IG/FB
  app.post('/webhook/meta/leadgen', async (req, res) => {
    console.log(`[meta-leadgen] POST received, body size=${((req as unknown as { rawBody?: string }).rawBody ?? '').length}, sig=${req.headers['x-hub-signature-256'] ? 'present' : 'MISSING'}`);
    if (!metaLeadgen) {
      res.status(503).json({ error: 'Meta leadgen disabled' });
      return;
    }
    const rawBody = (req as unknown as { rawBody?: string }).rawBody ?? '';
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    if (!metaLeadgen.validateSignature(rawBody, signature)) {
      console.warn('[meta-leadgen] HMAC signature invalid');
      res.status(403).json({ error: 'Invalid signature' });
      return;
    }

    const payload = req.body as LeadgenPayload & { sample?: { field: string; value: unknown } };
    // Teste do painel Webhooks manda `{ sample: {...} }` sem object=page. Loga e
    // retorna pra reviewer ver 200, mas sem processar (IDs sao fake 4444...).
    if (payload.sample) {
      console.log('[meta-leadgen] Test payload from Webhooks panel received (sample data, no processing)');
      res.status(200).json({ status: 'received' });
      return;
    }
    if (payload.object !== 'page') {
      console.log(`[meta-leadgen] Payload object != 'page' (got '${payload.object}'), skipping`);
      res.status(200).json({ status: 'received' });
      return;
    }

    const changes: Array<{ leadgen_id: string } & Record<string, unknown>> = [];
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'leadgen') continue;
        if (!change.value?.leadgen_id) continue;
        changes.push(change.value as { leadgen_id: string } & Record<string, unknown>);
      }
    }
    if (changes.length === 0) {
      res.status(200).json({ status: 'received' });
      return;
    }

    // ACK pro Meta so DEPOIS de gravar o registro minimo de cada lead (1
    // INSERT cada, com retry — bem dentro do timeout de ~5s do Meta). Se
    // alguma gravacao falhar mesmo assim, responde 500: o Meta REENVIA
    // sozinho com backoff e o dedup (23505) protege quem ja gravou. Antes o
    // 200 saia ANTES do INSERT — rede piscou = lead pago perdido pra sempre
    // (caso Adriana 27/07, leadgen 1071371745313562).
    const { novos, falhas } = await registrarEventosMinimos(metaLeadgen, changes);
    if (falhas.length > 0) {
      res.status(500).json({ status: 'retry', falharam: falhas.length });
    } else {
      res.status(200).json({ status: 'received' });
    }
    console.log(`[meta-leadgen] Processing leadgen webhook (${changes.length} changes, ${novos.length} novos, ${falhas.length} falhas de gravacao)`);

    // Avisa o Junior de cada falha de gravacao — mas agora o Meta reenvia.
    for (const falha of falhas) {
      console.error(`[meta-leadgen] recordEvent falhou pra ${falha.leadgenId}: ${falha.erro}`);
      try {
        await sendText(
          config.engineerPhone,
          `⚠️ *Lead Meta chegou mas falhou ao GRAVAR (rede/banco)*\n` +
          `🆔 ${falha.leadgenId}\n` +
          `💥 ${falha.erro.slice(0, 200)}\n` +
          `_Respondi erro pro Meta e ele vai reenviar sozinho. Se este aviso repetir pro MESMO lead, me chama pra rodar o reprocesso._`,
        );
      } catch (e2) {
        console.warn('[meta-leadgen] aviso de falha de gravacao falhou:', (e2 as Error).message);
      }
    }

    // Processa cada lead novo de forma independente — erro em um nao derruba
    // os outros (ja gravados; recuperaveis via /meta-leadgen/reprocess).
    for (const { leadgenId } of novos) {
      try {
        await processarEventoLeadgen(leadgenId);
      } catch (err) {
        console.error(`[meta-leadgen] Processing ${leadgenId} failed:`, (err as Error).message);
        await metaLeadgen.markEventFailed(leadgenId, (err as Error).message).catch((e) => {
          console.error(`[meta-leadgen] markEventFailed also failed:`, (e as Error).message);
        });
        // Avisa o Junior MESMO no erro: lead pago chegou e a Eva NAO vai
        // atender — sem este aviso o lead morre invisivel ate alguem olhar
        // a central do Meta ou o banco.
        try {
          await sendText(
            config.engineerPhone,
            `⚠️ *Lead Meta chegou mas deu ERRO no processamento — Eva não vai atender*\n` +
            `🆔 ${leadgenId}\n` +
            `💥 ${(err as Error).message.slice(0, 200)}\n` +
            `_O evento ficou gravado no banco — me chama pra rodar o reprocesso deste lead._`,
          );
        } catch (e2) {
          console.warn('[meta-leadgen] aviso de erro pro Junior falhou:', (e2 as Error).message);
        }
      }
    }
  });

  // ==========================================================================
  // INFINITEPAY — webhook de confirmação de pagamento (Checkout Integrado)
  // ==========================================================================
  // Em cada link a gente manda webhook_url apontando pra cá. A InfinitePay NÃO
  // assina o webhook (sem HMAC) → reconfirmamos no payment_check antes de marcar
  // pago (webhookConfirmado). ACK 200 = processado/ignorado; 400 = pede RETRY
  // (erro de verificação ou interno — nunca perde um pagamento de verdade).
  // Destino do redirect_url dos links de cobrança: página de obrigado.
  app.get('/pago', async (_req, res) => {
    const { paginaPago } = await import('./modules/infinitepay.js');
    res.type('html').send(paginaPago());
  });

  app.post('/webhook/infinitepay', async (req, res) => {
    const ack = () => res.status(200).json({ success: true, message: null });
    try {
      const wh = (req.body ?? {}) as { order_nsu?: string; transaction_nsu?: string; invoice_slug?: string; amount?: number };
      if (!wh.order_nsu || !wh.transaction_nsu || !wh.invoice_slug) return ack();
      const handle = config.infinitepayHandle;
      if (!handle) return ack(); // cobrança InfinitePay desligada
      const cob = await supabase.getCobrancaByOrderNsu(String(wh.order_nsu));
      if (!cob || cob.status !== 'pendente') return ack(); // não é nossa OU já paga
      const { verificarPagamento, webhookConfirmado } = await import('./modules/infinitepay.js');
      const verificar = (p: { orderNsu: string; transactionNsu: string; slug: string }) => verificarPagamento({ handle, ...p });
      const r = await webhookConfirmado(
        { order_nsu: wh.order_nsu, transaction_nsu: wh.transaction_nsu, invoice_slug: wh.invoice_slug, amount: wh.amount },
        cob.valorCentavos, verificar,
      );
      if (r.erroVerificacao) { res.status(400).json({ success: false, message: 'verificacao indisponivel — retry' }); return; }
      if (r.confirmado) {
        const marcou = await supabase.marcarCobrancaPaga(cob.id, { transactionNsu: wh.transaction_nsu, invoiceSlug: wh.invoice_slug, metodo: r.metodo, pagoCentavos: r.pagoCentavos });
        if (marcou) {
          console.log('[infinitepay] cobranca PAGA', cob.id, r.metodo, r.pagoCentavos);
          const reais = ((r.pagoCentavos ?? cob.valorCentavos) / 100).toFixed(2).replace('.', ',');
          try { await sendText(config.engineerPhone, `💰 Pagamento confirmado! R$ ${reais} via ${r.metodo === 'pix' ? 'Pix' : 'cartão'} (InfinitePay).`); } catch { /* best-effort */ }
        }
      }
      return ack();
    } catch (err) {
      console.error('[webhook/infinitepay]', err);
      res.status(400).json({ success: false, message: 'erro interno — retry' }); // pede retry, não perde pagamento
    }
  });

  // ==========================================================================
  // WHATSAPP BUSINESS CLOUD API (WABA) — webhook oficial Meta
  // ==========================================================================
  // Configurar no Meta Developers app -> WhatsApp -> Configuracao -> Webhook:
  //   Callback URL: https://aula-aprendendo-agente-whatsapp.oigz6g.easypanel.host/webhook-waba
  //   Verify token: o que voce setou em META_WABA_VERIFY_TOKEN (ex: ecosun-waba-2026)
  //   Subscribe to: messages, message_status (mais tarde adicionar message_template_status)
  if (metaWaba) {
    // GET: challenge de verificacao (Meta chama 1x quando voce configura o webhook)
    app.get('/webhook-waba', (req, res) => {
      const mode = req.query['hub.mode'] as string;
      const token = req.query['hub.verify_token'] as string;
      const challenge = req.query['hub.challenge'] as string;
      if (metaWaba.validateChallenge(mode, token)) {
        console.log('[waba] Challenge verified, webhook subscribed');
        res.status(200).send(challenge);
        return;
      }
      console.warn(`[waba] Challenge failed: mode=${mode}, token_match=${token === config.metaWabaVerifyToken}`);
      res.status(403).send('Forbidden');
    });

    // POST: recebe mensagens e status updates da Meta Cloud API
    app.post('/webhook-waba', async (req, res) => {
      const signature = req.headers['x-hub-signature-256'] as string | undefined;
      const rawBody = (req as unknown as { rawBody?: string }).rawBody ?? '';

      if (!metaWaba.validateSignature(rawBody, signature)) {
        console.warn('[waba] Invalid HMAC signature, rejecting webhook');
        res.status(403).json({ error: 'Invalid signature' });
        return;
      }

      // Sempre responde 200 rapido pra Meta nao reenviar (o processamento real
      // pode ser async via Redis Queue).
      res.status(200).json({ status: 'received' });

      try {
        // Status updates (sent/delivered/read/failed) — log e prossegue
        const statuses = metaWaba.parseStatusUpdates(req.body);
        for (const s of statuses) {
          if (s.status === 'failed') {
            console.warn(`[waba-status] ❌ FALHOU msg=${s.messageId} to=${s.recipientPhone} err=${s.errorCode}: ${s.errorTitle}`);
          } else {
            console.log(`[waba-status] ${s.status} msg=${s.messageId} to=${s.recipientPhone}`);
          }
        }

        // Mensagens recebidas
        const parsed = metaWaba.parseWebhook(req.body);
        if (!parsed) return; // pode ser status only ou tipo nao suportado

        // Filtra grupos (numero >15 chars normalmente)
        if (parsed.from.includes('-') || parsed.from.length > 15) {
          console.log(`[waba] Ignored group message from ${parsed.from}`);
          return;
        }

        // Ignora mensagens do proprio Junior pro numero da Eva
        if (parsed.from === config.engineerPhone) {
          console.log(`[waba] Ignored owner message from ${parsed.from}`);
          return;
        }

        // Multi-tenant (fatia 2): descobre a empresa dona a partir do numero
        // que recebeu a msg. No mundo SEM mapeamentos (hoje) sempre resolve
        // EcoSun. Se JÁ houver mapeamentos e este número não resolver, o
        // resolver devolve companyId=null (falha-fechado) e a gente RETÉM a
        // mensagem — processar como EcoSun vazaria conversa de outra empresa.
        // O .catch mantém a garantia de "nunca derruba por exceção" no mundo
        // legado (zero mapeamentos); no mundo mapeado o motivo 'erro' já é
        // tratado dentro do resolver (falha-fechado).
        const r = await tenantResolver
          .companyDoNumero(parsed.phoneNumberId)
          .catch(() => ({ companyId: ECOSUN_COMPANY_ID, motivo: 'erro' as const }));
        if (!r.companyId) {
          console.warn(`[waba] mensagem de número não-resolvido (${parsed.phoneNumberId}) com mapeamentos ativos — RETIDA (não processada). from=${parsed.from}`);
          return; // falha-fechado: não processa como EcoSun
        }
        const companyId = r.companyId;

        console.log(`[waba] 📥 Mensagem recebida de ${parsed.from} (${parsed.type}) empresa=${companyId.slice(0, 8)}: ${parsed.content.slice(0, 80)}`);

        await queue.addMessage({
          type: parsed.type,
          from: parsed.from,
          content: parsed.content,
          timestamp: parsed.timestamp.toISOString(),
          messageId: parsed.messageId,
          pushName: parsed.pushName,
          caption: parsed.caption,
          mimeType: parsed.mimeType,
          referral: parsed.referral,
          companyId,
        });
      } catch (err) {
        console.error('[waba] Webhook processing error:', (err as Error).message);
      }
    });

    console.log('[waba] Webhook endpoints registered: GET/POST /webhook-waba');
  }

  // ==========================================================================
  // INSTAGRAM DIRECT MESSAGING — qualificador IG DM
  // ==========================================================================
  // Configurar no Meta Developers app -> Instagram -> Messaging -> Webhook:
  //   Callback URL: https://aula-aprendendo-agente-whatsapp.oigz6g.easypanel.host/webhook-ig
  //   Verify token: o mesmo do META_WABA_VERIFY_TOKEN
  //   Subscribe to: messages
  if (igDirect) {
    // GET: challenge de verificacao (Meta chama 1x quando voce configura o webhook).
    app.get('/webhook-ig', (req, res) => {
      const mode = req.query['hub.mode'] as string;
      const token = req.query['hub.verify_token'] as string;
      const challenge = req.query['hub.challenge'] as string;
      if (mode === 'subscribe' && token === config.metaWabaVerifyToken) {
        console.log('[ig] Webhook verified');
        res.status(200).send(challenge);
      } else {
        console.warn(`[ig] Challenge failed: mode=${mode}, token_match=${token === config.metaWabaVerifyToken}`);
        res.status(403).send('Forbidden');
      }
    });

    // POST: recebe eventos de mensagens IG DM.
    app.post('/webhook-ig', async (req, res) => {
      const signature = req.headers['x-hub-signature-256'] as string | undefined;
      const rawBody = (req as unknown as { rawBody?: string }).rawBody ?? '';

      if (!igDirect!.validateSignature(rawBody, signature)) {
        console.warn('[ig] Invalid HMAC signature, rejecting webhook');
        res.status(403).json({ error: 'Invalid signature' });
        return;
      }

      // Ack imediato pra Meta nao retentar.
      res.status(200).send('OK');

      const body = req.body as {
        entry?: Array<{
          messaging?: Array<{
            sender: { id: string };
            message?: {
              text?: string;
              quick_reply?: { payload: string };
            };
          }>;
        }>;
      };

      for (const entry of body.entry ?? []) {
        for (const evt of entry.messaging ?? []) {
          const senderId = evt.sender.id;
          const text = evt.message?.quick_reply?.payload ?? evt.message?.text ?? '';
          if (!text) continue;

          try {
            const { handleIgMessage } = await import('./modules/marketing/ig-qualifier-handler.js');
            await handleIgMessage({
              supabase: supabase.getClient(),
              igDirect: igDirect!,
              senderId,
              text,
              sendZapAlert: (msg: string) => sendText(config.engineerPhone, msg),
            });
          } catch (err) {
            console.error('[ig] handler error:', (err as Error).message);
          }
        }
      }
    });

    console.log('[ig] Webhook endpoints registered: GET/POST /webhook-ig');
  }

  app.post('/webhook', async (req, res) => {
    const token = (req.headers['x-webhook-token'] as string)
      ?? (req.query.token as string)
      ?? '';

    if (!evolution.validateWebhookToken(token)) {
      res.status(401).json({ error: 'Invalid webhook token' });
      return;
    }

    const parsed = evolution.parseWebhook(req.body);
    if (!parsed) {
      res.status(200).json({ status: 'ignored' });
      return;
    }

    // Double check: ignore groups
    if (parsed.from.includes('-') || parsed.from.length > 15) {
      res.status(200).json({ status: 'ignored_group' });
      return;
    }

    // Handle fromMe messages: distinguish bot echoes from Junior typing manually in WhatsApp
    if (parsed.fromMe) {
      const isBotEcho = await takeover.isBotSent(parsed.messageId);
      if (isBotEcho) {
        res.status(200).json({ status: 'ignored_bot_echo' });
        return;
      }

      // Junior typed directly in the client chat
      // Normaliza: trim, lowercase, colapsa multiplos espacos em 1 e remove
      // caracteres invisiveis (ZWSP, BOM) que o WhatsApp as vezes insere.
      const content = parsed.type === 'text'
        ? parsed.content.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[​-‍﻿]/g, '')
        : '';

      if (content) {
        console.log(`[fromMe] content="${content}" (len=${content.length}) from=${parsed.from}`);
      }

      // Comando: liberar Eva pra atender este contato
      // Fluxo: marca eva_active=true, NAO responde imediatamente, agenda
      // intro de apresentacao pra 2h depois. Se cliente responder antes,
      // o intro eh cancelado pelo handleTextMessage (cliente ja iniciou).
      // Aceita com ou sem barra inicial (Junior digita de ambos os jeitos).
      if (/^\/?eva\s+(on|voltar)$/.test(content) || /^\/?bot\s+on$/.test(content)) {
        await takeover.resumeFor(parsed.from);

        // Garante que o lead existe ANTES de tentar setar eva_active
        // (lead novo entra com default true, mas precisamos do id pra agendar intro)
        let lead = await supabase.getLeadByPhone(parsed.from);
        if (!lead) {
          const created = await supabase.upsertLead({ phone: parsed.from, status: 'novo' });
          lead = { id: created.id, phone: parsed.from } as NonNullable<typeof lead>;
        }
        await supabase.setEvaActive(parsed.from, true);

        const introAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2h
        await supabase.scheduleEvaIntro(lead.id, introAt);
        console.log(`[eva-active] Eva ativada pra ${parsed.from} — intro agendada pra ${introAt.toISOString()}`);

        res.status(200).json({ status: 'eva_resumed_with_intro_scheduled' });
        return;
      }

      // Comando: desativar Eva permanentemente neste contato
      if (/^\/?eva\s+off$/.test(content) || /^\/?bot\s+off$/.test(content)) {
        await supabase.setEvaActive(parsed.from, false);
        await takeover.pauseFor(parsed.from);
        // cancela intro pendente E cadencia de reengajamento se houver
        const lead = await supabase.getLeadByPhone(parsed.from);
        if (lead?.id) {
          await supabase.cancelEvaIntro(lead.id, 'eva_off_command').catch(() => {});
          await supabase.cancelCadence(lead.id, 'eva_off_command').catch(() => {});
        }
        console.log(`[eva-active] Eva DESATIVADA permanentemente pra ${parsed.from}`);
        res.status(200).json({ status: 'eva_disabled' });
        return;
      }

      // Comando: marcar como cliente de manutencao + agendar lembretes maio/agosto.
      // Aceita variantes com e sem cedilha/acento (celular auto-corrige diferente).
      const normalized = content.normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (
        /^\/?manutencao(\s+on)?$/.test(normalized) ||
        /^\/?limpeza$/.test(normalized)
      ) {
        let lead = await supabase.getLeadByPhone(parsed.from);
        if (!lead) {
          const created = await supabase.upsertLead({ phone: parsed.from, status: 'novo' });
          lead = { id: created.id, phone: parsed.from } as NonNullable<typeof lead>;
        }
        await supabase.markMaintenanceClient(parsed.from);
        const count = await supabase.scheduleMaintenanceReminders(lead.id);
        console.log(`[maintenance] ${parsed.from} marcado como cliente de manutencao + ${count} lembretes agendados`);
        // Eva continua desativada por padrao — cliente de manutencao nao recebe Eva
        // automatica, apenas os lembretes anuais e o que Junior liberar com /eva on.
        // Cancela cadencia tambem (cliente de manutencao ja tem os 2 lembretes anuais).
        await supabase.cancelCadence(lead.id, 'maintenance_client').catch(() => {});
        await supabase.setEvaActive(parsed.from, false);
        await takeover.pauseFor(parsed.from);
        res.status(200).json({ status: 'maintenance_client_registered' });
        return;
      }

      // Comando: ativa Eva em massa pra todos contatos com <termo> no nome salvo.
      // Ex: "eva ativar nome neemias" => lista contatos do WhatsApp (via Evolution
      // API), filtra por name ou pushName contendo 'neemias', e ativa Eva pra todos.
      // Feedback vai pro ENGINEER_PHONE (Junior) por mensagem separada.
      //
      // Variante "contar" faz dry-run: nao ativa, so retorna contagem e amostra
      // pra diagnosticar quando o resultado vem menor que o esperado.
      const bulkMatch = normalized.match(/^\/?(eva\s+)?(ativar|contar)\s+nome\s+(.+)$/);
      if (bulkMatch) {
        const action = bulkMatch[2] as 'ativar' | 'contar';
        const termo = bulkMatch[3].trim().toLowerCase();
        if (termo.length < 2) {
          res.status(200).json({ status: 'bulk_termo_curto' });
          return;
        }

        console.log(`[eva-bulk] ${action} contatos com "${termo}" no nome...`);
        res.status(200).json({ status: `eva_bulk_${action}_started`, termo });

        // roda em background pra nao travar o webhook
        (async () => {
          try {
            const contacts = await evolution.findContacts();
            console.log(`[eva-bulk] Total de contatos escaneados na Evolution: ${contacts.length}`);

            // Estatisticas de diagnostico
            const hasName = contacts.filter((c) => c.name && c.name.trim().length > 0).length;
            const hasPush = contacts.filter((c) => c.pushName && c.pushName.trim().length > 0).length;
            console.log(`[eva-bulk] Contatos com 'name': ${hasName}, com 'pushName': ${hasPush}`);

            const matches = contacts.filter((c) => {
              const name = (c.name ?? '').toLowerCase();
              const pushName = (c.pushName ?? '').toLowerCase();
              return name.includes(termo) || pushName.includes(termo);
            });

            if (matches.length === 0) {
              await sendText(config.engineerPhone,
                `Nenhum contato encontrado com "${termo}" no nome.\n\n` +
                `Total escaneado: ${contacts.length}\n` +
                `Com 'name' preenchido: ${hasName}\n` +
                `Com 'pushName' preenchido: ${hasPush}`);
              return;
            }

            // Modo 'contar' (dry-run): so mostra a lista, nao ativa
            if (action === 'contar') {
              const labels = matches.slice(0, 50).map((c) =>
                `- ${c.name ?? c.pushName ?? '(sem nome)'} — ${c.phone}`
              );
              const summary = [
                `*DRY RUN* — ${matches.length} contatos com "${termo}" no nome:`,
                `(Total escaneado: ${contacts.length} | com name: ${hasName} | com pushName: ${hasPush})`,
                '',
                labels.join('\n'),
                matches.length > 50 ? `\n...e mais ${matches.length - 50}` : '',
                '',
                `Pra ativar esses, digita: *eva ativar nome ${termo}*`,
              ].filter(Boolean).join('\n');
              await sendText(config.engineerPhone, summary);
              console.log(`[eva-bulk] DRY RUN encontrou ${matches.length} matches pro termo "${termo}"`);
              return;
            }

            let activated = 0;
            const labels: string[] = [];
            for (const contact of matches) {
              try {
                let lead = await supabase.getLeadByPhone(contact.phone);
                if (!lead) {
                  const created = await supabase.upsertLead({
                    phone: contact.phone,
                    name: contact.name ?? contact.pushName,
                    status: 'novo',
                  });
                  lead = { id: created.id, phone: contact.phone } as NonNullable<typeof lead>;
                }
                await supabase.setEvaActive(contact.phone, true);
                await takeover.resumeFor(contact.phone);
                activated++;
                labels.push(`- ${contact.name ?? contact.pushName ?? contact.phone} (${contact.phone})`);
              } catch (err) {
                console.error(`[eva-bulk] Falha ao ativar ${contact.phone}:`, (err as Error).message);
              }
            }

            const summary = [
              `Ativei Eva em *${activated}* contatos com "${termo}" no nome:`,
              `(Total escaneado: ${contacts.length} | com name: ${hasName} | com pushName: ${hasPush})`,
              '',
              labels.slice(0, 40).join('\n'),
              labels.length > 40 ? `\n...e mais ${labels.length - 40}` : '',
            ].filter(Boolean).join('\n');

            await sendText(config.engineerPhone, summary);
            console.log(`[eva-bulk] ${activated} contatos ativados com termo "${termo}"`);
          } catch (err) {
            console.error('[eva-bulk] Erro:', (err as Error).message);
            await sendText(config.engineerPhone,
              `Erro ao ativar em massa: ${(err as Error).message}`).catch(() => {});
          }
        })();
        return;
      }

      await takeover.pauseFor(parsed.from);
      console.log(`[takeover] Eva paused for ${parsed.from} — human took over`);
      res.status(200).json({ status: 'human_takeover' });
      return;
    }

    // Ignore messages from the owner (Junior) when he messages the bot directly
    if (parsed.from === config.engineerPhone) {
      res.status(200).json({ status: 'ignored_owner' });
      return;
    }

    await queue.addMessage({
      type: parsed.type,
      from: parsed.from,
      content: parsed.content,
      timestamp: parsed.timestamp.toISOString(),
      messageId: parsed.messageId,
      pushName: parsed.pushName,
      caption: parsed.caption,
      mimeType: parsed.mimeType,
    });

    res.status(200).json({ status: 'queued' });
  });

  // Learning report endpoint
  app.get('/learning', async (_req, res) => {
    try {
      const report = await learning.generateReport();
      res.type('text/plain').send(report);
    } catch (error) {
      res.status(500).json({ error: 'Failed to generate report' });
    }
  });

  // Test marketing publish endpoint (protected by webhook token)
  app.post('/marketing/test-publish', async (req, res) => {
    const token = (req.headers['x-webhook-token'] as string)
      ?? (req.query.token as string)
      ?? '';
    if (!evolution.validateWebhookToken(token)) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    if (!meta) {
      res.status(503).json({ error: 'Meta integration disabled' });
      return;
    }
    const body = req.body as { image_url?: string; caption?: string; platform?: 'facebook' | 'instagram' | 'both' };
    if (!body.image_url || !body.caption) {
      res.status(400).json({ error: 'image_url and caption required' });
      return;
    }
    const target = body.platform ?? 'both';
    const results: Record<string, unknown> = {};
    try {
      if (target === 'facebook' || target === 'both') {
        results.facebook = await meta.publishFacebookImage(body.image_url, body.caption);
      }
      if (target === 'instagram' || target === 'both') {
        results.instagram = await meta.publishInstagramImage(body.image_url, body.caption);
      }
      res.json({ status: 'published', results });
    } catch (err) {
      console.error('[meta] Test publish failed:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Generate a marketing draft (copy + image). Saved as pending_approval.
  app.post('/marketing/generate', async (req, res) => {
    const token = (req.headers['x-webhook-token'] as string)
      ?? (req.query.token as string) ?? '';
    if (!evolution.validateWebhookToken(token)) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    if (!marketing) {
      res.status(503).json({ error: 'Marketing generator disabled' });
      return;
    }
    try {
      const body = req.body as { topic_type?: string };
      const draft = await marketing.generateDraft(body.topic_type as never);
      console.log(`[marketing] Draft generated: ${draft.id} (${draft.topic})`);
      res.json({
        status: 'draft_created',
        draft: {
          id: draft.id,
          topic: draft.topic,
          topic_type: draft.topic_type,
          caption: draft.caption,
          image_url: draft.image_url,
          approval_token: draft.approval_token,
        },
      });
    } catch (err) {
      console.error('[marketing] Generate failed:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Send a single draft to Junior's WhatsApp with image + caption + action links
  async function sendDraftToJunior(draftId: string) {
    if (!marketing || !meta) {
      console.warn(`[marketing] sendDraftToJunior skipped: marketing=${!!marketing} meta=${!!meta}`);
      return;
    }
    const draft = await marketing.getDraft(draftId);
    if (!draft || draft.status !== 'pending_approval') {
      console.warn(`[marketing] sendDraftToJunior skipped: status=${draft?.status}`);
      return;
    }

    const baseUrl = process.env.PUBLIC_BASE_URL
      ?? 'https://aula-aprendendo-agente-whatsapp.oigz6g.easypanel.host';
    const t = draft.approval_token;
    // UM link soh pro painel de revisao (mobile-friendly com 3 botoes grandes).
    // Substitui os 3 links antigos no corpo da mensagem.
    const reviewLink = `${baseUrl}/marketing/review/${draft.id}?t=${t}`;

    const caption = [
      `📝 Rascunho de post — ${draft.topic}`,
      '',
      draft.caption,
      '',
      '─────────────',
      `👉 Abrir painel pra aprovar ou descartar:`,
      reviewLink,
    ].join('\n');

    const isVideo = draft.content_type === 'video' && draft.video_url;
    const mediaUrl = isVideo ? draft.video_url : draft.image_url;
    const mediaType = isVideo ? 'video' : 'image';

    console.log(`[marketing] Trying to send draft ${draft.id} (${mediaType}) to ${config.engineerPhone}...`);
    try {
      await evolution.sendMedia(config.engineerPhone, mediaUrl, caption, mediaType);
      console.log(`[marketing] ✓ Sent draft ${draft.id} (${mediaType}) to Junior`);
      return;
    } catch (err) {
      console.error(`[marketing] sendMedia failed for ${draft.id}:`, (err as Error).message);
    }

    // Fallback: send as plain text with image URL inline so at least something arrives
    console.log(`[marketing] Falling back to text-only for draft ${draft.id}`);
    try {
      const textFallback = `${caption}\n\n🖼 Imagem: ${draft.image_url}`;
      await sendText(config.engineerPhone, textFallback);
      console.log(`[marketing] ✓ Sent draft ${draft.id} (text fallback) to Junior`);
    } catch (err2) {
      console.error(`[marketing] Text fallback also failed for ${draft.id}:`, (err2 as Error).message);
    }
  }

  // Public HTML pages for approve/regenerate/discard (links clicked from WhatsApp)
  const htmlPage = (title: string, body: string) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:-apple-system,sans-serif;padding:clamp(16px,4vw,40px);max-width:640px;margin:0 auto;color:#333;line-height:1.5">${body}</body></html>`;

  // Escape helper pra prevenir XSS no caption/topic (que vem do Claude e pode
  // conter caracteres especiais ou, em teoria, HTML malicioso se prompt injetado).
  const esc = (s: string) => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  // Permite soh URLs http/https. Bloqueia javascript:, data:, vbscript:, etc.
  // Usa no src de <img>/<video> pra evitar XSS se Claude alucinar URL estranha.
  const safeUrl = (u: string | null | undefined): string =>
    typeof u === 'string' && /^https?:\/\//i.test(u) ? u : '';

  // Painel de revisao mobile-friendly: preview do post + 3 botoes grandes
  // (Aprovar / Regenerar imagem / Descartar). Abre quando Junior clica no
  // link unico que a Eva manda no WhatsApp depois de gerar um draft.
  app.get('/marketing/review/:id', async (req, res) => {
    // Pagina nunca e cacheada — Junior pode revisar em 2 abas diferentes,
    // se aprovar em uma, a outra mostra estado atualizado ao recarregar.
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
    res.setHeader('Referrer-Policy', 'no-referrer');

    const token = (req.query.t as string) ?? '';
    if (!marketing) {
      res.status(503).send(htmlPage('Indisponivel', '<h2>Integracao desativada.</h2>'));
      return;
    }
    const draft = await marketing.validateToken(req.params.id, token);
    if (!draft) {
      res.status(403).send(htmlPage('Erro', '<h2>Link invalido ou expirado.</h2>'));
      return;
    }
    if (draft.status === 'published') {
      res.send(htmlPage('Ja publicado', '<h2>✅ Esse post ja foi publicado.</h2><p>Pode fechar esta aba.</p>'));
      return;
    }
    if (draft.status === 'discarded') {
      res.send(htmlPage('Descartado', '<h2>❌ Rascunho ja descartado.</h2><p>Pode fechar esta aba.</p>'));
      return;
    }

    // Valida que a midia tem URL segura antes de renderizar
    const videoUrl = safeUrl(draft.video_url);
    const imageUrl = safeUrl(draft.image_url);
    if (!videoUrl && !imageUrl) {
      res.send(htmlPage('Midia indisponivel', '<h2>⚠️ Nao ha midia associada a esse rascunho.</h2><p>Descarte e gere de novo.</p>'));
      return;
    }

    const isVideo = draft.content_type === 'video' && !!videoUrl;
    const previewHtml = isVideo
      ? `<video controls playsinline preload="metadata" style="width:100%;border-radius:12px;background:#000;margin-bottom:16px"><source src="${esc(videoUrl)}" type="video/mp4"></video>`
      : `<img src="${esc(imageUrl)}" alt="preview" style="width:100%;border-radius:12px;margin-bottom:16px" />`;

    const tokenEnc = encodeURIComponent(token);
    const approveUrl = `/marketing/approve/${draft.id}?t=${tokenEnc}`;
    const regenUrl = `/marketing/regenerate/${draft.id}?t=${tokenEnc}`;
    const discardUrl = `/marketing/discard/${draft.id}?t=${tokenEnc}`;

    const body = `
<div style="max-width:560px;margin:0 auto">
  <div style="color:#888;font-size:13px;margin-bottom:4px">rascunho de post — ${empresa().nomeFantasia.toLowerCase()}</div>
  <h1 style="margin:0 0 16px 0;font-size:22px">${esc(draft.topic)}</h1>
  ${previewHtml}
  <div style="background:#f5f5f5;padding:14px 16px;border-radius:10px;white-space:pre-wrap;font-size:15px;line-height:1.5;margin-bottom:20px;word-break:break-word">${esc(draft.caption)}</div>
  <a href="${approveUrl}" style="display:block;background:#16a34a;color:#fff;text-decoration:none;text-align:center;padding:18px;border-radius:10px;font-size:17px;font-weight:600;margin-bottom:10px">✅ Aprovar e publicar</a>
  <a href="${regenUrl}" style="display:block;background:#eab308;color:#fff;text-decoration:none;text-align:center;padding:18px;border-radius:10px;font-size:17px;font-weight:600;margin-bottom:10px">🔄 Gerar outra imagem</a>
  <a href="${discardUrl}" style="display:block;background:#dc2626;color:#fff;text-decoration:none;text-align:center;padding:18px;border-radius:10px;font-size:17px;font-weight:600">❌ Descartar</a>
  <p style="color:#999;font-size:12px;text-align:center;margin-top:20px">${empresa().nomeFantasia.toLowerCase()} energia solar — painel de aprovacao de conteudo</p>
</div>`;
    res.send(htmlPage(`Revisar: ${draft.topic}`, body));
  });

  app.get('/marketing/approve/:id', async (req, res) => {
    const token = (req.query.t as string) ?? '';
    if (!marketing || !meta) {
      res.status(503).send(htmlPage('Indisponivel', '<h2>Integracao desativada.</h2>'));
      return;
    }
    const draft = await marketing.validateToken(req.params.id, token);
    if (!draft) {
      res.status(403).send(htmlPage('Erro', '<h2>Link invalido ou expirado.</h2>'));
      return;
    }
    if (draft.status !== 'pending_approval') {
      // Bloqueia aprovar draft ja publicado OU descartado (evita republicar).
      const label = draft.status === 'published' ? 'Ja publicado' : `Status "${draft.status}" — nao pode aprovar`;
      res.send(htmlPage(label, `<h2>${label}.</h2><p>Pode fechar esta aba.</p>`));
      return;
    }
    try {
      const results: Record<string, unknown> = {};
      const errors: Record<string, string> = {};
      const platforms = (draft.platforms as string[]) ?? ['instagram', 'facebook'];
      const isVideo = draft.content_type === 'video' && draft.video_url;
      if (platforms.includes('facebook')) {
        try {
          results.facebook = isVideo
            ? await meta.publishFacebookVideo(draft.video_url, draft.caption)
            : await meta.publishFacebookImage(draft.image_url, draft.caption);
        } catch (err) {
          errors.facebook = (err as Error).message;
          console.error('[marketing] Facebook publish failed:', err);
        }
      }
      if (platforms.includes('instagram')) {
        try {
          results.instagram = isVideo
            ? await meta.publishInstagramReel(draft.video_url, draft.caption)
            : await meta.publishInstagramImage(draft.image_url, draft.caption);
        } catch (err) {
          errors.instagram = (err as Error).message;
          console.error('[marketing] Instagram publish failed:', err);
        }
      }
      const successPlatforms = Object.keys(results);
      const failedPlatforms = Object.keys(errors);
      if (successPlatforms.length === 0) {
        const combined = failedPlatforms.map((p) => `${p}: ${errors[p]}`).join(' | ');
        throw new Error(combined);
      }
      await marketing.markPublished(draft.id, { ...results, errors });
      console.log(`[marketing] Approved draft ${draft.id} (${isVideo ? 'video/Reel' : 'image'}) — success=${successPlatforms.join(',')} failed=${failedPlatforms.join(',') || 'none'}`);
      const successLabel = successPlatforms.map((p) => p === 'instagram' ? 'Instagram' : 'Facebook').join(' e ');
      const failureBlock = failedPlatforms.length > 0
        ? `<p style="color:#c00">⚠️ Mas falhou em ${failedPlatforms.map((p) => p === 'instagram' ? 'Instagram' : 'Facebook').join(' e ')}: ${failedPlatforms.map((p) => errors[p]).join(' | ')}</p>`
        : '';
      res.send(htmlPage(
        'Publicado!',
        `<h2>✅ Post publicado em ${successLabel}!</h2>${failureBlock}<p>Pode fechar esta aba.</p>`,
      ));
    } catch (err) {
      console.error('[marketing] Approve publish failed:', err);
      res.status(500).send(htmlPage('Erro', `<h2>❌ Falhou ao publicar</h2><p>${(err as Error).message}</p>`));
    }
  });

  app.get('/marketing/regenerate/:id', async (req, res) => {
    const token = (req.query.t as string) ?? '';
    if (!marketing) {
      res.status(503).send(htmlPage('Indisponivel', '<h2>Integracao desativada.</h2>'));
      return;
    }
    const draft = await marketing.validateToken(req.params.id, token);
    if (!draft) {
      res.status(403).send(htmlPage('Erro', '<h2>Link invalido ou expirado.</h2>'));
      return;
    }
    // Regenerate in background; send a new WhatsApp when ready
    res.send(htmlPage(
      'Gerando nova imagem',
      '<h2>🔄 Ja estou gerando uma nova imagem.</h2><p>Em menos de 1 minuto chega no seu WhatsApp. Pode fechar esta aba.</p>',
    ));
    (async () => {
      try {
        await marketing.regenerateImage(draft.id);
        await sendDraftToJunior(draft.id);
      } catch (err) {
        console.error('[marketing] Regenerate failed:', err);
      }
    })();
  });

  app.get('/marketing/discard/:id', async (req, res) => {
    const token = (req.query.t as string) ?? '';
    if (!marketing) {
      res.status(503).send(htmlPage('Indisponivel', '<h2>Integracao desativada.</h2>'));
      return;
    }
    const draft = await marketing.validateToken(req.params.id, token);
    if (!draft) {
      res.status(403).send(htmlPage('Erro', '<h2>Link invalido ou expirado.</h2>'));
      return;
    }
    try {
      await marketing.markDiscarded(draft.id);
      console.log(`[marketing] Discarded draft ${draft.id}`);
      res.send(htmlPage('Descartado', '<h2>❌ Rascunho descartado.</h2><p>Pode fechar esta aba.</p>'));
    } catch (err) {
      res.status(500).send(htmlPage('Erro', `<h2>Falhou</h2><p>${(err as Error).message}</p>`));
    }
  });

  // Meta Lead Ads: associa o app a Pagina do Facebook pra receber eventos de
  // leadgen. Usa o Page Access Token ja cacheado pelo MetaService — elimina
  // a necessidade de dar a volta pelo Graph API Explorer manualmente.
  // Chame UMA vez (nao e idempotente-seguro pra chamadas em loop, mas Meta
  // aceita inscricao duplicada sem erro).
  app.post('/meta-leadgen/subscribe-page', async (req, res) => {
    const token = (req.headers['x-webhook-token'] as string)
      ?? (req.query.token as string) ?? '';
    if (!evolution.validateWebhookToken(token)) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    if (!meta || !config.metaFacebookPageId) {
      res.status(503).json({ error: 'Meta integration disabled' });
      return;
    }
    try {
      const pageToken = await meta.getPageAccessToken();
      const url = `https://graph.facebook.com/v21.0/${config.metaFacebookPageId}/subscribed_apps`;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          subscribed_fields: 'leadgen',
          access_token: pageToken,
        }).toString(),
      });
      const data = await r.json() as { success?: boolean; error?: { message: string } };
      if (!r.ok || data.error) {
        res.status(r.status || 500).json({ error: data.error?.message ?? 'unknown' });
        return;
      }
      res.json({ status: 'subscribed', response: data });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Endpoint de TESTE do fluxo Lead Ads: injeta um lead fake direto na
  // pipeline (skip Meta, skip HMAC), gera mensagem proativa em 30-60s.
  // Uso: GET /meta-leadgen/test?token=...&phone=5561987654321&name=Teste&city=Brasilia
  // Util pra validar o fluxo SEM precisar da Testing Tool da Meta funcionar.
  app.get('/meta-leadgen/test', async (req, res) => {
    const token = (req.query.token as string) ?? '';
    if (!evolution.validateWebhookToken(token)) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    if (!metaLeadgen) {
      res.status(503).json({ error: 'Meta leadgen disabled' });
      return;
    }
    const rawPhone = (req.query.phone as string) ?? '';
    const rawName = (req.query.name as string) ?? 'Teste Lead';
    const rawCity = (req.query.city as string) ?? 'Brasilia';
    const phone = normalizeBrazilianPhone(rawPhone);
    if (!phone) {
      res.status(400).json({ error: 'phone invalid. Use format like 5561987654321 or +55 61 98765-4321' });
      return;
    }

    try {
      const fakeDetails = {
        leadgen_id: `test-${Date.now()}`,
        ad_name: 'ANUNCIO DE TESTE - Lead Ads Flow',
        campaign_name: 'TESTE - Ecosunpower',
        form_name: 'Form de Teste',
        field_data: [
          { name: 'full_name', values: [rawName] },
          { name: 'phone_number', values: [phone] },
          { name: 'city', values: [rawCity] },
        ],
      };
      const normalized = metaLeadgen.normalize(fakeDetails, 'instagram');

      const { id: leadId } = await supabase.upsertLead({
        phone: normalized.phone as string,
        name: normalized.name ?? undefined,
        city: normalized.city ?? undefined,
        origin: 'ad_ig_leadform',
      });

      await supabase.getClient()
        .from('leads')
        .update({
          lead_source: 'ad_ig_leadform',
          ad_campaign_id: 'test-campaign',
          ad_id: 'test-ad',
          ad_form_id: 'test-form',
          updated_at: new Date().toISOString(),
        })
        .eq('id', leadId);

      // Delay menor pra facilitar teste (10-30s em vez de 60-180s)
      const delayMs = 10000 + Math.floor(Math.random() * 20000);
      setTimeout(async () => {
        try {
          if (metaWaba) {
            // Mesmo caminho do fluxo real: fora da janela 24h => template aprovado
            const { templateUsado } = await enviarTemplateInicial(
              metaWaba,
              normalized.phone as string,
              normalized.name,
              '_eva_qualificacao_v1',
            );
            await registrarTemplateNaConversa(leadId, templateUsado).catch((err) => {
              console.warn(`[meta-leadgen-test] marcador de conversa falhou:`, (err as Error).message);
            });
            console.log(`[meta-leadgen-test] Template ${templateUsado} enviado pra ${normalized.phone}`);
          } else {
            const welcome = await metaLeadgen.generateWelcome(
              normalized,
              fakeDetails,
              knowledgeBase.getCore(),
            );
            await sendText(normalized.phone as string, welcome);
            console.log(`[meta-leadgen-test] Welcome sent to ${normalized.phone}: "${welcome.slice(0, 80)}..."`);
          }
          await supabase.getClient()
            .from('leads')
            .update({ welcome_sent_at: new Date().toISOString() })
            .eq('id', leadId);
        } catch (err) {
          console.error(`[meta-leadgen-test] Welcome failed:`, (err as Error).message);
        }
      }, delayMs);

      console.log(`[meta-leadgen-test] Fake lead created: ${leadId} (${normalized.phone}), welcome em ${(delayMs / 1000).toFixed(0)}s`);
      res.json({
        status: 'test lead created',
        lead_id: leadId,
        phone: normalized.phone,
        welcome_eta_seconds: Math.round(delayMs / 1000),
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Endpoint de RESGATE: reprocessa um leadgen_id REAL que se perdeu (ex:
  // rede piscou no INSERT e o Meta ja tinha levado 200 — caso Adriana 27/07).
  // Roda o MESMO fluxo do webhook: grava evento -> Graph API -> lead -> CAPI
  // -> template da campanha. Idempotente: evento ja processado responde 409.
  // Uso: GET /meta-leadgen/reprocess?token=...&leadgen_id=1071371745313562
  app.get('/meta-leadgen/reprocess', async (req, res) => {
    const token = (req.query.token as string) ?? '';
    if (!evolution.validateWebhookToken(token)) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    if (!metaLeadgen) {
      res.status(503).json({ error: 'Meta leadgen disabled' });
      return;
    }
    const leadgenId = ((req.query.leadgen_id as string) ?? '').trim();
    if (!/^\d{5,25}$/.test(leadgenId)) {
      res.status(400).json({ error: 'leadgen_id invalido (esperado o numero da central de leads do Meta)' });
      return;
    }

    try {
      // Grava (ou reencontra) o evento. rawPayload marca a origem manual.
      const { isNew } = await metaLeadgen.recordEvent(
        { leadgen_id: leadgenId, field_data: [] },
        { reprocess: true, em: new Date().toISOString() },
      );
      if (!isNew) {
        const evento = await metaLeadgen.buscarEvento(leadgenId);
        if (evento?.processed) {
          res.status(409).json({ status: 'ja_processado', lead_id: evento.lead_id });
          return;
        }
      }
      const resultado = await processarEventoLeadgen(leadgenId);
      console.log(`[meta-leadgen] Reprocesso manual de ${leadgenId}: ${resultado.status}`);
      res.json({ acao: 'reprocessado', ...resultado });
    } catch (err) {
      await metaLeadgen.markEventFailed(leadgenId, (err as Error).message).catch(() => {});
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // GET equivalente pra poder bater direto do navegador (passa ?token=)
  app.get('/meta-leadgen/subscribe-page', async (req, res) => {
    const token = (req.query.token as string) ?? '';
    if (!evolution.validateWebhookToken(token)) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    if (!meta || !config.metaFacebookPageId) {
      res.status(503).json({ error: 'Meta integration disabled' });
      return;
    }
    try {
      const pageToken = await meta.getPageAccessToken();
      const url = `https://graph.facebook.com/v21.0/${config.metaFacebookPageId}/subscribed_apps`;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          subscribed_fields: 'leadgen',
          access_token: pageToken,
        }).toString(),
      });
      const data = await r.json() as { success?: boolean; error?: { message: string } };
      if (!r.ok || data.error) {
        res.status(r.status || 500).json({ error: data.error?.message ?? 'unknown' });
        return;
      }
      res.json({ status: 'subscribed', response: data });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Quick diagnostic: try to send a simple text to ENGINEER_PHONE
  app.post('/marketing/test-whatsapp', async (req, res) => {
    const token = (req.headers['x-webhook-token'] as string)
      ?? (req.query.token as string) ?? '';
    if (!evolution.validateWebhookToken(token)) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    const phone = config.engineerPhone;
    console.log(`[diag] Trying to send test text to ${phone}`);
    try {
      const result = await evolution.sendText(phone, 'Teste do agente de marketing — se chegou, a conexao WhatsApp ta OK.');
      console.log(`[diag] ✓ Test text sent. messageId=${result.messageId}`);
      res.json({ status: 'sent', to: phone, messageId: result.messageId });
    } catch (err) {
      console.error('[diag] Test text failed:', (err as Error).message);
      res.status(500).json({ error: (err as Error).message, to: phone });
    }
  });

  // Manual trigger for the weekly generation (useful for testing without waiting for Monday)
  // Implementacao compartilhada GET/POST pra /marketing/run-weekly
  const runWeeklyHandler = async (req: express.Request, res: express.Response) => {
    const token = (req.headers['x-webhook-token'] as string)
      ?? (req.query.token as string) ?? '';
    if (!evolution.validateWebhookToken(token)) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    if (!marketing) {
      res.status(503).json({ error: 'Marketing disabled' });
      return;
    }
    const ids: string[] = [];
    try {
      // First draft: video (Reel 9:16). Second draft: still image (feed 1:1).
      for (let i = 0; i < 2; i++) {
        const asVideo = i === 0;
        const draft = await marketing.generateDraft(undefined, asVideo);
        ids.push(draft.id);
        await sendDraftToJunior(draft.id);
        await new Promise((r) => setTimeout(r, 15000));
      }
      res.json({ status: 'generated', count: ids.length, ids });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message, ids });
    }
  };
  app.post('/marketing/run-weekly', runWeeklyHandler);
  app.get('/marketing/run-weekly', runWeeklyHandler);

  // Publish an approved draft to FB + IG
  // Reengagement: list pending contacts for manual outreach with personalized messages
  app.get('/reengagement/daily', async (req, res) => {
    const token = (req.headers['x-webhook-token'] as string)
      ?? (req.query.token as string) ?? '';
    if (!evolution.validateWebhookToken(token)) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    const limit = Number(req.query.limit ?? 10);
    const { data, error } = await supabase.getClient()
      .from('leads')
      .select('id, phone, name, energy_data')
      .eq('origin', 'reengagement_manual')
      .order('created_at', { ascending: true })
      .limit(50);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    const pending = (data ?? [])
      .filter((l) => {
        const ed = l.energy_data as Record<string, unknown> | null;
        return !ed?.reengagement_sent_at;
      })
      .slice(0, limit);

    if (pending.length === 0) {
      res.json({ count: 0, items: [] });
      return;
    }

    // Extract top 5 recent headlines from canal-solar.md knowledge base
    const kb = knowledgeBase.getContent();
    const canalSection = kb.match(/# Canal Solar[\s\S]*?(?=\n# |$)/)?.[0] ?? '';
    const headlines = Array.from(canalSection.matchAll(/^## (.+)$/gm))
      .slice(0, 5)
      .map((m) => m[1])
      .join('\n');

    // Ask Claude to generate a personalized message per contact
    const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
    const systemPrompt = `Voce gera mensagens de reengajamento no WhatsApp em nome do Junior (dono da ${empresa().nomeFantasia} Energia Solar, Brasilia/DF e Goias). Publico: pessoas que ja conversaram com ele sobre solar mas nao fecharam.

Regras:
- Tom: amigo reencontrando um amigo. Curto, natural, humano, NUNCA comercial agressivo.
- Sem emoji exagerado. Zero markdown. Zero asteriscos.
- Maximo 4 linhas. Primeira pessoa, como se o Junior tivesse escrito.
- Cada mensagem DEVE ser DIFERENTE (nao repita a mesma estrutura).
- Pode puxar 1 gancho atual do setor solar (da lista de manchetes que vou te passar), mas seja sutil — nao seja didatico.
- Termine abrindo espaco pra conversa, sem pressao.
- NAO prometa "zerar conta". Fale em "reduzir".

Entrada: JSON com { names: string[], headlines: string }
Saida: JSON estrito { messages: string[] } na mesma ordem dos names. Nada alem do JSON.`;

    const userPrompt = JSON.stringify({
      names: pending.map((l) => (l.name ?? '').split(' ')[0] || 'tudo bem'),
      headlines,
    });

    let messages: string[] = [];
    try {
      const aiRes = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });
      const raw = aiRes.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { messages?: string[] };
        if (Array.isArray(parsed.messages)) messages = parsed.messages;
      }
    } catch (err) {
      console.error('[reengagement] Claude generation failed, using fallback:', (err as Error).message);
    }

    // Fallback template if Claude failed
    const fallback = (name: string) =>
      `Oi ${name}, tudo bem? Aqui e o Junior da ${empresa().nomeFantasia}. Faz um tempinho que a gente nao se fala, dei uma olhada nos contatos e lembrei de voce. Queria saber como ta a situacao da conta de luz ai e se tem interesse em dar uma atualizada. Sem compromisso.`;

    const items = pending.map((l, i) => {
      const firstName = (l.name ?? '').split(' ')[0] || 'tudo bem';
      const msg = (messages[i] && messages[i].trim().length > 20) ? messages[i] : fallback(firstName);
      const waLink = `https://wa.me/${normalizeBrazilianPhone(l.phone) ?? l.phone}?text=${encodeURIComponent(msg)}`;
      return {
        id: l.id,
        phone: l.phone,
        name: l.name,
        message: msg,
        wa_link: waLink,
      };
    });

    res.json({ count: items.length, items });
  });

  // Mark a reengagement contact as sent
  app.post('/reengagement/mark-sent/:id', async (req, res) => {
    const token = (req.headers['x-webhook-token'] as string)
      ?? (req.query.token as string) ?? '';
    if (!evolution.validateWebhookToken(token)) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    const { data: existing } = await supabase.getClient()
      .from('leads')
      .select('energy_data')
      .eq('id', req.params.id)
      .single();
    const ed = (existing?.energy_data as Record<string, unknown> | null) ?? {};
    ed.reengagement_sent_at = new Date().toISOString();
    const { error } = await supabase.getClient()
      .from('leads')
      .update({ energy_data: ed, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    // Schedule the 7-touch follow-up cadence (only once per lead)
    await reengagement.scheduleAllTouches(req.params.id);
    res.json({ status: 'marked_sent', id: req.params.id, cadence: 'scheduled' });
  });

  // Post-install: Junior marca que o medidor foi trocado -> inicia cadencia
  // de pedido de avaliacao no Google (dia 0, dia 7, dia 30 pra indicacao).
  app.post('/leads/:id/meter-swapped', async (req, res) => {
    const token = (req.headers['x-webhook-token'] as string)
      ?? (req.query.token as string) ?? '';
    if (!evolution.validateWebhookToken(token)) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    if (!UUID_RE.test(req.params.id)) {
      res.status(400).json({ error: 'Invalid lead id (expected UUID)' });
      return;
    }
    if (!postInstall) {
      res.status(503).json({ error: 'Post-install flow disabled (GOOGLE_REVIEW_URL not set)' });
      return;
    }
    try {
      await postInstall.scheduleOnMeterSwap(req.params.id);
      res.json({ status: 'scheduled', id: req.params.id });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Atualizar installation_status de um lead (contrato_assinado, instalado, etc.)
  // Nao agenda toques — so registra o estado. Use /meter-swapped pra ativar cadencia.
  app.post('/leads/:id/installation-status', async (req, res) => {
    const token = (req.headers['x-webhook-token'] as string)
      ?? (req.query.token as string) ?? '';
    if (!evolution.validateWebhookToken(token)) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    if (!UUID_RE.test(req.params.id)) {
      res.status(400).json({ error: 'Invalid lead id (expected UUID)' });
      return;
    }
    const status = (req.body?.status ?? req.query.status) as string;
    if (!(INSTALLATION_STATUSES as readonly string[]).includes(status)) {
      res.status(400).json({ error: `status invalido. Use um de: ${INSTALLATION_STATUSES.join(', ')}` });
      return;
    }
    const update: Record<string, unknown> = {
      installation_status: status,
      updated_at: new Date().toISOString(),
    };
    if (status === 'contrato_assinado') update.contract_signed_at = new Date().toISOString();
    if (status === 'instalado') update.installed_at = new Date().toISOString();
    if (status === 'medidor_trocado') update.meter_swapped_at = new Date().toISOString();

    const { error } = await supabase.getClient()
      .from('leads')
      .update(update)
      .eq('id', req.params.id);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    // Se marcou medidor_trocado, agenda os toques automaticamente
    if (status === 'medidor_trocado' && postInstall) {
      await postInstall.scheduleOnMeterSwap(req.params.id);
    }
    res.json({ status: 'updated', id: req.params.id, installation_status: status });
  });

  app.post('/marketing/publish/:id', async (req, res) => {
    const token = (req.headers['x-webhook-token'] as string)
      ?? (req.query.token as string) ?? '';
    if (!evolution.validateWebhookToken(token)) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    if (!marketing || !meta) {
      res.status(503).json({ error: 'Marketing/Meta disabled' });
      return;
    }
    try {
      const draft = await marketing.getDraft(req.params.id);
      if (draft.status === 'published') {
        res.status(409).json({ error: 'Draft already published' });
        return;
      }
      const results: Record<string, unknown> = {};
      const errors: Record<string, string> = {};
      const platforms = (draft.platforms as string[]) ?? ['instagram', 'facebook'];
      const isVideo = draft.content_type === 'video' && draft.video_url;
      if (platforms.includes('facebook')) {
        try {
          results.facebook = isVideo
            ? await meta.publishFacebookVideo(draft.video_url, draft.caption)
            : await meta.publishFacebookImage(draft.image_url, draft.caption);
        } catch (err) {
          errors.facebook = (err as Error).message;
          console.error('[marketing] Facebook publish failed:', err);
        }
      }
      if (platforms.includes('instagram')) {
        try {
          results.instagram = isVideo
            ? await meta.publishInstagramReel(draft.video_url, draft.caption)
            : await meta.publishInstagramImage(draft.image_url, draft.caption);
        } catch (err) {
          errors.instagram = (err as Error).message;
          console.error('[marketing] Instagram publish failed:', err);
        }
      }
      const successPlatforms = Object.keys(results);
      const failedPlatforms = Object.keys(errors);
      if (successPlatforms.length === 0) {
        const combined = failedPlatforms.map((p) => `${p}: ${errors[p]}`).join(' | ');
        throw new Error(combined);
      }
      await marketing.markPublished(draft.id, { ...results, errors });
      console.log(`[marketing] Published draft ${draft.id} (${isVideo ? 'video/Reel' : 'image'}) — success=${successPlatforms.join(',')} failed=${failedPlatforms.join(',') || 'none'}`);
      res.json({ status: 'published', results, ...(failedPlatforms.length > 0 ? { errors } : {}) });
    } catch (err) {
      console.error('[marketing] Publish failed:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Gera N imagens on-demand pra criativo de anuncio (FLUX 1.1 Pro).
  // Uso: GET /ad/generate-creative?token=X&prompt=...&aspect=1:1&count=3
  // count default = 1, max = 5. Retorna array de URLs no Supabase Storage.
  // Aspect 1:1 = feed, 9:16 = Reels/Stories, 4:5 = portrait.
  app.get('/ad/generate-creative', async (req, res) => {
    const token = (req.query.token as string) ?? '';
    if (!evolution.validateWebhookToken(token)) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    if (!config.replicateApiToken) {
      res.status(503).json({ error: 'Replicate API not configured' });
      return;
    }
    const validAspects = ['1:1', '4:5', '9:16', '16:9', '3:2', '2:3'] as const;
    const requested = (req.query.aspect as string) ?? '1:1';
    const aspect = (validAspects as readonly string[]).includes(requested) ? requested as typeof validAspects[number] : '1:1';
    const customPrompt = req.query.prompt as string | undefined;
    const countRaw = parseInt((req.query.count as string) ?? '1', 10);
    const count = Math.min(Math.max(isNaN(countRaw) ? 1 : countRaw, 1), 5);
    const defaultPrompt = `Professional photography, magazine quality. Modern luxury Brazilian house in Brasilia (Lago Sul style architecture), white minimalist facade with large windows, beautiful tropical landscaping with native trees, golden hour light. Solar panels visible on the roof, integrated cleanly. Single confident Brazilian man (early 40s, business casual shirt, professional but approachable) standing in front of the house gesturing to the panels with a calm proud expression. Shallow depth of field, cinematic. NO TEXT, no letters, no numbers, no currency symbols, no signage, no watermark, no typography of any kind on the image. Sharp focus on the man, slight bokeh on background.`;
    try {
      const imageGen = new ImageGenerator(config.replicateApiToken);
      const urls: Array<{ url: string; persistent: boolean; warning?: string }> = [];
      for (let i = 0; i < count; i++) {
        const { url } = await imageGen.generate({
          prompt: customPrompt ?? defaultPrompt,
          aspectRatio: aspect,
          outputFormat: 'jpg',
          outputQuality: 95,
        });
        const { bytes, contentType } = await imageGen.downloadImage(url);
        const filename = `ad-${Date.now()}-${i}.jpg`;
        const { error: uploadErr } = await supabase.getClient().storage
          .from('marketing-images')
          .upload(filename, bytes, { contentType, upsert: false });
        if (uploadErr) {
          urls.push({ url, persistent: false, warning: uploadErr.message });
        } else {
          const publicUrl = supabase.getClient().storage
            .from('marketing-images')
            .getPublicUrl(filename).data.publicUrl;
          urls.push({ url: publicUrl, persistent: true });
        }
      }
      res.json({
        count: urls.length,
        aspect,
        prompt_used: customPrompt ?? 'default',
        urls,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Pagina publica de proposta hospedada (Eva Proposta /proposta).
  // Slug urlsafe ~64 bits de entropia (nao enumeravel). TTL 60 dias por padrao.
  // Hosteia HTML interativo do template — resolve a limitacao Drive desktop
  // Rewrite de hostname pra subdominio do dashboard. Quando o request chega
  // em dashboard.ecosunpower.eng.br/<path>, reescreve internamente pra
  // /dashboard/<path>. Resultado: URL fica limpa
  // (ex: dashboard.ecosunpower.eng.br/home em vez de .../dashboard/home),
  // sem precisar duplicar rotas. Aplicado ANTES do app.use('/dashboard').
  app.use((req, _res, next) => {
    const host = (req.hostname ?? '').toLowerCase();
    if (host.startsWith('dashboard.') && !req.url.startsWith('/dashboard')) {
      req.url = '/dashboard' + (req.url === '/' ? '' : req.url);
    }
    next();
  });

  // RH — triagem IA de currículos (Entrega 2): nota+resumo na chegada; nota >=8
  // avisa o Junior no zap. Cron de varredura mais abaixo (junto dos outros crons).
  const rhTriagem = new TriagemService(
    supabase.getClient(),
    new Anthropic({ apiKey: config.anthropicApiKey }),
    (texto) => sendText(config.engineerPhone, texto),
  );

  // RH público (página /trabalhe-conosco do site): vagas abertas + candidatura.
  app.use(criarRhRoutesPublicas(supabase.getClient(), {
    // candidatura nova -> triagem em ~5s (sem segurar a resposta do formulário)
    aposCandidatura: () => setTimeout(() => {
      rhTriagem.triarPendentes(3).catch((err) => console.warn('[rh-triagem] pós-candidatura:', (err as Error).message));
    }, 5000),
  }));

  // Dashboard interno EcoSun (Modulo 3 da plataforma). Auth basica via senha
  // env DASHBOARD_PASSWORD. Rotas: /dashboard/home, /dashboard/propostas,
  // /dashboard/manutencao. Mais paginas serao adicionadas em fases.
  app.use('/dashboard', createDashboardRouter(supabase, monitoringService, {
    metaWabaAccessToken: config.metaWabaAccessToken,
    anthropicApiKey: config.anthropicApiKey,
    sendText,
    proposalAssistant,
    metaService: metaWaba ?? undefined,
    engineerPhone: config.engineerPhone,
    infinitepayHandle: config.infinitepayHandle,
    appBaseUrl: config.appBaseUrl,
    // Salva contrato+procuração no Drive/Workspace (reusa o uploader do fechamento).
    salvarContratoNoDrive: closingDriveUploader
      ? async (input) => {
          const r = await closingDriveUploader!.uploadFechamento({ ...input, ano: String(new Date().getFullYear()) });
          return { folderWebViewLink: r.folderWebViewLink };
        }
      : undefined,
    blogGenerator,
    // Espelha EXATAMENTE o fluxo "publicar" do WhatsApp (linhas ~975-983):
    // markApproved → publishDraftToGitHub(PAT/repo/branch da config) → markPublished.
    // Em falha, markFailed e relança com a mensagem (o router mostra o erro pro Junior).
    publicarDraft: async (draft) => {
      if (!config.githubPat || !config.githubSiteRepo) {
        throw new Error('GitHub não configurado no servidor (env GITHUB_PAT e/ou GITHUB_SITE_REPO).');
      }
      try {
        await blogGenerator.markApproved(draft.id);
        const { url } = await publishDraftToGitHub({
          pat: config.githubPat,
          repo: config.githubSiteRepo,
          branch: config.githubSiteBranch,
          draft,
        });
        await blogGenerator.markPublished(draft.id);
        console.log(`[blog] Junior publicou ${draft.slug} via dashboard. Commit: ${url}`);
        return { url };
      } catch (err) {
        await blogGenerator.markFailed(draft.id, (err as Error).message);
        throw err;
      }
    },
  }));

  // Garante (idempotente) os usuários iniciais do dashboard no boot (admin + comerciais).
  ensureSeed(supabase.getClient()).catch((e) => console.warn('[seed] erro:', (e as Error).message));

  // PDF público da proposta — gera na hora a partir do HTML salvo (sem Drive).
  // URL bonita usada nas mensagens do cliente: /p/<slug>.pdf
  // Compartilha o contador de acessos com a rota web → abordagem dispara 1x só.
  // Registrada ANTES de /p/:slug: nesta rota o ".pdf" é literal e :slug captura
  // só o código (sem o ".pdf"). Mas se /p/:slug viesse primeiro, ela casaria
  // /p/<slug>.pdf capturando "<slug>.pdf" (com ponto) → reprovaria na regex
  // base64url e devolveria 404. Registrar esta primeiro garante o match correto.
  app.get('/p/:slug.pdf', async (req, res) => {
    const slug = String(req.params.slug ?? '');
    if (!/^[A-Za-z0-9_-]{16,32}$/.test(slug)) {
      return res.status(404).type('text/html').send(propostaErrorHtml('not_found'));
    }
    try {
      const result = await supabase.getPropostaPublicaBySlug(slug);
      if (result.status === 'expired') {
        return res.status(410).type('text/html').send(propostaErrorHtml('expired'));
      }
      if (result.status === 'revoked' || result.status === 'not_found') {
        return res.status(404).type('text/html').send(propostaErrorHtml('not_found'));
      }

      const { htmlToPdf } = await import('./modules/proposal/pdf-generator.js');
      const pdf = await htmlToPdf(result.html!, { waitForChartMs: 2000 });

      // Nome de arquivo amigável pro cliente (sanitiza o nome).
      const nomeArq = (result.clienteNome ?? 'Proposta')
        .replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '-') || 'Proposta';
      const filename = `Proposta-EcoSunPower-${nomeArq}.pdf`;

      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Vary', '*');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.type('application/pdf')
        .set('Content-Disposition', `inline; filename="${filename}"`)
        .send(pdf);

      // Preview admin (?eu=<token>): Junior abre o PDF pra conferir sem contar
      // como visualização do cliente nem disparar a abordagem. Igual à rota web.
      const previewToken = config.proposalPreviewToken;
      const queryEu = typeof req.query.eu === 'string' ? req.query.eu : '';
      if (previewToken && queryEu === previewToken) return;

      // Rastreio: mesma trilha da rota web, canal='pdf'. Fire-and-forget.
      const reqIp = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
        ?? req.socket.remoteAddress ?? null;
      const userAgent = (req.headers['user-agent'] as string | undefined) ?? null;
      const referer = (req.headers['referer'] as string | undefined) ?? null;
      supabase.registrarVisualizacaoProposta({
        slug, ipAddress: reqIp, userAgent, isPreview: false, referer, canal: 'pdf',
      });
      supabase.incrementPropostaPublicaAcesso(slug)
        .then((r) => { if (r) proposalFollowup.triggerOnView(slug, r.acessosAntes, 'pdf'); })
        .catch((err) => console.warn('[proposta-pdf] track acesso falhou:', err));
    } catch (err) {
      console.error('[proposta-pdf] erro:', err);
      res.status(500).type('text/html').send(propostaErrorHtml('error'));
    }
  });

  // Pagina publica da proposta (HTML hospedado). Resolve a limitacao do Drive
  // desktop que abre HTML como codigo fonte.
  app.get('/p/:slug', async (req, res) => {
    const slug = String(req.params.slug ?? '');
    // Slug valido = base64url 16-32 chars (gerados sao sempre 16 = 12 bytes/96 bits).
    // Faixa permite migracao futura pra mais entropia sem quebrar URLs antigos.
    // Rejeita cedo pra evitar query desnecessaria com input malformado.
    if (!/^[A-Za-z0-9_-]{16,32}$/.test(slug)) {
      return res.status(404).type('text/html').send(propostaErrorHtml('not_found'));
    }

    try {
      const result = await supabase.getPropostaPublicaBySlug(slug);

      if (result.status === 'expired') {
        return res.status(410).type('text/html').send(propostaErrorHtml('expired'));
      }
      if (result.status === 'revoked' || result.status === 'not_found') {
        return res.status(404).type('text/html').send(propostaErrorHtml('not_found'));
      }

      // Cache desabilitado: proposta tem dados financeiros do cliente.
      // noindex pra nao aparecer em buscadores.
      // CSP + X-Frame-Options bloqueiam clickjacking / iframe embedding.
      // Vary: * pra qualquer CDN/Cloudflare na frente nao cachear (defesa em profundidade).
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Vary', '*');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // Template usa CSS inline + SVG inline (sem JS). Permite data: pra imagens base64.
      // media-src https: necessario pra <video> de proposta personalizada (Supabase signed URL).
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; img-src 'self' data: https:; media-src https:; style-src 'self' 'unsafe-inline'; script-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      );

      // Se proposta personalizada tem video, substitui o bloco do thumbnail por <video> nativo.
      // O template gerou <div data-video-block data-video-url="..."> com img dentro;
      // a gente troca pelo <video controls autoplay muted loop>.
      let html = result.html!;
      if (result.tipo === 'personalizada') {
        try {
          const { data: attachments } = await supabase.getClient()
            .from('proposta_attachments')
            .select('*')
            .eq('proposta_slug', slug)
            .eq('tipo', 'video')
            .limit(1);

          if (attachments && attachments.length > 0) {
            const videoAttach = attachments[0];
            const { data: signed } = await supabase.getClient().storage
              .from('estudos-personalizados')
              .createSignedUrl(videoAttach.storage_path, 60 * 60); // 1h, regen a cada acesso

            if (signed?.signedUrl) {
              const escLegenda = String(videoAttach.legenda).replace(/[<>&"]/g, (c) =>
                ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] ?? c));
              // [ECOSOF] Logo do watermark resolvida em runtime (Storage com
              // fallback embutido EcoSun) pra adicionar sobre o video.
              const { obterLogoBase64 } = await import('./modules/proposal/assets/logo-base64.js');
              const logoWatermark = await obterLogoBase64(supabase.getClient());
              const videoTag = `<div style="position:relative">
  <video controls autoplay muted loop playsinline style="width:100%;border-radius:12px;display:block;background:#000">
    <source src="${signed.signedUrl}" type="video/mp4">
    Seu navegador não suporta vídeo HTML5.
  </video>
  <img src="${logoWatermark}" alt="${escapeHtml(empresa().nomeFantasia)}" style="position:absolute;bottom:50px;right:8px;max-width:14%;max-height:32px;opacity:0.85;filter:drop-shadow(0 1px 4px rgba(0,0,0,0.4));pointer-events:none">
</div>
<p style="text-align:center;font-size:13px;color:#555;font-style:italic;margin-top:10px">🎥 ${escLegenda}</p>`;

              // Substitui o bloco data-video-block inteiro pelo <video>
              html = html.replace(
                /<div data-video-block[^>]*>[\s\S]*?<\/div>\s*<\/div>/,
                videoTag,
              );
            }
          }
        } catch (err) {
          console.warn('[proposta-publica] video swap falhou:', (err as Error).message);
          // segue com HTML original (thumbnail aparece)
        }
      }

      // Preview admin: Junior abre /p/:slug?eu=<token> pra revisar sem
      // contar como visualizacao do cliente. Bypassa increment + followup.
      // Injeta banner amarelo no topo pra evitar Junior mandar essa URL pro
      // cliente por engano (URL com ?eu= teria que ser raspada antes).
      const previewToken = config.proposalPreviewToken;
      const queryEu = typeof req.query.eu === 'string' ? req.query.eu : '';
      const isPreview = !!previewToken && queryEu === previewToken;
      if (isPreview) {
        res.setHeader('X-Preview-Mode', 'admin');
        const previewBanner =
          '<div style="position:fixed;top:0;left:0;right:0;background:#ffc107;color:#000;padding:10px;text-align:center;z-index:99999;font:bold 13px sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.2)">👁️ MODO PREVIEW — esta URL NAO conta como visualizacao. NUNCA mande pro cliente.</div>';
        if (html.includes('</body>')) {
          html = html.replace('</body>', `${previewBanner}</body>`);
        } else {
          html = previewBanner + html;
        }
      }

      res.type('text/html').send(html);

      // Captura metadados pra historico (visualizacoes) — vale tanto pra
      // preview admin (logado como is_preview=true, separado nos KPIs)
      // quanto pra cliente real.
      const reqIp = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
        ?? req.socket.remoteAddress
        ?? null;
      const userAgent = (req.headers['user-agent'] as string | undefined) ?? null;
      const referer = (req.headers['referer'] as string | undefined) ?? null;

      // Registra visualizacao individual (tabela proposta_visualizacoes, fire-and-forget)
      supabase.registrarVisualizacaoProposta({
        slug,
        ipAddress: reqIp,
        userAgent,
        isPreview,
        referer,
      });

      if (isPreview) {
        console.log(`[proposta-publica] preview admin slug=${slug} — registrado, sem followup`);
        return;
      }

      // Tracking fire-and-forget (nao bloqueia resposta).
      // - 1a visualizacao: dispara followup automatico (notifica Junior +
      //   mensagem pro cliente apos 60s).
      // - Re-aberturas: so notifica Junior, com throttle 5min.
      supabase.incrementPropostaPublicaAcesso(slug)
        .then((result) => {
          if (result) {
            proposalFollowup.triggerOnView(slug, result.acessosAntes, 'web');
          }
        })
        .catch((err) => {
          console.warn('[proposta-publica] track acesso falhou:', err);
        });
    } catch (err) {
      console.error('[proposta-publica] erro:', err);
      res.status(500).type('text/html').send(propostaErrorHtml('error'));
    }
  });

  // Pagina publica do Relatorio da Usina (S3). Slug nao-enumeravel, TTL 60d.
  // Regenera HTML fresco a cada acesso (relatorio sempre atualizado).
  // ?pdf=1 -> baixa o PDF. NAO cria slug novo (so consome o existente).
  app.get('/r/:slug', async (req, res) => {
    try {
      const slug = String(req.params.slug ?? '');
      const { resolverRelatorioSlug } = await import('./modules/monitoring/relatorio/resolver.js');
      const r = await resolverRelatorioSlug({ getSlug: (s) => supabase.getRelatorioSlug(s) }, slug);
      if (r.status !== 'ok') {
        return res.status(r.status === 'expirado' ? 410 : 404).type('text/html')
          .send(propostaErrorHtml(r.status === 'expirado' ? 'expired' : 'not_found'));
      }
      const { montarDadosRelatorio } = await import('./modules/monitoring/relatorio/dados.js');
      const { renderRelatorioHtml } = await import('./modules/monitoring/relatorio/template.js');
      // [ECOSOF] Logo resolvida em runtime (Storage com fallback embutido).
      const { obterLogoBase64 } = await import('./modules/proposal/assets/logo-base64.js');
      const logoRelatorio = await obterLogoBase64(supabase.getClient());
      const d = await montarDadosRelatorio(
        { getDetalhe: (id) => monitoringService.getDetalheSistema(id) }, r.sistemaId, 'acompanhamento');
      if ('erro' in d) return res.status(500).type('text/html').send(propostaErrorHtml('error'));
      // [Degustação Sabion 27/07] usina de tenant → relatório com a marca
      // NEUTRA do tenant (sem logo/CNPJ/CTA da EcoSun) também no link público.
      const { resolverMarcaRelatorio } = await import('./modules/monitoring/relatorio/marca.js');
      const sisMarca = await supabase.getSistemaById(r.sistemaId);
      const marca = await resolverMarcaRelatorio(supabase.getClient(), (sisMarca?.company_id as string | null) ?? null);
      if (req.query.pdf === '1') {
        const { htmlToPdf } = await import('./modules/proposal/pdf-generator.js');
        const pdf = await htmlToPdf(renderRelatorioHtml(d, 'acompanhamento', logoRelatorio, marca));
        res.type('application/pdf').set('Content-Disposition', 'inline; filename="relatorio.pdf"').send(pdf);
        return;
      }
      res.type('text/html').send(renderRelatorioHtml(d, 'acompanhamento', logoRelatorio, marca));
    } catch (err) {
      console.error('[relatorio-publico]', err);
      res.status(500).type('text/html').send(propostaErrorHtml('error'));
    }
  });

  // ===== A5 — Relatório Pós-Instalação (rota pública) =====
  // Sem auth — cliente abre via link enviado no WhatsApp.
  // URL pública: https://propostas.ecosunpower.eng.br/r-pi/<slug>
  app.get('/r-pi/:slug', async (req, res) => {
    const slug = String(req.params.slug ?? '');
    if (!/^[a-z0-9]{6,20}$/.test(slug)) return res.status(400).send('Slug inválido');

    const rel = await supabase.getRelatorioPosInstalacaoBySlug(slug);
    if (!rel) return res.status(404).type('text/html').send(`
      <!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Não encontrado</title>
      <style>body{font-family:sans-serif;text-align:center;padding:60px 20px;color:#444}</style></head>
      <body><h1>📋 Relatório não encontrado</h1><p>O link que você acessou pode estar errado ou ter sido removido.</p></body></html>
    `);

    // Resolve view com fotos signed URLs
    const posInstService = new PosInstalacaoService(supabase, async (leadId) => {
      const sistemas = await monitoringService.listarParaDashboard() as any[];
      const s = sistemas.find((x) => x.lead_id === leadId);
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
    const view = await posInstService.resolverView(rel, true);
    if (!view) return res.status(500).send('Erro ao renderizar relatório');

    // Incrementa contador de acesso (best-effort, async sem await)
    supabase.incrementarAcessoRelatorioPI(slug).catch((e) =>
      console.warn('[r-pi] increment failed:', (e as Error).message),
    );

    res.type('text/html').send(renderPosInstalacaoHtml(view));
  });

  // ===== Webhook do Resend (espinha do Elo) =====
  // Sem auth — o Resend chama esse endpoint. Best-effort: NUNCA lanca, sempre
  // responde 200 (senao o Resend fica retentando infinitamente). O body ja
  // vem parseado pelo express.json() global (linha ~5717).
  // TODO (seguranca): validar assinatura svix do Resend antes de confiar no payload.
  app.post('/webhooks/resend', async (req, res) => {
    try {
      const ev = mapResendEvento(req.body);
      if (ev) {
        const mid = (ev.payload as any)?.provider_message_id;
        let leadId: string | null = null;
        if (mid) {
          const { data } = await supabase.getClient()
            .from('email_sequencia')
            .select('lead_id')
            .eq('provider_message_id', mid)
            .limit(1);
          leadId = data?.[0]?.lead_id ?? null;
        }
        await registrarEvento(supabase.getClient(), { ...ev, leadId });
        if (ev.tipo === 'email_descadastro' && leadId) {
          await supabase.cancelEmailSequence(leadId, 'complaint');
        }
        // 🔥 Reacao: abriu/clicou pode ter deixado o lead quente — checa e
        // alerta o admin (best-effort, nunca derruba o 200 do webhook).
        if ((ev.tipo === 'email_aberto' || ev.tipo === 'email_clicado') && leadId) {
          try {
            const { checarLeadQuente } = await import('./modules/email/email-reacao.js');
            const { sendAdminWithButtons } = await import('./modules/eva-admin-buttons.js');
            const { acquireAlertLock } = await import('./modules/eva-alerts.js');
            const lead = await supabase.getLeadById(leadId).catch(() => null);
            await checarLeadQuente({
              client: supabase.getClient(),
              leadId,
              nome: lead?.name ?? 'Lead sem nome',
              adminPhone: config.engineerPhone,
              sendAdminWithButtons,
              metaWaba: metaWaba ?? null,
              sendText,
              acquireAlertLock,
              minAberturas: Number(process.env.EMAIL_HOT_OPENS ?? 3),
            });
          } catch (err) {
            console.warn('[resend-webhook] checarLeadQuente falhou (ignorado):', (err as Error)?.message ?? err);
          }
        }
      }
    } catch (err) {
      console.warn('[resend-webhook] ignorado:', (err as Error)?.message ?? err);
    }
    res.status(200).json({ ok: true });
  });

  // ===== Rota de descadastro de e-mail (espinha do Elo) =====
  // Sem auth — link clicavel direto do e-mail. URL publica: /e/descadastro?lid=<leadId>
  //
  // Importante: o GET NAO MUTA nada — so mostra uma pagina de confirmacao.
  // Scanners de seguranca de e-mail (Outlook Safe Links, Proofpoint etc.)
  // pre-buscam (prefetch) todo link do e-mail automaticamente; se o GET
  // executasse o descadastro, o lead seria descadastrado sem nunca ter
  // clicado. A mutacao real fica no POST, disparado pelo botao "Confirmar".
  // "Ver completo" da campanha (link do preview no zap): renderiza o e-mail
  // inteiro no navegador ANTES de aprovar (regra: aprovar vendo o real). Id é
  // uuid aleatório (não-adivinhável); conteúdo é o e-mail de marketing em si.
  app.get('/e/campanha/:id', async (req, res) => {
    try {
      if (!campanha) { res.status(503).send('Campanha indisponível.'); return; }
      const html = await campanha.visualizar(String(req.params.id));
      res.type('text/html').send(html);
    } catch {
      res.status(404).send('Campanha não encontrada.');
    }
  });

  app.get('/e/descadastro', async (req, res) => {
    const lid = escapeHtml(String(req.query.lid ?? ''));
    res.type('text/html').send(
      '<html><body style="font-family:sans-serif;text-align:center;padding:60px">' +
      '<h2>Quer parar de receber nossos e-mails?</h2>' +
      `<form method="POST" action="/e/descadastro?lid=${lid}">` +
      `<input type="hidden" name="lid" value="${lid}">` +
      '<button type="submit" style="font-size:16px;padding:10px 20px;margin-top:16px;cursor:pointer">Confirmar descadastro</button>' +
      '</form></body></html>',
    );
  });

  app.post('/e/descadastro', async (req, res) => {
    const lid = String((req.body as { lid?: string } | undefined)?.lid ?? req.query.lid ?? '');
    try {
      if (lid) {
        const { data } = await supabase.getClient()
          .from('leads')
          .select('email')
          .eq('id', lid)
          .limit(1);
        const email = data?.[0]?.email;
        if (email) {
          await supabase.registrarDescadastro(email, lid, 'link');
          await supabase.cancelEmailSequence(lid, 'descadastro');
          await registrarEvento(supabase.getClient(), {
            tipo: 'email_descadastro',
            leadId: lid,
            canal: 'email',
            origem: 'link',
          });
        }
      }
    } catch (err) {
      console.warn('[descadastro] ignorado:', (err as Error)?.message ?? err);
    }
    res.type('text/html').send(
      '<html><body style="font-family:sans-serif;text-align:center;padding:60px">' +
      '<h2>Pronto!</h2><p>Você não receberá mais nossos e-mails. 💚</p></body></html>',
    );
  });

  // ===== Portinha da espinha do Elo pra casas em OUTROS repos =====
  // Site e Calculadora moram em repositorios separados; aqui eles mandam
  // bilhete pro Elo por HTTP (fetch best-effort do lado deles). Token simples
  // (ELO_INGEST_TOKEN) — sem token configurado a rota fica FECHADA (nao vira
  // porta aberta). Best-effort: sempre 200, aceita so tipos 'site:*' e
  // 'calculadora:*' pra portinha nao virar canal pra qualquer coisa.
  app.post('/elo/evento', async (req, res) => {
    const token = (req.headers['x-webhook-token'] as string) ?? (req.query.token as string) ?? '';
    const esperado = process.env.ELO_INGEST_TOKEN ?? '';
    if (!esperado || token !== esperado) {
      res.status(401).json({ error: 'invalid token' });
      return;
    }
    try {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const tipo = typeof b.tipo === 'string' ? b.tipo.slice(0, 80) : '';
      if (!tipo || !/^(site|calculadora):[a-z_]+$/.test(tipo)) {
        res.status(200).json({ ok: false, ignored: true });
        return;
      }
      const departamento = tipo.startsWith('calculadora') ? 'comercial' : 'marketing';
      await registrarEvento(supabase.getClient(), {
        tipo,
        departamento,
        canal: 'web',
        origem: tipo.split(':')[0],
        payload:
          b.payload && typeof b.payload === 'object' ? (b.payload as Record<string, unknown>) : {},
      });
    } catch (err) {
      console.warn('[elo/evento] ignorado:', (err as Error)?.message ?? err);
    }
    res.status(200).json({ ok: true });
  });

  // ===== Batida de uso (heartbeat) — o Elo sabe QUEM usa O QUÊ e por QUANTO tempo =====
  // Ferramentas externas (calculadora, etc.) mandam uma batida por minuto enquanto
  // estao em uso. Mesma trava do /elo/evento (ELO_INGEST_TOKEN). Best-effort (200).
  // Grava via RPC atomica elo_uso_bump (1 linha por ferramenta/usuario/dia; batidas ~ min).
  app.post('/elo/uso', async (req, res) => {
    const token = (req.headers['x-webhook-token'] as string) ?? (req.query.token as string) ?? '';
    const esperado = process.env.ELO_INGEST_TOKEN ?? '';
    if (!esperado || token !== esperado) {
      res.status(401).json({ error: 'invalid token' });
      return;
    }
    try {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const ferramenta = typeof b.ferramenta === 'string' ? b.ferramenta.slice(0, 40) : '';
      if (!ferramenta || !/^[a-z_]+$/.test(ferramenta)) {
        res.status(200).json({ ok: false, ignored: true });
        return;
      }
      const usuario = typeof b.usuario === 'string' ? b.usuario.slice(0, 120) : null;
      const userId = typeof b.userId === 'string' ? b.userId.slice(0, 80) : null;
      const dia = new Date().toISOString().slice(0, 10); // yyyy-mm-dd (UTC)
      await supabase.getClient().rpc('elo_uso_bump', {
        p_ferramenta: ferramenta,
        p_usuario: usuario,
        p_user_id: userId,
        p_dia: dia,
      });
    } catch (err) {
      console.warn('[elo/uso] ignorado:', (err as Error)?.message ?? err);
    }
    res.status(200).json({ ok: true });
  });

  // Pagina publica de Politica de Privacidade pra uso nos Lead Ads da Meta.
  // LGPD (Lei 13.709/2018) exige transparencia sobre coleta/uso de dados.
  // URL publica: /privacidade (usar no campo do Meta Lead Form)
  app.get('/privacidade', (_req, res) => {
    const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Politica de Privacidade — ${escapeHtml(empresa().nomeFantasia)} Energia Solar</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 760px; margin: 0 auto; padding: clamp(20px,5vw,40px); line-height: 1.6; color: #222; }
h1 { font-size: clamp(24px,5vw,32px); margin-top: 0; }
h2 { font-size: clamp(18px,3vw,22px); margin-top: 28px; color: #1a1a1a; border-bottom: 1px solid #e5e5e5; padding-bottom: 6px; }
.meta { color: #666; font-size: 14px; margin-bottom: 24px; }
ul { padding-left: 20px; }
li { margin-bottom: 6px; }
a { color: #d97706; }
.highlight { background: #fef3c7; padding: 2px 6px; border-radius: 3px; }
footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e5e5; font-size: 14px; color: #666; }
</style>
</head>
<body>
<h1>Politica de Privacidade</h1>
<p class="meta"><strong>${escapeHtml(empresa().razaoSocial)}</strong><br>
CNPJ: ${escapeHtml(empresa().cnpj)}<br>
${escapeHtml(empresa().endereco)}, ${escapeHtml(empresa().cidade)} - ${escapeHtml(empresa().uf)}${empresa().cep ? `, CEP ${escapeHtml(empresa().cep)}` : ''}<br>
Ultima atualizacao: 26 de abril de 2026</p>

<h2>1. Quem somos</h2>
<p>A ${escapeHtml(empresa().razaoSocial)} (CNPJ ${escapeHtml(empresa().cnpj)}) e ${escapeHtml(empresa().descricaoCurta)}, com foco principal em solar fotovoltaica. Nos comprometemos com a protecao dos seus dados pessoais, em conformidade com a Lei Geral de Protecao de Dados (Lei 13.709/2018 - LGPD).</p>

<h2>1.1 Encarregado de Protecao de Dados (DPO)</h2>
<p>Conforme art. 41 da LGPD, indicamos como Encarregado:</p>
<ul>
  <li><strong>Nome:</strong> Junior Candido Rodrigues</li>
  <li><strong>Email:</strong> <a href="mailto:${escapeHtml(empresa().email)}">${escapeHtml(empresa().email)}</a></li>
  <li><strong>WhatsApp:</strong> +55 61 99880-5002</li>
</ul>
<p>Use os contatos acima pra exercer seus direitos como titular dos dados, tirar duvidas ou comunicar incidentes.</p>

<h2>2. Quais dados coletamos</h2>
<p>Quando voce interage conosco (formulario no Instagram/Facebook, mensagem no WhatsApp, site), coletamos apenas os dados necessarios para oferecer um atendimento personalizado:</p>
<ul>
  <li><strong>Dados de identificacao:</strong> nome, e-mail, telefone</li>
  <li><strong>Dados de qualificacao tecnica:</strong> cidade, valor aproximado da conta de luz, tipo de imovel, tipo de telhado</li>
  <li><strong>Dados de conversa:</strong> mensagens trocadas pelo WhatsApp, audios, imagens (ex: foto da conta de luz)</li>
  <li><strong>Dados tecnicos:</strong> metadados das suas mensagens (horario, origem)</li>
</ul>

<h2>3. Por que coletamos</h2>
<ul>
  <li>Entender sua necessidade e elaborar proposta tecnica personalizada</li>
  <li>Manter historico de atendimento para continuidade</li>
  <li>Enviar informacoes relevantes sobre energia solar, agendamento de visita tecnica e acompanhamento pos-venda</li>
  <li>Cumprir obrigacoes legais (fiscais, contratuais)</li>
</ul>

<h2>4. Base legal</h2>
<p>Coletamos e tratamos seus dados com base em:</p>
<ul>
  <li><strong>Consentimento</strong> explicito ao preencher formulario ou iniciar conversa conosco</li>
  <li><strong>Execucao de contrato</strong> quando voce contrata nossos servicos</li>
  <li><strong>Legitimo interesse</strong> para melhorar o atendimento e responder suas solicitacoes</li>
</ul>

<h2>5. Com quem compartilhamos (Operadores LGPD)</h2>
<p><strong>Nao vendemos seus dados.</strong> Compartilhamos apenas com operadores estritamente necessarios pra prestar o servico, todos sob contrato e obrigacoes LGPD:</p>
<ul>
  <li><strong>Anthropic, Inc.</strong> (EUA) — processamento de linguagem natural pela IA Eva (Claude API)</li>
  <li><strong>Supabase Inc.</strong> (EUA) — banco de dados pra leads e historico de conversas</li>
  <li><strong>Meta Platforms</strong> (BR/EUA) — WhatsApp Business e Lead Ads (<a href="https://www.facebook.com/privacy/policy" target="_blank">politica Meta</a>)</li>
  <li><strong>Google LLC</strong> (EUA/BR) — Workspace (email corporativo) e Google Calendar</li>
  <li><strong>Cloudflare Inc.</strong> (EUA) — hospedagem do site e CDN</li>
  <li><strong>Equipe interna</strong> — Responsavel Tecnico, instaladores, atendimento</li>
  <li><strong>Parceiros de equipamentos</strong> — distribuidores quando necessario pra cotacao (apenas dados estritamente necessarios)</li>
  <li><strong>Autoridades legais</strong> — quando obrigados por lei (ANEEL, CREA, CFT, Receita Federal, ordem judicial)</li>
</ul>
<p>Algumas transferencias ocorrem pra fora do Brasil (EUA), em conformidade com art. 33 da LGPD, com clausulas contratuais padrao e nivel de protecao equivalente.</p>

<h2>6. Por quanto tempo guardamos</h2>
<p>Mantemos seus dados pelo periodo necessario para:</p>
<ul>
  <li>Continuidade do atendimento (enquanto a relacao comercial estiver ativa)</li>
  <li>Cumprimento de obrigacoes legais (5 anos apos a ultima interacao, conforme legislacao fiscal)</li>
  <li>Manutencao de historico tecnico para suporte pos-instalacao (durante a vida util do sistema)</li>
</ul>
<p>Voce pode solicitar a exclusao dos seus dados a qualquer momento — veja secao 8.</p>

<h2>7. Seguranca</h2>
<p>Adotamos medidas tecnicas e organizacionais razoaveis para proteger seus dados: criptografia em transito, controle de acesso, autenticacao segura, e armazenamento em provedores reconhecidos (Supabase, nuvens AWS-compativeis).</p>

<h2>8. Seus direitos sob a LGPD</h2>
<p>Voce tem direito a qualquer momento a:</p>
<ul>
  <li>Confirmar se tratamos seus dados</li>
  <li>Acessar os dados que temos sobre voce</li>
  <li>Corrigir dados incompletos, inexatos ou desatualizados</li>
  <li>Solicitar a <span class="highlight">exclusao dos seus dados</span></li>
  <li>Solicitar a portabilidade dos seus dados</li>
  <li>Revogar o consentimento a qualquer momento</li>
  <li>Solicitar informacoes sobre com quem compartilhamos seus dados</li>
</ul>

<h2>9. Como exercer seus direitos</h2>
<p>Para qualquer solicitacao relacionada aos seus dados, entre em contato:</p>
<ul>
  <li><strong>E-mail:</strong> <a href="mailto:${escapeHtml(empresa().email)}">${escapeHtml(empresa().email)}</a></li>
  <li><strong>WhatsApp:</strong> nos envie uma mensagem pedindo a acao desejada ("quero apagar meus dados", "quero sair da lista")</li>
</ul>
<p>Respondemos em ate 15 dias uteis.</p>

<h2>10. Cookies e tecnologias similares</h2>
<p>Nosso site institucional pode usar cookies tecnicos para funcionamento basico. Nao utilizamos cookies de rastreamento publicitario sem o seu consentimento.</p>

<h2>11. Menores de idade</h2>
<p>Nossos servicos sao destinados a maiores de 18 anos. Nao coletamos dados de menores de idade conscientemente.</p>

<h2>12. Alteracoes nesta politica</h2>
<p>Esta politica pode ser atualizada periodicamente. A data da ultima atualizacao sempre estara no topo. Alteracoes relevantes serao comunicadas pelos canais que voce ja interage conosco.</p>

<footer>
<p>${escapeHtml(empresa().nomeFantasia)} Energia Solar — ${escapeHtml(empresa().cidade)}/${escapeHtml(empresa().uf)}<br>
Contato: <a href="mailto:${escapeHtml(empresa().email)}">${escapeHtml(empresa().email)}</a></p>
</footer>
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  // Pagina publica de Termos de Uso pra atender requisito do App Review da Meta.
  // Junto com /privacidade, eh o minimo legal pra publicar app que usa permissoes
  // sensiveis (leads_retrieval, pages_manage_metadata).
  // URL publica: /termos
  app.get('/termos', (_req, res) => {
    const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Termos de Uso — ${escapeHtml(empresa().nomeFantasia)} Energia Solar</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 760px; margin: 0 auto; padding: clamp(20px,5vw,40px); line-height: 1.6; color: #222; }
h1 { font-size: clamp(24px,5vw,32px); margin-top: 0; }
h2 { font-size: clamp(18px,3vw,22px); margin-top: 28px; color: #1a1a1a; border-bottom: 1px solid #e5e5e5; padding-bottom: 6px; }
.meta { color: #666; font-size: 14px; margin-bottom: 24px; }
ul { padding-left: 20px; }
li { margin-bottom: 6px; }
a { color: #d97706; }
footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e5e5; font-size: 14px; color: #666; }
</style>
</head>
<body>
<h1>Termos de Uso</h1>
<p class="meta"><strong>${escapeHtml(empresa().nomeFantasia)} Energia Solar</strong><br>
${escapeHtml(empresa().endereco)}, ${escapeHtml(empresa().cidade)} - ${escapeHtml(empresa().uf)}${empresa().cep ? `, CEP ${escapeHtml(empresa().cep)}` : ''}<br>
CNPJ: ${escapeHtml(empresa().cnpj)} | Email: <a href="mailto:${escapeHtml(empresa().email)}">${escapeHtml(empresa().email)}</a><br>
Atualizado em: 22 de abril de 2026</p>

<h2>1. Aceitacao dos Termos</h2>
<p>Ao interagir com a ${escapeHtml(empresa().nomeFantasia)} Energia Solar atraves de qualquer um de nossos canais digitais (formularios de anuncios Meta, WhatsApp, Instagram, Facebook ou nosso site), voce concorda integralmente com estes Termos de Uso e com nossa <a href="/privacidade">Politica de Privacidade</a>. Caso nao concorde, por favor nao utilize nossos canais.</p>

<h2>2. Sobre nos</h2>
<p>A ${escapeHtml(empresa().nomeFantasia)} Energia Solar e uma empresa de engenharia de geracao de energia solar fotovoltaica, atuante em ${escapeHtml(empresa().regiaoAtuacao)}. Atuamos no projeto, dimensionamento, fornecimento e instalacao de sistemas de energia solar conectados a rede e em sistemas com armazenamento (baterias), bem como em servicos de manutencao, consultoria em eficiencia energetica e migracao para o mercado livre de energia.</p>

<h2>3. Servicos oferecidos</h2>
<p>Atraves de nossos canais digitais, oferecemos:</p>
<ul>
  <li>Atendimento comercial e tecnico para projetos de energia solar fotovoltaica</li>
  <li>Calculo de payback, simulacao de geracao e analise da sua conta de luz</li>
  <li>Visita tecnica para vistoria do imovel e elaboracao de proposta personalizada</li>
  <li>Instalacao, comissionamento e legalizacao do sistema na concessionaria</li>
  <li>Suporte pos-instalacao, manutencao e ampliacao de sistemas existentes</li>
  <li>Solucoes de armazenamento (baterias) e migracao para mercado livre</li>
  <li>Conteudo informativo sobre o setor de energia (sazonalidade, regulacao, mercado)</li>
</ul>

<h2>4. Uso autorizado</h2>
<p>Voce concorda em utilizar nossos canais de forma licita e respeitosa. E proibido:</p>
<ul>
  <li>Enviar conteudo ofensivo, discriminatorio, ilegal, falso ou enganoso</li>
  <li>Tentar invadir, hackear ou interferir no funcionamento dos nossos sistemas</li>
  <li>Usar nossos canais para spam, fraude ou disseminar virus/malware</li>
  <li>Personificar terceiros ou prestar informacoes falsas sobre identidade</li>
  <li>Reproduzir, copiar ou redistribuir conteudo da empresa sem autorizacao</li>
</ul>

<h2>5. Atendimento por inteligencia artificial</h2>
<p>Para agilizar o primeiro atendimento e qualificacao de leads, utilizamos um agente conversacional baseado em inteligencia artificial chamado "${escapeHtml(empresa().nomeAtendente)}", que opera atraves de WhatsApp. ${escapeHtml(empresa().nomeAtendente)} eh treinada com nossa base de conhecimento tecnico e atua como consultora especialista virtual da empresa.</p>
<p>Voce sera sempre informado quando estiver conversando com ${escapeHtml(empresa().nomeAtendente)}. Caso prefira atendimento exclusivamente humano, basta solicitar a qualquer momento e o Responsavel Tecnico da ${escapeHtml(empresa().nomeFantasia)} assumira a conversa.</p>
<p>As respostas geradas pela ${escapeHtml(empresa().nomeAtendente)} tem carater consultivo inicial e devem ser sempre validadas com nossa equipe tecnica para projetos definitivos. A ${escapeHtml(empresa().nomeFantasia)} nao se responsabiliza por decisoes tomadas exclusivamente com base em respostas automatizadas sem confirmacao posterior.</p>

<h2>6. Anuncios e captura de leads</h2>
<p>Veiculamos anuncios em plataformas Meta (Facebook e Instagram) com formularios de geracao de leads. Ao preencher um formulario, voce autoriza:</p>
<ul>
  <li>O recebimento dos seus dados (nome, telefone, email e respostas do formulario) pela nossa equipe de atendimento</li>
  <li>O contato comercial via WhatsApp, telefone ou email para apresentar nossas solucoes e dar continuidade ao seu interesse</li>
  <li>O processamento desses dados conforme nossa <a href="/privacidade">Politica de Privacidade</a> e a Lei Geral de Protecao de Dados (LGPD - Lei 13.709/2018)</li>
</ul>
<p>Voce pode solicitar o cancelamento do contato e a exclusao dos seus dados a qualquer momento pelo email <a href="mailto:${escapeHtml(empresa().email)}">${escapeHtml(empresa().email)}</a>.</p>

<h2>7. Propostas e orcamentos</h2>
<p>Propostas e orcamentos enviados sao informacoes preliminares baseadas nas informacoes que voce nos forneceu. O orcamento final, valor da instalacao e prazo de execucao dependem de visita tecnica presencial, condicoes do imovel e disponibilidade de equipamentos no momento do fechamento. Propostas tem validade conforme indicado no proprio documento (geralmente 15 a 30 dias).</p>

<h2>8. Garantias</h2>
<p>Os equipamentos e servicos fornecidos pela ${escapeHtml(empresa().nomeFantasia)} seguem as garantias dos fabricantes (geralmente 12 a 30 anos para modulos fotovoltaicos e 5 a 12 anos para inversores) e a garantia legal aplicavel a servicos no Brasil (90 dias conforme Codigo de Defesa do Consumidor). Detalhes especificos de garantia sao informados no contrato de cada projeto.</p>

<h2>9. Marcas premium e proibicoes internas</h2>
<p>Trabalhamos exclusivamente com marcas premium homologadas pela INMETRO/ANEEL. ${escapeHtml(listaMarcasTexto(empresa()))} Pedidos de cotacao com marcas nao homologadas serao redirecionados para opcoes equivalentes da nossa linha.</p>

<h2>10. Limitacao de responsabilidade</h2>
<p>A ${escapeHtml(empresa().nomeFantasia)} trabalha com diligencia para fornecer informacoes corretas e atualizadas, porem nao se responsabiliza por:</p>
<ul>
  <li>Variacoes na tarifa de energia eletrica que afetem o calculo de payback estimado</li>
  <li>Condicoes climaticas atipicas que impactem a geracao real do sistema</li>
  <li>Mudancas regulatorias futuras (ANEEL, Lei 14.300, etc) que impactem o modelo de compensacao</li>
  <li>Interrupcoes de servico de terceiros (concessionaria, internet, plataformas Meta/Google)</li>
  <li>Decisoes tomadas exclusivamente com base em respostas automatizadas sem confirmacao da equipe tecnica</li>
</ul>

<h2>11. Modificacoes nestes Termos</h2>
<p>Estes Termos podem ser atualizados periodicamente para refletir mudancas em nossos servicos ou na legislacao. A data da ultima atualizacao sempre estara no topo desta pagina. Mudancas relevantes serao comunicadas pelos canais que voce ja interage conosco.</p>

<h2>12. Foro e legislacao aplicavel</h2>
<p>Estes Termos sao regidos pelas leis da Republica Federativa do Brasil. Fica eleito o foro da Comarca de Brasilia-DF para dirimir qualquer controversia decorrente da aplicacao destes Termos, com renuncia expressa a qualquer outro, por mais privilegiado que seja.</p>

<h2>13. Contato</h2>
<p>Duvidas sobre estes Termos ou sobre nossos servicos:</p>
<ul>
  <li>Email: <a href="mailto:${escapeHtml(empresa().email)}">${escapeHtml(empresa().email)}</a></li>
  <li>WhatsApp: vide canais oficiais nas redes sociais ${escapeHtml(empresa().nomeFantasia)}</li>
  <li>Endereco: ${escapeHtml(empresa().endereco)}, ${escapeHtml(empresa().cidade)} - ${escapeHtml(empresa().uf)}</li>
</ul>

<footer>
<p>${escapeHtml(empresa().nomeFantasia)} Energia Solar — ${escapeHtml(empresa().cidade)}/${escapeHtml(empresa().uf)}<br>
Contato: <a href="mailto:${escapeHtml(empresa().email)}">${escapeHtml(empresa().email)}</a><br>
Veja tambem: <a href="/privacidade">Politica de Privacidade</a></p>
</footer>
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  // Pagina publica de Instrucoes de Exclusao de Dados pra atender requisito
  // do App Review da Meta (User Data Deletion Instructions URL). LGPD art. 18
  // garante direito de exclusao; Meta exige instrucao publica de como exercer.
  // URL publica: /exclusao-dados
  app.get('/exclusao-dados', (_req, res) => {
    const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Exclusao de Dados — ${escapeHtml(empresa().nomeFantasia)} Energia Solar</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 760px; margin: 0 auto; padding: clamp(20px,5vw,40px); line-height: 1.6; color: #222; }
h1 { font-size: clamp(24px,5vw,32px); margin-top: 0; }
h2 { font-size: clamp(18px,4vw,22px); margin-top: 32px; color: #f59e0b; }
a { color: #f59e0b; }
footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #eee; font-size: 14px; color: #666; }
ol { padding-left: 22px; }
li { margin-bottom: 8px; }
.box { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 16px 20px; margin: 24px 0; border-radius: 4px; }
</style>
</head>
<body>
<h1>Instrucoes para Exclusao dos Seus Dados</h1>
<p><strong>Ultima atualizacao:</strong> 10 de maio de 2026</p>

<p>A ${escapeHtml(empresa().razaoSocial)} (CNPJ ${escapeHtml(empresa().cnpj)}) respeita seu direito
de solicitar a exclusao dos dados pessoais que mantemos sobre voce, conforme
garantido pela <strong>Lei Geral de Protecao de Dados (LGPD, Lei 13.709/2018, art. 18, VI)</strong>.
Esta pagina explica como exercer esse direito.</p>

<h2>1. Quais dados podemos manter sobre voce</h2>
<ul>
  <li>Nome, telefone e email fornecidos em formularios de leads (anuncios Meta, site, WhatsApp)</li>
  <li>Historico de conversas com nossa consultora Eva via WhatsApp</li>
  <li>Endereco e dados de consumo eletrico (kWh, valor da conta) para dimensionamento de propostas</li>
  <li>Fotos do local enviadas voluntariamente para estudo personalizado</li>
  <li>Propostas comerciais geradas e historico de interacoes</li>
</ul>

<h2>2. Como solicitar a exclusao</h2>
<p>Voce pode solicitar a exclusao integral dos seus dados por <strong>qualquer um</strong>
dos canais abaixo. Nao cobramos pela solicitacao.</p>

<div class="box">
  <strong>Canal preferencial — Email:</strong><br>
  Envie email para <a href="mailto:${escapeHtml(empresa().email)}">${escapeHtml(empresa().email)}</a>
  com o assunto <strong>"Exclusao de Dados LGPD"</strong> e informe:
  <ol>
    <li>Nome completo</li>
    <li>Telefone usado no contato (com DDD)</li>
    <li>Email (se aplicavel)</li>
  </ol>
</div>

<div class="box">
  <strong>Canal alternativo — WhatsApp:</strong><br>
  Envie mensagem para <strong>+55 61 99697-8781</strong> com o texto
  <em>"Solicito exclusao dos meus dados conforme LGPD"</em>. Nossa assistente
  encaminhara para o responsavel.
</div>

<h2>3. Prazo de resposta</h2>
<p>Confirmaremos o recebimento em ate <strong>2 dias uteis</strong> e
concluiremos a exclusao em ate <strong>15 dias uteis</strong>, conforme prazo
recomendado pela ANPD (Autoridade Nacional de Protecao de Dados).</p>

<h2>4. O que sera excluido</h2>
<ul>
  <li>Todos os dados de identificacao (nome, telefone, email, endereco)</li>
  <li>Historico de conversas no WhatsApp</li>
  <li>Fotos enviadas para estudo</li>
  <li>Dados de consumo e propostas comerciais nao convertidas</li>
</ul>

<h2>5. O que nao podemos excluir</h2>
<p>Por exigencia legal, alguns dados sao mantidos mesmo apos solicitacao de
exclusao:</p>
<ul>
  <li><strong>Notas fiscais e contratos de clientes ativos:</strong> 5 anos (Codigo Tributario, art. 174)</li>
  <li><strong>Dados financeiros de pagamentos:</strong> 5 anos (legislacao fiscal)</li>
  <li><strong>Logs de seguranca e acesso:</strong> 6 meses (Marco Civil da Internet, art. 15)</li>
</ul>
<p>Esses dados ficam restritos ao cumprimento das obrigacoes legais e nao sao
usados para qualquer outra finalidade.</p>

<h2>6. Confirmacao da exclusao</h2>
<p>Apos concluida, voce recebera confirmacao por email (ou WhatsApp, se preferir)
com a data e o escopo do que foi excluido.</p>

<h2>7. Outros direitos LGPD</h2>
<p>Alem da exclusao, voce tambem pode solicitar:</p>
<ul>
  <li>Acesso aos seus dados (saber o que mantemos)</li>
  <li>Correcao de dados incompletos ou desatualizados</li>
  <li>Portabilidade dos dados</li>
  <li>Revogacao do consentimento</li>
</ul>
<p>Use os mesmos canais acima.</p>

<h2>8. Encarregado pela Protecao de Dados</h2>
<p>Junior Rodrigues — Responsavel Tecnico CREA/CFT<br>
Email: <a href="mailto:${escapeHtml(empresa().email)}">${escapeHtml(empresa().email)}</a></p>

<footer>
<p>${escapeHtml(empresa().razaoSocial)} — CNPJ ${escapeHtml(empresa().cnpj)}<br>
${escapeHtml(empresa().endereco)}, ${escapeHtml(empresa().cidade)} - ${escapeHtml(empresa().uf)}<br>
Veja tambem: <a href="/privacidade">Politica de Privacidade</a> | <a href="/termos">Termos de Uso</a></p>
</footer>
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  // Health check
  app.get('/health', async (_req, res) => {
    const status = await buildHealthStatus({
      redis: () => queue.isHealthy(),
      supabase: async () => {
        try {
          await supabase.logEvent('debug', 'health', 'health check ping');
          return true;
        } catch {
          return false;
        }
      },
      evolution: async () => {
        try {
          const response = await fetch(`${config.evolutionApiUrl}/instance/fetchInstances`, {
            headers: { apikey: config.evolutionApiKey },
          });
          return response.ok;
        } catch {
          return false;
        }
      },
    });

    const httpStatus = status.status === 'unhealthy' ? 503 : 200;
    res.status(httpStatus).json(status);
  });

  // EVA_PASSIVE_MODE: quando true, desliga TODOS os schedulers de outbound
  // (followup, maintenance intros, maintenance reminders, cadence). Eva so
  // responde mensagens recebidas. Usar enquanto WhatsApp estiver restrito ou
  // antes da migracao pra WABA Cloud API. Setar no Easypanel: EVA_PASSIVE_MODE=true
  const passiveMode = (process.env.EVA_PASSIVE_MODE || '').toLowerCase() === 'true';
  if (passiveMode) {
    console.log('[eva] 🔇 PASSIVE MODE ATIVO — schedulers de outbound DESLIGADOS (followup/maintenance/cadence).');
    console.log('[eva] Eva so vai responder mensagens recebidas. Pra reativar: EVA_PASSIVE_MODE=false no Easypanel + restart.');
  }

  // Follow-up timer (runs every hour)
  if (!isSandbox && !passiveMode) {
    setInterval(async () => {
      console.log('[followup] Running scheduled follow-up check...');
      await followup.processFollowups();
    }, 60 * 60 * 1000); // Every 1 hour

    // Run first check 5 minutes after startup
    setTimeout(() => followup.processFollowups(), 5 * 60 * 1000);
    console.log('[followup] Follow-up scheduler started (checks every 1 hour)');
  }

  // Outbound schedulers (gated by passiveMode)
  if (!isSandbox && !passiveMode) {

    // Eva intro pendente (delay 2h apos /eva on): checa a cada 2 minutos
    setInterval(async () => {
      const sent = await maintenance.processIntros().catch((err) => {
        console.error('[maintenance] processIntros error:', (err as Error).message);
        return 0;
      });
      if (sent > 0) console.log(`[maintenance] ${sent} intros Eva enviadas`);
    }, 2 * 60 * 1000);
    console.log('[maintenance] Intro scheduler started (checks every 2 min)');

    // Lembretes de manutencao (maio e agosto): roda 1x por dia.
    // Janela: das 9h BRT em diante. Idempotente via flag 'maintenance_last_run'
    // no app_flags (data ISO YYYY-MM-DD). Se restart pular as 9h, recupera depois.
    const checkMaintenanceDaily = async () => {
      const now = new Date();
      const brtHour = (now.getUTCHours() - 3 + 24) % 24;
      if (brtHour < 9) return;

      const today = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const { data: flag } = await supabase.getClient()
        .from('app_flags')
        .select('value')
        .eq('key', 'maintenance_last_run')
        .maybeSingle();

      if (flag?.value === today) return; // ja rodou hoje

      // Trava ANTES de rodar pra evitar double-run em caso de restart concorrente.
      const { error: lockErr } = await supabase.getClient()
        .from('app_flags')
        .upsert({ key: 'maintenance_last_run', value: today }, { onConflict: 'key' });
      if (lockErr) {
        console.warn('[maintenance] Failed to lock daily flag:', lockErr.message);
        return;
      }

      const sent = await maintenance.processMaintenanceReminders().catch((err) => {
        console.error('[maintenance] processReminders error:', (err as Error).message);
        return 0;
      });
      if (sent > 0) console.log(`[maintenance] ${sent} lembretes de limpeza enviados (data ${today})`);
    };
    setInterval(checkMaintenanceDaily, 60 * 60 * 1000); // checa a cada hora
    setTimeout(checkMaintenanceDaily, 5 * 60 * 1000);   // roda 5min apos start
    console.log('[maintenance] Reminder scheduler started (1x/day apos 9h BRT, idempotente)');

    // Cadencia de reengajamento: 5 toques (0h, 15d, 30d, 45d, 60d).
    // Processa vencidos a cada 15 min, respeita horario comercial 9h-20h BRT.
    setInterval(async () => {
      const sent = await cadence.processCadence().catch((err) => {
        console.error('[cadence] processCadence error:', (err as Error).message);
        return 0;
      });
      if (sent > 0) console.log(`[cadence] ${sent} toques de cadencia enviados`);
    }, 15 * 60 * 1000);
    // Primeira passada 2min apos start (captura backlog de toques vencidos durante restart)
    setTimeout(() => cadence.processCadence().catch(() => {}), 2 * 60 * 1000);
    console.log('[cadence] Cadence scheduler started (checks every 15 min, 9h-20h BRT)');

    // Maquina de e-mail (Elo): espelha a cadencia de WhatsApp, so que pro
    // canal e-mail. Processa steps de email_sequencia vencidos a cada 15min,
    // respeita horario comercial 9h-20h BRT em dias uteis (podeEnviarAgora).
    const emailSeq = new EmailSequenceService(
      supabase,
      new Anthropic({ apiKey: config.anthropicApiKey }),
      new EmailSender(process.env.RESEND_API_KEY ?? '', process.env.EMAIL_FROM ?? ''),
      {
        from: process.env.EMAIL_FROM ?? '',
        baseUrl: config.publicProposalBaseUrl,
        hotOpens: Number(process.env.EMAIL_HOT_OPENS ?? 3),
        empresa: empresa().nomeFantasia,
      },
    );
    const runEmailSeq = async () => {
      try {
        const n = await emailSeq.processSequence();
        if (n) console.log(`[email-seq] enviados: ${n}`);
      } catch (err) {
        console.warn('[email-seq] ciclo falhou:', (err as Error)?.message);
      }
    };
    setInterval(runEmailSeq, 15 * 60 * 1000);
    setTimeout(runEmailSeq, 3 * 60 * 1000); // primeira passada 3min apos boot
    console.log('[email-seq] scheduler started (15min, dias uteis 9-20 BRT)');

    // Inscricao automatica na jornada de e-mail: a cada 1h, varre TODOS os
    // leads abertos e elegiveis (base existente + leads novos de qualquer
    // origem) e matricula quem ainda nao esta na sequencia. Idempotente
    // (scheduleEmailSequence faz upsert com ignoreDuplicates), entao rodar de
    // novo em cima de quem ja esta inscrito e inofensivo. Respeita o mesmo
    // botao ligar/pausar do dashboard (aba E-mail Marketing) que o motor de
    // envio usa.
    const runInscricaoAutomatica = async () => {
      try {
        if ((await supabase.getFlag('email_seq_ligado')) === false) return;
        const n = await supabase.inscreverLeadsElegiveisEmail();
        if (n) console.log('[email] inscrição automática:', n, 'lead(s) novos na jornada');
      } catch (err) {
        console.warn('[email] inscricao automatica falhou:', (err as Error)?.message);
      }
    };
    setInterval(runInscricaoAutomatica, 60 * 60 * 1000); // a cada 1h
    setTimeout(runInscricaoAutomatica, 2 * 60 * 1000); // primeira passada 2min apos start (pega a base existente sem esperar 1h)
    console.log('[email] inscricao automatica scheduler started (1h)');

    // Multi-tenant (fatia 2): auto-mapeia a EcoSun ao número WABA do próprio
    // app ~30s após o boot. One-shot, best-effort. Sem esse mapa, o resolver
    // segue caindo em EcoSun (comportamento de hoje) — então é só pra deixar a
    // EcoSun explicitamente registrada assim que a fatia 2 sobe, sem SQL manual.
    // NUNCA sobrescreve um mapa já existente (o `.is(...null)` no update e o
    // aviso no ramo "diferente" garantem isso).
    const autoMapearEcosunWaba = async () => {
      try {
        const phoneId = config.metaWabaPhoneNumberId;
        if (!phoneId) return; // sem número no config → nada a mapear (silencioso)
        const client = supabase.getClient();
        const { data, error } = await client
          .from('companies')
          .select('waba_phone_number_id')
          .eq('id', ECOSUN_COMPANY_ID)
          .maybeSingle();
        if (error) {
          console.warn('[tenant] auto-map EcoSun: erro ao ler companies:', error.message);
          return;
        }
        const atual = (data as { waba_phone_number_id?: string | null } | null)?.waba_phone_number_id ?? null;
        if (atual === null) {
          const { error: updErr } = await client
            .from('companies')
            .update({ waba_phone_number_id: phoneId })
            .eq('id', ECOSUN_COMPANY_ID)
            .is('waba_phone_number_id', null);
          if (updErr) {
            console.warn('[tenant] auto-map EcoSun: update falhou:', updErr.message);
            return;
          }
          console.log(`[tenant] EcoSun mapeada ao número WABA ${phoneId} (auto)`);
        } else if (atual !== phoneId) {
          console.warn(`[tenant] EcoSun já mapeada a um número WABA diferente (${atual}); config diz ${phoneId}. NÃO sobrescrevendo.`);
        }
        // atual === phoneId → já certo, nada a fazer.
      } catch (err) {
        console.warn('[tenant] auto-map EcoSun falhou:', (err as Error)?.message);
      }
    };
    setTimeout(autoMapearEcosunWaba, 30 * 1000); // ~30s após boot (one-shot)
    console.log('[tenant] auto-map EcoSun agendado (~30s após boot)');

    // Auto-agendamento de cadencia: a cada 1h, busca leads novos silentes
    // ha mais de 24h sem cadencia agendada e dispara scheduleCadence
    // automaticamente. Garante que NENHUM lead da campanha seja esquecido
    // (incidente Marcio Vianas 12-13/05/2026: lead da campanha Mai01 ficou
    // 30h+ sem cadencia agendada porque agendamento era manual via /eva on).
    // Cap de quantos leads silentes recebem auto-agendamento por ciclo.
    // Mesma logica do CADENCE_BATCH_LIMIT — se voce tem 209 silentes nao
    // queremos criar 209 toques tudo no mesmo segundo. AUTO_CADENCE_BATCH_LIMIT
    // controla isso. Default 50.
    const autoCadenceScheduler = async () => {
      try {
        const envAutoLimit = parseInt(process.env.AUTO_CADENCE_BATCH_LIMIT ?? '', 10);
        const autoBatchLimit = Number.isFinite(envAutoLimit) && envAutoLimit > 0 ? envAutoLimit : 50;
        const silentAll = await supabase.getSilentLeadsWithoutCadence(24);
        const silent = silentAll.slice(0, autoBatchLimit);
        if (silent.length === 0) return;
        if (silentAll.length > silent.length) {
          console.log(`[cadence] auto-scheduler: ${silentAll.length} silentes detectados, processando ${silent.length} este ciclo (limit=${autoBatchLimit})`);
        }
        for (const lead of silent) {
          try {
            await supabase.scheduleCadence(lead.id);
            console.log(
              `[cadence] auto-agendado pra lead ${lead.id} (${lead.name ?? 'sem nome'} / ${lead.phone}) — silente ha > 24h`,
            );
          } catch (err) {
            console.error(`[cadence] auto-agendamento falhou pra lead ${lead.id}:`, (err as Error).message);
          }
        }
        console.log(`[cadence] auto-agendou cadencia pra ${silent.length} lead(s) silente(s)`);
      } catch (err) {
        console.error('[cadence] autoCadenceScheduler error:', (err as Error).message);
      }
    };
    setInterval(autoCadenceScheduler, 60 * 60 * 1000); // a cada 1h
    setTimeout(autoCadenceScheduler, 3 * 60 * 1000); // primeira passada 3min apos start
    console.log('[cadence] Auto-scheduler started (checks every 1h for silent leads > 24h)');

    // Rede de proteção: varredura 1x/h pega o BACKLOG de leads quentes pelos
    // dados (conta>=R$700 ou >=700 kWh) presos em 'qualificando' que a Eva
    // nao fechou e estao parados ha >45min. Idempotente (lock compartilhado)
    // — roda quantas vezes quiser sem spammar. Primeira passada 4min apos
    // boot pra resgatar o backlog logo depois do deploy.
    const hotLeadSweep = async () => {
      try {
        const { sweepStuckHotLeads } = await import('./modules/eva-alerts.js');
        const n = await sweepStuckHotLeads(
          { client: supabase.getClient(), engineerPhone: config.engineerPhone, sendText, metaWaba: metaWaba ?? null },
          { staleMinutes: 45 },
        );
        if (n > 0) console.log(`[hotlead] varredura alertou ${n} lead(s) quente(s) parado(s)`);
      } catch (err) {
        console.error('[hotlead] sweep error:', (err as Error).message);
      }
    };
    setInterval(hotLeadSweep, 60 * 60 * 1000);  // a cada 1h
    setTimeout(hotLeadSweep, 4 * 60 * 1000);    // 4min apos boot (resgata backlog)
    console.log('[hotlead] Hot-lead backstop sweep started (1x/h, parado > 45min)');

    // Digest periodico de atividade da Eva pro WhatsApp do Junior.
    // Dispara 3x/dia em horarios definidos: 7h, 12h40 e 21h BRT. Cobre
    // novos leads, silentes 24h+, qualificados/agendados do dia, cadencia
    // respondida (sinal quente) e metricas curtas. Idempotente via app_flags.
    const evaDigestScheduler = async () => {
      try {
        const { maybeRunDigest } = await import('./modules/eva-digest.js');
        await maybeRunDigest(supabase.getClient(), config.engineerPhone, sendText, metaWaba ?? null);
      } catch (err) {
        console.error('[digest] scheduler error:', (err as Error).message);
      }
    };
    setInterval(evaDigestScheduler, 5 * 60 * 1000); // checa a cada 5 min se eh hora
    setTimeout(evaDigestScheduler, 2 * 60 * 1000); // primeira passada 2min apos start
    console.log('[digest] Eva digest scheduler started (checks every 5min, dispara 7h/12h40/21h BRT)');
  }

  // Notificacao de review novo do /avaliar (form publico do site).
  // A cada 5min, busca reviews ainda nao notificados e manda no WhatsApp
  // do engineerPhone com BOTOES interativos ✅ Aprovar / ❌ Ignorar.
  // NAO gated por passive mode pq so envia pro proprio Junior — admin alert,
  // nao outbound pra cliente. (Antes estava no gate errado e quebrava com
  // EVA_PASSIVE_MODE=true; fix 08/05.)
  async function notifyNewReviews() {
    try {
      const pending = await publicReviews.listUnnotified(5);
      if (pending.length === 0) return;
      for (const r of pending) {
        const stars = '⭐'.repeat(r.estrelas);
        const cidade = r.cliente_cidade ? ` · ${r.cliente_cidade}` : '';
        const texto = r.texto ? `\n💬 "${r.texto.slice(0, 250)}${r.texto.length > 250 ? '...' : ''}"` : '';
        const tel = r.cliente_telefone ? `\n📞 ${r.cliente_telefone}` : '';
        const body = [
          '🌟 *Nova avaliação no site!*',
          '',
          `👤 ${r.cliente_nome}${cidade}`,
          `${stars} (${r.estrelas} estrela${r.estrelas > 1 ? 's' : ''})`,
          texto,
          tel,
        ].filter(Boolean).join('\n');

        // Tenta enviar com botoes WABA. Se nao tiver WABA disponivel, fallback
        // pra texto puro com instrucao de comando.
        if (metaWaba) {
          try {
            await metaWaba.sendInteractiveButtons(
              config.engineerPhone,
              body,
              [
                { id: `approve:${r.id}`, title: '✅ Aprovar' },
                { id: `ignore:${r.id}`, title: '❌ Ignorar' },
              ],
              'Toque pra responder',
            );
          } catch (err) {
            console.warn('[reviews-notifier] botoes falharam, fallback texto:', (err as Error).message);
            await sendText(config.engineerPhone, `${body}\n\n✅ /aprovar-review ${r.id}\n❌ Ignora se for spam`);
          }
        } else {
          await sendText(config.engineerPhone, `${body}\n\n✅ /aprovar-review ${r.id}\n❌ Ignora se for spam`);
        }
        await publicReviews.markNotified(r.id);
      }
      console.log(`[reviews-notifier] notificou ${pending.length} review(s)`);
    } catch (err) {
      console.error('[reviews-notifier] erro:', (err as Error).message);
    }
  }
  if (!isSandbox) {
    setInterval(notifyNewReviews, 5 * 60 * 1000);  // a cada 5 min
    setTimeout(notifyNewReviews, 30 * 1000);       // tambem 30s apos start (pra pegar pendentes)
    console.log('[reviews-notifier] cron started (a cada 5min)');
  }

  // Monitoramento Modulo 5: cron de sync da geracao a cada 1h.
  // SolarEdge atualiza dados ~15min — 1h cobre bem sem estourar rate limit
  // (default SolarEdge: 300 calls/dia/site → 24 calls/dia esta tranquilo).
  // Admin pull (Junior usa pra ver), NAO eh outbound pra cliente — fica
  // fora do gate de passive mode. UPSERT idempotente em geracao_diaria.
  if (!isSandbox) {
    const monitoringSyncHourly = async () => {
      try {
        const result = await monitoringService.syncAll();
        if (result.totalSistemas > 0) {
          console.log(
            `[monitoring] sync horario: ${result.sucessos}/${result.totalSistemas} ok, ${result.falhas} falhas`,
          );
        }
      } catch (err) {
        console.error('[monitoring] sync horario falhou:', (err as Error).message);
      }
    };
    setInterval(monitoringSyncHourly, 15 * 60 * 1000); // 1x a cada 15min (alinha com SolarEdge)
    setTimeout(monitoringSyncHourly, 2 * 60 * 1000);   // 2min apos start
    console.log('[monitoring] Cron de sync started (1x a cada 15min)');

    // Cron de descoberta: a cada 1h, usa as api_keys ja cadastradas pra
    // detectar plantas NOVAS criadas no painel da marca (ex: cliente novo
    // adicionado no SolarEdge). Junior nao precisa cadastrar manual.
    const checkMonitoringDiscovery = async () => {
      try {
        const result = await monitoringService.descobrirNovosSites();
        const totalNovos = Object.values(result.porMarca).reduce((s, m) => s + m.novos, 0);
        if (totalNovos > 0) {
          console.log(`[monitoring/discovery] ${totalNovos} sites NOVOS descobertos automaticamente`);
        }
      } catch (err) {
        console.warn('[monitoring/discovery] erro:', (err as Error).message);
      }
    };
    setInterval(checkMonitoringDiscovery, 60 * 60 * 1000);  // 1x por hora
    setTimeout(checkMonitoringDiscovery, 10 * 60 * 1000);   // 10min apos start
    console.log('[monitoring] Cron de descoberta started (1x/hora)');

    // Telemetria (fundação): coletor de 15 min. Tira a foto de todas as grandezas
    // catalogadas de cada inversor (marcas com fetchTelemetry — hoje Sungrow) e
    // grava em telemetria_medicoes. Admin pull, fora do gate de passive mode.
    const telemetriaService = new TelemetriaService(supabase, monitoringService);
    const coletarTelemetria = async () => {
      try {
        const r = await telemetriaService.coletar(new Date().toISOString());
        if (r.sistemas > 0) {
          console.log(`[telemetria] coleta: ${r.medicoes} medições de ${r.sistemas} sistema(s), ${r.falhas} falha(s)`);
        }
      } catch (err) {
        console.error('[telemetria] coleta falhou:', (err as Error).message);
      }
    };
    setInterval(coletarTelemetria, 15 * 60 * 1000);  // a cada 15 min
    setTimeout(coletarTelemetria, 3 * 60 * 1000);    // 3min apos start
    console.log('[telemetria] Cron de coleta started (a cada 15min)');

    // Telemetria — retenção: 1x/dia resume o que passou de 6 meses e apaga o fino.
    const resumirTelemetria = async () => {
      try {
        const corte = new Date();
        corte.setMonth(corte.getMonth() - 6);
        const r = await telemetriaService.resumirAntigos(corte.toISOString());
        if (r.resumidos > 0 || r.apagados > 0) {
          console.log(`[telemetria] retenção: ${r.resumidos} resumo(s), ${r.apagados} fino(s) apagado(s)`);
        }
      } catch (err) {
        console.error('[telemetria] retenção falhou:', (err as Error).message);
      }
    };
    setInterval(resumirTelemetria, 24 * 60 * 60 * 1000);  // 1x/dia
    setTimeout(resumirTelemetria, 20 * 60 * 1000);        // 20min apos start
    console.log('[telemetria] Cron de retenção started (1x/dia)');

    // RH — retenção LGPD: currículos/candidatos com mais de 12 meses são apagados.
    const limparRh = async () => {
      try {
        const r = await limparCandidatosAntigos(supabase.getClient(), corteRetencao(Date.now()));
        if (r.apagados > 0) console.log(`[rh] retenção: ${r.apagados} candidato(s) antigo(s) apagado(s)`);
      } catch (err) {
        console.error('[rh] retenção falhou:', (err as Error).message);
      }
    };
    setInterval(limparRh, 24 * 60 * 60 * 1000);  // 1x/dia
    setTimeout(limparRh, 25 * 60 * 1000);        // 25min apos start
    console.log('[rh] Cron de retenção LGPD started (1x/dia, corte 12 meses)');

    // RH — varredura da triagem IA: pega candidatos sem nota (chegados com o
    // servidor fora, retroativos ou com falha transitória de API).
    const triarRh = async () => {
      try {
        const r = await rhTriagem.triarPendentes(5);
        if (r.triados > 0 || r.falhas > 0) console.log(`[rh-triagem] varredura: ${r.triados} triado(s), ${r.falhas} falha(s)`);
      } catch (err) {
        console.error('[rh-triagem] varredura falhou:', (err as Error).message);
      }
    };
    setInterval(triarRh, 5 * 60 * 1000);  // a cada 5 min
    setTimeout(triarRh, 2 * 60 * 1000);   // 2min apos start
    console.log('[rh-triagem] Cron de triagem IA started (a cada 5min)');

    // ============================================
    // Modulo 6 — alerta proativo da carteira
    // ============================================
    const proactiveAlertService = new ProactiveAlertService(supabase, monitoringService);
    const proactiveDryRun = process.env.PROACTIVE_ALERTS_DRY_RUN === '1';
    const proactiveDispatchCtx: DispatchCtx = {
      supabase,
      sendAdminWithButtons: (to, body, buttons, footer) =>
        sendAdminWithButtons({ metaWaba, sendText }, to, body, buttons, footer),
      adminPhone: config.engineerPhone,
      dryRun: proactiveDryRun,
      // Resumo diário: em treino, queda/milestone não viram msg individual.
      autonomiaOn: async (tipo: 'queda' | 'parabens') => {
        const { getConfig } = await import('./modules/monitoring/abordagem/abordagens-repo.js');
        const cfg = await getConfig(supabase.getClient());
        return tipo === 'queda' ? cfg.queda_auto : cfg.parabens_auto;
      },
      // Eva Monitoramento Evolutivo: alerta de tipo "cliente" com dono vira
      // abordagem da Eva. O wrapper recalcula diasOffline/percentualQueda
      // REAIS da MESMA fonte do radar (geracao_diaria + esperadoDiaKwh,
      // classificacao.ts) — o texto do alerta nunca é fonte de número.
      // Sem WABA o campo fica ausente e o dispatcher segue 100% no fluxo atual.
      ...(metaWaba ? {
        proporAbordagem: async (
          alerta: { id: string; tipo: string },
          sistema: { id: string; potencia_kwp: number | null; uf: string | null },
          lead: { id: string; phone: string },
        ): Promise<'proposta' | 'enviada' | 'inelegivel'> => {
          // Caso-limite da spec: takeover ativo (Junior assumiu a conversa) →
          // a abordagem espera. Alerta admin sai normal ('inelegivel') e o
          // ciclo seguinte re-tenta quando o takeover acabar.
          if (await takeover.isPaused(lead.phone)) {
            // SEC: log com lead.id (telefone é dado pessoal — não vai pro log)
            console.log('[abordagem] takeover ativo pro lead', lead.id, '— espera');
            return 'inelegivel';
          }
          const { proporAbordagem } = await import('./modules/monitoring/abordagem/orquestrador.js');
          const { percentualQueda7d } = await import('./modules/monitoring/classificacao.js');
          const client = supabase.getClient();
          const hoje = new Date();
          const dia = (d: Date) => d.toISOString().slice(0, 10);
          const atras = (n: number) => new Date(hoje.getTime() - n * 24 * 60 * 60 * 1000);
          let diasOffline: number | null = null;
          let percentualQueda: number | null = null;
          try {
            if (alerta.tipo === 'sistema_offline') {
              // dias desde o último dia com geração > 0 (mesma semântica do detect)
              const { data, error } = await client.from('geracao_diaria')
                .select('data, geracao_kwh')
                .eq('sistema_id', sistema.id)
                .gte('data', dia(atras(60))).lte('data', dia(hoje))
                .order('data', { ascending: false });
              if (error) throw new Error(error.message);
              const ultima = (data ?? []).find((g) => Number(g.geracao_kwh) > 0);
              if (ultima) {
                diasOffline = Math.max(Math.floor(
                  (hoje.getTime() - new Date(`${ultima.data}T12:00:00Z`).getTime()) / (24 * 60 * 60 * 1000)), 1);
              }
            } else if (alerta.tipo === 'queda_geracao') {
              // MESMO cálculo do radar (29/07): 7 dias COMPLETOS (sem o hoje
              // parcial) e régua relativa à carteira quando há mediana — a Eva
              // fala pro cliente o MESMO número do painel.
              const { data, error } = await client.from('geracao_diaria')
                .select('geracao_kwh')
                .eq('sistema_id', sistema.id)
                .gte('data', dia(atras(7))).lt('data', dia(hoje));
              if (error) throw new Error(error.message);
              const real7 = (data ?? []).reduce((s, g) => s + Number(g.geracao_kwh), 0);
              const { data: sisRow } = await client.from('sistemas_clientes')
                .select('company_id').eq('id', sistema.id).maybeSingle();
              const mediana = await monitoringService.medianaDaCarteira7d(
                (sisRow?.company_id as string | null | undefined) ?? null,
              );
              percentualQueda = percentualQueda7d(real7, sistema.potencia_kwp, sistema.uf, mediana);
            }
          } catch (err) {
            console.warn('[abordagem] recomputar dados do alerta falhou:', (err as Error).message);
          }
          // Sem o número obrigatório do tipo, abordar seria inventar dado
          // (mesma regra I4 do orquestrador) → inelegível, alerta admin sai normal.
          if (alerta.tipo === 'sistema_offline' && diasOffline === null) return 'inelegivel';
          if (alerta.tipo === 'queda_geracao' && percentualQueda === null) return 'inelegivel';
          return proporAbordagem(getOrqDeps(), {
            alertaId: alerta.id, sistemaId: sistema.id, leadId: lead.id,
            tipoAlerta: alerta.tipo as 'sistema_offline' | 'queda_geracao' | 'milestone_economia',
            diasOffline, percentualQueda,
          });
        },
      } : {}),
    };

    const runProactiveDetect = async () => {
      try {
        await proactiveAlertService.runDetectionCycle(new Date());
      } catch (err) {
        console.error('[proactive-alerts] detect cron falhou:', (err as Error).message);
      }
    };
    setInterval(runProactiveDetect, 60 * 60 * 1000); // 60min
    setTimeout(runProactiveDetect, 5 * 60 * 1000);   // 5min apos start

    const runProactiveDispatch = async () => {
      try {
        await runDispatchCycle(new Date(), proactiveDispatchCtx);
      } catch (err) {
        console.error('[proactive-alerts] dispatch cron falhou:', (err as Error).message);
      }
      // Monitoramento Evolutivo: pendências das abordagens (lembrete, encerrar
      // por silêncio, reagendadas, pós-limpeza, vassoura) rodam no MESMO ciclo
      // de 15min, DEPOIS do dispatch, com try/catch próprio — uma falha nunca
      // derruba a outra. DRY_RUN propagado via getOrqDeps.
      if (metaWaba) {
        try {
          const { processarPendencias } = await import('./modules/monitoring/abordagem/orquestrador.js');
          await processarPendencias(getOrqDeps(), new Date());
        } catch (err) {
          console.error('[abordagem] cron de pendências falhou:', (err as Error).message);
        }
      }
      // Resumo diário do pós-venda (17h-18h BRT): try/catch próprio — falha
      // nunca derruba dispatch nem pendências. O runner decide janela/CAS.
      try {
        const { rodarResumoDiario } = await import('./modules/dashboard/pos-venda-resumo-diario.js');
        await rodarResumoDiario({
          client: supabase.getClient(),
          sendText: async (to: string, t: string) => { await sendText(to, t); },
          adminPhone: config.engineerPhone,
          dryRun: process.env.PROACTIVE_ALERTS_DRY_RUN === '1',
        }, new Date());
      } catch (err) {
        console.error('[resumo-diario] cron falhou:', (err as Error).message);
      }
    };
    setInterval(runProactiveDispatch, 15 * 60 * 1000); // 15min
    setTimeout(runProactiveDispatch, 7 * 60 * 1000);   // 7min apos start

    const runAnniversaryCron = async () => {
      try {
        await runAnniversaryEnqueue(new Date(), supabase);
      } catch (err) {
        console.error('[proactive-alerts] anniversary cron falhou:', (err as Error).message);
      }
    };
    // 1x/dia 6h BRT — checa a cada hora e dispara se hora local = 6
    const checkAnniversaryHour = () => {
      const h = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false });
      if (Number(h) === 6) runAnniversaryCron();
    };
    setInterval(checkAnniversaryHour, 60 * 60 * 1000);
    // Também checa no startup (8min após boot) — protege contra reinício no
    // intervalo entre 06:00 e 06:59 BRT, onde o setInterval só pegaria às 07:xx.
    setTimeout(checkAnniversaryHour, 8 * 60 * 1000);

    // [Fase 2B] Vigias de tensão/corrente da telemetria — 1×/dia às 18h BRT
    // (depois da tarde, quando a sobretensão aparece). Mesmo idioma do cron
    // do aniversário: checa a hora local a cada hora + no startup.
    const runTelemetriaRules = async () => {
      try {
        await proactiveAlertService.runTelemetriaRulesCycle(new Date());
      } catch (err) {
        console.error('[proactive-alerts] telemetria cron falhou:', (err as Error).message);
      }
    };
    const checkTelemetriaHour = () => {
      const h = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false });
      if (Number(h) === 18) runTelemetriaRules();
    };
    setInterval(checkTelemetriaHour, 60 * 60 * 1000);
    setTimeout(checkTelemetriaHour, 9 * 60 * 1000);

    console.log(
      `[proactive-alerts] crons started (detect 60min, dispatch 15min, anniversary 06h BRT, telemetria 18h BRT). DRY_RUN=${proactiveDryRun}`,
    );

    // ============================================
    // Módulo 7 — Eva Analista de Campanhas (Peça 1)
    // ============================================
    // 1x/dia de manhã: calcula custo por lead qualificado por campanha e manda
    // resumo + recomendação no WhatsApp. SÓ LEITURA — não mexe em verba.
    const JANELA_DIAS_CAMPANHA = 14;
    const runCampaignDigest = async () => {
      try {
        const { spends, leads } = await fetchCampaignQualityInputs(supabase.getClient(), JANELA_DIAS_CAMPANHA);
        const report = analyzeCampaignQuality(spends, leads);
        const texto = buildCampaignDigest(report, JANELA_DIAS_CAMPANHA);
        await sendAdminWithButtons(
          { metaWaba, sendText },
          config.engineerPhone,
          texto,
          [{ id: 'capi_dash', title: '📊 Ver painel' }],
          'Eva Analista — só leitura por enquanto',
        );
        console.log('[campaign-digest] resumo diário enviado');
      } catch (err) {
        console.error('[campaign-digest] cron falhou:', (err as Error).message);
      }
    };
    // Checa de hora em hora; dispara quando a hora local (BRT) = 8h.
    const checkCampaignDigestHour = () => {
      const h = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false });
      if (parseInt(h, 10) === 8) void runCampaignDigest();
    };
    setInterval(checkCampaignDigestHour, 60 * 60 * 1000);
    // Boot-time check: se o app reiniciar entre 8h-8h59 BRT, o setInterval só
    // pegaria no próximo ciclo; isso garante o disparo do dia mesmo após deploy.
    setTimeout(checkCampaignDigestHour, 5 * 60 * 1000);
    console.log('[campaign-digest] cron started (1x/dia às 8h BRT)');

    // ============================================
    // A5 — Notificação pós-instalação (Junior)
    // ============================================
    const runPosInstalacaoNotif = async () => {
      try {
        await runPosInstalacaoNotifCycle(new Date(), {
          supabase,
          sendText,
          adminPhone: config.engineerPhone,
          dashboardBaseUrl: 'https://dashboard.ecosunpower.eng.br',
        });
      } catch (err) {
        console.error('[pos-instalacao] cron falhou:', (err as Error).message);
      }
    };
    setInterval(runPosInstalacaoNotif, 60 * 60 * 1000);  // 1x/hora
    setTimeout(runPosInstalacaoNotif, 10 * 60 * 1000);   // 10min após boot

    console.log('[pos-instalacao] cron started (1x/hora dentro da janela)');

    // ============================================
    // CRM Fase 2 — Motor de SLA do funil
    // ============================================
    // Ciclo de SLA: varre leads ativos e cria/garante tarefas de SLA (idempotente).
    // Best-effort: falha de um lead não derruba o ciclo. Roda a cada 15min.
    // Aviso de SLA vencido (CRM Fase 2 — Task 10): quando uma tarefa vence,
    // Eva avisa o Junior no zap com botões [Cobrar agora][Eu falo][Adiar 2 dias].
    // Reusa sendAdminWithButtons (mesma função/canal dos proactive-alerts): com
    // WABA manda botões interativos; sem WABA cai no texto puro automaticamente.
    // Respeita PROACTIVE_ALERTS_DRY_RUN: se '1', só loga (não envia).
    const slaNotifyDryRun = process.env.PROACTIVE_ALERTS_DRY_RUN === '1';
    const enviarAvisoSla = async (aviso: Aviso): Promise<void> => {
      if (slaNotifyDryRun) {
        console.log('[sla-notifier] DRY: avisaria', aviso.botoes.map(b => b.id).join(','));
        return;
      }
      await sendAdminWithButtons(
        { metaWaba, sendText },
        config.engineerPhone,
        aviso.texto,
        aviso.botoes,
        'SLA do funil',
      );
    };

    const runSlaCron = async () => {
      // Ciclo de SLA do funil (CRM Fase 2): cria/atualiza tarefas de SLA dos leads ativos.
      try {
        const criadas = await runSlaCycle(supabase.getClient());
        if (criadas > 0) console.log(`[sla] ${criadas} tarefa(s) de SLA criada(s)`);
      } catch (e) { console.error('[sla] ciclo falhou:', (e as Error).message); }
      // Best-effort: aviso de SLA vencido logo após o ciclo. try/catch próprio
      // pra uma falha aqui nunca derrubar o scheduler nem o ciclo de criação.
      try {
        const avisados = await notificarSlaVencidos(supabase.getClient(), enviarAvisoSla);
        if (avisados > 0) console.log(`[sla-notifier] ${avisados} aviso(s) de SLA vencido enviado(s)`);
      } catch (e) { console.error('[sla-notifier] aviso falhou:', (e as Error).message); }
    };
    setInterval(runSlaCron, 15 * 60 * 1000);   // a cada 15min
    setTimeout(runSlaCron, 6 * 60 * 1000);     // 6min após boot
    console.log('[sla] Motor de SLA started (a cada 15min)');

    // ============================================
    // Módulo 8 — Alertas financeiros (DAS, faixa, Fator R)
    // ============================================
    // Dedupe diário por tipo: só manda 1 alerta de cada tipo por dia,
    // independente de quantas vezes o cron rodar no mesmo dia.
    const finAlertaUltimoDia = new Map<string, string>(); // tipo → 'YYYY-MM-DD'

    const runFinanceiroAlertas = async () => {
      try {
        if (!metaWaba) return;
        const { getBuckets, getParametros, competenciaAtual } = await import('./modules/financeiro/repo.js');
        const { calcularRBT12, mesesAnteriores } = await import('./modules/financeiro/rbt12.js');
        const { detectarAlertasFinanceiros } = await import('./modules/financeiro/alertas.js');
        const { fatorR, proLaboreMinimoParaAnexoIII } = await import('./modules/financeiro/imposto.js');
        const client = supabase.getClient();
        const comp = competenciaAtual();
        const [buckets, params] = await Promise.all([getBuckets(client), getParametros(client)]);
        const rbt12 = calcularRBT12(buckets, comp);
        const receita12 = rbt12;
        const folha12 = params.pro_labore_mensal * 12 + params.outras_folhas_mensal * 12;
        const fr = fatorR(folha12, receita12);
        // DAS que vence dia 20 do mês M é o imposto da competência M-1 (mês anterior).
        // Usa lançamentos por parcela para atribuir cada valor ao mês em que de fato caiu.
        const compDas = mesesAnteriores(comp, 1)[0]; // mês anterior
        const { data, error } = await client.from('financeiro_recebimentos')
          .select('imposto').eq('competencia', compDas);
        if (error) throw new Error(error.message);
        const impostoDoMes = (data ?? []).reduce((s: number, r: { imposto: number }) => s + Number(r.imposto), 0);
        const agoraBrt = new Date(Date.now() - 3 * 60 * 60 * 1000);
        const hoje = agoraBrt.toISOString().slice(0, 10);
        const alertas = detectarAlertasFinanceiros({
          diaDoMes: agoraBrt.getUTCDate(), diaAlertaDas: params.dia_alerta_das,
          rbt12, margemFaixa: params.margem_alerta_faixa,
          fatorRatio: fr.ratio, fatorRAlerta: params.fator_r_alerta, // ratio direto, sem /100
          impostoDoMes, proLaboreMin: proLaboreMinimoParaAnexoIII(receita12, params.outras_folhas_mensal * 12),
        });
        const proactiveDryRun = process.env.PROACTIVE_ALERTS_DRY_RUN === '1';
        for (const a of alertas) {
          const chave = a.tipo;
          if (finAlertaUltimoDia.get(chave) === hoje) continue; // dedupe diário
          finAlertaUltimoDia.set(chave, hoje);
          if (proactiveDryRun) {
            console.log(`[financeiro-alertas] DRY_RUN — ${a.tipo}: ${a.texto.slice(0, 80)}`);
          } else {
            await sendText(config.engineerPhone, a.texto);
          }
        }
      } catch (err) {
        console.error('[financeiro-alertas] cron falhou:', (err as Error).message);
      }
    };
    setInterval(runFinanceiroAlertas, 6 * 60 * 60 * 1000); // 4x/dia
    setTimeout(runFinanceiroAlertas, 9 * 60 * 1000); // primeira rodada 9min após boot
    console.log('[financeiro-alertas] cron started (4x/dia, dedupe diário por tipo)');
  }

  // Canal Solar ingestion (every 3 days)
  const knowledgeDir = join(__dirname, '..', 'conhecimento');
  const runCanalSolarIngestion = async (force = false) => {
    try {
      console.log('[canal-solar] Starting ingestion...');
      const result = await ingestCanalSolar(knowledgeDir, force);
      if (result.skipped) {
        console.log(`[canal-solar] Skipped: ${result.reason}`);
      } else {
        console.log(`[canal-solar] Ingested ${result.articlesFetched} articles -> ${result.outputPath}`);
      }
    } catch (err) {
      console.error('[canal-solar] Ingestion failed:', (err as Error).message);
    }
  };
  setTimeout(() => runCanalSolarIngestion(false), 2 * 60 * 1000);
  setInterval(() => runCanalSolarIngestion(true), 24 * 60 * 60 * 1000);
  console.log('[canal-solar] Scheduler started (todo dia)');

  // Auto-blog generator: a cada 3 dias gera 1 draft e manda no WhatsApp do
  // Junior pra aprovacao. NAO gated por passive mode pq so envia pro proprio
  // Junior (1 mensagem/3 dias, baixo risco). Junior responde "publicar" e o
  // draft vai pro repo do site via GitHub API (Cloudflare publica em ~2 min).
  const generateAndNotifyBlogDraft = async () => {
    try {
      console.log('[blog] Gerando novo draft...');
      const draft = await blogGenerator.generateDraft();
      const summary = `📝 *Novo draft pronto pra revisar*

*${draft.title}*

${draft.description}

Categoria: ${draft.category}
Tempo de leitura: ${draft.readingTime} min
Slug: ${draft.slug}`;
      const fallbackText = `${summary}\n\nResponda *publicar* pra publicar no ar, ou *descartar* pra dispensar.`;
      if (!isSandbox) {
        // Mostra a foto do hero (se houver) antes dos botoes, pra Junior aprovar
        // ja vendo a imagem. Falha aqui nao bloqueia o aviso.
        if (metaWaba && draft.heroImageUrl) {
          try {
            await metaWaba.sendMedia(config.engineerPhone, draft.heroImageUrl, '🖼️ Foto do post', 'image');
          } catch (err) {
            console.warn('[blog] envio da foto falhou (segue sem):', (err as Error).message);
          }
        }
        if (metaWaba) {
          try {
            await metaWaba.sendInteractiveButtons(
              config.engineerPhone,
              summary,
              [
                { id: `publish-blog:${draft.slug}`, title: '📤 Publicar' },
                { id: `discard-blog:${draft.slug}`, title: '🗑️ Descartar' },
              ],
              'Toque pra responder',
            );
          } catch (err) {
            console.warn('[blog] botoes falharam, fallback texto:', (err as Error).message);
            await sendText(config.engineerPhone, fallbackText);
          }
        } else {
          await sendText(config.engineerPhone, fallbackText);
        }
        await supabase.getClient()
          .from('blog_drafts')
          .update({ whatsapp_notified_at: new Date().toISOString() })
          .eq('id', draft.id);
      } else {
        console.log(`[blog] [sandbox] Would notify ${config.engineerPhone}: ${fallbackText}`);
      }
      console.log(`[blog] Draft gerado e enviado: ${draft.title} (${draft.slug})`);
      return draft;
    } catch (err) {
      console.error('[blog] Falha ao gerar draft:', (err as Error).message);
      throw err;
    }
  };

  // Scheduler diário: gera 1 draft por dia (janela ~20h), idempotente via app_flags.
  // Roda 30min apos canal-solar pra usar artigos frescos.
  const checkBlogSchedule = async () => {
    const flagKey = 'last_blog_draft_generated_at';
    const lockKey = 'blog_draft_in_progress_until';
    const client = supabase.getClient();

    const { data: flag } = await client
      .from('app_flags')
      .select('value')
      .eq('key', flagKey)
      .maybeSingle();
    const last = flag?.value ? new Date(flag.value).getTime() : 0;
    // Todo dia: 1 artigo por dia. Usa ~20h (nao 24h cravadas) pra nao "pular" um
    // dia por causa do jitter do check (que roda de 6h em 6h).
    const umDiaMs = 20 * 60 * 60 * 1000;
    if (Date.now() - last < umDiaMs) return;

    // Lock de short-circuit: se outra instancia comecou ha menos de 10min, skipa
    // pra evitar duplo-disparo. Lock expira por timestamp, nao trava 3 dias se falhar.
    const { data: lock } = await client
      .from('app_flags')
      .select('value')
      .eq('key', lockKey)
      .maybeSingle();
    const lockUntil = lock?.value ? new Date(lock.value).getTime() : 0;
    if (Date.now() < lockUntil) return;

    await client
      .from('app_flags')
      .upsert({ key: lockKey, value: new Date(Date.now() + 10 * 60 * 1000).toISOString() }, { onConflict: 'key' });

    try {
      await generateAndNotifyBlogDraft();
      // SO marca o flag de "gerado" depois de sucesso real (com WhatsApp notificado).
      await client
        .from('app_flags')
        .upsert({ key: flagKey, value: new Date().toISOString() }, { onConflict: 'key' });
    } catch (err) {
      console.error('[blog] Scheduler error (flag NAO atualizado, retry no proximo ciclo):', (err as Error).message);
    } finally {
      // Libera lock assim que terminar (ou falhar)
      await client.from('app_flags').delete().eq('key', lockKey);
    }
  };
  // Roda 30min apos boot pra dar tempo do canal-solar refrescar
  setTimeout(checkBlogSchedule, 30 * 60 * 1000);
  // Checa a cada 6h (idempotente via app_flags)
  setInterval(checkBlogSchedule, 6 * 60 * 60 * 1000);
  console.log('[blog] Auto-blog scheduler started (drafts todo dia)');

  // News scraper diario: ANEEL 03:00 BRT. Idempotente via app_flags
  // + guard em memoria (newsScraperRunning) pra evitar double-run no
  // mesmo processo. Janela 03:00-03:29 + check a cada 20min = sempre cai
  // exatamente 1 vez por dia. Falha de scrape nao bloqueia outras schedulers.
  if (!isSandbox) {
    let newsScraperRunning = false;
    const checkNewsScraperSchedule = async () => {
      if (newsScraperRunning) return;
      const brt = getBrtParts();
      if (brt.hour !== 3) return; // somente entre 03:00-03:59 BRT

      const flagKey = 'last_news_scraper_run';
      const today = brt.dateISO;
      const { data: flag } = await supabase.getClient()
        .from('app_flags')
        .select('value')
        .eq('key', flagKey)
        .maybeSingle();
      if (flag?.value === today) return;

      // Lock antes de iniciar (atomico via UPDATE com WHERE) — 2 instancias
      // simultaneas no mesmo container nao acontece graças ao guard em memoria,
      // mas ainda assim o flag protege contra restart no meio da janela.
      newsScraperRunning = true;
      try {
        await supabase.getClient()
          .from('app_flags')
          .upsert({ key: flagKey, value: today }, { onConflict: 'key' });

        console.log('[news-scraper] Daily run starting...');
        const result = await newsScraper.scrapeAll();
        console.log(`[news-scraper] Daily done: ${JSON.stringify(result)}`);
      } catch (err) {
        console.error('[news-scraper] Daily run failed:', (err as Error).message);
      } finally {
        newsScraperRunning = false;
      }
    };
    setInterval(checkNewsScraperSchedule, 20 * 60 * 1000); // checa a cada 20 min
    console.log('[news-scraper] Daily scheduler started (ANEEL + feeds RSS @ 03:00 BRT)');

    // Endpoint manual pra forcar scrape (debug/test). Reusa webhook token.
    app.post('/news-scraper/run', async (req, res) => {
      const token = (req.headers['x-webhook-token'] as string)
        ?? (req.query.token as string) ?? '';
      if (!evolution.validateWebhookToken(token)) {
        res.status(401).json({ error: 'Invalid token' });
        return;
      }
      try {
        const result = await newsScraper.scrapeAll();
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    });
  }

  // Endpoint manual pra teste/debug: gera 1 draft on-demand
  app.post('/blog/generate', async (req, res) => {
    const token = (req.query.token as string) ?? '';
    if (!evolution.validateWebhookToken(token)) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    try {
      const category = req.body?.category as string | undefined;
      const topicHint = req.body?.topicHint as string | undefined;
      const draft = await generateAndNotifyBlogDraft();
      res.json({
        status: 'ok',
        draft: {
          id: draft.id,
          slug: draft.slug,
          title: draft.title,
          description: draft.description,
          category: draft.category,
          readingTime: draft.readingTime,
        },
        message: 'Draft gerado e notificado no WhatsApp do Junior. Responda "publicar" pra publicar.',
        ...(category || topicHint ? { hint: 'category/topicHint ainda nao implementado em rotacao automatica' } : {}),
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Endpoint manual: lista drafts pendentes
  app.get('/blog/drafts', async (req, res) => {
    const token = (req.query.token as string) ?? '';
    if (!evolution.validateWebhookToken(token)) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    const drafts = await blogGenerator.getPendingDrafts();
    res.json({ count: drafts.length, drafts });
  });

  // Endpoint manual: publica um draft especifico (forca via API mesmo sem zap)
  app.post('/blog/publish/:id', async (req, res) => {
    const token = (req.query.token as string) ?? '';
    if (!evolution.validateWebhookToken(token)) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    if (!config.githubPat || !config.githubSiteRepo) {
      res.status(500).json({ error: 'GITHUB_PAT/GITHUB_SITE_REPO nao configurado no env' });
      return;
    }
    try {
      const drafts = await blogGenerator.getPendingDrafts();
      const draft = drafts.find((d) => d.id === req.params.id);
      if (!draft) {
        res.status(404).json({ error: 'Draft nao encontrado ou ja foi publicado/descartado' });
        return;
      }
      await blogGenerator.markApproved(draft.id);
      const result = await publishDraftToGitHub({
        pat: config.githubPat,
        repo: config.githubSiteRepo,
        branch: config.githubSiteBranch,
        draft,
      });
      await blogGenerator.markPublished(draft.id);
      res.json({
        status: 'published',
        url: `https://ecosunpower.eng.br/blog/${draft.slug}/`,
        commit: result.commitSha,
        commitUrl: result.url,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Marketing scheduler: segunda E quinta 08:00 BRT gera UM post pra aprovação no
  // WhatsApp. Maioria imagem (Higgsfield + logo); a cada 4º run sai vídeo (~2x/mês).
  if (!isSandbox && marketing) {
    const checkMarketingSchedule = async () => {
      const brt = getBrtParts();
      if (brt.weekday !== 1 && brt.weekday !== 4) return; // segunda e quinta
      if (brt.hour !== 8 || brt.minute >= 15) return; // 08:00-08:14 BRT

      const lastRunKey = 'last_weekly_marketing_run';
      const { data: flag } = await supabase.getClient()
        .from('app_flags')
        .select('value')
        .eq('key', lastRunKey)
        .maybeSingle();
      const today = brt.dateISO;
      if (flag?.value === today) return; // already ran today

      // Grava flag ANTES de rodar — evita double-run se loop demorar mais que 15min
      // (upsert com onConflict:'key' pra atualizar em vez de duplicar)
      await supabase.getClient()
        .from('app_flags')
        .upsert(
          { key: lastRunKey, value: today, updated_at: new Date().toISOString() },
          { onConflict: 'key' },
        );

      // UM post por run (seg/qui). Maioria imagem (Higgsfield+logo); a cada 4º run
      // sai VÍDEO no lugar (~2x/mês, já que seg+qui dá ~8-9 posts/mês). Contador
      // persistido em app_flags pra alternar de forma estável entre runs.
      const VIDEO_EVERY = 4;
      const countKey = 'marketing_post_count';
      const { data: cflag } = await supabase.getClient()
        .from('app_flags').select('value').eq('key', countKey).maybeSingle();
      const count = Number(cflag?.value ?? '0') + 1;
      await supabase.getClient().from('app_flags').upsert(
        { key: countKey, value: String(count), updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      );
      const asVideo = count % VIDEO_EVERY === 0;
      console.log(`[marketing] Weekly run #${count}: gerando ${asVideo ? 'VÍDEO' : 'imagem'}...`);
      try {
        const draft = await marketing.generateDraft(undefined, asVideo);
        await sendDraftToJunior(draft.id);
        console.log('[marketing] Weekly run complete');
      } catch (err) {
        console.error('[marketing] Weekly run failed:', err);
      }
    };
    setInterval(checkMarketingSchedule, 10 * 60 * 1000); // check every 10 min
    console.log('[marketing] Weekly scheduler started (Segunda e Quinta 08:00 BRT)');

    // Also auto-discard stale drafts daily
    setInterval(async () => {
      try {
        const count = await marketing.autoDiscardStale(7);
        if (count > 0) console.log(`[marketing] Auto-discarded ${count} stale drafts`);
      } catch (err) {
        console.error('[marketing] Auto-discard failed:', err);
      }
    }, 24 * 60 * 60 * 1000);
  }

  // Weekly ads report: domingo 09:00 BRT manda resumo da semana pro Junior
  if (!isSandbox && !passiveMode) {
    const checkWeeklyReportSchedule = async () => {
      const brt = getBrtParts();
      if (brt.weekday !== 0) return; // domingo
      if (brt.hour !== 9 || brt.minute >= 15) return;

      const flagKey = 'last_weekly_ads_report';
      const today = brt.dateISO;
      const { data: flag } = await supabase.getClient()
        .from('app_flags')
        .select('value')
        .eq('key', flagKey)
        .maybeSingle();
      if (flag?.value === today) return;

      // Grava flag ANTES de enviar pra evitar double-send (race com tick proximo).
      // Se envio falhar, flag ja esta setada — Junior pode usar /send-now pra refazer.
      await supabase.getClient()
        .from('app_flags')
        .upsert(
          { key: flagKey, value: today, updated_at: new Date().toISOString() },
          { onConflict: 'key' },
        );

      try {
        const report = await generateWeeklyReport(supabase.getClient());
        const msg = formatReportForWhatsApp(report);
        await sendText(config.engineerPhone, msg);
        console.log(`[ads-report] Weekly report sent to ${config.engineerPhone}`);
      } catch (err) {
        console.error('[ads-report] Weekly report failed:', err);
      }
    };
    setInterval(checkWeeklyReportSchedule, 10 * 60 * 1000);
    console.log('[ads-report] Weekly scheduler started (Sundays 09:00 BRT)');
  }

  // meta_ads_insights collector: roda a cada 2h pra todas as campanhas active.
  // Usa metaWabaAccessToken — apesar do nome WhatsApp, e o mesmo System User
  // token com perm ads_read (15 perms granted, ver project_eva_28_04_token_pendencia memoria).
  //
  // IMPORTANTE: NAO depende de passiveMode. EVA_PASSIVE_MODE foi feito pra
  // desligar SCHEDULERS DE OUTBOUND (followup, cadence, manutencao) — coisas
  // que Eva manda. O cron de insights eh INBOUND (so consulta API Meta e
  // grava no DB). Sem ele, dashboard de marketing fica congelado mesmo com
  // campanhas reais rodando — incidente em 11-13/05/2026 (passiveMode esteve
  // true durante campanha Mai01 LIVE, 22 plantas Deye + marketing pararam).
  if (!isSandbox && config.metaWabaAccessToken) {
    const runInsightsCollector = async () => {
      try {
        const { syncCampaignStatuses, collectInsights, discoverNewCampaigns } = await import('./modules/marketing/insights-collector.js');
        const { runMetaPermissionsHeartbeat } = await import('./modules/marketing/meta-permissions-heartbeat.js');
        // 0) heartbeat permissions Meta (public_profile + pages_list) pra destravar checks App Review
        await runMetaPermissionsHeartbeat(config.metaWabaAccessToken!);
        // 1) descoberta: cadastra automaticamente campanhas novas criadas no Ads Manager
        if (config.metaAdAccountId) {
          console.log(`[discover-campaigns] iniciando descoberta act=${config.metaAdAccountId}`);
          const discResult = await discoverNewCampaigns(supabase.getClient(), config.metaWabaAccessToken!, config.metaAdAccountId);
          console.log(`[discover-campaigns] resultado: ${discResult.discovered} campanhas no Meta, ${discResult.inserted} novas cadastradas`);
        } else {
          console.warn('[discover-campaigns] META_AD_ACCOUNT_ID nao setado, pulando descoberta automatica');
        }
        // 2) sync status/name/budget Meta -> DB (toda campanha cadastrada)
        await syncCampaignStatuses(supabase.getClient(), config.metaWabaAccessToken!);
        // 3) collect insights so das active
        await collectInsights(supabase.getClient(), config.metaWabaAccessToken!);

        // 4) Google Ads → channel_daily_metrics (best-effort)
        if (process.env.GOOGLE_ADS_DEVELOPER_TOKEN && process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) {
          try {
            const { syncGoogleAdsToChannelMetrics } = await import('./modules/marketing/google-ads/sync.js');
            const result = await syncGoogleAdsToChannelMetrics(supabase.getClient());
            if (result.ok) {
              console.log(`[google-ads-sync] OK: ${result.dias_processados} dias, ${result.total_spend_cents} centavos, ${result.total_clicks} clicks, ${result.total_impressions} impressions`);
            } else {
              console.warn(`[google-ads-sync] FALHOU: ${result.error}`);
            }
          } catch (err) {
            console.warn(`[google-ads-sync] erro inesperado:`, (err as Error).message);
          }
        }
      } catch (err) {
        console.error('[insights] collector failed:', (err as Error).message);
      }
    };
    // 30min: Meta API insights "today" rate-limited mas com folga pra 1 conta.
    // Aprox 48 calls/dia (vs 12 antes) — cockpit fica fresco e sem risk.
    setInterval(runInsightsCollector, 30 * 60 * 1000);
    setTimeout(runInsightsCollector, 5 * 60 * 1000); // first run 5 min after boot
    console.log('[insights] meta_ads_insights collector scheduled (every 30min)');

    // Heartbeat imediato pra ja contar 1 chamada de public_profile (destrava
    // check App Review pra IG messaging). Roda 10s apos boot. Em paralelo
    // com proximas execucoes pelo cron (a cada 30min).
    setTimeout(async () => {
      try {
        const { runMetaPermissionsHeartbeat } = await import('./modules/marketing/meta-permissions-heartbeat.js');
        await runMetaPermissionsHeartbeat(config.metaWabaAccessToken!);
      } catch (err) {
        console.warn('[meta-heartbeat] boot heartbeat falhou:', (err as Error).message);
      }
    }, 10_000);
  } else if (!isSandbox) {
    // Diagnostico explicito quando NAO registra — pra nao ficar dashboard
    // congelado em silencio (causa do incidente acima).
    console.warn(
      `[insights] ⚠️ collector NAO registrado. ` +
      `isSandbox=${isSandbox} metaWabaAccessToken=${config.metaWabaAccessToken ? 'set' : 'MISSING'}`,
    );
  }

  // Agente Analista: daily 9h BRT + weekly segunda 8h BRT
  if (!isSandbox && !passiveMode) {
    const checkAnalystSchedule = async () => {
      const brt = getBrtParts();
      const today = brt.dateISO;

      // Daily 9h
      if (brt.hour === 9 && brt.minute < 15) {
        const flagKey = 'last_analyst_daily_report';
        const { data: flag } = await supabase.getClient()
          .from('app_flags').select('value').eq('key', flagKey).maybeSingle();
        if (flag?.value !== today) {
          await supabase.getClient()
            .from('app_flags')
            .upsert({ key: flagKey, value: today, updated_at: new Date().toISOString() }, { onConflict: 'key' });
          try {
            const { buildDailyReport } = await import('./modules/marketing/analyst-agent.js');
            const msg = await buildDailyReport(supabase.getClient());
            await sendText(config.engineerPhone, msg);
            console.log(`[analyst] daily report sent to ${config.engineerPhone}`);
          } catch (err) {
            console.error('[analyst] daily report failed:', (err as Error).message);
          }
        }
      }

      // Weekly segunda 8h
      if (brt.weekday === 1 && brt.hour === 8 && brt.minute < 15) {
        const flagKey = 'last_analyst_weekly_report';
        const { data: flag } = await supabase.getClient()
          .from('app_flags').select('value').eq('key', flagKey).maybeSingle();
        if (flag?.value !== today) {
          await supabase.getClient()
            .from('app_flags')
            .upsert({ key: flagKey, value: today, updated_at: new Date().toISOString() }, { onConflict: 'key' });
          try {
            const { buildWeeklyReport } = await import('./modules/marketing/analyst-agent.js');
            const { message } = await buildWeeklyReport(supabase.getClient());
            await sendText(config.engineerPhone, message);
            console.log(`[analyst] weekly report sent to ${config.engineerPhone}`);
          } catch (err) {
            console.error('[analyst] weekly report failed:', (err as Error).message);
          }
        }
      }
    };
    setInterval(checkAnalystSchedule, 10 * 60 * 1000);
    console.log('[analyst] scheduler started (daily 9h BRT, weekly Mon 8h BRT)');
  }

  // On-demand: GET /reports/ads-weekly?token=X&format=json|text
  app.get('/reports/ads-weekly', async (req, res) => {
    const token = (req.query.token as string) ?? '';
    if (!evolution.validateWebhookToken(token)) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    try {
      const report = await generateWeeklyReport(supabase.getClient());
      const format = (req.query.format as string) ?? 'json';
      if (format === 'text') {
        res.type('text/plain').send(formatReportForWhatsApp(report));
      } else {
        res.json(report);
      }
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Forca envio do relatorio agora (nao espera domingo). Util pra testar
  // ou rodar on-demand quando Junior quiser ver no WhatsApp.
  app.get('/reports/ads-weekly/send-now', async (req, res) => {
    const token = (req.query.token as string) ?? '';
    if (!evolution.validateWebhookToken(token)) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    try {
      const report = await generateWeeklyReport(supabase.getClient());
      const msg = formatReportForWhatsApp(report);
      await sendText(config.engineerPhone, msg);
      res.json({ status: 'sent', to: config.engineerPhone, report });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Reengagement cadence: check every 2 hours for due touches
  if (!isSandbox && !passiveMode) {
    const runReengagementCheck = async () => {
      try {
        const sent = await reengagement.processDueTouches();
        if (sent > 0) console.log(`[reengagement-cadence] Scheduler sent ${sent} touches`);
      } catch (err) {
        console.error('[reengagement-cadence] Scheduler failed:', err);
      }
    };
    setTimeout(runReengagementCheck, 10 * 60 * 1000); // first check 10 min after boot
    setInterval(runReengagementCheck, 2 * 60 * 60 * 1000); // then every 2h
    console.log('[reengagement-cadence] Scheduler started (every 2h)');
  }

  // Post-install cadence: check every 2 hours for due review/indication touches
  if (!isSandbox && postInstall && !passiveMode) {
    const runPostInstallCheck = async () => {
      try {
        const sent = await postInstall.processDueTouches();
        if (sent > 0) console.log(`[post-install] Scheduler sent ${sent} touches`);
      } catch (err) {
        console.error('[post-install] Scheduler failed:', err);
      }
    };
    setTimeout(runPostInstallCheck, 12 * 60 * 1000);
    setInterval(runPostInstallCheck, 2 * 60 * 60 * 1000);
    console.log('[post-install] Scheduler started (every 2h)');
  }

  // RAG smart-sync: nao-bloqueante, apos boot. Idempotente por hash.
  if (config.openaiApiKey) {
    setTimeout(async () => {
      try {
        const { makeClient, embedTexts } = await import('./modules/rag/embeddings.js');
        const { ingestAll } = await import('./modules/rag/ingest.js');
        const cli = makeClient(config.openaiApiKey!);
        const dir = join(__dirname, '..', 'conhecimento');
        const n = await ingestAll(dir, supabase.getClient(), (t) => embedTexts(t, cli));
        console.log(`[rag] startup sync: ${n} chunks (re)embedados`);
      } catch (e) { console.error('[rag] startup sync falhou:', e); }
    }, 90 * 1000); // 90s apos boot
  } else {
    console.log('[rag] OPENAI_API_KEY ausente — RAG desligado, brain usa so core');
  }

  app.listen(config.port, () => {
    console.log(`[server] Listening on port ${config.port}`);
    console.log(`[server] Webhook URL: http://localhost:${config.port}/webhook`);
    console.log(`[server] Health check: http://localhost:${config.port}/health`);
    console.log(`[server] Learning report: http://localhost:${config.port}/learning`);
    if (isSandbox) {
      console.log('[server] SANDBOX MODE - messages will not be sent to WhatsApp');
    }
  });
}

main().catch(error => {
  console.error('[fatal] Failed to start:', error);
  process.exit(1);
});
