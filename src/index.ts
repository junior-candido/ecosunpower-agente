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
  const brain = new Brain(config.anthropicApiKey);
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

  const marketing = (config.replicateApiToken && meta)
    ? new MarketingService(
      config.anthropicApiKey,
      supabase.getClient(),
      new ImageGenerator(config.replicateApiToken),
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
      const isNewLead = !lead;

      if (!lead) {
        const result = await supabase.upsertLead({ phone: from, status: 'novo' });
        lead = { id: result.id, phone: from } as NonNullable<typeof lead>;
      }

      const leadId = lead.id;
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
        console.log(`[action] Opt-out registered for ${from}`);
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
  app.use(express.json());

  // Webhook endpoint
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
  app.post('/marketing/run-weekly', async (req, res) => {
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
      for (let i = 0; i < 3; i++) {
        const draft = await marketing.generateDraft();
        ids.push(draft.id);
        await sendDraftToJunior(draft.id);
        await new Promise((r) => setTimeout(r, 15000));
      }
      res.json({ status: 'generated', count: ids.length, ids });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message, ids });
    }
  });

  // Publish an approved draft to FB + IG
  // Reengagement: list pending contacts for manual outreach
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

    const template = (name: string) =>
      `Oi ${name}, tudo bem? Aqui é o Junior da Ecosunpower. Faz um tempinho que a gente não se fala — vi seu contato aqui e lembrei da nossa conversa sobre energia solar. Quis dar um oi e ver como tá aí a situação da conta de luz. Se tiver interesse, posso te mostrar as condições novas e fazer uma simulação sem compromisso.`;

    const items = pending.map((l) => {
      const firstName = (l.name ?? '').split(' ')[0] || 'tudo bem';
      const message = template(firstName);
      const waLink = `https://wa.me/${l.phone}?text=${encodeURIComponent(message)}`;
      return {
        id: l.id,
        phone: l.phone,
        name: l.name,
        message,
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
    res.json({ status: 'marked_sent', id: req.params.id });
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

  // Marketing weekly scheduler: every Monday 08:00 BRT generates 3 drafts
  // and sends each to Junior's WhatsApp for approval.
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

      console.log('[marketing] Weekly run: generating 3 drafts...');
      try {
        for (let i = 0; i < 3; i++) {
          const draft = await marketing.generateDraft();
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
