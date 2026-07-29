// tests/assinaturas-store.test.ts
// Central de Assinaturas (fatia 1) — régua do Junior: aviso 8d antes,
// lembrete 2d antes, 3d de tolerância vencida, trava. Aqui: situação
// derivada (pra tela) e novo vencimento ao pagar (+1 mês).
import { describe, it, expect } from 'vitest';
import { situacaoDaAssinatura, novoVencimento } from '../src/modules/dashboard/assinaturas-store.js';

describe('situacaoDaAssinatura (badge da tela)', () => {
  const base = { status: 'ativa' as const, venceEm: '2026-08-20' };
  it('travada/cancelada ganham de tudo', () => {
    expect(situacaoDaAssinatura({ ...base, status: 'travada' }, '2026-08-01')).toBe('travada');
    expect(situacaoDaAssinatura({ ...base, status: 'cancelada' }, '2026-08-01')).toBe('cancelada');
  });
  it('longe do vencimento → ativa', () => {
    expect(situacaoDaAssinatura(base, '2026-08-01')).toBe('ativa');
  });
  it('faltando 8 dias ou menos → vencendo (régua do aviso)', () => {
    expect(situacaoDaAssinatura(base, '2026-08-12')).toBe('vencendo');
    expect(situacaoDaAssinatura(base, '2026-08-20')).toBe('vencendo'); // vence HOJE
    expect(situacaoDaAssinatura(base, '2026-08-11')).toBe('ativa');    // 9 dias
  });
  it('passou do vencimento → vencida', () => {
    expect(situacaoDaAssinatura(base, '2026-08-21')).toBe('vencida');
  });
});

describe('novoVencimento (pagou → +1 mês)', () => {
  it('pagou adiantado: soma 1 mês A PARTIR DO VENCIMENTO (não perde dias)', () => {
    expect(novoVencimento('2026-08-20', '2026-08-14')).toBe('2026-09-20');
  });
  it('pagou atrasado: soma 1 mês a partir de HOJE (não cobra retroativo)', () => {
    expect(novoVencimento('2026-08-20', '2026-09-02')).toBe('2026-10-02');
  });
  it('fim de mês não estoura: 31/jan → 28/fev, 31/dez vira 31/jan do ano seguinte', () => {
    expect(novoVencimento('2026-01-31', '2026-01-01')).toBe('2026-02-28');
    expect(novoVencimento('2026-12-31', '2026-12-01')).toBe('2027-01-31');
  });
});
