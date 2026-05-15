import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

interface MessageEntry {
  role: 'user' | 'assistant';
  content: string;
}

interface ActionPayload {
  action: string;
  data: Record<string, unknown>;
}

export interface BrainResponse {
  text: string;
  displayText: string;
  displayMessages: string[];
  action: ActionPayload | null;
  actions: ActionPayload[];
}

// Converte markdown -> formatação que o WhatsApp realmente renderiza.
// WhatsApp NÃO tem #/##/headers, --- régua, ** (negrito é *1 asterisco*),
// > blockquote. O modelo espelha o estilo do prompt (md) e vazava tudo
// literal pro cliente (ex conversa Alessandro). Defesa em profundidade —
// roda em todo retorno do brain via getDisplayText.
export function toWhatsAppText(text: string): string {
  if (!text) return '';
  let t = text;
  // 1. **negrito** -> *negrito* (par fechado, sem * nem \n no meio)
  t = t.replace(/\*\*([^\n*]+?)\*\*/g, '*$1*');
  // 2. Header markdown (# … ######) -> linha em *negrito*. Tira TODOS os *
  // do texto (header com **preço** dentro nao pode virar * aninhado); se
  // sobrar vazio (header so de simbolos), nao emite nada.
  t = t.replace(/^[ \t]*#{1,6}[ \t]+(.+?)[ \t]*$/gm, (_m, h: string) => {
    const clean = h.replace(/\*+/g, ' ').replace(/\s+/g, ' ').trim();
    return clean ? `*${clean}*` : '';
  });
  // 3. Régua horizontal (--- *** ___ ===) some (linha + quebra)
  t = t.replace(/^[ \t]*([-*_=])\1{2,}[ \t]*\n?/gm, '');
  // 4. Blockquote "> " no início da linha some
  t = t.replace(/^[ \t]*>[ \t]?/gm, '');
  // 5. Colapsa excesso de linha em branco e apara
  return t.replace(/\n{3,}/g, '\n\n').trim();
}

export class Brain {
  private client: Anthropic;
  private systemPrompt: string;
  private residencialPrompt: string;
  private reviewLink: string;

  constructor(apiKey: string, reviewLink = '') {
    this.client = new Anthropic({ apiKey });

    const promptsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts');
    this.systemPrompt = readFileSync(join(promptsDir, 'system-prompt.md'), 'utf-8');
    this.residencialPrompt = readFileSync(join(promptsDir, 'residencial.md'), 'utf-8');
    this.reviewLink = reviewLink;
  }

  async processMessage(
    userMessage: string,
    history: MessageEntry[],
    knowledgeBase: string,
    summary: string | null,
    qualificationStep: string
  ): Promise<BrainResponse> {
    const systemContent = this.buildSystemContent(knowledgeBase, summary, qualificationStep);

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...history,
      { role: 'user', content: userMessage },
    ];

    const response = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemContent,
      messages,
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('');

    const actions = this.parseActions(text);
    const displayText = this.getDisplayText(text);
    return {
      text,
      displayText,
      displayMessages: this.getDisplayMessages(displayText),
      action: actions[0] ?? null,
      actions,
    };
  }

  private buildSystemContent(
    knowledgeBase: string,
    summary: string | null,
    qualificationStep: string
  ): string {
    // Substitui placeholder do link de avaliacao no Google. Se nao tiver
    // configurado (env GOOGLE_REVIEW_URL), substitui por string vazia — Eva
    // aprende pelo prompt que nao tem link disponivel.
    let content = this.systemPrompt.replaceAll('{{review_link}}', this.reviewLink);

    content += '\n\n## Base de Conhecimento da Ecosunpower\n\n' + knowledgeBase;

    if (qualificationStep.includes('residencial') || qualificationStep === 'inicio') {
      content += '\n\n' + this.residencialPrompt;
    }

    if (summary) {
      content += '\n\n## Resumo da conversa anterior\n' + summary;
    }

    content += `\n\n## Estado atual da qualificacao: ${qualificationStep}`;

    const now = new Date();
    const brtFormatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      weekday: 'long',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    content += `\n\n## Data e hora atual (Brasilia)\n${brtFormatter.format(now)}`;
    content += `\nData ISO: ${now.toISOString()}`;

    return content;
  }

  parseAction(responseText: string): ActionPayload | null {
    return this.parseActions(responseText)[0] ?? null;
  }

  parseActions(responseText: string): ActionPayload[] {
    const re = /```json\s*([\s\S]*?)\s*```/g;
    const actions: ActionPayload[] = [];
    let match: RegExpExecArray | null;
    while ((match = re.exec(responseText)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && typeof item.action === 'string') actions.push(item as ActionPayload);
          }
        } else if (parsed && typeof parsed.action === 'string') {
          actions.push(parsed as ActionPayload);
        }
      } catch {
        // skip invalid block
      }
    }
    return actions;
  }

  getDisplayText(responseText: string): string {
    // Tira o bloco de action, depois converte markdown -> WhatsApp-safe
    // (sem #/##/**/---/> vazando pro cliente). toWhatsAppText ja apara.
    return toWhatsAppText(
      responseText.replace(/```json\s*[\s\S]*?\s*```/g, ''),
    );
  }

  // Splits a response into WhatsApp-sized messages. If Eva used the
  // [MENSAGEM N] markers, split on those. Otherwise return as a single
  // message for backwards compatibility.
  getDisplayMessages(cleanedText: string): string[] {
    const text = cleanedText.trim();
    if (!text) return [];
    const markerRe = /\[MENSAGEM\s*\d+\]/gi;
    if (!markerRe.test(text)) return [text];

    const parts = text.split(/\[MENSAGEM\s*\d+\]/gi);
    const msgs = parts
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    return msgs.length > 0 ? msgs : [text];
  }
}
