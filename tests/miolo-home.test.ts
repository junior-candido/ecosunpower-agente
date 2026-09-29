// Renovação do miolo — R24: Visão geral (/home) no padrão cc- + só da casa.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { Request, Response } from 'express';
import { CASOS_HOME } from './fixtures/casos-home.js';
import { linhasComTailwind } from './helpers/teto-tailwind.js';
import { travaVisaoGeralDaCasa } from '../src/modules/dashboard/command-center-rotas.js';
import { USER_CASA, USER_TENANT } from './fixtures/miolo-leads.js';

const miolo = (h: string) => h.slice(h.indexOf('<main'), h.indexOf('</main>'));

describe('Visão geral no padrão cc-', () => {
  const h = CASOS_HOME.home();
  const m = miolo(h);
  it('sem Tailwind, tema escuro, CSS no <head>, trilha a partir do Command Center', () => {
    expect(h).not.toContain('cdn.tailwindcss.com');
    expect(h).toContain('cc-escuro');
    expect(h.slice(h.indexOf('<body'))).not.toContain('<style>');
    expect(linhasComTailwind(m)).toEqual([]);
    expect(m).toContain('<a href="/dashboard/command-center">Command Center</a>');
  });
  it('KPIs em faixas cc- (vendas em destaque) com os números da tela antiga', () => {
    expect(m).toContain('cc-kstrip');
    expect(m).toContain('cc-kpi cc-kpi-hl');
    expect(m).toContain('71 no ano · 210 total');
    expect(m).toContain('últimas 50 propostas');
  });
  it('filtro do mês é o mesmo GET ?mes= que envia sozinho', () => {
    expect(m).toContain('<form method="get" action="/dashboard/home"');
    expect(m).toMatch(/type="month" name="mes" value="2026-09" onchange="this.form.submit\(\)"/);
  });
  it('gráficos: mesmos canvas e CDN, cores do tema', () => {
    expect(m).toContain('id="graficoVendas"');
    expect(m).toContain('id="graficoMensal"');
    expect(h).toContain('https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js');
    expect(h).toContain('id="cc-tema-graficos"');
    expect(h.indexOf('cc-tema-graficos')).toBeGreaterThan(h.indexOf('chart.umd.min.js'));
  });
  it('ticket médio com o mesmo número de antes (R$ sem centavos); manutenção pendente em destaque', () => {
    const card = m.slice(m.indexOf('Ticket médio'), m.indexOf('Ticket médio') + 300);
    expect(card).toContain('28.451');
    const mp = miolo(CASOS_HOME['home-mes-passado']());
    expect(mp).toContain('agosto de 2026');
    expect(m).toMatch(/cc-kpi cc-kpi-hl cc-clk" href="\/dashboard\/manutencao"/);
  });
});

describe('/home só da casa (segurança)', () => {
  const chamar = (u: unknown) => {
    const res = { redirect: vi.fn(), status: vi.fn(), json: vi.fn() };
    res.status.mockReturnValue(res);
    const next = vi.fn();
    travaVisaoGeralDaCasa({ dashUser: u, method: 'GET', headers: {} } as unknown as Request, res as unknown as Response, next);
    return { res, next };
  };
  it('casa passa; tenant vai pro Command Center dele', () => {
    expect(chamar(USER_CASA).next).toHaveBeenCalled();
    const t = chamar(USER_TENANT);
    expect(t.next).not.toHaveBeenCalled();
    expect(t.res.redirect).toHaveBeenCalledWith('/dashboard/command-center');
  });
  it('a rota usa a trava', () => {
    const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'router.ts'), 'utf-8');
    expect(fonte).toContain("router.get('/home', travaVisaoGeralDaCasa, async");
  });
});
