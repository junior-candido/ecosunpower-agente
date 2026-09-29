// R20 — Financeiro II: buracos de empresa/papel achados na revisão.
//  1) POST /cobrancas aceitava lead_id de OUTRA empresa: a consulta não achava
//     o lead (filtro company_id), mas o id seguia gravado na cobrança.
//  2) /cobrar, /cobrancas e /cobrancas/par não pediam papel nenhum — qualquer
//     usuário logado (ex.: papel Campo) gerava link de pagamento.
//  3) Nota fiscal (nova/editar) gravava fechamento_id e lead_id do formulário
//     sem conferir a empresa; e o anexar PDF subia o arquivo antes de conferir
//     que a nota é da empresa da sessão.
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { Request, Response, NextFunction } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { rotaCobrancaUnica, montarRotasCobrar, type DepsCobrar } from '../src/modules/dashboard/cobrar-rotas.js';
import { vinculosDaNota } from '../src/modules/dashboard/fiscal-vinculos.js';
import { can, type DashUser } from '../src/modules/dashboard/permissions.js';
import { bancoFalso } from './helpers/banco-falso.js';
import { USER_CASA } from './fixtures/miolo-leads.js';

const OUTRA = 'aaaa1111-2222-3333-4444-555566667777';
const LEAD_CASA = '11111111-2222-4333-8444-555555555555';
const LEAD_OUTRA = '22222222-2222-4333-8444-555555555555';
const FECH_CASA = '33333333-2222-4333-8444-555555555555';
const FECH_OUTRA = '44444444-2222-4333-8444-555555555555';

function deps(o: Partial<DepsCobrar> = {}) {
  const { client } = bancoFalso({
    leads: [
      { id: LEAD_CASA, company_id: USER_CASA.companyId, name: 'Ana', email: null, phone: '5561999990001' },
      { id: LEAD_OUTRA, company_id: OUTRA, name: 'Bia de Outra', email: 'bia@outra.invalid', phone: '5561999990002' },
    ],
  });
  const cobrancas = { criarCobranca: vi.fn(async () => ({ id: 'cob-1', orderNsu: 'nsu-1' })), salvarLinkCobranca: vi.fn(async () => {}) };
  const criarLinkPagamento = vi.fn(async () => ({ ok: true as const, url: 'https://checkout.exemplo.invalid/x' }));
  const d: DepsCobrar = { supabase: client, cobrancas, infinitepayHandle: 'loja', criarLinkPagamento: criarLinkPagamento as unknown as DepsCobrar['criarLinkPagamento'], ...o };
  return { d, cobrancas, criarLinkPagamento };
}
function resFalso() {
  const r = { statusCode: 200, corpo: undefined as unknown } as Record<string, unknown>;
  r.status = vi.fn((c: number) => { r.statusCode = c; return r; });
  r.json = vi.fn((b: unknown) => { r.corpo = b; return r; });
  return r as unknown as Response & { statusCode: number; corpo: any };
}

describe('POST /cobrancas — lead_id só da empresa da sessão', () => {
  it('lead de outra empresa → 404 e nenhuma cobrança criada', async () => {
    const { d, cobrancas, criarLinkPagamento } = deps();
    const res = resFalso();
    await rotaCobrancaUnica(d)({ body: { descricao: 'x', valor: '10', lead_id: LEAD_OUTRA }, dashUser: USER_CASA } as unknown as Request, res);
    expect(res.statusCode).toBe(404);
    expect(res.corpo).toEqual({ erro: 'Lead não encontrado.' });
    expect(cobrancas.criarCobranca).not.toHaveBeenCalled();
    expect(criarLinkPagamento).not.toHaveBeenCalled();
  });
  it('lead da empresa: segue igual (vincula e pré-preenche)', async () => {
    const { d, cobrancas } = deps();
    const res = resFalso();
    await rotaCobrancaUnica(d)({ body: { descricao: 'x', valor: '10', lead_id: LEAD_CASA }, dashUser: USER_CASA } as unknown as Request, res);
    expect(res.corpo).toMatchObject({ ok: true });
    expect((cobrancas.criarCobranca.mock.calls[0] as unknown[])[0]).toMatchObject({ leadId: LEAD_CASA });
  });
});

