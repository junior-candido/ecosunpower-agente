import express from 'express';
import { loadConfig } from './config.js';
import { EvolutionService } from './modules/evolution.js';
import { MessageQueue } from './modules/queue.js';
import { SupabaseService } from './modules/supabase.js';
import { KnowledgeBase } from './modules/knowledge.js';
import { Brain } from './modules/brain.js';
import { DossierBuilder } from './modules/dossier.js';
import { buildHealthStatus } from './health.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const config = loadConfig();
  const isSandbox = config.nodeEnv === 'sandbox';

  console.log(`[init] Starting Ecosunpower Agent (${config.nodeEnv} mode)`);

  // Initialize services
  const evolution = new EvolutionService(config);
  const supabase = new SupabaseService(config);
  const brain = new Brain(config.anthropicApiKey);
  const knowledgeBase = new KnowledgeBase(join(__dirname, '..', 'conhecimento'));

  // Load knowledge base
  knowledgeBase.load();
  if (knowledgeBase.isOverLimit()) {
    console.warn('[knowledge] WARNING: knowledge base exceeds 15,000 token estimate. Consider reducing content.');
  }
  console.log(`[knowledge] Loaded. Estimated tokens: ${knowledgeBase.getTokenEstimate()}`);

  // Watch for changes
  knowledgeBase.startWatching(() => {
    console.log('[knowledge] Reloaded after file change');
    if (knowledgeBase.isOverLimit()) {
      console.warn('[knowledge] WARNING: knowledge base exceeds 15,000 token estimate');
    }
  });

  // Message handler
  async function handleTextMessage(from: string, text: string) {
    try {
      let lead = await supabase.getLeadByPhone(from);
      const isNewLead = !lead;

      if (!lead) {
        const result = await supabase.upsertLead({ phone: from, status: 'novo' });
        lead = { id: result.id, phone: from } as NonNullable<typeof lead>;
      }

      const leadId = lead.id;
      const conversation = await supabase.getOrCreateConversation(leadId);

      const history = (conversation.messages ?? []).map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      const response = await brain.processMessage(
        text,
        history,
        knowledgeBase.getContent(),
        conversation.summary,
        conversation.qualification_step
      );

      if (!isSandbox) {
        await evolution.sendText(from, response.displayText);
      } else {
        console.log(`[sandbox] Would send to ${from}: ${response.displayText}`);
      }

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

      if (response.action) {
        await handleAction(response.action, leadId, from, conversation.id);
      }

      await supabase.logEvent('info', 'brain', `Processed message from ${from}`, {
        lead_id: leadId,
        is_new: isNewLead,
        action: response.action?.action ?? null,
      });

    } catch (error) {
      console.error(`[handler] Error processing message from ${from}:`, error);
      await supabase.logEvent('error', 'handler', `Error processing message from ${from}`, {
        error: error instanceof Error ? error.message : String(error),
      });

      const fallbackMsg = 'Estou com uma dificuldade tecnica. Um momento, por favor.';
      if (!isSandbox) {
        try { await evolution.sendText(from, fallbackMsg); } catch { /* ignore send error */ }
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
      case 'update_lead':
        await supabase.upsertLead({
          phone: from,
          ...(action.data as { name?: string; city?: string; profile?: 'residencial' | 'comercial' | 'agronegocio' | 'indefinido' }),
        });
        break;

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
            await evolution.sendText(config.engineerPhone, dossierText);
          } else {
            console.log(`[sandbox] Dossier for engineer:\n${dossierText}`);
          }
        }
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
          await evolution.sendText(config.engineerPhone, transferMsg);
        } else {
          console.log(`[sandbox] Transfer to engineer:\n${transferMsg}`);
        }
        break;
      }
    }
  }

  // Initialize queue
  const queue = new MessageQueue(config.redisHost, config.redisPort, async (msg) => {
    if (msg.type === 'text') {
      await handleTextMessage(msg.from, msg.content);
    } else {
      const fallback = 'Por enquanto consigo atender apenas por texto. Pode me enviar sua duvida digitando?';
      if (!isSandbox) {
        await evolution.sendText(msg.from, fallback);
      }
      console.log(`[router] Unsupported message type "${msg.type}" from ${msg.from}`);
    }
  });

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

    await queue.addMessage({
      type: parsed.type,
      from: parsed.from,
      content: parsed.content,
      timestamp: parsed.timestamp.toISOString(),
      messageId: parsed.messageId,
    });

    res.status(200).json({ status: 'queued' });
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

  // Start server
  app.listen(config.port, () => {
    console.log(`[server] Listening on port ${config.port}`);
    console.log(`[server] Webhook URL: http://localhost:${config.port}/webhook`);
    console.log(`[server] Health check: http://localhost:${config.port}/health`);
    if (isSandbox) {
      console.log('[server] SANDBOX MODE - messages will not be sent to WhatsApp');
    }
  });
}

main().catch(error => {
  console.error('[fatal] Failed to start:', error);
  process.exit(1);
});
