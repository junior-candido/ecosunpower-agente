// tests/closing-assistant.test.ts
import { describe, it, expect } from 'vitest';
import { ClosingAssistant, type LlmCaller } from '../src/modules/closing/closing-assistant.js';
import { dadosFechamentoCamilaMesmaPessoa } from './fixtures/closing-camila.js';

const okLlm: LlmCaller = async () => ({
  action: 'ready_to_generate',
  updates: {},
  message: '✅ Tudo certo, vou gerar.',
});

const missingLlm: LlmCaller = async () => ({
  action: 'ask_missing',
  updates: { titular_uc: { rg: '26163' } as any },
  message: 'Falta forma de pagamento.',
});

describe('ClosingAssistant', () => {
  it('processMessage merge updates no estado e retorna mensagem', async () => {
    const assistant = new ClosingAssistant({ llm: missingLlm });
    const initial = { titular_uc: { tipo: 'PF', nome: 'X' } as any };
    const res = await assistant.processMessage('o RG é 26163 MTE-DF', { stage: 'collecting', data: initial, pending_questions: [] });
    expect(res.newState.stage).toBe('collecting');
    expect((res.newState as any).data.titular_uc.rg).toBe('26163');
    expect(res.replyText).toContain('forma de pagamento');
  });

  it('processMessage transita pra awaiting_confirm quando LLM diz ready_to_generate E validador OK', async () => {
    const assistant = new ClosingAssistant({ llm: okLlm });
    const res = await assistant.processMessage('gera', {
      stage: 'collecting',
      data: dadosFechamentoCamilaMesmaPessoa as any,
      pending_questions: [],
    });
    expect(res.newState.stage).toBe('awaiting_confirm');
  });

  it('processMessage NÃO transita pra awaiting_confirm se LLM disser ready mas validador achar campo faltando', async () => {
    const assistant = new ClosingAssistant({ llm: okLlm });
    const res = await assistant.processMessage('gera', {
      stage: 'collecting',
      data: { titular_uc: { tipo: 'PF', nome: 'X' } as any } as any,
      pending_questions: [],
    });
    expect(res.newState.stage).toBe('collecting');
    expect(res.replyText.toLowerCase()).toContain('falta');
  });

  it('processMessage retorna cancelled quando LLM disser cancel', async () => {
    const cancelLlm: LlmCaller = async () => ({ action: 'cancel', updates: {}, message: '❌ Cancelado.' });
    const assistant = new ClosingAssistant({ llm: cancelLlm });
    const res = await assistant.processMessage('cancela', {
      stage: 'collecting', data: {}, pending_questions: [],
    });
    expect(res.newState.stage).toBe('cancelled');
  });
});
