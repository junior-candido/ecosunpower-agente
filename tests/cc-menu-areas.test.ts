// Menu novo por ÁREA (Command Center, fase A). Regras:
//  - nenhuma rota antiga some do menu (nada se perde);
//  - chaves únicas;
//  - gating idêntico ao de antes (vitrine: visível / bloqueado / escondido);
//  - grupo sem item visível não aparece; grupo com o item ativo vem aberto.
import { describe, it, expect } from 'vitest';
import { MENU_AREAS, montarMenu, ehChaveDeMenu } from '../src/modules/dashboard/menu-areas.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const TENANT = 'aaaa1111-2222-3333-4444-555566667777';

// Todas as rotas que estavam no menu antigo (SIDEBAR_SETORES até 27/09/2026),
// com o gating de cada uma copiado de lá (git show main:src/modules/dashboard/views.ts).
// O menu novo pode mudar rótulo e grupo, mas NÃO o gating.
interface Legado { href: string; key: string; area?: string; nivel?: string; soEcosun?: boolean; soTenant?: boolean }
const ITENS_ANTIGOS_TODOS: Legado[] = [
  { href: '/dashboard/home', key: 'home' },
  { href: '/dashboard/cockpit', key: 'cockpit' },
  { href: '/dashboard/cerebro', key: 'cerebro', area: 'relatorios', soEcosun: true },
  { href: '/dashboard/predio', key: 'predio', soEcosun: true },
  { href: '/dashboard/vendas/fechar', key: 'fechar_venda' },
  { href: '/dashboard/contratos', key: 'contratos' },
  { href: '/dashboard/leads', key: 'leads', area: 'leads' },
  { href: '/dashboard/recados', key: 'recados', area: 'leads' },
  { href: '/dashboard/conhecimento', key: 'conhecimento', area: 'leads' },
  { href: '/dashboard/leads/kanban', key: 'kanban', area: 'leads' },
  { href: '/dashboard/clientes', key: 'clientes', soEcosun: true },
  { href: '/dashboard/propostas', key: 'propostas', area: 'propostas' },
  { href: '/dashboard/lojas', key: 'lojas' },
  { href: '/dashboard/marketing', key: 'marketing', area: 'marketing' },
  { href: '/dashboard/marketing/blog', key: 'blog', area: 'marketing' },
  { href: '/dashboard/marketing/email', key: 'email', area: 'marketing' },
  { href: '/dashboard/cadencia', key: 'cadencia', area: 'marketing' },
  { href: '/dashboard/monitoramento', key: 'monitoramento', area: 'usinas' },
  { href: '/dashboard/demonstrativos', key: 'demonstrativos', area: 'usinas' },
  { href: '/dashboard/medicao', key: 'medicao', area: 'usinas' },
  { href: '/dashboard/minha-assinatura', key: 'minha_assinatura', area: 'usinas', soTenant: true },
  { href: '/dashboard/usinas/kanban', key: 'usinas_kanban', area: 'usinas' },
  { href: '/dashboard/pos-venda', key: 'pos_venda', area: 'usinas' },
  { href: '/dashboard/pastas', key: 'pastas', area: 'usinas' },
  { href: '/dashboard/servicos', key: 'servicos', area: 'servicos' },
  { href: '/dashboard/manutencao', key: 'manutencao' },
  { href: '/dashboard/financeiro', key: 'financeiro', area: 'financeiro' },
  { href: '/dashboard/fiscal', key: 'fiscal', area: 'financeiro' },
  { href: '/dashboard/cobrar', key: 'cobrar', area: 'financeiro' },
  // 28/09/2026 (cobrança recorrente): Assinaturas virou SÓ da casa (mudança deliberada).
  { href: '/dashboard/assinaturas', key: 'assinaturas', area: 'financeiro', soEcosun: true },
  { href: '/dashboard/rh/candidatos', key: 'rh_candidatos', area: 'rh' },
  { href: '/dashboard/rh/vagas', key: 'rh_vagas', area: 'rh' },
  { href: '/dashboard/rh/busca', key: 'rh_busca', area: 'rh' },
  { href: '/dashboard/usuarios', key: 'usuarios', area: 'usuarios' },
  { href: '/dashboard/whatsapp', key: 'whatsapp', area: 'usuarios', nivel: 'administrar', soTenant: true },
  { href: '/dashboard/empresas', key: 'empresas', area: 'usuarios', nivel: 'administrar', soEcosun: true },
];

