// Menu novo por ÁREA (Command Center, fase A). Regras:
//  - nenhuma rota antiga some do menu (nada se perde);
//  - chaves únicas;
//  - gating idêntico ao de antes (vitrine: visível / bloqueado / escondido);
//  - grupo sem item visível não aparece; grupo com o item ativo vem aberto.
import { describe, it, expect } from 'vitest';
import { MENU_AREAS, montarMenu, ehChaveDeMenu } from '../src/modules/dashboard/menu-areas.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const TENANT = 'aaaa1111-2222-3333-4444-555566667777';

// Todas as rotas que estavam no menu antigo (SIDEBAR_SETORES até 27/09/2026).
const HREFS_ANTIGOS = [
  '/dashboard/home', '/dashboard/cockpit', '/dashboard/cerebro', '/dashboard/predio',
  '/dashboard/vendas/fechar', '/dashboard/contratos', '/dashboard/leads', '/dashboard/recados',
  '/dashboard/conhecimento', '/dashboard/leads/kanban', '/dashboard/clientes', '/dashboard/propostas',
  '/dashboard/lojas', '/dashboard/marketing', '/dashboard/marketing/blog', '/dashboard/marketing/email',
  '/dashboard/cadencia', '/dashboard/monitoramento', '/dashboard/demonstrativos', '/dashboard/medicao',
  '/dashboard/minha-assinatura', '/dashboard/usinas/kanban', '/dashboard/pos-venda', '/dashboard/pastas',
  '/dashboard/servicos', '/dashboard/manutencao', '/dashboard/financeiro', '/dashboard/fiscal',
  '/dashboard/cobrar', '/dashboard/assinaturas', '/dashboard/rh/candidatos', '/dashboard/rh/vagas',
  '/dashboard/rh/busca', '/dashboard/usuarios', '/dashboard/whatsapp', '/dashboard/empresas',
];

// can() simplificado: admin pode tudo; senão olha as permissões.
const pode = (u: never, area: string) => {
  const user = u as unknown as { isAdmin?: boolean; permissoes?: Record<string, string[]> };
  return Boolean(user.isAdmin || user.permissoes?.[area]?.length);
};

const adminEcosun = { companyId: ECOSUN, isAdmin: true, permissoes: {} };
const thiago = { companyId: TENANT, isAdmin: false, permissoes: { usinas: ['visualizar'] } };

describe('MENU_AREAS — nada se perde', () => {
  const itens = MENU_AREAS.flatMap((g) => g.itens);

  it('todas as rotas do menu antigo continuam no menu novo', () => {
    const hrefs = new Set(itens.map((i) => i.href));
    for (const h of HREFS_ANTIGOS) expect(hrefs.has(h), h).toBe(true);
  });

  it('inclui o Command Center novo', () => {
    expect(itens.some((i) => i.href === '/dashboard/command-center' && i.key === 'command_center')).toBe(true);
  });

  it('chaves e hrefs são únicos', () => {
    expect(new Set(itens.map((i) => i.key)).size).toBe(itens.length);
    expect(new Set(itens.map((i) => i.href)).size).toBe(itens.length);
  });

  it('grupos seguem a ordem da IA aprovada', () => {
    const titulos = MENU_AREAS.map((g) => g.titulo);
    expect(titulos.slice(0, 8)).toEqual([
      'Command Center', 'Comercial / CRM', 'Marketing', 'Usinas', 'Instalações', 'O&M', 'Financeiro', 'Clientes',
    ]);
    expect(titulos).toContain('IA · Eva');
    expect(titulos[titulos.length - 1]).toBe('Configurações');
  });

  it('ehChaveDeMenu reconhece só chaves reais', () => {
    expect(ehChaveDeMenu('marketing')).toBe(true);
    expect(ehChaveDeMenu('nao-existe')).toBe(false);
  });
});

describe('montarMenu — permissões e estado', () => {
  it('EcoSun admin vê tudo que é da casa e nada exclusivo de tenant', () => {
    const m = montarMenu(adminEcosun, 'leads', ECOSUN, pode);
    const keys = m.flatMap((g) => g.itens.map((i) => i.key));
    expect(keys).toContain('cockpit');
    expect(keys).toContain('empresas');
    expect(keys).not.toContain('minha_assinatura');
    expect(keys).not.toContain('whatsapp');
  });

  it('grupo com o item ativo vem aberto e marcado; os outros fechados', () => {
    const m = montarMenu(adminEcosun, 'cadencia', ECOSUN, pode);
    const mkt = m.find((g) => g.id === 'marketing')!;
    expect(mkt.aberto).toBe(true);
    expect(mkt.ativo).toBe(true);
    expect(mkt.itens.find((i) => i.key === 'cadencia')!.ativo).toBe(true);
    expect(m.find((g) => g.id === 'comercial')!.aberto).toBe(false);
  });

  it('tenant: item sem área some; módulo não contratado aparece bloqueado', () => {
    const m = montarMenu(thiago, 'monitoramento', ECOSUN, pode);
    const todos = m.flatMap((g) => g.itens);
    expect(todos.find((i) => i.key === 'cockpit')).toBeUndefined();
    expect(todos.find((i) => i.key === 'clientes')).toBeUndefined(); // soEcosun
    expect(todos.find((i) => i.key === 'monitoramento')!.estado).toBe('visivel');
    expect(todos.find((i) => i.key === 'marketing')!.estado).toBe('bloqueado');
    // grupo Command Center inteiro é conveniência da casa → some pro tenant
    expect(m.find((g) => g.id === 'command_center')).toBeUndefined();
  });

  it('grupo em que tudo está bloqueado fica marcado como trancado', () => {
    const m = montarMenu(thiago, 'monitoramento', ECOSUN, pode);
    expect(m.find((g) => g.id === 'marketing')!.trancado).toBe(true);
    expect(m.find((g) => g.id === 'usinas')!.trancado).toBe(false);
  });

  it('sem usuário (tela legada): mostra tudo que não é exclusivo de tenant', () => {
    const m = montarMenu(undefined, 'home', ECOSUN, pode);
    const keys = m.flatMap((g) => g.itens.map((i) => i.key));
    expect(keys).toContain('leads');
    expect(keys).not.toContain('minha_assinatura');
  });

  it('selos (badges) entram no grupo certo', () => {
    const m = montarMenu(adminEcosun, 'home', ECOSUN, pode, { usinas: { valor: 6, tom: 'critico' } });
    expect(m.find((g) => g.id === 'usinas')!.selo).toEqual({ valor: 6, tom: 'critico' });
    expect(m.find((g) => g.id === 'comercial')!.selo).toBeUndefined();
  });
});
