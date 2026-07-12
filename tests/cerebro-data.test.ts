import { describe, it, expect } from 'vitest';
import { montarSnapshotElo } from '../src/modules/dashboard/cerebro-data.js';

// Fake client: cada chamada .from(tabela) devolve um builder chainable que
// "resolve" pro count configurado por tabela (igual ao padrão de
// tests/email-supabase-methods.test.ts) — o count depende da TABELA, não do
// filtro aplicado em cima (eq/in), então leads/negociacao/ganhos/clientes
// batem no mesmo número (todos vêm de 'leads').
type CallLog = { table: string; method: string; args: any[] };

function makeFakeClient(countsByTable: Record<string, number | 'throw'>) {
  const callLog: CallLog[] = [];
  const from = (table: string) => {
    const cfg = countsByTable[table];
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
      return Promise.resolve({ count: cfg ?? 0, error: null }).then(resolve, reject);
    };
    return builder;
  };
  return { client: { from } as any, callLog };
}

function fakeSupabase(countsByTable: Record<string, number | 'throw'>) {
  const { client, callLog } = makeFakeClient(countsByTable);
  return { supabase: { getClient: () => client } as any, callLog };
}

describe('montarSnapshotElo', () => {
  it('mapeia os counts de cada tabela pros campos certos do snapshot', async () => {
    const { supabase } = fakeSupabase({
      leads: 10,
      propostas_publicas: 5,
      conversations: 3,
      eventos_elo: 7,
      sistemas_clientes: 2,
      manutencoes: 4,
      fechamentos: 6,
      blog_drafts: 8,
    });

    const snap = await montarSnapshotElo(supabase);

    expect(snap).toEqual({
      comercial: { leads: 10, negociacao: 10, ganhos: 10, propostas: 5 },
      atendimento: { conversas: 3 },
      // blog vem de blog_drafts (published); anuncios vem de eventos_elo
      // (tipo marketing:lead_ads) — o count depende só da TABELA no fake.
      marketing: { emailsEnviados: 7, emailsAbertos: 7, leadsQuentes: 7, blog: 8, anuncios: 7 },
      operacao: { usinas: 2 },
      relacionamento: { clientes: 10, manutencoes: 4 },
      financeiro: { vendas: 6 },
      // site e calculadora contam eventos_elo (like) — no fake, count por tabela = 7
      externos: { site: 7, calculadora: 7 },
      elo: { totalEventos: 7 },
    });
  });

  it('aplica os filtros certos por campo (status/tipo) nas tabelas compartilhadas', async () => {
    const { supabase, callLog } = fakeSupabase({
      leads: 1,
      propostas_publicas: 1,
      conversations: 1,
      eventos_elo: 1,
      sistemas_clientes: 1,
      manutencoes: 1,
      fechamentos: 1,
    });

    await montarSnapshotElo(supabase);

    const leadsEq = callLog.filter((c) => c.table === 'leads' && c.method === 'eq');
    expect(leadsEq).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ args: ['status', 'negociacao'] }),
        expect.objectContaining({ args: ['status', 'ganho'] }),
      ]),
    );
    const leadsIn = callLog.filter((c) => c.table === 'leads' && c.method === 'in');
    expect(leadsIn.some((c) => c.args[0] === 'installation_status')).toBe(true);

    const eventosEq = callLog.filter((c) => c.table === 'eventos_elo' && c.method === 'eq');
    expect(eventosEq).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ args: ['tipo', 'email_enviado'] }),
        expect.objectContaining({ args: ['tipo', 'email_aberto'] }),
        expect.objectContaining({ args: ['tipo', 'lead_quente_email'] }),
      ]),
    );
  });

  it('best-effort: se uma tabela lança erro, o número correspondente vira 0 e o snapshot não quebra', async () => {
    const { supabase } = fakeSupabase({
      leads: 10,
      propostas_publicas: 'throw',
      conversations: 3,
      eventos_elo: 7,
      sistemas_clientes: 2,
      manutencoes: 'throw',
      fechamentos: 6,
    });

    const snap = await montarSnapshotElo(supabase);

    expect(snap.comercial.propostas).toBe(0);
    expect(snap.relacionamento.manutencoes).toBe(0);
    // O resto segue normal — uma tabela quebrando não derruba as outras.
    expect(snap.comercial.leads).toBe(10);
    expect(snap.atendimento.conversas).toBe(3);
    expect(snap.elo.totalEventos).toBe(7);
  });

  it('best-effort: se o client inteiro lança (getClient explode), ainda assim não propaga — todos os campos viram 0', async () => {
    const supabase = {
      getClient: () => {
        throw new Error('conexão indisponível');
      },
    } as any;

    const snap = await montarSnapshotElo(supabase);

    expect(snap).toEqual({
      comercial: { leads: 0, negociacao: 0, ganhos: 0, propostas: 0 },
      atendimento: { conversas: 0 },
      marketing: { emailsEnviados: 0, emailsAbertos: 0, leadsQuentes: 0, blog: 0, anuncios: 0 },
      operacao: { usinas: 0 },
      relacionamento: { clientes: 0, manutencoes: 0 },
      financeiro: { vendas: 0 },
      externos: { site: 0, calculadora: 0 },
      elo: { totalEventos: 0 },
    });
  });
});
