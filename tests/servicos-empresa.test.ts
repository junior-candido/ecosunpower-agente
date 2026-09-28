// Revisão de segurança R14 (28/09/2026): Serviços de campo por EMPRESA.
// O router usa o service_role (sem RLS). Antes: lista e lixeira mostravam os
// serviços de TODAS as empresas; toda rota /servicos/:id (detalhe, excluir,
// restaurar, reabrir, concluir, uploads, confirmar-mídias, link de campo)
// abria/alterava serviço de outra empresa pelo id; a busca de usina listava a
// frota inteira; e o POST /servicos/nova aceitava lead, usina e "quem faz" de
// outra empresa (o reabrir depois REATIVAVA esse usuário e mandava zap pra ele).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  listarServicos, getServico, buscarUsinasDaEmpresa, buscarClientesDaEmpresa, conferirVinculosDoServico, servicoPertenceAoOperador,
} from '../src/modules/dashboard/servicos-store.js';

const CASA = '00000000-0000-0000-0000-000000000001';
const TEN = 'aaaa1111-2222-3333-4444-555566667777';
const OUTRA = 'bbbb1111-2222-3333-4444-555566667777';

type Linha = Record<string, unknown>;
/** Banco falso mínimo que APLICA eq/is/not/or/ilike (se esquecer a empresa, a linha da outra aparece). */
function banco(tabelas: Record<string, Linha[]>) {
  return {
    from(t: string) {
      const preds: Array<(l: Linha) => boolean> = [];
      let unico = false; let lim: number | null = null;
      const q: any = {
        select: () => q, order: () => q,
        limit: (n: number) => { lim = n; return q; },
        eq: (c: string, v: unknown) => { preds.push((l) => l[c] === v); return q; },
        is: (c: string, v: unknown) => { preds.push((l) => (l[c] ?? null) === v); return q; },
        not: (c: string, _op: string, v: unknown) => { preds.push((l) => (l[c] ?? null) !== v); return q; },
        ilike: (c: string, pad: string) => { const t2 = pad.replace(/%/g, '').toLowerCase(); preds.push((l) => String(l[c] ?? '').toLowerCase().includes(t2)); return q; },
        or: (expr: string) => {
          preds.push((l) => expr.split(',').some((p) => {
            const [c, op, ...r] = p.split('.'); const v = r.join('.');
            if (op === 'is') return (l[c] ?? null) === null;
            if (op === 'ilike') return String(l[c] ?? '').toLowerCase().includes(v.replace(/%/g, '').toLowerCase());
            return String(l[c]) === v;
          }));
          return q;
        },
        maybeSingle: () => { unico = true; return q; },
        then: (ok: (r: unknown) => unknown) => {
          let ls = (tabelas[t] ?? []).filter((l) => preds.every((p) => p(l)));
          if (lim !== null) ls = ls.slice(0, lim);
          return Promise.resolve({ data: unico ? (ls[0] ?? null) : ls, error: null }).then(ok);
        },
      };
      return q;
    },
  } as any;
}

const srv = (id: string, company_id: string | null, excluido_em: string | null = null) => ({
  id, company_id, excluido_em, tipo_id: 'visita-tecnica', lead_id: 'l', data_servico: '2026-09-20', status: 'concluido',
  servico_tipos: { nome: 'Visita' }, leads: { name: 'X' }, servico_fotos: [],
});
const DB = () => banco({
  servicos: [srv('s-casa', CASA), srv('s-legado', null), srv('s-ten', TEN), srv('s-outra', OUTRA), srv('s-ten-lixo', TEN, '2026-09-01'), srv('s-outra-lixo', OUTRA, '2026-09-01')],
  sistemas_clientes: [
    { id: 'u1', apelido: 'Usina Sol Casa', ativo: true, company_id: CASA },
    { id: 'u2', apelido: 'Usina Sol Legado', ativo: true, company_id: null },
    { id: 'u3', apelido: 'Usina Sol Tenant', ativo: true, company_id: TEN },
    { id: 'u4', apelido: 'Usina Sol Outra', ativo: true, company_id: OUTRA },
  ],
  leads: [
    { id: 'l-ten', company_id: TEN, name: 'Ana Tenant', phone: '5561900000001' },
    { id: 'l-outra', company_id: OUTRA, name: 'Ana Outra', phone: '5561900000002' },
    { id: 'l-casa', company_id: CASA, name: 'Ana Casa', phone: '5561900000003' },
    { id: 'l-legado', company_id: null, name: 'Ana Legado', phone: null },
  ],
  dashboard_users: [{ id: 'p-ten', company_id: TEN }, { id: 'p-casa', company_id: CASA }],
});

describe('lista e lixeira por empresa', () => {
  it('tenant vê só os dele (nem EcoSun, nem legado, nem outra empresa)', async () => {
    expect((await listarServicos(DB(), 100, false, TEN)).map((s) => s.id)).toEqual(['s-ten']);
    expect((await listarServicos(DB(), 100, true, TEN)).map((s) => s.id)).toEqual(['s-ten-lixo']);
  });
  it('EcoSun vê os dela + legado sem carimbo', async () => {
    expect((await listarServicos(DB(), 100, false, CASA)).map((s) => s.id).sort()).toEqual(['s-casa', 's-legado']);
  });
  it('sessão sem empresa → lista vazia (falha fechado)', async () => {
    expect(await listarServicos(DB(), 100, false, null)).toEqual([]);
  });
});

