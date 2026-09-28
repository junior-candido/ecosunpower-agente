// Menu e rotas respeitam o que a EMPRESA contratou (empresa_modulos), não só o papel.
//
// Antes: a Jimena (Conquista Solar, contratou SÓ a assistente) é admin do tenant
// e via Usinas, Financeiro e Marketing como link aberto — e o exigir(...) deixava
// entrar. Agora: item de módulo não contratado aparece com cadeado e leva à
// vitrine (/dashboard/conhecer/<chave>); URL digitada na mão redireciona pra lá.
// EcoSun nunca é afetada. Falha ao ler empresa_modulos = tudo trancado pro tenant.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response, NextFunction } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  moduloDoCaminho, lerModulosAtivos, modulosDaRequisicao, criarTravaDeModulo, MODULOS, MODULO_DA_ROTA,
} from '../src/modules/dashboard/modulos-contratados.js';
import { montarMenu, MENU_AREAS } from '../src/modules/dashboard/menu-areas.js';
import { renderLayout } from '../src/modules/dashboard/views.js';
import { can, type DashUser } from '../src/modules/dashboard/permissions.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const CONQUISTA = 'c0c0c0c0-2222-3333-4444-555566667777';

const jimena: DashUser = {
  id: 'j', companyId: CONQUISTA, nome: 'Jimena', login: 'jimena', isAdmin: true,
  roleNome: 'Administradora', permissoes: {}, companyNome: 'Conquista Solar',
};
const junior: DashUser = { id: 'u', companyId: ECOSUN, nome: 'Junior', login: 'j', isAdmin: true, roleNome: 'Administrador', permissoes: {} };
const pode = (u: never, area: string, nivel?: string) => can(u, area as never, (nivel ?? 'visualizar') as never);

/** Supabase falso só pra empresa_modulos: conta as leituras e guarda os filtros. */
function dbModulos(resposta: { data?: Array<{ modulo: string }>; error?: { message: string } } | Error) {
  const leituras: Array<Array<[string, unknown]>> = [];
  const from = vi.fn((tabela: string) => {
    expect(tabela).toBe('empresa_modulos');
    const filtros: Array<[string, unknown]> = [];
    leituras.push(filtros);
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = (c: string, v: unknown) => { filtros.push([c, v]); return q; };
    q.then = (ok: (r: unknown) => unknown, falha?: (e: unknown) => unknown) => {
      if (resposta instanceof Error) return Promise.reject(resposta).then(ok, falha);
      return Promise.resolve({ data: resposta.data ?? null, error: resposta.error ?? null }).then(ok, falha);
    };
    return q;
  });
  return { from, leituras } as unknown as SupabaseClient & { from: typeof from; leituras: typeof leituras };
}

