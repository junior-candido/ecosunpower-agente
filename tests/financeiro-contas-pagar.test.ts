import { describe, it, expect, vi } from 'vitest';
import {
  getContasAbertas, marcarPaga, criarContaPagar, vencimentoNoMes, gerarParcelasDoMes, registrarLembrete,
} from '../src/modules/financeiro/contas-pagar.js';

// Mock encadeável: todo método devolve o próprio objeto; o await final resolve o valor passado (ou {data:[],error:null}).
function chainMock(resultado: unknown = { data: [], error: null }) {
  const calls: Record<string, unknown[][]> = {};
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'insert', 'update', 'eq', 'is', 'in', 'gte', 'lte', 'order', 'limit']) {
    chain[m] = vi.fn((...a: unknown[]) => { (calls[m] ??= []).push(a); return chain; });
  }
  chain.single = vi.fn().mockResolvedValue(resultado);
  chain.then = (res: (v: unknown) => void) => res(resultado);
  const from = vi.fn(() => chain);
  return { client: { from } as never, from, calls, chain };
}

describe('contas-pagar: getContasAbertas', () => {
  it('filtra status aberta, ordena por vencimento e aceita limite opcional', async () => {
    const { client, from, calls } = chainMock({ data: [], error: null });
    const r = await getContasAbertas(client);
    expect(r).toEqual([]);
    expect(from).toHaveBeenCalledWith('financeiro_contas_a_pagar');
    expect(calls.eq).toContainEqual(['status', 'aberta']);
    expect(calls.order).toContainEqual(['vencimento']);
    expect(calls.lte).toBeUndefined();
  });
  it('com data-limite, filtra vencimento <= data', async () => {
    const { client, calls } = chainMock({ data: [], error: null });
    await getContasAbertas(client, '2026-09-30');
    expect(calls.lte).toContainEqual(['vencimento', '2026-09-30']);
  });
  it('mapeia valor pra número e lembretes ausente vira []', async () => {
    const { client } = chainMock({
      data: [{ id: 'x', descricao: 'Y', valor: '123.45', vencimento: '2026-09-10', mundo: 'PJ', lembretes: null }],
      error: null,
    });
    const r = await getContasAbertas(client);
    expect(r).toEqual([{ id: 'x', descricao: 'Y', valor: 123.45, vencimento: '2026-09-10', mundo: 'PJ', lembretes: [] }]);
  });
});

describe('contas-pagar: marcarPaga', () => {
  it('atualiza 1 linha (CAS em status aberta) → true', async () => {
    const { client, calls } = chainMock({ data: [{ id: 'c1' }], error: null });
    const ok = await marcarPaga(client, 'c1', '2026-09-05', 'L9');
    expect(ok).toBe(true);
    expect(calls.eq).toContainEqual(['id', 'c1']);
    expect(calls.eq).toContainEqual(['status', 'aberta']);
    const payload = calls.update[0][0] as Record<string, unknown>;
    expect(payload).toMatchObject({ status: 'paga', pago_em: '2026-09-05', lancamento_id: 'L9' });
  });
  it('0 linhas atualizadas (já paga/cancelada por outro clique) → false', async () => {
    const { client } = chainMock({ data: [], error: null });
    const ok = await marcarPaga(client, 'c1', '2026-09-05', null);
    expect(ok).toBe(false);
  });
});

describe('contas-pagar: criarContaPagar', () => {
  it('insere payload com origem default manual', async () => {
    const { client, from, calls, chain } = chainMock({ data: { id: 'nova' }, error: null });
    const id = await criarContaPagar(client, {
      descricao: 'Aluguel', valor: 1500, vencimento: '2026-09-10', mundo: 'PJ', categoriaSlug: 'moradia',
    });
    expect(id).toBe('nova');
    expect(from).toHaveBeenCalledWith('financeiro_contas_a_pagar');
    const row = calls.insert[0][0] as Record<string, unknown>;
    expect(row).toMatchObject({ descricao: 'Aluguel', valor: 1500, vencimento: '2026-09-10', mundo: 'PJ', categoria_slug: 'moradia', origem: 'manual' });
    void chain;
  });
});

describe('contas-pagar: vencimentoNoMes (puro)', () => {
  it('dia normal', () => { expect(vencimentoNoMes('2026-09', 10)).toBe('2026-09-10'); });
  it('dia 31 num mês de 30 dias clampa pro último dia', () => { expect(vencimentoNoMes('2026-09', 31)).toBe('2026-09-30'); });
  it('dia 31 em fevereiro (28 dias) clampa', () => { expect(vencimentoNoMes('2026-02', 31)).toBe('2026-02-28'); });
});

