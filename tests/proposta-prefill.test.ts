import { describe, it, expect } from 'vitest';
import { prefillFormFromDadosInput } from '../src/modules/dashboard/proposta-prefill.js';

describe('prefillFormFromDadosInput', () => {
  it('mapeia os campos do form a partir do dados_input completo', () => {
    const v = prefillFormFromDadosInput({
      nomeCliente: 'Marcelo', potenciaKwp: 8.4, valorTotalRs: 38500, fatorPerda: 0.78,
      consumoMensalKwh: 1000, tarifaRsKwh: 1.05, geracaoMensalKwh: 1080,
      modulo: { fabricante: 'Trina', modelo: 'Vertex', potenciaW: 700, quantidade: 12 },
      inversor: { fabricante: 'Sungrow', modelo: 'SG5.0RS-L', potenciaW: 5000, quantidade: 1 },
      estruturaFixacao: { tipo: 'Telha cerâmica' }, concessionaria: 'Neoenergia DF', tipoCliente: 'residencial',
    });
    expect(v.potenciaKwp).toBe(8.4);
    expect(v.valorTotalRs).toBe(38500);
    expect(v.moduloFabricante).toBe('Trina');
    expect(v.moduloQuantidade).toBe(12);
    expect(v.inversorModelo).toBe('SG5.0RS-L');
    expect(v.estruturaTipo).toBe('Telha cerâmica');
    expect(v.geracaoMensalKwh).toBe(1080);
  });
  it('campos ausentes viram string vazia (não quebra o form)', () => {
    const v = prefillFormFromDadosInput({ nomeCliente: 'X' });
    expect(v.potenciaKwp).toBe('');
    expect(v.moduloFabricante).toBe('');
  });
});
