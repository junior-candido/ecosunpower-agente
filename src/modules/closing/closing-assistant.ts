// src/modules/closing/closing-assistant.ts
// Orquestrador conversacional do modo /fechar.
// LLM extrai updates do texto livre, validator é o gate final antes de transitar pra awaiting_confirm.

import type { DadosFechamento, ClosingState } from './types.js';
import { findMissingRequired, humanizeMissing } from './closing-validator.js';
import { buildObservacaoPartes } from './templates/contrato.html.js';

export interface LlmResponse {
  action: 'ask_missing' | 'ready_to_generate' | 'cancel';
  updates: Partial<DadosFechamento>;
  message: string;
}

export type LlmCaller = (userMessage: string, currentData: Partial<DadosFechamento>) => Promise<LlmResponse>;

export type ClosingStateOrCancelled = ClosingState | { stage: 'cancelled' };

export interface ProcessResult {
  newState: ClosingStateOrCancelled;
  replyText: string;
}

function deepMerge<T extends Record<string, any>>(a: T, b: Partial<T>): T {
  if (!b) return a;
  const out: any = { ...(a as any) };
  for (const k of Object.keys(b) as (keyof T)[]) {
    const av: any = (a as any)[k];
    const bv: any = (b as any)[k];
    if (bv && typeof bv === 'object' && !Array.isArray(bv) && av && typeof av === 'object') {
      out[k] = deepMerge(av, bv);
    } else {
      out[k] = bv;
    }
  }
  return out;
}

export interface ClosingAssistantOpts {
  llm: LlmCaller;
}

export class ClosingAssistant {
  constructor(private opts: ClosingAssistantOpts) {}

  async processMessage(userMessage: string, state: ClosingState): Promise<ProcessResult> {
    const data: Partial<DadosFechamento> = (state as any).data ?? {};
    const llm = await this.opts.llm(userMessage, data);

    if (llm.action === 'cancel') {
      return { newState: { stage: 'cancelled' }, replyText: llm.message || '❌ Modo fechamento cancelado.' };
    }

    const merged = deepMerge(data as any, llm.updates as any) as Partial<DadosFechamento>;
    // Recalcula observacao_partes deterministicamente
    const obs = buildObservacaoPartes(merged);
    if (obs) (merged as any).observacao_partes = obs;

    const missing = findMissingRequired(merged);
    if (llm.action === 'ready_to_generate' && missing.length === 0) {
      return {
        newState: { stage: 'awaiting_confirm', data: merged as DadosFechamento },
        replyText: llm.message,
      };
    }

    // Safety net: SÓ adiciona aviso "ainda falta X" quando o LLM disse
    // ready_to_generate mas o validador discorda. Quando LLM já listou (ask_missing),
    // a mensagem dele já é suficiente — não duplica com nomes técnicos.
    const replyText = (llm.action === 'ready_to_generate' && missing.length > 0)
      ? `${llm.message}\n\nNa verdade ainda falta:\n${humanizeMissing(missing)}`
      : llm.message;

    return {
      newState: { stage: 'collecting', data: merged, pending_questions: missing },
      replyText,
    };
  }
}

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname_closing = dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT_PATH = join(__dirname_closing, '..', '..', 'prompts', 'closing-system.md');

let cachedSystemPrompt: string | null = null;
function getSystemPrompt(): string {
  if (cachedSystemPrompt) return cachedSystemPrompt;
  cachedSystemPrompt = readFileSync(SYSTEM_PROMPT_PATH, 'utf-8');
  return cachedSystemPrompt;
}

/**
 * Tenta parsear JSON da resposta do LLM. Aceita 4 formatos:
 *   1. JSON puro
 *   2. JSON em bloco ```json...```
 *   3. JSON em bloco ```...```
 *   4. JSON cercado de texto livre (extrai do primeiro { até o último })
 * Retorna null se nada bater.
 */
function tryParseLlmJson(text: string): LlmResponse | null {
  if (!text) return null;
  const candidates: string[] = [];

  // Formato 2/3: bloco markdown
  const blockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (blockMatch) candidates.push(blockMatch[1].trim());

  // Formato 4: primeiro { até o último } (greedy)
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(text.slice(firstBrace, lastBrace + 1));
  }

  // Formato 1: o texto inteiro pode ser JSON puro
  candidates.push(text.trim());

  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (parsed && typeof parsed === 'object' && parsed.action && typeof parsed.message === 'string') {
        if (!parsed.updates) parsed.updates = {};
        return parsed as LlmResponse;
      }
    } catch {
      // tenta próximo candidato
    }
  }
  return null;
}

export function createAnthropicLlmCaller(apiKey: string): LlmCaller {
  const client = new Anthropic({ apiKey });

  return async (userMessage, currentData) => {
    const systemPrompt = getSystemPrompt();
    const stateBlock = `Estado atual coletado (Partial<DadosFechamento>):\n${JSON.stringify(currentData, null, 2)}`;

    const res = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: [
        { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
      ],
      messages: [
        { role: 'user', content: `${stateBlock}\n\n---\nMensagem do Junior:\n${userMessage}` },
      ],
    });

    const text = res.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('\n');
    // LLM responde JSON puro OU JSON em bloco ```json...``` OU JSON cercado de
    // texto explicativo. Tentamos achar o JSON pelo primeiro { até o último }.
    const parsed = tryParseLlmJson(text);
    if (parsed) return parsed;

    console.warn('[closing] LLM JSON parse falhou. Texto bruto:', text.slice(0, 500));
    return {
      action: 'ask_missing',
      updates: {},
      message: 'Hmm, perdi o fio. Manda os dados de novo, ou /fechar pra recomeçar.',
    };
  };
}
