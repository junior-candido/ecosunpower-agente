import { describe, it, expect, vi } from 'vitest';
import { criarConfirmado, hashDedupe, getSemDono, definirFavorecido, desvincularConta, restaurarApagado } from '../src/modules/financeiro/lancamentos-repo.js';

function sbMock(retorno: unknown) {
  const single = vi.fn().mockResolvedValue({ data: retorno, error: null });
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));
  return { client: { from } as never, from, insert };
}

describe('lancamentos-repo: hashDedupe', () => {
  it('mesmo banco+data+valor+descrição → mesmo hash; muda um → muda', () => {
    const a = hashDedupe({ bancoConta: 'sicoob_cc', dataEvento: '2026-08-28', valor: 800, descricao: 'PIX Kelvyn' });
    const b = hashDedupe({ bancoConta: 'sicoob_cc', dataEvento: '2026-08-28', valor: 800, descricao: 'pix  KELVYN ' });
    const c = hashDedupe({ bancoConta: 'sicoob_cc', dataEvento: '2026-08-28', valor: 801, descricao: 'PIX Kelvyn' });
    expect(a).toBe(b); expect(a).not.toBe(c);
  });
});

describe('lancamentos-repo: criarConfirmado', () => {
  it('insere já confirmado com banco, favorecido, confiança e hash', async () => {
    const { client, from, insert } = sbMock({ id: 'L1' });
    const id = await criarConfirmado(client, {
      tipo: 'despesa', valor: 800, dataEvento: '2026-08-28', contraparte: 'Kelvyn', descricao: 'loja 305',
      categoriaId: 'cat-mo', pfPj: 'PJ', leadId: null, storagePath: null, mimeType: null,
      origem: 'zap_texto', messageId: null, extracao: {}, createdBy: '5561', temNota: false,
      bancoConta: 'desconhecido', favorecidoId: 'k', confianca: 'alta', arquivoId: null,
    });
    expect(id).toBe('L1');
    expect(from).toHaveBeenCalledWith('financeiro_lancamentos');
    const row = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.status).toBe('confirmado');
    expect(row.confianca).toBe('alta');
    expect(row.favorecido_id).toBe('k');
    expect(typeof row.hash_dedupe).toBe('string');
  });
  it('erro 23505 (duplicado) vira Error("DUPLICADO")', async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'dup' } });
    const client = { from: vi.fn(() => ({ insert: vi.fn(() => ({ select: vi.fn(() => ({ single })) })) })) } as never;
    await expect(criarConfirmado(client, {
      tipo: 'despesa', valor: 1, dataEvento: '2026-08-28', contraparte: null, descricao: null, categoriaId: null, pfPj: 'PJ', leadId: null, storagePath: null, mimeType: null,
      origem: 'zap_texto', messageId: null, extracao: {}, createdBy: 'x', temNota: false, bancoConta: 'desconhecido', favorecidoId: null, confianca: 'baixa', arquivoId: null,
    })).rejects.toThrow('DUPLICADO');
  });
});

describe('lancamentos-repo: criarConfirmado sem contraparte', () => {
  it('sem descrição nem contraparte → hash_dedupe null (não dá pra afirmar duplicado)', async () => {
    const { client, insert } = sbMock({ id: 'L2' });
    await criarConfirmado(client, {
      tipo: 'despesa', valor: 50, dataEvento: '2026-08-28', contraparte: null, descricao: null, categoriaId: null, pfPj: 'PJ', leadId: null, storagePath: null, mimeType: null,
      origem: 'zap_texto', messageId: null, extracao: {}, createdBy: 'x', temNota: false, bancoConta: 'desconhecido', favorecidoId: null, confianca: 'baixa', arquivoId: null,
    });
    const row = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.hash_dedupe).toBeNull();
  });
});

// Mock encadeável: todo método devolve o próprio objeto; o await final resolve {data:[], error:null}.
function chainMock() {
  const calls: Record<string, unknown[][]> = {};
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'update', 'eq', 'is', 'in', 'gte', 'lte', 'order', 'limit']) {
    chain[m] = vi.fn((...a: unknown[]) => { (calls[m] ??= []).push(a); return chain; });
  }
  chain.then = (res: (v: unknown) => void) => res({ data: [], error: null });
  const from = vi.fn(() => chain);
  return { client: { from } as never, from, calls };
}

describe('lancamentos-repo: getSemDono', () => {
  it('filtra confirmado, sem favorecido, confiança baixa/pendente', async () => {
    const { client, from, calls } = chainMock();
    const r = await getSemDono(client, '2026-08-01', '2026-08-07');
    expect(r).toEqual([]);
    expect(from).toHaveBeenCalledWith('financeiro_lancamentos');
    expect(calls.eq).toContainEqual(['status', 'confirmado']);
    expect(calls.is).toContainEqual(['favorecido_id', null]);
    expect(calls.in).toContainEqual(['confianca', ['baixa', 'pendente']]);
  });
});

describe('lancamentos-repo: definirFavorecido', () => {
  it('grava favorecido, mundo, categoria e sobe confiança pra alta', async () => {
    const { client, calls } = chainMock();
    await definirFavorecido(client, 'L1', 'fav-1', 'PF', 'cat-1');
    const payload = calls.update[0][0] as Record<string, unknown>;
    expect(payload).toMatchObject({ favorecido_id: 'fav-1', pf_pj: 'PF', categoria_id: 'cat-1', confianca: 'alta' });
    expect(calls.eq).toContainEqual(['id', 'L1']);
  });
});

describe('lancamentos-repo: desvincularConta só desfaz o PRÓPRIO vínculo', () => {
  it('filtra por id, status confirmado E conta_id (clique B não apaga o vínculo do clique A)', async () => {
    const { client, calls } = chainMock();
    await desvincularConta(client, 'L1', 'conta-B');
    expect((calls.update[0][0] as Record<string, unknown>).conta_id).toBeNull();
    expect(calls.eq).toContainEqual(['id', 'L1']);
    expect(calls.eq).toContainEqual(['status', 'confirmado']);
    expect(calls.eq).toContainEqual(['conta_id', 'conta-B']);
  });
});

describe('lancamentos-repo: restaurarApagado', () => {
  it('apagado → confirmado com a descrição original (sem o sufixo)', async () => {
    const { client, calls } = chainMock();
    await restaurarApagado(client, 'L1', 'confirmado', 'gasolina');
    expect(calls.update[0][0]).toMatchObject({ status: 'confirmado', descricao: 'gasolina' });
    expect(calls.eq).toContainEqual(['status', 'apagado']);
  });
});
