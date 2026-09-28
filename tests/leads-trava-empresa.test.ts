// HOTFIX (28/09): toda rota /dashboard/leads/:id… só age em lead da EMPRESA da
// sessão. Este teste VARRE o router.ts: rota /leads/:id nova sem a trava
// (registrada antes do portão, ou fora do router) faz o teste falhar.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { readFileSync } from 'fs';
import { join } from 'path';
import { criarTravaLeadDaEmpresa, leadEhDaEmpresa } from '../src/modules/dashboard/trava-lead-empresa.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const TENANT = 'aaaa1111-2222-3333-4444-555566667777';
const LEAD_TENANT = '11111111-1111-1111-1111-111111111111';
const LEAD_CASA = '22222222-2222-2222-2222-222222222222';
const LEAD_LEGADO = '33333333-3333-3333-3333-333333333333'; // company_id null = da casa
const LEAD_SUMIDO = '44444444-4444-4444-4444-444444444444';

const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'router.ts'), 'utf-8');

/** Todas as rotas /leads/:id… registradas no router (método + caminho), na ordem. */
function rotasDeLead(): Array<{ metodo: 'get' | 'post' | 'put' | 'delete'; caminho: string; pos: number }> {
  const re = /router\.(get|post|put|patch|delete|all)\(\s*'(\/leads\/:id[^']*)'/g;
  const out: Array<{ metodo: any; caminho: string; pos: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(fonte))) out.push({ metodo: m[1], caminho: m[2], pos: m.index });
  return out;
}

