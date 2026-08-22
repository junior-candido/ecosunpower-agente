// tests/sombra.test.ts
import { describe, it, expect, vi } from 'vitest';
import { SombraService, makeSombraHandler, cargaFuturaDe, escapeIlike } from '../src/modules/vendas/sombra.js';
import type { ItemPreco } from '../src/modules/vendas/tabela-precos.js';

type Row = Record<string, any>;
function fakeDb() {
  const tabelas: Record<string, Row[]> = { leads: [], propostas_versoes: [] };
  const from = (t: string) => {
    const filtros: Array<(r: Row) => boolean> = [];
    let ordem: { k: string; asc: boolean } | null = null;
    let limite = Infinity;
    const rows = () => {
      let r = tabelas[t].filter(x => filtros.every(f => f(x)));
      if (ordem) r = [...r].sort((a, b) => (a[ordem!.k] > b[ordem!.k] ? 1 : -1) * (ordem!.asc ? 1 : -1));
      return r.slice(0, limite);
    };
    const q: any = {
      select: () => q,
      eq: (k: string, v: any) => { filtros.push(r => r[k] === v); return q; },
      ilike: (k: string, v: string) => { const s = v.replace(/%/g, '').toLowerCase(); filtros.push(r => String(r[k] ?? '').toLowerCase().includes(s)); return q; },
      is: (k: string, v: any) => { filtros.push(r => r[k] == v); return q; },
      order: (k: string, o?: { ascending?: boolean }) => { ordem = { k, asc: o?.ascending !== false }; return q; },
      limit: (n: number) => { limite = n; return q; },
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      insert: async (row: Row) => { tabelas[t].push({ ...row }); return { data: null, error: null }; },
      then: (res: any) => Promise.resolve({ data: rows(), error: null }).then(res),
    };
    return q;
  };
  return { tabelas, client: { from } };
}

/** Variante que falha ao gravar em `propostas_versoes` (sanity de erro de escrita). */
function fakeDbInsertFalha() {
  const tabelas: Record<string, Row[]> = { leads: [], propostas_versoes: [] };
  const from = (t: string) => {
    const filtros: Array<(r: Row) => boolean> = [];
    let ordem: { k: string; asc: boolean } | null = null;
    let limite = Infinity;
    const rows = () => {
      let r = tabelas[t].filter(x => filtros.every(f => f(x)));
      if (ordem) r = [...r].sort((a, b) => (a[ordem!.k] > b[ordem!.k] ? 1 : -1) * (ordem!.asc ? 1 : -1));
      return r.slice(0, limite);
    };
    const q: any = {
      select: () => q,
      eq: (k: string, v: any) => { filtros.push(r => r[k] === v); return q; },
      ilike: (k: string, v: string) => { const s = v.replace(/%/g, '').toLowerCase(); filtros.push(r => String(r[k] ?? '').toLowerCase().includes(s)); return q; },
      is: (k: string, v: any) => { filtros.push(r => r[k] == v); return q; },
      order: (k: string, o?: { ascending?: boolean }) => { ordem = { k, asc: o?.ascending !== false }; return q; },
      limit: (n: number) => { limite = n; return q; },
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      insert: async (row: Row) => {
        if (t === 'propostas_versoes') return { data: null, error: { message: 'boom' } };
        tabelas[t].push({ ...row });
        return { data: null, error: null };
      },
      then: (res: any) => Promise.resolve({ data: rows(), error: null }).then(res),
    };
    return q;
  };
  return { tabelas, client: { from } };
}

const T0 = Date.UTC(2026, 7, 24, 15, 0, 0);
const item = (p: Partial<ItemPreco>): ItemPreco => ({ tipo: 'modulo', marca: 'X', modelo: 'X', potenciaW: null, modulosPorUnidade: null, precoUnitario: 0, unidade: 'un', fonte: 'junior', atualizadoEmMs: T0, ...p });
const tabelaOk = (): ItemPreco[] => [
  item({ tipo: 'modulo', marca: 'Risen', modelo: '715', potenciaW: 715, precoUnitario: 980 }),
  item({ tipo: 'modulo', marca: 'JA', modelo: '625', potenciaW: 625, precoUnitario: 900 }),
  item({ tipo: 'micro', marca: 'Hoymiles', modelo: 'HMS-2000-4T', modulosPorUnidade: 4, precoUnitario: 1450 }),
  item({ tipo: 'estrutura', marca: 'ceramico', modelo: 'ceramico', precoUnitario: 95, unidade: 'modulo' }),
  item({ tipo: 'cabos_protecao', marca: 'geral', modelo: 'geral', precoUnitario: 420, unidade: 'kwp' }),
];

