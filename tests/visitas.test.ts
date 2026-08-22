import { describe, it, expect, vi } from 'vitest';
import { VisitasService, visitasPendentesDePosVisita } from '../src/modules/vendas/visitas.js';

const T0 = Date.UTC(2026, 7, 24, 15, 0, 0); // seg 12:00 BRT
const H = 3_600_000;

describe('visitasPendentesDePosVisita (puro)', () => {
  const v = (fim: number, resultado: string | null = null) => ({ id: 'v', lead_id: 'L1', phone: '55', fim: new Date(fim).toISOString(), resultado });
  it('seleciona visitas terminadas há >= 24h sem resultado', () => {
    expect(visitasPendentesDePosVisita([v(T0 - 25 * H), v(T0 - 2 * H), v(T0 - 30 * H, 'fechou')], T0).map(x => x.fim))
      .toEqual([new Date(T0 - 25 * H).toISOString()]);
  });
  it('exatamente 24h conta; lista vazia devolve vazio', () => {
    expect(visitasPendentesDePosVisita([v(T0 - 24 * H)], T0)).toHaveLength(1);
    expect(visitasPendentesDePosVisita([], T0)).toEqual([]);
  });
});

describe('VisitasService', () => {
  function deps() {
    const rows: any[] = [];
    const client: any = { from: (_t: string) => ({
      insert: async (r: any) => { rows.push({ id: `v${rows.length + 1}`, ...r }); return { error: null }; },
      select: () => ({ is: () => ({ lte: async (_k: string, v: string) => ({ data: rows.filter(r => r.resultado == null && r.fim <= v), error: null }) }) }),
      update: (p: any) => ({ eq: async (k: string, v: string) => { rows.filter(r => r[k] === v).forEach(r => Object.assign(r, p)); return { error: null }; } }),
    }) };
    const followup = { agendarPosVisita: vi.fn().mockResolvedValue(undefined) };
    return { rows, client, followup, svc: new VisitasService({ client, followupVivo: followup as any }) };
  }

  it('registrar grava a visita', async () => {
    const d = deps();
    await d.svc.registrar({ leadId: 'L1', phone: '55', tipo: 'visita', inicioMs: T0, fimMs: T0 + 2 * H, calendarEventId: 'ev1' });
    expect(d.rows[0]).toMatchObject({
      lead_id: 'L1', phone: '55', tipo: 'visita', calendar_event_id: 'ev1', resultado: null,
      inicio: new Date(T0).toISOString(), fim: new Date(T0 + 2 * H).toISOString(),
    });
  });

  it('processarPosVisita dispara POS_VISITA 24h depois e marca followup_enviado', async () => {
    const d = deps();
    await d.svc.registrar({ leadId: 'L1', phone: '55', tipo: 'visita', inicioMs: T0 - 26 * H, fimMs: T0 - 25 * H, calendarEventId: null });
    await d.svc.registrar({ leadId: 'L2', phone: '56', tipo: 'meet', inicioMs: T0 - 3 * H, fimMs: T0 - 2 * H, calendarEventId: null });
    const n = await d.svc.processarPosVisita(T0);
    expect(n).toBe(1);
    expect(d.followup.agendarPosVisita).toHaveBeenCalledTimes(1);
    expect(d.followup.agendarPosVisita).toHaveBeenCalledWith({ leadId: 'L1', phone: '55', agoraMs: T0 });
    expect(d.rows[0].resultado).toBe('followup_enviado');
    expect(d.rows[0].pos_visita_em).toBe(new Date(T0).toISOString());
    expect(d.rows[1].resultado).toBeNull();
    // segunda rodada não repete
    expect(await d.svc.processarPosVisita(T0)).toBe(0);
  });

  it('marcarResultado grava fechou/cancelada pelo lead', async () => {
    const d = deps();
    await d.svc.registrar({ leadId: 'L1', phone: '55', tipo: 'visita', inicioMs: T0 - 26 * H, fimMs: T0 - 25 * H, calendarEventId: null });
    await d.svc.marcarResultado('L1', 'fechou');
    expect(d.rows[0].resultado).toBe('fechou');
    expect(await d.svc.processarPosVisita(T0)).toBe(0);
  });
});
