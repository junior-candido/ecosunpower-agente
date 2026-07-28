// tests/predio-dados.test.ts
//
// F1 do PRÉDIO VIVO (spec 2026-07-28): montagem PURA dos dados do prédio.
// Regras: EcoSun mora na COBERTURA (último andar); luz acesa = sinal de
// atividade nos últimos 10 min; o brilho decai até apagar em 60 min;
// capacete 👷 = manutenção 'pedido'/'fazendo' daquele apto.

import { describe, it, expect } from 'vitest';
import { montarPredio, ECOSUN_ID } from '../src/modules/predio/dados.js';

const AGORA = '2026-07-28T12:00:00Z';
const MIN = (n: number) => new Date(Date.parse(AGORA) - n * 60_000).toISOString();

const ENTRADA = {
  agoraISO: AGORA,
  companies: [
    { id: ECOSUN_ID, nome: 'EcoSun Power', created_at: '2026-01-01T00:00:00Z' },
    { id: 'sun-1', nome: 'SunBright', created_at: '2026-07-27T00:00:00Z' },
    { id: 'ten-2', nome: 'Tenant Novo', created_at: '2026-07-28T00:00:00Z' },
  ],
  porCompany: {
    [ECOSUN_ID]: { usinas: 30, assentos: 3, leads: 200, ultimoLoginISO: MIN(2), ultimoEventoISO: MIN(1) },
    'sun-1': { usinas: 56, assentos: 2, leads: 0, ultimoLoginISO: MIN(30), ultimoEventoISO: null },
    'ten-2': { usinas: 0, assentos: 1, leads: 0, ultimoLoginISO: null, ultimoEventoISO: null },
  },
  manutencoes: [
    { company_id: null, titulo: 'Blindagem de leads', status: 'entregue' },
    { company_id: 'sun-1', titulo: 'Tema claro', status: 'entregue' },
    { company_id: 'sun-1', titulo: 'Zap de alertas', status: 'pedido' },
  ],
};

describe('montarPredio — F1 do Prédio Vivo', () => {
  it('EcoSun fica na COBERTURA (último andar), demais por ordem de criação', () => {
    const p = montarPredio(ENTRADA as never);
    const nomes = p.apartamentos.map((a) => a.nome);
    expect(nomes[nomes.length - 1]).toBe('EcoSun Power');
    expect(nomes[0]).toBe('SunBright');
    expect(p.apartamentos[p.apartamentos.length - 1].ehEcosun).toBe(true);
  });

  it('atividade recente (≤10 min) = luz acesa; brilho cheio', () => {
    const p = montarPredio(ENTRADA as never);
    const eco = p.apartamentos.find((a) => a.ehEcosun)!;
    expect(eco.atividade.luzAcesa).toBe(true);
    expect(eco.atividade.brilho).toBeGreaterThan(0.9);
  });

  it('atividade de 30 min atrás = luz apagando (brilho parcial, luz off)', () => {
    const p = montarPredio(ENTRADA as never);
    const sun = p.apartamentos.find((a) => a.nome === 'SunBright')!;
    expect(sun.atividade.luzAcesa).toBe(false);
    expect(sun.atividade.brilho).toBeGreaterThan(0);
    expect(sun.atividade.brilho).toBeLessThan(0.9);
  });

  it('nunca teve sinal = apagado total', () => {
    const p = montarPredio(ENTRADA as never);
    const novo = p.apartamentos.find((a) => a.nome === 'Tenant Novo')!;
    expect(novo.atividade.luzAcesa).toBe(false);
    expect(novo.atividade.brilho).toBe(0);
  });

  it('manutenção pedido/fazendo do apto = capacete; entregue não conta', () => {
    const p = montarPredio(ENTRADA as never);
    expect(p.apartamentos.find((a) => a.nome === 'SunBright')!.manutencaoAtiva).toBe(true);
    expect(p.apartamentos.find((a) => a.ehEcosun)!.manutencaoAtiva).toBe(false);
  });

  it('manutenções do PRÉDIO (company null) vão pro térreo/letreiro', () => {
    const p = montarPredio(ENTRADA as never);
    expect(p.manutencoesPredio.map((m) => m.titulo)).toEqual(['Blindagem de leads']);
  });

  it('números do apto viajam pro painel (usinas/assentos/leads)', () => {
    const p = montarPredio(ENTRADA as never);
    const sun = p.apartamentos.find((a) => a.nome === 'SunBright')!;
    expect(sun.usinas).toBe(56);
    expect(sun.assentos).toBe(2);
  });
});
