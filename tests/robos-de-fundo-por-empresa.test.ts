// tests/robos-de-fundo-por-empresa.test.ts
//
// Os OUTROS dois robôs que liam a tabela de leads inteira (02/09/2026).
// O digest tem arquivo próprio (digest-por-empresa.test.ts). Aqui ficam:
//
//   1. sweepStuckHotLeads (eva-alerts) — roda 1x/hora e manda alerta de lead
//      quente parado pro zap do Junior. Sem filtro de empresa, alertava sobre
//      cliente da Conquista.
//   2. getSilentLeadsWithoutCadence (supabase) — roda 1x/hora e enfileira
//      cadência. Sem filtro, enchia a fila de leads de empresa que nem dispara
//      (o disparo já era travado só na EcoSun, então nada saía — mas a fila
//      suja mascara o problema e vira vazamento no dia em que o tenant ligar).
//
// A regra dos dois é a mesma do digest: quem lê fora do contexto de uma
// mensagem TEM que dizer de qual empresa está lendo.

import { describe, it, expect } from 'vitest';
import { sweepStuckHotLeads } from '../src/modules/eva-alerts.js';
import { SupabaseService } from '../src/modules/supabase.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const CONQUISTA = '99fd46d7-60fc-49fe-918f-66587ffa3829';

/**
 * Fake do supabase-js que anota os filtros `.eq()` pedidos em cada consulta.
 * Não simula banco: prova só que o filtro da empresa foi aplicado — que era
 * exatamente o que faltava.
 */
function fakeClientQueRegistraFiltros(linhas: unknown[] = []) {
  const consultas: Array<{ tabela: string; filtros: Array<[string, unknown]> }> = [];

  const builder = (tabela: string) => {
    const registro = { tabela, filtros: [] as Array<[string, unknown]> };
    consultas.push(registro);

    const chain: Record<string, unknown> = {};
    for (const metodo of ['select', 'in', 'lt', 'gte', 'lte', 'not', 'order', 'limit', 'maybeSingle']) {
      chain[metodo] = () => chain;
    }
    chain.eq = (coluna: string, valor: unknown) => {
      registro.filtros.push([coluna, valor]);
      return chain;
    };
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: linhas, count: 0, error: null }).then(resolve);

    return chain;
  };

  return { client: { from: builder } as never, consultas };
}

function filtrouEmpresa(
  consultas: Array<{ tabela: string; filtros: Array<[string, unknown]> }>,
  companyId: string,
): boolean {
  return consultas.every((c) =>
    c.filtros.some(([coluna, valor]) => coluna === 'company_id' && valor === companyId),
  );
}

describe('sweepStuckHotLeads — o vigia de lead quente olha uma empresa só', () => {
  it('a varredura da EcoSunPower não enxerga lead de outra empresa', async () => {
    const { client, consultas } = fakeClientQueRegistraFiltros();

    await sweepStuckHotLeads(
      { client, engineerPhone: '5561996978781', sendText: async () => {}, metaWaba: null },
      { staleMinutes: 45, companyId: ECOSUN },
    );

    expect(consultas.length).toBeGreaterThan(0);
    expect(
      filtrouEmpresa(consultas, ECOSUN),
      'a varredura leu leads sem dizer de qual empresa — é por aqui que vaza',
    ).toBe(true);
  });

  it('a varredura de um tenant lê os leads DELE', async () => {
    const { client, consultas } = fakeClientQueRegistraFiltros();

    await sweepStuckHotLeads(
      { client, engineerPhone: '5561996978781', sendText: async () => {}, metaWaba: null },
      { staleMinutes: 45, companyId: CONQUISTA },
    );

    expect(filtrouEmpresa(consultas, CONQUISTA)).toBe(true);
  });
});

describe('getSilentLeadsWithoutCadence — o agendador de cadência também', () => {
  it('só enfileira leads da empresa pedida', async () => {
    const { client, consultas } = fakeClientQueRegistraFiltros();
    const service = new SupabaseService(
      { supabaseUrl: 'http://teste.local', supabaseServiceKey: 'chave-de-teste' },
      client,
    );

    await service.getSilentLeadsWithoutCadence(24, CONQUISTA);

    expect(consultas.length).toBeGreaterThan(0);
    expect(
      filtrouEmpresa(consultas, CONQUISTA),
      'o agendador leu leads sem filtro de empresa',
    ).toBe(true);
  });

  it('a EcoSunPower também é filtrada — não é "tudo que sobrou"', async () => {
    const { client, consultas } = fakeClientQueRegistraFiltros();
    const service = new SupabaseService(
      { supabaseUrl: 'http://teste.local', supabaseServiceKey: 'chave-de-teste' },
      client,
    );

    await service.getSilentLeadsWithoutCadence(24, ECOSUN);

    expect(filtrouEmpresa(consultas, ECOSUN)).toBe(true);
  });
});
