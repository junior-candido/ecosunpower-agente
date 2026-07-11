import { describe, it, expect } from 'vitest';
import { podeEnviarAgora } from '../src/modules/email/email-sequence.js';

// datas em UTC; BRT = UTC-3
describe('podeEnviarAgora (dias uteis 9-20 BRT)', () => {
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
});
