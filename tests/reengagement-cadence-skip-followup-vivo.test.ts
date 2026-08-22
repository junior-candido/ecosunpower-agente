// A cadência legada (7 toques) e o follow-up vivo falam com o MESMO cliente.
// Quem tem etapa viva de proposta (pending|paused) é do follow-up vivo — o toque
// legado tem que sair de cena (cancelado), nunca mandar mensagem em duplicidade.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ReengagementCadence } from '../src/modules/reengagement-cadence.js';

type Row = Record<string, any>;

function fakeDb(opts: { touches: Row[]; vivo: Row[] }) {
  const updates: Array<{ tabela: string; patch: Row; id: string }> = [];
  const from = (t: string) => {
    const eqs: Record<string, any> = {};
    const ins: Record<string, any[]> = {};
    const q: any = {};
    q.select = () => q;
    q.eq = (k: string, v: any) => { eqs[k] = v; return q; };
    q.in = (k: string, v: any[]) => { ins[k] = v; return q; };
    q.lte = () => q;
    q.limit = () => q;
    q.then = (res: any) => {
      let data: Row[] = [];
      if (t === 'reengagement_touches') data = opts.touches;
      else if (t === 'proposta_followup_vivo') {
        data = opts.vivo.filter((r) => r.lead_id === eqs.lead_id && (ins.status ?? []).includes(r.status));
      }
      return Promise.resolve({ data, error: null }).then(res);
    };
    q.update = (patch: Row) => {
      const u: any = {};
      u.eq = (k: string, v: any) => { if (k === 'id') updates.push({ tabela: t, patch, id: v }); return u; };
      u.select = () => u;
      u.then = (res: any) => Promise.resolve({ data: [], error: null }).then(res);
      return u;
    };
    return q;
  };
  return { updates, client: { from } as any };
}

const touch = (id: string, leadId: string) => ({
  id, touch_number: 2, topic_type: 'soft_reminder',
  leads: { id: leadId, phone: '5561999999999', name: 'Joel Lima' },
});

const anthropicFake = () => ({
  messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'oi joel' }] }) },
}) as any;

afterEach(() => { vi.useRealTimers(); });

describe('ReengagementCadence x follow-up vivo', () => {
  it('pula e cancela o toque quando o lead tem etapa pending do follow-up vivo', async () => {
    const db = fakeDb({ touches: [touch('t1', 'L1')], vivo: [{ id: 'e1', lead_id: 'L1', status: 'pending' }] });
    const sendText = vi.fn().mockResolvedValue(undefined);
    const cadence = new ReengagementCadence(db.client, anthropicFake(), sendText, () => '');

    const sent = await cadence.processDueTouches();

    expect(sent).toBe(0);
    expect(sendText).not.toHaveBeenCalled();
    expect(db.updates).toEqual([{ tabela: 'reengagement_touches', patch: { status: 'canceled' }, id: 't1' }]);
  });

  it('pula também quando a etapa está paused (cliente respondeu, ritmo só pausado)', async () => {
    const db = fakeDb({ touches: [touch('t1', 'L1')], vivo: [{ id: 'e1', lead_id: 'L1', status: 'paused' }] });
    const sendText = vi.fn().mockResolvedValue(undefined);
    const cadence = new ReengagementCadence(db.client, anthropicFake(), sendText, () => '');

    expect(await cadence.processDueTouches()).toBe(0);
    expect(sendText).not.toHaveBeenCalled();
    expect(db.updates[0]?.patch).toEqual({ status: 'canceled' });
  });

  it('não pula quando a etapa do lead já foi enviada/cancelada (nada vivo)', async () => {
    vi.useFakeTimers();
    const db = fakeDb({ touches: [touch('t1', 'L1')], vivo: [{ id: 'e1', lead_id: 'L1', status: 'sent' }] });
    const sendText = vi.fn().mockResolvedValue(undefined);
    const cadence = new ReengagementCadence(db.client, anthropicFake(), sendText, () => '');

    const p = cadence.processDueTouches();
    await vi.runAllTimersAsync(); // pula o delay humano de 30-90s entre toques
    const sent = await p;

    expect(sent).toBe(1);
    expect(sendText).toHaveBeenCalledWith('5561999999999', 'oi joel');
    expect(db.updates[0]?.patch.status).toBe('sent');
  });

  it('não pula quem tem etapa viva de OUTRO lead', async () => {
    vi.useFakeTimers();
    const db = fakeDb({ touches: [touch('t1', 'L1')], vivo: [{ id: 'e1', lead_id: 'L2', status: 'pending' }] });
    const sendText = vi.fn().mockResolvedValue(undefined);
    const cadence = new ReengagementCadence(db.client, anthropicFake(), sendText, () => '');

    const p = cadence.processDueTouches();
    await vi.runAllTimersAsync();

    expect(await p).toBe(1);
    expect(sendText).toHaveBeenCalledTimes(1);
  });
});
