import Anthropic from '@anthropic-ai/sdk';
import { SupabaseService } from './supabase.js';

/**
 * Modulo de manutencao da Eva:
 * 1. processIntros — varre eva_intro_pending vencidas e dispara mensagem
 *    de apresentacao (cliente nao respondeu nas 2h apos /eva on).
 * 2. processMaintenanceReminders — varre maintenance_reminders vencidos
 *    (maio e agosto) e dispara mensagem natural de limpeza/manutencao.
 *    Apos enviar, ja agenda o lembrete pro PROXIMO ano (mesmo mes).
 */
export class MaintenanceService {
  constructor(
    private supabase: SupabaseService,
    private anthropic: Anthropic,
    private sendText: (to: string, text: string) => Promise<void>,
  ) {}

  async processIntros(): Promise<number> {
    const due = await this.supabase.getDueEvaIntros();
    let sent = 0;

    for (const intro of due) {
      try {
        // CAS: tenta travar a row como 'sending' antes de qualquer trabalho.
        // Se nao conseguiu (cancelEvaIntro do cliente ja marcou cancelled,
        // ou outro processo concorrente), pula sem fazer nada.
        const locked = await this.supabase.lockEvaIntroForSending(intro.id);
        if (!locked) {
          console.log(`[maintenance] Intro ${intro.id} nao travada (cliente respondeu ou foi cancelada)`);
          continue;
        }

        const text = await this.generateIntroMessage(intro.name);
        await this.sendBubbles(intro.phone, text);
        await this.supabase.markEvaIntroSent(intro.id);
        sent++;
        console.log(`[maintenance] Intro Eva enviada pra ${intro.phone}`);
      } catch (err) {
        console.error(`[maintenance] Falha ao enviar intro pra ${intro.phone}:`, (err as Error).message);
        // se travamos como 'sending' mas falhou, devolve pra 'pending' pra retry
        await this.supabase.unlockEvaIntro(intro.id).catch(() => {});
      }
    }

    return sent;
  }

  async processMaintenanceReminders(): Promise<number> {
    const due = await this.supabase.getDueMaintenanceReminders();
    let sent = 0;

    for (const reminder of due) {
      try {
        const text = await this.generateMaintenanceMessage(reminder.name, reminder.topic);
        await this.sendBubbles(reminder.phone, text);
        await this.supabase.markMaintenanceReminderSent(reminder.id, text);

        // agenda o mesmo lembrete pra proximo ano (recorrente). Usa upsert
        // com ignoreDuplicates pra ser idempotente em caso de retry.
        const next = new Date(reminder.scheduled_date);
        next.setFullYear(next.getFullYear() + 1);
        const { error: insertErr } = await this.supabase.getClient()
          .from('maintenance_reminders')
          .upsert(
            {
              lead_id: reminder.lead_id,
              scheduled_date: next.toISOString().slice(0, 10),
              topic: reminder.topic,
            },
            { onConflict: 'lead_id,scheduled_date,topic', ignoreDuplicates: true },
          );
        if (insertErr) {
          console.warn(
            `[maintenance] Falha agendar ${reminder.topic} proximo ano (lead ${reminder.lead_id}):`,
            insertErr.message,
          );
        }

        sent++;
        console.log(`[maintenance] Lembrete ${reminder.topic} enviado pra ${reminder.phone}`);
      } catch (err) {
        const msg = (err as Error).message;
        console.error(`[maintenance] Falha lembrete ${reminder.id}:`, msg);
        await this.supabase.markMaintenanceReminderFailed(reminder.id, msg).catch(() => {});
      }
    }

    return sent;
  }

  /**
   * Quebra texto em bolhas (split por linha em branco) e envia cada uma
   * como mensagem separada no WhatsApp, com pausa natural entre elas.
   * Imita o estilo "humano digitando" do prompt da Eva.
   */
  private async sendBubbles(to: string, text: string): Promise<void> {
    const bubbles = text
      .split(/\n\s*\n/)
      .map((b) => b.trim())
      .filter(Boolean);

    if (bubbles.length === 0) return;

    for (let i = 0; i < bubbles.length; i++) {
      await this.sendText(to, bubbles[i]);
      if (i < bubbles.length - 1) {
        const delay = 900 + Math.random() * 1200; // 0.9-2.1s entre bolhas
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  private async generateIntroMessage(name: string | null): Promise<string> {
    const greeting = name ? `pra ${name}` : 'pro cliente (nome desconhecido)';
    const prompt = `Voce e a Eva, engenheira especialista em energia da Ecosunpower.
O Junior (engenheiro responsavel) liberou o atendimento ${greeting} ha 2 horas e o
cliente nao respondeu ainda. Escreva uma mensagem CURTA de apresentacao no
WhatsApp pra abrir conversa, em 2 a 3 bolhas separadas por LINHA EM BRANCO.

Regras:
- Tom suave, brasileiro, sem formalidade exagerada
- Sem emojis, sem asteriscos, sem markdown
- Maximo 3 frases por bolha
- Identifique-se como Eva da Ecosunpower
- Pergunta aberta no final: "como posso te ajudar?"

Exemplo de estrutura (use como inspiracao, nao copie):
oi${name ? ', ' + name : ''}, tudo bem?

aqui e a eva da ecosunpower

vi que voce conversou com o junior. fiquei a disposicao se voce tiver
alguma duvida sobre seu sistema ou conta de luz

posso te ajudar em algo?

Responda APENAS o texto da mensagem (com as bolhas separadas por linha
em branco), nada mais.`;

    const response = await this.anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });

    const block = response.content[0];
    return block.type === 'text' ? block.text.trim() : 'oi, aqui e a eva da ecosunpower. posso te ajudar?';
  }

  private async generateMaintenanceMessage(
    name: string | null,
    topic: string,
  ): Promise<string> {
    const greeting = name ? `pra ${name}` : 'pro cliente';
    const month = topic === 'limpeza_maio' ? 'maio' : 'agosto';
    const context = topic === 'limpeza_maio'
      ? 'inicio de maio. Periodo seco em Brasilia comeca, poeira acumula nos modulos. Limpeza preventiva pra manter geracao alta.'
      : 'agosto. Pico do periodo seco. Modulos costumam estar muito sujos a essa altura. Limpeza eh especialmente importante agora.';

    const prompt = `Voce e a Eva, engenheira especialista em energia da Ecosunpower.
Mande uma mensagem ${greeting} (cliente de manutencao recorrente) lembrando da
limpeza dos modulos solares. Contexto: ${context}

Regras:
- Tom proximo, sem ser comercial agressiva
- Sem emojis, sem asteriscos, sem markdown
- 2 a 3 bolhas curtas separadas por LINHA EM BRANCO
- Maximo 2 frases por bolha
- Mencione o mes (${month}) e por que essa epoca eh importante
- Conduza pra agendamento: "quer que eu agende a limpeza pra esse mes?"
- Brasileiro, natural

Responda APENAS o texto da mensagem (bolhas separadas por linha em branco),
nada mais.`;

    const response = await this.anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });

    const block = response.content[0];
    return block.type === 'text'
      ? block.text.trim()
      : `oi${name ? ', ' + name : ''}, chegou ${month} e eh hora da limpeza dos paineis. quer que eu agende?`;
  }
}
