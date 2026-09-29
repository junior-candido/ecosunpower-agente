// IA chamada pelo PAINEL (resumo do lead, Elo, copiloto, financeiro…) tem que
// cair na empresa de QUEM ESTÁ LOGADO — o login liga o contexto do custo.
import { describe, it, expect, vi, beforeAll } from 'vitest';

const TENANT = '4b1f2c3d-1111-4111-8111-222222222222';
vi.mock('../src/modules/dashboard/users-store.js', () => ({
  getUserById: async (_c: unknown, id: string) => (id === 'u-tenant' ? { id, companyId: TENANT } : null),
}));

beforeAll(() => { process.env.META_APP_SECRET = 'segredo-de-teste-bem-longo-123456'; });

describe('login liga a empresa do custo de IA', () => {
  it('dentro da requisição, empresaDoCustoNoContexto() = empresa do usuário', async () => {
    const { criarSessionAuth, gerarTokenSessao } = await import('../src/modules/dashboard/auth.js');
    const { empresaDoCustoNoContexto } = await import('../src/modules/custos/ia-metering.js');
    const mw = criarSessionAuth({} as never);
    const req: any = { headers: { cookie: `ecosun_dash_token=${encodeURIComponent(gerarTokenSessao('u-tenant'))}`, accept: '' }, originalUrl: '/x' };
    let visto: string | null | undefined;
    await mw(req, {} as never, () => { visto = empresaDoCustoNoContexto(); });
    expect(visto).toBe(TENANT);
    // fora da requisição, nada vaza
    expect(empresaDoCustoNoContexto()).toBeNull();
  });
});
