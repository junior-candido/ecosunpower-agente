import { describe, it, expect, vi } from 'vitest';
import { agruparSemDono, montarPerguntas, ehSegunda8h, tickResumoSemanal } from '../src/modules/financeiro/resumo-semanal.js';

const rows = [
  { id: '1', contraparte: 'Pix ***.320.641-**', valor: 50, data_evento: '2026-09-02', tipo: 'despesa' as const },
  { id: '2', contraparte: 'Pix ***.320.641-**', valor: 200, data_evento: '2026-09-04', tipo: 'despesa' as const },
  { id: '3', contraparte: 'Mix Madeiras', valor: 560, data_evento: '2026-09-03', tipo: 'despesa' as const },
];

describe('agruparSemDono', () => {
  it('agrupa por contraparte normalizada, soma, conta e ordena por total desc', () => {
    const g = agruparSemDono(rows);
    expect(g).toHaveLength(2);
    expect(g[0]).toMatchObject({ chave: 'mix madeiras', total: 560, n: 1, exemploId: '3' });
    expect(g[1]).toMatchObject({ chave: 'pix ***.320.641-**', total: 250, n: 2, exemploId: '1', ids: ['1', '2'] });
  });
  it('contraparte vazia vira "sem descrição"', () => {
    const g = agruparSemDono([{ id: 'x', contraparte: null, valor: 10, data_evento: '2026-09-01', tipo: 'despesa' }]);
    expect(g[0].chave).toBe('sem descrição');
  });
});

describe('montarPerguntas', () => {
  it('uma pergunta por grupo, com botões de tipo apontando pro exemplo', () => {
    const msgs = montarPerguntas(agruparSemDono(rows));
    expect(msgs).toHaveLength(2);
    expect(msgs[1].body).toContain('2 pagamento(s), total R$');
    expect(msgs[1].body.replace(/ /g, ' ')).toContain('R$ 250,00');
    expect(msgs[1].buttons.map((b) => b.id)).toEqual(['finfav:mo:1', 'finfav:mat:1', 'finfav:pf:1']);
    expect(msgs[1].buttons.map((b) => b.title)).toEqual(['Mão de obra', 'Material', 'Pessoal (PF)']);
  });
  it('máximo 5 perguntas', () => {
    const muitos = Array.from({ length: 8 }, (_, i) => ({ id: String(i), contraparte: `Loja ${i}`, valor: 10 + i, data_evento: '2026-09-01', tipo: 'despesa' as const }));
    expect(montarPerguntas(agruparSemDono(muitos))).toHaveLength(5);
  });
});

describe('ehSegunda8h', () => {
  it('segunda 11h UTC = 8h BRT → true', () => {
    expect(ehSegunda8h(new Date('2026-09-07T11:30:00Z'))).toBe(true); // 07/09/2026 é segunda
  });
  it('terça 8h BRT → false; segunda 9h BRT → false', () => {
    expect(ehSegunda8h(new Date('2026-09-08T11:30:00Z'))).toBe(false);
    expect(ehSegunda8h(new Date('2026-09-07T12:30:00Z'))).toBe(false);
  });
});

function chainMock(resultado: unknown = { data: [], error: null }) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'insert', 'update', 'eq', 'is', 'in', 'gte', 'lte', 'order', 'limit', 'ilike']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (res: (v: unknown) => void) => res(resultado);
  return { client: { from: vi.fn(() => chain) } as never };
}

describe('tickResumoSemanal', () => {
  it('fora da janela (terça) não manda nada', async () => {
    const sendText = vi.fn(); const enviarComBotoes = vi.fn();
    const { client } = chainMock();
    await tickResumoSemanal({ client, adminPhone: '5561', sendText, enviarComBotoes, hoje: () => '2026-09-08' }, new Date('2026-09-08T11:00:00Z'));
    expect(sendText).not.toHaveBeenCalled();
    expect(enviarComBotoes).not.toHaveBeenCalled();
  });
  it('segunda 8h: cabeçalho + 1 pergunta por grupo; segundo tick na mesma hora não repete', async () => {
    const sendText = vi.fn().mockResolvedValue(undefined); const enviarComBotoes = vi.fn().mockResolvedValue(undefined);
    const { client } = chainMock({ data: rows, error: null });
    const enviados = new Set<string>();
    const deps = { client, adminPhone: '5561', sendText, enviarComBotoes, hoje: () => '2026-09-07', jaEnviouHoje: (d: string) => enviados.has(d), marcarEnviado: (d: string) => { enviados.add(d); } };
    await tickResumoSemanal(deps, new Date('2026-09-07T11:05:00Z'));
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText.mock.calls[0][1]).toContain('3 lançamento(s) sem dono');
    expect(enviarComBotoes).toHaveBeenCalledTimes(2);
    expect(enviarComBotoes.mock.calls[0][3]).toBe('Financeiro · semanal');
    await tickResumoSemanal(deps, new Date('2026-09-07T11:50:00Z'));
    expect(sendText).toHaveBeenCalledTimes(1);
  });
  it('sem lançamentos sem dono: não manda nada', async () => {
    const sendText = vi.fn(); const enviarComBotoes = vi.fn();
    const { client } = chainMock({ data: [], error: null });
    await tickResumoSemanal({ client, adminPhone: '5561', sendText, enviarComBotoes, hoje: () => '2026-09-07', jaEnviouHoje: () => false, marcarEnviado: () => {} }, new Date('2026-09-07T11:05:00Z'));
    expect(sendText).not.toHaveBeenCalled();
  });
});
