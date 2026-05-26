// src/modules/closing/closing-assistant.ts
// Orquestrador conversacional do modo /fechar.
// LLM extrai updates do texto livre, validator é o gate final antes de transitar pra awaiting_confirm.

import type { DadosFechamento, ClosingState } from './types.js';
import { findMissingRequired } from './closing-validator.js';
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

    // Se LLM disse ready_to_generate mas validador discorda, força volta pra collecting
    const replyText = missing.length > 0
      ? `${llm.message}\n\nAinda falta: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ` e mais ${missing.length - 8}` : ''}.`
      : llm.message;

    return {
      newState: { stage: 'collecting', data: merged, pending_questions: missing },
      replyText,
    };
  }
}
