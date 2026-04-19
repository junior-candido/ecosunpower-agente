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

  // Wrapped sendText: tracks bot-sent message IDs so Junior's typed messages can be distinguished
  const sendText = async (to: string, text: string): Promise<void> => {
    const { messageId } = await evolution.sendText(to, text);
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

      // Send response
      if (!isSandbox) {
        await sendText(from, response.displayText);
      } else {
        console.log(`[sandbox] Would send to ${from}: ${response.displayText}`);
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

      // Handle actions from Claude
      if (response.action) {
        await handleAction(response.action, leadId, from, conversation.id);
      }

      await supabase.logEvent('info', 'brain', `Processed message from ${from}`, {
        lead_id: leadId,
        is_new: isNewLead,
        action: response.action?.action ?? null,
      });

      // Learn from conversation
      const wasTransferred = response.action?.action === 'transfer_to_human';
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

        const transferMsg = `TRANSFERENCIA DE ATENDIMENTO\nCliente: ${from}\nMotivo: ${(action.data as Record<string, string>).reason ?? 'Solicitado pelo cliente'}`;
        if (!isSandbox) {
          await sendText(config.engineerPhone, transferMsg);
        } else {
          console.log(`[sandbox] Transfer to engineer:\n${transferMsg}`);
        }
        console.log(`[action] Transfer to human for ${from}`);
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
      case 'location':
        await handleTextMessage(msg.from, `[Cliente compartilhou localizacao: ${msg.content}]`);
        break;
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
