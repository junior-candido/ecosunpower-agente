// tests/tabela-precos.test.ts
import { describe, it, expect, vi } from 'vitest';
import { TabelaPrecosService, makeTabelaHandler, formatarListaTabela } from '../src/modules/vendas/tabela-precos.js';
import type { ItemTabela } from '../src/modules/vendas/tabela-precos-parser.js';

type Row = Record<string, any>;
/** Banco de mentira. `erro` liga a falha do Supabase em toda operação. */
function fakeDb(erro?: string) {
  const tabelas: Record<string, Row[]> = { tabela_precos: [] };
  const falha = erro ? { data: null, error: { message: erro } } : null;
  const from = (t: string) => {
    const filtros: Array<(r: Row) => boolean> = [];
    let patch: Row | null = null;
    const q: any = {
      select: () => q,
      eq: (k: string, v: any) => { filtros.push(r => r[k] === v); return q; },
      order: () => q,
      update: (p: Row) => { patch = p; return q; },
      upsert: async (row: Row, opts: { onConflict: string }) => {
        if (falha) return falha;
        const keys = opts.onConflict.split(',').map(s => s.trim());
        const ex = tabelas[t].find(r => keys.every(k => r[k] === row[k]));
        if (ex) Object.assign(ex, row); else tabelas[t].push({ ...row });
        return { data: null, error: null };
      },
      then: (res: any) => {
        if (falha) return Promise.resolve(falha).then(res);
        const atingidas = tabelas[t].filter(r => filtros.every(f => f(r)));
        if (patch) for (const r of atingidas) Object.assign(r, patch);
        return Promise.resolve({ data: atingidas, error: null }).then(res);
      },
    };
    return q;
  };
  return { tabelas, client: { from } };
}
const T0 = Date.UTC(2026, 7, 24, 15, 0, 0);
const C1 = '00000000-0000-0000-0000-000000000001';
const mkSvc = (db: ReturnType<typeof fakeDb>) => {
  const registrarEvento = vi.fn().mockResolvedValue(undefined);
  const svc = new TabelaPrecosService({ client: db.client as any, companyId: C1, registrarEvento });
  return { svc, registrarEvento };
};
const JA625: ItemTabela = { tipo: 'modulo', marca: 'JA', modelo: '625', potenciaW: 625, modulosPorUnidade: null, precoUnitario: 980, unidade: 'un', fonte: 'junior' };