describe('varredura do router: toda rota /leads/:id fica atrás da trava', () => {
  const portao = fonte.indexOf("router.use('/leads/:id', criarTravaLeadDaEmpresa(");
  const rotas = rotasDeLead();

  it('o portão existe, depois da sessão e antes de TODAS as rotas /leads/:id', () => {
    expect(portao).toBeGreaterThan(fonte.indexOf('router.use(criarSessionAuth('));
    expect(rotas.length).toBeGreaterThanOrEqual(36);
    for (const r of rotas) expect(r.pos, `${r.metodo.toUpperCase()} ${r.caminho}`).toBeGreaterThan(portao);
  });

  it('nenhuma rota de lead usa outro nome de parâmetro que escape da trava (/leads/:leadId…)', () => {
    expect(fonte).not.toMatch(/router\.(get|post|put|patch|delete|all)\(\s*'\/leads\/:(?!id\b)/);
  });

  it('as rotas pedidas pelo hotfix estão na lista protegida', () => {
    const caminhos = new Set(rotas.map((r) => r.caminho));
    for (const c of [
      '/leads/:id', '/leads/:id/pause-eva', '/leads/:id/resume-eva', '/leads/:id/arquivar', '/leads/:id/desarquivar',
      '/leads/:id/delete', '/leads/:id/mark-lost', '/leads/:id/unmark-lost', '/leads/:id/opt-out', '/leads/:id/opt-in',
      '/leads/:id/set-status', '/leads/:id/set-etapa', '/leads/:id/tarefa', '/leads/:id/tarefa/:tid/concluir',
      '/leads/:id/tarefa/:tid/adiar', '/leads/:id/atividade', '/leads/:id/edit-name', '/leads/:id/start-cadence',
      '/leads/:id/cancel-cadence', '/leads/:id/fechou', '/leads/:id/contrato-form', '/leads/:id/contrato-preview',
      '/leads/:id/contrato-ia', '/leads/:id/contrato-congelar', '/leads/:id/contrato-vincular-proposta',
      '/leads/:id/contrato-parcelas', '/leads/:id/enviar-doc', '/leads/:id/salvar-drive', '/leads/:id/ler-documentos',
      '/leads/:id/contrato.pdf', '/leads/:id/procuracao.pdf',
      '/leads/:id/ia-copiloto', '/leads/:id/ia-explicar-economia', '/leads/:id/ia-gerar-mensagem',
    ]) expect(caminhos.has(c), c).toBe(true);
  });
});

describe('trava por rota (servidor de verdade, cada rota varrida do router.ts)', () => {
  const rotas = rotasDeLead();
  const chamadas: string[] = [];
  let servidor: Server;
  let base = '';
  let sessao: { companyId?: string } | undefined;

  const db: any = {
    from: vi.fn(() => {
      let id = '';
      const q: any = {
        select: () => q,
        eq: (_c: string, v: string) => { id = v; return q; },
        maybeSingle: async () => {
          if (id === LEAD_TENANT) return { data: { id, company_id: TENANT }, error: null };
          if (id === LEAD_CASA) return { data: { id, company_id: ECOSUN }, error: null };
          if (id === LEAD_LEGADO) return { data: { id, company_id: null }, error: null };
          return { data: null, error: null };
        },
      };
      return q;
    }),
  };

  beforeAll(async () => {
    const app = express();
    const r = express.Router();
    r.use((req, _res, next) => { (req as any).dashUser = sessao; next(); });
    r.use('/leads/:id', criarTravaLeadDaEmpresa(db));
    for (const rota of rotas) {
      (r as any)[rota.metodo](rota.caminho, (req: any, res: any) => {
        chamadas.push(`${rota.metodo} ${rota.caminho} ${req.params.id}`);
        res.status(200).send('ok');
      });
    }
    r.get('/leads/kanban', (_req, res) => { res.send('kanban'); });
    app.use('/dashboard', r);
    await new Promise<void>((ok) => { servidor = app.listen(0, '127.0.0.1', () => ok()); });
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/dashboard`;
  });
  afterAll(() => { servidor?.close(); });

  const url = (caminho: string, id: string) => base + caminho.replace(':id', id).replace(':tid', 't1');
  const pedir = (metodo: string, u: string) => fetch(u, { method: metodo === 'all' ? 'GET' : metodo.toUpperCase() });

  for (const rota of rotasDeLead()) {
    it(`${rota.metodo.toUpperCase()} ${rota.caminho}: outra empresa → 404 sem chegar na rota; mesma empresa → passa`, async () => {
      chamadas.length = 0;
      sessao = { companyId: TENANT };
      const alheio = await pedir(rota.metodo, url(rota.caminho, LEAD_CASA));
      expect(alheio.status).toBe(404);
      expect(chamadas).toEqual([]);
      const proprio = await pedir(rota.metodo, url(rota.caminho, LEAD_TENANT));
      expect(proprio.status).toBe(200);
      expect(chamadas).toHaveLength(1);
    });
  }

  it('lead que não existe → 404; sem sessão → 404; legado sem company_id = da casa', async () => {
    sessao = { companyId: TENANT };
    expect((await fetch(url('/leads/:id/pause-eva', LEAD_SUMIDO), { method: 'POST' })).status).toBe(404);
    sessao = undefined;
    expect((await fetch(url('/leads/:id', LEAD_TENANT))).status).toBe(404);
    sessao = { companyId: ECOSUN };
    expect((await fetch(url('/leads/:id', LEAD_LEGADO))).status).toBe(200);
    sessao = { companyId: TENANT };
    expect((await fetch(url('/leads/:id', LEAD_LEGADO))).status).toBe(404);
  });

  it('não-UUID (/leads/kanban) passa sem consultar o banco', async () => {
    db.from.mockClear();
    sessao = { companyId: TENANT };
    const r = await fetch(`${base}/leads/kanban`);
    expect(r.status).toBe(200);
    expect(db.from).not.toHaveBeenCalled();
  });
});

describe('leadEhDaEmpresa', () => {
  it('regras', () => {
    expect(leadEhDaEmpresa({ company_id: TENANT }, TENANT)).toBe(true);
    expect(leadEhDaEmpresa({ company_id: ECOSUN }, TENANT)).toBe(false);
    expect(leadEhDaEmpresa({ company_id: null }, ECOSUN)).toBe(true);
    expect(leadEhDaEmpresa({ company_id: TENANT }, undefined)).toBe(false);
  });
});