describe('contas-pagar: gerarParcelasDoMes', () => {
  it('só cria conta pra dívida que ainda não tem conta no mês; a que já tem, pula', async () => {
    const dividas = [
      { id: 'd1', credor: 'Banco A', mundo: 'PJ', parcela: 500, dia_vencimento: 10, ultima_parcela: null },
      { id: 'd2', credor: 'Banco B', mundo: 'PF', parcela: 300, dia_vencimento: 15, ultima_parcela: null },
    ];
    // Sequência de chamadas .from(): 1) dívidas ativas, 2) checagem de conta existente p/ d1 (encontra), 3) checagem p/ d2 (não encontra), 4) insert p/ d2.
    const dividasChain: Record<string, unknown> = {};
    for (const m of ['select', 'eq']) dividasChain[m] = vi.fn(() => dividasChain);
    dividasChain.then = (res: (v: unknown) => void) => res({ data: dividas, error: null });

    let checagem = 0;
    const checagens = [
      { data: [{ id: 'existe' }], error: null }, // d1 já tem conta
      { data: [], error: null }, // d2 não tem
    ];
    function makeCheckChain() {
      const c: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'gte', 'lte', 'limit']) c[m] = vi.fn(() => c);
      c.then = (res: (v: unknown) => void) => res(checagens[checagem++]);
      return c;
    }
    const insertChain: Record<string, unknown> = {};
    for (const m of ['select']) insertChain[m] = vi.fn(() => insertChain);
    insertChain.single = vi.fn().mockResolvedValue({ data: { id: 'nova-conta' }, error: null });
    const insert = vi.fn(() => insertChain);

    let fromCall = 0;
    const from = vi.fn(() => {
      fromCall++;
      if (fromCall === 1) return dividasChain;
      if (fromCall === 2 || fromCall === 3) return makeCheckChain();
      return { insert };
    });
    const client = { from } as never;

    const n = await gerarParcelasDoMes(client, '2026-09');
    expect(n).toBe(1);
    expect(insert).toHaveBeenCalledTimes(1);
    const row = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(row).toMatchObject({ descricao: 'Banco B — parcela', valor: 300, vencimento: '2026-09-15', mundo: 'PF', origem: 'divida', divida_id: 'd2' });
  });

  it('pula dívida cuja parcela do mês já passou da última parcela', async () => {
    const dividas = [
      { id: 'd3', credor: 'Banco C', mundo: 'PJ', parcela: 200, dia_vencimento: 20, ultima_parcela: '2026-08-20' },
    ];
    const dividasChain: Record<string, unknown> = {};
    for (const m of ['select', 'eq']) dividasChain[m] = vi.fn(() => dividasChain);
    dividasChain.then = (res: (v: unknown) => void) => res({ data: dividas, error: null });
    const from = vi.fn(() => dividasChain);
    const client = { from } as never;
    const n = await gerarParcelasDoMes(client, '2026-09');
    expect(n).toBe(0);
  });

  it('checa existência de conta com o ÚLTIMO DIA REAL do mês (não "-31" inválido em mês de 30 dias)', async () => {
    const dividas = [
      { id: 'd1', credor: 'Banco A', mundo: 'PJ', parcela: 500, dia_vencimento: 10, ultima_parcela: null },
    ];
    const dividasChain: Record<string, unknown> = {};
    for (const m of ['select', 'eq']) dividasChain[m] = vi.fn(() => dividasChain);
    dividasChain.then = (res: (v: unknown) => void) => res({ data: dividas, error: null });

    const checkCalls: Record<string, unknown[][]> = {};
    const checkChain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'gte', 'lte', 'limit']) {
      checkChain[m] = vi.fn((...a: unknown[]) => { (checkCalls[m] ??= []).push(a); return checkChain; });
    }
    // já tem conta → não insere, só serve pra capturar o filtro lte usado na checagem.
    checkChain.then = (res: (v: unknown) => void) => res({ data: [{ id: 'existe' }], error: null });

    let fromCall = 0;
    const from = vi.fn(() => { fromCall++; return fromCall === 1 ? dividasChain : checkChain; });
    const client = { from } as never;

    await gerarParcelasDoMes(client, '2026-09'); // setembro tem 30 dias — "-31" seria data inválida
    expect(checkCalls.lte).toContainEqual(['vencimento', '2026-09-30']);
  });
});

describe('contas-pagar: registrarLembrete', () => {
  it('lê os lembretes existentes, acrescenta o novo e grava sem perder os anteriores', async () => {
    const selectChain: Record<string, unknown> = {};
    for (const m of ['select', 'eq']) selectChain[m] = vi.fn(() => selectChain);
    selectChain.single = vi.fn().mockResolvedValue({ data: { lembretes: [{ tipo: '3d', em: '2026-09-04' }] }, error: null });

    const updateCalls: Record<string, unknown[][]> = {};
    const updateChain: Record<string, unknown> = {};
    for (const m of ['update', 'eq']) {
      updateChain[m] = vi.fn((...a: unknown[]) => { (updateCalls[m] ??= []).push(a); return updateChain; });
    }
    updateChain.then = (res: (v: unknown) => void) => res({ data: null, error: null });

    let fromCall = 0;
    const from = vi.fn(() => { fromCall++; return fromCall === 1 ? selectChain : updateChain; });
    const client = { from } as never;

    await registrarLembrete(client, 'c1', 'hoje', '2026-09-07');

    const payload = updateCalls.update[0][0] as Record<string, unknown>;
    expect(payload.lembretes).toEqual([{ tipo: '3d', em: '2026-09-04' }, { tipo: 'hoje', em: '2026-09-07' }]);
    expect(updateCalls.eq).toContainEqual(['id', 'c1']);
  });
});
