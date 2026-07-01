// tests/abordagem-redator.test.ts
import { describe, it, expect } from 'vitest';
import { montarPromptAbordagem, limparMensagem, clampMensagem } from '../src/modules/monitoring/abordagem/redator.js';

const ctx = {
  tipo: 'queda' as const, etapa: 1,
  objetivo: 'Apresentar-se e perguntar sobre limpeza',
  clienteNome: 'João Silva',
  dados: { percentualQueda: 35, diasOffline: null, mes: null, causaRaizAnterior: null },
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

describe('abordagem/redator: clamp do tamanho (corpo WABA)', () => {
  it('mensagem curta passa intacta', () => {
    const curta = 'Oi João! Sua usina está ótima ☀️';
    expect(clampMensagem(curta)).toBe(curta);
  });
  it('mensagem longa corta no último espaço antes do limite e termina com …', () => {
    const palavra = 'solar ';
    const longa = palavra.repeat(200); // 1200 chars
    const out = clampMensagem(longa, 700);
    expect(out.length).toBeLessThanOrEqual(700 + 1); // corte + '…'
    expect(out.endsWith('…')).toBe(true);
    expect(out.includes('sol…')).toBe(false); // não pica palavra no meio
  });
});
