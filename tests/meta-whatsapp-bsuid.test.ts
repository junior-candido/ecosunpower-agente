// BSUID (business-scoped user ID) — Meta passou a mandar um ID do usuario por
// empresa em todo webhook de mensagem. Quando o usuario esconde o telefone atras
// de um @username, `messages[].from` e `contacts[].wa_id` NAO VEM.
// Payloads baseados nos exemplos da doc da Meta:
// https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids/
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

function envelope(value: Record<string, unknown>) {
  return {
    object: 'whatsapp_business_account',
    entry: [{ id: 'WABA_ID', changes: [{ field: 'messages', value }] }],
  };
}

const metadata = { display_phone_number: '556130000000', phone_number_id: '999888777' };

// Usuario que MOSTRA o telefone: vem tudo (from + wa_id + BSUID).
const comTelefone = envelope({
  messaging_product: 'whatsapp',
  metadata,
  contacts: [{
    profile: { name: 'Sheena Nelson', username: '@realsheenanelson' },
    wa_id: '16505551234',
    user_id: 'US.13491208655302741918',
    parent_user_id: 'US.ENT.11815799212886844830',
  }],
  messages: [{
    from: '16505551234',
    from_user_id: 'US.13491208655302741918',
    from_parent_user_id: 'US.ENT.11815799212886844830',
    id: 'wamid.COMTEL',
    timestamp: '1739321024',
    type: 'text',
    text: { body: 'Ola, quero orcamento' },
  }],
});

// Usuario com telefone ESCONDIDO: sem `from`, sem `wa_id`.
const semTelefone = envelope({
  messaging_product: 'whatsapp',
  metadata,
  contacts: [{
    profile: { name: 'Sheena Nelson', username: '@realsheenanelson' },
    user_id: 'US.13491208655302741918',
  }],
  messages: [{
    from_user_id: 'US.13491208655302741918',
    id: 'wamid.SEMTEL',
    timestamp: '1739321024',
    type: 'text',
    text: { body: 'Oi' },
  }],
});

describe('MetaWhatsApp.parseWebhook — BSUID', () => {
  it('telefone visivel: mantem from e le from_user_id, parent e username', () => {
    const svc = new MetaWhatsAppService(config);
    const p = svc.parseWebhook(comTelefone);
    expect(p?.from).toBe('16505551234');
    expect(p?.fromUserId).toBe('US.13491208655302741918');
    expect(p?.fromParentUserId).toBe('US.ENT.11815799212886844830');
    expect(p?.username).toBe('@realsheenanelson');
    expect(p?.pushName).toBe('Sheena Nelson');
    expect(p?.content).toBe('Ola, quero orcamento');
  });

  it('telefone escondido: from vazio (nunca o BSUID) e fromUserId preenchido', () => {
    const svc = new MetaWhatsAppService(config);
    const p = svc.parseWebhook(semTelefone);
    expect(p).not.toBeNull();
    expect(p?.from).toBe('');
    expect(p?.fromUserId).toBe('US.13491208655302741918');
    expect(p?.username).toBe('@realsheenanelson');
    expect(p?.phoneNumberId).toBe('999888777');
  });

  it('sem from_user_id na mensagem: cai no contacts[0].user_id', () => {
    const svc = new MetaWhatsAppService(config);
    const payload = envelope({
      metadata,
      contacts: [{ profile: { name: 'X' }, wa_id: '5561999999999', user_id: 'BR.555' }],
      messages: [{ from: '5561999999999', id: 'wamid.F', timestamp: '1', type: 'text', text: { body: 'a' } }],
    });
    const p = svc.parseWebhook(payload);
    expect(p?.fromUserId).toBe('BR.555');
  });

  it('payload antigo (sem BSUID): campos novos undefined, nada muda', () => {
    const svc = new MetaWhatsAppService(config);
    const payload = envelope({
      metadata,
      contacts: [{ profile: { name: 'Cliente' }, wa_id: '5561999999999' }],
      messages: [{ from: '5561999999999', id: 'wamid.OLD', timestamp: '1', type: 'text', text: { body: 'Ola' } }],
    });
    const p = svc.parseWebhook(payload);
    expect(p?.from).toBe('5561999999999');
    expect(p?.fromUserId).toBeUndefined();
    expect(p?.fromParentUserId).toBeUndefined();
    expect(p?.username).toBeUndefined();
  });
});

describe('MetaWhatsApp.parseStatusUpdates — BSUID', () => {
  it('le recipient_user_id; recipient_id ausente vira string vazia', () => {
    const svc = new MetaWhatsAppService(config);
    const payload = envelope({
      metadata,
      contacts: [{ user_id: 'US.13491208655302741918' }],
      statuses: [{
        id: 'wamid.ST',
        status: 'delivered',
        timestamp: '1739321024',
        recipient_user_id: 'US.13491208655302741918',
      }],
    });
    const [s] = svc.parseStatusUpdates(payload);
    expect(s?.recipientPhone).toBe('');
    expect(s?.recipientUserId).toBe('US.13491208655302741918');
  });

  it('status com recipient_id continua igual', () => {
    const svc = new MetaWhatsAppService(config);
    const payload = envelope({
      statuses: [{ id: 'wamid.ST2', status: 'read', timestamp: '1', recipient_id: '5561999999999' }],
    });
    const [s] = svc.parseStatusUpdates(payload);
    expect(s?.recipientPhone).toBe('5561999999999');
    expect(s?.recipientUserId).toBeUndefined();
  });
});
