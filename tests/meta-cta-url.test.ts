import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MetaWhatsAppService } from '../src/modules/meta-whatsapp.js';

const config = {
  metaWabaPhoneNumberId: '123',
  metaWabaAccessToken: 'tok',
  metaWabaBusinessAccountId: 'biz',
  metaAppSecret: 'sec',
  metaWabaVerifyToken: 'vt',
} as any;

describe('sendCtaUrlButton', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.ABC' }] }),
    })) as any);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('monta o interactive cta_url com body, display_text e url', async () => {
    const svc = new MetaWhatsAppService(config);
    await svc.sendCtaUrlButton('5561999999999', 'Sua proposta tá pronta!', 'Ver minha proposta', 'https://x.test/p/abc');

    const call = (fetch as any).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.type).toBe('interactive');
    expect(body.interactive.type).toBe('cta_url');
    expect(body.interactive.body.text).toBe('Sua proposta tá pronta!');
    expect(body.interactive.action.name).toBe('cta_url');
    expect(body.interactive.action.parameters.display_text).toBe('Ver minha proposta');
    expect(body.interactive.action.parameters.url).toBe('https://x.test/p/abc');
  });
});
