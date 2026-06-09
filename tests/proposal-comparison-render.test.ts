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
  it('mostra a quantidade e o modelo dos módulos e do inversor de cada opção', () => {
    const completas: ComparacaoOpcao[] = [
      { ...opcoes[0], moduloQuantidade: 12, moduloModelo: 'Vertex', moduloPotenciaW: 700,
        inversorQuantidade: 1, inversorModelo: 'SG5.0RS-L' },
      { ...opcoes[1], moduloQuantidade: 14, moduloModelo: 'Hi-MO X10', moduloPotenciaW: 580,
        inversorQuantidade: 1, inversorModelo: 'SE5K' },
    ];
    const html = renderComparacaoSolar(completas);
    expect(html).toContain('12× Vertex 700W');
    expect(html).toContain('14× Hi-MO X10 580W');
    expect(html).toContain('1× SG5.0RS-L');
    expect(html).toContain('1× SE5K');
  });

  it('mostra a parcela do cartão (24×) de cada opção quando informada', () => {
    const completas: ComparacaoOpcao[] = [
      { ...opcoes[0], cartaoParcelaRs: 1940 },
      { ...opcoes[1], cartaoParcelaRs: 2220 },
    ];
    const html = renderComparacaoSolar(completas);
    expect(html).toContain('24×');
    expect(html.toLowerCase()).toContain('cartão');
    expect(html).toContain('R$ 1.940');
    expect(html).toContain('R$ 2.220');
  });

  it('mostra a parcela do financiamento (até 90×) de cada opção quando informada', () => {
    const completas: ComparacaoOpcao[] = [
      { ...opcoes[0], financiamentoParcelaRs: 720 },
      { ...opcoes[1], financiamentoParcelaRs: 830 },
    ];
    const html = renderComparacaoSolar(completas);
    expect(html).toContain('90×');
    expect(html.toLowerCase()).toContain('financiado');
    expect(html).toContain('R$ 720');
    expect(html).toContain('R$ 830');
  });

  it('mostra a economia mensal em R$ de cada opção quando informada', () => {
    const completas: ComparacaoOpcao[] = [
      { ...opcoes[0], economiaMensalRs: 850 },
      { ...opcoes[1], economiaMensalRs: 910 },
    ];
    const html = renderComparacaoSolar(completas);
    expect(html).toContain('R$ 850');
    expect(html).toContain('R$ 910');
    expect(html.toLowerCase()).toMatch(/economia mensal|por mês|\/mês/);
  });

  it('omite linhas de equipamento/economia quando não informadas (não quebra nem mostra NaN/undefined)', () => {
    const html = renderComparacaoSolar(opcoes); // sem qtd/modelo/economiaMensal
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('×  '); // não monta "qtd× " vazio
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
