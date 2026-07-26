// tests/meta-capi.test.ts
//
// TDD para o modulo Meta Conversions API (CAPI) — eventos de funil CTWA.
//
// Fluxo CTWA (Click-to-WhatsApp): lead clica no anuncio -> abre WhatsApp ->
// Meta manda `ctwa_clid` no referral da 1a msg. A Eva guarda esse clid e,
// quando o lead avanca de estagio, devolve um evento pra Meta via CAPI.
//
// Formato CTWA (confirmado na doc oficial Meta + WOZTELL):
//   action_source: 'business_messaging'
//   messaging_channel: 'whatsapp'
//   user_data: { whatsapp_business_account_id, ctwa_clid, ph? }
// Endpoint: graph.facebook.com/{ver}/{datasetId}/events?access_token=...

import { describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';
import {
  hashSha256,
  normalizePhone,
  buildCtwaEvent,
  buildCrmLeadEvent,
  MetaCapi,
} from '../src/modules/meta-capi.js';

describe('hashSha256', () => {
  it('gera hash SHA256 hex de 64 chars minusculo', () => {
    const h = hashSha256('5561999999999');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it('normaliza: trim + lowercase antes do hash (exigencia Meta)', () => {
    expect(hashSha256('  ABC@Email.COM ')).toBe(hashSha256('abc@email.com'));
  });

  it('bate com o crypto padrao (sha256 do valor normalizado)', () => {
    const expected = crypto.createHash('sha256').update('abc@email.com').digest('hex');
    expect(hashSha256('ABC@Email.com')).toBe(expected);
  });
});

describe('normalizePhone', () => {
  it('remove tudo que nao e digito', () => {
    expect(normalizePhone('+55 (61) 99999-9999')).toBe('5561999999999');
  });

  it('telefone ja cru (so digitos) passa igual', () => {
    expect(normalizePhone('5561999999999')).toBe('5561999999999');
  });
});

describe('buildCtwaEvent', () => {
  const base = {
    eventName: 'Lead',
    eventTimeMs: 1_700_000_000_000, // ms
    ctwaClid: 'CLID_ABC',
    wabaId: 'WABA_123',
  };

  it('monta o envelope CTWA com action_source e messaging_channel certos', () => {
    const ev = buildCtwaEvent(base);
    expect(ev.action_source).toBe('business_messaging');
    expect(ev.messaging_channel).toBe('whatsapp');
    expect(ev.event_name).toBe('Lead');
  });

  it('converte event_time de ms pra segundos UNIX', () => {
    const ev = buildCtwaEvent(base);
    expect(ev.event_time).toBe(1_700_000_000);
  });

  it('poe ctwa_clid e waba id dentro de user_data', () => {
    const ev = buildCtwaEvent(base);
    expect(ev.user_data.ctwa_clid).toBe('CLID_ABC');
    expect(ev.user_data.whatsapp_business_account_id).toBe('WABA_123');
  });

  it('inclui telefone embaralhado (ph) quando informado', () => {
    const ev = buildCtwaEvent({ ...base, phone: '+55 61 99999-9999' });
    expect(ev.user_data.ph).toEqual([hashSha256('5561999999999')]);
  });

  it('nao inclui ph quando telefone ausente', () => {
    const ev = buildCtwaEvent(base);
    expect(ev.user_data.ph).toBeUndefined();
  });

  it('inclui custom_data com value/currency so quando value informado', () => {
    expect(buildCtwaEvent(base).custom_data).toBeUndefined();
    const ev = buildCtwaEvent({ ...base, value: 25000, currency: 'BRL' });
    expect(ev.custom_data).toEqual({ value: 25000, currency: 'BRL' });
  });
});

describe('buildCrmLeadEvent (lead de formulario instantaneo)', () => {
  // Lead de FORMULARIO nao tem ctwa_clid — a Meta casa o evento pelo
  // lead_id (leadgen_id do webhook) com action_source=system_generated.
  // Formato do guia oficial "Conversions API for CRM integration".
  const base = {
    eventName: 'lead_qualificado',
    eventTimeMs: 1_700_000_000_000,
    leadgenId: '525645896321548',
  };

  it('monta o envelope CRM: system_generated + lead_id numerico', () => {
    const ev = buildCrmLeadEvent(base);
    expect(ev.action_source).toBe('system_generated');
    expect(ev.event_name).toBe('lead_qualificado');
    expect(ev.event_time).toBe(1_700_000_000);
    expect(ev.user_data.lead_id).toBe(525645896321548);
  });

  it('marca a origem como CRM (event_source + lead_event_source)', () => {
    const ev = buildCrmLeadEvent(base);
    expect(ev.custom_data?.event_source).toBe('crm');
    expect(ev.custom_data?.lead_event_source).toBe('EcoSunPower CRM');
  });

  it('inclui telefone embaralhado (ph) quando informado', () => {
    const ev = buildCrmLeadEvent({ ...base, phone: '+55 61 99999-9999' });
    expect(ev.user_data.ph).toEqual([hashSha256('5561999999999')]);
  });

  it('value entra no custom_data junto com a origem CRM', () => {
    const ev = buildCrmLeadEvent({ ...base, value: 32000 });
    expect(ev.custom_data).toEqual({
      event_source: 'crm',
      lead_event_source: 'EcoSunPower CRM',
      value: 32000,
      currency: 'BRL',
    });
  });

  it('leadgen_id maior que o inteiro seguro vira string (nao corrompe o numero)', () => {
    // Number('99999999999999999') perderia precisao em silencio e o evento
    // nunca casaria com o lead na Meta. Acima de 2^53-1, mantem string.
    const ev = buildCrmLeadEvent({ ...base, leadgenId: '99999999999999999' });
    expect(ev.user_data.lead_id).toBe('99999999999999999');
  });

  it('inclui event_id quando informado (dedup do lado da Meta)', () => {
    const ev = buildCrmLeadEvent({ ...base, eventId: 'lead-1:lead_respondeu' });
    expect(ev.event_id).toBe('lead-1:lead_respondeu');
  });
});

describe('event_id no evento CTWA (dedup do lado da Meta)', () => {
  it('inclui event_id quando informado', () => {
    const ev = buildCtwaEvent({
      eventName: 'Lead',
      eventTimeMs: 1_700_000_000_000,
      ctwaClid: 'CLID_ABC',
      wabaId: 'WABA_123',
      eventId: 'lead-1:Lead',
    });
    expect(ev.event_id).toBe('lead-1:Lead');
  });

  it('sem eventId nao poe a chave (retrocompat)', () => {
    const ev = buildCtwaEvent({
      eventName: 'Lead',
      eventTimeMs: 1_700_000_000_000,
      ctwaClid: 'CLID_ABC',
      wabaId: 'WABA_123',
    });
    expect(ev.event_id).toBeUndefined();
  });
});

describe('MetaCapi.sendEvents', () => {
  const ev = buildCtwaEvent({
    eventName: 'lead_qualificado',
    eventTimeMs: 1_700_000_000_000,
    ctwaClid: 'CLID_ABC',
    wabaId: 'WABA_123',
  });

  it('faz POST no endpoint certo com data[] e retorna ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events_received: 1 }),
    });
    const capi = new MetaCapi({ datasetId: 'DS_1', token: 'TKN', apiVersion: 'v21.0', fetchImpl });

    const res = await capi.sendEvents([ev]);

    expect(res.ok).toBe(true);
    expect(res.eventsReceived).toBe(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v21.0/DS_1/events?access_token=TKN');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].event_name).toBe('lead_qualificado');
  });

  it('passa test_event_code quando informado', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    const capi = new MetaCapi({ datasetId: 'DS_1', token: 'TKN', fetchImpl });

    await capi.sendEvents([ev], { testEventCode: 'TEST123' });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.test_event_code).toBe('TEST123');
  });

  it('retorna ok=false (sem lancar) quando a Meta responde erro', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Invalid token' } }),
    });
    const capi = new MetaCapi({ datasetId: 'DS_1', token: 'TKN', fetchImpl });

    const res = await capi.sendEvents([ev]);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Invalid token');
  });

  it('retorna ok=false (sem lancar) quando o fetch estoura (rede off)', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));
    const capi = new MetaCapi({ datasetId: 'DS_1', token: 'TKN', fetchImpl });

    const res = await capi.sendEvents([ev]);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('network down');
  });

  it('nao manda nada e retorna ok quando a lista de eventos vem vazia', async () => {
    const fetchImpl = vi.fn();
    const capi = new MetaCapi({ datasetId: 'DS_1', token: 'TKN', fetchImpl });

    const res = await capi.sendEvents([]);
    expect(res.ok).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
