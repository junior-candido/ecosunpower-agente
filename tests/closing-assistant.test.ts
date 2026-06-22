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

  it('contratante ESPELHA o titular_uc quando contratante_eh_titular (sem "undefined" no contrato)', async () => {
    // BUG real Fabio: dados iam pro titular_uc mas o contratante ficava com a versão
    // vazia inicial → contrato com CPF/RG/endereço "undefined". Agora espelha.
    const llm: LlmCaller = async () => ({
      action: 'ask_missing',
      updates: { titular_uc: { cpf: '177.752.778-31', rg: '3017539', orgao_emissor_rg: 'SSP/SP' } as any },
      message: 'ok',
    });
    const assistant = new ClosingAssistant({ llm });
    const initial = {
      titular_uc: { tipo: 'PF', nome: 'Fabio', telefone: '5561999656622' } as any,
      contratante: { tipo: 'PF', nome: 'Fabio', telefone: '5561999656622' } as any, // versão vazia
      contratante_eh_titular: true,
    };
    const res = await assistant.processMessage('cpf e rg', { stage: 'collecting', data: initial as any, pending_questions: [] });
    const data = (res.newState as any).data;
    expect(data.contratante.cpf).toBe('177.752.778-31');
    expect(data.contratante.rg).toBe('3017539');
    expect(data.contratante.orgao_emissor_rg).toBe('SSP/SP');
    expect(data.contratante).toEqual(data.titular_uc);
  });

  it('NÃO espelha o contratante quando é outra pessoa (contratante_eh_titular false)', async () => {
    const llm: LlmCaller = async () => ({
      action: 'ask_missing',
      updates: { titular_uc: { cpf: 'TITULAR-CPF' } as any },
      message: 'ok',
    });
    const assistant = new ClosingAssistant({ llm });
    const initial = {
      titular_uc: { tipo: 'PF', nome: 'Titular' } as any,
      contratante: { tipo: 'PF', nome: 'Conjuge', cpf: 'CONJUGE-CPF' } as any,
      contratante_eh_titular: false,
    };
    const res = await assistant.processMessage('x', { stage: 'collecting', data: initial as any, pending_questions: [] });
    const data = (res.newState as any).data;
    expect(data.contratante.nome).toBe('Conjuge');
    expect(data.contratante.cpf).toBe('CONJUGE-CPF');
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
