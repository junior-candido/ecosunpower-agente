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

  it('gravarManual nao passa por cima de mes que veio confirmado da concessionaria', async () => {
    const { db, chamadas } = fakeDb({ demonstrativos_gd: [{ data: [{ origem_verificada: true }], error: null }] });
    const r = await criarRepoTelaGd(db, 'E1').gravarManual({ instalacao: '1', referencia: '2026-08-01' } as any);
    expect(r).toBe('mantido_verificado');
    expect(chamadas.some((c) => c.ops.some(([op]) => op === 'upsert'))).toBe(false);
  });

  it('gravarManual grava quando nao ha mes verificado', async () => {
    const { db, chamadas } = fakeDb({ demonstrativos_gd: [{ data: [], error: null }, { data: null, error: null }] });
    const r = await criarRepoTelaGd(db, 'E1').gravarManual({ instalacao: '1', referencia: '2026-08-01' } as any);
    expect(r).toBe('gravado');
    expect(chamadas[1].ops[0][0]).toBe('upsert');
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

  it('leadDaEmpresa so acha lead da propria empresa', async () => {
    const { db, chamadas } = fakeDb({ leads: [{ data: [], error: null }] });
    expect(await criarRepoTelaGd(db, 'E1').leadDaEmpresa('L9')).toBeNull();
    expect(chamadas[0].ops).toContainEqual(['eq', ['company_id', 'E1']]);
  });
});
