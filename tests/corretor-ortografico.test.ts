import { describe, it, expect, vi } from 'vitest';
import { numerosDe, correcaoSegura, corrigirOrtografia } from '../src/modules/corretor-ortografico.js';

describe('numerosDe', () => {
  it('extrai números COMPLETOS (com separadores)', () => {
    expect(numerosDe('R$ 32.000,00 e 8,4 kWp')).toEqual(['32.000,00', '8,4']);
    expect(numerosDe('vence 25/06/2026, 60%')).toEqual(['25/06/2026', '60']);
    expect(numerosDe('sem numero')).toEqual([]);
  });
});

describe('correcaoSegura', () => {
  it('aceita correção que só conserta português', () => {
    expect(correcaoSegura('vc nao tem direito', 'você não tem direito')).toBe(true);
  });
  it('REJEITA se algum número mudou (protege valores)', () => {
    expect(correcaoSegura('investimento de R$ 32.000', 'investimento de R$ 32.500')).toBe(false);
    expect(correcaoSegura('8,4 kWp', '8,5 kWp')).toBe(false);
  });
  it('REJEITA se a quantidade de números mudou (reformatou)', () => {
    expect(correcaoSegura('total 32000 reais', 'total 32.000 reais')).toBe(false);
  });
  it('REJEITA troca de separador decimal/milhar (R$ 2.500,50 → 2.500.50)', () => {
    expect(correcaoSegura('valor R$ 2.500,50', 'valor R$ 2.500.50')).toBe(false);
  });
  it('REJEITA se reescreveu/encolheu demais', () => {
    expect(correcaoSegura('texto longo original aqui com varias palavras', 'curto')).toBe(false);
  });
  it('REJEITA corrigido vazio', () => {
    expect(correcaoSegura('algum texto', '   ')).toBe(false);
  });
  it('preserva números intactos → aceita', () => {
    expect(correcaoSegura('economia de R$ 480 por mes', 'economia de R$ 480 por mês')).toBe(true);
  });
});

function makeClient(resposta: string) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: resposta }] }),
    },
  } as any;
}

describe('corrigirOrtografia', () => {
  it('devolve o texto corrigido quando é seguro', async () => {
    const client = makeClient('Você não tem direito a isso.');
    const out = await corrigirOrtografia(client, 'vc nao tem direito a isso.');
    expect(out).toBe('Você não tem direito a isso.');
  });

  it('mantém o ORIGINAL se a IA mudar um número', async () => {
    const client = makeClient('investimento de R$ 35.000');
    const out = await corrigirOrtografia(client, 'investimento de R$ 32.000');
    expect(out).toBe('investimento de R$ 32.000'); // original preservado
  });

  it('texto curto demais → não chama IA, devolve original', async () => {
    const client = makeClient('xx');
    const out = await corrigirOrtografia(client, 'ok');
    expect(out).toBe('ok');
    expect(client.messages.create).not.toHaveBeenCalled();
  });

  it('erro da IA → devolve original (nunca quebra)', async () => {
    const client = { messages: { create: vi.fn().mockRejectedValue(new Error('timeout')) } } as any;
    const out = await corrigirOrtografia(client, 'algum texto pra corrigir');
    expect(out).toBe('algum texto pra corrigir');
  });

  it('null/undefined → string vazia, sem chamar IA', async () => {
    const client = makeClient('x');
    expect(await corrigirOrtografia(client, null)).toBe('');
    expect(await corrigirOrtografia(client, undefined)).toBe('');
    expect(client.messages.create).not.toHaveBeenCalled();
  });
});
