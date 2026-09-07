import { describe, it, expect } from 'vitest';
import { gerarAssuntoAbertura } from '../src/modules/email/email-writer.js';

function fakeAnthropic(texto: string) {
  return { messages: { create: async () => ({ content: [{ type: 'text', text: texto }] }) } };
}

describe('gerarAssuntoAbertura', () => {
  it('usa o texto da IA quando nao tem preco', async () => {
    const anthropic = fakeAnthropic('ASSUNTO: João, sua conta pode cair\nABERTURA: Oi João, vi que você é de Brasília');
    const r = await gerarAssuntoAbertura(anthropic as any, { step: 1, tema: 'boas-vindas', nome: 'João', cidade: 'Brasília' }, 'Assunto padrão');
    expect(r.assunto).toContain('João');
    expect(r.abertura).toContain('Brasília');
  });

  it('cai pro assunto padrao se a IA cravar preco', async () => {
    const anthropic = fakeAnthropic('ASSUNTO: Economize R$ 850 por mês\nABERTURA: paga só 12x de 499');
    const r = await gerarAssuntoAbertura(anthropic as any, { step: 1, tema: 'x', nome: 'Ana', cidade: 'GO' }, 'Sua energia solar');
    expect(r.assunto).toBe('Sua energia solar');
    expect(r.abertura).toBe('');   // abertura com preco vira vazia (o corpo do modelo assume)
  });

  it('corta assunto longo demais da IA sem cortar no meio da palavra e sem reticencias', async () => {
    const assuntoLongo = 'João, essa novidade sobre energia solar em Brasília vai te interessar muito e economizar sua conta de luz todo mês';
    expect(assuntoLongo.length).toBeGreaterThan(70);
    const anthropic = fakeAnthropic(`ASSUNTO: ${assuntoLongo}\nABERTURA: Oi João`);
    const r = await gerarAssuntoAbertura(anthropic as any, { step: 1, tema: 'x', nome: 'João', cidade: 'Brasília' }, 'Assunto padrão');
    expect(r.assunto.length).toBeLessThanOrEqual(70);
    expect(r.assunto.endsWith(' ')).toBe(false);
    expect(r.assunto.endsWith('...')).toBe(false);
    // nao deve cortar no meio de uma palavra: a ultima palavra do resultado
    // deve aparecer inteira (como uma palavra completa) no texto original.
    const ultimaPalavra = r.assunto.split(' ').pop() as string;
    expect(assuntoLongo.split(' ')).toContain(ultimaPalavra);
  });

  // [07/09/2026] A TRAVA DE PORTUGUES. Antes dela, 289 dos 744 e-mails
  // enviados sairam com assunto sem acento: a IA as vezes escrevia torto e
  // ninguem barrava. Agora o texto torto e descartado e usamos a reserva, que
  // esta escrita certa — o cliente nao percebe que a IA falhou.
  it('descarta o texto da IA quando vem sem acento e usa a reserva', async () => {
    const anthropic = fakeAnthropic('ASSUNTO: Sua energia solar comeca aqui\nABERTURA: Ola, tudo bem com voce?');
    const r = await gerarAssuntoAbertura(
      anthropic as any,
      { step: 1, tema: 'x', nome: 'Ana', cidade: 'Brasília' },
      'Sua energia solar começa aqui',
    );
    expect(r.assunto).toBe('Sua energia solar começa aqui');
    expect(r.abertura).toBe('');
  });

  it('descarta o texto da IA quando vem com lixo de codificacao', async () => {
    const anthropic = fakeAnthropic('ASSUNTO: Energia solar â€” o seu próximo passo\nABERTURA: Olá!');
    const r = await gerarAssuntoAbertura(
      anthropic as any,
      { step: 1, tema: 'x', nome: 'Ana', cidade: 'Brasília' },
      'Assunto de reserva',
    );
    expect(r.assunto).toBe('Assunto de reserva');
  });
});
