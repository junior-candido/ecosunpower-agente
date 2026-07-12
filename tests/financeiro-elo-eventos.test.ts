import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocka só a camada de I/O do repo; mantém competenciaAtual e o resto reais.
vi.mock('../src/modules/financeiro/repo.js', async (orig) => ({
  ...(await orig() as object),
  getBuckets: vi.fn(),
  getParametros: vi.fn(),
  getAtividade: vi.fn(),
  criarContaReceber: vi.fn(),
  getContaReceber: vi.fn(),
  atualizarContaRecebida: vi.fn(),
  criarLancamentoRecebimento: vi.fn(),
  somarReceitaNoMes: vi.fn(),
}));

import { criarContaDeFechamento, registrarRecebimento } from '../src/modules/financeiro/contas.js';
import * as repo from '../src/modules/financeiro/repo.js';

// Client falso: só o registrarEvento do Elo o toca (o repo está mockado).
function makeClient() {
  const inserts: Array<{ table: string; row: any }> = [];
  const client = {
    inserts,
    from(table: string) {
      return { insert: (row: any) => { inserts.push({ table, row }); return Promise.resolve({ error: null }); } };
    },
  };
  return client;
}

const eventos = (c: ReturnType<typeof makeClient>) => c.inserts.filter((i) => i.table === 'eventos_elo').map((i) => i.row);

beforeEach(() => vi.clearAllMocks());

describe('Elo × financeiro: registra evento ao criar conta a receber', () => {
  it('emite financeiro:conta logo após criarContaReceber', async () => {
    (repo.getBuckets as any).mockResolvedValue([]);
    (repo.getParametros as any).mockResolvedValue({ pro_labore_mensal: 0, outras_folhas_mensal: 0 });
    (repo.getAtividade as any).mockResolvedValue({ id: 'a1', anexo_padrao: 'III', sujeito_fator_r: false });
    (repo.criarContaReceber as any).mockResolvedValue('conta-123');
    const client = makeClient();

    const { contaId } = await criarContaDeFechamento(client as any, {
      fechamentoId: 'f1', leadId: 'lead-9', atividadeId: 'a1',
      descricao: 'Venda fechamento abcd1234', valor: 30000, createdBy: '+55',
    });

    expect(contaId).toBe('conta-123');
    const evs = eventos(client);
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({
      tipo: 'financeiro:conta',
      departamento: 'financeiro',
      canal: 'sistema',
      origem: 'financeiro',
      lead_id: 'lead-9',
    });
    expect(evs[0].payload).toMatchObject({ contaId: 'conta-123', valor: 30000, clienteNome: 'Venda fechamento abcd1234' });
  });
});

describe('Elo × financeiro: registra evento ao marcar recebimento', () => {
  it('emite financeiro:recebimento com contaId e valor da parcela', async () => {
    (repo.getContaReceber as any).mockResolvedValue({
      id: 'conta-123', fechamento_id: 'f1', lead_id: 'lead-9', atividade_id: 'a1',
      descricao: 'Venda', valor: 30000, status: 'pendente', valor_recebido: 0,
      imposto_provisorio: 0, imposto_confirmado: 0,
    });
    (repo.getBuckets as any).mockResolvedValue([]);
    (repo.getParametros as any).mockResolvedValue({ pro_labore_mensal: 0, outras_folhas_mensal: 0 });
    (repo.getAtividade as any).mockResolvedValue({ id: 'a1', anexo_padrao: 'III', sujeito_fator_r: false });
    (repo.atualizarContaRecebida as any).mockResolvedValue(undefined);
    (repo.criarLancamentoRecebimento as any).mockResolvedValue(undefined);
    (repo.somarReceitaNoMes as any).mockResolvedValue(undefined);
    const client = makeClient();

    const { total, parcela } = await registrarRecebimento(client as any, 'conta-123', 15000);

    expect(total).toBe(false);
    expect(parcela).toBe(15000);
    const evs = eventos(client);
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({
      tipo: 'financeiro:recebimento',
      departamento: 'financeiro',
      canal: 'sistema',
      origem: 'financeiro',
      lead_id: 'lead-9',
    });
    expect(evs[0].payload).toMatchObject({ contaId: 'conta-123', valor: 15000 });
  });
});
