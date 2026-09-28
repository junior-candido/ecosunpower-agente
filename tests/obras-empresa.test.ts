// Revisão de segurança do R15 (28/09/2026): as rotas do Quadro de Obras não
// conferiam a EMPRESA da usina. Com o banco no serviço (RLS_TENANT_ROTAS
// desligado, que é o de hoje em produção):
//  - GET /usinas/kanban listava as obras de TODAS as empresas para o tenant;
//  - POST /usinas/:id/set-etapa-obra e /usinas/set-etapa-obra-lote moviam
//    usina de OUTRA empresa pelo id;
//  - GET /usinas/:id/contato devolvia nome/telefone/e-mail do cliente da usina
//    de outra empresa;
//  - /usinas/vincular (GET) mostrava usinas sem cliente de todas as empresas e
//    o POST vinculava usina de outra empresa a um cliente do operador.
// Agora tudo passa por obras-store.ts, que filtra pela empresa da SESSÃO
// (EcoSun também enxerga a usina legada sem carimbo, company_id null).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { bancoFalso, type Linha } from './helpers/banco-falso.js';
import {
  listarObras, moverObra, moverObrasLote, lerUsinaDoContato, listarUsinasSemCliente, vincularUsinaAoCliente,
} from '../src/modules/dashboard/obras-store.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const TENANT = 'aaaa1111-2222-3333-4444-555566667777';
const E1 = '11111111-1111-4111-8111-000000000001';
const E2 = '11111111-1111-4111-8111-000000000002'; // legado sem carimbo = EcoSun
const T1 = '22222222-2222-4222-8222-000000000001';

const usina = (id: string, company: string | null, extra: Linha = {}): Linha => ({
  id, company_id: company, apelido: `Usina ${id.slice(-1)}`, cidade: 'Cidade Exemplo', uf: 'DF', potencia_kwp: 5,
  etapa_obra: 'projeto', etapa_obra_updated_at: null, ativo: true, lead_id: null, ...extra,
});
const banco = () => bancoFalso({
  sistemas_clientes: [usina(E1, ECOSUN), usina(E2, null), usina(T1, TENANT)],
});

