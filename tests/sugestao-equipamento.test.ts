import { describe, it, expect } from 'vitest';
import { sugerirEquipamento } from '../src/modules/sugestao-equipamento.js';

describe('sugerirEquipamento', () => {
  it('retorna null quando consumo é 0', () => {
    expect(sugerirEquipamento(0)).toBeNull();
  });

  it('retorna null quando consumo é negativo', () => {
    expect(sugerirEquipamento(-100)).toBeNull();
  });

  it('retorna objeto com kWp e painéis para consumo normal', () => {
    const result = sugerirEquipamento(400);
    expect(result).not.toBeNull();
    expect(result!.kWpMinimo).toBeGreaterThan(0);
    expect(result!.kWpRecomendado).toBeGreaterThan(result!.kWpMinimo);
    expect(result!.quantidadePaineis).toBeGreaterThan(0);
    expect(result!.kWpReal).toBeGreaterThan(0);
  });

  it('consumo 400 kWh/mês resulta em ~3 painéis de 700W', () => {
    // kWpMinimo = 400 / (5.40 * 30 * 0.78) ≈ 3.16 kWp
    // kWpRecomendado = 3.16 * 1.10 ≈ 3.47 kWp
    // painéis = ceil(3470 / 700) = 5 painéis → kWpReal = 3.50 kWp
    const result = sugerirEquipamento(400);
    expect(result!.quantidadePaineis).toBe(5);
    expect(result!.kWpReal).toBeCloseTo(3.5, 1);
  });

  it('consumo maior resulta em mais painéis', () => {
    const pequeno = sugerirEquipamento(200);
    const grande = sugerirEquipamento(800);
    expect(grande!.quantidadePaineis).toBeGreaterThan(pequeno!.quantidadePaineis);
  });

  it('aceita hsp customizado', () => {
    const brasilia = sugerirEquipamento(400, 5.40);
    const nordeste = sugerirEquipamento(400, 6.0);
    // Mais sol = menos painéis necessários
    expect(nordeste!.quantidadePaineis).toBeLessThanOrEqual(brasilia!.quantidadePaineis);
  });
});
