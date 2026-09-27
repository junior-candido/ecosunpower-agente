import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { searchLeadByName } from '../src/modules/closing/closing-data-fetcher.js';

// A Eva do admin ("contrato <nome>", "/fechar <nome>") busca o cliente por nome.
// Sem filtro de empresa, "contrato Maria" achava a Maria de OUTRA empresa e
// gerava o contrato dela. A busca fica presa à empresa de quem pediu.

function fakeLeads(linhas: any[]) {
  return {
    from() {
      const eqs: Array<[string, unknown]> = [];
      let ilike: [string, string] | null = null;
      const b: any = {
        select: () => b,
        eq: (c: string, v: unknown) => { eqs.push([c, v]); return b; },
        ilike: (c: string, v: string) => { ilike = [c, v]; return b; },
        or: () => b,
        order: () => b,
        limit: async () => ({
          data: linhas
            .filter((l) => eqs.every(([c, v]) => l[c] === v))
            .filter((l) => {
              if (!ilike) return true;
              const termo = ilike[1].replace(/%/g, '').toLowerCase();
              return String(l[ilike[0]] ?? '').toLowerCase().includes(termo);
            }),
          error: null,
        }),
      };
      return b;
    },
  } as any;
}

const LEADS = [
  { id: 'a', name: 'Maria Souza', phone: '5561999990001', company_id: 'emp-1' },
  { id: 'b', name: 'Maria Lima', phone: '5561999990002', company_id: 'emp-2' },
];

describe('searchLeadByName — escopo de empresa', () => {
  it('com companyId: só leads daquela empresa (nome)', async () => {
    const r = await searchLeadByName(fakeLeads(LEADS), 'Maria', { companyId: 'emp-1' });
    expect(r.map((l) => l.id)).toEqual(['a']);
  });

  it('com companyId: telefone também respeita a empresa', async () => {
    const r = await searchLeadByName(fakeLeads(LEADS), '61999990002', { companyId: 'emp-1' });
    expect(r.map((l) => l.id)).toEqual([]);
  });

  it('com companyId: o fallback sem acento também respeita a empresa', async () => {
    const r = await searchLeadByName(fakeLeads([{ id: 'c', name: 'Márcio', phone: null, company_id: 'emp-2' }]), 'Marcio', { companyId: 'emp-1' });
    expect(r).toEqual([]);
  });
});

describe('index.ts — a Eva do admin busca só na empresa dela', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'index.ts'), 'utf-8');
  it('toda chamada de searchLeadByName passa a empresa', () => {
    const chamadas = src.match(/searchLeadByName\(.*$/gm) ?? [];
    expect(chamadas.length).toBeGreaterThan(0);
    for (const c of chamadas) expect(c).toMatch(/companyId/);
  });
});
