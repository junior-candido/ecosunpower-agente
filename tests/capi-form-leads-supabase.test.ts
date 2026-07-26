// tests/capi-form-leads-supabase.test.ts
//
// TDD do getLeadForCapi estendido pra leads de FORMULARIO (CAPI form leads):
// a tabela `leads` nao guarda o leadgen_id — ele mora em `meta_leadgen_events`
// (lead_id -> leadgen_id). Regras:
//  - lead COM ctwa_clid: nem consulta meta_leadgen_events (o clique vence,
//    economiza uma query por evento)
//  - lead SEM ctwa_clid: busca o leadgen_id do PRIMEIRO evento do lead
//  - sem evento: leadgen_id null (organico -> reporter pula)

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SupabaseService } from '../src/modules/supabase.js';
import type { SupabaseClient } from '@supabase/supabase-js';

interface FakeRow {
  data: unknown;
  error: null;
}

function fakeClient(opts: {
  lead: Record<string, unknown> | null;
  leadgenEvent?: Record<string, unknown> | null;
}) {
  const fromCalls: string[] = [];
  const client = {
    from(table: string) {
      fromCalls.push(table);
      if (table === 'leads') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async (): Promise<FakeRow> => ({ data: opts.lead, error: null }),
            }),
          }),
        };
      }
      if (table === 'meta_leadgen_events') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async (): Promise<FakeRow> => ({
                    data: opts.leadgenEvent ?? null,
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`tabela inesperada no teste: ${table}`);
    },
  } as unknown as SupabaseClient;
  return { client, fromCalls };
}

function service(client: SupabaseClient): SupabaseService {
  return new SupabaseService(
    { supabaseUrl: 'http://localhost', supabaseServiceKey: 'test-key' },
    client,
  );
}

describe('SupabaseService.getLeadForCapi — leads de formulario', () => {
  it('lead COM ctwa_clid nao consulta meta_leadgen_events (clique vence)', async () => {
    const { client, fromCalls } = fakeClient({
      lead: { phone: '5561999', ctwa_clid: 'CLID_A', capi_stages_sent: ['Lead'] },
    });

    const res = await service(client).getLeadForCapi('lead-1');

    expect(res).toEqual({
      phone: '5561999',
      ctwa_clid: 'CLID_A',
      leadgen_id: null,
      capi_stages_sent: ['Lead'],
    });
    expect(fromCalls).toEqual(['leads']);
  });

  it('lead SEM ctwa_clid busca o leadgen_id no meta_leadgen_events', async () => {
    const { client, fromCalls } = fakeClient({
      lead: { phone: '5561888', ctwa_clid: null, capi_stages_sent: [] },
      leadgenEvent: { leadgen_id: '525645896321548' },
    });

    const res = await service(client).getLeadForCapi('lead-2');

    expect(res?.leadgen_id).toBe('525645896321548');
    expect(res?.ctwa_clid).toBeNull();
    expect(fromCalls).toEqual(['leads', 'meta_leadgen_events']);
  });

  it('lead organico (sem clique e sem evento de formulario) devolve leadgen_id null', async () => {
    const { client } = fakeClient({
      lead: { phone: '5561777', ctwa_clid: null, capi_stages_sent: [] },
      leadgenEvent: null,
    });

    const res = await service(client).getLeadForCapi('lead-3');

    expect(res?.leadgen_id).toBeNull();
  });

  it('lead inexistente segue devolvendo null', async () => {
    const { client } = fakeClient({ lead: null });

    const res = await service(client).getLeadForCapi('lead-x');

    expect(res).toBeNull();
  });

  it('erro na query de meta_leadgen_events lanca com mensagem clara (reporter engole)', async () => {
    const client = {
      from(table: string) {
        if (table === 'leads') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { phone: '5561999', ctwa_clid: null, capi_stages_sent: [] },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: null, error: { message: 'rede caiu' } }),
                }),
              }),
            }),
          }),
        };
      },
    } as unknown as SupabaseClient;

    await expect(service(client).getLeadForCapi('lead-err')).rejects.toThrow(
      /Failed to get leadgen_id for capi: rede caiu/,
    );
  });
});

describe('MetaLeadgenService.markEventProcessed', () => {
  it('lanca quando o update falha — sem isso o lead_id nao grava e o estagio Lead do form se perde em silencio', async () => {
    const { MetaLeadgenService } = await import('../src/modules/meta-leadgen.js');
    const client = {
      from: () => ({
        update: () => ({
          eq: async () => ({ error: { message: 'rede caiu no update' } }),
        }),
      }),
    } as unknown as SupabaseClient;
    const svc = new MetaLeadgenService(
      'app-secret',
      'verify-token',
      async () => 'page-token',
      client,
      {} as never,
    );

    await expect(svc.markEventProcessed('LG-1', 'lead-1')).rejects.toThrow(/rede caiu no update/);
  });
});

describe('ganchos CAPI form leads no index.ts (teste-guarda, padrao da casa)', () => {
  const src = readFileSync(join(__dirname, '..', 'src', 'index.ts'), 'utf8');

  it('webhook do formulario dispara o estagio Lead (apos markEventProcessed)', () => {
    // Sem { db }: webhook e caminho service-role (singleton), igual aos crons.
    expect(src).toContain("void capiReporter(leadId, 'Lead');");
    // Ordem importa: markEventProcessed grava o lead_id que o lookup usa.
    const posMark = src.indexOf('markEventProcessed(leadgenId, leadId)');
    const posHook = src.indexOf("void capiReporter(leadId, 'Lead');");
    expect(posMark).toBeGreaterThan(-1);
    expect(posHook).toBeGreaterThan(posMark);
  });

  it('resposta do cliente dispara lead_respondeu pelo crachá (db)', () => {
    expect(src).toContain("void capiReporter(l.id, 'lead_respondeu', { db })");
    // Guarda barato: form (ou quem ja tem estagio Lead), nunca CTWA
    expect(src).toContain("l.lead_source === 'ad_ig_leadform' || l.lead_source === 'ad_fb_leadform'");
    expect(src).toContain("stages.includes('Lead')");
  });

  it('foto e PDF tambem contam como resposta (conta de luz e a resposta mais comum)', () => {
    // 3 chamadas: texto, imagem e documento (a definicao usa `= (`, nao conta)
    const chamadas = src.split('maybeCapiRespondeu(lead, db)').length - 1;
    expect(chamadas).toBeGreaterThanOrEqual(3);
  });
});
