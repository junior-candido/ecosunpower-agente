import Anthropic from '@anthropic-ai/sdk';
import { SupabaseClient } from '@supabase/supabase-js';

// Cadencia de auto-followup pra leads que engajaram e depois ficaram silenciosos.
// Dispara SO SE a ultima mensagem na conversa foi da Eva (cliente nao respondeu).
// Cada toque usa Claude pra gerar mensagem contextual baseada no historico.
//
// Parar quando cliente responder. Se atingir step 7 sem resposta -> marca inativo.
const FOLLOWUP_STEPS = [
  {
    delay_days: 1,
    step: 1,
    topic: 'soft_check',
    guide:
      'check leve, 24h apos eva mandar ultima msg sem resposta. Tom: amigo ' +
      'passando pra dar oi. Referencia ALGO ESPECIFICO que foi falado na ' +
      'conversa (ex: se cliente disse conta de R$900, mencione isso). ' +
      'Nao insista. Abre espaco pra conversa voltar.',
  },
  {
    delay_days: 3,
    step: 3,
    topic: 'valor_contexto',
    guide:
      '72h sem resposta. Entrega valor relacionado ao que foi conversado. ' +
      'Ex: se falou conta alta, menciona economia projetada. Se falou ' +
      'comercial, menciona ESG. Curto, sem pitchy. NAO pede resposta — ' +
      'so deixa info.',
  },
  {
    delay_days: 7,
    step: 7,
    topic: 'despedida_aberta',
    guide:
      '7d sem resposta. Ultima tentativa. Tom: casual, "fica a vontade, ' +
      'to por aqui quando precisar". Nao cobra, nao suplica. Deixa a porta ' +
      'aberta pro futuro. Menciona programa de indicacao (R$300 PIX) se ' +
      'fizer sentido.',
  },
];

// Check em clientes que ja instalaram com concorrente — 1 tentativa a cada 6 meses
const LOST_CLIENT_GUIDE =
  'check-in em cliente que instalou com concorrente. Oferece limpeza/manutencao ' +
  'dos paineis (ecosunpower atende mesmo sendo outro instalador). Menciona ' +
  'programa de indicacao (R$300 PIX). Tom: amigo que passou pra saber como ta.';

export class FollowupModule {
  constructor(
    private client: SupabaseClient,
    private sendText: (to: string, text: string) => Promise<void>,
    private anthropic: Anthropic,
  ) {}

  async processFollowups(): Promise<void> {
    try {
      await this.processActiveFollowups();
      await this.processLostClients();
    } catch (err) {
      console.error('[followup] Error:', err);
    }
  }

  // Marca followups anteriores como inativos — proximo silencio reinicia do step 1.
  // NAO deleta (preserva audit). So toca em steps 1-7 (auto-followup), ignora
  // step 100 (lost_client 6-month check).
  async resetForLead(leadId: string): Promise<void> {
    await this.client
      .from('followups')
      .update({ active: false })
      .eq('lead_id', leadId)
      .eq('active', true)
      .lt('step', 100);
  }

