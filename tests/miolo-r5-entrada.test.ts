// Renovação do miolo — R5: nova entrada (Command Center para todos, D1 = a) e
// o Cockpit sai do menu (D2 = a), com o link discreto "Cockpit antigo" no
// rodapé do Command Center só para a casa. A rota /cockpit continua viva —
// mas SÓ da casa: a consulta do Cockpit não filtra empresa (lia os leads de
// todas as empresas) e o tenant caía nela depois do login (falha achada no R5).
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { Request, Response } from 'express';
import type { DashUser } from '../src/modules/dashboard/permissions.js';
import { paginaInicialDe, linkDaLogo, destinoDepoisDoLogin } from '../src/modules/dashboard/entrada.js';
import { renderLayout } from '../src/modules/dashboard/views.js';
import { MENU_AREAS, montarMenu } from '../src/modules/dashboard/menu-areas.js';
import { renderCommandCenterPage, renderCentralAtencaoPage } from '../src/modules/dashboard/command-center-views.js';
import { rotaCommandCenter, rotaCentralAtencao, rotaModoTv, travaCockpitDaCasa } from '../src/modules/dashboard/command-center-rotas.js';
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

describe('Command Center — rodapé "Cockpit antigo" e CSS no <head>', () => {
  const pagina = (u: DashUser) => renderCommandCenterPage({ agora: new Date('2026-09-28T12:00:00Z'), nomeUsuario: u.nome, dados: null }, u);
  it('casa vê o link discreto "Cockpit antigo" no rodapé', () => {
    const h = pagina(casa);
    const pe = h.slice(h.indexOf('class="cc-foot"'));
    expect(pe).toMatch(/<a [^>]*href="\/dashboard\/cockpit"[^>]*>Cockpit antigo<\/a>/);
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

describe('/cockpit — continua vivo, só para a casa (segurança)', () => {
  const chamar = (u: DashUser | undefined, method = 'GET') => {
    const res = resFalso();
    const next = vi.fn();
    travaCockpitDaCasa({ dashUser: u, method } as unknown as Request, res as unknown as Response, next);
    return { res, next };
  };
  it('casa passa (GET /cockpit segue 200)', () => {
    expect(chamar(casa).next).toHaveBeenCalled();
    expect(chamar(casa, 'POST').next).toHaveBeenCalled();
  });
  it('tenant no GET vai para o Command Center (o Cockpit lia leads de todas as empresas)', () => {
    const { res, next } = chamar(tenant);
    expect(next).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/dashboard/command-center');
  });
  it('tenant no POST (sync / insights) leva 403 — o SYNC AGORA sincronizava as usinas de todas as empresas', () => {
    const { res, next } = chamar(tenant, 'POST');
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
  it('router: a trava vem ANTES das rotas do Cockpit', () => {
    const trava = fonteRouter.indexOf("router.use('/cockpit', travaCockpitDaCasa)");
    expect(trava).toBeGreaterThan(-1);
    for (const r of ["router.get('/cockpit'", "router.get('/cockpit/data'", "router.post('/cockpit/sync'", "router.post('/cockpit/insights/refresh'"]) {
      expect(fonteRouter.indexOf(r), r).toBeGreaterThan(trava);
    }
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
