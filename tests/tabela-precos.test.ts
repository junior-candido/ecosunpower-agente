// tests/tabela-precos.test.ts
import { describe, it, expect, vi } from 'vitest';
import { TabelaPrecosService, makeTabelaHandler, formatarListaTabela } from '../src/modules/vendas/tabela-precos.js';

type Row = Record<string, any>;
function fakeDb() {
  const tabelas: Record<string, Row[]> = { tabela_precos: [] };
  const from = (t: string) => {
    const filtros: Array<(r: Row) => boolean> = [];
    let patch: Row | null = null;
    const q: any = {
      select: () => q,
      eq: (k: string, v: any) => { filtros.push(r => r[k] === v); return q; },
      order: () => q,
      update: (p: Row) => { patch = p; return q; },
      upsert: async (row: Row, opts: { onConflict: string }) => {
        const keys = opts.onConflict.split(',').map(s => s.trim());
        const ex = tabelas[t].find(r => keys.every(k => r[k] === row[k]));
        if (ex) Object.assign(ex, row); else tabelas[t].push({ ...row });
        return { data: null, error: null };
      },
      then: (res: any) => {
        if (patch) for (const r of tabelas[t]) if (filtros.every(f => f(r))) Object.assign(r, patch);
        const data = tabelas[t].filter(r => filtros.every(f => f(r)));
        return Promise.resolve({ data, error: null }).then(res);
      },
    };
    return q;
  };
  return { tabelas, client: { from } };
}
const T0 = Date.UTC(2026, 7, 24, 15, 0, 0);
const C1 = '00000000-0000-0000-0000-000000000001';

describe('TabelaPrecosService', () => {
  it('atualizar faz upsert pela chave natural e carimba atualizado_em', async () => {
    const db = fakeDb();
    const svc = new TabelaPrecosService({ client: db.client as any, companyId: C1 });
    await svc.atualizar({ tipo: 'modulo', marca: 'JA', modelo: '625', potenciaW: 625, modulosPorUnidade: null, precoUnitario: 980, unidade: 'un', fonte: 'junior' }, T0);
    await svc.atualizar({ tipo: 'modulo', marca: 'JA', modelo: '625', potenciaW: 625, modulosPorUnidade: null, precoUnitario: 950, unidade: 'un', fonte: 'belenus' }, T0 + 1000);
    expect(db.tabelas.tabela_precos).toHaveLength(1);
    expect(db.tabelas.tabela_precos[0]).toMatchObject({ company_id: C1, tipo: 'modulo', marca: 'JA', modelo: '625', preco_unitario: 950, fonte: 'belenus', ativo: true, atualizado_em: new Date(T0 + 1000).toISOString() });
  });

  it('desativar marca ativo=false; itensAtivos não devolve', async () => {
    const db = fakeDb();
    const svc = new TabelaPrecosService({ client: db.client as any, companyId: C1 });
    await svc.atualizar({ tipo: 'modulo', marca: 'JA', modelo: '625', potenciaW: 625, modulosPorUnidade: null, precoUnitario: 980, unidade: 'un', fonte: 'junior' }, T0);
    await svc.desativar({ tipo: 'modulo', marca: 'JA', modelo: '625' });
    expect(db.tabelas.tabela_precos[0].ativo).toBe(false);
    expect(await svc.itensAtivos()).toEqual([]);
  });

  it('itensAtivos devolve no formato do precificador (camelCase + atualizadoEmMs)', async () => {
    const db = fakeDb();
    const svc = new TabelaPrecosService({ client: db.client as any, companyId: C1 });
    await svc.atualizar({ tipo: 'micro', marca: 'Hoymiles', modelo: 'HMS-2000-4T', potenciaW: null, modulosPorUnidade: 4, precoUnitario: 1450, unidade: 'un', fonte: 'junior' }, T0);
    expect(await svc.itensAtivos()).toEqual([{
      tipo: 'micro', marca: 'Hoymiles', modelo: 'HMS-2000-4T', potenciaW: null, modulosPorUnidade: 4, precoUnitario: 1450, unidade: 'un', fonte: 'junior', atualizadoEmMs: T0,
    }]);
  });
});

describe('formatarListaTabela', () => {
  it('agrupa por tipo, marca preço velho (>15 d) e lista vazia', () => {
    const agora = T0;
    const velho = T0 - 16 * 86400_000;
    const txt = formatarListaTabela([
      { tipo: 'modulo', marca: 'JA', modelo: '625', potenciaW: 625, modulosPorUnidade: null, precoUnitario: 980, unidade: 'un', fonte: 'belenus', atualizadoEmMs: velho },
      { tipo: 'micro', marca: 'Hoymiles', modelo: 'HMS-2000-4T', potenciaW: null, modulosPorUnidade: 4, precoUnitario: 1450, unidade: 'un', fonte: 'junior', atualizadoEmMs: agora },
      { tipo: 'estrutura', marca: 'ceramico', modelo: 'ceramico', potenciaW: null, modulosPorUnidade: null, precoUnitario: 95, unidade: 'modulo', fonte: 'junior', atualizadoEmMs: agora },
      { tipo: 'cabos_protecao', marca: 'geral', modelo: 'geral', potenciaW: null, modulosPorUnidade: null, precoUnitario: 420, unidade: 'kwp', fonte: 'junior', atualizadoEmMs: agora },
    ], agora);
    expect(txt).toContain('📋 Tabela de preços');
    expect(txt).toContain('Módulos');
    expect(txt).toContain('JA 625 — R$ 980,00/un ⚠️ 16 d (belenus)');
    expect(txt).toContain('Hoymiles HMS-2000-4T (4 mód.) — R$ 1.450,00/un');
    expect(txt).toContain('ceramico — R$ 95,00/módulo');
    expect(txt).toContain('cabos/proteção — R$ 420,00/kWp');
    expect(formatarListaTabela([], agora)).toContain('vazia');
  });
});

describe('makeTabelaHandler', () => {
  const mk = (db: ReturnType<typeof fakeDb>, admin = true) => {
    const sendText = vi.fn().mockResolvedValue(undefined);
    const svc = new TabelaPrecosService({ client: db.client as any, companyId: C1 });
    const h = makeTabelaHandler({ svc, isAdminPhone: () => admin, sendText, agoraMs: () => T0 });
    return { h, sendText };
  };
  it('não-admin não consome', async () => {
    const { h } = mk(fakeDb(), false);
    expect(await h('5561999990000', '/tabela')).toBe(false);
  });
  it('texto comum não consome', async () => {
    const { h } = mk(fakeDb());
    expect(await h('5561999990000', 'bom dia')).toBe(false);
  });
  it('/tabela JA 625 = 980 grava e confirma', async () => {
    const db = fakeDb(); const { h, sendText } = mk(db);
    expect(await h('5561999990000', '/tabela JA 625 = 980')).toBe(true);
    expect(db.tabelas.tabela_precos).toHaveLength(1);
    expect(sendText.mock.calls[0][1]).toContain('✅ JA 625 — R$ 980,00/un');
  });
  it('erro de formato explica a gramática', async () => {
    const { h, sendText } = mk(fakeDb());
    expect(await h('5561999990000', '/tabela micro GoodWe GW2000-MIS = 1300')).toBe(true);
    expect(sendText.mock.calls[0][1]).toContain('quantos módulos');
  });
  it('/tabela lista', async () => {
    const db = fakeDb(); const { h, sendText } = mk(db);
    await h('5561999990000', '/tabela cabos = 420');
    await h('5561999990000', '/tabela');
    expect(sendText.mock.calls[1][1]).toContain('📋 Tabela de preços');
  });
});
