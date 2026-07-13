import { describe, it, expect } from 'vitest';
import { montarCustosMes } from '../src/modules/dashboard/custos-data.js';

// Fake client no mesmo espírito de tests/cerebro-data.test.ts: cada .from(tabela)
// devolve um builder chainable (select/eq/gte/...) que resolve pro conjunto de
// linhas configurado por TABELA. montarCustosMes soma a coluna *_cents dessas
// linhas no JS, então o resultado depende só das linhas fake daquela tabela.
type CallLog = { table: string; method: string; args: any[] };

function makeFakeClient(rowsByTable: Record<string, any[] | 'throw'>) {
  const callLog: CallLog[] = [];
  const from = (table: string) => {
    const cfg = rowsByTable[table];
    const builder: any = {};
    const chainMethods = ['eq', 'in', 'gte', 'lte', 'like', 'select'];
    for (const m of chainMethods) {
      builder[m] = (...args: any[]) => {
        callLog.push({ table, method: m, args });
        return builder;
      };
    }
    builder.then = (resolve: any, reject: any) => {
      if (cfg === 'throw') {
        return Promise.reject(new Error(`boom: ${table}`)).catch(reject ?? (() => {}));
      }
      return Promise.resolve({ data: cfg ?? [], error: null }).then(resolve, reject);
    };
    return builder;
  };
  return { client: { from } as any, callLog };
}

function fakeSupabase(rowsByTable: Record<string, any[] | 'throw'>) {
  const { client, callLog } = makeFakeClient(rowsByTable);
  return { supabase: { getClient: () => client } as any, callLog };
}

describe('montarCustosMes', () => {
  it('soma corretamente cada fonte a partir das linhas fake', async () => {
    const { supabase } = fakeSupabase({
      meta_ads_insights: [{ spend_cents: 1000 }, { spend_cents: 500 }],
      channel_daily_metrics: [{ spend_cents: 300 }, { spend_cents: 200 }, { spend_cents: 100 }],
      custos_ia_uso: [{ custo_cents: 42 }, { custo_cents: 8 }],
      custos_fixos: [{ valor_cents: 3000 }, { valor_cents: 2000 }],
    });

    const custos = await montarCustosMes(supabase);

    expect(custos.metaCents).toBe(1500);
    expect(custos.googleCents).toBe(600);
    expect(custos.iaCents).toBe(50);
    expect(custos.fixosCents).toBe(5000);
  });

  it('aplica os filtros certos por fonte (data do mês, channel=google, ativo=true)', async () => {
    const { supabase, callLog } = fakeSupabase({
      meta_ads_insights: [{ spend_cents: 1 }],
      channel_daily_metrics: [{ spend_cents: 1 }],
      custos_ia_uso: [{ custo_cents: 1 }],
      custos_fixos: [{ valor_cents: 1 }],
    });

    await montarCustosMes(supabase);

    // meta filtra por date_start >= 1º dia do mês
    const metaGte = callLog.filter((c) => c.table === 'meta_ads_insights' && c.method === 'gte');
    expect(metaGte.some((c) => c.args[0] === 'date_start')).toBe(true);
    // google filtra channel=google e date >= 1º dia do mês
    const googleEq = callLog.filter((c) => c.table === 'channel_daily_metrics' && c.method === 'eq');
    expect(googleEq.some((c) => c.args[0] === 'channel' && c.args[1] === 'google')).toBe(true);
    const googleGte = callLog.filter((c) => c.table === 'channel_daily_metrics' && c.method === 'gte');
    expect(googleGte.some((c) => c.args[0] === 'date')).toBe(true);
    // ia filtra created_at >= 1º dia do mês
    const iaGte = callLog.filter((c) => c.table === 'custos_ia_uso' && c.method === 'gte');
    expect(iaGte.some((c) => c.args[0] === 'created_at')).toBe(true);
    // fixos filtra ativo=true (mensal, sem data)
    const fixosEq = callLog.filter((c) => c.table === 'custos_fixos' && c.method === 'eq');
    expect(fixosEq.some((c) => c.args[0] === 'ativo' && c.args[1] === true)).toBe(true);

    // o 1º dia do mês é o mesmo valor nos 3 filtros de data (formato YYYY-MM-01)
    const inicio = metaGte[0].args[1];
    expect(inicio).toMatch(/^\d{4}-\d{2}-01$/);
    expect(googleGte[0].args[1]).toBe(inicio);
    expect(iaGte[0].args[1]).toBe(inicio);
  });

  it('best-effort: uma fonte que lança vira 0, as outras seguem normais', async () => {
    const { supabase } = fakeSupabase({
      meta_ads_insights: 'throw',
      channel_daily_metrics: [{ spend_cents: 600 }],
      custos_ia_uso: [{ custo_cents: 50 }],
      custos_fixos: 'throw',
    });

    const custos = await montarCustosMes(supabase);

    expect(custos.metaCents).toBe(0);
    expect(custos.fixosCents).toBe(0);
    expect(custos.googleCents).toBe(600);
    expect(custos.iaCents).toBe(50);
    expect(custos.totalCents).toBe(650);
  });

  it('best-effort: se getClient inteiro explode, todos os campos viram 0', async () => {
    const supabase = {
      getClient: () => {
        throw new Error('conexão indisponível');
      },
    } as any;

    const custos = await montarCustosMes(supabase);

    expect(custos).toEqual({
      metaCents: 0,
      googleCents: 0,
      iaCents: 0,
      fixosCents: 0,
      totalCents: 0,
      faturamentoCents: 0,
      vendasMes: 0,
      lucroCents: 0,
      custoPorVendaCents: 0,
    });
  });

  it('faturamento soma venda_valor_cents das vendas do mês; lucro = faturamento - custos', async () => {
    const { supabase, callLog } = fakeSupabase({
      meta_ads_insights: [{ spend_cents: 1000 }],
      custos_fixos: [{ valor_cents: 2000 }],
      leads: [{ venda_valor_cents: 500000 }, { venda_valor_cents: 300000 }],
    });

    const custos = await montarCustosMes(supabase);

    expect(custos.faturamentoCents).toBe(800000); // 5000 + 3000 reais
    expect(custos.totalCents).toBe(3000); // 1000 meta + 2000 fixos
    expect(custos.lucroCents).toBe(800000 - 3000);
    // faturamento filtra leads por contract_signed_at >= 1º dia do mês
    const leadsGte = callLog.filter((c) => c.table === 'leads' && c.method === 'gte');
    expect(leadsGte.some((c) => c.args[0] === 'contract_signed_at')).toBe(true);
  });

  it('totalCents = meta + google + ia + fixos', async () => {
    const { supabase } = fakeSupabase({
      meta_ads_insights: [{ spend_cents: 1500 }],
      channel_daily_metrics: [{ spend_cents: 600 }],
      custos_ia_uso: [{ custo_cents: 50 }],
      custos_fixos: [{ valor_cents: 5000 }],
    });

    const custos = await montarCustosMes(supabase);

    expect(custos.totalCents).toBe(1500 + 600 + 50 + 5000);
    expect(custos.totalCents).toBe(
      custos.metaCents + custos.googleCents + custos.iaCents + custos.fixosCents,
    );
  });
});
