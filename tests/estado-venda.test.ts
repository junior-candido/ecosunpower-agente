// tests/estado-venda.test.ts
import { describe, it, expect, vi } from 'vitest';
import { EstadoVendaService } from '../src/modules/vendas/estado-venda.js';

type Row = Record<string, any>;
function fakeDb() {
  const tabelas: Record<string, Row[]> = { leads: [], eventos_elo: [] };
  const from = (t: string) => {
    const filtros: Array<(r: Row) => boolean> = [];
    let patch: Row | null = null;
    const q: any = {
      select: () => q,
      eq: (k: string, v: any) => { filtros.push(r => r[k] === v); return q; },
      maybeSingle: async () => ({ data: tabelas[t].find(r => filtros.every(f => f(r))) ?? null, error: null }),
      update: (p: Row) => { patch = p; return q; },
      insert: async (rows: Row | Row[]) => { tabelas[t].push(...(Array.isArray(rows) ? rows : [rows])); return { data: null, error: null }; },
      then: (res: any) => {
        if (patch) for (const r of tabelas[t]) if (filtros.every(f => f(r))) Object.assign(r, patch);
        return Promise.resolve({ data: null, error: null }).then(res);
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
    const svc = new EstadoVendaService({ client: db.client as any, registrarEvento: vi.fn().mockResolvedValue(undefined) });
    const r = await svc.transicionar({ leadId: 'L1', para: 'QUALIFICADO', motivo: 'consumo informado', autor: 'eva', agoraMs: T0 });
    expect(r).toEqual({ ok: true, de: 'NOVO', para: 'QUALIFICADO' });
    expect(db.tabelas.leads[0].estado_venda).toBe('QUALIFICADO');
    expect(db.tabelas.leads[0].estado_venda_em).toBe(new Date(T0).toISOString());
    expect((svc as any).deps.registrarEvento).toHaveBeenCalledWith(db.client, expect.objectContaining({
      tipo: 'comercial:estado_venda', leadId: 'L1', companyId: 'C1',
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
});
