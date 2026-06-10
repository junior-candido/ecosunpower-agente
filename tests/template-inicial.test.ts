// tests/template-inicial.test.ts
//
// TDD para enviarTemplateInicial — abertura de conversa via template aprovado
// WABA (lead de formulario NUNCA falou com a gente => fora da janela 24h =>
// texto livre e rejeitado pela Meta; template e obrigatorio).
// Padrao identico ao auto-ack (index.ts) e cadencia (cadence.ts): tenta o
// template pedido, se a Meta devolver 132001 ("does not exist") cai pro
// fallback aprovado reativacao_lead_v1.

import { describe, it, expect } from 'vitest';
import { enviarTemplateInicial, TEMPLATE_FALLBACK } from '../src/modules/template-inicial.js';

type Chamada = { to: string; name: string; lang: string; components: unknown[] };

function senderFake(comportamento?: (name: string) => void) {
  const chamadas: Chamada[] = [];
  return {
    chamadas,
    sendTemplate: async (to: string, name: string, lang: string, components: unknown[]) => {
      comportamento?.(name);
      chamadas.push({ to, name, lang, components });
      return { messageId: `wamid-${chamadas.length}` };
    },
  };
}

const bodyComNome = (nome: string) => [
  { type: 'body', parameters: [{ type: 'text', text: nome }] },
];

describe('enviarTemplateInicial', () => {
  it('envia o template pedido com {{1}}=primeiro nome e retorna o nome usado', async () => {
    const sender = senderFake();
    const r = await enviarTemplateInicial(sender, '5561999990000', 'Kelly Martins de Albuquerque', 'eva_qualificacao_v1');
    expect(r.templateUsado).toBe('eva_qualificacao_v1');
    expect(sender.chamadas).toHaveLength(1);
    expect(sender.chamadas[0]).toEqual({
      to: '5561999990000',
      name: 'eva_qualificacao_v1',
      lang: 'pt_BR',
      components: bodyComNome('Kelly'),
    });
  });

  it('usa "tudo bem" quando o lead nao tem nome', async () => {
    const sender = senderFake();
    await enviarTemplateInicial(sender, '5561999990000', null, 'eva_qualificacao_v1');
    expect(sender.chamadas[0].components).toEqual(bodyComNome('tudo bem'));
  });

  it('usa "tudo bem" quando o nome e string vazia/espacos', async () => {
    const sender = senderFake();
    await enviarTemplateInicial(sender, '5561999990000', '   ', 'eva_qualificacao_v1');
    expect(sender.chamadas[0].components).toEqual(bodyComNome('tudo bem'));
  });

  it('cai pro fallback reativacao_lead_v1 quando a Meta devolve 132001', async () => {
    const sender = senderFake((name) => {
      if (name === 'eva_qualificacao_v1') {
        throw new Error('(#132001) Template name does not exist in the translation');
      }
    });
    const r = await enviarTemplateInicial(sender, '5561999990000', 'Bill Silva', 'eva_qualificacao_v1');
    expect(r.templateUsado).toBe(TEMPLATE_FALLBACK);
    expect(sender.chamadas).toHaveLength(1);
    expect(sender.chamadas[0].name).toBe('reativacao_lead_v1');
    expect(sender.chamadas[0].components).toEqual(bodyComNome('Bill'));
  });

  it('relanca erro que NAO e 132001 sem tentar fallback', async () => {
    const sender = senderFake(() => {
      throw new Error('(#131047) Re-engagement message');
    });
    await expect(
      enviarTemplateInicial(sender, '5561999990000', 'Bill Silva', 'eva_qualificacao_v1'),
    ).rejects.toThrow('131047');
    expect(sender.chamadas).toHaveLength(0);
  });

  it('nao quebra quando o erro lancado nao e Error (string/objeto)', async () => {
    const sender = senderFake(() => {
      // eslint-disable-next-line no-throw-literal
      throw 'Meta WABA API 400: erro bruto em string';
    });
    await expect(
      enviarTemplateInicial(sender, '5561999990000', 'Bill', 'eva_qualificacao_v1'),
    ).rejects.toBeTruthy();
    expect(sender.chamadas).toHaveLength(0);
  });

  it('cai pro fallback quando erro 132001 vem como string (nao-Error)', async () => {
    const sender = senderFake((name) => {
      if (name === 'eva_qualificacao_v1') {
        // eslint-disable-next-line no-throw-literal
        throw '(#132001) Template name does not exist';
      }
    });
    const r = await enviarTemplateInicial(sender, '5561999990000', 'Bill', 'eva_qualificacao_v1');
    expect(r.templateUsado).toBe(TEMPLATE_FALLBACK);
  });

  it('relanca erro quando o proprio fallback falha (sem loop)', async () => {
    const sender = senderFake(() => {
      throw new Error('(#132001) Template name does not exist in the translation');
    });
    await expect(
      enviarTemplateInicial(sender, '5561999990000', 'Bill', TEMPLATE_FALLBACK),
    ).rejects.toThrow('132001');
    expect(sender.chamadas).toHaveLength(0);
  });
});
