// Fatia 3a — empresa (tenant) travada por falta de pagamento não loga mais:
// o auth carrega o usuário com companies(ativo) e barra company inativa.
// getUserById roda a CADA request → travou, o tenant cai na hora, não só no login.
import { describe, it, expect } from 'vitest';
import { getUserById, getUserByLoginTodasEmpresas } from '../src/modules/dashboard/users-store.js';

function mockClient(rows: Record<string, any>) {
  const chain = (tabela: string) => {
    const c: any = {
      select() { return c; }, eq() { return c; }, order() { return c; },
      maybeSingle() { return Promise.resolve({ data: rows[tabela] ?? null, error: null }); },
      then(res: any, rej: any) {
        const d = rows[tabela];
        return Promise.resolve({ data: Array.isArray(d) ? d : d ? [d] : [], error: null }).then(res, rej);
      },
    };
    return c;
  };
  return { from: chain } as any;
}

const USUARIO_BASE = {
  id: 'u1', company_id: 'comp-sabion', nome: 'Thiago', login: 'thiago',
  senha_hash: 'hash', role_id: null, ativo: true,
};

describe('tenant travado não loga', () => {
  it('getUserById: company inativa → null (sessão cai na hora)', async () => {
    const client = mockClient({ dashboard_users: { ...USUARIO_BASE, companies: { nome: 'Sabion', ativo: false } } });
    expect(await getUserById(client, 'u1')).toBeNull();
  });
  it('getUserById: company ativa → usuário normal', async () => {
    const client = mockClient({ dashboard_users: { ...USUARIO_BASE, companies: { nome: 'Sabion', ativo: true } } });
    const u = await getUserById(client, 'u1');
    expect(u?.nome).toBe('Thiago');
  });
  it('getUserById: sem embed de companies (mock antigo) → segue funcionando (compat)', async () => {
    const client = mockClient({ dashboard_users: { ...USUARIO_BASE } });
    expect((await getUserById(client, 'u1'))?.nome).toBe('Thiago');
  });
  it('getUserByLoginTodasEmpresas: filtra fora o candidato de company inativa', async () => {
    const client = mockClient({
      dashboard_users: [
        { ...USUARIO_BASE, id: 'u1', company_id: 'comp-sabion', companies: { nome: 'Sabion', ativo: false } },
        { ...USUARIO_BASE, id: 'u2', company_id: 'comp-outra', companies: { nome: 'Outra', ativo: true } },
      ],
    });
    const lista = await getUserByLoginTodasEmpresas(client, 'thiago');
    expect(lista.map((x) => x.user.id)).toEqual(['u2']);
  });
});
