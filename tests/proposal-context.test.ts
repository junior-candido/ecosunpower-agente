import { describe, it, expect } from 'vitest';
import { montarBlocoProposta } from '../src/modules/proposal-context.js';

describe('montarBlocoProposta', () => {
  it('sem dados / não-objeto → string vazia', () => {
    expect(montarBlocoProposta(null)).toBe('');
    expect(montarBlocoProposta(undefined)).toBe('');
    expect(montarBlocoProposta('x')).toBe('');
    expect(montarBlocoProposta({})).toBe('');
  });

  it('sem potência e sem valor → vazio (não é proposta solar)', () => {
    expect(montarBlocoProposta({ nomeCliente: 'João' })).toBe('');
  });

  it('proposta simples → bloco com os números reais', () => {
    const bloco = montarBlocoProposta(
      {
        potenciaKwp: 8.4,
        valorTotalRs: 32000,
        geracaoMensalKwh: 1080,
        modulo: { fabricante: 'Trina', modelo: 'Vertex 700W', potenciaW: 700, quantidade: 12, garantiaDefeito: 12, garantiaEficiencia: 30 },
        inversor: { fabricante: 'Sungrow', modelo: 'SG5.0RS-L', potenciaW: 5000, quantidade: 1, garantia: 10 },
      },
      'João Silva',
    );
    expect(bloco).toContain('Proposta deste cliente');
    expect(bloco).toContain('João Silva');
    expect(bloco).toContain('8,4 kWp');
    expect(bloco).toContain('R$ 32.000');
    expect(bloco).toContain('1.080 kWh/mês');
    expect(bloco).toContain('12x Trina Vertex 700W 700W');
    expect(bloco).toContain('garantia 12 anos contra defeito, 30 anos de eficiência');
    expect(bloco).toContain('Sungrow SG5.0RS-L 5 kW');
    expect(bloco).toContain('garantia 10 anos');
  });

  it('com comparação → usa Opção A (comparacao[0]) e lista as outras', () => {
    const bloco = montarBlocoProposta({
      nomeCliente: 'Maria',
      comparacao: [
        { rotulo: 'Opção A', potenciaKwp: 10, valorTotalRs: 40000, economiaMensalRs: 520, paybackTexto: '4 anos' },
        { rotulo: 'Opção B', potenciaKwp: 6, valorTotalRs: 26000 },
      ],
    });
    expect(bloco).toContain('10 kWp');
    expect(bloco).toContain('R$ 40.000');
    expect(bloco).toContain('R$ 520/mês');
    expect(bloco).toContain('payback): 4 anos');
    expect(bloco).toContain('Outras opções na proposta');
    expect(bloco).toContain('Opção B');
    expect(bloco).toContain('6 kWp');
  });

  it('parseia valores em string formato BR (R$ 32.000,00)', () => {
    const bloco = montarBlocoProposta({ potenciaKwp: '8,4', valorTotalRs: 'R$ 32.000,00' });
    expect(bloco).toContain('8,4 kWp');
    expect(bloco).toContain('R$ 32.000');
  });

  it('mostra consumo em kWh (consumoMensalKwh), não R$', () => {
    const bloco = montarBlocoProposta({ potenciaKwp: 5, consumoMensalKwh: 650 });
    expect(bloco).toContain('Consumo informado: 650 kWh/mês');
    expect(bloco).not.toContain('Consumo informado: R$');
  });

  it('sanitiza texto livre (tira quebra de linha e crase)', () => {
    const bloco = montarBlocoProposta({
      potenciaKwp: 5,
      modulo: { fabricante: 'Trina\nBomba`x', modelo: 'M', quantidade: 1 },
    });
    expect(bloco).not.toContain('`');
    expect(bloco).not.toContain('\nBomba');
    expect(bloco).toContain('Trina Bomba x M');
  });

  it('campos faltando não quebram (só potência)', () => {
    const bloco = montarBlocoProposta({ potenciaKwp: 5 });
    expect(bloco).toContain('5 kWp');
    expect(bloco).not.toContain('Investimento');
    expect(bloco).not.toContain('Módulos');
  });
});