function resFalso() {
  const res = { redirect: vi.fn(), status: vi.fn(), type: vi.fn(), send: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  res.type.mockReturnValue(res);
  return res;
}

/** Roda a trava como o router roda: req com sessão, caminho relativo a /dashboard. */
async function passarNaTrava(db: SupabaseClient, user: DashUser | undefined, path: string, method = 'GET', accept?: string) {
  const req = { dashUser: user, path, method, headers: accept ? { accept } : {} } as unknown as Parameters<ReturnType<typeof criarTravaDeModulo>>[0];
  const res = resFalso();
  const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
  await criarTravaDeModulo(db)(req, res as unknown as Response, next);
  return { req: req as unknown as { dashUser?: DashUser }, res, next };
}

beforeEach(() => {
  delete process.env.RLS_TENANT_ROTAS;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('mapa rota → módulo (um lugar só)', () => {
  it('cada página do menu cai no módulo certo', () => {
    const casos: Array<[string, string | null]> = [
      ['/dashboard/monitoramento', 'monitoramento'],
      ['/dashboard/monitoramento/abc-123', 'monitoramento'],
      ['/dashboard/demonstrativos', 'monitoramento'],
      ['/dashboard/medicao', 'medicao'],
      ['/dashboard/usinas/kanban', 'monitoramento'],
      ['/dashboard/os/9', 'monitoramento'],
      ['/dashboard/manutencao', 'monitoramento'],
      ['/dashboard/servicos', 'monitoramento'],
      ['/dashboard/pos-venda', 'monitoramento'],
      ['/dashboard/pastas', 'pasta_digital'],
      ['/dashboard/financeiro', 'financeiro'],
      ['/dashboard/cobrar', 'financeiro'],
      ['/dashboard/cobrancas', 'financeiro'],
      ['/dashboard/assinaturas', 'financeiro'],
      ['/dashboard/fiscal', 'fiscal'],
      ['/dashboard/fiscal/nova', 'fiscal'],
      ['/dashboard/marketing', 'marketing'],
      ['/dashboard/marketing/blog', 'marketing'],
      ['/dashboard/cadencia', 'marketing'],
      ['/dashboard/leads', 'eva'],
      ['/dashboard/leads/kanban', 'eva'],
      ['/dashboard/propostas', 'eva'],
      ['/dashboard/recados', 'eva'],
      ['/dashboard/conhecimento', 'eva'],
      ['/dashboard/rh/vagas', 'rh'],
      // Sempre abertos: entrada, Command Center, conta do tenant, config, vitrine.
      ['/dashboard/command-center', null],
      ['/dashboard/atencao', null],
      ['/dashboard/cockpit', null],
      ['/dashboard/minha-assinatura', null],
      ['/dashboard/usuarios', null],
      ['/dashboard/whatsapp', null],
      ['/dashboard/conhecer/financeiro', null],
      ['/dashboard/logout', null],
    ];
    for (const [caminho, modulo] of casos) expect(moduloDoCaminho(caminho)?.modulo ?? null, caminho).toBe(modulo);
  });

  it('casa por pedaço inteiro do caminho, não por começo de palavra', () => {
    expect(moduloDoCaminho('/leadsx')).toBeNull();
    expect(moduloDoCaminho('/rhino')).toBeNull();
    expect(moduloDoCaminho('/fiscal')?.modulo).toBe('fiscal'); // sem o /dashboard também
  });

  it('maiúscula e barra dobrada não furam a trava (o Express casa rota sem diferenciar)', () => {
    expect(moduloDoCaminho('/Financeiro')?.modulo).toBe('financeiro');
    expect(moduloDoCaminho('/MONITORAMENTO/u1')?.modulo).toBe('monitoramento');
    expect(moduloDoCaminho('/financeiro/')?.modulo).toBe('financeiro');
    expect(moduloDoCaminho('//marketing')?.modulo).toBe('marketing');
  });

  it('a chave da vitrine é uma chave do menu', () => {
    const chaves = new Set(MENU_AREAS.flatMap((g) => g.itens.map((i) => i.key)));
    for (const r of MODULO_DA_ROTA) expect(chaves.has(r.chave), r.prefixo).toBe(true);
    for (const r of MODULO_DA_ROTA) expect(MODULOS).toContain(r.modulo);
  });
});

describe('lerModulosAtivos — a regra única (fail-closed, EcoSun tem tudo)', () => {
  it('lê só os ativos da empresa', async () => {
    const db = dbModulos({ data: [{ modulo: 'eva' }, { modulo: 'lixo' }] });
    expect([...await lerModulosAtivos(db, CONQUISTA)]).toEqual(['eva']);
    expect(db.leituras[0]).toContainEqual(['company_id', CONQUISTA]);
    expect(db.leituras[0]).toContainEqual(['ativo', true]);
  });
  it('erro ou exceção → nenhum módulo', async () => {
    expect((await lerModulosAtivos(dbModulos({ error: { message: 'relation does not exist' } }), CONQUISTA)).size).toBe(0);
    expect((await lerModulosAtivos(dbModulos(new Error('rede caiu')), CONQUISTA)).size).toBe(0);
  });
  it('EcoSun: todos, sem ler a tabela', async () => {
    const db = dbModulos(new Error('nem devia ler'));
    expect([...await lerModulosAtivos(db, ECOSUN)].sort()).toEqual([...MODULOS].sort());
    expect(db.from).not.toHaveBeenCalled();
  });
  it('1 leitura por requisição, mesmo chamando várias vezes', async () => {
    const db = dbModulos({ data: [{ modulo: 'eva' }] });
    const req = {};
    await modulosDaRequisicao(req, db, CONQUISTA);
    await modulosDaRequisicao(req, db, CONQUISTA);
    expect(db.from).toHaveBeenCalledTimes(1);
    await modulosDaRequisicao({}, db, CONQUISTA); // outra requisição lê de novo
    expect(db.from).toHaveBeenCalledTimes(2);
  });
});

describe('menu da Jimena (Conquista, só "eva")', () => {
  const comModulos = (u: DashUser, m: string[]): DashUser => ({ ...u, modulosContratados: m });

  it('Usinas, Financeiro e Marketing TRANCADOS com link pra vitrine; Comercial aberto', () => {
    const grupos = montarMenu(comModulos(jimena, ['eva']), 'command_center', ECOSUN, pode);
    const item = (k: string) => grupos.flatMap((g) => g.itens).find((i) => i.key === k);
    for (const k of ['monitoramento', 'demonstrativos', 'medicao', 'usinas_kanban', 'financeiro', 'fiscal', 'cobrar', 'assinaturas', 'marketing', 'blog', 'email', 'cadencia', 'rh_vagas', 'pastas', 'pos_venda', 'servicos']) {
      expect(item(k)?.estado, k).toBe('bloqueado');
    }
    for (const k of ['leads', 'kanban', 'propostas', 'recados', 'conhecimento', 'command_center', 'atencao', 'minha_assinatura', 'usuarios', 'whatsapp']) {
      expect(item(k)?.estado, k).toBe('visivel');
    }
    const grupo = (id: string) => grupos.find((g) => g.id === id);
    expect(grupo('financeiro')?.trancado).toBe(true);
    expect(grupo('marketing')?.trancado).toBe(true);
    expect(grupo('comercial')?.trancado).toBe(false);
  });

  it('no HTML: cadeado e href da vitrine, nunca o link da página', () => {
    const h = renderLayout({ active: 'command_center', title: 'X', body: '', user: comModulos(jimena, ['eva']) });
    for (const k of ['monitoramento', 'financeiro', 'marketing']) {
      expect(h).toContain(`href="/dashboard/conhecer/${k}" class="cc-lock"`);
      expect(h).not.toContain(`href="/dashboard/${k}"`);
    }
    expect(h).toContain('href="/dashboard/leads"');
    expect(h).toContain('href="/dashboard/command-center"');
  });

  it('falha na leitura (lista vazia): tudo trancado, menos o que é sempre aberto', () => {
    const grupos = montarMenu(comModulos(jimena, []), 'command_center', ECOSUN, pode);
    const itens = grupos.flatMap((g) => g.itens);
    const abertos = itens.filter((i) => i.estado === 'visivel').map((i) => i.key).sort();
    expect(abertos).toEqual(['atencao', 'command_center', 'minha_assinatura', 'usuarios', 'whatsapp']);
  });

  it('EcoSun: menu idêntico com ou sem a lista de módulos (mesmo vazia)', () => {
    const base = montarMenu(junior, 'home', ECOSUN, pode);
    expect(montarMenu(comModulos(junior, []), 'home', ECOSUN, pode)).toEqual(base);
    expect(base.flatMap((g) => g.itens).every((i) => i.estado === 'visivel')).toBe(true);
  });
});

describe('trava das rotas (middleware central)', () => {
  it('Jimena digitando /monitoramento, /financeiro, /marketing → vitrine, sem passar pra página', async () => {
    for (const [path, chave] of [['/monitoramento', 'monitoramento'], ['/financeiro', 'financeiro'], ['/marketing', 'marketing'], ['/monitoramento/usina-1', 'monitoramento'], ['/fiscal/nova', 'fiscal']]) {
      const { res, next } = await passarNaTrava(dbModulos({ data: [{ modulo: 'eva' }] }), jimena, path);
      expect(next, path).not.toHaveBeenCalled();
      expect(res.redirect, path).toHaveBeenCalledWith(`/dashboard/conhecer/${chave}`);
    }
  });

  it('POST em módulo trancado → 403 (não executa ação)', async () => {
    const { res, next } = await passarNaTrava(dbModulos({ data: [{ modulo: 'eva' }] }), jimena, '/cobrancas', 'POST');
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it('GET pedindo JSON em módulo trancado → 403 JSON (não redireciona pra página)', async () => {
    const { res, next } = await passarNaTrava(dbModulos({ data: [{ modulo: 'eva' }] }), jimena, '/monitoramento/u1/dados', 'GET', 'application/json');
    expect(next).not.toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ erro: 'modulo_nao_contratado', modulo: 'monitoramento' });
  });

  it('Jimena em módulo contratado e em página sempre aberta: passa, com os módulos na sessão', async () => {
    for (const path of ['/leads', '/propostas', '/command-center', '/cockpit', '/conhecer/financeiro']) {
      const { next, res, req } = await passarNaTrava(dbModulos({ data: [{ modulo: 'eva' }] }), jimena, path);
      expect(next, path).toHaveBeenCalledOnce();
      expect(res.redirect).not.toHaveBeenCalled();
      expect(req.dashUser?.modulosContratados).toEqual(['eva']);
    }
  });

  it('empresa_modulos fora do ar: tenant trancado em tudo que é módulo, sem módulos na sessão', async () => {
    const db = dbModulos(new Error('rede caiu'));
    const t = await passarNaTrava(db, jimena, '/leads');
    expect(t.res.redirect).toHaveBeenCalledWith('/dashboard/conhecer/leads');
    const cc = await passarNaTrava(db, jimena, '/command-center');
    expect(cc.next).toHaveBeenCalledOnce();
    expect(cc.req.dashUser?.modulosContratados).toEqual([]);
  });

  it('EcoSun: passa sempre, sem ler a tabela, mesmo com ela fora do ar', async () => {
    const db = dbModulos(new Error('rede caiu'));
    for (const path of ['/monitoramento', '/financeiro', '/marketing', '/fiscal', '/rh/vagas']) {
      const { next, res } = await passarNaTrava(db, junior, path);
      expect(next, path).toHaveBeenCalledOnce();
      expect(res.redirect).not.toHaveBeenCalled();
    }
    expect(db.from).not.toHaveBeenCalled();
  });

  it('sem sessão: não mexe (quem barra é o login)', async () => {
    const db = dbModulos({ data: [] });
    const { next } = await passarNaTrava(db, undefined, '/financeiro');
    expect(next).toHaveBeenCalledOnce();
    expect(db.from).not.toHaveBeenCalled();
  });
});

describe('1 leitura de empresa_modulos por requisição (trava + Command Center)', () => {
  it('a trava lê, o Command Center reaproveita', async () => {
    const { rotaCommandCenter } = await import('../src/modules/dashboard/command-center-rotas.js');
    const tabelas: string[] = [];
    const db = {
      from(tabela: string) {
        tabelas.push(tabela);
        const q: Record<string, unknown> = {};
        for (const m of ['select', 'eq', 'gte', 'lt', 'lte', 'in', 'is', 'not', 'order', 'limit', 'range']) q[m] = () => q;
        q.then = (ok: (r: unknown) => unknown) => Promise.resolve({
          data: tabela === 'empresa_modulos' ? [{ modulo: 'eva' }] : [], count: 0, error: null,
        }).then(ok);
        return q;
      },
    } as unknown as SupabaseClient;
    const { req, next } = await passarNaTrava(db, jimena, '/command-center');
    expect(next).toHaveBeenCalledOnce();
    const res = resFalso();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await rotaCommandCenter(db, () => new Date('2026-09-28T13:40:00Z'))(req as never, res as unknown as Response);
    expect(tabelas.filter((t) => t === 'empresa_modulos')).toHaveLength(1);
    const h = res.send.mock.calls[0][0] as string;
    expect(h).toContain('href="/dashboard/conhecer/monitoramento" class="cc-lock"');
  });
});