describe('TabelaPrecosService', () => {
  it('atualizar faz upsert pela chave natural e carimba atualizado_em', async () => {
    const db = fakeDb(); const { svc } = mkSvc(db);
    expect(await svc.atualizar(JA625, T0)).toEqual({ ok: true });
    expect(await svc.atualizar({ ...JA625, precoUnitario: 950, fonte: 'belenus' }, T0 + 1000)).toEqual({ ok: true });
    expect(db.tabelas.tabela_precos).toHaveLength(1);
    expect(db.tabelas.tabela_precos[0]).toMatchObject({ company_id: C1, tipo: 'modulo', marca: 'JA', modelo: '625', preco_unitario: 950, fonte: 'belenus', ativo: true, atualizado_em: new Date(T0 + 1000).toISOString() });
  });

  it('chave natural ignora maiúscula/minúscula: "JA" e depois "ja" é a MESMA linha', async () => {
    const db = fakeDb(); const { svc } = mkSvc(db);
    await svc.atualizar(JA625, T0);
    await svc.atualizar({ ...JA625, marca: 'ja', precoUnitario: 950 }, T0 + 1000);
    expect(db.tabelas.tabela_precos).toHaveLength(1);
    expect(db.tabelas.tabela_precos[0]).toMatchObject({ marca: 'ja', marca_key: 'ja', modelo_key: '625', preco_unitario: 950 });
    expect(await svc.itensAtivos()).toHaveLength(1);
  });

  it('desativar marca ativo=false; itensAtivos não devolve', async () => {
    const db = fakeDb(); const { svc } = mkSvc(db);
    await svc.atualizar(JA625, T0);
    expect(await svc.desativar({ tipo: 'modulo', marca: 'ja', modelo: '625' })).toEqual({ ok: true });
    expect(db.tabelas.tabela_precos[0].ativo).toBe(false);
    expect(await svc.itensAtivos()).toEqual([]);
  });

  it('desativar item que não existe devolve nao_encontrado (nunca mente que tirou)', async () => {
    const db = fakeDb(); const { svc } = mkSvc(db);
    expect(await svc.desativar({ tipo: 'modulo', marca: 'Risen', modelo: '715' })).toEqual({ ok: false, erro: 'nao_encontrado' });
  });

  it('itensAtivos devolve no formato do precificador (camelCase + atualizadoEmMs)', async () => {
    const db = fakeDb(); const { svc } = mkSvc(db);
    await svc.atualizar({ tipo: 'micro', marca: 'Hoymiles', modelo: 'HMS-2000-4T', potenciaW: null, modulosPorUnidade: 4, precoUnitario: 1450, unidade: 'un', fonte: 'junior' }, T0);
    expect(await svc.itensAtivos()).toEqual([{
      tipo: 'micro', marca: 'Hoymiles', modelo: 'HMS-2000-4T', potenciaW: null, modulosPorUnidade: 4, precoUnitario: 1450, unidade: 'un', fonte: 'junior', atualizadoEmMs: T0,
    }]);
  });

  it('erro do banco: atualizar/desativar devolvem ok:false; listar devolve ok:false; itensAtivos devolve []', async () => {
    const db = fakeDb('boom'); const { svc } = mkSvc(db);
    expect(await svc.atualizar(JA625, T0)).toEqual({ ok: false, erro: 'boom' });
    expect(await svc.desativar({ tipo: 'modulo', marca: 'JA', modelo: '625' })).toEqual({ ok: false, erro: 'boom' });
    expect(await svc.listar()).toEqual({ ok: false });
    expect(await svc.itensAtivos()).toEqual([]);
  });

  it('erro do banco não vira evento no Elo', async () => {
    const db = fakeDb('boom'); const { svc, registrarEvento } = mkSvc(db);
    await svc.atualizar(JA625, T0);
    await svc.desativar({ tipo: 'modulo', marca: 'JA', modelo: '625' });
    expect(registrarEvento).not.toHaveBeenCalled();
  });

  it('gravação boa registra evento no Elo (comercial:tabela_preco)', async () => {
    const db = fakeDb(); const { svc, registrarEvento } = mkSvc(db);
    await svc.atualizar({ ...JA625, fonte: 'belenus' }, T0);
    expect(registrarEvento).toHaveBeenCalledTimes(1);
    expect(registrarEvento.mock.calls[0][1]).toMatchObject({
      tipo: 'comercial:tabela_preco', departamento: 'comercial', canal: 'sistema', origem: 'tabela-precos', companyId: C1,
      payload: { acao: 'atualizar', tipo: 'modulo', marca: 'JA', modelo: '625', precoUnitario: 980, fonte: 'belenus' },
    });
    await svc.desativar({ tipo: 'modulo', marca: 'JA', modelo: '625' });
    expect(registrarEvento.mock.calls[1][1]).toMatchObject({ payload: { acao: 'desativar', tipo: 'modulo', marca: 'JA', modelo: '625' } });
  });

  it('Elo quebrado não derruba a gravação', async () => {
    const db = fakeDb();
    const svc = new TabelaPrecosService({ client: db.client as any, companyId: C1, registrarEvento: vi.fn().mockRejectedValue(new Error('elo off')) });
    expect(await svc.atualizar(JA625, T0)).toEqual({ ok: true });
    expect(db.tabelas.tabela_precos).toHaveLength(1);
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
    const { svc, registrarEvento } = mkSvc(db);
    const h = makeTabelaHandler({ svc, isAdminPhone: () => admin, sendText, agoraMs: () => T0 });
    return { h, sendText, svc, registrarEvento };
  };
  it('não-admin não consome', async () => {
    const { h } = mk(fakeDb(), false);
    expect(await h('5561999990000', '/tabela')).toBe(false);
  });
  it('texto comum não consome', async () => {
    const { h } = mk(fakeDb());
    expect(await h('5561999990000', 'bom dia')).toBe(false);
    expect(await h('5561999990000', 'tabela de precos chegou')).toBe(false);
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
  it('"/tabela JA 625 =" cai na ajuda, não em "preço tem que ser maior que zero"', async () => {
    const { h, sendText } = mk(fakeDb());
    expect(await h('5561999990000', '/tabela JA 625 =')).toBe(true);
    expect(sendText.mock.calls[0][1]).toContain('Não entendi');
    expect(sendText.mock.calls[0][1]).toContain('Wp');
  });
  it('/tabela lista', async () => {
    const db = fakeDb(); const { h, sendText } = mk(db);
    await h('5561999990000', '/tabela cabos = 420');
    await h('5561999990000', '/tabela');
    expect(sendText.mock.calls[1][1]).toContain('📋 Tabela de preços');
  });
  it('leitura falhou não pode virar "tabela vazia"', async () => {
    const { h, sendText } = mk(fakeDb('boom'));
    expect(await h('5561999990000', '/tabela')).toBe(true);
    expect(sendText.mock.calls[0][1]).toContain('não consegui ler a tabela');
    expect(sendText.mock.calls[0][1]).not.toContain('vazia');
  });
  it('gravação falhou nunca responde ✅', async () => {
    const { h, sendText } = mk(fakeDb('boom'));
    expect(await h('5561999990000', '/tabela JA 625 = 980')).toBe(true);
    expect(sendText.mock.calls[0][1]).not.toContain('✅');
    expect(sendText.mock.calls[0][1]).toContain('⚠️');
  });
  it('tirar item que não está na tabela avisa que não achou', async () => {
    const { h, sendText } = mk(fakeDb());
    expect(await h('5561999990000', '/tabela tira Risen 715')).toBe(true);
    expect(sendText.mock.calls[0][1]).toBe('Não achei Risen 715 na tabela.');
  });
  it('/tabela tira cabos fala o nome bonito', async () => {
    const db = fakeDb(); const { h, sendText } = mk(db);
    await h('5561999990000', '/tabela cabos = 420');
    await h('5561999990000', '/tabela tira cabos');
    expect(sendText.mock.calls[1][1]).toBe('🗑️ cabos/proteção saiu da tabela.');
  });
});
