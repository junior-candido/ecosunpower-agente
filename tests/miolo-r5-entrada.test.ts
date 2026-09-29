// Renovação do miolo — R5: nova entrada (Command Center para todos, D1 = a) e
// o Cockpit sai do menu (D2 = a). O link discreto "Cockpit antigo" do rodapé
// ficou até a faxina pós-renovação, quando o Cockpit foi aposentado de vez:
// /cockpit (com ou sem ?antigo=1) só redireciona pra entrada de cada um. A
// trava "só da casa" (travaTelaDaCasa) segue protegendo a Visão geral.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { Request, Response } from 'express';
import type { DashUser } from '../src/modules/dashboard/permissions.js';
import { paginaInicialDe, linkDaLogo, destinoDepoisDoLogin } from '../src/modules/dashboard/entrada.js';
import { renderLayout } from '../src/modules/dashboard/views.js';
import { MENU_AREAS, montarMenu } from '../src/modules/dashboard/menu-areas.js';
import { renderCommandCenterPage, renderCentralAtencaoPage } from '../src/modules/dashboard/command-center-views.js';
import { rotaCommandCenter, rotaCentralAtencao, rotaModoTv, travaTelaDaCasa, rotaCockpitAposentado } from '../src/modules/dashboard/command-center-rotas.js';
import { URL_CSS_COMMAND_CENTER } from '../src/modules/dashboard/ui/estatico.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const casa: DashUser = { id: 'u1', companyId: ECOSUN, nome: 'Junior', login: 'j', isAdmin: true, roleNome: 'Administrador', permissoes: {} };
const tenant: DashUser = {
  id: 'u2', companyId: 'aaaa1111-2222-3333-4444-555566667777', nome: 'Bia', login: 'b', isAdmin: true,
  roleNome: 'Admin', permissoes: {}, companyNome: 'Solar Aurora Teste',
};
const fonteRouter = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'router.ts'), 'utf-8');

function resFalso() {
  const res = { redirect: vi.fn(), type: vi.fn(), send: vi.fn(), status: vi.fn(), json: vi.fn() };
  res.type.mockReturnValue(res); res.status.mockReturnValue(res);
  return res;
}

describe('entrada.ts — Command Center para todos', () => {
  it('EcoSun e tenant entram no Command Center', () => {
    expect(paginaInicialDe(casa)).toBe('/dashboard/command-center');
    expect(paginaInicialDe(tenant)).toBe('/dashboard/command-center');
  });
  it('sem sessão → login (nunca o Command Center: seria laço)', () => {
    expect(paginaInicialDe(undefined)).toBe('/dashboard/login');
  });
  it('a logo leva ao Command Center (inclusive tela legada sem user)', () => {
    expect(linkDaLogo(casa)).toBe('/dashboard/command-center');
    expect(linkDaLogo(tenant)).toBe('/dashboard/command-center');
    expect(linkDaLogo(undefined)).toBe('/dashboard/command-center');
  });
  it('login sem next → Command Center; com next do painel → o next (igual a hoje)', () => {
    expect(destinoDepoisDoLogin(undefined, casa)).toBe('/dashboard/command-center');
    expect(destinoDepoisDoLogin('', tenant)).toBe('/dashboard/command-center');
    expect(destinoDepoisDoLogin('/dashboard/leads', casa)).toBe('/dashboard/leads');
    expect(destinoDepoisDoLogin('/dashboard/leads?status=novo', casa)).toBe('/dashboard/leads?status=novo');
    expect(destinoDepoisDoLogin('/dashboard', casa)).toBe('/dashboard');
  });
  it('next de fora do painel é ignorado', () => {
    for (const ruim of ['https://mal.example/dashboard', '//mal.example', '/dashboard\\..\\x', '/dashboardx', '/outra', 42]) {
      expect(destinoDepoisDoLogin(ruim, casa), String(ruim)).toBe('/dashboard/command-center');
    }
  });
});

describe('casca — logo e menu', () => {
  it('logo da EcoSun leva ao Command Center', () => {
    const h = renderLayout({ active: 'leads', title: 'X', body: '', user: casa });
    expect(h).toMatch(/<a href="\/dashboard\/command-center" class="cc-sb-logo"[^>]*>\s*<img[^>]*alt="EcoSunPower"/);
  });
  it('Cockpit fora do menu (casa e tenant)', () => {
    expect(MENU_AREAS.flatMap((g) => g.itens).some((i) => i.key === 'cockpit' || i.href === '/dashboard/cockpit')).toBe(false);
    for (const u of [casa, tenant]) {
      const h = renderLayout({ active: 'leads', title: 'X', body: '', user: u });
      expect(h).not.toContain('href="/dashboard/cockpit"');
    }
  });
  it('grupo Command Center: Command Center, Central, Visão geral e Prédio Vivo', () => {
    const pode = () => true;
    const cc = montarMenu({ companyId: ECOSUN, isAdmin: true, permissoes: {} }, 'home', ECOSUN, pode).find((g) => g.id === 'command_center')!;
    expect(cc.itens.map((i) => i.key)).toEqual(['command_center', 'atencao', 'home', 'predio']);
  });
});

