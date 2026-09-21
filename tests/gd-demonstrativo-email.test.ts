import { describe, it, expect } from 'vitest';
import { classificarEmailGd, dadosDoAssunto, interpretarDkim, dominioNeoenergia } from '../src/modules/gd/demonstrativo-email.js';

// Assunto REAL (formato), com nome e codigos ficticios.
const ASSUNTO =
  'Mini e Microgeração - Demonstrativo do Faturamento2026-08- CLIENTE TESTE DOIS  - 2282817 - 1279110 - Neoenergia BRASÍLIA';

const payload = (data: Record<string, unknown>) => ({ type: 'email.received', data: { email_id: 'in_1', ...data } });

describe('dadosDoAssunto', () => {
  it('tira mes, nome, codigo do cliente e instalacao do assunto', () => {
    expect(dadosDoAssunto(ASSUNTO)).toEqual({
      referencia: '2026-08-01',
      nome: 'CLIENTE TESTE DOIS',
      codigoCliente: '2282817',
      instalacao: '1279110',
    });
  });
  it('funciona com "Fwd:" na frente (encaminhado na mao)', () => {
    expect(dadosDoAssunto(`Fwd: ${ASSUNTO}`)?.instalacao).toBe('1279110');
  });
  it('devolve null pra assunto de outra coisa', () => {
    expect(dadosDoAssunto('Portal da Geração Distribuída: Solicitação 2609206839')).toBeNull();
  });
});

describe('classificarEmailGd', () => {
  it('demonstrativo vindo da Neoenergia (encaminhamento automatico preserva o From)', () => {
    const r = classificarEmailGd(payload({
      from: 'r2d2.frms@neoenergia.com',
      to: ['ECOSUNPOWER2032@gmail.com'],
      subject: ASSUNTO,
    }));
    expect(r?.tipo).toBe('demonstrativo');
    if (r?.tipo !== 'demonstrativo') return;
    expect(r.emailId).toBe('in_1');
    expect(r.assunto?.codigoCliente).toBe('2282817');
  });

  it('assunto de demonstrativo com From de outra pessoa NAO e aceito, mesmo indo pra faturas@', () => {
    const r = classificarEmailGd(payload({
      from: 'Junior <junior@ecosunpower.eng.br>',
      to: ['faturas@woupri.resend.app'],
      subject: `Fwd: ${ASSUNTO}`,
    }));
    expect(r).toBeNull();
  });

  it('confirmacao de encaminhamento do Gmail: pega o codigo do assunto', () => {
    const r = classificarEmailGd(payload({
      from: 'Equipe do Gmail <forwarding-noreply@google.com>',
      to: ['faturas@woupri.resend.app'],
      subject: '(#123456789) Confirmação de encaminhamento do Gmail - Receber e-mails de ecosunpower2032@gmail.com',
    }));
    expect(r).toEqual({ tipo: 'confirmacao_gmail', emailId: 'in_1', codigo: '123456789' });
  });

  it('resposta comum de cliente NAO e desviada', () => {
    expect(classificarEmailGd(payload({
      from: 'Joao <joao@exemplo.com>',
      to: ['respostas@woupri.resend.app'],
      subject: 'Re: Sua energia solar comeca aqui',
    }))).toBeNull();
  });

  it('assunto de demonstrativo mas remetente e destino estranhos NAO e desviado', () => {
    expect(classificarEmailGd(payload({
      from: 'golpe@qualquer.com',
      to: ['respostas@woupri.resend.app'],
      subject: ASSUNTO,
    }))).toBeNull();
  });

  it('outros e-mails da Neoenergia (portal GD) NAO sao demonstrativo', () => {
    expect(classificarEmailGd(payload({
      from: 'noreplyportalgd@neoenergia.com',
      to: ['faturas@woupri.resend.app'],
      subject: 'Portal da Geração Distribuída: Solicitação 2609206839',
    }))).toBeNull();
  });

  it('ignora eventos que nao sao email.received e payload torto', () => {
    expect(classificarEmailGd({ type: 'email.delivered', data: { subject: ASSUNTO } })).toBeNull();
    expect(classificarEmailGd(null)).toBeNull();
    expect(classificarEmailGd({ type: 'email.received' })).toBeNull();
  });
});

describe('interpretarDkim (resultado do mailauth no e-mail bruto)', () => {
  const r = (signingDomain: string, result: string) => ({ signingDomain, status: { result } });
  it('assinatura da Neoenergia conferida: pass (mesmo com a do Gmail junto)', () => {
    expect(interpretarDkim([r('gmail.com', 'pass'), r('neoenergia.com', 'pass')])).toBe('pass');
    expect(interpretarDkim([r('mail.neoenergia.com', 'pass')])).toBe('pass');
  });
  it('assinatura da Neoenergia que NAO confere: fail', () => {
    expect(interpretarDkim([r('neoenergia.com', 'fail')])).toBe('fail');
  });
  it('so assinatura de outro dominio (golpista assinando o proprio): desconhecido, nunca pass', () => {
    expect(interpretarDkim([r('golpe.com', 'pass')])).toBe('desconhecido');
    expect(interpretarDkim([r('neoenergia.com.golpe.io', 'pass')])).toBe('desconhecido');
  });
  it('sem assinatura ou erro temporario de DNS: desconhecido (nao acusa golpe)', () => {
    expect(interpretarDkim([])).toBe('desconhecido');
    expect(interpretarDkim(null)).toBe('desconhecido');
    expect(interpretarDkim([r('neoenergia.com', 'temperror')])).toBe('desconhecido');
  });
  it('dominioNeoenergia nao aceita parecidos', () => {
    expect(dominioNeoenergia('neoenergia.com')).toBe(true);
    expect(dominioNeoenergia('NEOENERGIA.COM.')).toBe(true);
    expect(dominioNeoenergia('xneoenergia.com')).toBe(false);
    expect(dominioNeoenergia('neoenergia.com.br.golpe.io')).toBe(false);
  });
});
