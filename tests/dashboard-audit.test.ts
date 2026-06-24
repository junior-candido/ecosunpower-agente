// tests/dashboard-audit.test.ts
import { describe, it, expect, vi } from 'vitest';
import { audit } from '../src/modules/dashboard/audit.js';

function fakeClient() {
  const insert = vi.fn().mockResolvedValue({ error: null });
  return { client: { from: vi.fn(() => ({ insert })) } as any, insert };
}

describe('audit()', () => {
  it('insere uma linha em audit_log com os campos certos', async () => {
    const { client, insert } = fakeClient();
    await audit(client, {
      companyId: 'c1', userId: 'u1', entidade: 'lead',
      entidadeId: 'lead-9', acao: 'claim',
    });
    expect(insert).toHaveBeenCalledTimes(1);
    const row = insert.mock.calls[0][0];
    expect(row.company_id).toBe('c1');
    expect(row.user_id).toBe('u1');
    expect(row.entidade).toBe('lead');
    expect(row.entidade_id).toBe('lead-9');
    expect(row.acao).toBe('claim');
  });
  it('não lança se o insert falhar (auditoria nunca quebra o fluxo)', async () => {
    const client = { from: () => ({ insert: () => Promise.reject(new Error('db down')) }) } as any;
    await expect(audit(client, { companyId: 'c1', entidade: 'lead', acao: 'editar' })).resolves.toBeUndefined();
  });
});
