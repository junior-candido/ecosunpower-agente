import { describe, it, expect } from 'vitest';
import { gerarAssuntoAbertura } from '../src/modules/email/email-writer.js';

function fakeAnthropic(texto: string) {
  return { messages: { create: async () => ({ content: [{ type: 'text', text: texto }] }) } };
}

describe('gerarAssuntoAbertura', () => {
  it('usa o texto da IA quando nao tem preco', async () => {
    const anthropic = fakeAnthropic('ASSUNTO: Joao, sua conta pode cair\nABERTURA: Oi Joao, vi que voce e de Brasilia');
    const r = await gerarAssuntoAbertura(anthropic as any, { step: 1, tema: 'boas-vindas', nome: 'Joao', cidade: 'Brasilia' }, 'Assunto padrao');
    expect(r.assunto).toContain('Joao');
    expect(r.abertura).toContain('Brasilia');
  });

  it('cai pro assunto padrao se a IA cravar preco', async () => {
    const anthropic = fakeAnthropic('ASSUNTO: Economize R$ 850 por mes\nABERTURA: paga so 12x de 499');
    const r = await gerarAssuntoAbertura(anthropic as any, { step: 1, tema: 'x', nome: 'Ana', cidade: 'GO' }, 'Sua energia solar');
    expect(r.assunto).toBe('Sua energia solar');
    expect(r.abertura).toBe('');   // abertura com preco vira vazia (o corpo do modelo assume)
  });
});
