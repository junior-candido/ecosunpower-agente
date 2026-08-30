import { describe, it, expect, vi } from 'vitest';
import { engatarNotaNoCaixa } from '../src/modules/financeiro/fiscal/ponte-caixa.js';

function clientePorTabela(respostas: Record<string, unknown>) {
  const inserts: Record<string, unknown[]> = {};
  const updates: Record<string, unknown[]> = {};
  const from = vi.fn((tabela: string) => {
    const resultado = respostas[tabela] ?? { data: null, error: null };
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'limit', 'is']) chain[m] = vi.fn(() => chain);
    chain.insert = vi.fn((row: unknown) => { (inserts[tabela] ??= []).push(row); return chain; });
    chain.update = vi.fn((row: unknown) => { (updates[tabela] ??= []).push(row); return chain; });
    chain.single = vi.fn().mockResolvedValue(resultado);
    (chain as { then?: unknown }).then = (res: (v: unknown) => void) => res(resultado);
    return chain;
  });
  return { client: { from } as never, from, inserts, updates };
}

describe('fiscal engatarNotaNoCaixa', () => {
  const nota = {
    id: 'n1', status: 'autorizada', numero: '84', competencia: '2026-09-02', descricao: 'serviço',
    tomador: { tipo: 'PJ' as const, doc: '1', nome: 'SUPERBOM', im: null, endereco: '', email: null, municipio: 'Brasília', uf: 'DF' },
    valorBruto: 19995, valorIss: 999.75, issRetido: true, valorLiquido: 18995.25,
    pdfStoragePath: 'fiscal/x.pdf', contaReceberId: null,
  };
  it('cria conta a receber pelo líquido + lançamento do ISS retido e amarra na nota', async () => {
    const { client, inserts, updates } = clientePorTabela({
      financeiro_contas_a_receber: { data: { id: 'cr1' }, error: null },
      financeiro_lancamentos: { data: { id: 'l1' }, error: null },
      financeiro_categorias: { data: { id: 'cat1' }, error: null },
    });
    await engatarNotaNoCaixa(client, nota, { companyId: 'c1', fechamentoId: 'f1', leadId: null });
    const conta = inserts.financeiro_contas_a_receber![0] as Record<string, unknown>;
    expect(conta.valor).toBe(18995.25);
    expect(conta.descricao).toContain('NFS-e nº 84');
    expect(conta.fechamento_id).toBe('f1');
    expect(conta.company_id).toBe('c1');
    const lanc = inserts.financeiro_lancamentos![0] as Record<string, unknown>;
    expect(lanc.valor).toBe(999.75);
    expect(lanc.tipo).toBe('despesa');
    expect(lanc.status).toBe('confirmado');
    expect(lanc.company_id).toBe('c1');
    const upd = updates.fiscal_notas![0] as Record<string, unknown>;
    expect(upd.conta_receber_id).toBe('cr1');
    expect(upd.lancamento_iss_id).toBe('l1');
  });
  it('sem retenção: só a conta a receber (pelo bruto), sem lançamento de ISS', async () => {
    const { client, inserts } = clientePorTabela({
      financeiro_contas_a_receber: { data: { id: 'cr1' }, error: null },
    });
    await engatarNotaNoCaixa(client, { ...nota, issRetido: false, valorLiquido: 19995 }, { companyId: 'c1', fechamentoId: null, leadId: 'ld1' });
    expect((inserts.financeiro_contas_a_receber![0] as Record<string, unknown>).valor).toBe(19995);
    expect(inserts.financeiro_lancamentos).toBeUndefined();
  });
});