describe('/cobrar, /cobrancas, /cobrancas/par — pedem o papel financeiro', () => {
  const exigir = (area: 'financeiro', nivel: 'visualizar' | 'editar') => (req: Request, res: Response, next: NextFunction) => {
    if (can((req as unknown as { dashUser?: DashUser }).dashUser, area, nivel)) { next(); return; }
    res.status(403).send('Sem permissão');
  };
  async function servidor(user: DashUser) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { (req as unknown as { dashUser: DashUser }).dashUser = user; next(); });
    const router = express.Router();
    montarRotasCobrar(router, deps().d, exigir);
    app.use('/dashboard', router);
    const srv = app.listen(0);
    await new Promise((ok) => srv.once('listening', ok));
    return { srv, base: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/dashboard` };
  }
  const post = (url: string) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ descricao: 'x', valor: '10', liquido: '10' }) });

  it('papel Campo (sem financeiro) → 403 nas três', async () => {
    const campo: DashUser = { ...USER_CASA, id: 'c', isAdmin: false, permissoes: { servicos: ['visualizar', 'editar'] } };
    const { srv, base } = await servidor(campo);
    try {
      expect((await fetch(`${base}/cobrar`)).status).toBe(403);
      expect((await post(`${base}/cobrancas`)).status).toBe(403);
      expect((await post(`${base}/cobrancas/par`)).status).toBe(403);
    } finally { srv.close(); }
  });
  it('só ver o financeiro: abre a tela, mas não gera link', async () => {
    const leitor: DashUser = { ...USER_CASA, id: 'l', isAdmin: false, permissoes: { financeiro: ['visualizar'] } };
    const { srv, base } = await servidor(leitor);
    try {
      expect((await fetch(`${base}/cobrar`)).status).toBe(200);
      expect((await post(`${base}/cobrancas`)).status).toBe(403);
      expect((await post(`${base}/cobrancas/par`)).status).toBe(403);
    } finally { srv.close(); }
  });
  it('financeiro editar: tudo abre (igual antes)', async () => {
    const fin: DashUser = { ...USER_CASA, id: 'f', isAdmin: false, permissoes: { financeiro: ['visualizar', 'editar'] } };
    const { srv, base } = await servidor(fin);
    try {
      expect((await fetch(`${base}/cobrar`)).status).toBe(200);
      const r = await post(`${base}/cobrancas`);
      expect(r.status).toBe(200);
      expect(await r.json()).toMatchObject({ ok: true, link: 'https://checkout.exemplo.invalid/x' });
      expect((await post(`${base}/cobrancas/par`)).status).toBe(200);
    } finally { srv.close(); }
  });
});

describe('nota fiscal — fechamento e lead só da empresa da sessão', () => {
  const banco = () => bancoFalso({
    leads: [{ id: LEAD_CASA, company_id: USER_CASA.companyId }, { id: LEAD_OUTRA, company_id: OUTRA }],
    fechamentos: [{ id: FECH_CASA, company_id: USER_CASA.companyId }, { id: FECH_OUTRA, company_id: OUTRA }],
  });
  it('da empresa: mantém os dois', async () => {
    const { client } = banco();
    expect(await vinculosDaNota(client, USER_CASA.companyId, { fechamentoId: FECH_CASA, leadId: LEAD_CASA })).toEqual({ fechamentoId: FECH_CASA, leadId: LEAD_CASA });
  });
  it('de outra empresa: some (vira null) — a nota não aponta pra dado alheio', async () => {
    const { client, ops } = banco();
    expect(await vinculosDaNota(client, USER_CASA.companyId, { fechamentoId: FECH_OUTRA, leadId: LEAD_OUTRA })).toEqual({ fechamentoId: null, leadId: null });
    for (const op of ops) expect(op.filtros).toContainEqual(['eq', 'company_id', USER_CASA.companyId]);
  });
  it('vazio ou fora do formato (não-UUID): null sem ir ao banco', async () => {
    const { client, ops } = banco();
    expect(await vinculosDaNota(client, USER_CASA.companyId, { fechamentoId: '', leadId: 'l-1' })).toEqual({ fechamentoId: null, leadId: null });
    expect(ops).toHaveLength(0);
  });

  const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'router.ts'), 'utf-8');
  const trecho = (rota: string) => { const i = fonte.indexOf(rota); expect(i, rota).toBeGreaterThan(-1); return fonte.slice(i, fonte.indexOf('\n  router.', i + 10)); };
  it('POST /fiscal/nova e /fiscal/:id/editar conferem os vínculos ANTES de gravar', () => {
    for (const [rota, grava] of [["router.post('/fiscal/nova'", 'criarNota('], ["router.post('/fiscal/:id/editar'", 'atualizarNotaPreparada(']]) {
      const t = trecho(rota);
      const confere = t.indexOf('vinculosDaNota(');
      expect(confere, rota).toBeGreaterThan(-1);
      expect(t.indexOf(grava), rota).toBeGreaterThan(confere);
      expect(t, rota).not.toContain("fechamentoId: String(b.fechamento_id ?? '').trim() || null");
      expect(t, rota).not.toContain("leadId: String(b.lead_id ?? '').trim() || null");
      expect(t, rota).toContain('...vinculos,');
    }
  });
  it('POST /fiscal/:id/anexar confere a nota da empresa ANTES de subir o PDF', () => {
    const t = trecho("router.post('/fiscal/:id/anexar'");
    const confere = t.indexOf('getNota(');
    expect(confere).toBeGreaterThan(-1);
    expect(t.indexOf('.upload(')).toBeGreaterThan(confere);
  });
});
