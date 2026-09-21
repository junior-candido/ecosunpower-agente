import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { conferirAssinaturaResend } from '../src/modules/email/resend-assinatura.js';

const CHAVE = Buffer.from('segredo-de-teste-32-bytes-ok!!!!');
const SEGREDO = `whsec_${CHAVE.toString('base64')}`;
const CORPO = '{"type":"email.received","data":{"email_id":"in_1"}}';
const AGORA = 1_790_000_000;

function assina(id: string, ts: number, corpo: string, chave = CHAVE) {
  return createHmac('sha256', chave).update(`${id}.${ts}.${corpo}`).digest('base64');
}
const headers = (over: Record<string, string> = {}) => ({
  'svix-id': 'msg_1',
  'svix-timestamp': String(AGORA),
  'svix-signature': `v1,${assina('msg_1', AGORA, CORPO)}`,
  ...over,
});

describe('conferirAssinaturaResend', () => {
  it('sem segredo configurado: nao bloqueia (comportamento antigo)', () => {
    expect(conferirAssinaturaResend({ segredo: undefined, corpoBruto: CORPO, headers: {} })).toBe('sem_segredo');
  });
  it('assinatura certa: ok', () => {
    expect(conferirAssinaturaResend({ segredo: SEGREDO, corpoBruto: CORPO, headers: headers(), agoraS: AGORA })).toBe('ok');
  });
  it('aceita quando uma das assinaturas (rotacao) confere', () => {
    const h = headers({ 'svix-signature': `v1,AAAA v1,${assina('msg_1', AGORA, CORPO)}` });
    expect(conferirAssinaturaResend({ segredo: SEGREDO, corpoBruto: CORPO, headers: h, agoraS: AGORA })).toBe('ok');
  });
  it('corpo adulterado: invalida', () => {
    expect(conferirAssinaturaResend({ segredo: SEGREDO, corpoBruto: CORPO.replace('in_1', 'in_2'), headers: headers(), agoraS: AGORA })).toBe('invalida');
  });
  it('assinado com outro segredo: invalida', () => {
    const h = headers({ 'svix-signature': `v1,${assina('msg_1', AGORA, CORPO, Buffer.from('outro'))}` });
    expect(conferirAssinaturaResend({ segredo: SEGREDO, corpoBruto: CORPO, headers: h, agoraS: AGORA })).toBe('invalida');
  });
  it('carimbo de tempo velho (replay): invalida', () => {
    expect(conferirAssinaturaResend({ segredo: SEGREDO, corpoBruto: CORPO, headers: headers(), agoraS: AGORA + 3600 })).toBe('invalida');
  });
  it('sem cabecalhos svix: invalida', () => {
    expect(conferirAssinaturaResend({ segredo: SEGREDO, corpoBruto: CORPO, headers: {}, agoraS: AGORA })).toBe('invalida');
  });
});