describe('Command Center — rodapé sem Cockpit e CSS no <head>', () => {
  const pagina = (u: DashUser) => renderCommandCenterPage({ agora: new Date('2026-09-28T12:00:00Z'), nomeUsuario: u.nome, dados: null }, u);
  it('casa não vê mais o link "Cockpit antigo" (aposentado na faxina)', () => {
    const h = pagina(casa);
    expect(h).not.toContain('/dashboard/cockpit');
    expect(h).not.toContain('Cockpit antigo');
  });
  it('tenant não vê o Cockpit em lugar nenhum', () => {
    expect(pagina(tenant)).not.toContain('/dashboard/cockpit');
    expect(pagina(tenant)).not.toContain('Cockpit antigo');
  });
  it('CSS do Command Center vem por arquivo no <head> (sem <style> no fim da página)', () => {
    for (const h of [pagina(casa), renderCentralAtencaoPage({ agora: new Date(), dados: null, filtro: {} }, casa)]) {
      const head = h.slice(0, h.indexOf('</head>'));
      expect(head).toContain(`<link rel="stylesheet" href="${URL_CSS_COMMAND_CENTER}">`);
      expect(h.slice(h.indexOf('<body'))).not.toContain('<style>');
    }
  });
});

describe('rotas do Command Center — redirecionamentos', () => {
  it('Command Center e Central sem sessão → login', async () => {
    for (const rota of [rotaCommandCenter({} as never), rotaCentralAtencao({} as never)]) {
      const res = resFalso();
      await rota({ dashUser: undefined } as unknown as Request, res as unknown as Response);
      expect(res.redirect).toHaveBeenCalledWith('/dashboard/login');
    }
  });
  it('Modo TV: tenant → Command Center; sem sessão → login', async () => {
    const r1 = resFalso();
    await rotaModoTv()({ dashUser: tenant } as unknown as Request, r1 as unknown as Response);
    expect(r1.redirect).toHaveBeenCalledWith('/dashboard/command-center');
    const r2 = resFalso();
    await rotaModoTv()({ dashUser: undefined } as unknown as Request, r2 as unknown as Response);
    expect(r2.redirect).toHaveBeenCalledWith('/dashboard/login');
  });
});

describe('/cockpit — aposentado: só redireciona pra entrada (favorito velho continua abrindo)', () => {
  it('casa, com ou sem ?antigo=1 → Command Center', () => {
    for (const query of [{}, { antigo: '1' }]) {
      const res = resFalso();
      rotaCockpitAposentado({ dashUser: casa, query } as unknown as Request, res as unknown as Response);
      expect(res.redirect).toHaveBeenCalledWith(302, '/dashboard/command-center');
      expect(res.send).not.toHaveBeenCalled();
    }
  });
  it('tenant → a entrada DELE (nunca a tela antiga, que lia leads de todas as empresas)', () => {
    const res = resFalso();
    rotaCockpitAposentado({ dashUser: tenant, query: { antigo: '1' } } as unknown as Request, res as unknown as Response);
    expect(res.redirect).toHaveBeenCalledWith(302, paginaInicialDe(tenant));
  });
  it('router: GET /cockpit usa o redirect; as rotas que só a tela antiga usava saíram', () => {
    expect(fonteRouter).toContain("router.get('/cockpit', rotaCockpitAposentado);");
    for (const r of ["router.get('/cockpit/data'", "router.post('/cockpit/sync'", "router.post('/cockpit/insights/refresh'", "router.use('/cockpit'", 'renderCockpitPage', 'getCockpitData']) {
      expect(fonteRouter, r).not.toContain(r);
    }
  });
});

describe('travaTelaDaCasa — telas cuja consulta não filtra empresa (segurança)', () => {
  const chamar = (u: DashUser | undefined, method = 'GET', accept = 'text/html') => {
    const res = resFalso();
    const next = vi.fn();
    travaTelaDaCasa({ dashUser: u, method, headers: { accept } } as unknown as Request, res as unknown as Response, next);
    return { res, next };
  };
  it('casa passa', () => {
    expect(chamar(casa).next).toHaveBeenCalled();
    expect(chamar(casa, 'POST').next).toHaveBeenCalled();
  });
  it('tenant no GET vai para o Command Center dele', () => {
    const { res, next } = chamar(tenant);
    expect(next).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/dashboard/command-center');
  });
  it('tenant no POST leva 403', () => {
    const { res, next } = chamar(tenant, 'POST');
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
  it('tenant pedindo JSON leva 403, não redirect pra HTML', () => {
    const { res, next } = chamar(tenant, 'GET', 'application/json');
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.redirect).not.toHaveBeenCalled();
  });
});

describe('router — entrada nova em /, login e convite', () => {
  it('nenhum redirect fixo para o Cockpit', () => {
    expect(fonteRouter).not.toMatch(/redirect\(\s*'\/dashboard\/cockpit'/);
    expect(fonteRouter).not.toMatch(/:\s*'\/dashboard\/cockpit'/);
  });
  it('/, login e definir-senha usam a entrada (paginaInicialDe / destinoDepoisDoLogin)', () => {
    const raiz = fonteRouter.slice(fonteRouter.indexOf("router.get('/', "), fonteRouter.indexOf("router.get('/', ") + 200);
    expect(raiz).toContain('paginaInicialDe(');
    const login = fonteRouter.slice(fonteRouter.indexOf("router.post('/login'"), fonteRouter.indexOf("router.post('/logout'"));
    expect(login).toContain('destinoDepoisDoLogin(');
    const senha = fonteRouter.slice(fonteRouter.indexOf("router.post('/definir-senha'"), fonteRouter.indexOf("router.get('/esqueci-senha'"));
    expect(senha).toContain('paginaInicialDe(');
  });
});
