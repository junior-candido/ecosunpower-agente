// tests/rastreio-email-lead.test.ts
//
// "TERIA COMO RASTREAR PARA VER SE OS EMAILS ENVIADOS SÃO ABERTOS" (Junior,
// 09/09/2026, minutos depois de mandar a pasta da Tatiane).
//
// Tinha — e o dado já estava lá desde 07/09. O webhook da Resend grava cinco
// eventos em `eventos_elo` (entregue, aberto, clicado, bounce, descadastro).
// O que faltava era ONDE VER: a única tela mostrava o TOTAL da sequência de
// marketing, então pra saber de UM cliente só existia SQL.
//
// Aqui o dado bruto vira uma linha que se lê de relance na ficha.
//
// ⚠️ ABERTURA SEMPRE SUBESTIMA. Gmail e Outlook bloqueiam o pixel invisível
// que conta a abertura, então "aberto" some pra boa parte das pessoas. CLIQUE
// nunca mente: quem clicou, abriu. Por isso o clique manda no resumo.
import { describe, it, expect } from 'vitest';
import {
  resumirEmails,
  type EventoEmail,
} from '../src/modules/dashboard/rastreio-email.js';

const ev = (tipo: EventoEmail['tipo'], quando: string): EventoEmail => ({ tipo, criado_em: quando });

describe('resumirEmails — o que aconteceu com o e-mail deste cliente', () => {
  it('sem evento nenhum, diz que não houve e-mail', () => {
    const r = resumirEmails([]);
    expect(r.houve).toBe(false);
    expect(r.rotulo).toBe('nenhum e-mail');
  });

  it('enviado e nada mais: mostra enviado', () => {
    const r = resumirEmails([ev('email_enviado', '2026-09-09T23:40:00Z')]);
    expect(r.houve).toBe(true);
    expect(r.enviados).toBe(1);
    expect(r.rotulo.toLowerCase()).toContain('enviado');
  });

  it('CLIQUE manda no rótulo — é o sinal que não mente', () => {
    const r = resumirEmails([
      ev('email_enviado', '2026-09-09T23:40:00Z'),
      ev('email_entregue', '2026-09-09T23:40:30Z'),
      ev('email_clicado', '2026-09-10T08:15:00Z'),
    ]);
    expect(r.rotulo.toLowerCase()).toContain('clicou');
    expect(r.clicou).toBe(true);
    // Clicou sem evento de abertura ainda conta como aberto: é impossível
    // clicar sem ter aberto — o pixel é que foi bloqueado.
    expect(r.abriu).toBe(true);
  });

  it('aberto sem clique aparece como aberto', () => {
    const r = resumirEmails([
      ev('email_enviado', '2026-09-09T23:40:00Z'),
      ev('email_aberto', '2026-09-10T07:02:00Z'),
    ]);
    expect(r.abriu).toBe(true);
    expect(r.clicou).toBe(false);
    expect(r.rotulo.toLowerCase()).toContain('abriu');
  });

  it('BOUNCE grita mais alto que tudo — o e-mail nem chegou', () => {
    const r = resumirEmails([
      ev('email_enviado', '2026-09-09T23:40:00Z'),
      ev('email_bounce', '2026-09-09T23:40:20Z'),
    ]);
    expect(r.problema).toBe(true);
    expect(r.rotulo.toLowerCase()).toContain('voltou');
  });

  it('reclamação de spam também é problema, e aparece', () => {
    const r = resumirEmails([
      ev('email_enviado', '2026-09-09T23:40:00Z'),
      ev('email_descadastro', '2026-09-10T09:00:00Z'),
    ]);
    expect(r.problema).toBe(true);
    expect(r.rotulo.toLowerCase()).toContain('spam');
  });

  it('guarda a data do último acontecimento, pro "quando"', () => {
    const r = resumirEmails([
      ev('email_enviado', '2026-09-09T23:40:00Z'),
      ev('email_aberto', '2026-09-10T07:02:00Z'),
    ]);
    expect(r.ultimoEm).toBe('2026-09-10T07:02:00Z');
  });

  it('conta quantos e-mails saíram, não quantos eventos', () => {
    const r = resumirEmails([
      ev('email_enviado', '2026-09-01T10:00:00Z'),
      ev('email_aberto', '2026-09-01T11:00:00Z'),
      ev('email_enviado', '2026-09-09T23:40:00Z'),
      ev('email_aberto', '2026-09-10T07:02:00Z'),
      ev('email_clicado', '2026-09-10T07:03:00Z'),
    ]);
    expect(r.enviados).toBe(2);
  });

  it('ignora evento que não é de e-mail', () => {
    const r = resumirEmails([
      { tipo: 'visita_agendada' as EventoEmail['tipo'], criado_em: '2026-09-01T10:00:00Z' },
      ev('email_enviado', '2026-09-09T23:40:00Z'),
    ]);
    expect(r.enviados).toBe(1);
    expect(r.houve).toBe(true);
  });
});
