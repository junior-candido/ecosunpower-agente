import { describe, it, expect } from 'vitest';
import { mesmoEvento, type AtividadeInput } from '../src/modules/dashboard/atividades.js';

describe('atividades — dedupe de evento automático', () => {
  const base: AtividadeInput = { company_id: 'c', lead_id: 'l', tipo: 'proposta_aberta', titulo: 'abriu', automatica: true };
  it('mesmo tipo+lead na mesma janela = duplicado', () => {
    expect(mesmoEvento(base, { ...base }, 60_000, 30_000)).toBe(true); // 30s de diferença, janela 60s
  });
  it('fora da janela não é duplicado', () => {
    expect(mesmoEvento(base, { ...base }, 60_000, 120_000)).toBe(false);
  });
  it('tipos diferentes nunca duplicam', () => {
    expect(mesmoEvento(base, { ...base, tipo: 'nota' }, 60_000, 1_000)).toBe(false);
  });
});
