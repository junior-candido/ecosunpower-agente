// tests/alerta-email-aberto.test.ts
//
// "DEVE VIM NO ZAP CADA VEZ QUE ALGUÉM ABRIR O EMAIL, IGUAL A PROPOSTA"
// (Junior, 09/09/2026, logo depois de mandar a Pasta Digital da Tatiane).
//
// O dado já chegava — o webhook da Resend grava aberto/clicado desde 07/09.
// Faltavam duas coisas: saber DE QUEM era o evento (migration 126) e virar
// aviso no zap.
//
// ⚠️ O CUIDADO QUE FAZ ISSO PRESTAR: o Gmail e o Outlook passam a imagem de
// rastreio pelo proxy deles e disparam `opened` VÁRIAS vezes pelo mesmo
// e-mail — às vezes de minuto em minuto. Sem trava, um e-mail vira 20 avisos
// e o Junior desliga tudo em duas horas. Por isso: um aviso de ABERTURA por
// e-mail, e pronto.
//
// CLIQUE é outra história. É raro, é intencional e não mente (não dá pra
// clicar sem abrir). Clique sempre avisa, mesmo que a abertura já tenha
// avisado antes.
import { describe, it, expect } from 'vitest';
import {
  decidirAlertaEmail,
  textoAlertaEmail,
} from '../src/modules/email/alerta-abertura.js';

describe('decidirAlertaEmail — avisa sem encher o saco', () => {
  it('primeira abertura: avisa', () => {
    expect(decidirAlertaEmail({ tipo: 'email_aberto', jaAvisouAbertura: false, jaAvisouClique: false }))
      .toBe(true);
  });

  it('segunda abertura do MESMO e-mail: cala (proxy do Gmail)', () => {
    expect(decidirAlertaEmail({ tipo: 'email_aberto', jaAvisouAbertura: true, jaAvisouClique: false }))
      .toBe(false);
  });

  it('clique sempre avisa, mesmo com a abertura já avisada', () => {
    expect(decidirAlertaEmail({ tipo: 'email_clicado', jaAvisouAbertura: true, jaAvisouClique: false }))
      .toBe(true);
  });

  it('mas o mesmo clique não avisa duas vezes', () => {
    expect(decidirAlertaEmail({ tipo: 'email_clicado', jaAvisouAbertura: true, jaAvisouClique: true }))
      .toBe(false);
  });

  it('entrega, bounce e spam não viram aviso de abertura', () => {
    for (const tipo of ['email_entregue', 'email_bounce', 'email_descadastro'] as const) {
      expect(decidirAlertaEmail({ tipo, jaAvisouAbertura: false, jaAvisouClique: false }))
        .toBe(false);
    }
  });
});

describe('textoAlertaEmail — o aviso que chega no zap', () => {
  it('abertura diz quem, o quê e quando', () => {
    const t = textoAlertaEmail({
      tipo: 'email_aberto',
      nome: 'Tatiane de Souza Bonfim',
      assunto: 'Tatiane, sua usina está no ar — todo o material da EcoSunPower',
      contexto: 'pasta_digital',
    });
    expect(t).toContain('Tatiane de Souza Bonfim');
    expect(t.toLowerCase()).toContain('abriu');
    expect(t).toContain('sua usina está no ar');
  });

  it('clique é mais forte que abertura, e o texto mostra isso', () => {
    const abriu = textoAlertaEmail({ tipo: 'email_aberto', nome: 'Tatiane', assunto: 'x', contexto: 'pasta_digital' });
    const clicou = textoAlertaEmail({ tipo: 'email_clicado', nome: 'Tatiane', assunto: 'x', contexto: 'pasta_digital' });
    expect(clicou.toLowerCase()).toContain('clicou');
    expect(clicou).not.toBe(abriu);
  });

  it('diz de que e-mail se trata, em português de gente', () => {
    const t = textoAlertaEmail({ tipo: 'email_aberto', nome: 'Tatiane', assunto: 'x', contexto: 'pasta_digital' });
    expect(t.toLowerCase()).toContain('pasta');
    expect(t).not.toContain('pasta_digital');
  });

  it('sem nome, não escreve "undefined"', () => {
    const t = textoAlertaEmail({ tipo: 'email_aberto', nome: '', assunto: '', contexto: 'outro' });
    expect(t).not.toMatch(/undefined|null/i);
    expect(t.length).toBeGreaterThan(10);
  });

  it('assunto comprido é cortado — aviso de zap tem que caber na tela', () => {
    const t = textoAlertaEmail({
      tipo: 'email_aberto',
      nome: 'Tatiane',
      assunto: 'a'.repeat(300),
      contexto: 'pasta_digital',
    });
    expect(t.length).toBeLessThan(320);
  });
});
