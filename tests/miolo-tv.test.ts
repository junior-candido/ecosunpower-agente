// Renovação do miolo — R26: Modo TV (D6 = a — usuário/papel "TV só-leitura",
// SEM migration). A TV mostra só números e quadros do Command Center da
// empresa da sessão (sem nome de cliente, sem dinheiro), gira 3 visões a cada
// 30 s, T = tela cheia; o usuário da TV só abre o Modo TV.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ehPapelTv, PAPEL_TV } from '../src/modules/dashboard/permissions.js';
import { paginaInicialDe, destinoDepoisDoLogin } from '../src/modules/dashboard/entrada.js';
import { rotaModoTv, travaPapelTv, PERMISSOES_TV } from '../src/modules/dashboard/command-center-rotas.js';
import { CASOS_TV, USER_TV_CASA, USER_TV_TENANT, AGORA_TV } from './fixtures/casos-tv.js';
import { USER_CASA, USER_TENANT } from './fixtures/miolo-leads.js';
import { linhasComTailwind } from './helpers/teto-tailwind.js';

const miolo = (h: string) => h.slice(h.indexOf('<main'), h.indexOf('</main>'));
const semScripts = (h: string) => h.replace(/<script\b[\s\S]*?<\/script>/gi, '');
const router = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'router.ts'), 'utf-8');

function resFalso() {
  const res = { redirect: vi.fn(), type: vi.fn(), send: vi.fn(), status: vi.fn(), json: vi.fn() };
  res.type.mockReturnValue(res); res.status.mockReturnValue(res);
  return res;
}

/** Banco falso: responde vazio a tudo e guarda tabela + filtros. Empresa contratou tudo. */
function dbFalso() {
  const chamadas: Array<{ tabela: string; filtros: Array<[string, string, unknown]> }> = [];
  const from = vi.fn((tabela: string) => {
    const reg = { tabela, filtros: [] as Array<[string, string, unknown]> };
    chamadas.push(reg);
    const q: Record<string, unknown> = {};
    q.select = () => q;
    for (const op of ['eq', 'gte', 'lt', 'lte', 'in', 'is', 'not', 'neq']) q[op] = (c: string, v: unknown) => { reg.filtros.push([op, c, v]); return q; };
    q.order = () => q; q.limit = () => q; q.range = () => q; q.maybeSingle = () => q;
    q.then = (ok: (r: unknown) => unknown) => Promise.resolve({
      data: tabela === 'empresa_modulos' ? ['eva', 'monitoramento', 'financeiro', 'marketing'].map((modulo) => ({ modulo })) : [],
      count: 0, error: null,
    }).then(ok);
    return q;
  });
  return { from, chamadas } as unknown as SupabaseClient & { chamadas: typeof chamadas };
}

describe('papel "TV só-leitura"', () => {
  it('reconhece o papel pelo nome (com e sem acento), nunca um admin', () => {
    for (const nome of [PAPEL_TV, 'TV', 'tv so-leitura', 'TV somente leitura']) expect(ehPapelTv({ ...USER_TV_CASA, roleNome: nome }), nome).toBe(true);
    for (const nome of ['Administrador', 'Vendas', 'TVs e som', '']) expect(ehPapelTv({ ...USER_TV_CASA, roleNome: nome }), nome).toBe(false);
    expect(ehPapelTv({ ...USER_TV_CASA, isAdmin: true })).toBe(false);
    expect(ehPapelTv(undefined)).toBe(false);
  });
  it('a entrada do usuário da TV é o Modo TV (login, "/", logo)', () => {
    expect(paginaInicialDe(USER_TV_CASA)).toBe('/dashboard/tv');
    expect(paginaInicialDe(USER_TV_TENANT)).toBe('/dashboard/tv');
    expect(destinoDepoisDoLogin(undefined, USER_TV_CASA)).toBe('/dashboard/tv');
    expect(paginaInicialDe(USER_CASA)).toBe('/dashboard/command-center');
  });
});

