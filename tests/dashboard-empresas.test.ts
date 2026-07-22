// Fase 2 / MVP Sabion — fatia A1 (provisionar tenant) + A2 (marca por empresa).
// Spec: docs/ecosof/07-fase2-tenant2.md.
import { describe, it, expect } from 'vitest';
import { criarEmpresaComAdmin, listCompaniesComUsuarios } from '../src/modules/dashboard/empresas-store.js';
import { renderEmpresasPage } from '../src/modules/dashboard/empresas-views.js';
import { renderLayout } from '../src/modules/dashboard/views.js';
import type { DashUser } from '../src/modules/dashboard/permissions.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const SABION = '33333333-3333-4333-8333-333333333333';

// Mock chainable do supabase-js: grava os inserts por tabela e devolve as
// respostas programadas na ordem (mesmo estilo dos mocks das fatias 3a-3e).
function mockClient(respostas: Record<string, any[]>) {
  const inserts: Record<string, any[]> = {};
  const deletes: string[] = [];
  const client = {
    from(tabela: string) {
      const resposta = () => (respostas[tabela] ?? []).shift() ?? { data: null, error: null };
      const chain: any = {
        insert(row: any) { (inserts[tabela] ??= []).push(row); return chain; },
        delete() { deletes.push(tabela); return chain; },
        select() { return chain; },
        order() { return chain; },
        eq() { return chain; },
        single() { return Promise.resolve(resposta()); },
        maybeSingle() { return Promise.resolve(resposta()); },
        then(res: any, rej: any) { return Promise.resolve(resposta()).then(res, rej); },
      };
      return chain;
    },
  };
  return { client: client as any, inserts, deletes };
}

describe('A1 — criarEmpresaComAdmin (empresa + papel Administrador + 1º usuário)', () => {
  it('feliz: cria os 3 na ordem e devolve os ids', async () => {
    const { client, inserts } = mockClient({
      companies: [{ data: { id: SABION }, error: null }],
      dashboard_roles: [{ data: { id: 'role-1' }, error: null }],
      dashboard_users: [{ data: { id: 'user-1' }, error: null }],
    });
    const r = await criarEmpresaComAdmin(client, {
      nome: 'Sabion Solar', adminNome: 'Thiago Sabion', adminLogin: 'thiago', senhaHash: 'hash123',
    });
    expect(r).toEqual({ companyId: SABION, roleId: 'role-1', userId: 'user-1' });
    expect(inserts.companies?.[0]).toMatchObject({ nome: 'Sabion Solar', ativo: true });
    expect(inserts.dashboard_roles?.[0]).toMatchObject({
      company_id: SABION, nome: 'Administrador', is_admin: true,
    });
    expect(inserts.dashboard_users?.[0]).toMatchObject({
      company_id: SABION, nome: 'Thiago Sabion', login: 'thiago',
      senha_hash: 'hash123', role_id: 'role-1', ativo: true,
    });
  });

  it('empresa falhou → erro e NADA mais é inserido', async () => {
    const { client, inserts } = mockClient({
      companies: [{ data: null, error: { message: 'boom' } }],
    });
    const r = await criarEmpresaComAdmin(client, {
      nome: 'X', adminNome: 'A', adminLogin: 'a', senhaHash: 'h',
    });
    expect('error' in r).toBe(true);
    expect(inserts.dashboard_roles).toBeUndefined();
    expect(inserts.dashboard_users).toBeUndefined();
  });

  it('usuário falhou → erro é devolvido (empresa/papel ficam pra retomada manual, sem 500 sem contexto)', async () => {
    const { client } = mockClient({
      companies: [{ data: { id: SABION }, error: null }],
      dashboard_roles: [{ data: { id: 'role-1' }, error: null }],
      dashboard_users: [{ data: null, error: { code: '23505', message: 'dup' } }],
    });
    const r = await criarEmpresaComAdmin(client, {
      nome: 'X', adminNome: 'A', adminLogin: 'a', senhaHash: 'h',
    });
    expect('error' in r && (r as any).error).toContain('login');
  });
});

describe('A1 — listCompaniesComUsuarios', () => {
  it('mapeia contagem de usuários (embed count)', async () => {
    const { client } = mockClient({
      companies: [{ data: [
        { id: ECOSUN, nome: 'EcoSunPower', ativo: true, created_at: '2025-01-01', dashboard_users: [{ count: 4 }] },
        { id: SABION, nome: 'Sabion Solar', ativo: true, created_at: '2026-07-22', dashboard_users: [{ count: 1 }] },
      ], error: null }],
    });
    const lista = await listCompaniesComUsuarios(client);
    expect(lista).toHaveLength(2);
    expect(lista[1]).toMatchObject({ nome: 'Sabion Solar', usuarios: 1 });
  });
});

