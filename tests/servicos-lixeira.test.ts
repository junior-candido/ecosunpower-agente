// Lixeira de serviços — excluir SEMPRE com desfazer (Junior 05/08).
import { describe, it, expect } from 'vitest';
import { excluirServico, restaurarServico } from '../src/modules/dashboard/servicos-store.js';

function mockClient() {
  const updates: Array<{ tabela: string; set: any; eqVal: string }> = [];
  const client: any = {
    from(tabela: string) {
      return { update(set: any) { return { eq: async (_c: string, eqVal: string) => { updates.push({ tabela, set, eqVal }); return { error: null }; } }; } };
    },
  };
  return { client, updates };
}

describe('lixeira de serviços', () => {
  it('excluir só carimba excluido_em (nada é apagado)', async () => {
    const { client, updates } = mockClient();
    await excluirServico(client, 'srv-1');
    expect(updates.length).toBe(1);
    expect(updates[0].tabela).toBe('servicos');
    expect(updates[0].eqVal).toBe('srv-1');
    expect(updates[0].set.excluido_em).toBeTruthy();
  });

  it('restaurar limpa o carimbo', async () => {
    const { client, updates } = mockClient();
    await restaurarServico(client, 'srv-1');
    expect(updates[0].set).toEqual({ excluido_em: null });
  });
});