describe('travaPapelTv — o usuário da TV só abre o Modo TV (segurança)', () => {
  const chamar = (u: unknown, method: string, path: string, accept = 'text/html') => {
    const res = resFalso();
    const next = vi.fn();
    travaPapelTv({ dashUser: u, method, path, headers: { accept } } as unknown as Request, res as unknown as Response, next);
    return { res, next };
  };
  it('deixa: GET /tv, sair e os arquivos estáticos', () => {
    expect(chamar(USER_TV_CASA, 'GET', '/tv').next).toHaveBeenCalled();
    expect(chamar(USER_TV_CASA, 'GET', '/tv/').next).toHaveBeenCalled();
    expect(chamar(USER_TV_CASA, 'POST', '/logout').next).toHaveBeenCalled();
    expect(chamar(USER_TV_CASA, 'GET', '/estatico/painel.abc1234567.css').next).toHaveBeenCalled();
  });
  it('qualquer outra página GET volta pra TV; POST ou JSON → 403', () => {
    for (const p of ['/leads', '/command-center', '/home', '/financeiro', '/mapa-usinas.json', '/TV-falsa']) {
      const { res, next } = chamar(USER_TV_TENANT, 'GET', p);
      expect(next, p).not.toHaveBeenCalled();
      expect(res.redirect, p).toHaveBeenCalledWith('/dashboard/tv');
    }
    const post = chamar(USER_TV_CASA, 'POST', '/leads/abc/fechou');
    expect(post.next).not.toHaveBeenCalled();
    expect(post.res.status).toHaveBeenCalledWith(403);
    const json = chamar(USER_TV_CASA, 'GET', '/cockpit/data', 'application/json');
    expect(json.res.status).toHaveBeenCalledWith(403);
  });
  it('usuário comum passa direto (a trava é só do papel TV)', () => {
    expect(chamar(USER_CASA, 'GET', '/leads').next).toHaveBeenCalled();
    expect(chamar(USER_TENANT, 'POST', '/leads/x').next).toHaveBeenCalled();
  });
  it('router: a trava vem logo depois da sessão, antes da trava de módulo e de toda rota', () => {
    const sessao = router.indexOf('router.use(criarSessionAuth(supabase));');
    const trava = router.indexOf('router.use(travaPapelTv);');
    expect(trava).toBeGreaterThan(sessao);
    expect(trava).toBeLessThan(router.indexOf('router.use(criarTravaDeModulo(supabase));'));
    expect(router).toContain("router.get('/tv', rotaModoTv(supabase));");
    expect(router).toContain("req.body?.manter === '1' || ehPapelTv(found.user)");
  });
});

describe('GET /dashboard/tv', () => {
  it('usuário da TV de um tenant abre a TV da empresa DELE (toda consulta escopada), sem dinheiro', async () => {
    const db = dbFalso();
    const res = resFalso();
    await rotaModoTv(db, () => AGORA_TV)({ dashUser: USER_TV_TENANT } as unknown as Request, res as unknown as Response);
    expect(res.redirect).not.toHaveBeenCalled();
    expect(db.chamadas.length).toBeGreaterThan(2);
    for (const c of db.chamadas) expect(c.filtros, c.tabela).toContainEqual(['eq', 'company_id', USER_TV_TENANT.companyId]);
    const tabelas = db.chamadas.map((c) => c.tabela);
    for (const t of ['financeiro_recebimentos', 'financeiro_contas_a_pagar']) expect(tabelas).not.toContain(t);
    expect(PERMISSOES_TV.financeiro).toBe(false);
    expect(PERMISSOES_TV.marketing).toBe(false);
  });
  it('tenant comum continua indo pro Command Center; sem sessão → login', async () => {
    const r1 = resFalso();
    await rotaModoTv(dbFalso())({ dashUser: USER_TENANT } as unknown as Request, r1 as unknown as Response);
    expect(r1.redirect).toHaveBeenCalledWith('/dashboard/command-center');
    const r2 = resFalso();
    await rotaModoTv(dbFalso())({ dashUser: undefined } as unknown as Request, r2 as unknown as Response);
    expect(r2.redirect).toHaveBeenCalledWith('/dashboard/login');
  });
});

describe('tela do Modo TV', () => {
  const h = CASOS_TV['tv-casa']();
  it('3 visões (geral, usinas, comercial) girando a cada 30 s; T = tela cheia; ← → troca', () => {
    const titulos = [...h.matchAll(/<section class="cc-tv-visao[^"]*" data-titulo="([^"]+)"/g)].map((m) => m[1]);
    expect(titulos).toEqual(['Visão geral', 'Usinas', 'Comercial']);
    expect(h).toContain('GIRO = 30000');
    expect(h).toContain("e.key === 't' || e.key === 'T'");
    expect(h).toContain('requestFullscreen');
    expect(h).toContain("'ArrowRight'");
  });
  it('sem casca (menu, barra, rodapé) e sem piscada: some por CSS no <head>', () => {
    const head = h.slice(0, h.indexOf('</head>'));
    expect(head).toContain('.cc-shell:has(#cc-tv) .cc-sb');
    expect(h.slice(h.indexOf('<body'))).not.toContain('<style>');
    expect(h).not.toContain('cdn.tailwindcss.com');
    expect(linhasComTailwind(semScripts(miolo(h)))).toEqual([]);
  });
  it('só números reais: nada do protótipo, nenhum aviso com nome, nenhum dinheiro', () => {
    const m = semScripts(miolo(h));
    for (const falso of ['Atacadão', '912', 'R$ 164']) expect(m).not.toContain(falso);
    expect(m).not.toContain('Aviso fictício'); // títulos da Central (podem ter nome de cliente) não vão pra TV
    expect(m).not.toMatch(/R\$|Recebido/);
    expect(m).toContain('212'); // leads do mês (dadosCC)
  });
  it('sem dado: "—" e aviso honesto, nunca número de enfeite', () => {
    const m = miolo(CASOS_TV['tv-sem-dado']());
    expect(m).toContain('Sem dado agora');
  });
  it('usuário da TV: nome da empresa DELE e sem "sair do Modo TV" (não tem pra onde ir)', () => {
    const t = miolo(CASOS_TV['tv-papel-tv-tenant']());
    expect(t).toContain('Solar Aurora Teste');
    expect(t).not.toMatch(/EcoSun|\bEva\b/);
    expect(t).not.toContain('sair do Modo TV');
    expect(miolo(h)).toContain('sair do Modo TV');
  });
});
