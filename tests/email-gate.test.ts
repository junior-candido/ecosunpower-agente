import { describe, it, expect } from 'vitest';
import { podeEnviarAgora } from '../src/modules/email/email-sequence.js';

// datas em UTC; BRT = UTC-3
// 2026-07-13 = segunda, 14 = terca, 15 = quarta, 16 = quinta, 17 = sexta, 18 = sabado, 19 = domingo
describe('podeEnviarAgora (plano aprovado 18/07: seg nao envia, sex ate 15h, ter/qua/qui 9-20h BRT)', () => {
  it('quarta 12h BRT (15h UTC) -> true', () => {
    expect(podeEnviarAgora(new Date('2026-07-15T15:00:00Z'))).toBe(true);
  });
  it('quarta 6h BRT (09h UTC nao, 6h) -> antes das 9 -> false', () => {
    expect(podeEnviarAgora(new Date('2026-07-15T09:00:00Z'))).toBe(false); // 6h BRT
  });
  it('quarta 21h BRT (00h UTC do dia seguinte) -> fora da janela', () => {
    expect(podeEnviarAgora(new Date('2026-07-16T00:00:00Z'))).toBe(false); // 21h BRT qua
  });
  it('sabado 12h BRT -> false (fim de semana)', () => {
    expect(podeEnviarAgora(new Date('2026-07-18T15:00:00Z'))).toBe(false);
  });
  it('domingo 12h BRT -> false', () => {
    expect(podeEnviarAgora(new Date('2026-07-19T15:00:00Z'))).toBe(false);
  });
  it('segunda 10h BRT -> false (caixa de entrada cheia, nao envia)', () => {
    expect(podeEnviarAgora(new Date('2026-07-13T13:00:00Z'))).toBe(false);
  });
  it('terca 10h BRT -> true', () => {
    expect(podeEnviarAgora(new Date('2026-07-14T13:00:00Z'))).toBe(true);
  });
  it('quinta 19h BRT -> true', () => {
    expect(podeEnviarAgora(new Date('2026-07-16T22:00:00Z'))).toBe(true);
  });
  it('sexta 14h BRT -> true (ainda dentro da janela ate 15h)', () => {
    expect(podeEnviarAgora(new Date('2026-07-17T17:00:00Z'))).toBe(true);
  });
  it('sexta 16h BRT -> false (depois das 15h nao envia)', () => {
    expect(podeEnviarAgora(new Date('2026-07-17T19:00:00Z'))).toBe(false);
  });
});
