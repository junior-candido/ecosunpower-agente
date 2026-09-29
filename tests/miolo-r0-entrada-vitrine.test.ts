// RenovaÃ§Ã£o do miolo â€” R0: entrada/logo (B3), vitrine com contraste (B2) e
// tÃ­tulo do Financeiro sem o nome da casa (B4).
import { describe, it, expect } from 'vitest';
import type { DashUser } from '../src/modules/dashboard/permissions.js';
import { paginaInicialDe, linkDaLogo } from '../src/modules/dashboard/entrada.js';
import { renderLayout } from '../src/modules/dashboard/views.js';
import { telaConhecer, telaConhecerEnviado } from '../src/modules/dashboard/conhecer-views.js';
import { renderFinanceiroPage } from '../src/modules/dashboard/financeiro-views.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const casa: DashUser = { id: 'u1', companyId: ECOSUN, nome: 'Junior', login: 'j', isAdmin: true, roleNome: 'Administrador', permissoes: {} };
const tenant: DashUser = {
  id: 'u2', companyId: 'aaaa1111-2222-3333-4444-555566667777', nome: 'Bia', login: 'b', isAdmin: false,
  roleNome: 'Monitoramento', permissoes: { usinas: ['visualizar'] }, companyNome: 'Solar Aurora Teste',
};

describe('entrada.ts â€” tela de entrada e link da logo', () => {
  // TROCA DELIBERADA (renovacao do miolo R5, decisao D1 = a - ok do Junior no PR):
  // o R0 deixou a EcoSun na Home "por enquanto"; no R5 a entrada de TODOS virou o
  // Command Center (sem sessao -> login). O resto do R0 continua igual.
  it('EcoSun entra no Command Center (R5)', () => {
    expect(paginaInicialDe(casa)).toBe('/dashboard/command-center');
  });
  it('tenant vai para o Command Center dele', () => {
    expect(paginaInicialDe(tenant)).toBe('/dashboard/command-center');
  });
  it('sem sessao -> login (R5)', () => {
    expect(paginaInicialDe(undefined)).toBe('/dashboard/login'); // R5: sem sessao -> login
  });
  it('a logo leva para a mesma entrada', () => {
    expect(linkDaLogo(casa)).toBe('/dashboard/command-center'); // R5
    expect(linkDaLogo(tenant)).toBe('/dashboard/command-center');
  });
});

describe('casca â€” link da logo', () => {
  it('tenant: logo leva ao Command Center, nÃ£o Ã  Home da casa', () => {
    const h = renderLayout({ active: 'monitoramento', title: 'X', body: '', user: tenant });
    expect(h).toMatch(/<a href="\/dashboard\/command-center" class="cc-sb-logo"/);
    expect(h).not.toMatch(/<a href="\/dashboard\/home" class="cc-sb-logo"/);
  });
  it('EcoSun: logo leva ao Command Center (R5)', () => {
    const h = renderLayout({ active: 'home', title: 'X', body: '', user: casa });
    expect(h).toMatch(/<a href="\/dashboard\/command-center" class="cc-sb-logo"[^>]*>\s*<img[^>]*alt="EcoSunPower"/);
  });
});

describe('vitrine /conhecer â€” contraste e botÃ£o', () => {
  const h = telaConhecer('marketing', 'Solar Aurora Teste', tenant);
  const corpo = h.slice(h.indexOf('<main'), h.indexOf('</main>'));

  it('tÃ­tulo nÃ£o Ã© pintado com a cor da marca (marca escura some no fundo navy)', () => {
    const h1 = corpo.match(/<h1[^>]*>/)![0];
    expect(h1).not.toContain('color:var(--marca)');
    expect(h1).toContain('var(--cc-text)');
  });
  it('filete Ã  esquerda na cor da marca', () => {
    expect(corpo).toMatch(/border-left:[^;"]*var\(--marca\)/);
  });
  it('botÃ£o "Quero conhecer" Ã© o botÃ£o dourado do design system', () => {
    expect(corpo).toMatch(/<button type="submit" class="cc-btn cc-btn-gold"[^>]*>\s*Quero conhecer/);
  });
  it('o formulÃ¡rio continua igual', () => {
    expect(corpo).toContain('<form method="post" action="/dashboard/conhecer/marketing">');
  });
  it('"â† voltar" leva Ã  entrada do tenant (Command Center), nÃ£o Ã  Home da casa', () => {
    expect(corpo).toContain('href="/dashboard/command-center"');
    expect(corpo).not.toContain('href="/dashboard/home"');
  });
  it('EcoSun: "â† voltar" continua na Home', () => {
    const hc = telaConhecer('marketing', 'X', casa);
    expect(hc.slice(hc.indexOf('<main'), hc.indexOf('</main>'))).toContain('href="/dashboard/command-center"'); // R5
  });
  it('tela de "interesse registrado" segue a mesma regra', () => {
    const e = telaConhecerEnviado('marketing', tenant);
    const c = e.slice(e.indexOf('<main'), e.indexOf('</main>'));
    expect(c.match(/<h1[^>]*>/)![0]).not.toContain('color:var(--marca)');
    expect(c).toContain('href="/dashboard/command-center"');
  });
});

describe('Financeiro â€” tÃ­tulo sem o nome da casa', () => {
  const vazio = {
    faturamentoMes: 0, faixa: 1, rbt12: 0, salto: null, impostoASeparar: 0, aReceber: 0,
    caixa: { saiuMesPj: 0, lucroMes: 0, entrouMesPjCaixa: 0, entrouSemNotaPj: 0, faturadoMesPj: 0, entrouMesPf: 0, saiuMesPf: 0, pizzaCategorias: [] },
    fatorR: { anexo: 'III', ratio: 0.3, proLaboreMin: 0 }, contas: [], lancamentos: [],
    faturamentoMensal: [], despesasMensal: [],
  } as any;
  it('tenant nÃ£o vÃª "EcoSunPower" no miolo', () => {
    const h = renderFinanceiroPage(vazio, tenant);
    const corpo = h.slice(h.indexOf('<main'), h.indexOf('</main>'));
    expect(corpo).toContain('Financeiro');
    expect(corpo).not.toContain('EcoSunPower');
  });
});
