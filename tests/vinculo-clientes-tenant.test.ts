// tests/vinculo-clientes-tenant.test.ts
//
// Vazamento achado pelo Junior na degustação Sabion 27/07 (o pior da noite):
// o seletor de proprietário da usina busca em /dashboard/api/clientes/search,
// que rodava SEM filtro de empresa — o tenant via nome/telefone/cidade dos
// clientes da ECOSUN. E as páginas de detalhe/editar da usina abriam pra
// qualquer logado (sem checar a empresa dona) e montavam o layout SEM o
// usuário (menu completo + marca EcoSun pro tenant).
// Regras novas:
//  - searchClientesParaVinculo exige companyId e filtra por ele (sem = [])
//  - usinaPertenceAoOperador: null na usina = EcoSun legado; operador ausente
//    = nega (fail-closed)
//  - paginas de monitoramento recebem o user → menu/marca certos

import { describe, it, expect } from 'vitest';
import { SupabaseService } from '../src/modules/supabase.js';
import { usinaPertenceAoOperador } from '../src/modules/dashboard/permissions.js';
import { renderEditarSistemaPage } from '../src/modules/dashboard/views.js';
import type { SupabaseClient } from '@supabase/supabase-js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const SABION = 'aaaa1111-2222-3333-4444-555566667777';

describe('searchClientesParaVinculo — busca sempre presa à empresa do operador', () => {
  function fakeClient() {
    const eqCalls: Array<[string, unknown]> = [];
    let fromChamado = 0;
    const builder: any = {
      select: () => builder,
      or: () => builder,
      neq: () => builder,
      eq: (col: string, val: unknown) => { eqCalls.push([col, val]); return builder; },
      order: () => builder,
      limit: async () => ({ data: [], error: null }),
    };
    const client = {
      from: () => { fromChamado++; return builder; },
    } as unknown as SupabaseClient;
    return { client, eqCalls, foiAoBanco: () => fromChamado > 0 };
  }

  function servico(client: SupabaseClient): SupabaseService {
    return new SupabaseService(
      { supabaseUrl: 'http://localhost', supabaseServiceKey: 'test-key' },
      client,
    );
  }

  it('aplica eq(company_id) da empresa do operador', async () => {
    const { client, eqCalls } = fakeClient();

    await servico(client).searchClientesParaVinculo('maria', SABION);

    expect(eqCalls).toContainEqual(['company_id', SABION]);
  });

  it('sem companyId retorna [] SEM ir ao banco (fail-closed)', async () => {
    const { client, foiAoBanco } = fakeClient();

    const r1 = await servico(client).searchClientesParaVinculo('maria', null);
    const r2 = await servico(client).searchClientesParaVinculo('maria', undefined);

    expect(r1).toEqual([]);
    expect(r2).toEqual([]);
    expect(foiAoBanco()).toBe(false);
  });
});

describe('usinaPertenceAoOperador — usina só abre pra empresa dona', () => {
  it('mesma empresa: pode', () => {
    expect(usinaPertenceAoOperador(SABION, SABION)).toBe(true);
  });

  it('empresa diferente: nega', () => {
    expect(usinaPertenceAoOperador(SABION, ECOSUN)).toBe(false);
    expect(usinaPertenceAoOperador(ECOSUN, SABION)).toBe(false);
  });

  it('usina sem carimbo (legado) pertence à EcoSun', () => {
    expect(usinaPertenceAoOperador(null, ECOSUN)).toBe(true);
    expect(usinaPertenceAoOperador(null, SABION)).toBe(false);
  });

  it('operador sem empresa: nega (fail-closed)', () => {
    expect(usinaPertenceAoOperador(SABION, undefined)).toBe(false);
    expect(usinaPertenceAoOperador(null, undefined)).toBe(false);
  });
});

describe('renderEditarSistemaPage — layout com o usuário (menu/marca do tenant)', () => {
  const USINA = {
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeffff0001',
    company_id: SABION,
    lead_id: null,
    apelido: 'Antônio Carlos - Fazenda',
    marca_inversor: 'foxess' as const,
    api_credentials: {},
    potencia_kwp: null,
    data_instalacao: null,
    cidade: null,
    uf: null,
    ativo: true,
    ultima_sincronizacao: null,
    ultimo_erro: null,
  };

  const THIAGO = {
    id: 'u1', companyId: SABION,
    nome: 'Thiago', login: 'thiago-sabion', isAdmin: false,
    roleNome: 'Monitoramento',
    permissoes: { usinas: ['visualizar' as const, 'editar' as const] },
    companyNome: 'Sabion Solar',
  };

  it('com user do tenant: sem itens soltos da casa e com a marca dele', () => {
    const html = renderEditarSistemaPage(USINA, null, THIAGO);
    expect(html).not.toContain('Cockpit');
    expect(html).not.toContain('Manutenção');
    expect(html).toContain('Sabion Solar');
  });
});