describe('obras-store — empresa da sessão em toda consulta', () => {
  it('listarObras: tenant só vê as dele; EcoSun vê as dela + legado sem carimbo', async () => {
    const b = banco();
    expect((await listarObras(b.client, TENANT)).map((u) => u.id)).toEqual([T1]);
    expect((await listarObras(b.client, ECOSUN)).map((u) => u.id).sort()).toEqual([E1, E2]);
  });

  it('sem empresa na sessão → nada (fail-closed)', async () => {
    const b = banco();
    expect(await listarObras(b.client, undefined)).toEqual([]);
    expect(await moverObra(b.client, undefined, T1, 'operacao')).toBe(false);
    expect(await moverObrasLote(b.client, null, [T1], 'operacao')).toEqual([]);
    expect(await lerUsinaDoContato(b.client, undefined, T1)).toBeNull();
    expect(await listarUsinasSemCliente(b.client, undefined)).toEqual([]);
    expect(await vincularUsinaAoCliente(b.client, undefined, T1, 'L1')).toBe(false);
    expect(b.ops.filter((o) => o.tipo === 'update')).toEqual([]);
  });

  it('moverObra: tenant NÃO move usina da EcoSun pelo id; move a dele', async () => {
    const b = banco();
    expect(await moverObra(b.client, TENANT, E1, 'operacao')).toBe(false);
    expect(b.tabelas.sistemas_clientes.find((u) => u.id === E1)!.etapa_obra).toBe('projeto');
    expect(await moverObra(b.client, TENANT, T1, 'operacao')).toBe(true);
    expect(b.tabelas.sistemas_clientes.find((u) => u.id === T1)!.etapa_obra).toBe('operacao');
    expect(b.tabelas.sistemas_clientes.find((u) => u.id === T1)!.etapa_obra_updated_at).toBeTruthy();
  });

  it('moverObra: EcoSun move a legada sem carimbo, mas não a do tenant', async () => {
    const b = banco();
    expect(await moverObra(b.client, ECOSUN, E2, 'vistoria')).toBe(true);
    expect(await moverObra(b.client, ECOSUN, T1, 'vistoria')).toBe(false);
    expect(b.tabelas.sistemas_clientes.find((u) => u.id === T1)!.etapa_obra).toBe('projeto');
  });

  it('moverObrasLote: ids de outra empresa ficam de fora (devolve só os movidos)', async () => {
    const b = banco();
    expect(await moverObrasLote(b.client, TENANT, [E1, E2, T1], 'instalacao')).toEqual([T1]);
    const et = Object.fromEntries(b.tabelas.sistemas_clientes.map((u) => [u.id, u.etapa_obra]));
    expect(et).toEqual({ [E1]: 'projeto', [E2]: 'projeto', [T1]: 'instalacao' });
  });

  it('lerUsinaDoContato: tenant não lê a usina (e o cliente) da EcoSun', async () => {
    const b = banco();
    expect(await lerUsinaDoContato(b.client, TENANT, E1)).toBeNull();
    expect((await lerUsinaDoContato(b.client, TENANT, T1))?.id).toBe(T1);
    expect((await lerUsinaDoContato(b.client, ECOSUN, E2))?.id).toBe(E2);
  });

  it('listarUsinasSemCliente / vincularUsinaAoCliente: só usina da empresa da sessão', async () => {
    const b = banco();
    expect((await listarUsinasSemCliente(b.client, TENANT)).map((u) => u.id)).toEqual([T1]);
    expect(await vincularUsinaAoCliente(b.client, TENANT, E1, 'L-TEN')).toBe(false);
    expect(b.tabelas.sistemas_clientes.find((u) => u.id === E1)!.lead_id).toBeNull();
    expect(await vincularUsinaAoCliente(b.client, TENANT, T1, 'L-TEN')).toBe(true);
    const t = b.tabelas.sistemas_clientes.find((u) => u.id === T1)!;
    expect([t.lead_id, t.etapa_obra]).toEqual(['L-TEN', 'pos_venda']);
  });
});

describe('rotas do Quadro de Obras usam o obras-store (empresa da sessão)', () => {
  const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'router.ts'), 'utf-8');
  const rota = (inicio: string) => {
    const i = fonte.indexOf(inicio);
    expect(i, inicio).toBeGreaterThan(-1);
    return fonte.slice(i, fonte.indexOf('\n  });', i));
  };
  const casos: Array<[string, string]> = [
    ["router.get('/usinas/kanban'", 'listarObras('],
    ["router.post('/usinas/:id/set-etapa-obra'", 'moverObra('],
    ["router.get('/usinas/:id/contato'", 'lerUsinaDoContato('],
    ["router.post('/usinas/set-etapa-obra-lote'", 'moverObrasLote('],
    ["router.get('/usinas/vincular'", 'listarUsinasSemCliente('],
    ["router.post('/usinas/vincular'", 'vincularUsinaAoCliente('],
  ];
  for (const [inicio, fn] of casos) {
    it(`${inicio} → ${fn} com a empresa da sessão, sem consulta crua em sistemas_clientes`, () => {
      const r = rota(inicio);
      expect(r).toContain(fn);
      expect(r).toMatch(/dashUser\??\.companyId/);
      expect(r).not.toContain("from('sistemas_clientes')");
    });
  }
  it('lote: a auditoria registra só os ids movidos (nunca id de outra empresa)', () => {
    const r = rota("router.post('/usinas/set-etapa-obra-lote'");
    expect(r).toContain("entidadeId: movidas.join(',')");
    expect(r).not.toContain("ids.join(',')");
  });
  it('mover sem achar a usina da empresa → 404 (não finge que moveu)', () => {
    expect(rota("router.post('/usinas/:id/set-etapa-obra'")).toMatch(/if \(!movida\)[^\n]*404/);
    expect(rota("router.get('/usinas/:id/contato'")).toMatch(/404/);
  });
});
