import Anthropic from '@anthropic-ai/sdk';
import { SupabaseClient } from '@supabase/supabase-js';

interface CadenceStep {
  days: number;
  topic: string;
}

// 7-toque schedule after initial manual send (day 0)
const CADENCE: CadenceStep[] = [
  { days: 3, topic: 'soft_reminder' },
  { days: 10, topic: 'canal_solar_value' },
  { days: 30, topic: 'indicacao' },
  { days: 60, topic: 'checkin' },
  { days: 120, topic: 'manutencao' },
  { days: 180, topic: 'nova_abordagem' },
  { days: 365, topic: 'anual' },
];

const TOPIC_GUIDE: Record<string, string> = {
  soft_reminder: 'lembrete muito leve, sem insistir. Exemplo de vibe: "so passando pra lembrar, se quiser uma simulacao rapida to por aqui".',
  canal_solar_value: 'compartilhar uma novidade ou tendencia do setor solar (use as manchetes abaixo como inspiracao) de forma util, sem ser vendedor.',
  indicacao: 'apresentar o programa de indicacao da Ecosunpower: quem indica alguem e essa pessoa fecha, ganha R$300 no PIX. Sugerir de forma leve.',
  checkin: 'check-in humano, sem agenda comercial. "Tudo bem ai? Se precisar de algo, to a disposicao."',
  manutencao: 'oferecer limpeza e manutencao preventiva de sistemas solares existentes. Caso o cliente ja tenha um sistema (mesmo de outra empresa), a Ecosunpower atende.',
  nova_abordagem: 'tarifa de luz subiu — vale revisar a simulacao. Convite leve pra reabrir a conversa.',
  anual: 'mensagem calorosa de final de ano ou data especial, deixando o canal aberto.',
};

export class ReengagementCadence {
  constructor(
    private supabase: SupabaseClient,
    private anthropic: Anthropic,
    private sendText: (to: string, text: string) => Promise<void>,
    private getKnowledgeBase: () => string,
  ) {}

  async scheduleAllTouches(leadId: string): Promise<void> {
    const now = Date.now();
    const rows = CADENCE.map((c, i) => ({
      lead_id: leadId,
      touch_number: i + 1,
      topic_type: c.topic,
      scheduled_for: new Date(now + c.days * 24 * 60 * 60 * 1000).toISOString(),
      status: 'pending',
    }));
    const { error } = await this.supabase.from('reengagement_touches').insert(rows);
    if (error) {
      console.error('[reengagement-cadence] Failed to schedule touches:', error.message);
    } else {
      console.log(`[reengagement-cadence] Scheduled ${rows.length} touches for lead ${leadId}`);
    }
  }

  async cancelAllTouches(leadId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('reengagement_touches')
      .update({ status: 'canceled' })
      .eq('lead_id', leadId)
      .eq('status', 'pending')
      .select('id');
    if (error) {
      console.error('[reengagement-cadence] Failed to cancel touches:', error.message);
      return 0;
    }
    return data?.length ?? 0;
  }

  async hasPendingTouches(leadId: string): Promise<boolean> {
    const { data } = await this.supabase
      .from('reengagement_touches')
      .select('id')
      .eq('lead_id', leadId)
      .eq('status', 'pending')
      .limit(1);
    return (data?.length ?? 0) > 0;
  }

  async processDueTouches(): Promise<number> {
    const { data, error } = await this.supabase
      .from('reengagement_touches')
      .select('id, touch_number, topic_type, leads(id, phone, name)')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .limit(10); // safety cap: max 10 touches per run
    if (error) {
      console.error('[reengagement-cadence] Failed to fetch due touches:', error.message);
      return 0;
    }
    if (!data || data.length === 0) return 0;

    let sent = 0;
    for (const touch of data as unknown as Array<{
      id: string;
      touch_number: number;
      topic_type: string;
      leads: { id: string; phone: string; name: string } | null;
    }>) {
      const lead = touch.leads;
      if (!lead || !lead.phone) {
        await this.supabase
          .from('reengagement_touches')
          .update({ status: 'failed' })
          .eq('id', touch.id);
        continue;
      }
      try {
        const message = await this.generateMessage(touch.topic_type, lead.name);
        await this.sendText(lead.phone, message);
        await this.supabase
          .from('reengagement_touches')
          .update({ status: 'sent', sent_at: new Date().toISOString(), message_sent: message })
          .eq('id', touch.id);
        console.log(`[reengagement-cadence] Sent touch ${touch.touch_number} (${touch.topic_type}) to ${lead.phone}`);
        sent++;
        // Random delay 30-90s between messages to mimic human pacing
        const delay = 30000 + Math.floor(Math.random() * 60000);
        await new Promise((r) => setTimeout(r, delay));
      } catch (err) {
        console.error(`[reengagement-cadence] Touch ${touch.id} failed:`, (err as Error).message);
        await this.supabase
          .from('reengagement_touches')
          .update({ status: 'failed' })
          .eq('id', touch.id);
      }
    }
    return sent;
  }

  private async generateMessage(topicType: string, name: string | null): Promise<string> {
    const firstName = (name ?? '').split(' ')[0] || 'tudo bem';
    const kb = this.getKnowledgeBase();
    const canalSection = kb.match(/# Canal Solar[\s\S]*?(?=\n# |$)/)?.[0] ?? '';
    const headlines = Array.from(canalSection.matchAll(/^## (.+)$/gm))
      .slice(0, 5)
      .map((m) => m[1])
      .join('\n');

    const prompt = `Voce e o Junior da Ecosunpower Energia Solar (Brasilia/DF e Goias), mandando uma mensagem de reengajamento via WhatsApp.

Contato: ${firstName}
Tipo de mensagem: ${topicType}
Diretriz: ${TOPIC_GUIDE[topicType] ?? 'reengajamento leve e humano'}

Manchetes recentes do Canal Solar (use como inspiracao quando fizer sentido):
${headlines}

Regras estritas:
- Maximo 4 linhas curtas
- Primeira pessoa (como se o Junior tivesse escrito)
- Tom: amigo reencontrando amigo, zero comercial agressivo
- Sem emoji, sem markdown, sem asteriscos
- Terminar abrindo espaco pra conversa, nunca cobrar resposta
- Nunca dizer "vai zerar conta"
- Use o primeiro nome naturalmente

Gere APENAS o texto da mensagem, sem comentario ou explicacao.`;

    const res = await this.anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });
    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
  }
}
