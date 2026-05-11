import { describe, it, expect } from 'vitest';
import { nextStep, type QualifyState } from '../../src/modules/marketing/ig-qualifier-brain.js';

describe('nextStep', () => {
  it('inicio: pergunta tipo de imovel', () => {
    const state: QualifyState = { step: 'start', data: {} };
    const r = nextStep(state, '');
    expect(r.next.step).toBe('await_tipo');
    expect(r.message).toContain('CASA');
    expect(r.quickReplies?.length).toBeGreaterThanOrEqual(3);
  });

  it('await_tipo casa: pergunta cidade', () => {
    const state: QualifyState = { step: 'await_tipo', data: {} };
    const r = nextStep(state, 'casa');
    expect(r.next.step).toBe('await_cidade');
    expect(r.next.data.tipo).toBe('casa');
  });

  it('await_cidade brasilia: pergunta conta', () => {
    const state: QualifyState = { step: 'await_cidade', data: { tipo: 'casa' } };
    const r = nextStep(state, 'brasilia');
    expect(r.next.step).toBe('await_conta');
    expect(r.quickReplies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ payload: 'ate_700' }),
        expect.objectContaining({ payload: '700_1500' }),
      ]),
    );
  });

  it('await_cidade fora: descarte regiao', () => {
    const state: QualifyState = { step: 'await_cidade', data: { tipo: 'casa' } };
    const r = nextStep(state, 'sao paulo');
    expect(r.next.step).toBe('disqualified');
    expect(r.message).toContain('atendemos');
  });

  it('await_conta ate_700: descarte criterio', () => {
    const state: QualifyState = { step: 'await_conta', data: { tipo: 'casa', cidade: 'brasilia' } };
    const r = nextStep(state, 'ate_700');
    expect(r.next.step).toBe('disqualified');
    expect(r.message).toContain('R$ 700');
  });

  it('await_conta 700_1500: pergunta handoff', () => {
    const state: QualifyState = { step: 'await_conta', data: { tipo: 'casa', cidade: 'brasilia' } };
    const r = nextStep(state, '700_1500');
    expect(r.next.step).toBe('await_handoff');
    expect(r.message).toContain('WhatsApp');
  });

  it('await_handoff sim: gera link wa.me', () => {
    const state: QualifyState = {
      step: 'await_handoff',
      data: { tipo: 'casa', cidade: 'brasilia', faixa_conta: '700_1500' },
    };
    const r = nextStep(state, 'sim');
    expect(r.next.step).toBe('handed_off');
    expect(r.message).toMatch(/wa\.me/);
  });

  it('await_handoff nao: escala humano', () => {
    const state: QualifyState = {
      step: 'await_handoff',
      data: { tipo: 'casa', cidade: 'brasilia', faixa_conta: '700_1500' },
    };
    const r = nextStep(state, 'nao');
    expect(r.next.step).toBe('escalated_human');
  });

  it('detecta intent escalacao', () => {
    const state: QualifyState = { step: 'await_conta', data: {} };
    const r = nextStep(state, 'quero falar com uma pessoa');
    expect(r.next.step).toBe('escalated_human');
  });
});
