import { describe, it, expect } from 'vitest';
import { fimDoMes, padraoDigitos, criarRepoDemonstrativo } from '../src/modules/gd/demonstrativo-repo.js';

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
  it('instalacao exata vem antes de tudo, e sempre dentro da empresa', async () => {
    const { db, chamadas } = fakeDb({ leads: [{ data: [{ id: 'L1', name: 'Ana', company_id: 'E1' }], error: null }] });
    const r = await criarRepoDemonstrativo(db, 'E1').buscarLeadPorUc('200002', '100001');
    expect(r).toEqual({ id: 'L1', nome: 'Ana', companyId: 'E1' });
    const ops = chamadas[0].ops;
    expect(ops).toContainEqual(['eq', ['company_id', 'E1']]);
    expect(ops).toContainEqual(['eq', ['uc_numero', '200002']]);
    expect(ops.some(([op]) => op === 'order')).toBe(true);
    expect(chamadas).toHaveLength(1); // achou na primeira, nao tenta o codigo
  });

  it('sem instalacao, tenta o codigo do cliente', async () => {
    const { db, chamadas } = fakeDb({ leads: [
      { data: [], error: null },
      { data: [{ id: 'L3', name: 'Caio', company_id: 'E1' }], error: null },
    ] });
    const r = await criarRepoDemonstrativo(db, 'E1').buscarLeadPorUc('200002', '100001');
    expect(r?.id).toBe('L3');
    expect(chamadas[1].ops).toContainEqual(['eq', ['uc_numero', '100001']]);
  });

  it('acha com a UC digitada com ponto e traco (ILIKE por digitos + filtro fino)', async () => {
    const { db, chamadas } = fakeDb({
      leads: [
        { data: [], error: null },
        { data: [], error: null },
        { data: [
          { id: 'LX', name: 'Falso', company_id: 'E1', uc_numero: '2000002' },
          { id: 'L2', name: 'Beto', company_id: 'E1', uc_numero: '200.00-2' },
        ], error: null },
      ],
    });
    const r = await criarRepoDemonstrativo(db, 'E1').buscarLeadPorUc('200002', '100001');
    expect(r?.id).toBe('L2');
    expect(chamadas[2].ops).toContainEqual(['ilike', ['uc_numero', '2%0%0%0%0%2']]);
    expect(chamadas[2].ops).toContainEqual(['eq', ['company_id', 'E1']]);
  });

  it('sem lead devolve null', async () => {
    const { db } = fakeDb({ leads: [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }] });
    expect(await criarRepoDemonstrativo(db, 'E1').buscarLeadPorUc('1', '2')).toBeNull();
  });

  it('padraoDigitos', () => {
    expect(padraoDigitos('200.00-2')).toBe('2%0%0%0%0%2');
  });

  it('registroExistente filtra empresa, instalacao e mes e diz se foi verificado', async () => {
    const { db, chamadas } = fakeDb({ demonstrativos_gd: [
      { data: [{ origem_verificada: true }], error: null },
      { data: [], error: null },
    ] });
    const repo = criarRepoDemonstrativo(db, 'E1');
    expect(await repo.registroExistente('200002', '2026-06-01')).toEqual({ verificado: true });
    expect(await repo.registroExistente('200002', '2026-07-01')).toBeNull();
    expect(chamadas[0].ops).toContainEqual(['eq', ['company_id', 'E1']]);
    expect(chamadas[0].ops).toContainEqual(['eq', ['referencia', '2026-06-01']]);
  });

  it('geracao do mes: soma os dias; sem sistema ou sem leitura devolve null', async () => {
    const um = fakeDb({
      sistemas_clientes: [{ data: [{ id: 'S1' }], error: null }],
      geracao_diaria: [{ data: [{ geracao_kwh: 10.5 }, { geracao_kwh: '20.25' }], error: null }],
    });
    expect(await criarRepoDemonstrativo(um.db, 'E1').geracaoDoMes('L1', '2026-06-01')).toBe(30.75);
    const ops = um.chamadas.find((c) => c.tabela === 'geracao_diaria')!.ops;
    expect(ops).toContainEqual(['gte', ['data', '2026-06-01']]);
    expect(ops).toContainEqual(['lte', ['data', '2026-06-30']]);

    const semSis = fakeDb({ sistemas_clientes: [{ data: [], error: null }] });
    expect(await criarRepoDemonstrativo(semSis.db, 'E1').geracaoDoMes('L1', '2026-06-01')).toBeNull();

    const semLeitura = fakeDb({
      sistemas_clientes: [{ data: [{ id: 'S1' }], error: null }],
      geracao_diaria: [{ data: [], error: null }],
    });
    expect(await criarRepoDemonstrativo(semLeitura.db, 'E1').geracaoDoMes('L1', '2026-06-01')).toBeNull();
  });

  it('rateio: so beneficiarias com UC, percentual numerico', async () => {
    const { db } = fakeDb({
      leads: [{ data: [
        { name: 'Mae', uc_numero: '300.003', percentual_rateio: '40.00' },
        { name: 'Sem UC', uc_numero: null, percentual_rateio: 10 },
        { name: 'Sem %', uc_numero: '400004', percentual_rateio: null },
      ], error: null }],
    });
    expect(await criarRepoDemonstrativo(db, 'E1').buscarRateio('L1')).toEqual([
      { uc: '300003', nome: 'Mae', percentual: 40 },
      { uc: '400004', nome: 'Sem %', percentual: null },
    ]);
  });

  it('salvar faz upsert pela chave UC+mes da empresa e propaga erro de RLS', async () => {
    const ok = fakeDb({ demonstrativos_gd: [{ data: null, error: null }] });
    await criarRepoDemonstrativo(ok.db, 'E1').salvar({ company_id: 'E1' } as any);
    const up = ok.chamadas[0].ops.find(([op]) => op === 'upsert')!;
    expect(up[1][1]).toEqual({ onConflict: 'company_id,instalacao,referencia' });
    expect(up[1][0].atualizado_em).toBeTruthy();

    const erro = fakeDb({ demonstrativos_gd: [{ data: null, error: { message: 'violates row-level security' } }] });
    await expect(criarRepoDemonstrativo(erro.db, 'E1').salvar({} as any)).rejects.toThrow('row-level security');
  });

  it('assinaturaGravada filtra empresa, instalacao e mes, e devolve assinatura + verificado', async () => {
    const { db, chamadas } = fakeDb({ demonstrativos_gd: [
      { data: [{ assinatura: 'A1', origem_verificada: true }], error: null },
      { data: [], error: null },
    ] });
    const repo = criarRepoDemonstrativo(db, 'E1');
    expect(await repo.assinaturaGravada('200002', '2026-06-01')).toEqual({ assinatura: 'A1', verificado: true });
    expect(await repo.assinaturaGravada('200002', '2026-07-01')).toBeNull();
    expect(chamadas[0].ops).toContainEqual(['eq', ['company_id', 'E1']]);
    expect(chamadas[0].ops).toContainEqual(['eq', ['instalacao', '200002']]);
    expect(chamadas[0].ops).toContainEqual(['eq', ['referencia', '2026-06-01']]);
  });
});
