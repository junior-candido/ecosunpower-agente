// tests/closing-persist.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ClosingPersist } from '../src/modules/closing/closing-persist.js';
import { dadosFechamentoCamilaMesmaPessoa } from './fixtures/closing-camila.js';

function mockSupabaseInsertSingle(returnId = 'fechamento-1') {
  return {
    from: vi.fn().mockImplementation((_table: string) => ({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: returnId },
            error: null,
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    })),
  } as any;
}

describe('ClosingPersist', () => {
  it('createFechamento insere com docs_pedidos + dados_snapshot', async () => {
    const sb = mockSupabaseInsertSingle();
    const persist = new ClosingPersist(sb);
    const id = await persist.createFechamento({
      leadId: 'lead-1',
      propostaPublicaId: 'prop-1',
      dados: dadosFechamentoCamilaMesmaPessoa,
      createdBy: '5561993077140',
    });
    expect(id).toBe('fechamento-1');
    expect(sb.from).toHaveBeenCalledWith('fechamentos');
  });

  it('updateDriveLinks atualiza colunas Drive', async () => {
    const sb = mockSupabaseInsertSingle();
    const persist = new ClosingPersist(sb);
    await persist.updateDriveLinks('fechamento-1', {
      contratoDriveId: 'd1',
      contratoDriveLink: 'http://x',
      procuracaoDriveId: 'd2',
      procuracaoDriveLink: 'http://y',
      driveFolderId: 'f1',
    });
    expect(sb.from).toHaveBeenCalledWith('fechamentos');
  });

  it('updateStatus altera status', async () => {
    const sb = mockSupabaseInsertSingle();
    const persist = new ClosingPersist(sb);
    await persist.updateStatus('fechamento-1', 'aprovado_junior');
    expect(sb.from).toHaveBeenCalledWith('fechamentos');
  });

  it('nextVersionForLead retorna 1 quando vazio', async () => {
    const sb = mockSupabaseInsertSingle();
    const persist = new ClosingPersist(sb);
    const v = await persist.nextVersionForLead('lead-1');
    expect(v).toBe(1);
  });
});
