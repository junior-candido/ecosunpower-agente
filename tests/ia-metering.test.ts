import { describe, it, expect } from 'vitest';
import { custoCentsBRL, registrarUsoIa, USD_BRL } from '../src/modules/custos/ia-metering.js';

// Fake client no mesmo estilo dos outros testes: .from(tabela).insert(row)
// registra a chamada num log pra a gente inspecionar.
type InsertLog = { table: string; row: any };
function makeFakeClient(opts: { throwOnInsert?: boolean } = {}) {
  const inserts: InsertLog[] = [];
  const client: any = {
    from(table: string) {
      return {
        insert(row: any) {
          if (opts.throwOnInsert) throw new Error('boom insert');
          inserts.push({ table, row });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { client, inserts };
}

describe('custoCentsBRL', () => {
  it('sonnet: 1M input + 1M output = (3+15) USD × 5.40 × 100 = 9720 cents', () => {
    const cents = custoCentsBRL('claude-sonnet-4-6', {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    });
    expect(cents).toBe(9720);
  });

  it('haiku: 1M input + 1M output = (1+5) USD × 5.40 × 100 = 3240 cents', () => {
    const cents = custoCentsBRL('claude-haiku-4-5', {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    });
    expect(cents).toBe(3240);
  });

  it('opus: 1M input + 1M output = (5+25) USD × 5.40 × 100 = 16200 cents', () => {
    const cents = custoCentsBRL('claude-opus-4-8', {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    });
    expect(cents).toBe(16200);
  });

  it('normaliza o modelo com sufixo de data (haiku-...-20251001 → haiku)', () => {
    const cents = custoCentsBRL('claude-haiku-4-5-20251001', {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    });
    expect(cents).toBe(3240);
  });

  it('cache: leitura = 0.1×input, escrita = 1.25×input (derivados do input do sonnet)', () => {
    // Só cache read: 1M × (0.1 × 3) = 0.30 USD × 5.40 × 100 = 162 cents.
    const soRead = custoCentsBRL('claude-sonnet-4-6', {
      cache_read_input_tokens: 1_000_000,
    });
    expect(soRead).toBe(162);
    // Só cache write (5min): 1M × (1.25 × 3) = 3.75 USD × 5.40 × 100 = 2025 cents.
    const soWrite = custoCentsBRL('claude-sonnet-4-6', {
      cache_creation_input_tokens: 1_000_000,
    });
    expect(soWrite).toBe(2025);
  });

  it('modelo desconhecido cai no fallback (preços do sonnet), sem quebrar', () => {
    const desconhecido = custoCentsBRL('modelo-inexistente-xyz', {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    });
    expect(desconhecido).toBe(9720);
  });

  it('usage vazio/null vira 0 cents', () => {
    expect(custoCentsBRL('claude-sonnet-4-6', {})).toBe(0);
    expect(
      custoCentsBRL('claude-sonnet-4-6', {
        input_tokens: null,
        output_tokens: null,
        cache_read_input_tokens: null,
        cache_creation_input_tokens: null,
      }),
    ).toBe(0);
  });

  it('a constante de câmbio está exposta', () => {
    expect(USD_BRL).toBe(5.4);
  });
});

describe('registrarUsoIa', () => {
  it('insere em custos_ia_uso com os tokens e o custo_cents calculado', async () => {
    const { client, inserts } = makeFakeClient();
    await registrarUsoIa(client, {
      modelo: 'claude-sonnet-4-6',
      origem: 'eva',
      usage: {
        input_tokens: 1_000_000,
        output_tokens: 1_000_000,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    });
    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe('custos_ia_uso');
    expect(inserts[0].row).toEqual({
      modelo: 'claude-sonnet-4-6',
      origem: 'eva',
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      custo_cents: 9720,
    });
  });

  it('mapeia cache_read/creation para as colunas cache_read_tokens/cache_write_tokens', async () => {
    const { client, inserts } = makeFakeClient();
    await registrarUsoIa(client, {
      modelo: 'claude-sonnet-4-6',
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 200,
        cache_creation_input_tokens: 300,
      },
    });
    expect(inserts[0].row.cache_read_tokens).toBe(200);
    expect(inserts[0].row.cache_write_tokens).toBe(300);
    expect(inserts[0].row.origem).toBeNull();
  });

  it('best-effort: client null → não faz nada e não lança', async () => {
    await expect(
      registrarUsoIa(null, { modelo: 'claude-sonnet-4-6', usage: { input_tokens: 10 } }),
    ).resolves.toBeUndefined();
  });

  it('best-effort: erro no insert é engolido (não lança)', async () => {
    const { client } = makeFakeClient({ throwOnInsert: true });
    await expect(
      registrarUsoIa(client, { modelo: 'claude-sonnet-4-6', usage: { input_tokens: 10 } }),
    ).resolves.toBeUndefined();
  });
});
