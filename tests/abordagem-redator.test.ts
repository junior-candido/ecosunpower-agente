// tests/abordagem-redator.test.ts
import { describe, it, expect } from 'vitest';
import { montarPromptAbordagem, limparMensagem } from '../src/modules/monitoring/abordagem/redator.js';

const ctx = {
  tipo: 'queda' as const, etapa: 1,
  objetivo: 'Apresentar-se e perguntar sobre limpeza',
  clienteNome: 'João Silva',
  dados: { percentualQueda: 35, diasOffline: null, trimestre: null, causaRaizAnterior: null },
  regrasTreino: ['Nunca usar a palavra "prejuízo"'],
  ajusteDoJunior: null,
  mensagemAnterior: null,
};

describe('abordagem/redator: prompt', () => {
  it('inclui objetivo, nome, dados reais e regras de treino', () => {
    const p = montarPromptAbordagem(ctx);
    expect(p).toContain('João');
    expect(p).toContain('35');
    expect(p).toContain('prejuízo');
    expect(p).toContain('NUNCA');           // guardrails
    expect(p).toContain('preço');           // proibição de preço
  });
  it('ajuste do Junior entra como ordem prioritária', () => {
    const p = montarPromptAbordagem({ ...ctx, ajusteDoJunior: 'fica mais informal', mensagemAnterior: 'Olá João...' });
    expect(p).toContain('fica mais informal');
    expect(p).toContain('Olá João...');
  });
});

describe('abordagem/redator: limpeza da saída', () => {
  it('tira aspas e prefixos de laudo', () => {
    expect(limparMensagem('"Oi João! Tudo bem?"')).toBe('Oi João! Tudo bem?');
    expect(limparMensagem('Mensagem: Oi João')).toBe('Oi João');
  });
  it('vazio → null (nunca manda mensagem vazia)', () => {
    expect(limparMensagem('   ')).toBeNull();
  });
});