const adminEcosun: DashUser = {
  id: 'u1', companyId: ECOSUN, nome: 'Junior', login: 'junior',
  isAdmin: true, roleNome: 'Administrador', permissoes: {}, companyNome: 'EcoSunPower',
};
const adminSabion: DashUser = {
  id: 'u2', companyId: SABION, nome: 'Thiago', login: 'thiago',
  isAdmin: true, roleNome: 'Administrador', permissoes: {}, companyNome: 'Sabion Solar',
};

describe('A1 — página de empresas', () => {
  it('lista as empresas e tem o formulário de provisionar', () => {
    const html = renderEmpresasPage([
      { id: ECOSUN, nome: 'EcoSunPower', ativo: true, createdAt: '2025-01-01', usuarios: 4 },
      { id: SABION, nome: 'Sabion Solar', ativo: true, createdAt: '2026-07-22', usuarios: 1 },
    ], adminEcosun);
    expect(html).toContain('Sabion Solar');
    expect(html).toContain('EcoSunPower');
    expect(html).toContain('/dashboard/empresas/nova');
    expect(html).toContain('name="admin_login"');
  });
});

describe('A1 — login multi-empresa (getUserByLoginTodasEmpresas)', () => {
  it('devolve candidatos com EcoSun PRIMEIRO (comportamento do login da EcoSun não muda)', async () => {
    const rowSabion = {
      id: 'u-sab', company_id: SABION, nome: 'Thiago', login: 'admin',
      senha_hash: 'h-sab', role_id: null, ativo: true, companies: { nome: 'Sabion Solar' },
    };
    const rowEcosun = {
      id: 'u-eco', company_id: ECOSUN, nome: 'Junior', login: 'admin',
      senha_hash: 'h-eco', role_id: null, ativo: true, companies: { nome: 'EcoSunPower' },
    };
    // banco devolve Sabion antes — a função tem que reordenar EcoSun primeiro
    const { client } = mockClient({
      dashboard_users: [{ data: [rowSabion, rowEcosun], error: null }],
    });
    const { getUserByLoginTodasEmpresas } = await import('../src/modules/dashboard/users-store.js');
    const candidatos = await getUserByLoginTodasEmpresas(client, 'admin');
    expect(candidatos).toHaveLength(2);
    expect(candidatos[0]!.user.companyId).toBe(ECOSUN);
    expect(candidatos[1]!.user.companyId).toBe(SABION);
    expect(candidatos[1]!.user.companyNome).toBe('Sabion Solar');
    expect(candidatos[1]!.senhaHash).toBe('h-sab');
  });
});

describe('A2 — marca do dashboard pelo company da sessão', () => {
  it('EcoSun: layout IGUAL ao de sempre (logo + rodapé com CNPJ)', () => {
    const html = renderLayout({ active: 'home', title: 'Teste', body: '<p>x</p>', user: adminEcosun });
    expect(html).toContain('alt="EcoSunPower"');            // logo continua
    expect(html).toContain('CNPJ 33.020.459/0001-06');       // rodapé continua
    expect(html).toContain('EcoSun Dashboard');              // título continua
  });

  it('tenant: nome da empresa no lugar do logo, rodapé neutro, sem CNPJ da EcoSun', () => {
    const html = renderLayout({ active: 'home', title: 'Teste', body: '<p>x</p>', user: adminSabion });
    expect(html).toContain('Sabion Solar');
    expect(html).not.toContain('alt="EcoSunPower"');
    expect(html).not.toContain('CNPJ 33.020.459/0001-06');
  });

  it('sem user (telas legadas): EcoSun de sempre', () => {
    const html = renderLayout({ active: 'home', title: 'Teste', body: '<p>x</p>' });
    expect(html).toContain('alt="EcoSunPower"');
  });

  it('link Empresas: aparece pro admin da EcoSun, some pro admin do tenant', () => {
    const deEcosun = renderLayout({ active: 'home', title: 'T', body: '', user: adminEcosun });
    const deTenant = renderLayout({ active: 'home', title: 'T', body: '', user: adminSabion });
    expect(deEcosun).toContain('/dashboard/empresas');
    expect(deTenant).not.toContain('/dashboard/empresas');
  });
});
