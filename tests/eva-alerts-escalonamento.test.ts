import { describe, it, expect } from 'vitest';
import { motivoEscalonamento, leadEncerrado } from '../src/modules/eva-alerts.js';

describe('motivoEscalonamento', () => {
  it('urgência explícita escala', () => {
    expect(motivoEscalonamento({ text: 'quero fechar hoje', contaMensal: 800 })).toBe('urgencia');
    expect(motivoEscalonamento({ text: 'já tô decidido, bora', contaMensal: 800 })).toBe('urgencia');
  });
  it('conta alta escala', () => {
    expect(motivoEscalonamento({ text: 'oi', contaMensal: 16000 })).toBe('conta_alta');
  });
  it('concorrente com proposta escala', () => {
    expect(motivoEscalonamento({ text: 'tenho uma proposta da outra empresa aqui', contaMensal: 900 })).toBe('concorrente');
  });
  it('hostilidade escala', () => {
    expect(motivoEscalonamento({ text: 'isso é golpe, parem de me encher', contaMensal: 900 })).toBe('hostilidade');
  });
  it('conversa normal NÃO escala', () => {
    expect(motivoEscalonamento({ text: 'quanto economizo por mês?', contaMensal: 900 })).toBeNull();
  });
  it('first-match-wins: urgência tem prioridade sobre hostilidade', () => {
    // mensagem casa urgencia E hostilidade; ordem dos ifs decide -> urgencia
    expect(motivoEscalonamento({ text: 'isso é golpe mas quero fechar agora' })).toBe('urgencia');
  });
});

// Guard cross-layer: lead desqualificado/encerrado no MESMO turno (disqualify_lead
// seta eva_active=false/status=descartado/contact_type=inviavel) NAO pode gerar
// alerta de escalonamento contraditorio ("Eva pediu reforco" logo apos "Eva
// encerrou lead inviavel com dignidade"). Espelha o gate eva_active do index.ts.
describe('leadEncerrado', () => {
  it('eva_active=false -> encerrado (suprime escalonamento)', () => {
    expect(leadEncerrado({ eva_active: false })).toBe(true);
  });
  it("status='descartado' -> encerrado", () => {
    expect(leadEncerrado({ status: 'descartado' })).toBe(true);
  });
  it("contact_type='inviavel' -> encerrado", () => {
    expect(leadEncerrado({ contact_type: 'inviavel' })).toBe(true);
  });
  it('lead ativo/normal -> NAO encerrado (escalonamento segue)', () => {
    expect(leadEncerrado({ eva_active: true, status: 'qualificado' })).toBe(false);
    expect(leadEncerrado({})).toBe(false);
  });
  it('null/undefined -> NAO encerrado (ausencia nao bloqueia)', () => {
    expect(leadEncerrado(null)).toBe(false);
    expect(leadEncerrado(undefined)).toBe(false);
  });
});
