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

export class Brain {
  private client: Anthropic;
  private systemPrompt: string;
  private residencialPrompt: string;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });

    const promptsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts');
    this.systemPrompt = readFileSync(join(promptsDir, 'system-prompt.md'), 'utf-8');
    this.residencialPrompt = readFileSync(join(promptsDir, 'residencial.md'), 'utf-8');
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
    let content = this.systemPrompt;

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
    return responseText
      .replace(/```json\s*[\s\S]*?\s*```/g, '')
      .replace(/\n{3,}/g, '\n')
      .trim();
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
