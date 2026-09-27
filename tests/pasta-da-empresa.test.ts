import { describe, it, expect } from 'vitest';
import { pastaDaEmpresa, donoDaPasta, filtrarPastasDaEmpresa } from '../src/modules/dashboard/pasta-da-empresa.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const TENANT = '22222222-2222-2222-2222-222222222222';
const OUTRO = '33333333-3333-3333-3333-333333333333';

// Banco falso: só o encadeamento que o helper usa (from→select→eq→maybeSingle).
function fakeDb(rows: Record<string, any>) {
  return {
    from(tabela: string) {
      expect(tabela).toBe('pastas_cliente');
      let id = '';
      const q = {
        select() { return q; },
        eq(_c: string, v: string) { id = v; return q; },
        async maybeSingle() { return { data: rows[id] ?? null, error: null }; },
      };
      return q;
    },
  } as any;
}

describe('pastaDaEmpresa — pasta só abre pra empresa dona', () => {
  const db = fakeDb({
    p1: { id: 'p1', lead_id: 'l1', company_id: TENANT, leads: { company_id: TENANT } },
    // pasta com company_id padrão (EcoSun, migration 098) mas lead do tenant
    p2: { id: 'p2', lead_id: 'l2', company_id: ECOSUN, leads: { company_id: TENANT } },
    p3: { id: 'p3', lead_id: 'l3', company_id: ECOSUN, leads: { company_id: ECOSUN } },
    p4: { id: 'p4', lead_id: 'l4', company_id: null, leads: null },
  });

  it('mesma empresa → devolve a pasta (sem o join do lead)', async () => {
    const p = await pastaDaEmpresa(db, 'p1', TENANT);
    expect(p?.id).toBe('p1');
    expect(p).not.toHaveProperty('leads');
  });

  it('outra empresa → null', async () => {
    expect(await pastaDaEmpresa(db, 'p1', OUTRO)).toBeNull();
    expect(await pastaDaEmpresa(db, 'p1', ECOSUN)).toBeNull();
  });

  it('company_id padrão na pasta mas lead do tenant → ok pro tenant, null pra EcoSun', async () => {
    expect((await pastaDaEmpresa(db, 'p2', TENANT))?.id).toBe('p2');
    expect(await pastaDaEmpresa(db, 'p2', ECOSUN)).toBeNull();
  });

  it('pasta da EcoSun continua abrindo pra EcoSun, e não pro tenant', async () => {
    expect((await pastaDaEmpresa(db, 'p3', ECOSUN))?.id).toBe('p3');
    expect(await pastaDaEmpresa(db, 'p3', TENANT)).toBeNull();
  });

  it('sem company em lugar nenhum → dono é a EcoSun (legado)', async () => {
    expect((await pastaDaEmpresa(db, 'p4', ECOSUN))?.id).toBe('p4');
    expect(await pastaDaEmpresa(db, 'p4', TENANT)).toBeNull();
  });

  it('pasta inexistente → null', async () => {
    expect(await pastaDaEmpresa(db, 'nao-existe', ECOSUN)).toBeNull();
  });

  it('erro do banco → null (nunca abre por engano)', async () => {
    const dbErro = { from: () => { const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: { message: 'x' } }) }; return q; } } as any;
    expect(await pastaDaEmpresa(dbErro, 'p1', TENANT)).toBeNull();
  });
});

describe('donoDaPasta / filtrarPastasDaEmpresa — lista', () => {
  it('company_id próprio (não padrão) vence o do lead', () => {
    expect(donoDaPasta({ company_id: TENANT, leads: { company_id: OUTRO } })).toBe(TENANT);
  });

  it('lista mostra só as pastas da empresa', () => {
    const rows = [
      { id: 'a', company_id: ECOSUN, leads: { company_id: ECOSUN } },
      { id: 'b', company_id: ECOSUN, leads: { company_id: TENANT } },
      { id: 'c', company_id: TENANT, leads: { company_id: TENANT } },
    ];
    expect(filtrarPastasDaEmpresa(rows, TENANT).map((r) => r.id)).toEqual(['b', 'c']);
    expect(filtrarPastasDaEmpresa(rows, ECOSUN).map((r) => r.id)).toEqual(['a']);
  });
});

