import { describe, it, expect } from 'vitest';
import { cooldownDias, snoozeAte, tiposSnoozed } from '../src/modules/dashboard/pos-venda-sugestao-memoria.js';

describe('cooldownDias', () => {
  it('padrao 30d, upgrade 90d', () => {
    expect(cooldownDias('geracao_saudavel')).toBe(30);
    expect(cooldownDias('queda')).toBe(30);
    expect(cooldownDias('upgrade')).toBe(90);
  });
});

describe('snoozeAte', () => {
  it('soma o cooldown do tipo a agora (ISO)', () => {
    const agora = new Date('2026-07-01T00:00:00Z');
    expect(snoozeAte('geracao_saudavel', agora)).toBe('2026-07-31T00:00:00.000Z');
    expect(snoozeAte('upgrade', agora)).toBe('2026-09-29T00:00:00.000Z');
  });
});

describe('tiposSnoozed', () => {
  const agora = new Date('2026-07-15T00:00:00Z');
  it('inclui tipo com snoozed_until no futuro; ignora vencido/null', () => {
    const rows = [
      { tipo: 'geracao_saudavel', snoozed_until: '2026-07-20T00:00:00Z' },
      { tipo: 'upgrade', snoozed_until: '2026-07-10T00:00:00Z' },
      { tipo: 'contato', snoozed_until: null },
    ];
    const s = tiposSnoozed(rows, agora);
    expect(s.has('geracao_saudavel')).toBe(true);
    expect(s.has('upgrade')).toBe(false);
    expect(s.has('contato')).toBe(false);
  });
});
