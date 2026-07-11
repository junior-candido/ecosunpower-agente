import { describe, it, expect } from 'vitest';
import { registrarEvento } from '../src/modules/elo/eventos.js';

function fakeClient() {
  const inserts: any[] = [];
  return {
    inserts,
    from() {
      return { insert: async (row: any) => { inserts.push(row); return { error: null }; } };
    },
  };
}

describe('registrarEvento', () => {
  it('insere um evento com defaults corretos', async () => {
    const c = fakeClient();
    await registrarEvento(c as any, { tipo: 'email_enviado', leadId: 'L1', canal: 'email', payload: { step: 1 } });
    expect(c.inserts).toHaveLength(1);
    expect(c.inserts[0].tipo).toBe('email_enviado');
    expect(c.inserts[0].lead_id).toBe('L1');
    expect(c.inserts[0].payload).toEqual({ step: 1 });
  });

  it('nunca lanca se o insert falha', async () => {
    const c = { from() { return { insert: async () => { throw new Error('boom'); } }; } };
    await expect(
      registrarEvento(c as any, { tipo: 'email_aberto' })
    ).resolves.toBeUndefined();
  });
});
