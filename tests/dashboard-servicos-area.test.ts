// Diário de Serviços F1 — área de permissão nova 'servicos': o papel "Campo"
// enxerga SÓ ela (segurança pro terceiro, pergunta do Junior 29/07).
import { describe, it, expect } from 'vitest';
import { AREAS, can } from '../src/modules/dashboard/permissions.js';
import type { DashUser } from '../src/modules/dashboard/permissions.js';

describe("área 'servicos'", () => {
  it('existe na lista de áreas (aparece no editor de papéis sozinha)', () => {
    expect(AREAS).toContain('servicos');
  });
  it('papel Campo (só servicos) registra serviço mas NÃO vê leads/financeiro', () => {
    const campo = {
      id: 'u1', companyId: 'c-ecosun', nome: 'Instalador', login: 'campo',
      isAdmin: false, roleNome: 'Campo',
      permissoes: { servicos: ['visualizar', 'criar'] },
    } as unknown as DashUser;
    expect(can(campo, 'servicos', 'visualizar')).toBe(true);
    expect(can(campo, 'servicos', 'criar')).toBe(true);
    expect(can(campo, 'leads', 'visualizar')).toBe(false);
    expect(can(campo, 'financeiro', 'visualizar')).toBe(false);
  });
});
