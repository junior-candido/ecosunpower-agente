// tests/assinaturas-motor.test.ts
// Motor de mensalidades — régua do Junior: 8d antes avisa com link, 2d antes
// lembra, venceu tem 3 dias de tolerância com último aviso, depois trava.
import { describe, it, expect } from 'vitest';
import { acaoDoDia } from '../src/modules/assinaturas-motor.js';

describe('acaoDoDia (régua 8d / 2d / venceu+3d)', () => {
  const venceEm = '2026-08-20';
  const semAvisos = new Set<string>();
  it('longe do vencimento → nada', () => {
    expect(acaoDoDia({ status: 'ativa', venceEm }, '2026-08-01', semAvisos)).toBeNull();
  });
  it('faltando 8 dias → aviso8 (gera link)', () => {
    expect(acaoDoDia({ status: 'ativa', venceEm }, '2026-08-12', semAvisos)).toBe('aviso8');
  });
  it('cron perdeu o dia 8? faltando 5 ainda manda o aviso8 (janela, não data exata)', () => {
    expect(acaoDoDia({ status: 'ativa', venceEm }, '2026-08-15', semAvisos)).toBe('aviso8');
  });
  it('aviso8 já enviado → não repete; faltando 2 dias → aviso2', () => {
    expect(acaoDoDia({ status: 'ativa', venceEm }, '2026-08-15', new Set(['aviso8']))).toBeNull();
    expect(acaoDoDia({ status: 'ativa', venceEm }, '2026-08-18', new Set(['aviso8']))).toBe('aviso2');
  });
  it('venceu (até 3 dias) → ultimo aviso, uma vez só', () => {
    expect(acaoDoDia({ status: 'ativa', venceEm }, '2026-08-21', new Set(['aviso8', 'aviso2']))).toBe('ultimo');
    expect(acaoDoDia({ status: 'ativa', venceEm }, '2026-08-23', new Set(['aviso8', 'aviso2', 'ultimo']))).toBeNull();
  });
  it('venceu + 4 dias → travar', () => {
    expect(acaoDoDia({ status: 'ativa', venceEm }, '2026-08-24', new Set(['aviso8', 'aviso2', 'ultimo']))).toBe('travar');
  });
  it('travada/cancelada → motor não mexe', () => {
    expect(acaoDoDia({ status: 'travada', venceEm }, '2026-08-24', semAvisos)).toBeNull();
    expect(acaoDoDia({ status: 'cancelada', venceEm }, '2026-08-24', semAvisos)).toBeNull();
  });
});
