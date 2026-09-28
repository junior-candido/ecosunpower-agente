// Casca nova do painel (Command Center fase A): menu por área, logo grande,
// cartão do usuário, Modo TV, gaveta no celular, tema escuro/claro.
// Os testes antigos de layout (logo → /home, tenant sem marca da casa, vitrine…)
// continuam valendo e rodam junto.
import { describe, it, expect } from 'vitest';
import { renderLayout } from '../src/modules/dashboard/views.js';
import { LOGO_NEGATIVA_WIDE_BASE64 } from '../src/modules/dashboard/ui/logo-negativa-wide.js';
import type { DashUser } from '../src/modules/dashboard/permissions.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const junior: DashUser = {
  id: 'u1', companyId: ECOSUN, nome: 'Junior <b>', login: 'junior', isAdmin: true,
  roleNome: 'Administrador', permissoes: {},
};
const tenant: DashUser = {
  id: 'u2', companyId: 'aaaa1111-2222-3333-4444-555566667777', nome: 'Thiago', login: 't',
  isAdmin: false, roleNome: 'Monitoramento', permissoes: { usinas: ['visualizar'] }, companyNome: 'Sabion Solar',
};

describe('renderLayout — casca nova', () => {
  it('traz design system: fontes, tokens, sprite de ícones', () => {
    const h = renderLayout({ active: 'home', title: 'X', body: '', user: junior });
    expect(h).toContain('Space+Grotesk');
    expect(h).toContain('--cc-bg');
    expect(h).toContain('id="cc-i-gauge"');
  });

  it('menu por área com o Command Center no topo (EcoSun)', () => {
    const h = renderLayout({ active: 'home', title: 'X', body: '', user: junior });
    expect(h).toContain('href="/dashboard/command-center"');
    expect(h.indexOf('Command Center')).toBeLessThan(h.indexOf('Comercial / CRM'));
    expect(h).toContain('cc-sb');
  });

  it('logo negativa-wide GRANDE da EcoSun, link pra Home', () => {
    const h = renderLayout({ active: 'home', title: 'X', body: '', user: junior });
    expect(h).toContain(LOGO_NEGATIVA_WIDE_BASE64.slice(0, 80));
    expect(h).toMatch(/<a href="\/dashboard\/home"[^>]*>\s*<img[^>]*alt="EcoSunPower"/);
  });

  it('grupo do item ativo vem aberto; item ativo marcado', () => {
    const h = renderLayout({ active: 'cadencia', title: 'X', body: '', user: junior });
    expect(h).toMatch(/<details class="cc-grp" open>\s*<summary class="cc-top-item cc-on"[^>]*>[\s\S]*?Marketing/);
    expect(h).toMatch(/<a href="\/dashboard\/cadencia" class="cc-on"/);
  });

  it('tela escura → corpo navy; tela clara → corpo claro', () => {
    expect(renderLayout({ active: 'home', title: 'X', body: '', dark: true })).toContain('<div class="cc-shell cc-escuro">');
    expect(renderLayout({ active: 'home', title: 'X', body: '' })).toContain('<div class="cc-shell cc-claro">');
  });

  it('telas escuras antigas continuam com a classe de texto claro que elas esperam', () => {
    expect(renderLayout({ active: 'home', title: 'X', body: '', dark: true })).toMatch(/<body class="[^"]*text-slate-100/);
  });

  it('cartão do usuário: nome escapado + papel; botão Sair', () => {
    const h = renderLayout({ active: 'home', title: 'X', body: '', user: junior });
    expect(h).toContain('Junior &lt;b&gt;');
    expect(h).toContain('Administrador');
    expect(h).toContain('action="/dashboard/logout"');
  });

  it('entrada do Modo TV', () => {
    const h = renderLayout({ active: 'home', title: 'X', body: '', user: junior });
    expect(h).toContain('href="/dashboard/tv"');
    expect(h).toContain('Modo TV');
  });

  it('celular: barra com botão que abre a gaveta', () => {
    const h = renderLayout({ active: 'home', title: 'X', body: '', user: junior });
    expect(h).toContain('cc-mtop');
    expect(h).toContain("classList.toggle('sidebar-open'");
    expect(h).toContain('aria-label="Abrir menu"');
  });

  it('gaveta acessível: aria-controls aponta o menu, aria-expanded muda, Esc fecha e devolve o foco', () => {
    const h = renderLayout({ active: 'home', title: 'X', body: '', user: junior });
    expect(h).toContain('<aside class="cc-sb" id="cc-sidebar"');
    const btn = h.match(/<button[^>]*id="cc-menu-btn"[^>]*>/)![0];
    expect(btn).toContain('aria-controls="cc-sidebar"');
    expect(btn).toContain('aria-expanded="false"');
    expect(h).toContain("setAttribute('aria-expanded'");
    expect(h).toContain("e.key !== 'Escape'");
    expect(h).toContain('btn.focus()');
  });

  it('gaveta fechada some também pra leitor de tela/teclado (visibility), aberta volta', async () => {
    const { CSS_DESIGN_SYSTEM } = await import('../src/modules/dashboard/ui/estilo.js');
    const bloco = CSS_DESIGN_SYSTEM.slice(CSS_DESIGN_SYSTEM.indexOf('@media (max-width:1023px)'));
    expect(bloco).toMatch(/\.cc-sb\{[^}]*transform:translateX\(-100%\);visibility:hidden/);
    expect(bloco).toMatch(/\.sidebar-open \.cc-sb\{[^}]*visibility:visible/);
  });

  it('tenant: sem Modo TV (fica pra fase B)', () => {
    const h = renderLayout({ active: 'monitoramento', title: 'X', body: '', user: tenant });
    expect(h).not.toContain('href="/dashboard/tv"');
    expect(h).not.toContain('<strong>Modo TV</strong>');
  });

  it('cartão do usuário: tenant sem cargo nem marca não mostra o nome da EcoSun', () => {
    const semNada: DashUser = { ...tenant, roleNome: '', companyNome: undefined };
    const h = renderLayout({ active: 'monitoramento', title: 'X', body: '', user: semNada });
    const cartao = h.slice(h.indexOf('class="cc-me"'), h.indexOf('</form>', h.indexOf('class="cc-me"')));
    expect(cartao).not.toContain('EcoSunPower');
    const hCasa = renderLayout({ active: 'home', title: 'X', body: '', user: { ...junior, roleNome: '' } });
    const cartaoCasa = hCasa.slice(hCasa.indexOf('class="cc-me"'), hCasa.indexOf('</form>', hCasa.indexOf('class="cc-me"')));
    expect(cartaoCasa).toContain('EcoSunPower');
  });

  it('selos (badges) aparecem no grupo', () => {
    const h = renderLayout({ active: 'home', title: 'X', body: '', user: junior, selos: { usinas: { valor: 6, tom: 'critico' } } });
    expect(h).toMatch(/Usinas<span class="cc-bdg cc-bdg-r">6<\/span>/);
  });

  it('largo tira o limite de largura (telas do Command Center)', () => {
    expect(renderLayout({ active: 'command_center', title: 'X', body: '', largo: true })).toContain('cc-main cc-largo');
    expect(renderLayout({ active: 'home', title: 'X', body: '' })).not.toContain('class="cc-main cc-largo"');
  });

  it('tenant: cor da marca no item ativo, sem logo/CNPJ da EcoSun, sem Command Center da casa', () => {
    const h = renderLayout({ active: 'monitoramento', title: 'X', body: '', user: tenant });
    expect(h).toContain('--marca:');
    expect(h).not.toContain('alt="EcoSunPower"');
    expect(h).not.toContain('33.020.459');
    expect(h).toContain('Sabion Solar');
    expect(h).not.toContain('href="/dashboard/command-center"');
  });

  it('tenant: módulo não contratado aparece com cadeado e leva à vitrine', () => {
    const h = renderLayout({ active: 'monitoramento', title: 'X', body: '', user: tenant });
    expect(h).toContain('/dashboard/conhecer/marketing');
    expect(h).not.toContain('href="/dashboard/marketing"');
  });

  it('título escapado', () => {
    expect(renderLayout({ active: 'home', title: '<x>', body: '' })).toContain('&lt;x&gt; · EcoSun Dashboard');
  });
});
