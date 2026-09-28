// AP0 (28/09): toda rota /dashboard/propostas… exige permissão e só age em
// proposta (slug) e lead (lead_id) da EMPRESA da sessão. Este teste VARRE o
// router.ts: rota /propostas… nova sem `exigir('propostas', …)`, ou registrada
// antes do portão, faz o teste falhar.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { readFileSync } from 'fs';
import { join } from 'path';
import { criarTravaPropostaDaEmpresa, leadIdConferido } from '../src/modules/dashboard/trava-proposta-empresa.js';
import { renderFormNovaProposta } from '../src/modules/dashboard/proposta-form-view.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const TENANT = 'aaaa1111-2222-3333-4444-555566667777';
const SLUG_TENANT = 'slugDoTenant1234567890';
const SLUG_CASA = 'slugDaCasa12345678901';
const SLUG_LEGADO = 'slugLegado1234567890'; // company_id null = da casa
const SLUG_SUMIDO = 'slugSumido1234567890';
const LEAD_TENANT = '11111111-1111-1111-1111-111111111111';
const LEAD_CASA = '22222222-2222-2222-2222-222222222222';

const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'router.ts'), 'utf-8');

type Rota = { metodo: 'get' | 'post' | 'put' | 'patch' | 'delete' | 'all'; caminho: string; pos: number; args: string };

