import { describe, it, expect } from 'vitest';
import { criarRepoTelaGd } from '../src/modules/gd/demonstrativos-tela-repo.js';

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

describe('criarRepoTelaGd', () => {
  it('mesesDisponiveis devolve meses unicos, do mais novo pro mais velho', async () => {
    const { db, chamadas } = fakeDb({ demonstrativos_gd: [{ data: [
      { referencia: '2026-08-01' }, { referencia: '2026-08-01' }, { referencia: '2026-07-01' },
    ], error: null }] });
    expect(await criarRepoTelaGd(db, 'E1').mesesDisponiveis()).toEqual(['2026-08-01', '2026-07-01']);
    expect(chamadas[0].ops).toContainEqual(['eq', ['company_id', 'E1']]);
  });

  it('listarDoMes filtra empresa e mes', async () => {
    const { db, chamadas } = fakeDb({ demonstrativos_gd: [{ data: [{ instalacao: '1' }], error: null }] });
    const r = await criarRepoTelaGd(db, 'E1').listarDoMes('2026-08-01');
    expect(r).toHaveLength(1);
    expect(chamadas[0].ops).toContainEqual(['eq', ['company_id', 'E1']]);
    expect(chamadas[0].ops).toContainEqual(['eq', ['referencia', '2026-08-01']]);
  });

  it('listarDoMes pagina alem de 1000 linhas — nao trunca a carteira', async () => {
    const pagina1 = Array.from({ length: 1000 }, (_, i) => ({ instalacao: String(i) }));
    const pagina2 = [{ instalacao: 'ultimo' }];
    const { db, chamadas } = fakeDb({ demonstrativos_gd: [
      { data: pagina1, error: null },
      { data: pagina2, error: null },
    ] });
    const r = await criarRepoTelaGd(db, 'E1').listarDoMes('2026-08-01');
    expect(r).toHaveLength(1001);
    expect(r[1000].instalacao).toBe('ultimo');
    const chamadasTabela = chamadas.filter((c) => c.tabela === 'demonstrativos_gd');
    expect(chamadasTabela).toHaveLength(2);
    expect(chamadasTabela[0].ops).toContainEqual(['range', [0, 999]]);
    expect(chamadasTabela[1].ops).toContainEqual(['range', [1000, 1999]]);
  });

  it('gravarManual nao passa por cima de mes que veio confirmado da concessionaria', async () => {
    const { db, chamadas } = fakeDb({ demonstrativos_gd: [{ data: [{ origem_verificada: true }], error: null }] });
    const r = await criarRepoTelaGd(db, 'E1').gravarManual({ instalacao: '1', referencia: '2026-08-01' } as any);
    expect(r).toBe('mantido_verificado');
    expect(chamadas.some((c) => c.ops.some(([op]) => op === 'upsert'))).toBe(false);
  });

  it('gravarManual grava quando nao ha mes verificado', async () => {
    const { db, chamadas } = fakeDb({ demonstrativos_gd: [{ data: [], error: null }, { data: [{ id: 'novo' }], error: null }] });
    const r = await criarRepoTelaGd(db, 'E1').gravarManual({ instalacao: '1', referencia: '2026-08-01' } as any);
    expect(r).toBe('gravado');
    expect(chamadas[1].ops[0][0]).toBe('upsert');
  });

  it('gravarManual devolve mantido_verificado quando o upsert nao devolve linha (gatilho manteve o verificado)', async () => {
    const { db } = fakeDb({ demonstrativos_gd: [{ data: [], error: null }, { data: [], error: null }] });
    const r = await criarRepoTelaGd(db, 'E1').gravarManual({ instalacao: '1', referencia: '2026-08-01' } as any);
    expect(r).toBe('mantido_verificado');
  });

  it('gravarManual sempre grava com o company_id do operador, mesmo que o registro venha com outro', async () => {
    const { db, chamadas } = fakeDb({ demonstrativos_gd: [{ data: [], error: null }, { data: [{ id: 'novo' }], error: null }] });
    await criarRepoTelaGd(db, 'E1').gravarManual({ instalacao: '1', referencia: '2026-08-01', company_id: 'E2' } as any);
    const upsertCall = chamadas[1].ops.find(([op]) => op === 'upsert');
    expect(upsertCall?.[1][0]).toMatchObject({ company_id: 'E1' });
  });

  it('salvarGeracaoManual grava na empresa do operador (company_id nunca vem da tela)', async () => {
    const { db, chamadas } = fakeDb({ geracao_mensal_gd: [{ data: null, error: null }] });
    await criarRepoTelaGd(db, 'E1').salvarGeracaoManual({
      leadId: 'L1', instalacao: '1', referencia: '2026-08-01', kwh: 612.4, conferidoPor: 'u1',
    });
    const [op, args] = chamadas[0].ops[0];
    expect(op).toBe('upsert');
    expect(args[0]).toMatchObject({ company_id: 'E1', kwh: 612.4, origem: 'digitado', conferido_por: 'u1' });
  });

  it('sistemaDoLead soma o kWp dos sistemas e pega a UF', async () => {
    const { db } = fakeDb({ sistemas_clientes: [{ data: [{ potencia_kwp: 3, uf: 'DF' }, { potencia_kwp: 2.5, uf: 'DF' }], error: null }] });
    expect(await criarRepoTelaGd(db, 'E1').sistemaDoLead('L1')).toEqual({ potenciaKwp: 5.5, uf: 'DF' });
  });

  it('sistemaDoLead so conta sistema ativo e usa a UF da primeira linha que tiver', async () => {
    const { db, chamadas } = fakeDb({ sistemas_clientes: [{ data: [{ potencia_kwp: 3, uf: null }, { potencia_kwp: 2, uf: 'DF' }], error: null }] });
    const r = await criarRepoTelaGd(db, 'E1').sistemaDoLead('L1');
    expect(r).toEqual({ potenciaKwp: 5, uf: 'DF' });
    expect(chamadas[0].ops).toContainEqual(['eq', ['ativo', true]]);
  });

  it('leadDaEmpresa so acha lead da propria empresa', async () => {
    const { db, chamadas } = fakeDb({ leads: [{ data: [], error: null }] });
    expect(await criarRepoTelaGd(db, 'E1').leadDaEmpresa('L9')).toBeNull();
    expect(chamadas[0].ops).toContainEqual(['eq', ['company_id', 'E1']]);
  });

  it('buscarLeads tira asterisco e barra invertida do termo (protege o ILIKE)', async () => {
    const { db: db1, chamadas: c1 } = fakeDb({ leads: [{ data: [], error: null }] });
    await criarRepoTelaGd(db1, 'E1').buscarLeads('jo*o');
    expect(c1[0].ops.find(([op]) => op === 'ilike')?.[1][1]).toBe('%jo o%');

    const { db: db2, chamadas: c2 } = fakeDb({ leads: [{ data: [], error: null }] });
    await criarRepoTelaGd(db2, 'E1').buscarLeads('jo\\o');
    expect(c2[0].ops.find(([op]) => op === 'ilike')?.[1][1]).toBe('%jo o%');
  });

  it('ligarLead filtra company_id nas duas atualizacoes', async () => {
    const { db, chamadas } = fakeDb({
      demonstrativos_gd: [{ data: null, error: null }],
      geracao_mensal_gd: [{ data: null, error: null }],
    });
    await criarRepoTelaGd(db, 'E1').ligarLead('200002', 'L1');
    const c1 = chamadas.find((c) => c.tabela === 'demonstrativos_gd');
    const c2 = chamadas.find((c) => c.tabela === 'geracao_mensal_gd');
    expect(c1?.ops).toContainEqual(['eq', ['company_id', 'E1']]);
    expect(c2?.ops).toContainEqual(['eq', ['company_id', 'E1']]);
  });

  it('geracoesManuais filtra por referencia quando informada', async () => {
    const { db, chamadas } = fakeDb({ geracao_mensal_gd: [{ data: [], error: null }] });
    await criarRepoTelaGd(db, 'E1').geracoesManuais(['1'], '2026-08-01');
    expect(chamadas[0].ops).toContainEqual(['eq', ['referencia', '2026-08-01']]);
  });

  it('geracoesManuais sem referencia nao filtra por mes', async () => {
    const { db, chamadas } = fakeDb({ geracao_mensal_gd: [{ data: [], error: null }] });
    await criarRepoTelaGd(db, 'E1').geracoesManuais(['1']);
    expect(chamadas[0].ops.some(([op, args]) => op === 'eq' && args[0] === 'referencia')).toBe(false);
  });

  it('geracoesManuais divide UCs em lotes de 200 por .in()', async () => {
    const instalacoes = Array.from({ length: 450 }, (_, i) => String(i));
    const { db, chamadas } = fakeDb({ geracao_mensal_gd: [
      { data: [], error: null }, { data: [], error: null }, { data: [], error: null },
    ] });
    await criarRepoTelaGd(db, 'E1').geracoesManuais(instalacoes);
    const chamadasIn = chamadas.filter((c) => c.tabela === 'geracao_mensal_gd');
    expect(chamadasIn).toHaveLength(3);
    expect(chamadasIn[0].ops.find(([op]) => op === 'in')?.[1][1]).toHaveLength(200);
    expect(chamadasIn[1].ops.find(([op]) => op === 'in')?.[1][1]).toHaveLength(200);
    expect(chamadasIn[2].ops.find(([op]) => op === 'in')?.[1][1]).toHaveLength(50);
  });
});
