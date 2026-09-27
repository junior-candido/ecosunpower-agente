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
