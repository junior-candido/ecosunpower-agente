// tests/estado-venda.test.ts
import { describe, it, expect, vi } from 'vitest';
import { EstadoVendaService } from '../src/modules/vendas/estado-venda.js';

type Row = Record<string, any>;

interface FakeDbOpts {
  maybeSingleError?: { message: string } | null;
  updateError?: { message: string } | null;
  /** Simula outro processo tendo mudado o estado entre a leitura e a escrita: o filtro .or() nunca casa. */
  orNuncaCasa?: boolean;
}

function fakeDb(opts: FakeDbOpts = {}) {
  const tabelas: Record<string, Row[]> = { leads: [], eventos_elo: [] };
  const from = (t: string) => {
    const filtros: Array<(r: Row) => boolean> = [];
    let patch: Row | null = null;
    let orFiltro: ((r: Row) => boolean) | null = null;
    const q: any = {
      select: () => q,
      eq: (k: string, v: any) => { filtros.push(r => r[k] === v); return q; },
      maybeSingle: async () => {
        if (opts.maybeSingleError) return { data: null, error: opts.maybeSingleError };
        return { data: tabelas[t].find(r => filtros.every(f => f(r))) ?? null, error: null };
      },
      update: (p: Row) => { patch = p; return q; },
      // Parser simples de "estado_venda.eq.X,estado_venda.is.null" (formato do PostgREST .or()).
      or: (expr: string) => {
        if (opts.orNuncaCasa) { orFiltro = () => false; return q; }
        const clausulas = expr.split(',').map(c => c.split('.'));
        orFiltro = (r: Row) => clausulas.some(([campo, op, valor]) => {
          if (op === 'is' && valor === 'null') return r[campo] == null;
          if (op === 'eq') return String(r[campo]) === valor;
          return false;
        });
        return q;
      },
      insert: async (rows: Row | Row[]) => { tabelas[t].push(...(Array.isArray(rows) ? rows : [rows])); return { data: null, error: null }; },
      then: (res: any) => {
        if (!patch) return Promise.resolve({ data: null, error: null }).then(res);
        if (opts.updateError) return Promise.resolve({ data: null, error: opts.updateError }).then(res);
        const alvo = tabelas[t].filter(r => filtros.every(f => f(r)) && (!orFiltro || orFiltro(r)));
        for (const r of alvo) Object.assign(r, patch);
        return Promise.resolve({ data: alvo.map(r => ({ id: r.id })), error: null }).then(res);
      },
    };
    return q;
  };
  return { tabelas, client: { from } };
}
const T0 = Date.UTC(2026, 7, 24, 15, 0, 0);

