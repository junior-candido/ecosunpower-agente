// tests/alertas-despacho-tenant.test.ts
//
// Achado na degustação Sabion 27/07 (2º da noite): as 27 usinas recém-
// importadas do tenant nasceram sem geração → viraram alertas "offline" → e o
// DESPACHO entregou tudo no zap do Junior (adminPhone), porque a fila
// getAlertasParaDespachar não olha o carimbo company_id do alerta.
// Regra nova: a fila do despacho só traz alertas da CASA — company_id da
// EcoSun ou null (legado pré-multi-tenant). Alerta de tenant fica no banco
// (aparece na tela do tenant; zap do tenant é produto futuro).

import { describe, it, expect } from 'vitest';
import { SupabaseService } from '../src/modules/supabase.js';
import type { SupabaseClient } from '@supabase/supabase-js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';

function fakeClientCapturandoOr() {
  const orCalls: string[] = [];
  const builder: any = {
    select: () => builder,
    is: () => builder,
    not: () => builder,
    lte: () => builder,
    or: (expr: string) => { orCalls.push(expr); return builder; },
    order: () => builder,
    limit: async () => ({ data: [], error: null }),
    // limit é o último da cadeia — precisa ser "thenable" builder? Na
    // implementação atual o await acontece sobre o retorno de .limit().
  };
  const client = {
    from: (table: string) => {
      if (table !== 'monitoring_alerts') throw new Error(`tabela inesperada: ${table}`);
      return builder;
    },
  } as unknown as SupabaseClient;
  return { client, orCalls };
}

function servico(client: SupabaseClient): SupabaseService {
  return new SupabaseService(
    { supabaseUrl: 'http://localhost', supabaseServiceKey: 'test-key' },
    client,
  );
}

describe('getAlertasParaDespachar — só alertas da casa vão pro zap do admin', () => {
  it('a fila filtra por company_id: EcoSun ou null (legado)', async () => {
    const { client, orCalls } = fakeClientCapturandoOr();

    await servico(client).getAlertasParaDespachar('2026-07-27T18:00:00Z', 8);

    const filtroCasa = orCalls.find((e) => e.includes('company_id'));
    expect(filtroCasa).toBeTruthy();
    expect(filtroCasa).toContain('company_id.is.null');
    expect(filtroCasa).toContain(`company_id.eq.${ECOSUN}`);
  });
});
