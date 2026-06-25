import { describe, it, expect } from 'vitest';
import { montarPromptEngenharia, type DadosEngenharia } from '../src/modules/ia-engenharia.js';

const dadosPadrao: DadosEngenharia = {
  consumoMensalKwh: 400,
  potenciaKwp: 3.5,
  geracaoMensalKwh: 604,
  economiaMensalRs: 480,
  investimentoRs: 28000,
  paybackAnos: 4.86,
};

describe('montarPromptEngenharia', () => {
  it('retorna uma string não vazia', () => {
    const prompt = montarPromptEngenharia(dadosPadrao);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(50);
  });

  it('inclui os números principais no prompt', () => {
    const prompt = montarPromptEngenharia(dadosPadrao);
    expect(prompt).toContain('400');
    expect(prompt).toContain('3.5');
    expect(prompt).toContain('480');
    expect(prompt).toContain('28.000');
  });

  it('inclui o nome do cliente quando fornecido', () => {
    const prompt = montarPromptEngenharia({ ...dadosPadrao, nomeCliente: 'Carlos' });
    expect(prompt).toContain('Carlos');
  });

  it('funciona sem nome do cliente', () => {
    const prompt = montarPromptEngenharia(dadosPadrao);
    expect(typeof prompt).toBe('string');
  });

  it('indica payback nulo de forma clara quando economia é inviável', () => {
    const prompt = montarPromptEngenharia({ ...dadosPadrao, paybackAnos: null });
    expect(prompt).not.toContain('null');
    expect(prompt).not.toContain('undefined');
  });
});