const mk = (db: ReturnType<typeof fakeDb>, tabela: ItemPreco[] = tabelaOk()) => {
  const sendText = vi.fn().mockResolvedValue(undefined);
  const registrarEvento = vi.fn().mockResolvedValue(undefined);
  const svc = new SombraService({
    client: db.client as any, tabela: { itensAtivos: vi.fn().mockResolvedValue(tabela) } as any,
    sendText, registrarEvento, adminPhone: '5561999990000',
  });
  return { svc, sendText, registrarEvento };
};

describe('cargaFuturaDe', () => {
  it('extrai kWh de texto livre do future_demand', () => {
    expect(cargaFuturaDe('vou colocar ar e piscina, uns 900 kwh')).toBe(900);
    expect(cargaFuturaDe('1.200kWh/mês')).toBe(1200);
    expect(cargaFuturaDe('carro elétrico')).toBeNull();
    expect(cargaFuturaDe(null)).toBeNull();
  });
});

describe('escapeIlike', () => {
  it('escapa % e _ do texto que o Junior digitou (curingas do ILIKE)', () => {
    expect(escapeIlike('50%')).toBe('50\\%');
    expect(escapeIlike('joel_lima')).toBe('joel\\_lima');
    expect(escapeIlike('Joel Lima')).toBe('Joel Lima');
  });
});

describe('SombraService.rodarParaLead', () => {
  it('lead qualificado: grava versão 1, loga no Elo e manda card ao Junior', async () => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', name: 'Joel Lima', city: 'Lago Oeste', company_id: 'C1', energy_data: { consumption_kwh: 734 }, future_demand: null });
    const { svc, sendText, registrarEvento } = mk(db);
    const r = await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'teste' });
    expect(r).toMatchObject({ ok: true, versao: 1 });
    expect(db.tabelas.propostas_versoes).toHaveLength(1);
    expect(db.tabelas.propostas_versoes[0]).toMatchObject({ lead_id: 'L1', company_id: 'C1', versao: 1, autor: 'eva', sombra: true });
    expect(db.tabelas.propostas_versoes[0].params_json).toMatchObject({ consumoAlvoKwh: 734, telhado: 'ceramico', telhadoAssumido: true, faixa: 'autonoma', origem: 'teste' });
    expect(db.tabelas.propostas_versoes[0].resultado_json.ok).toBe(true);
    expect(registrarEvento).toHaveBeenCalledWith(db.client, expect.objectContaining({
      tipo: 'comercial:sombra_gerada', departamento: 'comercial', leadId: 'L1', companyId: 'C1',
    }));
    expect(sendText).toHaveBeenCalledWith('5561999990000', expect.stringContaining('🕶️ SOMBRA v1 — Joel Lima (Lago Oeste)'));
  });

  it('segunda rodada vira v2', async () => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', name: 'Joel', energy_data: { consumption_kwh: 734 } });
    const { svc } = mk(db);
    await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'a' });
    const r = await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0 + 1, origem: 'b' });
    expect(r).toMatchObject({ ok: true, versao: 2 });
  });

  it('carga futura maior que a fatura manda no consumo-alvo', async () => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', name: 'Ana', energy_data: { consumption_kwh: 400 }, future_demand: 'piscina, uns 800 kwh' });
    const { svc, sendText } = mk(db);
    await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'x' });
    expect(sendText.mock.calls[0][1]).toContain('800 kWh (fatura 400 · manda a carga futura 800)');
  });

  it('sem consumo → card de erro, sem versão', async () => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', name: 'Zé', energy_data: {} });
    const { svc, sendText } = mk(db);
    const r = await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'x' });
    expect(r).toEqual({ ok: false, erro: 'sem_dados' });
    expect(db.tabelas.propostas_versoes).toHaveLength(0);
    expect(sendText.mock.calls[0][1]).toContain('sem consumo');
  });

  it('abaixo de 500 → fluxo atual, sem versão e sem card no gancho automático (só no comando)', async () => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', name: 'Zé', energy_data: { consumption_kwh: 300 } });
    const { svc, sendText } = mk(db);
    expect(await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'auto', silencioso: true })).toEqual({ ok: false, erro: 'fluxo_atual' });
    expect(sendText).not.toHaveBeenCalled();
    await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'comando' });
    expect(sendText.mock.calls[0][1]).toContain('abaixo de 500');
  });

  it('tabela incompleta → card de erro com o que falta', async () => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', name: 'Joel', energy_data: { consumption_kwh: 734 } });
    const { svc, sendText } = mk(db, []);
    const r = await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'x' });
    expect(r).toMatchObject({ ok: false, erro: 'tabela_incompleta' });
    expect(sendText.mock.calls[0][1]).toContain('falta na tabela: módulo, micro, estrutura ceramico, cabos');
  });

  it('erro ao gravar propostas_versoes → ok:false erro:interno, sem card (sanity de escrita)', async () => {
    const db = fakeDbInsertFalha();
    db.tabelas.leads.push({ id: 'L1', name: 'Joel', energy_data: { consumption_kwh: 734 } });
    const { svc, sendText, registrarEvento } = mk(db as any);
    const r = await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'x' });
    expect(r).toEqual({ ok: false, erro: 'interno' });
    expect(db.tabelas.propostas_versoes).toHaveLength(0);
    expect(sendText).not.toHaveBeenCalled();
    expect(registrarEvento).not.toHaveBeenCalled();
  });

  it('nunca lança', async () => {
    const svc = new SombraService({ client: { from: () => { throw new Error('boom'); } } as any, tabela: {} as any, sendText: vi.fn(), registrarEvento: vi.fn(), adminPhone: 'x' });
    expect(await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'x' })).toEqual({ ok: false, erro: 'interno' });
  });
});

