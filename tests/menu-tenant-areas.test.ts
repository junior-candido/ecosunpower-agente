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
    expect(html).toContain('Quadro de Obras'); // 28/09: "Kanban" saiu do texto visível (Junior)
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
    // TROCA DELIBERADA (R5, D2 = a — ok do Junior no PR): o Cockpit saiu do menu;
    // a casa continua com a Visão geral e o resto dos itens soltos.
    expect(html).not.toContain('href="/dashboard/cockpit"');
    expect(html).toContain('Visão geral');
    expect(html).toContain('Manutenção');
    expect(html).toContain('Monitoramento');
  });
});

// TROCA DELIBERADA (renovação do miolo R8, 28/09/2026 — precisa do ok do Junior
// no PR): o Junior decidiu a D4 = TEMA ESCURO do Command Center em TODAS as
// telas renovadas, inclusive para o tenant. O pedido do Thiago (27/07, tenant
// claro) deixa de valer aqui. E a tela saiu do Tailwind: as classes
// 'bg-white' / 'bg-slate-800/60' não existem mais — o tema é o da casca.
// Antes: tenant → 'bg-white' e sem 'bg-slate-800/60'; EcoSun → 'bg-slate-800/60'.
describe('painel de triagem — tema escuro do Command Center para todos (D4)', () => {
  it('tenant: tela escura (D4), sem os cartões brancos do tema claro antigo', () => {
    const html = sidebarDe(THIAGO);
    expect(html).toContain('<div class="cc-shell cc-escuro">');
    expect(html).not.toContain('bg-white');
    expect(html).not.toContain('bg-slate-800/60');
  });

  it('EcoSun: tela escura de sempre', () => {
    const html = sidebarDe(ECOSUN_OPERADOR);
    expect(html).toContain('<div class="cc-shell cc-escuro">');
    expect(html).toContain('ecosun-body-dark');
  });
});
