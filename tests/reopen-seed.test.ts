// tests/reopen-seed.test.ts
import { describe, it, expect } from 'vitest';
import { construirSeedReopen, construirSeedClone } from '../src/modules/proposal/reopen-seed.js';

const baseOpts = {
  numeroProposta: 'P-2026-042',
  clienteNome: 'Olavo Drumond',
  modoEnvio: 'junior_envia',
  tipo: 'personalizada',
  dadosInput: {
    nomeCliente: 'Olavo Drumond',
    potenciaKwp: 8.4,
    valorTotalRs: 38500,
    modulo: { fabricante: 'Trina' },
    investimento: { total: 38500 }, // derivado — NÃO deve ir pro data do Claude
  },
};

describe('construirSeedReopen', () => {
  it('tira o bloco investimento do data (volta ao shape do Claude)', () => {
    const seed = construirSeedReopen(baseOpts);
    expect(seed.data.nomeCliente).toBe('Olavo Drumond');
    expect(seed.data.potenciaKwp).toBe(8.4);
    expect(seed.data.modulo).toEqual({ fabricante: 'Trina' });
    expect(seed.data).not.toHaveProperty('investimento');
  });

  it('intro menciona número e cliente', () => {
    const seed = construirSeedReopen(baseOpts);
    expect(seed.intro).toContain('P-2026-042');
    expect(seed.intro).toContain('Olavo Drumond');
  });

  it('seededAssistant é JSON válido com action ask_more + data completo', () => {
    const seed = construirSeedReopen(baseOpts);
    const parsed = JSON.parse(seed.seededAssistant);
    expect(parsed.action).toBe('ask_more');
    expect(parsed.modoEnvio).toBe('junior_envia');
    expect(parsed.tipo).toBe('personalizada');
    expect(parsed.data.valorTotalRs).toBe(38500);
    expect(parsed.data).not.toHaveProperty('investimento');
    expect(Array.isArray(parsed.missing)).toBe(true);
  });

  it('seededUser carrega os dados atuais pra dar contexto ao Claude', () => {
    const seed = construirSeedReopen(baseOpts);
    expect(seed.seededUser).toContain('DADOS ATUAIS:');
    expect(seed.seededUser).toContain('Olavo Drumond');
    expect(seed.seededUser).toContain('ready_to_generate');
    expect(seed.seededUser).toContain('confirm_generate'); // "gerar" gera de verdade
  });
});

describe('construirSeedClone', () => {
  const cloneOpts = {
    numeroPropostaBase: 'P-2026-042',
    clienteNomeBase: 'Marcio Ferraz',
    modoEnvio: 'junior_envia',
    tipo: 'basica',
    dadosInput: {
      nomeCliente: 'Marcio Ferraz',
      telefoneCliente: '5561999999999',
      potenciaKwp: 8.4,
      valorTotalRs: 38500,
      modulo: { fabricante: 'Trina' },
      investimento: { total: 38500 },
    },
  };

  it('LIMPA a identidade do cliente (vem do novo) mas mantém o kit/valores', () => {
    const seed = construirSeedClone(cloneOpts);
    expect(seed.data.nomeCliente).toBe('');
    expect(seed.data.telefoneCliente).toBe('');
    expect(seed.data.potenciaKwp).toBe(8.4); // kit mantido
    expect(seed.data.valorTotalRs).toBe(38500); // valor mantido
    expect(seed.data.modulo).toEqual({ fabricante: 'Trina' });
    expect(seed.data).not.toHaveProperty('investimento');
  });

  it('intro deixa claro que é CLONE (proposta nova) com a base citada', () => {
    const seed = construirSeedClone(cloneOpts);
    expect(seed.intro).toContain('Clonando');
    expect(seed.intro).toContain('P-2026-042');
    expect(seed.intro).toContain('Marcio Ferraz');
  });

  it('seededAssistant: ask_more, pede nomeCliente, e instrui confirm_generate / NÃO reabertura', () => {
    const seed = construirSeedClone(cloneOpts);
    const parsed = JSON.parse(seed.seededAssistant);
    expect(parsed.action).toBe('ask_more');
    expect(parsed.missing).toContain('nomeCliente');
    expect(seed.seededUser).toContain('confirm_generate');
    expect(seed.seededUser).toMatch(/NÃO é reabertura/i);
  });
});
