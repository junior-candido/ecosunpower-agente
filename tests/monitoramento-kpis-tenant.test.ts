// tests/monitoramento-kpis-tenant.test.ts
//
// Achado na degustação Sabion 27/07: os blocos "Alertas Proativos" e "Eva no
// mês" da tela de monitoramento são KPIs GLOBAIS da operação EcoSun (queries
// sem filtro de empresa) e VAZAVAM agregados pra tela do tenant.
// Contrato do renderer (guarda de regressão): sem os dados, os blocos NÃO
// aparecem — é assim que a rota esconde os KPIs de quem não é EcoSun.

import { describe, it, expect } from 'vitest';
import { renderMonitoramentoPage } from '../src/modules/dashboard/views.js';

const USER_TENANT = {
  id: 'u1', companyId: 'aaaa1111-2222-3333-4444-555566667777',
  nome: 'Thiago', login: 'thiago-sabion', isAdmin: false,
  roleNome: 'Monitoramento', permissoes: { usinas: ['visualizar' as const] },
  companyNome: 'Sabion Solar',
};

describe('renderMonitoramentoPage — KPIs globais escondidos sem dados (tenant)', () => {
  it('sem alertasResumo/sparkline/kpisEva os blocos globais NAO aparecem', () => {
    const html = renderMonitoramentoPage([], {}, undefined, undefined, undefined, USER_TENANT);
    expect(html).not.toContain('Alertas Proativos');
    expect(html).not.toContain('ALERTAS PROATIVOS');
    expect(html).not.toContain('Eva no mês');
    expect(html).not.toContain('EVA NO MÊS');
  });

  it('com os dados presentes os blocos aparecem (tela EcoSun de sempre)', () => {
    const html = renderMonitoramentoPage(
      [], {},
      { urgente: 35, aviso: 6, info: 12, total: 53 },
      [{ dia: '2026-07-27', enviados: 4 }],
      undefined,
      { ...USER_TENANT, companyId: '00000000-0000-0000-0000-000000000001', companyNome: undefined },
    );
    expect(html).toContain('35');
    expect(html.toLowerCase()).toContain('alertas proativos');
  });
});
