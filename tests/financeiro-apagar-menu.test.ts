import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/modules/financeiro/lancamentos-repo.js', () => ({
  getLancamentosRecentes: vi.fn(),
  getLancamento: vi.fn(),
  mudarStatus: vi.fn(),
}));

import {
  montarListaApagar,
  montarConfirmacaoApagarLancamento,
  executarApagarLancamento,
} from '../src/modules/financeiro/apagar-menu.js';
import * as repo from '../src/modules/financeiro/lancamentos-repo.js';

const client = {} as never;
const row = (over: Record<string, unknown> = {}) => ({
  id: 'abc-123', tipo: 'despesa', status: 'confirmado', valor: 16000,
  data_evento: '2026-06-17', competencia: '2026-06', contraparte: null, descricao: null,
  categoria_id: null, pf_pj: 'PJ', lead_id: null, conta_id: null, tem_nota: true,
  storage_path: null, extracao: null, created_at: '2026-06-17T12:00:00Z', ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('apagar-menu: montarListaApagar', () => {
  it('vazio → null', async () => {
    (repo.getLancamentosRecentes as any).mockResolvedValue([]);
    expect(await montarListaApagar(client)).toBeNull();
  });
  it('formata rows com id findel:, valor e data', async () => {
    (repo.getLancamentosRecentes as any).mockResolvedValue([
      row({ id: 'g1', tipo: 'despesa', valor: 16000, data_evento: '2026-06-17' }),
      row({ id: 'e1', tipo: 'entrada', valor: 5000, data_evento: '2026-06-10', contraparte: 'João' }),
    ]);
    const r = await montarListaApagar(client);
    expect(r?.total).toBe(2);
    expect(r?.rows[0].id).toBe('findel:g1');
    expect(r?.rows[0].title).toContain('17/06');
    expect(r?.rows[0].title).toContain('➖');
    expect(r?.rows[1].id).toBe('findel:e1');
    expect(r?.rows[1].title).toContain('➕');
    expect(r?.rows[1].description).toContain('João');
  });
});

describe('apagar-menu: confirmação', () => {
  it('não achou → null', async () => {
    (repo.getLancamento as any).mockResolvedValue(null);
    expect(await montarConfirmacaoApagarLancamento(client, 'x')).toBeNull();
  });
  it('já apagado → null', async () => {
    (repo.getLancamento as any).mockResolvedValue(row({ status: 'apagado' }));
    expect(await montarConfirmacaoApagarLancamento(client, 'x')).toBeNull();
  });
  it('entrada ligada a venda → erro (estorno manual)', async () => {
    (repo.getLancamento as any).mockResolvedValue(row({ tipo: 'entrada', conta_id: 'conta-9' }));
    const r = await montarConfirmacaoApagarLancamento(client, 'x');
    expect(r && 'erro' in r).toBe(true);
  });
  it('normal → botões apagar/cancelar', async () => {
    (repo.getLancamento as any).mockResolvedValue(row());
    const r = await montarConfirmacaoApagarLancamento(client, 'abc-123');
    expect(r && 'buttons' in r).toBe(true);
    if (r && 'buttons' in r) {
      expect(r.buttons[0].id).toBe('findel-go:abc-123');
      expect(r.buttons[1].id).toBe('findel-no');
    }
  });
});

describe('apagar-menu: executar', () => {
  it('não achou', async () => {
    (repo.getLancamento as any).mockResolvedValue(null);
    expect(await executarApagarLancamento(client, 'x')).toContain('Não achei');
  });
  it('entrada ligada a venda não apaga (guard)', async () => {
    (repo.getLancamento as any).mockResolvedValue(row({ tipo: 'entrada', conta_id: 'conta-9' }));
    const msg = await executarApagarLancamento(client, 'x');
    expect(msg).toContain('manual');
    expect(repo.mudarStatus).not.toHaveBeenCalled();
  });
  it('sucesso → soft-delete', async () => {
    (repo.getLancamento as any).mockResolvedValue(row({ status: 'confirmado' }));
    (repo.mudarStatus as any).mockResolvedValue(true);
    const msg = await executarApagarLancamento(client, 'abc-123');
    expect(msg).toContain('Apagado');
    expect(repo.mudarStatus).toHaveBeenCalledWith(client, 'abc-123', 'confirmado', 'apagado');
  });
  it('CAS perdeu (clique duplo) → já apagado', async () => {
    (repo.getLancamento as any).mockResolvedValue(row({ status: 'confirmado' }));
    (repo.mudarStatus as any).mockResolvedValue(false);
    expect(await executarApagarLancamento(client, 'abc-123')).toContain('já tinha sido apagado');
  });
});
