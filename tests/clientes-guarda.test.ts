// Renovação do miolo — R16, revisão de segurança (28/09/2026).
// As rotas /clientes* liam/alteravam/excluíam por id SEM conferir a empresa da
// sessão (hoje só a EcoSun entra, por soEcosunPorEnquanto — defesa em
// profundidade pra quando abrir ao tenant). Achados e consertos:
//  - ficha/edit/arquivar/desarquivar/excluir/anexos/relatório por :id → guarda
//    no router.use('/clientes/:id') com o cliente da empresa (senão 404);
//  - remover anexo apagava QUALQUER anexo pelo id (não conferia o cliente);
//  - enviar relatório pós-instalação mandava QUALQUER relatório (rid) pelo zap;
//  - eva-action e vincular-sistema confiavam no lead_id/sistema_id do form;
//  - a lista /clientes (e "sistemas sem cliente") trazia clientes/usinas de
//    TODAS as empresas para a EcoSun;
//  - vincular usina a cliente novo reusava lead de outra empresa pelo telefone.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { bancoFalso } from './helpers/banco-falso.js';
import { clienteDaEmpresa, anexoDoCliente, sistemaDaEmpresa, guardaClienteDaEmpresa } from '../src/modules/dashboard/clientes-guarda.js';
import { SupabaseService } from '../src/modules/supabase.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const OUTRA = 'aaaa1111-2222-3333-4444-555566667777';
const L_CASA = '11111111-1111-4111-8111-111111111111';
const L_OUTRA = '22222222-2222-4222-8222-222222222222';
const A_CASA = '33333333-3333-4333-8333-333333333333';
const A_OUTRA = '44444444-4444-4444-8444-444444444444';
const S_LEGADO = '55555555-5555-4555-8555-555555555555';
const S_OUTRA = '66666666-6666-4666-8666-666666666666';

function banco() {
  return bancoFalso({
    leads: [{ id: L_CASA, company_id: ECOSUN }, { id: L_OUTRA, company_id: OUTRA }],
    lead_anexos: [{ id: A_CASA, lead_id: L_CASA }, { id: A_OUTRA, lead_id: L_OUTRA }],
    sistemas_clientes: [{ id: S_LEGADO, company_id: null }, { id: S_OUTRA, company_id: OUTRA }],
  }).client;
}

describe('clienteDaEmpresa / anexoDoCliente / sistemaDaEmpresa', () => {
  it('cliente só da empresa da sessão; sem empresa = nega', async () => {
    const db = banco();
    expect(await clienteDaEmpresa(db, L_CASA, ECOSUN)).toBe(true);
    expect(await clienteDaEmpresa(db, L_OUTRA, ECOSUN)).toBe(false);
    expect(await clienteDaEmpresa(db, L_OUTRA, OUTRA)).toBe(true);
    expect(await clienteDaEmpresa(db, L_CASA, null)).toBe(false);
    expect(await clienteDaEmpresa(db, 'novo', ECOSUN)).toBe(false);
  });
  it('anexo tem que ser do cliente da URL', async () => {
    const db = banco();
    expect(await anexoDoCliente(db, A_CASA, L_CASA)).toBe(true);
    expect(await anexoDoCliente(db, A_OUTRA, L_CASA)).toBe(false);
  });
  it('usina: nula = legado EcoSun; de outra empresa = nega', async () => {
    const db = banco();
    expect(await sistemaDaEmpresa(db, S_LEGADO, ECOSUN)).toBe(true);
    expect(await sistemaDaEmpresa(db, S_LEGADO, OUTRA)).toBe(false);
    expect(await sistemaDaEmpresa(db, S_OUTRA, ECOSUN)).toBe(false);
    expect(await sistemaDaEmpresa(db, S_OUTRA, OUTRA)).toBe(true);
    expect(await sistemaDaEmpresa(db, S_OUTRA, undefined)).toBe(false);
  });
});

