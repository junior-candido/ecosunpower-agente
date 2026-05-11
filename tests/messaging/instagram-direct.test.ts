import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { InstagramDirectService } from '../../src/modules/messaging/instagram-direct.js';

describe('InstagramDirectService.validateSignature', () => {
  const svc = new InstagramDirectService('user', 'token', 'app-secret-test');

  it('aceita signature valida', () => {
    const body = '{"object":"instagram"}';
    const sig = 'sha256=' + crypto.createHmac('sha256', 'app-secret-test').update(body).digest('hex');
    expect(svc.validateSignature(body, sig)).toBe(true);
  });

  it('rejeita signature invalida', () => {
    expect(svc.validateSignature('{"x":1}', 'sha256=wrong')).toBe(false);
  });

  it('rejeita ausente', () => {
    expect(svc.validateSignature('{}', undefined)).toBe(false);
  });
});
