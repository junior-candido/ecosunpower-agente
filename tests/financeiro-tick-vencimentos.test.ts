import { describe, it, expect, vi } from 'vitest';
import { dentroDaJanela8h, tickVencimentos } from '../src/modules/financeiro/tick-vencimentos.js';
import { ehDas } from '../src/modules/financeiro/alertas-vencimento.js';

describe('ehDas', () => {
  it('decide pela categoria quando existe', () => {
    expect(ehDas({ descricao: 'aluguel das salas', categoria_slug: 'imposto_das' })).toBe(true);
    expect(ehDas({ descricao: 'DAS 08/2026', categoria_slug: 'outros' })).toBe(false);
  });
  it('sem categoria: só palavra inteira DAS em maiúscula', () => {
    expect(ehDas({ descricao: 'DAS 08/2026' })).toBe(true);
    expect(ehDas({ descricao: 'limpeza das salas', categoria_slug: null })).toBe(false);
  });
});

describe('dentroDaJanela8h', () => {
  it('11h UTC = 8h BRT → dentro', () => {
    expect(dentroDaJanela8h(new Date('2026-09-10T11:15:00Z'))).toBe(true);
  });
  it('outras horas → fora', () => {
    expect(dentroDaJanela8h(new Date('2026-09-10T10:59:00Z'))).toBe(false);
    expect(dentroDaJanela8h(new Date('2026-09-10T12:00:00Z'))).toBe(false);
  });
});

// Mock encadeável: todo método devolve o próprio objeto; o await final resolve `resultado`.
function chainMock(resultado: unknown = { data: [], error: null }) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'insert', 'update', 'eq', 'is', 'in', 'gte', 'lte', 'order', 'limit']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.single = vi.fn().mockResolvedValue({ data: { lembretes: [] }, error: null });
  chain.then = (res: (v: unknown) => void) => res(resultado);
  return { client: { from: vi.fn(() => chain) } as never };
}

describe('tickVencimentos', () => {
  it('fora da janela não faz nada', async () => {
    const enviarComBotoes = vi.fn();
    const { client } = chainMock();
    await tickVencimentos({ client, adminPhone: '5561', hoje: () => '2026-09-10', enviarComBotoes }, new Date('2026-09-10T15:00:00Z'));
    expect(enviarComBotoes).not.toHaveBeenCalled();
  });

  it('conta que vence hoje → 1 envio com botão finpg:paguei:<id>', async () => {
    const enviarComBotoes = vi.fn().mockResolvedValue(undefined);
    const { client } = chainMock({
      data: [{ id: 'c1', descricao: 'LATAM', valor: 100, vencimento: '2026-09-10', mundo: 'PF', lembretes: [] }],
      error: null,
    });
    await tickVencimentos({ client, adminPhone: '5561', hoje: () => '2026-09-10', enviarComBotoes }, new Date('2026-09-10T11:00:00Z'));
    expect(enviarComBotoes).toHaveBeenCalledTimes(1);
    const [to, body, buttons] = enviarComBotoes.mock.calls[0];
    expect(to).toBe('5561');
    expect(body).toContain('VENCE HOJE');
    expect(buttons.map((b: { id: string }) => b.id)).toEqual(['finpg:paguei:c1', 'finpg:ver:c1']);
  });

  it('falha no envio da 1ª conta não impede o alerta da 2ª', async () => {
    const enviarComBotoes = vi.fn().mockRejectedValueOnce(new Error('WABA caiu')).mockResolvedValue(undefined);
    const { client } = chainMock({
      data: [
        { id: 'c1', descricao: 'LATAM', valor: 100, vencimento: '2026-09-10', mundo: 'PF', lembretes: [] },
        { id: 'c2', descricao: 'Sicoob', valor: 200, vencimento: '2026-09-10', mundo: 'PJ', lembretes: [] },
      ],
      error: null,
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await tickVencimentos({ client, adminPhone: '5561', hoje: () => '2026-09-10', enviarComBotoes }, new Date('2026-09-10T11:00:00Z'));
    spy.mockRestore();
    expect(enviarComBotoes).toHaveBeenCalledTimes(2);
    expect(enviarComBotoes.mock.calls[1][2].map((b: { id: string }) => b.id)).toEqual(['finpg:paguei:c2', 'finpg:ver:c2']);
  });
});
