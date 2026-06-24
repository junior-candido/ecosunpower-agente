// tests/dashboard-permissions.test.ts
import { describe, it, expect } from 'vitest';
import { can, type DashUser } from '../src/modules/dashboard/permissions.js';

const admin: DashUser = {
  id: 'u1', companyId: 'c1', nome: 'Junior', login: 'admin',
  isAdmin: true, roleNome: 'Administrador', permissoes: {},
};
const comercial: DashUser = {
  id: 'u2', companyId: 'c1', nome: 'Ana', login: 'ana',
  isAdmin: false, roleNome: 'Comercial',
  permissoes: { leads: ['visualizar', 'criar', 'editar', 'exportar'], usinas: ['visualizar'] },
};

describe('can() — permissão por área e nível', () => {
  it('admin pode tudo', () => {
    expect(can(admin, 'financeiro', 'excluir')).toBe(true);
    expect(can(admin, 'usuarios', 'administrar')).toBe(true);
  });
  it('comercial pode o que o papel lista', () => {
    expect(can(comercial, 'leads', 'editar')).toBe(true);
    expect(can(comercial, 'usinas', 'visualizar')).toBe(true);
  });
  it('comercial NÃO pode o que não está no papel', () => {
    expect(can(comercial, 'financeiro', 'visualizar')).toBe(false);
    expect(can(comercial, 'leads', 'excluir')).toBe(false);
    expect(can(comercial, 'usinas', 'editar')).toBe(false);
  });
  it('"administrar" numa área concede todos os níveis daquela área', () => {
    const gerente: DashUser = { ...comercial, permissoes: { relatorios: ['administrar'] } };
    expect(can(gerente, 'relatorios', 'exportar')).toBe(true);
    expect(can(gerente, 'relatorios', 'excluir')).toBe(true);
    expect(can(gerente, 'leads', 'visualizar')).toBe(false);
  });
  it('usuário nulo não pode nada', () => {
    expect(can(null, 'leads', 'visualizar')).toBe(false);
  });
});
