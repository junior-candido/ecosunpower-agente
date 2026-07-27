// tests/leadgen-resiliencia.test.ts
//
// TDD do conserto "lead perdido por soluco de rede" (caso Adriana 27/07):
// o INSERT em meta_leadgen_events falhou com "TypeError: fetch failed" e o
// lead pago sumiu — Meta ja tinha recebido 200, entao nunca reenviou.
// Regras novas:
//  - recordEvent RETENTA em falha de transporte (sem error.code) ate 3x
//  - erro Postgres (com code) NAO retenta: 23505 = dedup, resto lanca direto
//  - registrarEventosMinimos grava o minimo de cada change ANTES do ACK ao
//    Meta e reporta quais falharam (webhook responde 500 -> Meta reenvia)
//  - buscarEvento le processed/lead_id pro endpoint de reprocesso decidir

import { describe, it, expect } from 'vitest';
import {
  MetaLeadgenService,
  registrarEventosMinimos,
} from '../src/modules/meta-leadgen.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';

// Fake client cujo insert responde a sequencia de erros dada (null = sucesso).
function clientInsertSequencia(erros: Array<{ code?: string; message: string } | null>) {
  let chamadas = 0;
  const client = {
    from(table: string) {
      if (table !== 'meta_leadgen_events') throw new Error(`tabela inesperada: ${table}`);
      return {
        insert: async () => {
          const erro = erros[Math.min(chamadas, erros.length - 1)];
          chamadas++;
          return { error: erro };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, contagem: () => chamadas };
}

function servico(client: SupabaseClient): MetaLeadgenService {
  return new MetaLeadgenService(
    'app-secret',
    'verify-token',
    async () => 'page-token',
    client,
    {} as Anthropic,
  );
}

const FALHA_REDE = { message: 'TypeError: fetch failed' }; // supabase-js: sem code
const DETALHES = { leadgen_id: '1071371745313562', field_data: [] };

describe('MetaLeadgenService.recordEvent — retry em falha de transporte', () => {
  it('retenta e grava quando a rede soluca 2x e volta na 3a', async () => {
    const { client, contagem } = clientInsertSequencia([FALHA_REDE, FALHA_REDE, null]);

    const res = await servico(client).recordEvent(DETALHES, {}, { retryDelayMs: 1 });

    expect(res).toEqual({ isNew: true });
    expect(contagem()).toBe(3);
  });

  it('falha de rede persistente lanca depois de 3 tentativas', async () => {
    const { client, contagem } = clientInsertSequencia([FALHA_REDE]);

    await expect(
      servico(client).recordEvent(DETALHES, {}, { retryDelayMs: 1 }),
    ).rejects.toThrow(/Failed to record leadgen event/);
    expect(contagem()).toBe(3);
  });

  it('23505 (duplicado) retorna isNew false SEM retentar', async () => {
    const { client, contagem } = clientInsertSequencia([
      { code: '23505', message: 'duplicate key' },
    ]);

    const res = await servico(client).recordEvent(DETALHES, {});

    expect(res).toEqual({ isNew: false });
    expect(contagem()).toBe(1);
  });

  it('erro Postgres com code (nao-dedup) lanca direto sem retentar', async () => {
    const { client, contagem } = clientInsertSequencia([
      { code: '42P01', message: 'relation does not exist' },
    ]);

    await expect(servico(client).recordEvent(DETALHES, {})).rejects.toThrow(
      /relation does not exist/,
    );
    expect(contagem()).toBe(1);
  });
});

describe('registrarEventosMinimos — grava o minimo antes do ACK ao Meta', () => {
  function svcFake(porLeadgen: Record<string, 'novo' | 'dedup' | 'falha'>) {
    return {
      recordEvent: async (details: { leadgen_id: string }) => {
        const modo = porLeadgen[details.leadgen_id];
        if (modo === 'falha') throw new Error('Failed to record leadgen event: TypeError: fetch failed');
        return { isNew: modo === 'novo' };
      },
    } as unknown as MetaLeadgenService;
  }

  it('todos gravam: novos listados, nenhuma falha', async () => {
    const changes = [{ leadgen_id: 'A' }, { leadgen_id: 'B' }];

    const r = await registrarEventosMinimos(svcFake({ A: 'novo', B: 'novo' }), changes);

    expect(r.novos.map((n) => n.leadgenId)).toEqual(['A', 'B']);
    expect(r.falhas).toEqual([]);
  });

  it('dedup nao vira novo nem falha (webhook reenviado pelo Meta)', async () => {
    const changes = [{ leadgen_id: 'A' }, { leadgen_id: 'B' }];

    const r = await registrarEventosMinimos(svcFake({ A: 'dedup', B: 'novo' }), changes);

    expect(r.novos.map((n) => n.leadgenId)).toEqual(['B']);
    expect(r.falhas).toEqual([]);
  });

  it('falha em um NAO derruba os outros e sai listada pro 500', async () => {
    const changes = [{ leadgen_id: 'A' }, { leadgen_id: 'B' }, { leadgen_id: 'C' }];

    const r = await registrarEventosMinimos(
      svcFake({ A: 'novo', B: 'falha', C: 'novo' }),
      changes,
    );

    expect(r.novos.map((n) => n.leadgenId)).toEqual(['A', 'C']);
    expect(r.falhas).toHaveLength(1);
    expect(r.falhas[0].leadgenId).toBe('B');
    expect(r.falhas[0].erro).toMatch(/fetch failed/);
  });

  it('novos carregam o change original (vira raw_payload/details depois)', async () => {
    const change = { leadgen_id: 'A', ad_id: 'ad-1' };

    const r = await registrarEventosMinimos(svcFake({ A: 'novo' }), [change]);

    expect(r.novos[0].changeValue).toEqual(change);
  });
});

describe('MetaLeadgenService.buscarEvento — base do endpoint de reprocesso', () => {
  function clientSelect(row: { processed: boolean; lead_id: string | null } | null) {
    return {
      from(table: string) {
        if (table !== 'meta_leadgen_events') throw new Error(`tabela inesperada: ${table}`);
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: row, error: null }),
            }),
          }),
        };
      },
    } as unknown as SupabaseClient;
  }

  it('evento existente retorna processed e lead_id', async () => {
    const svc = servico(clientSelect({ processed: true, lead_id: 'lead-9' }));

    const ev = await svc.buscarEvento('1071371745313562');

    expect(ev).toEqual({ processed: true, lead_id: 'lead-9' });
  });

  it('evento inexistente retorna null', async () => {
    const svc = servico(clientSelect(null));

    const ev = await svc.buscarEvento('nao-existe');

    expect(ev).toBeNull();
  });
});
