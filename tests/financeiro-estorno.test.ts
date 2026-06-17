import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/modules/financeiro/repo.js', async (orig) => ({
  ...(await orig() as object),
  getContaReceber: vi.fn(),
  getRecebimentosDaConta: vi.fn(),
  apagarRecebimento: vi.fn(),
  reverterConta: vi.fn(),
  somarReceitaNoMes: vi.fn(),
}));

import { estornarRecebimento } from '../src/modules/financeiro/contas.js';
import * as repo from '../src/modules/financeiro/repo.js';

const client = {} as never;

beforeEach(() => vi.clearAllMocks());

describe('estornarRecebimento', () => {
  it('1 recebimento avulso → reverte conta (CAS ganha), apaga recebimento, subtrai bucket', async () => {
    (repo.getContaReceber as any).mockResolvedValue({ id: 'c1', fechamento_id: null, atividade_id: 'a1' });
    (repo.getRecebimentosDaConta as any).mockResolvedValue([{ id: 'r1', valor: 2500, imposto: 200, competencia: '2026-06' }]);
    (repo.reverterConta as any).mockResolvedValue(true); // ganhou o CAS
    const res = await estornarRecebimento(client, 'c1');
    expect(res).toEqual({ ok: true, valorEstornado: 2500, impostoEstornado: 200 });
    expect(repo.reverterConta).toHaveBeenCalledWith(client, 'c1', { avulsa: true });
    expect(repo.apagarRecebimento).toHaveBeenCalledWith(client, 'r1');
    expect(repo.somarReceitaNoMes).toHaveBeenCalledWith(client, '2026-06', 'a1', -2500);
  });
  it('venda real (fechamento_id set) → reverte conta pra pendente (avulsa:false)', async () => {
    (repo.getContaReceber as any).mockResolvedValue({ id: 'c1', fechamento_id: 'f1', atividade_id: 'a1' });
    (repo.getRecebimentosDaConta as any).mockResolvedValue([{ id: 'r1', valor: 1000, imposto: 80, competencia: '2026-06' }]);
    (repo.reverterConta as any).mockResolvedValue(true);
    await estornarRecebimento(client, 'c1');
    expect(repo.reverterConta).toHaveBeenCalledWith(client, 'c1', { avulsa: false });
  });
  it('CAS perdido (já estornado / clique duplo) → NÃO subtrai bucket de novo', async () => {
    (repo.getContaReceber as any).mockResolvedValue({ id: 'c1', fechamento_id: null, atividade_id: 'a1' });
    (repo.getRecebimentosDaConta as any).mockResolvedValue([{ id: 'r1', valor: 2500, imposto: 200, competencia: '2026-06' }]);
    (repo.reverterConta as any).mockResolvedValue(false); // perdeu o CAS
    const res = await estornarRecebimento(client, 'c1');
    expect(res).toEqual({ ok: true, valorEstornado: 0, impostoEstornado: 0 });
    expect(repo.somarReceitaNoMes).not.toHaveBeenCalled();
    expect(repo.apagarRecebimento).not.toHaveBeenCalled();
  });
  it('2 recebimentos (parcial) → não estorna', async () => {
    (repo.getContaReceber as any).mockResolvedValue({ id: 'c1', fechamento_id: null, atividade_id: 'a1' });
    (repo.getRecebimentosDaConta as any).mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);
    const res = await estornarRecebimento(client, 'c1');
    expect(res).toEqual({ ok: false, motivo: 'parcial' });
    expect(repo.apagarRecebimento).not.toHaveBeenCalled();
  });
});