  private async processActiveFollowups(): Promise<void> {
    // Cap de 50 leads por tick pra proteger custo Claude e rate limit Evolution.
    // Resto fica pro proximo ciclo (scheduler roda a cada 1h).
    const { data: leads } = await this.client
      .from('leads')
      .select('id, phone, name, city, status, energy_data, updated_at, opt_out')
      .in('status', ['novo', 'qualificando'])
      .eq('opt_out', false)
      .lt('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(50);

    if (!leads || leads.length === 0) return;

    for (const lead of leads) {
      try {
        // Pega conversa ativa
        const { data: conv } = await this.client
          .from('conversations')
          .select('id, messages, last_message_at')
          .eq('lead_id', lead.id)
          .eq('session_status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!conv || !conv.messages) continue;

        const messages = conv.messages as Array<{ role: string; content: string }>;
        if (messages.length === 0) continue;

        // So manda followup se ultima msg foi da Eva (esta esperando cliente)
        const lastMsg = messages[messages.length - 1];
        if (lastMsg.role !== 'assistant') continue;

        // Dias desde ultima mensagem
        const lastAt = new Date(conv.last_message_at).getTime();
        const daysSince = Math.floor((Date.now() - lastAt) / (24 * 60 * 60 * 1000));

        // Quantos followups ATIVOS ja mandados neste ciclo (resetForLead vira active=false)
        const { data: sent } = await this.client
          .from('followups')
          .select('step')
          .eq('lead_id', lead.id)
          .eq('active', true)
          .lt('step', 100)
          .order('step', { ascending: false })
          .limit(1);
        const lastStep = sent?.[0]?.step ?? 0;

        // Pega o step MAIS AVANCADO elegivel (reverse find) — evita mandar 2
        // nudges back-to-back se lead ficou silencioso por 10 dias (pula direto
        // pro step 7 em vez de step 3 → step 7 no proximo tick)
        const nextStep = [...FOLLOWUP_STEPS].reverse().find(
          (s) => s.step > lastStep && daysSince >= s.delay_days,
        );
        if (!nextStep) {
          // Se passou step 7 sem resposta por 10+ dias, marca inativo
          if (lastStep >= 7 && daysSince > 10) {
            await this.client
              .from('leads')
              .update({ status: 'inativo' })
              .eq('id', lead.id);
            console.log(`[followup] Marked ${lead.phone} inativo apos cadencia completa`);
          }
          continue;
        }

        const message = await this.generateMessage(nextStep.guide, lead, messages);

        // Recheck antes de enviar — fecha janela de race onde cliente respondeu
        // entre o inicio do loop e o momento do envio (jitter de 15-45s/lead
        // pode totalizar minutos).
        const { data: preflight } = await this.client
          .from('conversations')
          .select('last_message_at, messages')
          .eq('id', conv.id)
          .maybeSingle();
        if (preflight?.last_message_at) {
          const preflightAt = new Date(preflight.last_message_at).getTime();
          if (preflightAt > lastAt) {
            console.log(`[followup] Skipped ${lead.phone} — cliente respondeu durante loop`);
            continue;
          }
        }
        const preflightMessages = preflight?.messages as Array<{ role: string; content: string }> | null;
        const preflightLast = preflightMessages?.[preflightMessages.length - 1];
        if (preflightLast && preflightLast.role !== 'assistant') {
          console.log(`[followup] Skipped ${lead.phone} — ultima msg agora e do cliente`);
          continue;
        }

        await this.sendText(lead.phone, message);
        await this.client.from('followups').insert({
          lead_id: lead.id,
          step: nextStep.step,
          message_sent: message,
          active: true,
        });
        console.log(`[followup] Sent step-${nextStep.step} (${nextStep.topic}) to ${lead.phone}`);

        // Jitter entre envios pra nao disparar em rajada
        await new Promise((r) => setTimeout(r, 15000 + Math.random() * 30000));
      } catch (err) {
        console.error(`[followup] Failed for lead ${lead.id}:`, (err as Error).message);
      }
    }
  }

  private async processLostClients(): Promise<void> {
    const { data: lostLeads } = await this.client
      .from('leads')
      .select('id, phone, name, city, energy_data, status, updated_at, opt_out')
      .eq('status', 'perdido')
      .eq('opt_out', false);
    if (!lostLeads || lostLeads.length === 0) return;

    for (const lead of lostLeads) {
      try {
        const monthsSince = Math.floor(
          (Date.now() - new Date(lead.updated_at).getTime()) / (30 * 24 * 60 * 60 * 1000),
        );
        if (monthsSince === 0 || monthsSince % 6 !== 0) continue;

        // Evita envios duplicados no mesmo mes
        const { data: recent } = await this.client
          .from('followups')
          .select('id')
          .eq('lead_id', lead.id)
          .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
          .limit(1);
        if (recent && recent.length > 0) continue;

        const message = await this.generateMessage(LOST_CLIENT_GUIDE, lead, []);
        await this.sendText(lead.phone, message);
        await this.client.from('followups').insert({
          lead_id: lead.id,
          step: 100, // special step pra perdidos
          message_sent: message,
        });
        console.log(`[followup] Sent 6-month check to lost client ${lead.phone}`);
      } catch (err) {
        console.error(`[followup] Failed for lost ${lead.id}:`, (err as Error).message);
      }
    }
  }

  // Gera mensagem contextual via Claude. Usa tom da Eva (sem emoji, 3 linhas,
  // primeira pessoa, natural). Recebe historico real da conversa pra puxar
  // algo especifico que foi falado.
  private async generateMessage(
    guide: string,
    lead: { name: string | null; city: string | null; energy_data: unknown },
    history: Array<{ role: string; content: string }>,
  ): Promise<string> {
    const firstName = (lead.name ?? '').split(' ')[0] || '';
    const city = lead.city ?? '';
    const energyData = (lead.energy_data as Record<string, unknown> | null) ?? {};
    const rawBill = energyData.monthly_bill;
    const bill = typeof rawBill === 'number' ? rawBill : undefined;

    const histSnippet = history
      .slice(-8)
      .map((m) => `${m.role === 'user' ? 'CLIENTE' : 'EVA'}: ${m.content}`)
      .join('\n');

    const prompt = `Voce e a Eva, consultora da Ecosunpower Energia Solar (Brasilia/DF e Goias).
Esta mandando uma mensagem de followup pra um cliente que ficou em silencio.

Dados do lead:
- Nome: ${firstName || 'nao informado'}
- Cidade: ${city || 'nao informada'}
- Conta de luz: ${bill ? `R$ ${bill}/mes` : 'nao informada'}

Diretriz deste followup:
${guide}

${histSnippet ? `Ultimas mensagens da conversa (pra voce referenciar algo especifico):\n${histSnippet}\n` : ''}

REGRAS ESTRITAS:
- Maximo 3 linhas curtas, tom WhatsApp natural (minusculas, pontuacao leve)
- Primeira pessoa (Eva falando)
- SEM emoji, SEM asterisco, SEM markdown
- Use o primeiro nome UMA vez no inicio, se tiver ("oi ${firstName || 'amigo'}")
- Referencia algo ESPECIFICO que foi falado (conta, bairro, duvida, etc) — faz parecer que lembrou dele, nao msg automatica
- NAO use "prometo que e a ultima msg", "to aqui pra voce", "ansioso pra sua resposta"
- NAO pede pra responder explicitamente — deixa natural
- NAO prometa "zerar conta"

Gere APENAS o texto da mensagem, sem explicacao.`;

    const res = await this.anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    // Belt-and-suspenders: Haiku as vezes ignora "sem emoji" e "sem asterisco"
    // do prompt. Sanitiza aqui como rede de seguranca.
    return raw
      .replace(/\p{Extended_Pictographic}/gu, '')
      .replace(/\*+/g, '')
      .replace(/_+/g, '')
      .replace(/ {2,}/g, ' ') // colapsa spaces duplos
      .replace(/\n{3,}/g, '\n\n') // max 2 quebras
      .trim();
  }
}
