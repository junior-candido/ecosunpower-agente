import { describe, it, expect, vi } from 'vitest';
import { criarNota, listarNotas, anexarPdf, getNota, hashNota } from '../src/modules/financeiro/fiscal/notas-repo.js';

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

describe('fiscal notas-repo', () => {
  it('hashNota é estável e ignora formatação do documento', () => {
    const a = hashNota('c1', '08.616.988/0001-20', 19995, '2026-08-25');
    const b = hashNota('c1', '08616988000120', 19995, '2026-08-25');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it('criarNota grava com status preparada + hash e devolve o id', async () => {
    const { client, from, calls } = chainMock({ data: { id: 'n1' }, error: null });
    const id = await criarNota(client, {
      companyId: 'c1', competencia: '2026-08-25', servicoId: 's1', descricao: 'limpeza',
      tomador: { tipo: 'PJ', doc: '08.616.988/0001-20', nome: 'SUPERBOM', im: null, endereco: 'QS 314', email: null, municipio: 'Brasília', uf: 'DF' },
      valorBruto: 19995, aliquotaIss: 0.05, valorIss: 999.75, issRetido: true, valorLiquido: 18995.25,
      fechamentoId: null, leadId: null, createdBy: 'junior',
    });
    expect(id).toBe('n1');
    expect(from).toHaveBeenCalledWith('fiscal_notas');
    const row = (calls.insert![0][0] as Record<string, unknown>);
    expect(row.status).toBe('preparada');
    expect(row.hash_dedupe).toBe(hashNota('c1', '08616988000120', 19995, '2026-08-25'));
  });
  it('criarNota traduz violação do índice de dedupe em erro amigável', async () => {
    const { client } = chainMock({ data: null, error: { code: '23505', message: 'duplicate key idx_fiscal_notas_dedupe' } });
    await expect(criarNota(client, {
      companyId: 'c1', competencia: '2026-08-25', servicoId: 's1', descricao: 'x',
      tomador: { tipo: 'PJ', doc: '1', nome: 'X', im: null, endereco: '', email: null, municipio: 'Brasília', uf: 'DF' },
      valorBruto: 10, aliquotaIss: 0.05, valorIss: 0.5, issRetido: true, valorLiquido: 9.5,
      fechamentoId: null, leadId: null, createdBy: 'junior',
    })).rejects.toThrow('Já existe nota igual');
  });
  it('anexarPdf só atualiza nota em preparada (CAS) e devolve false se já anexada', async () => {
    const { client, calls } = chainMock({ data: [], error: null });
    const ok = await anexarPdf(client, 'c1', 'n1', '83', 'fiscal/c1/n1.pdf');
    expect(ok).toBe(false);
    expect(calls.eq).toContainEqual(['id', 'n1']);
    expect(calls.eq).toContainEqual(['status', 'preparada']);
    expect(calls.eq).toContainEqual(['company_id', 'c1']);
  });
  it('listarNotas filtra por company e ordena por competência desc', async () => {
    const { client, calls } = chainMock({ data: [], error: null });
    await listarNotas(client, 'c1');
    expect(calls.eq).toContainEqual(['company_id', 'c1']);
    expect(calls.order).toContainEqual(['competencia', { ascending: false }]);
  });
  it('getNota filtra por company_id além do id (corta acesso entre empresas)', async () => {
    const { client, calls } = chainMock({ data: { id: 'n1' }, error: null });
    await getNota(client, 'c1', 'n1');
    expect(calls.eq).toContainEqual(['company_id', 'c1']);
    expect(calls.eq).toContainEqual(['id', 'n1']);
  });
});