/** Todas as rotas /propostas… do router (método, caminho e o trecho dos argumentos até o handler). */
function rotasDeProposta(): Rota[] {
  const re = /router\.(get|post|put|patch|delete|all)\(\s*['"`](\/propostas[^'"`]*)['"`]/g;
  const out: Rota[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(fonte))) {
    const resto = fonte.slice(m.index);
    const fim = resto.search(/async \(|\(req[^)]*\)\s*=>/);
    if (fim <= 0) throw new Error(`handler não achado para ${m[2]}`); // evita verde falso
    out.push({ metodo: m[1] as Rota['metodo'], caminho: m[2], pos: m.index, args: resto.slice(0, fim) });
  }
  return out;
}

describe('varredura do router: toda rota /propostas… tem permissão e fica atrás da trava', () => {
  const portao = fonte.indexOf("router.use('/propostas', criarTravaPropostaDaEmpresa(");
  const rotas = rotasDeProposta();

  it('o portão existe, depois da sessão e antes de TODAS as rotas /propostas…', () => {
    expect(portao).toBeGreaterThan(fonte.indexOf('router.use(criarSessionAuth('));
    expect(rotas.length).toBeGreaterThanOrEqual(9);
    for (const r of rotas) expect(r.pos, `${r.metodo.toUpperCase()} ${r.caminho}`).toBeGreaterThan(portao);
  });

  it('toda rota /propostas… chama exigir(\'propostas\', …) antes do handler', () => {
    for (const r of rotas) {
      expect(r.args, `${r.metodo.toUpperCase()} ${r.caminho}`).toMatch(/exigir\('propostas', '(visualizar|criar|editar)'\)/);
    }
  });

  it('nível certo em cada rota do achado', () => {
    const esperado: Record<string, string> = {
      'get /propostas': 'visualizar',
      'get /propostas/novo': 'criar',
      'post /propostas/novo': 'criar',
      'get /propostas/:slug/preview': 'visualizar',
      'post /propostas/:slug/enviar': 'editar',
      'get /propostas/:slug/reabrir': 'editar',
      'post /propostas/:slug/reabrir': 'editar',
      'get /propostas/:slug/visualizacoes': 'visualizar',
      'get /propostas/:slug/visualizacoes.csv': 'visualizar',
    };
    const achadas = new Map(rotas.map((r) => [`${r.metodo} ${r.caminho}`, r.args]));
    for (const [chave, nivel] of Object.entries(esperado)) {
      expect(achadas.has(chave), chave).toBe(true);
      expect(achadas.get(chave), chave).toContain(`exigir('propostas', '${nivel}')`);
    }
  });

  it('POST /propostas/:slug/enviar só dispara pela casa (Gate B5)', () => {
    const r = rotas.find((x) => x.metodo === 'post' && x.caminho === '/propostas/:slug/enviar')!;
    expect(fonte.slice(r.pos, r.pos + 800)).toContain('podeDispararMensagens(');
  });

  it('POST /propostas/novo usa o lead conferido pelo portão (o corpo multipart não chega ao portão)', () => {
    const post = rotas.find((r) => r.metodo === 'post' && r.caminho === '/propostas/novo')!;
    const corpo = fonte.slice(post.pos, post.pos + 1500);
    expect(corpo).toContain('leadIdConferido(req, res)');
  });
});

describe('trava por rota (servidor de verdade, cada rota varrida do router.ts)', () => {
  const rotas = rotasDeProposta();
  const chamadas: string[] = [];
  let servidor: Server;
  let base = '';
  let sessao: { companyId?: string } | undefined;

  const propostas: Record<string, string | null> = {
    [SLUG_TENANT]: TENANT, [SLUG_CASA]: ECOSUN, [SLUG_LEGADO]: null,
  };
  const leads: Record<string, string | null> = { [LEAD_TENANT]: TENANT, [LEAD_CASA]: ECOSUN };

  const db: any = {
    from: vi.fn((tabela: string) => {
      let valor = '';
      const q: any = {
        select: () => q,
        eq: (_c: string, v: string) => { valor = v; return q; },
        maybeSingle: async () => {
          const mapa = tabela === 'propostas_publicas' ? propostas : tabela === 'leads' ? leads : {};
          if (!(valor in mapa)) return { data: null, error: null };
          return { data: { company_id: mapa[valor] }, error: null };
        },
      };
      return q;
    }),
  };

  beforeAll(async () => {
    const app = express();
    const r = express.Router();
    r.use(express.urlencoded({ extended: false }));
    r.use((req, _res, next) => { (req as any).dashUser = sessao; next(); });
    r.use('/propostas', criarTravaPropostaDaEmpresa(db));
    for (const rota of rotas) {
      (r as any)[rota.metodo](rota.caminho, (req: any, res: any) => {
        chamadas.push(`${rota.metodo} ${rota.caminho} ${req.params.slug ?? ''} ${leadIdConferido(req, res) ?? ''}`);
        res.status(200).send('ok');
      });
    }
    app.use('/dashboard', r);
    await new Promise<void>((ok) => { servidor = app.listen(0, '127.0.0.1', () => ok()); });
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/dashboard`;
  });
  afterAll(() => { servidor?.close(); });

  const url = (caminho: string, slug: string, leadId?: string) =>
    base + caminho.replace(':slug', slug) + (leadId ? `?lead_id=${leadId}` : '');
  const pedir = (metodo: string, u: string, corpo?: Record<string, string>) =>
    fetch(u, {
      method: metodo === 'all' ? 'GET' : metodo.toUpperCase(),
      ...(corpo ? { body: new URLSearchParams(corpo), headers: { 'content-type': 'application/x-www-form-urlencoded' } } : {}),
    });

  for (const rota of rotasDeProposta()) {
    const comSlug = rota.caminho.includes(':slug');
    const ehNovo = rota.caminho === '/propostas/novo';
    if (!comSlug && !ehNovo) continue; // listagem: sem slug nem lead

    it(`${rota.metodo.toUpperCase()} ${rota.caminho}: outra empresa → 404 sem chegar na rota; mesma empresa → passa`, async () => {
      sessao = { companyId: TENANT };
      chamadas.length = 0;
      if (comSlug) {
        expect((await pedir(rota.metodo, url(rota.caminho, SLUG_CASA))).status).toBe(404);
        expect((await pedir(rota.metodo, url(rota.caminho, SLUG_SUMIDO))).status).toBe(404);
        // slug próprio, mas lead_id de outra empresa (query ou corpo) → 404
        expect((await pedir(rota.metodo, url(rota.caminho, SLUG_TENANT, LEAD_CASA))).status).toBe(404);
        if (rota.metodo === 'post') {
          expect((await pedir(rota.metodo, url(rota.caminho, SLUG_TENANT), { lead_id: LEAD_CASA })).status).toBe(404);
        }
        expect(chamadas).toEqual([]);
        expect((await pedir(rota.metodo, url(rota.caminho, SLUG_TENANT, LEAD_TENANT))).status).toBe(200);
        expect((await pedir(rota.metodo, url(rota.caminho, SLUG_TENANT))).status).toBe(200);
        expect(chamadas).toHaveLength(2);
      } else {
        expect((await pedir(rota.metodo, url(rota.caminho, '', LEAD_CASA))).status).toBe(404);
        if (rota.metodo === 'post') {
          expect((await pedir(rota.metodo, url(rota.caminho, ''), { lead_id: LEAD_CASA })).status).toBe(404);
          // query e corpo divergentes → recusa
          expect((await pedir(rota.metodo, url(rota.caminho, '', LEAD_TENANT), { lead_id: LEAD_CASA })).status).toBe(404);
        }
        expect(chamadas).toEqual([]);
        expect((await pedir(rota.metodo, url(rota.caminho, '', LEAD_TENANT))).status).toBe(200);
        expect(chamadas).toEqual([`${rota.metodo} ${rota.caminho}  ${LEAD_TENANT}`]);
      }
    });
  }

  it('sem sessão → 404; legado sem company_id = da casa; lead_id inválido → 400', async () => {
    sessao = undefined;
    expect((await fetch(url('/propostas/:slug/preview', SLUG_TENANT))).status).toBe(404);
    sessao = { companyId: ECOSUN };
    expect((await fetch(url('/propostas/:slug/preview', SLUG_LEGADO))).status).toBe(200);
    sessao = { companyId: TENANT };
    expect((await fetch(url('/propostas/:slug/preview', SLUG_LEGADO))).status).toBe(404);
    expect((await fetch(url('/propostas/novo', '', 'nao-e-uuid'))).status).toBe(400);
    // lead_id repetido (vira lista) não escapa da conferência
    expect((await fetch(`${base}/propostas/novo?lead_id=${LEAD_TENANT}&lead_id=${LEAD_CASA}`)).status).toBe(400);
    const repetido = new URLSearchParams([['lead_id', LEAD_CASA], ['lead_id', LEAD_CASA]]);
    expect((await fetch(url('/propostas/:slug/enviar', SLUG_TENANT), { method: 'POST', body: repetido, headers: { 'content-type': 'application/x-www-form-urlencoded' } })).status).toBe(400);
  });

  it('listagem /propostas passa sem consultar o banco', async () => {
    db.from.mockClear();
    sessao = { companyId: TENANT };
    expect((await fetch(`${base}/propostas`)).status).toBe(200);
    expect(db.from).not.toHaveBeenCalled();
  });

  it('erro do banco → 500, sem chegar na rota', async () => {
    const dbErro: any = { from: () => { const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: { message: 'x' } }) }; return q; } };
    const app = express();
    app.use((req, _res, next) => { (req as any).dashUser = { companyId: TENANT }; next(); });
    app.use('/propostas', criarTravaPropostaDaEmpresa(dbErro));
    let chegou = false;
    app.get('/propostas/:slug/preview', (_req, res) => { chegou = true; res.send('ok'); });
    const s: Server = await new Promise((ok) => { const x = app.listen(0, '127.0.0.1', () => ok(x)); });
    try {
      const r = await fetch(`http://127.0.0.1:${(s.address() as AddressInfo).port}/propostas/${SLUG_TENANT}/preview`);
      expect(r.status).toBe(500);
      expect(chegou).toBe(false);
    } finally { s.close(); }
  });
});

describe('form de nova proposta leva o lead_id na URL (o portão confere antes do upload)', () => {
  it('action = /dashboard/propostas/novo?lead_id=<id>', () => {
    const html = renderFormNovaProposta({ user: undefined as any, lead_id: LEAD_TENANT, lead: { name: 'Fulano' } as any, erros: [] });
    expect(html).toContain(`action="/dashboard/propostas/novo?lead_id=${LEAD_TENANT}"`);
  });
});