describe('guardaClienteDaEmpresa — router.use("/clientes/:id") de verdade (Express)', () => {
  let srv: Server; let base: string;
  beforeAll(async () => {
    const app = express();
    app.use((req, _res, next) => { (req as any).dashUser = { companyId: String(req.headers['x-empresa'] ?? '') || undefined }; next(); });
    const r = express.Router();
    r.use('/clientes/:id', guardaClienteDaEmpresa(() => banco()));
    r.all('/clientes/*resto', (_req, res) => { res.send('passou'); });
    app.use('/dashboard', r);
    srv = app.listen(0);
    await new Promise((ok) => srv.once('listening', ok));
    base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/dashboard`;
  });
  afterAll(() => { srv.close(); });

  const pedir = (path: string, empresa?: string, method = 'GET') =>
    fetch(base + path, { method, headers: empresa ? { 'x-empresa': empresa } : {} });

  it('cliente da empresa passa (ficha, excluir, anexo, relatório)', async () => {
    for (const p of [`/clientes/${L_CASA}`, `/clientes/${L_CASA}/excluir`, `/clientes/${L_CASA}/anexos/${A_CASA}`, `/clientes/${L_CASA}/relatorio-pos-instalacao/novo`]) {
      const r = await pedir(p, ECOSUN, p.endsWith('novo') || p === `/clientes/${L_CASA}` ? 'GET' : 'POST');
      expect(await r.text(), p).toBe('passou');
    }
  });
  it('cliente de OUTRA empresa → 404 em toda sub-rota (ler, editar, excluir, arquivar, anexos, relatório)', async () => {
    for (const [p, m] of [[`/clientes/${L_OUTRA}`, 'GET'], [`/clientes/${L_OUTRA}/edit`, 'POST'], [`/clientes/${L_OUTRA}/excluir`, 'POST'],
      [`/clientes/${L_OUTRA}/arquivar`, 'POST'], [`/clientes/${L_OUTRA}/anexos`, 'POST'], [`/clientes/${L_OUTRA}/relatorio-pos-instalacao/x/enviar`, 'POST']]) {
      const r = await pedir(p, ECOSUN, m);
      expect(r.status, p).toBe(404);
      expect(await r.text()).not.toBe('passou');
    }
  });
  it('sem empresa na sessão → 404 (fail-closed)', async () => {
    expect((await pedir(`/clientes/${L_CASA}`)).status).toBe(404);
  });
  it('caminhos que não são id (novo, eva-action, vincular-sistema) passam para a rota conferir', async () => {
    for (const p of ['/clientes/novo', '/clientes/eva-action', '/clientes/vincular-sistema']) {
      expect(await (await pedir(p, ECOSUN)).text(), p).toBe('passou');
    }
  });
});

/** Cliente falso que só registra os filtros (o banco falso não tem .not). */
function gravador(resposta: unknown = { data: [], count: 0, error: null }) {
  const chamadas: Array<[string, ...unknown[]]> = [];
  const q: any = new Proxy({}, {
    get(_a, prop: string) {
      if (prop === 'then') return (ok: (r: unknown) => unknown) => Promise.resolve(resposta).then(ok);
      return (...args: unknown[]) => { chamadas.push([prop, ...args]); return q; };
    },
  });
  const client = { from: (t: string) => { chamadas.push(['from', t]); return q; } } as unknown as SupabaseClient;
  const svc = Object.create(SupabaseService.prototype) as SupabaseService;
  (svc as any).client = client;
  return { svc, chamadas };
}

describe('SupabaseService — lista de clientes e órfãos presas à empresa', () => {
  it('listClientesByStatus / countClientesByStatus com companyId filtram company_id', async () => {
    const g = gravador();
    await g.svc.listClientesByStatus(['operando'], { companyId: OUTRA }, 50, 0, true);
    await g.svc.countClientesByStatus(['operando'], { companyId: OUTRA }, true);
    expect(g.chamadas.filter((c) => c[0] === 'eq' && c[1] === 'company_id' && c[2] === OUTRA).length).toBe(2);
  });
  it('sem companyId: igual a antes (quem chama filtra depois)', async () => {
    const g = gravador();
    await g.svc.listClientesByStatus(['operando'], {}, 50, 0, true);
    expect(g.chamadas.some((c) => c[1] === 'company_id')).toBe(false);
  });
  it('órfãos: EcoSun vê as dela + legado (null); tenant só as dele', async () => {
    const a = gravador();
    await a.svc.listSistemasOrfaos(ECOSUN);
    expect(a.chamadas).toContainEqual(['or', `company_id.is.null,company_id.eq.${ECOSUN}`]);
    const b = gravador();
    await b.svc.listSistemasOrfaos(OUTRA);
    expect(b.chamadas).toContainEqual(['eq', 'company_id', OUTRA]);
  });
  it('vincularNovoLeadAoSistema com companyId: reuso por telefone só dentro da empresa', async () => {
    const g = gravador({ data: { id: S_LEGADO, lead_id: null, data_instalacao: null }, error: null });
    await g.svc.vincularNovoLeadAoSistema({ sistema_id: S_LEGADO, name: 'Fulano', phone: '5561999990000', companyId: OUTRA });
    const i = g.chamadas.findIndex((c) => c[0] === 'eq' && c[1] === 'phone');
    expect(g.chamadas.slice(i, i + 2)).toContainEqual(['eq', 'company_id', OUTRA]);
  });
});

describe('router.ts — rotas de /clientes conferem a empresa (teste estático)', () => {
  const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'router.ts'), 'utf-8');
  const rota = (inicio: string) => { const i = fonte.indexOf(inicio); expect(i, inicio).toBeGreaterThan(-1); return fonte.slice(i, fonte.indexOf('\n  });', i)); };

  it('guarda por :id montada logo depois do soEcosunPorEnquanto e antes das rotas', () => {
    const g = fonte.indexOf("router.use('/clientes/:id', guardaClienteDaEmpresa(");
    expect(g).toBeGreaterThan(fonte.indexOf("router.use('/clientes', soEcosunPorEnquanto)"));
    expect(g).toBeLessThan(fonte.indexOf("router.get('/clientes/:id'"));
  });
  it('remover anexo confere o dono ANTES de apagar', () => {
    const r = rota("router.post('/clientes/:id/anexos/:anexoId'");
    expect(r.indexOf('anexoDoCliente(')).toBeGreaterThan(-1);
    expect(r.indexOf('anexoDoCliente(')).toBeLessThan(r.indexOf('deleteAnexo('));
  });
  it('enviar relatório confere que o relatório é do cliente ANTES de mandar', () => {
    const r = rota("router.post('/clientes/:id/relatorio-pos-instalacao/:rid/enviar'");
    expect(r).toMatch(/lead_id !== id/);
    expect(r.indexOf('lead_id !== id')).toBeLessThan(r.indexOf('enviarPorWhatsApp('));
  });
  it('eva-action e vincular-sistema conferem lead/usina da empresa', () => {
    expect(rota("router.post('/clientes/eva-action'")).toContain('clienteDaEmpresa(');
    const v = rota("router.post('/clientes/vincular-sistema'");
    expect(v).toContain('sistemaDaEmpresa(');
    expect(v).toContain('clienteDaEmpresa(');
    expect(v).toContain('companyId: empresaDaSessao(req)');
  });
  it('lista e cadastro usam a empresa da sessão', () => {
    expect(rota("router.get('/clientes', ")).toContain('companyId: empresaDaSessao(req)');
    expect(rota("router.post('/clientes/novo'")).toContain('companyId: empresaDaSessao(req)');
  });
});
