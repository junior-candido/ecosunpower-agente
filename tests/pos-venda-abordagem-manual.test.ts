import { describe, it, expect } from 'vitest';
import { registrarAbordagemManual } from '../src/modules/monitoring/abordagem/abordagens-repo.js';

function fakeClient(captured: { row?: Record<string, unknown> }) {
  return {
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        captured.row = row;
        return { select: () => ({ single: async () => ({ data: { id: 'ab-1' }, error: null }) }) };
      },
    }),
  } as any;
}

describe('registrarAbordagemManual', () => {
  it('insere abordagem encerrada/enviada com o tipo mapeado e marca de envio manual', async () => {
    const cap: { row?: Record<string, unknown> } = {};
    const id = await registrarAbordagemManual(fakeClient(cap), {
      sistemaId: 's1', leadId: 'l1', tipo: 'queda', mensagem: 'oi',
    });
    expect(id).toBe('ab-1');
    expect(cap.row).toMatchObject({
      sistema_id: 's1', lead_id: 'l1', tipo: 'queda',
      status: 'encerrada', desfecho: 'transferido_junior',
      mensagem_enviada: 'oi',
    });
    expect(typeof cap.row?.enviada_em).toBe('string');
    expect(typeof cap.row?.encerrada_em).toBe('string');
  });

  it('engole violação de unique (23505) retornando null', async () => {
    const client = {
      from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: '23505', message: 'dup' } }) }) }) }),
    } as any;
    const id = await registrarAbordagemManual(client, { sistemaId: 's1', leadId: 'l1', tipo: 'parabens', mensagem: 'oi' });
    expect(id).toBeNull();
  });
});
