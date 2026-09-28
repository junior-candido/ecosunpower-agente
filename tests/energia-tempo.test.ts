import { describe, it, expect } from 'vitest';
import { diaBrt, horaBrt, minutoDoDiaBrt, feriadosNacionais, postoTarifario, inicioDoDiaBrtIso, somarDias } from '../src/modules/energia/tempo.js';

describe('tempo BRT', () => {
  it('02:30Z é ainda o dia anterior em Brasília', () => {
    expect(diaBrt('2026-09-08T02:30:00Z')).toBe('2026-09-07');
    expect(horaBrt('2026-09-08T02:30:00Z')).toBe(23);
    expect(minutoDoDiaBrt('2026-09-08T02:30:00Z')).toBe(23 * 60 + 30);
  });
  it('03:00Z já é meia-noite do dia seguinte', () => {
    expect(diaBrt('2026-09-08T03:00:00Z')).toBe('2026-09-08');
    expect(horaBrt('2026-09-08T03:00:00Z')).toBe(0);
  });
  it('início do dia de Brasília em UTC', () => {
    expect(inicioDoDiaBrtIso('2026-09-08')).toBe('2026-09-08T03:00:00.000Z');
  });
  it('somarDias atravessa o mês', () => {
    expect(somarDias('2026-09-30', 1)).toBe('2026-10-01');
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('feriados móveis de 2026 (Páscoa 05/04)', () => {
    const f = feriadosNacionais(2026);
    expect(f.has('2026-04-03')).toBe(true); // Sexta-feira Santa
    expect(f.has('2026-02-16')).toBe(true); // Carnaval (segunda)
    expect(f.has('2026-02-17')).toBe(true); // Carnaval (terça)
    expect(f.has('2026-06-04')).toBe(true); // Corpus Christi
    expect(f.has('2026-09-07')).toBe(true); // Independência
    expect(f.has('2026-09-08')).toBe(false);
  });
});

describe('postoTarifario (Neoenergia Brasília: ponta 18–21h)', () => {
  it('terça 19h BRT = ponta', () => expect(postoTarifario('2026-09-08T22:00:00Z')).toBe('ponta'));
  it('terça 17h30 BRT = intermediário', () => expect(postoTarifario('2026-09-08T20:30:00Z')).toBe('intermediario'));
  it('terça 21h15 BRT = intermediário', () => expect(postoTarifario('2026-09-09T00:15:00Z')).toBe('intermediario'));
  it('terça 22h BRT = fora de ponta', () => expect(postoTarifario('2026-09-09T01:00:00Z')).toBe('fora_ponta'));
  it('sábado 19h = fora de ponta', () => expect(postoTarifario('2026-09-12T22:00:00Z')).toBe('fora_ponta'));
  it('feriado 07/09 19h = fora de ponta', () => expect(postoTarifario('2026-09-07T22:00:00Z')).toBe('fora_ponta'));
});
