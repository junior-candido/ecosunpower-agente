import express from 'express';
import { loadConfig } from './config.js';
import { EvolutionService } from './modules/evolution.js';
import { MessageQueue } from './modules/queue.js';
import { SupabaseService } from './modules/supabase.js';
import { KnowledgeBase } from './modules/knowledge.js';
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
import { ReengagementCadence } from './modules/reengagement-cadence.js';
import { PostInstallService, INSTALLATION_STATUSES } from './modules/post-install.js';
import { TestimonialService, TestimonialFormat } from './modules/testimonials.js';
import { MetaLeadgenService, LeadgenPayload, normalizeBrazilianPhone } from './modules/meta-leadgen.js';
import { parseTrackingTag } from './modules/tracking.js';
import { generateWeeklyReport, formatReportForWhatsApp } from './modules/ads-report.js';

// RFC 4122 UUID regex. Usado pra validar :id na URL antes de consultar o DB.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const supabase = new SupabaseService(config);
  const brain = new Brain(config.anthropicApiKey, process.env.GOOGLE_REVIEW_URL ?? '');
  const vision = new VisionAnalyzer(config.anthropicApiKey);
  const transcriber = config.openaiApiKey ? new Transcriber(config.openaiApiKey) : null;
  const knowledgeBase = new KnowledgeBase(join(__dirname, '..', 'conhecimento'));
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

  const marketing = (config.replicateApiToken && meta)
    ? new MarketingService(
      config.anthropicApiKey,
      supabase.getClient(),
      new ImageGenerator(config.replicateApiToken),
      // Prefere businessPhone (WhatsApp do negocio onde Eva opera).
      // Se nao setado, fallback pra engineerPhone por compat (mas com warn).
      config.businessPhone ?? config.engineerPhone,
      new VideoGenerator(config.replicateApiToken),
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

  // Simulate human typing delay: ~35ms per char, clamped between 900ms and 3500ms.
  const typingDelay = (text: string): number => {
    const ms = Math.round(text.length * 35);
    return Math.max(900, Math.min(3500, ms));
  };

  // Wrapped sendText: shows "digitando..." presence and tracks bot-sent IDs.
  const sendText = async (to: string, text: string): Promise<void> => {
    const delay = typingDelay(text);
    const { messageId } = await evolution.sendText(to, text, delay);
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
  );

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

  // Message handler
  async function handleTextMessage(from: string, text: string) {
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
            await supabase.getClient()
              .from('leads')
              .update({
                lead_source: source,
                utm_source: source,
                utm_campaign: parsed.campaign,
                utm_content: parsed.content ?? null,
                origin: source,
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
      const conversation = await supabase.getOrCreateConversation(leadId);

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
          leadContext += `Este contato chegou via ${label}. A mensagem inicial dele inclui uma tag de rastreamento — IGNORE a tag no seu retorno mas leve em conta a origem pra contextualizar o atendimento (ex: se veio do Instagram, pode dizer "vi que voce chegou pelo instagram" naturalmente).\n`;
        }
      }

      const response = await brain.processMessage(
        text,
        history,
        knowledgeBase.getContent() + leadContext,
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
        break;
      }

      case 'qualification_complete': {
        await supabase.upsertLead({ phone: from, status: 'qualificado' });
        await supabase.updateConversation(conversationId, {
          qualification_step: 'qualificacao_completa',
          session_status: 'completed',
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
            await sendText(config.engineerPhone, dossierText);
          } else {
            console.log(`[sandbox] Dossier for engineer:\n${dossierText}`);
          }
        }
        console.log(`[action] Qualification complete for ${from}`);
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
        const transferMsg = `🔔 TRANSFERENCIA DE ATENDIMENTO${contactTypeLabel}\n\nContato: ${from}${nameLabel}\n\nMotivo:\n${(action.data as Record<string, string>).reason ?? 'Solicitado pelo cliente'}\n\nVoce pode responder direto por aqui. A Eva fica em pausa nesse chat.`;
        if (!isSandbox) {
          await sendText(config.engineerPhone, transferMsg);
        } else {
          console.log(`[sandbox] Transfer to engineer:\n${transferMsg}`);
        }
        console.log(`[action] Transfer to human for ${from}`);
        break;
      }

      case 'schedule_visit': {
        const d = action.data as Record<string, unknown>;
        const startISO = d.datetime_iso as string | undefined;
        const durationMinutes = (d.duration_minutes as number | undefined) ?? 60;
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
          const summary = `Visita tecnica - ${lead?.name ?? from} - ${lead?.city ?? ''}`.trim();
          const description = [
            `Cliente: ${lead?.name ?? 'Nao informado'}`,
            `WhatsApp: ${from}`,
            `Cidade: ${lead?.city ?? 'Nao informada'}`,
            `Perfil: ${lead?.profile ?? 'indefinido'}`,
            lead?.energy_data && typeof lead.energy_data === 'object'
              ? `Conta: R$ ${(lead.energy_data as Record<string, unknown>).monthly_bill ?? '-'}/mes`
              : '',
            clientEmail ? `Email cliente: ${clientEmail}` : '',
            clientAddress ? `Endereco: ${clientAddress}` : '',
            clientCoordinates ? `Coordenadas: ${clientCoordinates}` : '',
            clientCoordinates ? `Maps: https://www.google.com/maps?q=${clientCoordinates}` : '',
            d.notes ? `\nObservacoes: ${d.notes}` : '',
          ].filter(Boolean).join('\n');

          // Single internal event (Ecosunpower side only — full details + map, no attendees)
          // Prefer coordinates in location field (more precise for Maps); fallback to address
          const eventLocation = clientCoordinates
            ? (clientAddress ? `${clientAddress} (${clientCoordinates})` : clientCoordinates)
            : (clientAddress || undefined);
          const event = await calendar.createEvent({
            summary,
            description,
            startISO,
            endISO,
            location: eventLocation,
          });
          console.log(`[calendar] Event created for ${from}: ${event.htmlLink} (location=${eventLocation ?? 'none'})`);

          await supabase.logEvent('info', 'calendar', `Visit scheduled for ${from}`, {
            event_id: event.eventId,
            html_link: event.htmlLink,
            start: startISO,
            client_email: clientEmail ?? null,
            has_location: Boolean(clientAddress),
          });
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
            await sendText(
              config.engineerPhone,
              `depoimento em ${fmt} chegou de ${leadName}. salvei no banco pra usar no marketing — ve a biblioteca quando quiser.`,
            ).catch(() => { /* nao bloqueante */ });
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
      const media = await evolution.getMediaBase64(messageId);
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
      const media = await evolution.getMediaBase64(messageId);
      if (!media) {
        const msg = 'Nao consegui abrir a foto. Pode enviar novamente? 📸';
        if (!isSandbox) await sendText(from, msg);
        return;
      }

      const imageDataUrl = `data:${media.mimetype};base64,${media.base64}`;
      const analysisText = await vision.analyzeImage(imageDataUrl, context);
      const displayText = brain.getDisplayText(analysisText);
      const action = brain.parseAction(analysisText);

      if (!isSandbox) {
        await sendText(from, displayText);
      } else {
        console.log(`[sandbox] Image analysis for ${from}: ${displayText}`);
      }

      // Save to conversation
      if (lead) {
        const conversation = await supabase.getOrCreateConversation(lead.id);
        const updatedMessages = [
          ...conversation.messages,
          { role: 'user' as const, content: '[Enviou uma foto]', timestamp: new Date().toISOString() },
          { role: 'assistant' as const, content: analysisText, timestamp: new Date().toISOString() },
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

      const media = await evolution.getMediaBase64(messageId);
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

  // Handle document messages (PDF)
  async function handleDocumentMessage(from: string, messageId: string, mimetype: string) {
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
      const media = await evolution.getMediaBase64(messageId);
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

    switch (msg.type) {
      case 'text':
        await handleTextMessage(msg.from, msg.content);
        break;
      case 'audio':
        await handleAudioMessage(msg.from, msg.messageId);
        break;
      case 'image':
        await handleImageMessage(msg.from, msg.messageId);
        break;
      case 'video':
        await handleVideoMessage(msg.from, msg.messageId, msg.caption);
        break;
      case 'document':
        await handleDocumentMessage(msg.from, msg.messageId, msg.content);
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

    const payload = req.body as LeadgenPayload;
    if (payload.object !== 'page') return;

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
                knowledgeBase.getContent(),
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
      const platforms = (draft.platforms as string[]) ?? ['instagram', 'facebook'];
      const isVideo = draft.content_type === 'video' && draft.video_url;
      if (platforms.includes('facebook')) {
        results.facebook = isVideo
          ? await meta.publishFacebookVideo(draft.video_url, draft.caption)
          : await meta.publishFacebookImage(draft.image_url, draft.caption);
      }
      if (platforms.includes('instagram')) {
        results.instagram = isVideo
          ? await meta.publishInstagramReel(draft.video_url, draft.caption)
          : await meta.publishInstagramImage(draft.image_url, draft.caption);
      }
      await marketing.markPublished(draft.id, results);
      console.log(`[marketing] Approved + published draft ${draft.id} (${isVideo ? 'video/Reel' : 'image'})`);
      res.send(htmlPage(
        'Publicado!',
        `<h2>✅ Post publicado com sucesso!</h2><p>Acabou de subir no Instagram e no Facebook. Pode fechar esta aba.</p>`,
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
            knowledgeBase.getContent(),
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
      const waLink = `https://wa.me/${l.phone}?text=${encodeURIComponent(msg)}`;
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
      const platforms = (draft.platforms as string[]) ?? ['instagram', 'facebook'];
      const isVideo = draft.content_type === 'video' && draft.video_url;
      if (platforms.includes('facebook')) {
        results.facebook = isVideo
          ? await meta.publishFacebookVideo(draft.video_url, draft.caption)
          : await meta.publishFacebookImage(draft.image_url, draft.caption);
      }
      if (platforms.includes('instagram')) {
        results.instagram = isVideo
          ? await meta.publishInstagramReel(draft.video_url, draft.caption)
          : await meta.publishInstagramImage(draft.image_url, draft.caption);
      }
      await marketing.markPublished(draft.id, results);
      console.log(`[marketing] Published draft ${draft.id} (${isVideo ? 'video/Reel' : 'image'})`);
      res.json({ status: 'published', results });
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
<p class="meta"><strong>Ecosunpower Energia Solar</strong><br>
SHA Conjunto 01 Chacara 44C Lote 6, Arniqueira, Brasilia - DF, CEP 71993-150<br>
Ultima atualizacao: 20 de abril de 2026</p>

<h2>1. Quem somos</h2>
<p>A Ecosunpower Energia Solar e uma empresa especializada em sistemas fotovoltaicos, com atuacao em Brasilia-DF e Goias desde 2019. Nos comprometemos com a protecao dos seus dados pessoais, em conformidade com a Lei Geral de Protecao de Dados (Lei 13.709/2018 - LGPD).</p>

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

<h2>5. Com quem compartilhamos</h2>
<p><strong>Nao compartilhamos seus dados com terceiros para fins comerciais.</strong> Usamos apenas ferramentas operacionais necessarias para prestar o servico:</p>
<ul>
  <li>Meta (Facebook/Instagram) — quando voce preenche um formulario de anuncio, conforme a <a href="https://www.facebook.com/privacy/policy" target="_blank">politica de privacidade da Meta</a></li>
  <li>Provedores de infraestrutura de WhatsApp e armazenamento na nuvem, sob contrato de confidencialidade</li>
  <li>Autoridades legais, quando obrigados por lei</li>
</ul>

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
  <li><strong>E-mail:</strong> <a href="mailto:ecosunpower2032@gmail.com">ecosunpower2032@gmail.com</a></li>
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
Contato: <a href="mailto:ecosunpower2032@gmail.com">ecosunpower2032@gmail.com</a></p>
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
CNPJ: a ser publicado | Email: <a href="mailto:ecosunpower2032@gmail.com">ecosunpower2032@gmail.com</a><br>
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
<p>Para agilizar o primeiro atendimento e qualificacao de leads, utilizamos um agente conversacional baseado em inteligencia artificial chamado "Eva", que opera atraves de WhatsApp. Eva eh treinada com nossa base de conhecimento tecnico e atua como engenheira especialista virtual da empresa.</p>
<p>Voce sera sempre informado quando estiver conversando com Eva. Caso prefira atendimento exclusivamente humano, basta solicitar a qualquer momento e o engenheiro responsavel assumira a conversa.</p>
<p>As respostas geradas pela Eva tem carater consultivo inicial e devem ser sempre validadas com nossa equipe tecnica para projetos definitivos. A Ecosunpower nao se responsabiliza por decisoes tomadas exclusivamente com base em respostas automatizadas sem confirmacao posterior.</p>

<h2>6. Anuncios e captura de leads</h2>
<p>Veiculamos anuncios em plataformas Meta (Facebook e Instagram) com formularios de geracao de leads. Ao preencher um formulario, voce autoriza:</p>
<ul>
  <li>O recebimento dos seus dados (nome, telefone, email e respostas do formulario) pela nossa equipe de atendimento</li>
  <li>O contato comercial via WhatsApp, telefone ou email para apresentar nossas solucoes e dar continuidade ao seu interesse</li>
  <li>O processamento desses dados conforme nossa <a href="/privacidade">Politica de Privacidade</a> e a Lei Geral de Protecao de Dados (LGPD - Lei 13.709/2018)</li>
</ul>
<p>Voce pode solicitar o cancelamento do contato e a exclusao dos seus dados a qualquer momento pelo email <a href="mailto:ecosunpower2032@gmail.com">ecosunpower2032@gmail.com</a>.</p>

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
  <li>Email: <a href="mailto:ecosunpower2032@gmail.com">ecosunpower2032@gmail.com</a></li>
  <li>WhatsApp: vide canais oficiais nas redes sociais Ecosunpower</li>
  <li>Endereco: SHA Conjunto 01 Chacara 44C Lote 6, Arniqueira, Brasilia - DF</li>
</ul>

<footer>
<p>Ecosunpower Energia Solar — Brasilia/DF<br>
Contato: <a href="mailto:ecosunpower2032@gmail.com">ecosunpower2032@gmail.com</a><br>
Veja tambem: <a href="/privacidade">Politica de Privacidade</a></p>
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

  // Follow-up timer (runs every hour)
  if (!isSandbox) {
    setInterval(async () => {
      console.log('[followup] Running scheduled follow-up check...');
      await followup.processFollowups();
    }, 60 * 60 * 1000); // Every 1 hour

    // Run first check 5 minutes after startup
    setTimeout(() => followup.processFollowups(), 5 * 60 * 1000);
    console.log('[followup] Follow-up scheduler started (checks every 1 hour)');

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
  setInterval(() => runCanalSolarIngestion(true), 3 * 24 * 60 * 60 * 1000);
  console.log('[canal-solar] Scheduler started (every 3 days)');

  // Marketing weekly scheduler: every Monday 08:00 BRT generates 1 video Reel
  // and 1 still image draft, sending both to Junior's WhatsApp for approval.
  if (!isSandbox && marketing) {
    const checkMarketingSchedule = async () => {
      const brt = getBrtParts();
      if (brt.weekday !== 1) return; // segunda
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

      console.log('[marketing] Weekly run: generating 1 video + 1 image...');
      try {
        for (let i = 0; i < 2; i++) {
          const asVideo = i === 0;
          const draft = await marketing.generateDraft(undefined, asVideo);
          await sendDraftToJunior(draft.id);
          await new Promise((r) => setTimeout(r, 30000));
        }
        console.log('[marketing] Weekly run complete');
      } catch (err) {
        console.error('[marketing] Weekly run failed:', err);
      }
    };
    setInterval(checkMarketingSchedule, 10 * 60 * 1000); // check every 10 min
    console.log('[marketing] Weekly scheduler started (Mondays 08:00 BRT)');

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
  if (!isSandbox) {
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
  if (!isSandbox) {
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
  if (!isSandbox && postInstall) {
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