describe('SombraService.rodarSeNuncaRodou', () => {
  it('roda só na primeira vez', async () => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', name: 'Joel', energy_data: { consumption_kwh: 734 } });
    const { svc, sendText } = mk(db);
    await svc.rodarSeNuncaRodou('L1', T0);
    await svc.rodarSeNuncaRodou('L1', T0 + 1);
    expect(db.tabelas.propostas_versoes).toHaveLength(1);
    expect(sendText).toHaveBeenCalledTimes(1);
  });
});

describe('makeSombraHandler', () => {
  const prep = (admin = true) => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', name: 'Joel Lima', energy_data: { consumption_kwh: 734 }, created_at: '2026-08-01' });
    db.tabelas.leads.push({ id: 'L2', name: 'Joelma', energy_data: { consumption_kwh: 600 }, created_at: '2026-08-10' });
    const { svc, sendText } = mk(db);
    const h = makeSombraHandler({ svc, client: db.client as any, isAdminPhone: () => admin, sendText, agoraMs: () => T0 });
    return { h, sendText, db };
  };
  it('não-admin e texto comum não consomem', async () => {
    expect(await prep(false).h('x', '/sombra Joel')).toBe(false);
    expect(await prep().h('x', 'bom dia')).toBe(false);
  });
  it('/sombra sozinho = ajuda', async () => {
    const { h, sendText } = prep();
    expect(await h('x', '/sombra')).toBe(true);
    expect(sendText.mock.calls[0][1]).toContain('/sombra <nome>');
  });
  it('/sombra Joel Lima acha o lead e roda', async () => {
    const { h, sendText, db } = prep();
    expect(await h('x', '/sombra Joel Lima')).toBe(true);
    expect(db.tabelas.propostas_versoes[0].lead_id).toBe('L1');
    expect(sendText.mock.calls.at(-1)![1]).toContain('🕶️ SOMBRA v1 — Joel Lima');
  });
  it('nome ambíguo pega o mais recente e avisa', async () => {
    const { h, sendText, db } = prep();
    await h('x', '/sombra Joel');
    expect(db.tabelas.propostas_versoes[0].lead_id).toBe('L2');
    expect(sendText.mock.calls[0][1]).toContain('2 leads com "Joel"');
  });
  it('nome sem lead avisa', async () => {
    const { h, sendText } = prep();
    await h('x', '/sombra Ninguém');
    expect(sendText.mock.calls[0][1]).toContain('Não achei lead');
  });
});
