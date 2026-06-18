// tests/closing-assistant.test.ts
import { describe, it, expect, vi } from 'vitest';
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

  it('[corretor] SUGERE ajuste das disposicoes mas MANTÉM o texto literal do Junior (jurídico)', async () => {
    const corrigirTexto = vi.fn().mockResolvedValue('Garantia estendida de 5 anos.');
    const assistant = new ClosingAssistant({ llm: okLlm, corrigirTexto });
    const original = 'garantia estendida de 5 anos';
    const dados = { ...dadosFechamentoCamilaMesmaPessoa, disposicoes_especiais: original } as any;
    const res = await assistant.processMessage('gera', { stage: 'collecting', data: dados, pending_questions: [] });
    expect(corrigirTexto).toHaveBeenCalledWith(original, { conservador: true });
    expect(res.newState.stage).toBe('awaiting_confirm');
    // texto LITERAL preservado (não aplica a correção automático no contrato)
    expect((res.newState as any).data.disposicoes_especiais).toBe(original);
    // mas mostra a sugestão pro Junior
    expect(res.replyText).toContain('possível ajuste');
    expect(res.replyText).toContain('Garantia estendida de 5 anos.');
  });

  it('[corretor] não sugere nada se a correção for igual ao original', async () => {
    const corrigirTexto = vi.fn().mockImplementation(async (t: string) => t);
    const assistant = new ClosingAssistant({ llm: okLlm, corrigirTexto });
    const dados = { ...dadosFechamentoCamilaMesmaPessoa, disposicoes_especiais: 'Texto já correto.' } as any;
    const res = await assistant.processMessage('gera', { stage: 'collecting', data: dados, pending_questions: [] });
    expect(res.replyText).not.toContain('possível ajuste');
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
