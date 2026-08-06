// Excluir usuário TRANSFERINDO o histórico (pedido do Junior 05/08 ~00h:
// clones de instalador com serviços amarrados não podiam sumir; agora o
// histórico vai pra pessoa certa e o clone morre de verdade).
import { describe, it, expect, vi } from 'vitest';
import { excluirTransferindoHistorico } from '../src/modules/dashboard/users-store.js';

function mockClient() {
  const updates: Array<{ tabela: string; set: any; eqCol: string; eqVal: string }> = [];
  const deletes: Array<{ tabela: string; eqVal: string }> = [];
  const users: Record<string, any> = {
    'u-velho': { id: 'u-velho', company_id: 'c1' },
    'u-novo': { id: 'u-novo', company_id: 'c1' },
    'u-outra-empresa': { id: 'u-outra-empresa', company_id: 'c2' },
  };
  const client: any = {
    from(tabela: string) {
      return {
        select() {
          return { eq: (_c: string, v: string) => ({ maybeSingle: async () => ({ data: users[v] ?? null }) }) };
        },
        update(set: any) {
          return { eq: async (eqCol: string, eqVal: string) => { updates.push({ tabela, set, eqCol, eqVal }); return { error: null }; } };
        },
        delete() {
          return { eq: async (_c: string, eqVal: string) => { deletes.push({ tabela, eqVal }); return { error: null }; } };
        },
      };
    },
  };
  return { client, updates, deletes };
}

describe('excluirTransferindoHistorico', () => {
  it('transfere serviços e leads, desamarra auditoria e exclui', async () => {
    const { client, updates, deletes } = mockClient();
    const r = await excluirTransferindoHistorico(client, 'u-velho', 'u-novo');
    expect(r.ok).toBe(true);
    expect(updates).toContainEqual({ tabela: 'servicos', set: { atribuido_a: 'u-novo' }, eqCol: 'atribuido_a', eqVal: 'u-velho' });
    expect(updates).toContainEqual({ tabela: 'servicos', set: { criado_por: 'u-novo' }, eqCol: 'criado_por', eqVal: 'u-velho' });
    expect(updates).toContainEqual({ tabela: 'leads', set: { claimed_by: 'u-novo' }, eqCol: 'claimed_by', eqVal: 'u-velho' });
    // auditoria NÃO transfere (registro de quem fez) — só desamarra
    expect(updates).toContainEqual({ tabela: 'audit_log', set: { user_id: null }, eqCol: 'user_id', eqVal: 'u-velho' });
    expect(deletes).toContainEqual({ tabela: 'dashboard_users', eqVal: 'u-velho' });
  });

  it('não deixa transferir pra própria pessoa', async () => {
    const { client, deletes } = mockClient();
    const r = await excluirTransferindoHistorico(client, 'u-velho', 'u-velho');
    expect(r.ok).toBe(false);
    expect(deletes.length).toBe(0);
  });

  it('não deixa transferir pra usuário de OUTRA empresa', async () => {
    const { client, deletes } = mockClient();
    const r = await excluirTransferindoHistorico(client, 'u-velho', 'u-outra-empresa');
    expect(r.ok).toBe(false);
    expect(deletes.length).toBe(0);
  });

  it('destinatário inexistente → erro claro, nada excluído', async () => {
    const { client, deletes } = mockClient();
    const r = await excluirTransferindoHistorico(client, 'u-velho', 'u-fantasma');
    expect(r.ok).toBe(false);
    expect(deletes.length).toBe(0);
  });
});
