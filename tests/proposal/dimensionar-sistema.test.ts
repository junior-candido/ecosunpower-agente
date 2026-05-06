import { describe, it, expect } from 'vitest';
import { dimensionarSistema, MARGEM_TECNICA_DEFAULT } from '../../src/modules/proposal/calculator.js';

describe('dimensionarSistema', () => {
  it('caso típico Brasília: 1000 kWh, Trina 700W, fator 0.80 → 13 painéis 9.1 kWp', () => {
    const r = dimensionarSistema({
      consumoMensalKwh: 1000,
      painelPotenciaW: 700,
      hsp: 5.2,
      fatorPerda: 0.80,
    });
    expect(r.kWpMinimo).toBeCloseTo(8.01, 1);
    expect(r.kWpRecomendado).toBeCloseTo(8.81, 1);
    expect(r.quantidadePaineis).toBe(13);
    expect(r.kWpReal).toBeCloseTo(9.1, 1);
    expect(r.margemAplicada).toBe(MARGEM_TECNICA_DEFAULT);
  });

  it('Goiás (HSP 5.3) gera mais — menos painéis pro mesmo consumo', () => {
    const df = dimensionarSistema({
      consumoMensalKwh: 800,
      painelPotenciaW: 615,
      hsp: 5.2,
      fatorPerda: 0.80,
    });
    const go = dimensionarSistema({
      consumoMensalKwh: 800,
      painelPotenciaW: 615,
      hsp: 5.3,
      fatorPerda: 0.80,
    });
    expect(go.quantidadePaineis).toBeLessThanOrEqual(df.quantidadePaineis);
  });

  it('arredonda quantidade SEMPRE pra cima (cobrir consumo)', () => {
    // Consumo que daria fracionário tipo 12.0001 painéis
    const r = dimensionarSistema({
      consumoMensalKwh: 700,
      painelPotenciaW: 615,
      hsp: 5.2,
      fatorPerda: 0.80,
    });
    // kWpRecomendado deve gerar fracionário e ceil arredonda pra cima
    const teorico = (r.kWpRecomendado * 1000) / 615;
    expect(r.quantidadePaineis).toBeGreaterThanOrEqual(Math.ceil(teorico));
  });

  it('aceita margem custom 0 (sem margem)', () => {
    const semMargem = dimensionarSistema({
      consumoMensalKwh: 1000,
      painelPotenciaW: 700,
      hsp: 5.2,
      fatorPerda: 0.80,
      margem: 0,
    });
    expect(semMargem.kWpRecomendado).toBe(semMargem.kWpMinimo);
    expect(semMargem.margemAplicada).toBe(0);
    expect(semMargem.quantidadePaineis).toBe(12); // sem margem cabe em 12
  });

  it('rejeita inputs invalidos', () => {
    expect(() => dimensionarSistema({
      consumoMensalKwh: 0,
      painelPotenciaW: 700,
      hsp: 5.2,
      fatorPerda: 0.80,
    })).toThrow();

    expect(() => dimensionarSistema({
      consumoMensalKwh: 1000,
      painelPotenciaW: -700,
      hsp: 5.2,
      fatorPerda: 0.80,
    })).toThrow();
  });
});
