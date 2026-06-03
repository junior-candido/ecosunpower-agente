// tests/capi-reporter.test.ts
//
// TDD do "maestro" que decide quando devolver um estagio de funil pra Meta.
// Regras:
//  - lead SEM ctwa_clid (organico/antigo) -> nao manda (nao da pra casar)
//  - estagio ja reportado -> nao manda de novo (idempotencia)
//  - so marca como enviado APOS a Meta confirmar (nao perde evento em falha)

import { describe, it, expect, vi } from 'vitest';
import { makeCapiReporter } from '../src/modules/capi-reporter.js';
import { MetaCapi } from '../src/modules/meta-capi.js';

function fakeCapi(sendResult = { ok: true, eventsReceived: 1 }) {
  const sendEvents = vi.fn().mockResolvedValue(sendResult);
  const capi = Object.create(MetaCapi.prototype) as MetaCapi;
  (capi as unknown as { sendEvents: typeof sendEvents }).sendEvents = sendEvents;
  return { capi, sendEvents };
}

const NOW = 1_700_000_000_000;

describe('makeCapiReporter', () => {
  it('nao manda nada quando o lead nao tem ctwa_clid', async () => {
    const { capi, sendEvents } = fakeCapi();
    const recordCapiStage = vi.fn();
    const report = makeCapiReporter({
      capi,
      wabaId: 'WABA_1',
      getLeadForCapi: async () => ({ phone: '5561999', ctwa_clid: null, capi_stages_sent: [] }),
      recordCapiStage,
      now: () => NOW,
    });

    await report('lead-1', 'Lead');

    expect(sendEvents).not.toHaveBeenCalled();
    expect(recordCapiStage).not.toHaveBeenCalled();
  });

  it('nao manda quando o estagio ja foi reportado', async () => {
    const { capi, sendEvents } = fakeCapi();
    const recordCapiStage = vi.fn();
    const report = makeCapiReporter({
      capi,
      wabaId: 'WABA_1',
      getLeadForCapi: async () => ({
        phone: '5561999',
        ctwa_clid: 'CLID',
        capi_stages_sent: ['Lead'],
      }),
      recordCapiStage,
      now: () => NOW,
    });

    await report('lead-1', 'Lead');

    expect(sendEvents).not.toHaveBeenCalled();
    expect(recordCapiStage).not.toHaveBeenCalled();
  });

  it('manda o evento certo e marca como enviado quando ok', async () => {
    const { capi, sendEvents } = fakeCapi();
    const recordCapiStage = vi.fn().mockResolvedValue(true);
    const report = makeCapiReporter({
      capi,
      wabaId: 'WABA_1',
      getLeadForCapi: async () => ({
        phone: '+55 61 99999-9999',
        ctwa_clid: 'CLID_ABC',
        capi_stages_sent: [],
      }),
      recordCapiStage,
      now: () => NOW,
    });

    await report('lead-1', 'lead_qualificado');

    expect(sendEvents).toHaveBeenCalledTimes(1);
    const [events] = sendEvents.mock.calls[0];
    expect(events[0].event_name).toBe('lead_qualificado');
    expect(events[0].user_data.ctwa_clid).toBe('CLID_ABC');
    expect(events[0].user_data.whatsapp_business_account_id).toBe('WABA_1');
    expect(events[0].user_data.ph).toHaveLength(1);
    expect(recordCapiStage).toHaveBeenCalledWith('lead-1', 'lead_qualificado');
  });

  it('NAO marca como enviado quando a Meta falha (nao perde o evento)', async () => {
    const { capi } = fakeCapi({ ok: false, error: 'token ruim' });
    const recordCapiStage = vi.fn();
    const report = makeCapiReporter({
      capi,
      wabaId: 'WABA_1',
      getLeadForCapi: async () => ({ phone: '5561999', ctwa_clid: 'CLID', capi_stages_sent: [] }),
      recordCapiStage,
      now: () => NOW,
    });

    await report('lead-1', 'fechado');

    expect(recordCapiStage).not.toHaveBeenCalled();
  });

  it('repassa value (ticket do negocio) pro custom_data', async () => {
    const { capi, sendEvents } = fakeCapi();
    const report = makeCapiReporter({
      capi,
      wabaId: 'WABA_1',
      getLeadForCapi: async () => ({ phone: '5561999', ctwa_clid: 'CLID', capi_stages_sent: [] }),
      recordCapiStage: vi.fn().mockResolvedValue(true),
      now: () => NOW,
    });

    await report('lead-1', 'fechado', { value: 32000 });

    const [events] = sendEvents.mock.calls[0];
    expect(events[0].custom_data).toEqual({ value: 32000, currency: 'BRL' });
  });

  it('nunca lanca, mesmo se getLeadForCapi estourar', async () => {
    const { capi } = fakeCapi();
    const report = makeCapiReporter({
      capi,
      wabaId: 'WABA_1',
      getLeadForCapi: async () => {
        throw new Error('db down');
      },
      recordCapiStage: vi.fn(),
      now: () => NOW,
    });

    await expect(report('lead-1', 'Lead')).resolves.toBeUndefined();
  });
});
