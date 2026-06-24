// tests/dashboard-lead-visibility.test.ts
import { describe, it, expect } from 'vitest';
import { podeVerLead } from '../src/modules/dashboard/leads-queries.js';
import type { DashUser } from '../src/modules/dashboard/permissions.js';

const admin: DashUser = { id: 'a', companyId: 'c', nome: 'J', login: 'admin', isAdmin: true, roleNome: 'Administrador', permissoes: {} };
const ana: DashUser = { id: 'ana', companyId: 'c', nome: 'Ana', login: 'ana', isAdmin: false, roleNome: 'Comercial', permissoes: { leads: ['visualizar', 'editar'] } };
const leo: DashUser = { ...ana, id: 'leo', login: 'leo' };

describe('podeVerLead — pool + claim', () => {
  it('admin vê qualquer lead', () => {
    expect(podeVerLead(admin, { claimed_by: 'leo' })).toBe(true);
  });
  it('vendedor vê lead no balcão (claimed_by null)', () => {
    expect(podeVerLead(ana, { claimed_by: null })).toBe(true);
  });
  it('vendedor vê o próprio lead', () => {
    expect(podeVerLead(ana, { claimed_by: 'ana' })).toBe(true);
  });
  it('vendedor NÃO vê lead de outro vendedor', () => {
    expect(podeVerLead(ana, { claimed_by: 'leo' })).toBe(false);
  });
});
