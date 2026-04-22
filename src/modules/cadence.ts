import Anthropic from '@anthropic-ai/sdk';
import { SupabaseService } from './supabase.js';

/**
 * Cadencia de reengajamento: 5 toques espacados em 0h, 15d, 30d, 45d, 60d
 * apos ativacao de um lead antigo. Se cliente responder em qualquer ponto,
 * a cadencia e cancelada e Eva entra no fluxo normal de qualificacao.
 *
 * Tom de cada toque:
 * 1 (0h)   — Apresentacao de retomada (cliente ja conhece o Junior)
 * 2 (15d)  — Check-in leve ("tudo certo?")
 * 3 (30d)  — Dica sazonal (limpeza maio/agosto, perda por poeira no seco)
 * 4 (45d)  — Expansao/novidade (bateria, ampliacao, nova linha de equipamento)
 * 5 (60d)  — Ultimo toque ("to por aqui se precisar"). Depois, silencio.
 */

interface StepContext {
  clientName: string | null;
  step: number;
}

const STEP_GUIDANCE: Record<number, string> = {
  1: `Toque 1 — Apresentacao de retomada. Tom leve e proximo, como quem se
  coloca a disposicao. Lembre: o cliente JA conhece o Junior pessoalmente,
  entao nao e um "novo lead" — e uma "ampliacao de atendimento". Mencione
  que voce (Eva) e engenheira da Ecosunpower e tambem ficou de apoiar o
  Junior no dia-a-dia. Mensagem curta (2-3 frases), sem pergunta obrigatoria,
  deixando a porta aberta. Termine disponibilizando-se.`,

  2: `Toque 2 — Check-in leve (15 dias depois). Tom de amigo que ta
  passando pra dar um alo. Pergunte genericamente se esta tudo bem com o
  sistema/projeto, sem pressionar. Mensagem curta, max 2 frases, com
  uma pergunta aberta no fim.`,

  3: `Toque 3 — Dica sazonal (30 dias depois). Contexto: estamos em
  Brasilia/entorno, periodo seco intenso de maio a setembro. Geraccao de
  energia solar CAI ate 25% com poeira acumulada nas placas. Mencione
  isso como dica util (nao como venda), e termine dizendo que se ele
  precisar de limpeza ou vistoria e so chamar. Tom educativo, nao
  comercial. 3-4 frases.`,

  4: `Toque 4 — Expansao (45 dias depois). Mencione que a Ecosunpower
  trabalha tambem com BATERIA (backup pra quando falta luz), ampliacao
  de sistema pra quem quer gerar mais energia, e equipamentos premium
  como SolarEdge e Deye. Posicione como informativo — "caso voce esteja
  pensando em crescer, fala comigo". Nao empurre venda. 3-4 frases.`,

  5: `Toque 5 — Ultimo toque (60 dias depois). Tom de despedida gentil.
  "Olha, fica comigo registrado que nao te chamo mais ate voce me
  chamar. Qualquer coisa — duvida, projeto novo, manutencao — e so
  chamar direto aqui, respondo rapido." Curto, sincero, 2 frases.`,
};

export class CadenceService {
  constructor(
    private supabase: SupabaseService,
    private anthropic: Anthropic,
    private sendText: (to: string, text: string) => Promise<void>,
  ) {}

  /**
   * Processa todos os toques vencidos dentro do horario comercial BRT.
   * Fora de 9h-20h, nao envia (a intencao e parecer atendimento humano, nao robo 24/7).
   */
  async processCadence(): Promise<number> {
    const now = new Date();
    const brtHour = (now.getUTCHours() - 3 + 24) % 24;
    if (brtHour < 9 || brtHour >= 20) {
      return 0; // fora do horario comercial, espera proxima janela
    }

    const due = await this.supabase.getDueCadenceSteps();
    if (due.length === 0) return 0;

    let sent = 0;
    for (const row of due) {
      try {
        const locked = await this.supabase.lockCadenceForSending(row.id);
        if (!locked) {
          console.log(`[cadence] Step ${row.step} do lead ${row.lead_id} nao travado (cancelado ou outro processo)`);
          continue;
        }

        const text = await this.generateMessage({ clientName: row.name, step: row.step });
        await this.sendBubbles(row.phone, text);
        await this.supabase.markCadenceSent(row.id, text);
        sent++;
        console.log(`[cadence] Toque ${row.step} enviado pra ${row.phone} (${row.name ?? 'sem nome'})`);

        // Pequeno delay entre envios pra nao parecer bot e nao estourar rate limit
        await new Promise((r) => setTimeout(r, 1500 + Math.random() * 2500));
      } catch (err) {
        console.error(`[cadence] Falha ao enviar toque ${row.step} pra ${row.phone}:`, (err as Error).message);
        await this.supabase.unlockCadence(row.id).catch(() => {});
      }
    }

    return sent;
  }

  private async generateMessage(ctx: StepContext): Promise<string> {
    const nameHint = ctx.clientName
      ? `O nome do cliente e "${ctx.clientName}". Chame ele pelo primeiro nome de forma natural (ex: "Oi Rodrigo,"). Evite nomes compostos.`
      : `Nao sabemos o nome do cliente, comece com um "Oi," informal.`;

    const systemPrompt = `Voce e a Eva, engenheira especialista em energia da Ecosunpower (Brasilia/DF).
Seu papel: enviar UMA mensagem curta de reengajamento em WhatsApp pra um cliente que ja conhece o Junior pessoalmente.

REGRAS OBRIGATORIAS:
- Escreva em portugues brasileiro informal, tom de conversa humana de WhatsApp.
- NUNCA use "Ola" (muito formal). Use "Oi".
- NUNCA mencione que voce e IA, bot, ou automatizada.
- NUNCA prometa "zerar conta de luz" (e proibido).
- NUNCA mencione a marca "Growatt" (banida na empresa).
- Pode mencionar marcas premium: Trina, Jinko, SolarEdge, Deye, Sungrow.
- Mensagem deve ter 2-4 frases no maximo.
- Pode usar no maximo 1 emoji, e de forma sutil.
- Nao assine a mensagem (nao colocar "Eva" ou "Junior" no final).
- Use quebras de linha naturais (pode ter 1-2 paragrafos separados por linha em branco, se fizer sentido).

${nameHint}

${STEP_GUIDANCE[ctx.step]}`;

    const response = await this.anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: systemPrompt,
      messages: [
        { role: 'user', content: `Gere agora a mensagem do toque ${ctx.step}.` },
      ],
    });

    const block = response.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') throw new Error('Claude nao retornou texto');
    return block.text.trim();
  }

  /**
   * Envia mensagem quebrada em bolhas separadas por linha em branco,
   * com delay 0.9-2.1s entre elas pra parecer digitacao humana.
   */
  private async sendBubbles(to: string, text: string): Promise<void> {
    const bubbles = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
    for (const bubble of bubbles) {
      await this.sendText(to, bubble);
      if (bubble !== bubbles[bubbles.length - 1]) {
        const delay = 900 + Math.random() * 1200;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
}