describe('EstadoVendaService', () => {
  it('NOVO → QUALIFICADO grava estado, carimbo e evento no Elo', async () => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', estado_venda: null, company_id: 'C1' });
    const reg = vi.fn().mockResolvedValue(undefined);
    const svc = new EstadoVendaService({ client: db.client as any, registrarEvento: reg });
    const r = await svc.transicionar({ leadId: 'L1', para: 'QUALIFICADO', motivo: 'consumo informado', autor: 'eva', agoraMs: T0 });
    expect(r).toEqual({ ok: true, de: 'NOVO', para: 'QUALIFICADO' });
    expect(db.tabelas.leads[0].estado_venda).toBe('QUALIFICADO');
    expect(db.tabelas.leads[0].estado_venda_em).toBe(new Date(T0).toISOString());
    expect(reg).toHaveBeenCalledWith(db.client, expect.objectContaining({
      tipo: 'comercial:estado_venda', leadId: 'L1', companyId: 'C1', departamento: 'comercial',
      payload: expect.objectContaining({ de: 'NOVO', para: 'QUALIFICADO', motivo: 'consumo informado', autor: 'eva' }),
    }));
  });

  it('rejeita transição inválida sem tocar no banco', async () => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', estado_venda: 'FECHADO' });
    const reg = vi.fn();
    const svc = new EstadoVendaService({ client: db.client as any, registrarEvento: reg });
    const r = await svc.transicionar({ leadId: 'L1', para: 'FOLLOWUP_VIVO', motivo: 'x', autor: 'eva', agoraMs: T0 });
    expect(r).toEqual({ ok: false, de: 'FECHADO', para: 'FOLLOWUP_VIVO', erro: 'transicao_invalida' });
    expect(db.tabelas.leads[0].estado_venda).toBe('FECHADO');
    expect(reg).not.toHaveBeenCalled();
  });

  it('mesmo estado = no-op silencioso (idempotente)', async () => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', estado_venda: 'FOLLOWUP_VIVO' });
    const reg = vi.fn();
    const svc = new EstadoVendaService({ client: db.client as any, registrarEvento: reg });
    const r = await svc.transicionar({ leadId: 'L1', para: 'FOLLOWUP_VIVO', motivo: 'x', autor: 'eva', agoraMs: T0 });
    expect(r).toEqual({ ok: true, de: 'FOLLOWUP_VIVO', para: 'FOLLOWUP_VIVO', noop: true });
    expect(reg).not.toHaveBeenCalled();
  });

  it('lead inexistente → erro lead_nao_encontrado', async () => {
    const db = fakeDb();
    const svc = new EstadoVendaService({ client: db.client as any, registrarEvento: vi.fn() });
    const r = await svc.transicionar({ leadId: 'X', para: 'QUALIFICADO', motivo: 'x', autor: 'eva', agoraMs: T0 });
    expect(r.ok).toBe(false);
    expect((r as any).erro).toBe('lead_nao_encontrado');
  });

  it('nunca lança: erro do banco vira {ok:false, erro:"banco"}', async () => {
    const client = { from: () => { throw new Error('boom'); } };
    const svc = new EstadoVendaService({ client: client as any, registrarEvento: vi.fn() });
    const r = await svc.transicionar({ leadId: 'L1', para: 'QUALIFICADO', motivo: 'x', autor: 'eva', agoraMs: T0 });
    expect(r).toEqual({ ok: false, de: 'NOVO', para: 'QUALIFICADO', erro: 'banco' });
  });

  it('maybeSingle retorna erro → {ok:false, erro:"banco"}, sem evento no Elo', async () => {
    const db = fakeDb({ maybeSingleError: { message: 'timeout' } });
    db.tabelas.leads.push({ id: 'L1', estado_venda: null, company_id: 'C1' });
    const reg = vi.fn();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const svc = new EstadoVendaService({ client: db.client as any, registrarEvento: reg });
    const r = await svc.transicionar({ leadId: 'L1', para: 'QUALIFICADO', motivo: 'x', autor: 'eva', agoraMs: T0 });
    expect(r).toEqual({ ok: false, de: 'NOVO', para: 'QUALIFICADO', erro: 'banco' });
    expect(reg).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith('[estado-venda] leitura falhou', 'timeout');
    errSpy.mockRestore();
  });

  it('update retorna erro → {ok:false, erro:"banco"}, sem evento no Elo', async () => {
    const db = fakeDb({ updateError: { message: 'conexão caiu' } });
    db.tabelas.leads.push({ id: 'L1', estado_venda: null, company_id: 'C1' });
    const reg = vi.fn();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const svc = new EstadoVendaService({ client: db.client as any, registrarEvento: reg });
    const r = await svc.transicionar({ leadId: 'L1', para: 'QUALIFICADO', motivo: 'x', autor: 'eva', agoraMs: T0 });
    expect(r).toEqual({ ok: false, de: 'NOVO', para: 'QUALIFICADO', erro: 'banco' });
    expect(db.tabelas.leads[0].estado_venda).toBe(null); // não gravou
    expect(reg).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith('[estado-venda] update falhou', 'conexão caiu');
    errSpy.mockRestore();
  });

  it('lock otimista: estado mudou entre a leitura e a escrita → erro:"transicao_invalida", sem evento no Elo', async () => {
    const db = fakeDb({ orNuncaCasa: true });
    db.tabelas.leads.push({ id: 'L1', estado_venda: null, company_id: 'C1' });
    const reg = vi.fn();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const svc = new EstadoVendaService({ client: db.client as any, registrarEvento: reg });
    const r = await svc.transicionar({ leadId: 'L1', para: 'QUALIFICADO', motivo: 'x', autor: 'eva', agoraMs: T0 });
    expect(r).toEqual({ ok: false, de: 'NOVO', para: 'QUALIFICADO', erro: 'transicao_invalida' });
    expect(db.tabelas.leads[0].estado_venda).toBe(null); // não gravou (outro processo já tinha mudado)
    expect(reg).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('registrar evento falha mas a transição já gravou → ok:true mesmo assim', async () => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', estado_venda: null, company_id: 'C1' });
    const reg = vi.fn().mockRejectedValue(new Error('elo fora do ar'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const svc = new EstadoVendaService({ client: db.client as any, registrarEvento: reg });
    const r = await svc.transicionar({ leadId: 'L1', para: 'QUALIFICADO', motivo: 'x', autor: 'eva', agoraMs: T0 });
    expect(r).toEqual({ ok: true, de: 'NOVO', para: 'QUALIFICADO' });
    expect(db.tabelas.leads[0].estado_venda).toBe('QUALIFICADO');
    expect(reg).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
