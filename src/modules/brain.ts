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
  action: ActionPayload | null;
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

    return {
      text,
      displayText: this.getDisplayText(text),
      action: this.parseAction(text),
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

    return content;
  }

  parseAction(responseText: string): ActionPayload | null {
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    if (!jsonMatch) return null;

    try {
      return JSON.parse(jsonMatch[1]) as ActionPayload;
    } catch {
      return null;
    }
  }

  getDisplayText(responseText: string): string {
    return responseText
      .replace(/```json\s*[\s\S]*?\s*```/g, '')
      .replace(/\n{3,}/g, '\n')
      .trim();
  }
}
