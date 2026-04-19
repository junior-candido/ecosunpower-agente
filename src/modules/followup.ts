// Follow-up module - automated re-engagement and relationship management
import { SupabaseClient } from '@supabase/supabase-js';

const FOLLOWUP_MESSAGES = [
  // Day 2 - First follow-up (installation photos / success story)
  {
    delay_days: 2,
    messages: [
      "Oi {nome}! 😊 Tudo bem? Olha que projeto lindo que acabamos de entregar! Um sistema de 8kWp que vai economizar mais de R$900/mes pro cliente. Se quiser saber como ficaria na sua casa, e so me chamar! ☀️",
      "E ai {nome}! Lembrei de voce! Sabia que a energia solar em Brasilia e uma das mais eficientes do Brasil? A irradiacao aqui e altissima! Se tiver interesse, posso fazer um calculo personalizado pra voce 😊",
      "Oi {nome}! Passando pra compartilhar: os paineis solares da Trina de 720W estao com otimo custo-beneficio agora. Se quiser aproveitar, me chama! 🔆",
    ]
  },
  // Day 4 - Second follow-up (economy / urgency)
  {
    delay_days: 4,
    messages: [
      "Oi {nome}! Voce sabia que a cada ano a tarifa de energia sobe em media 10%? Quem instala solar agora congela o preco da energia por 25 anos! Se quiser conversar sobre isso, to aqui 😊",
      "{nome}, so passando pra avisar: com o Fio B aumentando todo ano, quanto antes instalar solar, melhor o retorno! Se quiser, faco uma simulacao rapida pra voce ☀️",
    ]
  },
  // Day 7 - Third follow-up (financing / last chance)
  {
    delay_days: 7,
    messages: [
      "Oi {nome}! Ultima mensagem, prometo 😅 So queria te contar que existem financiamentos pra solar onde a parcela fica MENOR que a conta de luz. Ou seja, voce ja economiza desde o primeiro mes! Se tiver interesse, me chama 😊",
      "{nome}, sabia que da pra financiar o sistema solar em ate 72x e a parcela ficar menor que sua conta de luz? Se quiser saber mais, e so chamar! Fico a disposicao 😊",
    ]
  },
];

const LOST_CLIENT_MESSAGES = [
  // Every 6 months
  "Oi {nome}! Aqui e a Eva da Ecosunpower 😊 Tudo bem com seu sistema solar? Se precisar de uma limpeza nos paineis, a gente faz! E temos um programa de indicacao: se voce indicar alguem que fechar com a gente, voce ganha R$300 no PIX! 💰 Quer saber mais?",
  "E ai {nome}! Passando pra saber se ta tudo bem com a geracao do seu sistema solar! Se os paineis precisarem de uma limpezinha, conte com a gente. E lembre: indicou e fechou, R$300 no seu PIX! 😊💰",
];

export class FollowupModule {
  private client: SupabaseClient;
  private evolutionSendText: (to: string, text: string) => Promise<void>;

  constructor(client: SupabaseClient, sendText: (to: string, text: string) => Promise<void>) {
    this.client = client;
    this.evolutionSendText = sendText;
  }

  // Run this periodically (every hour)
  async processFollowups(): Promise<void> {
    try {
      await this.processActiveFollowups();
      await this.processLostClients();
    } catch (error) {
      console.error('[followup] Error processing:', error);
    }
  }

  private async processActiveFollowups(): Promise<void> {
    // Find leads that stopped responding (status = qualificando, last message > 2 days)
    const { data: leads } = await this.client
      .from('leads')
      .select('id, phone, name, status, updated_at')
      .in('status', ['novo', 'qualificando'])
      .eq('opt_out', false)
      .lt('updated_at', new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString());

    if (!leads || leads.length === 0) return;

    for (const lead of leads) {
      // Check how many follow-ups already sent
      const { data: sentFollowups } = await this.client
        .from('followups')
        .select('id, step')
        .eq('lead_id', lead.id)
        .order('step', { ascending: false })
        .limit(1);

      const lastStep = sentFollowups?.[0]?.step ?? 0;
      const daysSinceUpdate = Math.floor((Date.now() - new Date(lead.updated_at).getTime()) / (24 * 60 * 60 * 1000));

      // Find the next follow-up to send
      for (const followup of FOLLOWUP_MESSAGES) {
        if (followup.delay_days > lastStep && daysSinceUpdate >= followup.delay_days) {
          const name = lead.name ?? 'amigo(a)';
          const randomMsg = followup.messages[Math.floor(Math.random() * followup.messages.length)];
          const message = randomMsg.replace(/\{nome\}/g, name);

          try {
            await this.evolutionSendText(lead.phone, message);
            await this.client.from('followups').insert({
              lead_id: lead.id,
              step: followup.delay_days,
              message_sent: message,
            });
            console.log(`[followup] Sent day-${followup.delay_days} follow-up to ${lead.phone}`);
          } catch (err) {
            console.error(`[followup] Failed to send to ${lead.phone}:`, err);
          }
          break; // Only send one follow-up per cycle
        }
      }

      // After day 7 with no response, mark as inactive
      if (lastStep >= 7 && daysSinceUpdate > 10) {
        await this.client
          .from('leads')
          .update({ status: 'inativo' })
          .eq('id', lead.id);
        console.log(`[followup] Marked ${lead.phone} as inactive after no response`);
      }
    }
  }

  private async processLostClients(): Promise<void> {
    // Find leads marked as "lost" (bought from competitor)
    const { data: lostLeads } = await this.client
      .from('leads')
      .select('id, phone, name, updated_at')
      .eq('status', 'perdido')
      .eq('opt_out', false);

    if (!lostLeads || lostLeads.length === 0) return;

    for (const lead of lostLeads) {
      const monthsSinceUpdate = Math.floor(
        (Date.now() - new Date(lead.updated_at).getTime()) / (30 * 24 * 60 * 60 * 1000)
      );

      // Send every 6 months
      if (monthsSinceUpdate > 0 && monthsSinceUpdate % 6 === 0) {
        // Check if already sent this cycle
        const { data: recent } = await this.client
          .from('followups')
          .select('id')
          .eq('lead_id', lead.id)
          .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
          .limit(1);

        if (recent && recent.length > 0) continue; // Already sent recently

        const name = lead.name ?? 'amigo(a)';
        const randomMsg = LOST_CLIENT_MESSAGES[Math.floor(Math.random() * LOST_CLIENT_MESSAGES.length)];
        const message = randomMsg.replace(/\{nome\}/g, name);

        try {
          await this.evolutionSendText(lead.phone, message);
          await this.client.from('followups').insert({
            lead_id: lead.id,
            step: 100, // Special step for lost clients
            message_sent: message,
          });
          console.log(`[followup] Sent 6-month check to lost client ${lead.phone}`);
        } catch (err) {
          console.error(`[followup] Failed to send to lost client ${lead.phone}:`, err);
        }
      }
    }
  }
}