import { listarPastasDaEmpresa } from '../src/modules/dashboard/pasta-da-empresa.js';

// 27/09/2026: a lista do tenant era listPastasCliente(400) + filtro em memória —
// com 400 pastas mais novas de outras empresas, as do tenant sumiam. Agora a
// empresa entra na CONSULTA.
describe('listarPastasDaEmpresa — filtra no banco', () => {
  function fakeLista(respostas: any[][]) {
    const chamadas: Array<Array<[string, any[]]>> = [];
    const db = {
      from(t: string) {
        expect(t).toBe('pastas_cliente');
        const ops: Array<[string, any[]]> = [];
        chamadas.push(ops);
        const dados = respostas[chamadas.length - 1] ?? [];
        const q: any = new Proxy({}, {
          get(_x, prop: string) {
            if (prop === 'then') return (res: any) => Promise.resolve({ data: dados, error: null }).then(res);
            return (...a: any[]) => { ops.push([prop, a]); return q; };
          },
        });
        return q;
      },
    } as any;
    return { db, chamadas };
  }

  it('tenant: pastas com company_id dele + pastas com company_id padrão cujo lead é dele; mais nova primeiro', async () => {
    const { db, chamadas } = fakeLista([
      [{ id: 'c', company_id: TENANT, updated_at: '2026-09-01', leads: { company_id: TENANT } }],
      [
        { id: 'b', company_id: ECOSUN, updated_at: '2026-09-20', leads: { company_id: TENANT } },
        { id: 'c', company_id: TENANT, updated_at: '2026-09-01', leads: { company_id: TENANT } },
      ],
    ]);
    const r = await listarPastasDaEmpresa(db, TENANT, 400);
    expect(r.map((p: any) => p.id)).toEqual(['b', 'c']);
    // 1ª consulta: company_id da pasta = tenant
    expect(chamadas[0]).toContainEqual(['eq', ['company_id', TENANT]]);
    expect(chamadas[0]).toContainEqual(['limit', [400]]);
    // 2ª consulta: pasta com o padrão (EcoSun) + lead do tenant (join inner)
    expect(chamadas[1].find((o) => o[0] === 'select')![1][0]).toMatch(/leads!inner\(/);
    expect(chamadas[1]).toContainEqual(['eq', ['company_id', ECOSUN]]);
    expect(chamadas[1]).toContainEqual(['eq', ['leads.company_id', TENANT]]);
  });

  it('respeita o limite depois de juntar', async () => {
    const { db } = fakeLista([
      [{ id: 'x1', company_id: TENANT, updated_at: '2026-09-03' }, { id: 'x2', company_id: TENANT, updated_at: '2026-09-01' }],
      [{ id: 'y1', company_id: ECOSUN, updated_at: '2026-09-02', leads: { company_id: TENANT } }],
    ]);
    expect((await listarPastasDaEmpresa(db, TENANT, 2)).map((p: any) => p.id)).toEqual(['x1', 'y1']);
  });

  it('EcoSun: lista como antes (sem filtro no banco) e fica só com as dela', async () => {
    const { db, chamadas } = fakeLista([[
      { id: 'a', company_id: ECOSUN, updated_at: '2026-09-02', leads: { company_id: ECOSUN } },
      { id: 'b', company_id: ECOSUN, updated_at: '2026-09-01', leads: { company_id: TENANT } },
    ]]);
    expect((await listarPastasDaEmpresa(db, ECOSUN, 400)).map((p: any) => p.id)).toEqual(['a']);
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].some((o) => o[0] === 'eq')).toBe(false);
    expect(chamadas[0]).toContainEqual(['limit', [400]]);
  });
});
