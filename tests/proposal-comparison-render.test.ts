import { describe, it, expect } from 'vitest';
import { renderComparacaoSolar, type ComparacaoOpcao } from '../src/modules/proposal/comparison-render.js';

const opcoes: ComparacaoOpcao[] = [
  { rotulo: 'Opção A', potenciaKwp: 8.4, geracaoMensalKwh: 1080, valorTotalRs: 38500,
    paybackTexto: '4 anos e 2 meses', economia25AnosRs: 320000,
    moduloFabricante: 'Trina', inversorFabricante: 'Sungrow' },
  { rotulo: 'Opção B', potenciaKwp: 8.0, geracaoMensalKwh: 1040, valorTotalRs: 44000,
    paybackTexto: '4 anos e 9 meses', economia25AnosRs: 315000,
    moduloFabricante: 'LONGi', inversorFabricante: 'SolarEdge' },
];

describe('renderComparacaoSolar', () => {
  it('mostra as duas opções lado a lado, sem marca de "recomendado"', () => {
    const html = renderComparacaoSolar(opcoes);
    expect(html).toContain('Opção A');
    expect(html).toContain('Opção B');
    expect(html).toContain('R$ 38.500');
    expect(html).toContain('R$ 44.000');
    expect(html.toLowerCase()).not.toContain('recomendado');
  });
  it('puxa a ficha da marca de cada opção (tempo de mercado/tecnologia)', () => {
    const html = renderComparacaoSolar(opcoes);
    expect(html).toContain('Trina');
    expect(html).toContain('LONGi');
    expect(html.toLowerCase()).toMatch(/tier 1|topcon|mercado/);
  });
  it('mostra payback e economia de cada opção', () => {
    const html = renderComparacaoSolar(opcoes);
    expect(html).toContain('4 anos e 2 meses');
    expect(html).toContain('4 anos e 9 meses');
    expect(html).toContain('R$ 320.000');
  });
  it('retorna string vazia com menos de 2 opções', () => {
    expect(renderComparacaoSolar([opcoes[0]])).toBe('');
    expect(renderComparacaoSolar([])).toBe('');
  });
  it('escapa HTML no rótulo livre', () => {
    const html = renderComparacaoSolar([
      { ...opcoes[0], rotulo: '<img src=x onerror=alert(1)>' },
      opcoes[1],
    ]);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });
});
