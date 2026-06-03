import express from 'express';
import { loadConfig } from './config.js';
import { EvolutionService } from './modules/evolution.js';
import { MessageQueue } from './modules/queue.js';
import { SupabaseService } from './modules/supabase.js';
import { KnowledgeBase } from './modules/knowledge.js';
import { detectTopics } from './modules/knowledge-topics.js';
import { BlogGenerator, publishDraftToGitHub } from './modules/blog-generator.js';
import { MetaWhatsAppService } from './modules/meta-whatsapp.js';
import { Brain } from './modules/brain.js';
import { DossierBuilder } from './modules/dossier.js';
import { calculateSolarEstimate, formatEstimateForPrompt } from './modules/solar.js';
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
import { MetaLeadgenService, LeadgenPayload, normalizeBrazilianPhone } from './modules/meta-leadgen.js';
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
import { MonitoringService } from './modules/monitoring/service.js';
import { createDashboardRouter } from './modules/dashboard/router.js';
import { resolveChannel } from './modules/dashboard/resolve-channel.js';
import { leadRowToChannelInput } from './modules/dashboard/channel-mapper.js';
import { ProactiveAlertService } from './modules/monitoring/proactive-alerts/service.js';
import { runDispatchCycle, type DispatchCtx } from './modules/monitoring/proactive-alerts/dispatcher.js';
import { runAnniversaryEnqueue } from './modules/monitoring/proactive-alerts/anniversary.js';
import { sendAdminWithButtons } from './modules/eva-admin-buttons.js';
import { runPosInstalacaoNotifCycle } from './modules/relatorios/pos-instalacao/cron.js';
import { PosInstalacaoService } from './modules/relatorios/pos-instalacao/service.js';
import { renderPosInstalacaoHtml } from './modules/relatorios/pos-instalacao/template.js';

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
    not_found: 'O link que você acessou não existe ou foi removido. Se você recebeu esse link da EcoSunPower e ele deveria estar ativo, fale com a gente no WhatsApp.',
    expired: 'Essa proposta passou da data de validade (60 dias após geração). Pra receber uma proposta atualizada, fale com a gente no WhatsApp.',
    error: 'Tivemos um problema temporário ao carregar essa proposta. Tente de novo em alguns minutos ou fale com a gente no WhatsApp.',
  };
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${titles[kind]} — EcoSunPower</title>
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
<a class="btn" href="https://wa.me/5561996978781">Falar no WhatsApp</a>
<div class="brand">EcoSunPower Energia Solar · ecosunpower.eng.br</div>
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
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  const brain = new Brain(config.anthropicApiKey, process.env.GOOGLE_REVIEW_URL ?? '');
  const vision = new VisionAnalyzer(config.anthropicApiKey);
  const transcriber = config.openaiApiKey ? new Transcriber(config.openaiApiKey) : null;
  const knowledgeBase = new KnowledgeBase(join(__dirname, '..', 'conhecimento'));
  const newsScraper = new NewsScraperService(supabase.getClient());
  const blogGenerator = new BlogGenerator(
    new Anthropic({ apiKey: config.anthropicApiKey }),
    supabase.getClient(),
    join(__dirname, '..', 'conhecimento'),
    newsScraper,
  );
  if (config.githubPat) {
    console.log(`[blog] Auto-blog enabled (GitHub repo: ${config.githubSiteRepo}@${config.githubSiteBranch})`);
  } else {
    console.log('[blog] Auto-blog: drafts vao salvar no Supabase mas publicacao no site precisa GITHUB_PAT setado.');
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
  const capiOn = !!(config.metaCapiToken && config.metaWabaBusinessAccountId);
  const capiReporter: CapiReporter = capiOn
    ? makeCapiReporter({
        capi: new MetaCapi({ datasetId: config.metaCapiDatasetId, token: config.metaCapiToken! }),
        wabaId: config.metaWabaBusinessAccountId!,
        getLeadForCapi: (id) => supabase.getLeadForCapi(id),
        recordCapiStage: (id, stage) => supabase.recordCapiStage(id, stage),
      })
    : async () => { /* CAPI off: falta META_CAPI_TOKEN ou META_WABA_BUSINESS_ACCOUNT_ID */ };
  console.log(`[capi] Conversions API ${capiOn ? 'ATIVA' : 'off (falta token/WABA id)'} — dataset ${config.metaCapiDatasetId}`);

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
    redis: followupRedis,
  });
  console.log('[proposal-followup] Servico ativo (notifica toda abertura, throttle 5min)');

  // Eva Fechamento: modo /fechar conversacional pra Junior fechar venda
  // (gera contrato + procuração no Drive). Reusa OAuth do Drive proposal.
  const closingAssistant = new ClosingAssistant({
    llm: createAnthropicLlmCaller(config.anthropicApiKey),
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

  // Modulo 5 — Monitoramento de sistemas FV via API dos inversores.
  // Adapter SolarEdge ja implementado; demais marcas adicionadas conforme
  // Junior cadastrar credenciais.
  const monitoringService = new MonitoringService(supabase);
  // Lista marcas dinamicamente do registry pra confirmar deploy/registry.
  const { marcasSuportadas } = await import('./modules/monitoring/adapter-registry.js');
  console.log(`[monitoring] Servico ativo. Marcas suportadas: ${marcasSuportadas().join(', ')}`);
  console.log(`[monitoring] BUILD_MARKER deye-history-fix-2026-05-08T${new Date().toISOString()}`);

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

  const caseCreator = (config.githubPat && metaWaba)
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
      })
    : null;
  if (!caseCreator) {
    console.warn('[case-creator] /novo-case desabilitado (faltando GITHUB_PAT ou WABA service)');
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

      if (!config.githubPat) {
        // NAO marca como aprovado: deixa em pending pra Junior retentar quando configurar
        // o PAT. Marcar como aprovado fazia o draft sumir de getPendingDrafts e quebrava
        // o retry sem intervencao manual no banco.
        await sendText(from, `⚠️ GitHub PAT nao configurado no Easypanel (env GITHUB_PAT). Draft "${draft.title}" segue como pendente — configure o GITHUB_PAT e responda "publicar" de novo.`);
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
        await sendText(from, `Não achei "${arg}" no cadastro (ativos). Cliente novo? Manda os dados completos.`);
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
        const btns = matches.slice(0, 3).map((mlead) => {
          const buttonId = cmd === 'fechar'
            ? `evabt:fechar-pick:${mlead.id}`
            : `evabt:fechar-doc:${cmd}:${mlead.id}`;
          return { id: buttonId, title: mlead.name.slice(0, 20) };
        });
        const corpo = matches.length === 1
          ? `Achei 1 lead "${termoBusca}":\n${linhaInfo(matches[0])}\n\nÉ esse?`
          : `Achei ${matches.length} leads com "${termoBusca}". Qual?`;
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
      if (/Proposta gerada/i.test(reply) && metaWaba) {
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
        if (leadId) {
          try {
            await metaWaba.sendInteractiveButtons(from, reply, [
              { id: `evabt:fechar:${leadId}`, title: 'Fechou venda' },
            ]);
          } catch {
            await sendText(from, reply);
          }
        } else {
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

  setInterval(() => {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [k, v] of creativeFlowState) {
      if (v.createdAt < cutoff) creativeFlowState.delete(k);
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
    const m = t.match(/^\/email\s+(\S+)\s+(\S+@\S+\.\S+)$/i);
    if (!m) {
      // Help message se parecer comando email mas formato errado
      if (/^\/email\b/i.test(t)) {
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

  // /fechei <nome ou telefone>: marca lead como cliente fechado.
  // status=transferido + opt_out=true => removido da cadencia automaticamente.
  async function tryHandleFecheiCommand(from: string, text: string): Promise<boolean> {
    if (!isAdminPhone(from)) return false;
    const t = text.trim();
    const m = t.match(/^\/fechei\s+(.+)$/i);
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
    await sendText(from, `✅ *${lead.name}* (${lead.phone}) marcado como cliente fechado.\nRemovido da cadência automaticamente. Eva não vai disparar mais template pra ele.`);
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

  // /banner-kits — gera banner premium tabela com 6 kits OnGrid LONGi+Solax.
  // Tabela canonica 2026 (preços oficiais Ecosunpower). Junior pode usar
  // direto como criativo Meta Ads ou pra mandar pra clientes prospects.
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

    await sendText(from, `🎨 Gerando banner premium (${variant}) com 6 kits OnGrid...`);
    try {
      const { renderBannerTabelaKitsHtml } = await import('./modules/marketing/banner-tabela-kits-html.js');
      const KITS_CANONICOS = [
        { kwp: 5.67,  modulos: 9,  microinversores: 3, geracao_kwh_mes: 700,  preco_brl: 15800.61 },
        { kwp: 7.56,  modulos: 12, microinversores: 3, geracao_kwh_mes: 900,  preco_brl: 18476.35 },
        { kwp: 10.08, modulos: 16, microinversores: 4, geracao_kwh_mes: 1200, preco_brl: 22985.00 },
        { kwp: 12.60, modulos: 20, microinversores: 5, geracao_kwh_mes: 1500, preco_brl: 28038.54 },
        { kwp: 16.38, modulos: 26, microinversores: 7, geracao_kwh_mes: 2000, preco_brl: 33766.60 },
        { kwp: 20.79, modulos: 33, microinversores: 9, geracao_kwh_mes: 2500, preco_brl: 42039.77 },
      ];
      const buf = await renderBannerTabelaKitsHtml({ kits: KITS_CANONICOS, variant });

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
          await metaWaba.sendImageById(from, mediaId, `🎨 *Banner ${variant}*\n\n6 kits OnGrid LONGi + Solax · Oferta de Maio\n\n📎 URL alta qualidade (sem compressão WhatsApp):\n${publicUrl}\n\nPra Meta Ads, salvar essa URL e usar como criativo.`);
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

    // Trigger inicial
    const isMenuTrigger = trimmedLower === 'menu' || trimmedLower === '/menu';

    // Clique numa row do menu — id "menu_<modo>"
    const menuClick = text.trim().match(/^menu_([a-z_]+)$/);

    if (!isMenuTrigger && !menuClick) return false;

    if (isMenuTrigger) {
      const sections = [{
        title: 'Modos disponíveis',
        rows: [
          { id: 'menu_criativo', title: '🎨 Gerar Criativo', description: 'Anúncio com 3 imagens + 3 copies' },
          { id: 'menu_banner', title: '🖼️ Banner Promo', description: 'Mega Oferta com kit + preço + foto inversor' },
          { id: 'menu_reativar', title: '🔄 Reativar Base', description: 'Dispara template pros leads terceirizada (10 por vez)' },
          { id: 'menu_preco', title: '💰 Calcular Preço', description: 'Simulação rápida de sistema solar' },
          { id: 'menu_proposta', title: '📋 Gerar Proposta', description: 'PDF + link público propostas.ecosunpower' },
          { id: 'menu_agenda', title: '📅 Agendar Reunião', description: 'Visita técnica ou Meet com cliente' },
          { id: 'menu_novo_case', title: '👤 Cadastrar Case', description: 'Obra concluída pra prova social' },
          { id: 'menu_reviews', title: '✅ Aprovar Reviews', description: 'Reviews públicos pendentes' },
          { id: 'menu_blog', title: '📝 Status Blog', description: 'Drafts pendentes de aprovação' },
        ],
      }];

      let listSent = false;
      if (metaWaba) {
        try {
          await metaWaba.sendInteractiveList(from, {
            header: '⚙️ Menu Admin',
            body: 'O que você quer fazer agora?',
            buttonText: 'Escolher modo',
            sections,
            footer: 'Toque pra abrir',
          });
          listSent = true;
        } catch (err) {
          console.warn('[menu-admin] lista interativa falhou, fallback texto:', (err as Error).message);
        }
      }

      if (!listSent) {
        const lines = sections[0].rows.map(r => `${r.title}\n   _${r.description}_`).join('\n\n');
        await sendText(from,
          `⚙️ *Menu Admin*\n\nO que você quer fazer?\n\n${lines}\n\n` +
          `Responde com o nome (ex: "criativo", "/preco", "/agenda")`);
      }
      return true;
    }

    // Clique numa row → re-roteia chamando o tryHandle* correspondente
    if (menuClick) {
      const modo = menuClick[1];
      // Mapa modo → string-trigger natural (a mesma que cada handler aceita).
      // Cuidado pra usar a forma que cada isXxxTrigger entende: pricing/proposal/scheduling
      // aceitam "/preco" "/proposta" "/agenda"; case-creator aceita "/novo-case";
      // criativo (refatorado) aceita "criativo"; testimonial-admin aceita "/reviews-pendentes";
      // blog aceita "blog status".
      const reroute: Record<string, { trigger: string; handler: (from: string, text: string) => Promise<boolean> }> = {
        criativo:   { trigger: 'criativo',           handler: tryHandleCreativeCommand },
        banner:     { trigger: '/banner',            handler: tryHandleBannerCommand },
        reativar:   { trigger: '/reativar-base 10',  handler: tryHandleReativarBaseCommand },
        preco:      { trigger: '/preco',             handler: tryHandlePricingCommand },
        proposta:   { trigger: '/proposta',          handler: tryHandleProposalCommand },
        fechar:     { trigger: '/fechar',            handler: tryHandleClosingCommand },
        agenda:     { trigger: '/agenda',            handler: tryHandleSchedulingCommand },
        novo_case:  { trigger: '/novo-case',         handler: tryHandleCaseCreatorCommand },
        reviews:    { trigger: '/reviews-pendentes', handler: tryHandleTestimonialAdminCommand },
        blog:       { trigger: 'blog status',        handler: tryHandleJuniorBlogCommand },
      };
      const target = reroute[modo];
      if (!target) {
        await sendText(from, `⚠️ Modo "${modo}" não reconhecido. Manda "menu" pra ver a lista de novo.`);
        return true;
      }
      // Re-roteia. Cada handler ja gateia em isAdminPhone e nao chama menu de volta,
      // entao nao tem risco de loop. Se o handler retornar false (caso edge: modo
      // desabilitado por env var faltando), avisamos.
      const handled = await target.handler(from, target.trigger);
      if (!handled) {
        await sendText(from, `⚠️ Modo "${modo}" indisponível agora (provavelmente env var faltando). Olha os logs do Easypanel.`);
      }
      return true;
    }

    return false;
  }

  // Message handler
  async function handleTextMessage(
    from: string,
    text: string,
    ctwaReferral?: import('./modules/evolution.js').IncomingMessage['referral'],
  ) {
    // Hook: se essa mensagem eh de cliente que recebeu followup automatico
    // de proposta, marca como "cliente respondeu" no banco. Fire-and-forget,
    // nao bloqueia o handler. No-op se nao houver proposta correspondente.
    proposalFollowup.markClienteRespondeu(from);

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

    // Opt-out do CLIENTE — detecta "sair"/"parar"/"stop"/etc antes de qualquer
    // outro handler pra parar de mandar mensagens imediatamente.
    if (await tryHandleClienteOptOut(from, text)) return;

    // /menu (Junior) — lista interativa com TODOS os modos admin. Vem ANTES de
    // tudo pra Junior conseguir abrir o menu mesmo dentro de outro modo (escapa).
    // Cliques nas rows tambem chegam aqui (id "menu_<modo>") e re-roteiam pra
    // tryHandle* correspondente. Gateado em isAdminPhone — cliente nem entra.
    if (await tryHandleMenuCommand(from, text)) return;

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

    // /fechei — marca lead como cliente fechado (remove da cadência)
    if (await tryHandleFecheiCommand(from, text)) return;

    // /email — adiciona/atualiza email de um lead
    if (await tryHandleEmailCommand(from, text)) return;

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

    // Eva Precificadora tem prioridade total quando Junior usa /preco ou esta em modo
    if (await tryHandlePricingCommand(from, text)) return;

    // Eva Proposta — Junior gera proposta comercial completa (PDF + web)
    if (await tryHandleProposalCommand(from, text)) return;

    // Eva Fechamento — Junior gera contrato + procuração via /fechar
    if (await tryHandleClosingCommand(from, text)) return;

    // Eva Agendadora — prioridade depois do pricing
    if (await tryHandleSchedulingCommand(from, text)) return;

    if (await takeover.isPaused(from)) {
      console.log(`[takeover] Skipping message from ${from} — human takeover active`);
      return;
    }
    try {
      let lead = await supabase.getLeadByPhone(from);

      // Bloqueio: se lead existe e Eva esta INATIVA pra ele, ignora (Junior atende manual)
      // Lead novo (lead == null) sempre passa — sera criado com eva_active=true (default).
      if (lead && (lead as any).eva_active === false) {
        console.log(`[eva-active] Skipping message from ${from} — eva_active=false (Junior atende)`);
        return;
      }

      // Se cliente respondeu antes do delay 2h da intro automatica, cancela a intro.
      // (lead?.id pode ser null aqui pra primeira mensagem de lead novo — sem intro pra cancelar)
      if (lead?.id) {
        await supabase.cancelEvaIntro(lead.id, 'client_replied').catch(() => {});
      }

      // If this lead has an active reengagement cadence, cancel it — they replied
      if (lead?.id && await reengagement.hasPendingTouches(lead.id)) {
        const canceled = await reengagement.cancelAllTouches(lead.id);
        console.log(`[reengagement] Canceled ${canceled} pending touches for ${from} (replied)`);
      }
      // Cliente respondeu — reseta cadencia de auto-followup pro proximo silencio
      // comecar do step 1. NAO aplica pra leads 'perdido' (esses tem cadencia
      // semestral propria — resetForLead ja filtra step<100 internamente mas
      // melhor nem chamar se for perdido).
      // Cast porque LeadData.status enum nao lista 'perdido' mas codigo usa.
      if (lead?.id && (lead.status as string) !== 'perdido') {
        await followup.resetForLead(lead.id).catch(() => { /* nao critico */ });
      }
      const isNewLead = !lead;

      if (!lead) {
        const result = await supabase.upsertLead({ phone: from, status: 'novo' });
        lead = { id: result.id, phone: from } as NonNullable<typeof lead>;
      }

      const leadId = lead.id;

      // CAPI estagio 1 (Lead): se o lead chegou por anuncio Click-to-WhatsApp,
      // o referral traz o ctwa_clid. Guarda no lead (pra usar nos estagios
      // seguintes) e devolve o evento "Lead" pra Meta. Fire-and-forget.
      if (ctwaReferral?.ctwaClid) {
        await supabase
          .upsertLead({ phone: from, ctwa_clid: ctwaReferral.ctwaClid })
          .catch((err) => console.warn('[capi] falha ao salvar ctwa_clid:', (err as Error).message));
        void capiReporter(leadId, 'Lead');
      }

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
            await supabase.getClient()
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

      // 🎯 Alerta proativo Eva → Junior: lead novo Google Ads (Search).
      // Dispara so na PRIMEIRA mensagem do lead com tag #gad-*, idempotente
      // via app_flags (lock_key=alert_new_gads_<leadId>). Texto rico parseando
      // cidade/conta da mensagem pre-preenchida da landing /cotacao.
      // Fire-and-forget: nunca bloqueia processamento normal.
      if (isNewLead && detectedOrigin && detectedOrigin.source === 'ad_google_cta_wa') {
        void (async () => {
          try {
            const { alertNewLeadGoogleAds } = await import('./modules/eva-alerts.js');
            const freshLead = await supabase.getLeadByPhone(from);
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

      const conversation = await supabase.getOrCreateConversation(leadId);

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
      //  3. Default global `eva_qualificacao_v1` — lead sem anuncio nem
      //     campanha. Se nao estiver aprovado na Meta (erro 132001), cai
      //     no fallback `reativacao_lead_v1` (aprovado). TODOS os templates
      //     roteados aqui usam 1 var de body {{1}}=primeiro nome.
      if (metaWaba) {
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
          const templateName = mappedTemplate ?? 'eva_qualificacao_v1';
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
              const estimate = await calculateSolarEstimate(
                lead.city,
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

4. **Se conta >= R$700 OU consumo >= 700 kWh:** lead qualificado. Pivota IMEDIATAMENTE pra:
   - Agendar visita tecnica (use /agenda no admin) OU
   - Enviar proposta personalizada (use /proposta no admin)
   Nao fica em loop de "deixa eu te explicar como funciona".

5. **Se conta < R$700:** explica polidamente que o investimento nao retorna bem com conta abaixo desse patamar, oferece kit menor de demonstracao ou agradece e fecha.

6. **Senso de urgencia respeitoso:** pode mencionar "essa condicao da campanha vai ate o final do mes" ou "esses kits sao limitados pelo estoque do mes" — SEM mentir, SEM forcar.

7. **Fechamento direto:** sempre termine o turno com uma pergunta acionavel ou um CTA claro. NUNCA termine com "qualquer duvida estou aqui" — termine com "posso te mandar a proposta agora?" ou "que dia voce esta livre pra eu visitar?".

8. **Tom:** mais firme que de costume. Cliente quer COMPRAR — voce e a vendedora consultiva que ajuda ele a escolher rapido, nao a tecnica que explica fisica solar por 20 minutos.
`;
          }
        }
      }

      // Brain híbrido: 6 core files sempre injetados + chunks RAG quando disponível.
      // retrieveChunks nunca lança — retorna [] em qualquer falha (fallback core-only).
      const { loadCoreContent } = await import('./modules/rag/core-files.js');
      const { retrieveChunks } = await import('./modules/rag/retrieve.js');
      const { makeClient, embedTexts } = await import('./modules/rag/embeddings.js');
      const { buildHybridKnowledge } = await import('./modules/rag/hybrid.js');
      const coreContent = loadCoreContent(join(__dirname, '..', 'conhecimento'));
      const chunks = config.openaiApiKey
        ? await retrieveChunks(text, supabase.getClient(), config,
            (q) => embedTexts(q, makeClient(config.openaiApiKey!)))
        : [];
      const knowledge = buildHybridKnowledge(coreContent, chunks) + leadContext;
      if (chunks.length > 0) {
        console.log(`[rag] ${chunks.length} chunk(s) recuperados para o brain`);
      }

      const response = await brain.processMessage(
        text,
        history,
        knowledge,
        conversation.summary,
        conversation.qualification_step
      );

      // Send response (possibly split across multiple WhatsApp messages)
      if (!isSandbox) {
        for (const part of response.displayMessages) {
          await sendText(from, part);
        }
      } else {
        for (const part of response.displayMessages) {
          console.log(`[sandbox] Would send to ${from}: ${part}`);
        }
      }

      // Update conversation
      const updatedMessages = [
        ...conversation.messages,
        { role: 'user' as const, content: text, timestamp: new Date().toISOString() },
        { role: 'assistant' as const, content: response.text, timestamp: new Date().toISOString() },
      ];

      const messagesToKeep = updatedMessages.slice(-20);

      await supabase.updateConversation(conversation.id, {
        messages: messagesToKeep,
        summary: conversation.summary,
        message_count: conversation.message_count + 2,
        qualification_step: conversation.qualification_step,
      });

      // Handle actions from Claude (may be multiple in a single response)
      for (const act of response.actions) {
        try {
          await handleAction(act, leadId, from, conversation.id);
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
          const freshEscal = await supabase.getLeadByPhone(from);
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
    conversationId: string
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

        await supabase.upsertLead(leadUpdate as unknown as Parameters<typeof supabase.upsertLead>[0]);
        console.log(`[action] Updated lead ${from}:`, Object.keys(leadUpdate).join(', '));

        // Rede de proteção: se o lead acabou de cruzar o criterio minimo
        // (conta>=R$700 ou >=700 kWh), avisa o Junior NA HORA — independente
        // da Eva emitir qualification_complete depois (ela as vezes trava, ex
        // pedindo CPF, e nunca fecha). Idempotente 1x/lead (lock compartilhado
        // com a varredura). Best-effort: nunca quebra o fluxo da action.
        if (leadUpdate.energy_data) {
          try {
            const fresh = await supabase.getLeadByPhone(from);
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
        const existingLead = await supabase.getLeadByPhone(from);
        if (existingLead?.status === 'agendado') {
          console.log(`[qualification_complete] lead ${from} ja agendado — pula alerta duplicado`);
          break;
        }
        await supabase.upsertLead({ phone: from, status: 'qualificado' });
        // CAPI estagio 2: lead passou no criterio (R$700/700kWh). Carimbo
        // 'lead_qualificado' pra Meta — alvo de otimizacao. Fire-and-forget.
        void capiReporter(leadId, 'lead_qualificado');
        await supabase.updateConversation(conversationId, {
          qualification_step: 'qualificacao_completa',
          // session_status removido — Eva fica ativa pra continuar buscando agendamento.
        });

        const lead = await supabase.getLeadByPhone(from);
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

          await supabase.saveDossier({
            lead_id: leadId,
            content: action.data,
            formatted_text: dossierText,
            status: 'sent',
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
              : bill && bill >= 700 ? '🟠 MORNO'
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
        await supabase.upsertLead({ phone: from, status: 'transferido' });
        await supabase.updateConversation(conversationId, {
          qualification_step: 'transferido',
          session_status: 'completed',
        });

        const lead = await supabase.getLeadByPhone(from) as (Record<string, unknown> | null);
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

        let transferMsg: string;
        let buttons: Array<{ id: string; title: string }>;
        if (isContatoComercial) {
          transferMsg = `🔔 CONTATO COMERCIAL${contactTypeLabel}\n\nContato: ${from}${nameLabel}\nFalar direto: wa.me/${from}\n\nMotivo:\n${reason}\n\nA Eva deu uma resposta curta e está em pausa nesse chat. O que você quer fazer?`;
          buttons = [
            { id: `evabt:lead-pause:${leadId}`, title: 'Responder' },
            { id: `evabt:lead-optout:${leadId}`, title: 'Ignorar' },
          ];
        } else {
          transferMsg = `🔔 TRANSFERENCIA DE ATENDIMENTO${contactTypeLabel}\n\nContato: ${from}${nameLabel}\nFalar direto: wa.me/${from}\n\nMotivo:\n${reason}\n\nVocê pode assumir esse atendimento. A Eva fica em pausa nesse chat.`;
          buttons = [
            { id: `evabt:lead-pause:${leadId}`, title: 'Assumir' },
            { id: `evabt:lead-view:${leadId}`, title: 'Ver perfil' },
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
          const leadNow = await supabase.getLeadByPhone(from);
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

          const lead = await supabase.getLeadByPhone(from);
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
          await supabase.upsertLead({ phone: from, status: 'agendado' });
          await supabase.cancelCadence(leadId, 'visita_agendada').catch(() => {});

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
        await supabase.getClient()
          .from('leads')
          .update({ opt_out: true, updated_at: new Date().toISOString() })
          .eq('phone', from);
        // Also cancel any pending reengagement touches
        const canceled = await reengagement.cancelAllTouches(leadId);
        if (canceled > 0) console.log(`[reengagement] Canceled ${canceled} touches after opt-out`);
        // Also cancel pending post-install touches
        if (postInstall) {
          const canceledPost = await postInstall.cancelAll(leadId);
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
        await supabase.getClient()
          .from('leads')
          .update({ opt_out: true, eva_active: false, status: 'perdido', updated_at: now })
          .eq('phone', from);
        // Cancela cadencia/reengagement/postinstall pendente
        await supabase.cancelCadence(leadId, 'off_topic').catch(() => {});
        await reengagement.cancelAllTouches(leadId).catch(() => 0);
        if (postInstall) await postInstall.cancelAll(leadId).catch(() => 0);
        // Notifica Junior com botoes pra desfazer se foi falso positivo
        if (!isSandbox) {
          const lead = await supabase.getLeadByPhone(from);
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
        const dqReason = (action.data as Record<string, unknown> | undefined)?.reason as string | undefined ?? 'lead fora do criterio (R$700/700kWh) ou vulneravel';
        // Fetch UMA vez (id imutavel) e reusa pra nome + botoes — parity com
        // mark_off_topic, sem round-trip extra de DB nesse path terminal.
        const dqLead = await supabase.getLeadByPhone(from);
        const { leadPatch, notifyBody } = buildDisqualifyPlan({
          reason: dqReason,
          leadName: dqLead?.name,
          phone: from,
        });
        await supabase.getClient()
          .from('leads')
          .update(leadPatch)
          .eq('phone', from);
        await supabase.cancelCadence(leadId, 'disqualify_lead').catch(() => {});
        await reengagement.cancelAllTouches(leadId).catch(() => 0);
        if (postInstall) await postInstall.cancelAll(leadId).catch(() => 0);
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
          await postInstall.markReviewConfirmed(leadId);
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
          });
          if (saved.duplicate) {
            console.log(`[action] Testimonial already existed ${saved.id} (${fmt}), skipping notification`);
            break;
          }
          console.log(`[action] Testimonial saved ${saved.id} (${fmt}) for ${from}`);
          // Se depoimento em video ou audio positivo, avisar Junior pra usar no marketing
          if ((fmt === 'video' || fmt === 'audio') && sentiment === 'positivo' && !isSandbox) {
            // getLeadByPhone e best-effort: falha aqui nao deve estourar o handler
            const lead = await supabase.getLeadByPhone(from).catch(() => null);
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
    }

    // Handle contact_type if present
    if (action.data.contact_type) {
      await supabase.getClient()
        .from('leads')
        .update({ contact_type: action.data.contact_type, updated_at: new Date().toISOString() })
        .eq('phone', from);
    }

    // Handle "perdido" status (bought from competitor)
    if (action.data.status === 'perdido') {
      await supabase.getClient()
        .from('leads')
        .update({ status: 'inativo', contact_type: 'perdido', updated_at: new Date().toISOString() })
        .eq('phone', from);
      console.log(`[action] Lead ${from} marked as lost (bought from competitor)`);
    }
  }

  // Helper: se cliente respondeu (qualquer midia/texto), cancela intro pendente
  // E CADENCIA PENDENTE pra Eva nao mandar toques automatizados depois da
  // conversa ja iniciada. Eva entra no fluxo normal de qualificacao.
  async function cancelIntroIfPending(from: string): Promise<void> {
    const lead = await supabase.getLeadByPhone(from);
    if (!lead?.id) return;
    await supabase.cancelEvaIntro(lead.id, 'client_replied').catch(() => {});
    const cancelled = await supabase.cancelCadence(lead.id, 'client_replied').catch(() => 0);
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
  async function handleAudioMessage(from: string, messageId: string) {
    if (await takeover.isPaused(from)) {
      console.log(`[takeover] Skipping audio from ${from} — human takeover active`);
      return;
    }
    if (!(await supabase.isEvaActiveForPhone(from))) {
      console.log(`[eva-active] Skipping audio from ${from} — eva_active=false`);
      return;
    }
    await cancelIntroIfPending(from);
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

      const text = await transcriber.transcribeFromBase64(media.base64, media.mimetype);
      if (!text) {
        const msg = 'O audio ficou um pouco dificil de entender. Pode mandar de novo ou escrever por texto? 😊';
        if (!isSandbox) await sendText(from, msg);
        return;
      }

      console.log(`[audio] Transcribed from ${from}: "${text.substring(0, 80)}..."`);
      await handleTextMessage(from, text);
    } catch (error) {
      console.error(`[audio] Error processing audio from ${from}:`, error);
      const msg = 'Nao consegui processar o audio. Pode me enviar por texto? 😊';
      if (!isSandbox) await sendText(from, msg);
    }
  }

  // Handle image messages
  async function handleImageMessage(from: string, messageId: string) {
    if (await tryHandleCaseCreatorMedia(from, messageId, 'image')) return;
    if (await tryHandleProposalMedia(from, messageId, 'image')) return;

    if (await takeover.isPaused(from)) {
      console.log(`[takeover] Skipping image from ${from} — human takeover active`);
      return;
    }
    if (!(await supabase.isEvaActiveForPhone(from))) {
      console.log(`[eva-active] Skipping image from ${from} — eva_active=false`);
      return;
    }
    await cancelIntroIfPending(from);
    try {
      const lead = await supabase.getLeadByPhone(from);
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

      const imageDataUrl = `data:${media.mimetype};base64,${media.base64}`;
      const analysisText = await vision.analyzeImage(imageDataUrl, context);
      const displayText = brain.getDisplayText(analysisText);
      const action = brain.parseAction(analysisText);
      // Guard: se o sanitizer/getDisplayText zerou tudo (modelo so mandou
      // scaffolding), nunca manda mensagem vazia pro cliente que enviou foto.
      const safeDisplay = displayText.trim()
        ? displayText
        : 'Recebi sua imagem! 📸 Pra eu te ajudar certinho — é energia solar pra você? Se puder, me manda também o valor médio da sua conta de luz.';

      if (!isSandbox) {
        await sendText(from, safeDisplay);
      } else {
        console.log(`[sandbox] Image analysis for ${from}: ${safeDisplay}`);
      }

      // Save to conversation
      if (lead) {
        const conversation = await supabase.getOrCreateConversation(lead.id);
        const updatedMessages = [
          ...conversation.messages,
          { role: 'user' as const, content: '[Enviou uma foto]', timestamp: new Date().toISOString() },
          { role: 'assistant' as const, content: safeDisplay, timestamp: new Date().toISOString() },
        ];
        await supabase.updateConversation(conversation.id, {
          messages: updatedMessages.slice(-20),
          message_count: conversation.message_count + 2,
        });

        // Handle actions (update_lead with energy data from bill photo)
        if (action) {
          await handleAction(action, lead.id, from, conversation.id);
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
  async function handleVideoMessage(from: string, messageId: string, caption?: string) {
    if (await tryHandleCaseCreatorMedia(from, messageId, 'video')) return;
    if (await tryHandleProposalMedia(from, messageId, 'video')) return;

    if (await takeover.isPaused(from)) {
      console.log(`[takeover] Skipping video from ${from} — human takeover active`);
      return;
    }
    if (!(await supabase.isEvaActiveForPhone(from))) {
      console.log(`[eva-active] Skipping video from ${from} — eva_active=false`);
      return;
    }
    await cancelIntroIfPending(from);
    try {
      const lead = await supabase.getLeadByPhone(from);
      if (!isSandbox) await sendText(from, 'Recebi o video! Deixa eu dar uma olhada...');

      const media = await messaging.getMediaBase64(messageId);
      if (!media) {
        if (!isSandbox) await sendText(from, 'nao consegui baixar o video aqui, pode tentar enviar de novo?');
        return;
      }

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
      await handleTextMessage(from, parts.join(' '));

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
  async function handleDocumentMessage(from: string, messageId: string, mimetype: string) {
    // PRIORIDADE: se Junior anexou doc pra proposta personalizada, captura aqui
    if (await tryHandleProposalMedia(from, messageId, 'document')) return;

    if (await takeover.isPaused(from)) {
      console.log(`[takeover] Skipping document from ${from} — human takeover active`);
      return;
    }
    if (!(await supabase.isEvaActiveForPhone(from))) {
      console.log(`[eva-active] Skipping document from ${from} — eva_active=false`);
      return;
    }
    await cancelIntroIfPending(from);
    try {
      if (!mimetype.includes('pdf')) {
        const msg = 'Recebi o arquivo! Por enquanto consigo analisar PDFs e imagens. Se for uma conta de luz, pode mandar como foto ou PDF 😊';
        if (!isSandbox) await sendText(from, msg);
        return;
      }

      const lead = await supabase.getLeadByPhone(from);
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

      // Use Claude to analyze the PDF
      const analysisResponse = await new Anthropic({ apiKey: config.anthropicApiKey }).messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: media.base64 },
              },
              {
                type: 'text',
                text: `Voce e a Eva, consultora de energia solar da Ecosunpower.
O cliente enviou este PDF. Provavelmente e uma conta de luz.

Extraia e apresente de forma curta:
- Distribuidora (Neoenergia/CEB ou Equatorial/CELG)
- Consumo em kWh
- Valor em R$
- Grupo (A ou B)
- Demanda contratada (se Grupo A)

Confirme os dados com o cliente.
Inclua JSON: \`\`\`json\n{"action":"update_lead","data":{"energy_data":{"monthly_bill":VALOR,"consumption_kwh":CONSUMO,"group":"B"}}}\n\`\`\`

Se NAO for conta de luz, descreva o que e e responda naturalmente.
Contexto: ${context}
Responda CURTO, maximo 2 paragrafos.`,
              },
            ],
          },
        ],
      });

      const analysisText = analysisResponse.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('');

      const displayText = brain.getDisplayText(analysisText);
      const action = brain.parseAction(analysisText);

      if (!isSandbox) {
        await sendText(from, displayText);
      } else {
        console.log(`[sandbox] PDF analysis for ${from}: ${displayText}`);
      }

      // Save to conversation
      if (lead) {
        const conversation = await supabase.getOrCreateConversation(lead.id);
        const updatedMessages = [
          ...conversation.messages,
          { role: 'user' as const, content: '[Enviou um PDF]', timestamp: new Date().toISOString() },
          { role: 'assistant' as const, content: analysisText, timestamp: new Date().toISOString() },
        ];
        await supabase.updateConversation(conversation.id, {
          messages: updatedMessages.slice(-20),
          message_count: conversation.message_count + 2,
        });
        if (action) await handleAction(action, lead.id, from, conversation.id);
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
    // Seed WhatsApp profile name as lead.name if we don't have a name yet
    if (msg.pushName) {
      const trimmed = msg.pushName.trim();
      const looksLikeNumber = /^\+?\d/.test(trimmed);
      if (trimmed && !looksLikeNumber) {
        try {
          const existing = await supabase.getLeadByPhone(msg.from);
          if (!existing?.name) {
            await supabase.upsertLead({ phone: msg.from, name: trimmed });
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
        await handleTextMessage(msg.from, msg.content, msg.referral);
        break;
      case 'audio':
        await handleAudioMessage(msg.from, mediaRef(msg.content, msg.messageId));
        break;
      case 'image':
        await handleImageMessage(msg.from, mediaRef(msg.content, msg.messageId));
        break;
      case 'video':
        await handleVideoMessage(msg.from, mediaRef(msg.content, msg.messageId), msg.caption);
        break;
      case 'document':
        // Apos fix do parseMessage: msg.content = media_id (igual image/video),
        // msg.mimeType = mime_type. Permite tryHandleProposalMedia baixar pelo media_id.
        await handleDocumentMessage(
          msg.from,
          mediaRef(msg.content, msg.messageId),
          msg.mimeType ?? msg.content,
        );
        break;
      case 'location': {
        try {
          const parsed = JSON.parse(msg.content) as { lat?: number; lng?: number };
          if (typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
            const coords = `${parsed.lat.toFixed(6)},${parsed.lng.toFixed(6)}`;
            const mapsUrl = `https://www.google.com/maps?q=${coords}`;
            // Persist on the lead so Eva can use in schedule_visit later
            const existing = await supabase.getLeadByPhone(msg.from);
            const mergedEnergy = {
              ...(existing?.energy_data as Record<string, unknown> | undefined ?? {}),
              shared_coordinates: coords,
              shared_maps_url: mapsUrl,
            };
            await supabase.upsertLead({ phone: msg.from, energy_data: mergedEnergy });
            console.log(`[location] Saved coords for ${msg.from}: ${coords}`);
            await handleTextMessage(
              msg.from,
              `[O cliente acabou de compartilhar a localizacao exata pelo WhatsApp. Coordenadas: ${coords}. Link do Maps: ${mapsUrl}. Use essas coordenadas no campo client_coordinates quando for agendar a visita. Agora pergunte o endereco textual (rua/numero/bairro) pra complementar, caso ainda nao tenha.]`,
            );
          } else {
            await handleTextMessage(msg.from, `[Cliente compartilhou localizacao mas nao foi possivel ler as coordenadas.]`);
          }
        } catch {
          await handleTextMessage(msg.from, `[Cliente compartilhou localizacao: ${msg.content}]`);
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

    // IMPORTANTE: respondemos 200 imediato. Meta tem timeout agressivo (5s) e
    // retenta se nao receber resposta rapida. O processamento e async.
    res.status(200).json({ status: 'received' });

    const payload = req.body as LeadgenPayload & { sample?: { field: string; value: unknown } };
    // Teste do painel Webhooks manda `{ sample: {...} }` sem object=page. Loga e
    // retorna pra reviewer ver 200, mas sem processar (IDs sao fake 4444...).
    if (payload.sample) {
      console.log('[meta-leadgen] Test payload from Webhooks panel received (sample data, no processing)');
      return;
    }
    if (payload.object !== 'page') {
      console.log(`[meta-leadgen] Payload object != 'page' (got '${payload.object}'), skipping`);
      return;
    }
    console.log(`[meta-leadgen] Processing leadgen webhook (${payload.entry?.length ?? 0} entries)`);

    // Processa cada entry / change de forma independente (varios leads
    // podem chegar no mesmo payload em teoria). Erros nao devem derrubar
    // os outros — cada um tem try/catch isolado.
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'leadgen') continue;
        const leadgenId = change.value.leadgen_id;
        if (!leadgenId) continue;

        try {
          // 1) Grava evento minimo PRIMEIRO pra dedup (custa so 1 INSERT).
          //    Se retry, o unique index barra aqui e evitamos re-fetch no Graph API.
          const minimalDetails = {
            leadgen_id: leadgenId,
            field_data: [],
          };
          const { isNew } = await metaLeadgen.recordEvent(minimalDetails, change.value);
          if (!isNew) {
            console.log(`[meta-leadgen] Event ${leadgenId} already received, skipping (dedup)`);
            continue;
          }

          // 2) So agora paga o Graph API pra detalhes completos
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
            continue;
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
          // Computa canal canônico a partir dos campos de atribuição desta
          // atualização. ad_campaign_id tem prioridade máxima em resolveChannel
          // (qualquer campaign_id = meta). lead_source entra se for lead novo.
          updatePayload.channel = resolveChannel(leadRowToChannelInput(updatePayload));
          await supabase.getClient()
            .from('leads')
            .update(updatePayload)
            .eq('id', leadId);

          try {
            await metaLeadgen.markEventProcessed(leadgenId, leadId);
          } catch (err) {
            console.error(`[meta-leadgen] markEventProcessed failed for ${leadgenId}:`, (err as Error).message);
          }

          // C3 — anti double-welcome: se welcome_sent_at ja tem valor, nao
          // agenda de novo. Cliente ja recebeu a primeira mensagem.
          // Cast dinamico porque LeadData interface nao lista colunas de migrations recentes.
          const existingWelcome = (existing as Record<string, unknown> | null)?.welcome_sent_at as string | null | undefined;
          if (existingWelcome) {
            console.log(`[meta-leadgen] Welcome already sent for ${normalized.phone} at ${existingWelcome}, skipping`);
            continue;
          }

          // Agenda mensagem proativa com delay humano (1-3 min) pra nao parecer bot.
          // TODO futuro: persistir a fila em DB pra recover no restart (hoje um restart
          // entre o recebimento e o disparo perde o welcome).
          const delayMs = 60000 + Math.floor(Math.random() * 120000); // 60-180s
          setTimeout(async () => {
            try {
              // Recheck dentro do timeout (mais uma camada de protecao contra race)
              const beforeSend = await supabase.getLeadByPhone(normalized.phone as string);
              const beforeWelcome = (beforeSend as Record<string, unknown> | null)?.welcome_sent_at;
              if (beforeWelcome) {
                console.log(`[meta-leadgen] Welcome already sent during delay, skipping`);
                return;
              }

              const welcome = await metaLeadgen.generateWelcome(
                normalized,
                details,
                knowledgeBase.getCore(),
              );
              await sendText(normalized.phone as string, welcome);

              // Marca welcome_sent_at pra bloquear futuros re-welcomes
              await supabase.getClient()
                .from('leads')
                .update({ welcome_sent_at: new Date().toISOString() })
                .eq('id', leadId);

              const conversation = await supabase.getOrCreateConversation(leadId);
              await supabase.updateConversation(conversation.id, {
                messages: [
                  ...conversation.messages,
                  { role: 'assistant' as const, content: welcome, timestamp: new Date().toISOString() },
                ],
                message_count: conversation.message_count + 1,
              });
              console.log(`[meta-leadgen] Welcome sent to ${normalized.phone} (lead ${leadId}) after ${(delayMs / 1000).toFixed(0)}s`);
            } catch (err) {
              console.error(`[meta-leadgen] Welcome failed for ${leadId}:`, (err as Error).message);
            }
          }, delayMs);

          console.log(`[meta-leadgen] Lead ${leadgenId} -> ${leadId} (${normalized.phone}, ${platform}, hot=${isHot}), welcome em ${(delayMs / 1000).toFixed(0)}s`);
        } catch (err) {
          console.error(`[meta-leadgen] Processing ${leadgenId} failed:`, (err as Error).message);
          await metaLeadgen.markEventFailed(leadgenId, (err as Error).message).catch((e) => {
            console.error(`[meta-leadgen] markEventFailed also failed:`, (e as Error).message);
          });
        }
      }
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

        console.log(`[waba] 📥 Mensagem recebida de ${parsed.from} (${parsed.type}): ${parsed.content.slice(0, 80)}`);

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
  <div style="color:#888;font-size:13px;margin-bottom:4px">rascunho de post — ecosunpower</div>
  <h1 style="margin:0 0 16px 0;font-size:22px">${esc(draft.topic)}</h1>
  ${previewHtml}
  <div style="background:#f5f5f5;padding:14px 16px;border-radius:10px;white-space:pre-wrap;font-size:15px;line-height:1.5;margin-bottom:20px;word-break:break-word">${esc(draft.caption)}</div>
  <a href="${approveUrl}" style="display:block;background:#16a34a;color:#fff;text-decoration:none;text-align:center;padding:18px;border-radius:10px;font-size:17px;font-weight:600;margin-bottom:10px">✅ Aprovar e publicar</a>
  <a href="${regenUrl}" style="display:block;background:#eab308;color:#fff;text-decoration:none;text-align:center;padding:18px;border-radius:10px;font-size:17px;font-weight:600;margin-bottom:10px">🔄 Gerar outra imagem</a>
  <a href="${discardUrl}" style="display:block;background:#dc2626;color:#fff;text-decoration:none;text-align:center;padding:18px;border-radius:10px;font-size:17px;font-weight:600">❌ Descartar</a>
  <p style="color:#999;font-size:12px;text-align:center;margin-top:20px">ecosunpower energia solar — painel de aprovacao de conteudo</p>
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
          const welcome = await metaLeadgen.generateWelcome(
            normalized,
            fakeDetails,
            knowledgeBase.getCore(),
          );
          await sendText(normalized.phone as string, welcome);
          await supabase.getClient()
            .from('leads')
            .update({ welcome_sent_at: new Date().toISOString() })
            .eq('id', leadId);
          console.log(`[meta-leadgen-test] Welcome sent to ${normalized.phone}: "${welcome.slice(0, 80)}..."`);
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
    const systemPrompt = `Voce gera mensagens de reengajamento no WhatsApp em nome do Junior (dono da Ecosunpower Energia Solar, Brasilia/DF e Goias). Publico: pessoas que ja conversaram com ele sobre solar mas nao fecharam.

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
      `Oi ${name}, tudo bem? Aqui e o Junior da Ecosunpower. Faz um tempinho que a gente nao se fala, dei uma olhada nos contatos e lembrei de voce. Queria saber como ta a situacao da conta de luz ai e se tem interesse em dar uma atualizada. Sem compromisso.`;

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

  // Dashboard interno EcoSun (Modulo 3 da plataforma). Auth basica via senha
  // env DASHBOARD_PASSWORD. Rotas: /dashboard/home, /dashboard/propostas,
  // /dashboard/manutencao. Mais paginas serao adicionadas em fases.
  app.use('/dashboard', createDashboardRouter(supabase, monitoringService, {
    metaWabaAccessToken: config.metaWabaAccessToken,
    anthropicApiKey: config.anthropicApiKey,
    sendText,
    proposalAssistant,
    metaService: metaWaba ?? undefined,
  }));

  // que abre HTML como codigo fonte.
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
              // Importa logo base64 dinamicamente pra adicionar watermark sobre o video
              const { LOGO_ECOSUNPOWER_BRANCO_BASE64 } = await import('./modules/proposal/assets/logo-base64.js');
              const videoTag = `<div style="position:relative">
  <video controls autoplay muted loop playsinline style="width:100%;border-radius:12px;display:block;background:#000">
    <source src="${signed.signedUrl}" type="video/mp4">
    Seu navegador não suporta vídeo HTML5.
  </video>
  <img src="${LOGO_ECOSUNPOWER_BRANCO_BASE64}" alt="EcoSunPower" style="position:absolute;bottom:50px;right:8px;max-width:14%;max-height:32px;opacity:0.85;filter:drop-shadow(0 1px 4px rgba(0,0,0,0.4));pointer-events:none">
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
            proposalFollowup.triggerOnView(slug, result.acessosAntes);
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
      const d = await montarDadosRelatorio(
        { getDetalhe: (id) => monitoringService.getDetalheSistema(id) }, r.sistemaId, 'acompanhamento');
      if ('erro' in d) return res.status(500).type('text/html').send(propostaErrorHtml('error'));
      if (req.query.pdf === '1') {
        const { htmlToPdf } = await import('./modules/proposal/pdf-generator.js');
        const pdf = await htmlToPdf(renderRelatorioHtml(d, 'acompanhamento'));
        res.type('application/pdf').set('Content-Disposition', 'inline; filename="relatorio.pdf"').send(pdf);
        return;
      }
      res.type('text/html').send(renderRelatorioHtml(d, 'acompanhamento'));
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

  // Pagina publica de Politica de Privacidade pra uso nos Lead Ads da Meta.
  // LGPD (Lei 13.709/2018) exige transparencia sobre coleta/uso de dados.
  // URL publica: /privacidade (usar no campo do Meta Lead Form)
  app.get('/privacidade', (_req, res) => {
    const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Politica de Privacidade — Ecosunpower Energia Solar</title>
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
<p class="meta"><strong>ECOSUNPOWER ENERGIA SOLAR LTDA</strong><br>
CNPJ: 33.020.459/0001-06<br>
SHA Conjunto 01 Chacara 44C Lote 6, Arniqueira, Brasilia - DF, CEP 71993-150<br>
Ultima atualizacao: 26 de abril de 2026</p>

<h2>1. Quem somos</h2>
<p>A ECOSUNPOWER ENERGIA SOLAR LTDA (CNPJ 33.020.459/0001-06) e empresa de engenharia em energia, com foco principal em solar fotovoltaica e atuacao em Brasilia-DF e Goias desde 2019. Nos comprometemos com a protecao dos seus dados pessoais, em conformidade com a Lei Geral de Protecao de Dados (Lei 13.709/2018 - LGPD).</p>

<h2>1.1 Encarregado de Protecao de Dados (DPO)</h2>
<p>Conforme art. 41 da LGPD, indicamos como Encarregado:</p>
<ul>
  <li><strong>Nome:</strong> Junior Candido Rodrigues</li>
  <li><strong>Email:</strong> <a href="mailto:junior@ecosunpower.eng.br">junior@ecosunpower.eng.br</a></li>
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
  <li><strong>E-mail:</strong> <a href="mailto:junior@ecosunpower.eng.br">junior@ecosunpower.eng.br</a></li>
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
<p>Ecosunpower Energia Solar — Brasilia/DF<br>
Contato: <a href="mailto:junior@ecosunpower.eng.br">junior@ecosunpower.eng.br</a></p>
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
<title>Termos de Uso — Ecosunpower Energia Solar</title>
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
<p class="meta"><strong>Ecosunpower Energia Solar</strong><br>
SHA Conjunto 01 Chacara 44C Lote 6, Arniqueira, Brasilia - DF, CEP 71993-150<br>
CNPJ: 33.020.459/0001-06 | Email: <a href="mailto:junior@ecosunpower.eng.br">junior@ecosunpower.eng.br</a><br>
Atualizado em: 22 de abril de 2026</p>

<h2>1. Aceitacao dos Termos</h2>
<p>Ao interagir com a Ecosunpower Energia Solar atraves de qualquer um de nossos canais digitais (formularios de anuncios Meta, WhatsApp, Instagram, Facebook ou nosso site), voce concorda integralmente com estes Termos de Uso e com nossa <a href="/privacidade">Politica de Privacidade</a>. Caso nao concorde, por favor nao utilize nossos canais.</p>

<h2>2. Sobre nos</h2>
<p>A Ecosunpower Energia Solar e uma empresa de engenharia de geracao de energia solar fotovoltaica, atuante em Brasilia-DF e em todo o Distrito Federal e entorno de Goias. Atuamos no projeto, dimensionamento, fornecimento e instalacao de sistemas de energia solar conectados a rede e em sistemas com armazenamento (baterias), bem como em servicos de manutencao, consultoria em eficiencia energetica e migracao para o mercado livre de energia.</p>

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
<p>Para agilizar o primeiro atendimento e qualificacao de leads, utilizamos um agente conversacional baseado em inteligencia artificial chamado "Eva", que opera atraves de WhatsApp. Eva eh treinada com nossa base de conhecimento tecnico e atua como consultora especialista virtual da empresa.</p>
<p>Voce sera sempre informado quando estiver conversando com Eva. Caso prefira atendimento exclusivamente humano, basta solicitar a qualquer momento e o Responsavel Tecnico da EcoSunPower assumira a conversa.</p>
<p>As respostas geradas pela Eva tem carater consultivo inicial e devem ser sempre validadas com nossa equipe tecnica para projetos definitivos. A Ecosunpower nao se responsabiliza por decisoes tomadas exclusivamente com base em respostas automatizadas sem confirmacao posterior.</p>

<h2>6. Anuncios e captura de leads</h2>
<p>Veiculamos anuncios em plataformas Meta (Facebook e Instagram) com formularios de geracao de leads. Ao preencher um formulario, voce autoriza:</p>
<ul>
  <li>O recebimento dos seus dados (nome, telefone, email e respostas do formulario) pela nossa equipe de atendimento</li>
  <li>O contato comercial via WhatsApp, telefone ou email para apresentar nossas solucoes e dar continuidade ao seu interesse</li>
  <li>O processamento desses dados conforme nossa <a href="/privacidade">Politica de Privacidade</a> e a Lei Geral de Protecao de Dados (LGPD - Lei 13.709/2018)</li>
</ul>
<p>Voce pode solicitar o cancelamento do contato e a exclusao dos seus dados a qualquer momento pelo email <a href="mailto:junior@ecosunpower.eng.br">junior@ecosunpower.eng.br</a>.</p>

<h2>7. Propostas e orcamentos</h2>
<p>Propostas e orcamentos enviados sao informacoes preliminares baseadas nas informacoes que voce nos forneceu. O orcamento final, valor da instalacao e prazo de execucao dependem de visita tecnica presencial, condicoes do imovel e disponibilidade de equipamentos no momento do fechamento. Propostas tem validade conforme indicado no proprio documento (geralmente 15 a 30 dias).</p>

<h2>8. Garantias</h2>
<p>Os equipamentos e servicos fornecidos pela Ecosunpower seguem as garantias dos fabricantes (geralmente 12 a 30 anos para modulos fotovoltaicos e 5 a 12 anos para inversores) e a garantia legal aplicavel a servicos no Brasil (90 dias conforme Codigo de Defesa do Consumidor). Detalhes especificos de garantia sao informados no contrato de cada projeto.</p>

<h2>9. Marcas premium e proibicoes internas</h2>
<p>Trabalhamos exclusivamente com marcas premium homologadas pela INMETRO/ANEEL: Trina Solar, JA Solar, Risen, Jinko Solar, Honor (modulos), SolarEdge, Deye, Sungrow, Huawei, Hoymiles, Enphase, FoxESS e NEP (inversores e microinversores). Nao trabalhamos com a marca Growatt. Pedidos de cotacao com marcas nao homologadas serao redirecionados para opcoes equivalentes da nossa linha.</p>

<h2>10. Limitacao de responsabilidade</h2>
<p>A Ecosunpower trabalha com diligencia para fornecer informacoes corretas e atualizadas, porem nao se responsabiliza por:</p>
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
  <li>Email: <a href="mailto:junior@ecosunpower.eng.br">junior@ecosunpower.eng.br</a></li>
  <li>WhatsApp: vide canais oficiais nas redes sociais Ecosunpower</li>
  <li>Endereco: SHA Conjunto 01 Chacara 44C Lote 6, Arniqueira, Brasilia - DF</li>
</ul>

<footer>
<p>Ecosunpower Energia Solar — Brasilia/DF<br>
Contato: <a href="mailto:junior@ecosunpower.eng.br">junior@ecosunpower.eng.br</a><br>
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
<title>Exclusao de Dados — Ecosunpower Energia Solar</title>
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

<p>A Ecosunpower Energia Solar Ltda (CNPJ 33.020.459/0001-06) respeita seu direito
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
  Envie email para <a href="mailto:junior@ecosunpower.eng.br">junior@ecosunpower.eng.br</a>
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
Email: <a href="mailto:junior@ecosunpower.eng.br">junior@ecosunpower.eng.br</a></p>

<footer>
<p>Ecosunpower Energia Solar Ltda — CNPJ 33.020.459/0001-06<br>
SHA Conjunto 01 Chacara 44C Lote 6, Arniqueira, Brasilia - DF<br>
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

    console.log(
      `[proactive-alerts] crons started (detect 60min, dispatch 15min, anniversary 06h BRT). DRY_RUN=${proactiveDryRun}`,
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

  // Scheduler 3-dias: gera 1 draft a cada 3 dias, idempotente via app_flags.
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
        const result = await newsScraper.scrapeAneel();
        console.log(`[news-scraper] Daily done: ${JSON.stringify(result)}`);
      } catch (err) {
        console.error('[news-scraper] Daily run failed:', (err as Error).message);
      } finally {
        newsScraperRunning = false;
      }
    };
    setInterval(checkNewsScraperSchedule, 20 * 60 * 1000); // checa a cada 20 min
    console.log('[news-scraper] Daily scheduler started (ANEEL @ 03:00 BRT)');

    // Endpoint manual pra forcar scrape (debug/test). Reusa webhook token.
    app.post('/news-scraper/run', async (req, res) => {
      const token = (req.headers['x-webhook-token'] as string)
        ?? (req.query.token as string) ?? '';
      if (!evolution.validateWebhookToken(token)) {
        res.status(401).json({ error: 'Invalid token' });
        return;
      }
      try {
        const result = await newsScraper.scrapeAneel();
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
    if (!config.githubPat) {
      res.status(500).json({ error: 'GITHUB_PAT nao configurado no env' });
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
