import { describe, it, expect } from 'vitest';
import { regrasSlaParaLead, seloSla, type LeadSlaInput } from '../src/modules/dashboard/sla-rules.js';

const agora = Date.parse('2026-06-24T12:00:00Z');

describe('regrasSlaParaLead — qual tarefa criar', () => {
  it('novo sem contato gera tarefa ligar +24h do last_contact_at', () => {
    const lead: LeadSlaInput = { status: 'novo', last_contact_at: '2026-06-24T00:00:00Z', agendado_para: null };
    const regras = regrasSlaParaLead(lead, agora);
    const ligar = regras.find(r => r.tipo === 'ligar');
    expect(ligar).toBeTruthy();
    expect(Date.parse(ligar!.due_at)).toBe(Date.parse('2026-06-25T00:00:00Z'));
  });
  it('proposta_enviada gera cobrar_proposta +3 dias', () => {
    const lead: LeadSlaInput = { status: 'proposta_enviada', last_contact_at: '2026-06-24T00:00:00Z', agendado_para: null };
    const r = regrasSlaParaLead(lead, agora).find(x => x.tipo === 'cobrar_proposta');
    expect(r).toBeTruthy();
    expect(Date.parse(r!.due_at)).toBe(Date.parse('2026-06-27T00:00:00Z'));
  });
  it('ganho/perdido não geram tarefa', () => {
    expect(regrasSlaParaLead({ status: 'ganho', last_contact_at: null, agendado_para: null }, agora)).toEqual([]);
    expect(regrasSlaParaLead({ status: 'perdido', last_contact_at: null, agendado_para: null }, agora)).toEqual([]);
  });
});

describe('seloSla — cor pelo vencimento', () => {
  it('sem tarefa vencida = verde', () => expect(seloSla([], agora)).toBe('verde'));
  it('vence em <12h = ambar', () => expect(seloSla([{ due_at: '2026-06-24T18:00:00Z', status: 'pendente' }], agora)).toBe('ambar'));
  it('vencida = vermelho', () => expect(seloSla([{ due_at: '2026-06-24T06:00:00Z', status: 'pendente' }], agora)).toBe('vermelho'));
});
