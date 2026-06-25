import { describe, it, expect } from 'vitest';
import { montarPromptComercial, type DadosComercial } from '../src/modules/ia-comercial.js';

const dadosPadrao: DadosComercial = {
  nomeLead: 'Roberto Silva',
  etapa: 'qualificado',
  tipoMensagem: 'follow_up',
};

describe('montarPromptComercial', () => {
  it('retorna uma string não vazia', () => {
    const prompt = montarPromptComercial(dadosPadrao);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(50);
  });

  it('inclui o nome do lead no prompt', () => {
    const prompt = montarPromptComercial(dadosPadrao);
    expect(prompt).toContain('Roberto Silva');
  });

  it('inclui o tipo de mensagem no prompt', () => {
    const prompt = montarPromptComercial(dadosPadrao);
    expect(prompt).toContain('follow_up');
  });

  it('inclui contexto quando fornecido', () => {
    const prompt = montarPromptComercial({
      ...dadosPadrao,
      contexto: 'Cliente tem conta de R$ 800/mês e quer reduzir',
    });
    expect(prompt).toContain('800');
  });

  it('inclui economia quando fornecida', () => {
    const prompt = montarPromptComercial({
      ...dadosPadrao,
      economiaMensalRs: 650,
    });
    expect(prompt).toContain('650');
  });

  it('funciona sem contexto e sem economia', () => {
    const prompt = montarPromptComercial({
      nomeLead: 'Ana',
      etapa: 'novo',
      tipoMensagem: 'primeiro_contato',
    });
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(50);
  });
});
