import Anthropic from '@anthropic-ai/sdk';
import { SupabaseService } from './supabase.js';
import { empresa } from './empresa-config.js';
import { medirIa } from './custos/ia-metering.js';

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
    const prompt = `Voce e a ${empresa().nomeAtendente}, consultora de energia solar da ${empresa().nomeFantasia}.
${empresa().rtGenero === 'f' ? 'A' : 'O'} ${empresa().rtApelido} (${empresa().rtTitulo}) liberou o atendimento ${greeting} ha 2 horas e o
cliente nao respondeu ainda. Escreva uma mensagem CURTA de apresentacao no
WhatsApp pra abrir conversa, em 2 a 3 bolhas separadas por LINHA EM BRANCO.

Regras:
- Tom suave, brasileiro, sem formalidade exagerada
- Sem emojis, sem asteriscos, sem markdown
- Maximo 3 frases por bolha
- Identifique-se como ${empresa().nomeAtendente} da ${empresa().nomeFantasia}
- Pergunta aberta no final: "como posso te ajudar?"

Exemplo de estrutura (use como inspiracao, nao copie):
oi${name ? ', ' + name : ''}, tudo bem?

aqui e a ${empresa().nomeAtendente.toLowerCase()} da ${empresa().nomeFantasia.toLowerCase()}

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
    medirIa({ modelo: 'claude-haiku-4-5-20251001', origem: 'maintenance', usage: response.usage });

    const block = response.content[0];
    return block.type === 'text' ? block.text.trim() : `oi, aqui e a ${empresa().nomeAtendente.toLowerCase()} da ${empresa().nomeFantasia.toLowerCase()}. posso te ajudar?`;
  }

  private async generateMaintenanceMessage(
    name: string | null,
    topic: string,
  ): Promise<string> {
    const prompt = this.buildPromptForTopic(name, topic);
    const fallback = this.buildFallbackForTopic(name, topic);

    const response = await this.anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });
    medirIa({ modelo: 'claude-haiku-4-5-20251001', origem: 'maintenance', usage: response.usage });
    const block = response.content[0];
    return block.type === 'text' ? block.text.trim() : fallback;
  }

  private buildPromptForTopic(name: string | null, topic: string): string {
    const greeting = name ? `pra ${name}` : 'pro cliente';
    const base = `Voce e a ${empresa().nomeAtendente}, consultora de energia solar da ${empresa().nomeFantasia}.\n`;
    const regras = `\n\nRegras:\n- Sem emojis, sem asteriscos, sem markdown\n- 2 a 3 bolhas curtas separadas por LINHA EM BRANCO\n- Maximo 2 frases por bolha\n- Brasileiro, natural\n\nResponda APENAS o texto da mensagem (bolhas separadas por linha em branco), nada mais.`;
    switch (topic) {
      case 'limpeza_maio':
        return base + `Mande uma mensagem ${greeting} (cliente de manutencao recorrente) lembrando da limpeza dos modulos solares. Contexto: inicio de maio. Periodo seco em Brasilia comeca, poeira acumula nos modulos. Limpeza preventiva pra manter geracao alta. Mencione maio e por que essa epoca eh importante. Conduza pra agendamento: "quer que eu agende a limpeza pra esse mes?"` + regras;
      case 'limpeza_agosto':
        return base + `Mande uma mensagem ${greeting} (cliente de manutencao recorrente) lembrando da limpeza dos modulos solares. Contexto: agosto. Pico do periodo seco. Modulos costumam estar muito sujos a essa altura. Limpeza eh especialmente importante agora. Conduza pra agendamento: "quer que eu agende a limpeza pra esse mes?"` + regras;
      case 'alerta_offline':
        return base + `Mande uma mensagem ${greeting}. Voce notou que o sistema dele parou de gerar nos ultimos dias. Pergunta de forma calma se ele consegue verificar se o wifi do inversor esta conectado, ou se tem alguma luz vermelha piscando. Se persistir, diga que voce pode agendar uma visita tecnica. Tom: preocupado mas tranquilo, sem alarmar. Nao prometa que vai voltar, nao culpe o cliente.` + regras;
      case 'alerta_limpeza':
        return base + `Mande uma mensagem ${greeting}. Voce notou que a geracao do sistema dele caiu nos ultimos dias. Geralmente eh sujeira/poeira nos modulos. Pergunta se ele topa agendar uma limpeza preventiva pra restaurar a geracao. Tom: util, sem urgencia exagerada.` + regras;
      case 'pedido_depoimento':
        return base + `Mande uma mensagem ${greeting}. Voce viu que o sistema dele esta gerando ACIMA do esperado nos ultimos dias (bombando!). Pergunta como tem sido a experiencia com o sistema e se ele topa contar pra outras pessoas um depoimento curto. Tom: comemorativo, leve, sem ser comercial. Nao pressione.` + regras;
      case 'aniversario_1a':
      case 'aniversario_2a':
      case 'aniversario_3a':
      case 'aniversario_4a':
      case 'aniversario_5a': {
        const anos = topic.replace('aniversario_', '').replace('a', '');
        return base + `Mande uma mensagem ${greeting}. Hoje completa ${anos} ano(s) que o sistema solar foi instalado. Celebre a data de forma leve e ofereca uma revisao preventiva (limpeza + checagem de conexoes + medicao). Tom: gratidao + cuidado de longo prazo. Pergunta se ele topa agendar uma visita rapida.` + regras;
      }
      default:
        // Fallback genérico (preserva comportamento original pra topics desconhecidos)
        return base + `Mande uma mensagem ${greeting} sobre manutencao do sistema solar. Conduza pra agendamento.` + regras;
    }
  }

  private buildFallbackForTopic(name: string | null, topic: string): string {
    const olaName = name ? `, ${name}` : '';
    switch (topic) {
      case 'limpeza_maio': return `oi${olaName}, chegou maio e eh hora da limpeza dos paineis. quer que eu agende?`;
      case 'limpeza_agosto': return `oi${olaName}, chegou agosto e os paineis costumam estar bem sujos. quer que eu agende uma limpeza?`;
      case 'alerta_offline': return `oi${olaName}, vi que seu sistema parou de gerar nos ultimos dias. consegue verificar se o wifi do inversor esta conectado? se persistir, posso agendar uma visita.`;
      case 'alerta_limpeza': return `oi${olaName}, vi que a geracao caiu nos ultimos dias. provavelmente eh sujeira nos modulos. quer que eu agende uma limpeza?`;
      case 'pedido_depoimento': return `oi${olaName}, seu sistema esta bombando! que tal contar a experiencia pra gente?`;
      default:
        if (topic.startsWith('aniversario_')) {
          const anos = topic.replace('aniversario_', '').replace('a', '');
          return `oi${olaName}, hoje completa ${anos} ano com seu sistema solar. quer que eu agende uma revisao preventiva?`;
        }
        return `oi${olaName}, posso te ajudar com algo do seu sistema?`;
    }
  }
}
