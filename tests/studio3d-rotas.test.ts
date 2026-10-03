// Studio 3D dentro do painel (02/10/2026): página com a marca da empresa
// logada, arquivos do app e o proxy do motor (token só no servidor).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { type RequestHandler } from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { montarRotasStudio3d, injetarAmbiente, empresaDoStudio } from '../src/modules/dashboard/studio3d-rotas.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const OUTRA = 'aaaa1111-2222-3333-4444-555566667777';

describe('injetarAmbiente / empresaDoStudio', () => {
  it('injeta antes do </head> e escapa </script>', () => {
    const h = injetarAmbiente('<html><head><title>x</title></head><body></body></html>', { empresa: { nome: '</script><script>alert(1)' } });
    expect(h).toContain('<script>window.__STUDIO__=');
    expect(h).not.toContain('</script><script>alert(1)');
    expect(h.indexOf('__STUDIO__')).toBeLessThan(h.indexOf('</head>'));
  });
  it('casa: "CREA/CFT · nº …" (título da casa, nunca "engenheiro")', () => {
    const c = empresaDoStudio(ECOSUN);
    expect(c.registro).toMatch(/^CREA\/CFT · nº \d+/);
    expect(JSON.stringify(c)).not.toMatch(/engenheir/i);
  });

  it('logo: casa = oficial embutida; tenant sem logo cadastrada = sem logo (nunca a da casa)', () => {
    expect(empresaDoStudio(ECOSUN).logo).toBe('casa');
    expect(empresaDoStudio(OUTRA).logo).not.toBe('casa');
  });
});

describe('rotas /studio-3d', () => {
  let srv: Server; let base = '';
  const chamadas: Array<{ url: string; init: RequestInit }> = [];
  beforeAll(async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'studio3d-'));
    mkdirSync(join(pasta, 'assets'));
    writeFileSync(join(pasta, 'index.html'), '<!doctype html><html><head><title>Studio</title></head><body></body></html>');
    writeFileSync(join(pasta, 'assets', 'index-abc.js'), 'console.log(1)');
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { (req as unknown as { dashUser: unknown }).dashUser = { companyId: OUTRA }; next(); });
    const router = express.Router();
    const exigir = (): RequestHandler => (_req, _res, next) => next();
    const fetchFalso = (async (url: string, init: RequestInit) => {
      chamadas.push({ url, init });
      return new Response(JSON.stringify({ kwh_ano: 123 }), { status: 200 });
    }) as unknown as typeof fetch;
    montarRotasStudio3d(router, exigir, { pasta, motor: { url: 'http://motor:8000', token: 'segredo' }, fetchImpl: fetchFalso });
    app.use('/dashboard', router);
    srv = app.listen(0);
    base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/dashboard`;
  });
  afterAll(() => srv.close());

  it('página traz o motor pelo proxy e a empresa da sessão; sem token no HTML', async () => {
    const r = await fetch(`${base}/studio-3d`);
    const h = await r.text();
    expect(r.status).toBe(200);
    expect(h).toContain('"urlMotor":"/dashboard/studio-3d/motor"');
    expect(h).not.toContain('segredo');
  });

  it('assets: só nome seguro .js/.css', async () => {
    expect((await fetch(`${base}/studio-3d/assets/index-abc.js`)).status).toBe(200);
    expect((await fetch(`${base}/studio-3d/assets/..%2Findex.html`)).status).toBe(404);
    expect((await fetch(`${base}/studio-3d/assets/x.html`)).status).toBe(404);
  });

  it('proxy: põe o token, repassa o corpo, e só nas rotas liberadas', async () => {
    const r = await fetch(`${base}/studio-3d/motor/simular`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kwp: 5 }) });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ kwh_ano: 123 });
    const c = chamadas[chamadas.length - 1];
    expect(c.url).toBe('http://motor:8000/simular');
    expect((c.init.headers as Record<string, string>).Authorization).toBe('Bearer segredo');
    expect(JSON.parse(String(c.init.body))).toEqual({ kwp: 5 });

    await fetch(`${base}/studio-3d/motor/sol?lat=-15.8&lon=-47.9`);
    expect(chamadas[chamadas.length - 1].url).toBe('http://motor:8000/sol?lat=-15.8&lon=-47.9');

    expect((await fetch(`${base}/studio-3d/motor/calibrar`, { method: 'POST' })).status).toBe(404);
    expect((await fetch(`${base}/studio-3d/motor/simular`)).status).toBe(404); // GET não
  });
});
