// tests/recuperar-dados-input.test.ts
import { describe, it, expect } from 'vitest';
import { construirDadosInputDeDrive } from '../src/modules/proposal/recuperar-dados-input.js';

describe('construirDadosInputDeDrive', () => {
  it('JSON do Drive { data, calcInput } → dados_input com investimento.total', () => {
    const driveJson = JSON.stringify({
      data: { nomeCliente: 'Olavo Drumond', potenciaKwp: 8.4, valorTotalRs: 38500 },
      calcInput: { algo: 1 },
    });
    const r = construirDadosInputDeDrive(driveJson)!;
    expect(r).toBeTruthy();
    expect(r.nomeCliente).toBe('Olavo Drumond');
    expect(r.potenciaKwp).toBe(8.4);
    expect((r.investimento as { total: number }).total).toBe(38500);
  });

  it('aceita o `data` cru (sem wrapper)', () => {
    const r = construirDadosInputDeDrive(JSON.stringify({ nomeCliente: 'X', valorTotalRs: 1000 }))!;
    expect(r.nomeCliente).toBe('X');
    expect((r.investimento as { total: number }).total).toBe(1000);
  });

  it('JSON inválido → null', () => {
    expect(construirDadosInputDeDrive('{ não é json')).toBeNull();
  });

  it('sem valorTotalRs → null (não dá pra reconstruir com segurança)', () => {
    expect(construirDadosInputDeDrive(JSON.stringify({ data: { nomeCliente: 'X' } }))).toBeNull();
  });
});