describe('getServico com a empresa da sessão (todas as rotas /servicos/:id)', () => {
  it('serviço de outra empresa = não achado', async () => {
    expect(await getServico(DB(), 's-outra', TEN)).toBeNull();
    expect(await getServico(DB(), 's-casa', TEN)).toBeNull();
    expect(await getServico(DB(), 's-legado', TEN)).toBeNull();
    expect(await getServico(DB(), 's-ten', CASA)).toBeNull();
    expect(await getServico(DB(), 's-ten', undefined)).toBeNull();
  });
  it('da própria empresa abre (e o legado abre pra EcoSun); lixeira também (restaurar)', async () => {
    expect((await getServico(DB(), 's-ten', TEN))?.id).toBe('s-ten');
    expect((await getServico(DB(), 's-ten-lixo', TEN))?.id).toBe('s-ten-lixo');
    expect((await getServico(DB(), 's-legado', CASA))?.id).toBe('s-legado');
  });
  it('regra: null = EcoSun; sem empresa na sessão nega', () => {
    expect(servicoPertenceAoOperador(null, CASA)).toBe(true);
    expect(servicoPertenceAoOperador(null, TEN)).toBe(false);
    expect(servicoPertenceAoOperador(TEN, null)).toBe(false);
  });
});

describe('busca de usina do "Novo registro"', () => {
  it('tenant só acha as usinas dele', async () => {
    expect((await buscarUsinasDaEmpresa(DB(), TEN, 'sol')).map((u) => u.id)).toEqual(['u3']);
  });
  it('EcoSun acha as dela + legado', async () => {
    expect((await buscarUsinasDaEmpresa(DB(), CASA, 'sol')).map((u) => u.id).sort()).toEqual(['u1', 'u2']);
  });
  it('sem empresa → nada', async () => {
    expect(await buscarUsinasDaEmpresa(DB(), undefined, 'sol')).toEqual([]);
  });
});

describe('busca de cliente do "Novo registro"', () => {
  it('tenant só acha os leads dele; EcoSun acha os dela + legado sem carimbo', async () => {
    expect((await buscarClientesDaEmpresa(DB(), TEN, 'ana')).map((c) => c.id)).toEqual(['l-ten']);
    expect((await buscarClientesDaEmpresa(DB(), CASA, 'ana')).map((c) => c.id).sort()).toEqual(['l-casa', 'l-legado']);
    expect((await buscarClientesDaEmpresa(DB(), CASA, 'legado'))[0]).toEqual({ id: 'l-legado', nome: 'Ana Legado', telefone: '' });
  });
  it('sem empresa → nada; parênteses/aspas não vão pro filtro `or`', async () => {
    expect(await buscarClientesDaEmpresa(DB(), null, 'ana')).toEqual([]);
    expect((await buscarClientesDaEmpresa(DB(), TEN, '(ana"')).map((c) => c.id)).toEqual(['l-ten']);
  });
});

describe('POST /servicos/nova: vínculos têm que ser da empresa', () => {
  it('lead, usina ou pessoa de outra empresa → erro', async () => {
    expect(await conferirVinculosDoServico(DB(), TEN, { leadId: 'l-outra' })).toBe('Cliente não achado.');
    expect(await conferirVinculosDoServico(DB(), TEN, { leadId: 'l-ten', sistemaId: 'u4' })).toBe('Usina não achada.');
    expect(await conferirVinculosDoServico(DB(), TEN, { leadId: 'l-ten', atribuidoA: 'p-casa' })).toBe('Pessoa não achada nesta empresa.');
    expect(await conferirVinculosDoServico(DB(), TEN, { leadId: 'nao-existe' })).toBe('Cliente não achado.');
  });
  it('tudo da empresa → ok', async () => {
    expect(await conferirVinculosDoServico(DB(), TEN, { leadId: 'l-ten', sistemaId: 'u3', atribuidoA: 'p-ten' })).toBeNull();
    expect(await conferirVinculosDoServico(DB(), TEN, {})).toBeNull();
  });
});

describe('router: toda rota /servicos* do painel passa a empresa da sessão', () => {
  const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'router.ts'), 'utf-8');
  const ini = fonte.indexOf("router.get('/servicos', exigir('servicos'");
  const trecho = fonte.slice(ini, fonte.indexOf('// ----- MINHA ASSINATURA', ini));
  it('lista e lixeira filtram por empresa', () => {
    const chamadas = trecho.match(/listarServicos\([^)]*\)/g) ?? [];
    expect(chamadas.length).toBe(2);
    for (const c of chamadas) expect(c).toContain('req.dashUser!.companyId');
  });
  it('todo getServico leva a empresa da sessão', () => {
    const chamadas = (trecho.match(/getServico\(supabase, .*?\);/g) ?? []).map((c) => c.slice(0, -1));
    const sem = chamadas.filter((c) => !c.includes('req.dashUser!.companyId'));
    expect(chamadas.length).toBeGreaterThanOrEqual(9);
    expect(sem).toEqual([]);
  });
  it('excluir e restaurar conferem o dono ANTES de mexer', () => {
    for (const rota of ['excluir', 'restaurar']) {
      const i = trecho.indexOf(`router.post('/servicos/:id/${rota}'`);
      const corpo = trecho.slice(i, trecho.indexOf('router.', i + 10));
      expect(corpo.indexOf('getServico(supabase, String(req.params.id), req.dashUser!.companyId)')).toBeGreaterThan(-1);
      expect(corpo).toMatch(/Servico\(supabase, s\.id\)/);
    }
  });
  it('busca de usina pela função com empresa; nova confere os vínculos', () => {
    expect(trecho).toContain('buscarUsinasDaEmpresa(bancoDoOperador(req, supabase), req.dashUser!.companyId, q)');
    expect(trecho).not.toContain("db.from('sistemas_clientes')");
    expect(trecho).toContain('buscarClientesDaEmpresa(bancoDoOperador(req, supabase), req.dashUser!.companyId, q)');
    expect(trecho).toContain('conferirVinculosDoServico(supabase, req.dashUser!.companyId');
  });
});
