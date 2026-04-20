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

// RFC 4122 UUID regex. Usado pra validar :id na URL antes de consultar o DB.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
      config.engineerPhone, // phone pro wa.me rastreado no caption
      new VideoGenerator(config.replicateApiToken),
    )
    : null;
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
  const followup = new FollowupModule(supabase.getClient(), sendText);
  const reengagement = new ReengagementCadence(
    supabase.getClient(),
    new Anthropic({ apiKey: config.anthropicApiKey }),
    sendText,
    () => knowledgeBase.getContent(),
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
      // If this lead has an active reengagement cadence, cancel it — they replied
      if (lead?.id && await reengagement.hasPendingTouches(lead.id)) {
        const canceled = await reengagement.cancelAllTouches(lead.id);
        console.log(`[reengagement] Canceled ${canceled} pending touches for ${from} (replied)`);
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

  // Handle audio messages
  async function handleAudioMessage(from: string, messageId: string) {
    if (await takeover.isPaused(from)) {
      console.log(`[takeover] Skipping audio from ${from} — human takeover active`);
      return;
    }
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
  // `verify` captura o buffer bruto antes de parsear JSON — necessario pra
  // validar o HMAC-SHA256 do webhook Lead Ads da Meta (o X-Hub-Signature-256
  // e calculado sobre o body bytewise, e JSON.stringify(parsed) nao bate).
  app.use(express.json({
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
      const content = parsed.type === 'text' ? parsed.content.trim().toLowerCase() : '';
      if (content === '/eva on' || content === '/eva voltar' || content === '/bot on') {
        await takeover.resumeFor(parsed.from);
        console.log(`[takeover] Eva resumed for ${parsed.from} by human command`);
        res.status(200).json({ status: 'eva_resumed' });
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
    const approveLink = `${baseUrl}/marketing/approve/${draft.id}?t=${t}`;
    const regenLink = `${baseUrl}/marketing/regenerate/${draft.id}?t=${t}`;
    const discardLink = `${baseUrl}/marketing/discard/${draft.id}?t=${t}`;

    const caption = [
      `📝 Rascunho de post — ${draft.topic}`,
      '',
      draft.caption,
      '',
      '─────────────',
      `✅ Aprovar e publicar: ${approveLink}`,
      `🔄 Gerar outra imagem: ${regenLink}`,
      `❌ Descartar: ${discardLink}`,
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
  const htmlPage = (title: string, body: string) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:-apple-system,sans-serif;padding:40px;max-width:600px;margin:0 auto;color:#333;line-height:1.5">${body}</body></html>`;

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
    if (draft.status === 'published') {
      res.send(htmlPage('Ja publicado', '<h2>Esse post ja foi publicado.</h2>'));
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
      const nowBrt = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      const isMonday = nowBrt.getDay() === 1;
      const isEightAM = nowBrt.getHours() === 8 && nowBrt.getMinutes() < 15;
      if (!isMonday || !isEightAM) return;

      const lastRunKey = 'last_weekly_marketing_run';
      const { data: flag } = await supabase.getClient()
        .from('app_flags')
        .select('value')
        .eq('key', lastRunKey)
        .maybeSingle();
      const today = nowBrt.toISOString().slice(0, 10);
      if (flag?.value === today) return; // already ran today

      console.log('[marketing] Weekly run: generating 1 video + 1 image...');
      try {
        for (let i = 0; i < 2; i++) {
          const asVideo = i === 0;
          const draft = await marketing.generateDraft(undefined, asVideo);
          await sendDraftToJunior(draft.id);
          await new Promise((r) => setTimeout(r, 30000));
        }
        await supabase.getClient()
          .from('app_flags')
          .upsert({ key: lastRunKey, value: today, updated_at: new Date().toISOString() });
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
