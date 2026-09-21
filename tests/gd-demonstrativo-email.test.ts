import { describe, it, expect } from 'vitest';
import { classificarEmailGd, dadosDoAssunto } from '../src/modules/gd/demonstrativo-email.js';

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

  it('demonstrativo encaminhado na mao pelo Junior para faturas@', () => {
    const r = classificarEmailGd(payload({
      from: 'Junior <junior@ecosunpower.eng.br>',
      to: ['faturas@woupri.resend.app'],
      subject: `Fwd: ${ASSUNTO}`,
    }));
    expect(r?.tipo).toBe('demonstrativo');
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
