// Chaves `active` que estavam erradas (inventário 27/09/2026): a tela acendia
// outro item do menu. Cadência acendia Campanhas; Usuários e a vitrine
// "conhecer" acendiam Visão geral; o formulário de proposta acendia Clientes.
import { describe, it, expect } from 'vitest';
import { renderCadenciaPage } from '../src/modules/dashboard/cadencia-views.js';
import { renderUsuariosListPage } from '../src/modules/dashboard/usuarios-views.js';
import { telaConhecer } from '../src/modules/dashboard/conhecer-views.js';
import type { DashUser } from '../src/modules/dashboard/permissions.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const admin: DashUser = { id: 'u', companyId: ECOSUN, nome: 'J', login: 'j', isAdmin: true, roleNome: 'Admin', permissoes: {} };
const tenant: DashUser = {
  id: 't', companyId: 'aaaa1111-2222-3333-4444-555566667777', nome: 'T', login: 't', isAdmin: false,
  roleNome: 'Monitoramento', permissoes: { usinas: ['visualizar'] }, companyNome: 'Sabion Solar',
};

const kpis = {
  total_leads: 0, templates_disparados: 0, responderam: 0, qualificando: 0, proposta_enviada: 0,
  clientes: 0, taxa_resposta_pct: null, taxa_qualificacao_pct: null, taxa_proposta_pct: null,
};

describe('item ativo do menu certo', () => {
  it('Cadência acende Cadência (não Campanhas)', () => {
    const h = renderCadenciaPage({ rows: [], kpis });
    expect(h).toMatch(/<a href="\/dashboard\/cadencia" class="cc-on"/);
    expect(h).not.toMatch(/<a href="\/dashboard\/marketing" class="cc-on"/);
  });

  it('Usuários acende Usuários', () => {
    const h = renderUsuariosListPage([], [], admin);
    expect(h).toMatch(/<a href="\/dashboard\/usuarios" class="cc-on"/);
  });

  it('vitrine acende o próprio módulo bloqueado', () => {
    const h = telaConhecer('marketing', 'Sabion Solar', tenant);
    expect(h).toContain('href="/dashboard/conhecer/marketing" class="cc-lock cc-on"');
  });

  it('vitrine com chave desconhecida não quebra', () => {
    expect(() => telaConhecer('xyz', 'Sabion Solar', tenant)).not.toThrow();
  });
});
