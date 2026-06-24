import { describe, it, expect } from 'vitest';
import {
  percentualFioBPorAno,
  percentualInjetadoSugerido,
} from '../src/modules/proposal/calculator.js';

describe('percentualFioBPorAno — cronograma Lei 14.300 art. 27', () => {
  it('segue o cronograma oficial', () => {
    expect(percentualFioBPorAno(2023)).toBeCloseTo(0.15);
    expect(percentualFioBPorAno(2024)).toBeCloseTo(0.30);
    expect(percentualFioBPorAno(2025)).toBeCloseTo(0.45);
    expect(percentualFioBPorAno(2026)).toBeCloseTo(0.60);
    expect(percentualFioBPorAno(2027)).toBeCloseTo(0.75);
    expect(percentualFioBPorAno(2028)).toBeCloseTo(0.90);
    expect(percentualFioBPorAno(2029)).toBeCloseTo(1.00);
  });
  it('antes de 2023 trava no piso e depois de 2029 trava em 100%', () => {
    expect(percentualFioBPorAno(2020)).toBeCloseTo(0.15);
    expect(percentualFioBPorAno(2035)).toBeCloseTo(1.00);
  });
});

describe('percentualInjetadoSugerido — fração da geração que vai pra rede (paga Fio B)', () => {
  it('off-grid não injeta nada', () => {
    expect(percentualInjetadoSugerido({ tipoSistema: 'off_grid' })).toBe(0);
  });

  it('on-grid varia por perfil (residencial injeta mais que indústria)', () => {
    const res = percentualInjetadoSugerido({ tipoSistema: 'on_grid', perfil: 'residencial' });
    const ind = percentualInjetadoSugerido({ tipoSistema: 'on_grid', perfil: 'industrial' });
    expect(res).toBeGreaterThan(ind);
    expect(res).toBeGreaterThan(0);
    expect(res).toBeLessThanOrEqual(1);
  });

  it('carregador usado de dia reduz a injeção (mais autoconsumo)', () => {
    const sem = percentualInjetadoSugerido({ tipoSistema: 'on_grid', perfil: 'residencial' });
    const com = percentualInjetadoSugerido({ tipoSistema: 'on_grid', perfil: 'residencial', temCarregador: true });
    expect(com).toBeLessThan(sem);
    expect(com).toBeGreaterThanOrEqual(0);
  });

  it('híbrido no modo Backup injeta como on-grid (bateria reservada)', () => {
    const onGrid = percentualInjetadoSugerido({ tipoSistema: 'on_grid', perfil: 'residencial' });
    const backup = percentualInjetadoSugerido({ tipoSistema: 'hibrido', modoBateria: 'backup', perfil: 'residencial' });
    expect(backup).toBeCloseTo(onGrid);
  });

  it('híbrido no modo Autoconsumo injeta bem pouco (Fio B despenca)', () => {
    const onGrid = percentualInjetadoSugerido({ tipoSistema: 'on_grid', perfil: 'residencial' });
    const auto = percentualInjetadoSugerido({ tipoSistema: 'hibrido', modoBateria: 'autoconsumo', perfil: 'residencial' });
    expect(auto).toBeLessThan(onGrid);
    expect(auto).toBeLessThanOrEqual(0.25);
  });
});
