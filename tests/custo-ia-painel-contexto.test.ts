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

// Review 28/09: o multer chama next() de dentro dos eventos do stream do
// upload — FORA do contexto. Rota com upload (ler documentos do contrato,
// fotos…) perdia a empresa. comCustoAposUpload religa o contexto.
describe('rota com upload (multer) mantém a empresa do custo', () => {
  it('sem o religar perde; com comCustoAposUpload mantém', async () => {
    const express = (await import('express')).default;
    const multer = (await import('multer')).default;
    const { comCustoAposUpload } = await import('../src/modules/dashboard/auth.js');
    const { comEmpresaDoCusto, empresaDoCustoNoContexto } = await import('../src/modules/custos/ia-metering.js');
    const cru = multer({ storage: multer.memoryStorage() });
    const religado = comCustoAposUpload(cru);
    const app = express();
    const vistos: Record<string, string | null> = {};
    app.use((req: any, _res, next) => { req.dashUser = { companyId: TENANT }; comEmpresaDoCusto(TENANT, () => next()); });
    app.post('/cru', cru.single('f'), (_req, res) => { vistos.cru = empresaDoCustoNoContexto(); res.end(); });
    app.post('/religado', religado.single('f'), (_req, res) => { vistos.religado = empresaDoCustoNoContexto(); res.end(); });
    const srv = app.listen(0);
    await new Promise((ok) => srv.once('listening', ok));
    const base = `http://127.0.0.1:${(srv.address() as any).port}`;
    for (const rota of ['cru', 'religado']) {
      const fd = new FormData();
      fd.append('f', new Blob(['oi']), 'a.txt');
      await fetch(`${base}/${rota}`, { method: 'POST', body: fd });
    }
    srv.close();
    expect(vistos.religado).toBe(TENANT);
  });
});
