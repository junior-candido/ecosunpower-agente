import { describe, it, expect, vi } from 'vitest';
import { criarConfirmado, hashDedupe } from '../src/modules/financeiro/lancamentos-repo.js';

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
