import { describe, it, expect } from 'vitest';
import { salvarMemoriaElo, getMemoriaRecenteElo } from '../src/modules/dashboard/cerebro-memoria.js';

// Fake Supabase: builder chainável (select/eq/order/limit resolve {data,error};
// insert captura a linha) no padrão dos outros testes do dashboard.
function fakeSupabase(opts: {
  rows?: Array<{ pergunta: string; resposta: string }>;
  insertCapture?: (row: any) => void;
  throwOn?: 'insert' | 'select';
}) {
  const builder: any = {
    insert: (row: any) => {
      opts.insertCapture?.(row);
      if (opts.throwOn === 'insert') return Promise.reject(new Error('boom'));
      return Promise.resolve({ error: null });
    },
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => {
      if (opts.throwOn === 'select') return Promise.reject(new Error('boom'));
      return Promise.resolve({ data: opts.rows ?? [], error: null });
    },
  };
  return { getClient: () => ({ from: () => builder }) } as any;
}

describe('salvarMemoriaElo', () => {
  it('grava a troca com user_id/quem/pergunta/resposta', async () => {
    let row: any = null;
    const sb = fakeSupabase({ insertCapture: (r) => { row = r; } });
    await salvarMemoriaElo(sb, { userId: 'u1', quem: 'Junior', pergunta: 'quantos leads?', resposta: 'sao 42' });
    expect(row).toMatchObject({ user_id: 'u1', quem: 'Junior', pergunta: 'quantos leads?', resposta: 'sao 42' });
  });

  it('best-effort: se o insert lança, nao propaga', async () => {
    const sb = fakeSupabase({ throwOn: 'insert' });
    await expect(salvarMemoriaElo(sb, { pergunta: 'oi', resposta: 'ola' })).resolves.toBeUndefined();
  });
});

describe('getMemoriaRecenteElo', () => {
  it('devolve as trocas em ordem cronologica (inverte o mais-novo-primeiro do banco)', async () => {
    // banco retorna mais nova -> mais antiga; a funcao inverte pra ordem de conversa
    const sb = fakeSupabase({ rows: [
      { pergunta: 'p2', resposta: 'r2' },
      { pergunta: 'p1', resposta: 'r1' },
    ] });
    const hist = await getMemoriaRecenteElo(sb, 'u1');
    expect(hist).toEqual([
      { pergunta: 'p1', resposta: 'r1' },
      { pergunta: 'p2', resposta: 'r2' },
    ]);
  });

  it('sem userId → []', async () => {
    const sb = fakeSupabase({ rows: [{ pergunta: 'p', resposta: 'r' }] });
    expect(await getMemoriaRecenteElo(sb, null)).toEqual([]);
    expect(await getMemoriaRecenteElo(sb, undefined)).toEqual([]);
  });

  it('best-effort: erro na busca → []', async () => {
    const sb = fakeSupabase({ throwOn: 'select' });
    expect(await getMemoriaRecenteElo(sb, 'u1')).toEqual([]);
  });
});
