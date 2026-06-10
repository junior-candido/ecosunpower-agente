import { describe, it, expect } from 'vitest';
import { detectarAlertasFinanceiros } from '../src/modules/financeiro/alertas.js';

describe('financeiro/alertas: detecção pura', () => {
  const base = {
    diaDoMes: 15, diaAlertaDas: 15,
    rbt12: 355000, margemFaixa: 20000,
    fatorRatio: 0.30, fatorRAlerta: 0.30,
    impostoDoMes: 2569, proLaboreMin: 8283,
  };
  it('dispara DAS no dia configurado', () => {
    const a = detectarAlertasFinanceiros(base);
    expect(a.some((x) => x.tipo === 'das')).toBe(true);
  });
  it('dispara salto de faixa quando dentro da margem', () => {
    // 355000 → faltam 5000 pro 360000, dentro de 20000
    expect(detectarAlertasFinanceiros(base).some((x) => x.tipo === 'faixa')).toBe(true);
  });
  it('dispara Fator R quando ratio <= alerta', () => {
    expect(detectarAlertasFinanceiros({ ...base, fatorRatio: 0.29 }).some((x) => x.tipo === 'fator_r')).toBe(true);
  });
  it('não dispara DAS em outro dia', () => {
    expect(detectarAlertasFinanceiros({ ...base, diaDoMes: 3 }).some((x) => x.tipo === 'das')).toBe(false);
  });
  it('não dispara faixa quando longe do limite', () => {
    expect(detectarAlertasFinanceiros({ ...base, rbt12: 200000 }).some((x) => x.tipo === 'faixa')).toBe(false);
  });
});
