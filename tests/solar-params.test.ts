// tests/solar-params.test.ts
// Trava as regras de seguranca do motor solar compartilhado (proposta + Eva atendente):
// painel residencial realista, geracao conservadora e coerencia R$<->kWh (caso Marcelo).
import { describe, it, expect } from 'vitest';
import {
  PAINEL_PADRAO_W,
  PAINEL_W_MIN,
  PAINEL_W_MAX,
  FATOR_PERDA_CONSERVADOR,
  checarCoerenciaContaConsumo,
  estimarConsumoDeConta,
  hspPorConcessionaria,
  tarifaPorConcessionaria,
} from '../src/modules/solar-params.js';

describe('solar-params: constantes seguras', () => {
  it('painel padrao reflete o catalogo real do Junior (700W Risen, faixa 620-725W)', () => {
    expect(PAINEL_PADRAO_W).toBe(700);
    expect(PAINEL_PADRAO_W).toBeGreaterThanOrEqual(PAINEL_W_MIN);
    expect(PAINEL_PADRAO_W).toBeLessThanOrEqual(PAINEL_W_MAX);
  });

  it('fator de perda e conservador (<=0.78) pra puxar geracao pra baixo', () => {
    expect(FATOR_PERDA_CONSERVADOR).toBeGreaterThan(0);
    expect(FATOR_PERDA_CONSERVADOR).toBeLessThanOrEqual(0.78);
  });
});

describe('checarCoerenciaContaConsumo', () => {
  it('FLAGA o caso Marcelo: R$490 mas so 85 kWh (impossivel)', () => {
    const r = checarCoerenciaContaConsumo(490, 85, 1.05);
    expect(r.coerente).toBe(false);
    expect(r.consumoEsperado).toBeGreaterThan(400); // ~467 kWh
  });

  it('aceita conta coerente (R$490 ~ 467 kWh)', () => {
    expect(checarCoerenciaContaConsumo(490, 467, 1.05).coerente).toBe(true);
  });

  it('tolera variacao razoavel por impostos/bandeiras (R$490 ~ 400 kWh)', () => {
    expect(checarCoerenciaContaConsumo(490, 400, 1.05).coerente).toBe(true);
  });

  it('dados invalidos (0) nao passam como coerentes', () => {
    expect(checarCoerenciaContaConsumo(490, 0, 1.05).coerente).toBe(false);
  });
});

describe('estimarConsumoDeConta', () => {
  it('estima ~467 kWh pra R$490 a R$1,05/kWh', () => {
    const c = estimarConsumoDeConta(490, 1.05);
    expect(c).toBeGreaterThan(420);
    expect(c).toBeLessThan(500);
  });
});

describe('hsp / tarifa por concessionaria', () => {
  it('Neoenergia-DF: HSP do CRESESB Brasília = 5.40 e tarifa ~1.05', () => {
    expect(hspPorConcessionaria('Neoenergia Brasília')).toBeCloseTo(5.40, 2);
    expect(tarifaPorConcessionaria('Neoenergia Brasília')).toBeCloseTo(1.05, 1);
  });

  it('Equatorial-GO reconhecida (HSP regional plausível 4.8-5.5)', () => {
    expect(hspPorConcessionaria('Equatorial Goiás')).toBeGreaterThanOrEqual(4.8);
    expect(hspPorConcessionaria('Equatorial Goiás')).toBeLessThanOrEqual(5.5);
  });

  it('default regional usa HSP CRESESB ~5.40, NAO o 5.0 pessimista (regressao do review)', () => {
    // EcoSunPower so atende DF+Entorno GO, toda a regiao ~5.4. Cidade sem token
    // DF/GO no nome deve cair no regional correto, nunca no 5.0 antigo.
    expect(hspPorConcessionaria(undefined)).toBeCloseTo(5.40, 2);
    expect(hspPorConcessionaria('Taguatinga')).toBeCloseTo(5.40, 2);  // RA do DF sem "DF"
    expect(hspPorConcessionaria('Luziânia')).toBeCloseTo(5.40, 2);    // cidade GO sem "GO"
  });

  it('reconhece DF/GO quando vem distribuidora ou UF no texto (caller passa isso)', () => {
    expect(hspPorConcessionaria('Neoenergia Brasília Taguatinga DF')).toBeCloseTo(5.40, 2);
    expect(tarifaPorConcessionaria('Neoenergia Brasília Taguatinga DF')).toBeCloseTo(1.05, 2);
    expect(tarifaPorConcessionaria('Equatorial Luziânia GO')).toBeCloseTo(1.00, 2);
  });
});
