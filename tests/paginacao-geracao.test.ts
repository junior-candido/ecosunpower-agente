// tests/paginacao-geracao.test.ts
// Ajudante compartilhado de leitura paginada (teto de 1000 linhas do PostgREST).
// Nasceu no fix do alerta OFFLINE falso (#161); aqui vira módulo reusável pra
// qualquer consulta de frota inteira (monitoring service, pós-venda).
import { describe, it, expect } from 'vitest';
import { buscarPaginado } from '../src/modules/monitoring/paginacao.js';

const TETO = 1000;

// Consulta fake que se comporta como o PostgREST: nunca devolve mais de 1000
// linhas; .range(de, ate) abre a página pedida.
function consultaFake(linhas: any[], chamadas: number[][]) {
  let de = 0;
  let ate = TETO - 1;
  const q: any = {
    range(a: number, b: number) { de = a; ate = b; chamadas.push([a, b]); return q; },
    then(res: any) {
      const fim = Math.min(ate + 1, de + TETO);
      return res({ data: linhas.slice(de, fim), error: null });
    },
  };
  return q;
}

describe('buscarPaginado', () => {
  it('junta todas as páginas quando o total passa de 1000', async () => {
    const linhas = Array.from({ length: 2345 }, (_, i) => ({ i }));
    const chamadas: number[][] = [];
    const out = await buscarPaginado(() => consultaFake(linhas, chamadas));
    expect(out).toHaveLength(2345);
    expect(out[2344]).toEqual({ i: 2344 });
    expect(chamadas).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('uma página só quando cabe no teto', async () => {
    const chamadas: number[][] = [];
    const out = await buscarPaginado(() => consultaFake([{ i: 0 }, { i: 1 }], chamadas));
    expect(out).toHaveLength(2);
    expect(chamadas).toEqual([[0, 999]]);
  });

  it('erro no meio devolve o que já veio (mesmo contrato do data ?? [])', async () => {
    let n = 0;
    const q = () => ({
      range() { return this; },
      then(res: any) {
        n++;
        if (n === 1) return res({ data: Array.from({ length: TETO }, (_, i) => ({ i })), error: null });
        return res({ data: null, error: { message: 'boom' } });
      },
    } as any);
    const out = await buscarPaginado(q);
    expect(out).toHaveLength(TETO);
  });
});
