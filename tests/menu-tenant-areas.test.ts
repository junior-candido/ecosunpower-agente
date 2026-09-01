// tests/menu-tenant-areas.test.ts
//
// Achado na degustação Sabion 27/07 (3º da noite): itens de menu SEM área
// ("Visão geral", "Cockpit", "Fechou!", "Contratos", "Manutenção") aparecem
// pra TODO MUNDO — desenho de quando só existia a EcoSun. Pro tenant isso é
// menu poluído com conveniência da casa.
// Regra nova (pedido do Junior: "tinha que vir só Operação; as outras quando
// for solicitado"): usuário de TENANT só vê item com ÁREA explícita que o
// papel dele permite. Liberar módulo novo = editar o papel (sem deploy).
// EcoSun: comportamento de sempre, byte a byte.

import { describe, it, expect } from 'vitest';
import { renderMonitoramentoPage } from '../src/modules/dashboard/views.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';

const THIAGO = {
  id: 'u1', companyId: 'aaaa1111-2222-3333-4444-555566667777',
  nome: 'Thiago', login: 'thiago-sabion', isAdmin: false,
  roleNome: 'Monitoramento', permissoes: { usinas: ['visualizar' as const] },
  companyNome: 'Sabion Solar',
};

const ECOSUN_OPERADOR = {
  ...THIAGO,
  id: 'u2', companyId: ECOSUN, login: 'junior', nome: 'Junior',
  companyNome: undefined,
};

function sidebarDe(user: typeof THIAGO): string {
  return renderMonitoramentoPage([], {}, undefined, undefined, undefined, user);
}

describe('menu lateral — tenant só vê áreas explícitas do papel', () => {
  it('tenant com usinas:visualizar vê Monitoramento e Pós-venda', () => {
    const html = sidebarDe(THIAGO);
    expect(html).toContain('Monitoramento');
    expect(html).toContain('Pós-venda');
    expect(html).toContain('Kanban de Obras');
  });

  it('tenant NÃO vê itens soltos (sem área) da casa', () => {
    const html = sidebarDe(THIAGO);
    expect(html).not.toContain('Cockpit');
    expect(html).not.toContain('Fechou!');
    expect(html).not.toContain('Contratos &amp; Procurações');
    expect(html).not.toContain('Manutenção');
  });

  // MUDOU EM 01/09/2026 (vitrine, pedido do Junior): modulo que o tenant nao
  // tem deixou de SUMIR e passou a aparecer APAGADO COM CADEADO, levando a uma
  // apresentacao do modulo. "O que ele nao ve, ele nao compra." A trava de
  // acesso continua no servidor — a vitrine e so a porta.
  it('tenant sem marketing VÊ o item, mas bloqueado e sem link pra tela real', () => {
    const html = sidebarDe(THIAGO);
    expect(html).toContain('Campanhas');           // aparece
    expect(html).toContain('🔒');                   // com cadeado
    expect(html).toContain('/dashboard/conhecer/'); // leva à apresentação
    expect(html).not.toContain('href="/dashboard/marketing"'); // NÃO leva à tela real
  });

  it('EcoSun continua vendo os itens soltos de sempre (nada muda pra casa)', () => {
    const html = sidebarDe(ECOSUN_OPERADOR);
    expect(html).toContain('Cockpit');
    expect(html).toContain('Manutenção');
    expect(html).toContain('Monitoramento');
  });
});

describe('painel de triagem — TEMA CLARO pro tenant (pedido do Thiago 27/07)', () => {
  it('tenant: tela clara (cards brancos), sem o fundo escuro', () => {
    const html = sidebarDe(THIAGO);
    expect(html).toContain('bg-white');
    expect(html).not.toContain('bg-slate-800/60');
  });

  it('EcoSun: tela escura de sempre, byte a byte', () => {
    const html = sidebarDe(ECOSUN_OPERADOR);
    expect(html).toContain('bg-slate-800/60');
  });
});
