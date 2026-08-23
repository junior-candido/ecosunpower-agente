import { describe, it, expect, vi } from 'vitest';
import { CatalogoLojaService } from '../src/modules/vendas/lojas/catalogo-loja.js';
import type { ItemLoja } from '../src/modules/vendas/lojas/tipos.js';

const item = (o: Partial<ItemLoja>): ItemLoja => ({
  fonte: 'belenus', categoria: 'modulo', sku: 'S1', marca: 'RISEN', modelo: 'S1',
  descricao: 'MOD 715W', potenciaW: 715, precoUnitario: 722.15, precoCheio: 722.15,
  estoque: 10, datasheet: null, rsPorWp: 1.01, ...o,
});

describe('CatalogoLojaService', () => {
  it('upsertLote grava e conta', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const client: any = { from: () => ({ upsert }) };
    const svc = new CatalogoLojaService({ client, companyId: 'c1' });
    const r = await svc.upsertLote([item({}), item({ sku: 'S2' })], 1000);
    expect(r).toEqual({ ok: true, gravados: 2 });
    // conferência: onConflict correto e company_id carimbado
    const [linhas, opts] = upsert.mock.calls[0];
    expect(opts.onConflict).toBe('company_id,fonte,sku');
    expect(linhas[0].company_id).toBe('c1');
    expect(linhas[0].preco_unitario).toBe(722.15);
  });

  it('upsertLote vazio não chama o banco', async () => {
    const upsert = vi.fn();
    const client: any = { from: () => ({ upsert }) };
    const svc = new CatalogoLojaService({ client, companyId: 'c1' });
    expect(await svc.upsertLote([], 1000)).toEqual({ ok: true, gravados: 0 });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('upsertLote devolve erro do banco sem lançar', async () => {
    const client: any = { from: () => ({ upsert: async () => ({ error: { message: 'boom' } }) }) };
    const svc = new CatalogoLojaService({ client, companyId: 'c1' });
    expect(await svc.upsertLote([item({})], 1000)).toEqual({ ok: false, erro: 'boom' });
  });

  it('listarAtivos mapeia colunas → ItemCatalogo', async () => {
    const rows = [{ fonte: 'belenus', categoria: 'modulo', sku: 'S1', marca: 'RISEN', modelo: 'S1',
      descricao: 'MOD 715W', potencia_w: 715, preco_unitario: '722.15', preco_cheio: '722.15',
      rs_por_wp: '1.01', estoque: 10, datasheet_url: null, atualizado_em: '2026-08-24T00:00:00Z' }];
    // cadeia: from().select().eq().eq() -> resolve
    const eq2 = { eq: () => Promise.resolve({ data: rows, error: null }) };
    const eq1 = { eq: () => eq2 };
    const client: any = { from: () => ({ select: () => eq1 }) };
    const svc = new CatalogoLojaService({ client, companyId: 'c1' });
    const out = await svc.listarAtivos();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ fonte: 'belenus', potenciaW: 715, precoUnitario: 722.15, rsPorWp: 1.01 });
  });
});