// TROCA DELIBERADA (renovação do miolo R5, decisão D2 = a — ok do Junior no PR):
// exceções documentadas da regra "nada se perde". Cada uma diz por quê e onde
// a rota continua viva.
const APOSENTADOS_DO_MENU: Record<string, string> = {
  '/dashboard/cockpit': 'aposentado no R5 (a entrada virou o Command Center); a rota /cockpit continua viva, só da casa, com o link "Cockpit antigo" no rodapé do Command Center',
};
const ITENS_ANTIGOS = ITENS_ANTIGOS_TODOS.filter((i) => !(i.href in APOSENTADOS_DO_MENU));

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
    for (const { href } of ITENS_ANTIGOS) expect(hrefs.has(href), href).toBe(true);
  });

  it('só os aposentados documentados saíram do menu (e saíram mesmo)', () => {
    const hrefs = new Set(itens.map((i) => i.href));
    for (const href of Object.keys(APOSENTADOS_DO_MENU)) expect(hrefs.has(href), href).toBe(false);
    expect(ITENS_ANTIGOS_TODOS.length - ITENS_ANTIGOS.length).toBe(Object.keys(APOSENTADOS_DO_MENU).length);
  });

  it('cada item antigo mantém chave e gating idênticos (area, nivel, soEcosun, soTenant)', () => {
    for (const antigo of ITENS_ANTIGOS) {
      const novo = itens.find((i) => i.href === antigo.href);
      expect(novo, antigo.href).toBeDefined();
      expect({
        href: novo!.href, key: novo!.key, area: novo!.area, nivel: novo!.nivel,
        soEcosun: Boolean(novo!.soEcosun), soTenant: Boolean(novo!.soTenant),
      }, antigo.href).toEqual({
        href: antigo.href, key: antigo.key, area: antigo.area, nivel: antigo.nivel,
        soEcosun: Boolean(antigo.soEcosun), soTenant: Boolean(antigo.soTenant),
      });
    }
  });

  it('inclui o Command Center novo', () => {
    expect(itens.some((i) => i.href === '/dashboard/command-center' && i.key === 'command_center')).toBe(true);
  });

  it('inclui a Central de Atenção (fase B) no grupo Command Center', () => {
    const cc = MENU_AREAS.find((g) => g.id === 'command_center')!;
    // TROCA DELIBERADA (R5, D2 = a): o Cockpit saiu do grupo.
    expect(cc.itens.map((i) => i.key)).toEqual(['command_center', 'atencao', 'home', 'predio']);
    expect(cc.itens.find((i) => i.key === 'atencao')!.href).toBe('/dashboard/atencao');
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
    // TROCA DELIBERADA (R5, D2 = a): o Cockpit saiu do menu (a casa vê o resto).
    expect(keys).not.toContain('cockpit');
    expect(keys).toContain('home');
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
    // Command Center e Central de Atenção abriram pro tenant (dado escopado + vitrine);
    // o resto do grupo (Visão geral, Cockpit, Prédio Vivo) continua da casa.
    expect(m.find((g) => g.id === 'command_center')!.itens.map((i) => i.key)).toEqual(['command_center', 'atencao']);
  });

  it('abertoATenant: Command Center e Central visíveis pro tenant, sem área falsa', () => {
    const itens = MENU_AREAS.flatMap((g) => g.itens);
    for (const k of ['command_center', 'atencao']) {
      const it = itens.find((i) => i.key === k)!;
      expect(it.abertoATenant, k).toBe(true);
      expect(it.area, k).toBeUndefined();
    }
    // Só esses dois: Modo TV/Cockpit/Visão geral seguem da casa.
    expect(itens.filter((i) => i.abertoATenant).map((i) => i.key)).toEqual(['command_center', 'atencao']);
    const semNada = { companyId: TENANT, isAdmin: false, permissoes: {} };
    const m = montarMenu(semNada, 'command_center', ECOSUN, pode);
    const cc = m.find((g) => g.id === 'command_center')!;
    expect(cc.itens.every((i) => i.estado === 'visivel')).toBe(true);
    expect(cc.trancado).toBe(false);
    // EcoSun continua vendo tudo do grupo
    // TROCA DELIBERADA (R5, D2 = a): 4 itens — o Cockpit saiu do grupo.
    expect(montarMenu(adminEcosun, 'home', ECOSUN, pode).find((g) => g.id === 'command_center')!.itens).toHaveLength(4);
  });

  it('tenant não vê o nome da assistente da casa no menu', () => {
    const tit = (u: typeof thiago | typeof adminEcosun) => montarMenu(u, 'home', ECOSUN, pode).find((g) => g.id === 'ia')?.titulo;
    expect(tit(adminEcosun)).toBe('IA · Eva');
    expect(tit({ ...thiago, permissoes: { leads: ['visualizar'] } })).toBe('IA · Assistente');
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
