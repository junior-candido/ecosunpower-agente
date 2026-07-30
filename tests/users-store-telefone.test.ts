// usuarioPorTelefone — acha quem já tem cadastro pelo zap (📤 enviar pelo zap).
import { describe, it, expect } from 'vitest';
import { usuarioPorTelefone } from '../src/modules/dashboard/users-store.js';

function mockClient(resposta: any) {
  const eqs: [string, unknown][] = [];
  const chain: any = {
    select() { return chain; },
    eq(col: string, val: unknown) { eqs.push([col, val]); return chain; },
    maybeSingle() { return Promise.resolve({ data: resposta, error: null }); },
  };
  return { client: { from: () => chain } as any, eqs };
}

describe('usuarioPorTelefone', () => {
  it('filtra por empresa + telefone e devolve id/nome/ativo', async () => {
    const { client, eqs } = mockClient({ id: 'u1', nome: 'João', ativo: false });
    const u = await usuarioPorTelefone(client, 'c1', '5561999998888');
    expect(u).toEqual({ id: 'u1', nome: 'João', ativo: false });
    expect(eqs).toContainEqual(['company_id', 'c1']);
    expect(eqs).toContainEqual(['telefone', '5561999998888']);
  });
  it('sem cadastro → null', async () => {
    const { client } = mockClient(null);
    expect(await usuarioPorTelefone(client, 'c1', '556100000000')).toBeNull();
  });
});
