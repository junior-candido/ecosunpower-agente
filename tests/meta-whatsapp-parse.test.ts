import { describe, it, expect } from 'vitest';
import { MetaWhatsAppService } from '../src/modules/meta-whatsapp.js';

const config = {
  metaWabaPhoneNumberId: '123',
  metaWabaAccessToken: 'tok',
  metaWabaBusinessAccountId: 'biz',
  metaAppSecret: 'sec',
  metaWabaVerifyToken: 'vt',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

// Monta um payload de webhook WABA de mensagem de texto, opcionalmente com
// value.metadata.phone_number_id.
function textPayload(withMetadata: boolean) {
  const value: Record<string, unknown> = {
    contacts: [{ profile: { name: 'Cliente' }, wa_id: '5561999999999' }],
    messages: [{
      from: '5561999999999',
      id: 'wamid.TEST',
      timestamp: '1713470400',
      type: 'text',
      text: { body: 'Ola' },
    }],
  };
  if (withMetadata) {
    value.metadata = { display_phone_number: '556130000000', phone_number_id: '999888777' };
  }
  return {
    object: 'whatsapp_business_account',
    entry: [{ id: 'WABA_ID', changes: [{ field: 'messages', value }] }],
  };
}

describe('MetaWhatsApp.parseWebhook — metadata multi-tenant (fatia 1)', () => {
  it('extrai value.metadata.phone_number_id → parsed.phoneNumberId', () => {
    const svc = new MetaWhatsAppService(config);
    const parsed = svc.parseWebhook(textPayload(true));
    expect(parsed?.type).toBe('text');
    expect(parsed?.from).toBe('5561999999999');
    expect(parsed?.phoneNumberId).toBe('999888777');
  });

  it('payload sem metadata → phoneNumberId undefined (sem crash)', () => {
    const svc = new MetaWhatsAppService(config);
    const parsed = svc.parseWebhook(textPayload(false));
    expect(parsed?.type).toBe('text');
    expect(parsed?.phoneNumberId).toBeUndefined();
  });
});
