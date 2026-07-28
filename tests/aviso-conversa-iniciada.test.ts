// tests/aviso-conversa-iniciada.test.ts
//
// Pedido do Junior 28/07: hoje ele sabe quando o lead ENTRA e quando
// QUALIFICA — mas o momento de ouro ("respondeu, a conversa começou")
// passava em silêncio. O aviso nasce COLADO no lead_respondeu do CAPI
// (mesma guarda, dispara 1x por lead): primeira resposta de lead vindo do
// FORMULÁRIO (opção (a) — CTWA/orgânico ficam fora pra não virar
// metralhadora de notificação em dia de campanha).

import { describe, it, expect } from 'vitest';
import {
  deveAvisarConversaIniciada,
  montarAvisoConversaIniciada,
} from '../src/modules/aviso-conversa-iniciada.js';

const LEAD_FORM = {
  id: 'lead-1',
  name: 'Manuel Flávio Sampaio',
  phone: '5561974031673',
  ctwa_clid: null,
  lead_source: 'ad_fb_leadform',
  capi_stages_sent: ['Lead'],
};

describe('deveAvisarConversaIniciada — mesma régua do lead_respondeu', () => {
  it('lead de formulário na primeira resposta: avisa', () => {
    expect(deveAvisarConversaIniciada(LEAD_FORM)).toBe(true);
  });

  it('segunda resposta em diante (lead_respondeu já marcado): NÃO repete', () => {
    expect(deveAvisarConversaIniciada({
      ...LEAD_FORM, capi_stages_sent: ['Lead', 'lead_respondeu'],
    })).toBe(false);
  });

  it('lead de CTWA (clique no anúncio): fora — canal já conversa por natureza', () => {
    expect(deveAvisarConversaIniciada({ ...LEAD_FORM, ctwa_clid: 'CLID_X' })).toBe(false);
  });

  it('lead orgânico sem vínculo com form: fora (opção a do Junior)', () => {
    expect(deveAvisarConversaIniciada({
      ...LEAD_FORM, lead_source: 'organico_ig', capi_stages_sent: [],
    })).toBe(false);
  });

  it('lead importado com estágio Lead (sem lead_source de form): avisa', () => {
    expect(deveAvisarConversaIniciada({
      ...LEAD_FORM, lead_source: null, capi_stages_sent: ['Lead'],
    })).toBe(true);
  });

  it('sem id / null: nunca', () => {
    expect(deveAvisarConversaIniciada(null)).toBe(false);
    expect(deveAvisarConversaIniciada({ ...LEAD_FORM, id: undefined })).toBe(false);
  });
});

describe('montarAvisoConversaIniciada — a mensagem que o Junior recebe', () => {
  it('traz nome, telefone formatado, resumo da resposta e botões de ação', () => {
    const aviso = montarAvisoConversaIniciada(LEAD_FORM, 'Oi! Pode ser sim, me explica como funciona');
    expect(aviso.texto).toContain('Manuel Flávio Sampaio');
    expect(aviso.texto).toContain('começou a conversar com a Eva');
    expect(aviso.texto).toContain('(61) 97403-1673');
    expect(aviso.texto).toContain('me explica como funciona');
    expect(aviso.botoes).toEqual([
      { id: 'evabt:lead-view:lead-1', title: '👤 Ver conversa' },
      { id: 'evabt:lead-pause:lead-1', title: '✋ Assumir' },
    ]);
  });

  it('resposta comprida é resumida (não entope o zap)', () => {
    const aviso = montarAvisoConversaIniciada(LEAD_FORM, 'a'.repeat(300));
    expect(aviso.texto).toContain('…');
    expect(aviso.texto.length).toBeLessThan(400);
  });

  it('foto/PDF (sem texto) sai sem aspas vazias', () => {
    const aviso = montarAvisoConversaIniciada(LEAD_FORM, null);
    expect(aviso.texto).not.toContain('""');
    expect(aviso.texto).toContain('acompanhe ou assuma');
  });
});
