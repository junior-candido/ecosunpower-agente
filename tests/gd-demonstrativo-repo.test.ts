import { describe, it, expect } from 'vitest';
import { fimDoMes, criarRepoDemonstrativo } from '../src/modules/gd/demonstrativo-repo.js';

describe('fimDoMes', () => {
  it('acerta meses de 28, 29, 30 e 31 dias', () => {
    expect(fimDoMes('2026-02-01')).toBe('2026-02-28');
    expect(fimDoMes('2028-02-01')).toBe('2028-02-29');
    expect(fimDoMes('2026-06-01')).toBe('2026-06-30');
    expect(fimDoMes('2026-12-01')).toBe('2026-12-31');
  });
});

// Client falso minimo: grava as chamadas e devolve respostas por tabela.
function fakeDb(respostas: Record<string, Array<{ data: any; error: any }>>) {
  const chamadas: Array<{ tabela: string; ops: Array<[string, any[]]> }> = [];
  const db = {
    from(tabela: string) {
      const c = { tabela, ops: [] as Array<[string, any[]]> };
      chamadas.push(c);
      const fila = respostas[tabela] ?? [];
      const q: any = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === 'then') {
            const r = fila.shift() ?? { data: [], error: null };
            return (res: any) => Promise.resolve(r).then(res);
          }
          return (...args: any[]) => { c.ops.push([prop, args]); return q; };
        },
      });
      return q;
    },
  };
  return { db: db as any, chamadas };
}

describe('criarRepoDemonstrativo', () => {
  it('acha o lead pela UC exata', async () => {
    const { db } = fakeDb({ leads: [{ data: [{ id: 'L1', name: 'Ana', company_id: 'E1' }], error: null }] });
    const r = await criarRepoDemonstrativo(db).buscarLeadPorUc(['100001', '200002']);
    expect(r).toEqual({ id: 'L1', nome: 'Ana', companyId: 'E1' });
  });

  it('acha o lead mesmo com a UC digitada com ponto e traco', async () => {
    const { db } = fakeDb({
      leads: [
        { data: [], error: null },
        { data: [{ id: 'L2', name: 'Beto', company_id: 'E1', uc_numero: '200.00-2' }], error: null },
      ],
    });
    const r = await criarRepoDemonstrativo(db).buscarLeadPorUc(['100001', '200002']);
    expect(r?.id).toBe('L2');
  });

  it('sem lead devolve null', async () => {
    const { db } = fakeDb({ leads: [{ data: [], error: null }, { data: [], error: null }] });
    expect(await criarRepoDemonstrativo(db).buscarLeadPorUc(['1'])).toBeNull();
  });

  it('geracao do mes: soma os dias; sem sistema ou sem leitura devolve null', async () => {
    const um = fakeDb({
      sistemas_clientes: [{ data: [{ id: 'S1' }], error: null }],
      geracao_diaria: [{ data: [{ geracao_kwh: 10.5 }, { geracao_kwh: '20.25' }], error: null }],
    });
    expect(await criarRepoDemonstrativo(um.db).geracaoDoMes('L1', '2026-06-01')).toBe(30.75);
    const ops = um.chamadas.find((c) => c.tabela === 'geracao_diaria')!.ops;
    expect(ops).toContainEqual(['gte', ['data', '2026-06-01']]);
    expect(ops).toContainEqual(['lte', ['data', '2026-06-30']]);

    const semSis = fakeDb({ sistemas_clientes: [{ data: [], error: null }] });
    expect(await criarRepoDemonstrativo(semSis.db).geracaoDoMes('L1', '2026-06-01')).toBeNull();

    const semLeitura = fakeDb({
      sistemas_clientes: [{ data: [{ id: 'S1' }], error: null }],
      geracao_diaria: [{ data: [], error: null }],
    });
    expect(await criarRepoDemonstrativo(semLeitura.db).geracaoDoMes('L1', '2026-06-01')).toBeNull();
  });

  it('rateio: so beneficiarias com UC, percentual numerico', async () => {
    const { db } = fakeDb({
      leads: [{ data: [
        { name: 'Mae', uc_numero: '300.003', percentual_rateio: '40.00' },
        { name: 'Sem UC', uc_numero: null, percentual_rateio: 10 },
        { name: 'Sem %', uc_numero: '400004', percentual_rateio: null },
      ], error: null }],
    });
    expect(await criarRepoDemonstrativo(db).buscarRateio('L1')).toEqual([
      { uc: '300003', nome: 'Mae', percentual: 40 },
      { uc: '400004', nome: 'Sem %', percentual: null },
    ]);
  });

  it('salvar faz upsert pela chave UC+mes da empresa e propaga erro de RLS', async () => {
    const ok = fakeDb({ demonstrativos_gd: [{ data: null, error: null }] });
    await criarRepoDemonstrativo(ok.db).salvar({ company_id: 'E1' } as any);
    const up = ok.chamadas[0].ops.find(([op]) => op === 'upsert')!;
    expect(up[1][1]).toEqual({ onConflict: 'company_id,instalacao,referencia' });
    expect(up[1][0].atualizado_em).toBeTruthy();

    const erro = fakeDb({ demonstrativos_gd: [{ data: null, error: { message: 'violates row-level security' } }] });
    await expect(criarRepoDemonstrativo(erro.db).salvar({} as any)).rejects.toThrow('row-level security');
  });
});
