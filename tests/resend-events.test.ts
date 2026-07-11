import { describe, it, expect } from 'vitest';
import { mapResendEvento } from '../src/modules/email/resend-events.js';

describe('mapResendEvento', () => {
  it('email.opened -> email_aberto', () => {
    const ev = mapResendEvento({ type: 'email.opened', data: { email_id: 'm1', to: ['a@x.com'] } });
    expect(ev?.tipo).toBe('email_aberto');
    expect(ev?.payload).toMatchObject({ provider_message_id: 'm1' });
  });
  it('email.clicked -> email_clicado', () => {
    expect(mapResendEvento({ type: 'email.clicked', data: { email_id: 'm1' } })?.tipo).toBe('email_clicado');
  });
  it('tipo desconhecido -> null', () => {
    expect(mapResendEvento({ type: 'email.whatever', data: {} })).toBeNull();
  });
});
