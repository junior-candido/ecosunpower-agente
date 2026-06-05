// tests/solar-estimate.test.ts
// Garante que a estimativa do chat e segura: economia <= conta, trava de coerencia
// (caso Marcelo), painel 700W e geracao conservadora.
import { describe, it, expect } from 'vitest';
import { calculateSolarEstimate, formatEstimateForPrompt } from '../src/modules/solar.js';

describe('calculateSolarEstimate (chat da Eva)', () => {
  it('retorna null sem conta e sem consumo', async () => {
    expect(await calculateSolarEstimate('Brasília')).toBeNull();
  });

  it('economia mensal NUNCA passa do valor da conta', async () => {
    const e = await calculateSolarEstimate('Brasília', 490);
    expect(e).not.toBeNull();
    expect(e!.monthlyEconomyBrl).toBeLessThanOrEqual(490);
    expect(e!.monthlyEconomyBrl).toBeGreaterThan(0);
  });

  it('economia nunca passa da conta mesmo com kWh ALTO coerente (490 + 560) — teto duro', async () => {
    const e = await calculateSolarEstimate('Brasília', 490, 560);
    expect(e!.coerente).toBe(true);            // 560 vs ~467 esperado = ~20%, dentro da tolerância
    expect(e!.monthlyEconomyBrl).toBeLessThanOrEqual(490);
  });

  it('caso Marcelo (R$490 + 85 kWh): marca INCOERENTE e gera aviso pra confirmar', async () => {
    const e = await calculateSolarEstimate('Brasília', 490, 85);
    expect(e!.coerente).toBe(false);
    expect(e!.avisoCoerencia).toBeTruthy();
    // o prompt formatado NAO deve despejar tabela de sistema, e sim pedir confirmacao
    const prompt = formatEstimateForPrompt(e!);
    expect(prompt).toMatch(/NAO calcule ainda|confirm/i);
    expect(prompt).not.toMatch(/Payback aproximado/);
  });

  it('caso coerente (R$490 + 467 kWh): ok e apresenta estimativa', async () => {
    const e = await calculateSolarEstimate('Brasília', 490, 467);
    expect(e!.coerente).toBe(true);
    expect(formatEstimateForPrompt(e!)).toMatch(/Estimativa de sistema/);
  });

  it('usa painel 700W e geracao conservadora (fator 0.78)', async () => {
    const e = await calculateSolarEstimate('Brasília', undefined, 600);
    expect(e!.panelWatts).toBe(700);
    // geracao ~ kWp * hsp(5.40 CRESESB Brasília) * 30 * 0.78 — conservadora calibrada
    const esperadaAprox = e!.systemPowerKwp * 5.40 * 30 * 0.78;
    expect(Math.abs(e!.generationKwhMonth - esperadaAprox)).toBeLessThan(esperadaAprox * 0.1);
  });
});
