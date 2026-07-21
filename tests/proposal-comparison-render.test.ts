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

  it('mostra a linha de créditos quando a opção gera mais do que o cliente consome', () => {
    const completas: ComparacaoOpcao[] = [
      { ...opcoes[0], creditosMensalKwh: 952 },
      { ...opcoes[1] }, // sem créditos
    ];
    const html = renderComparacaoSolar(completas);
    expect(html).toContain('952');
    expect(html.toLowerCase()).toContain('crédito');
    expect(html).toContain('60 meses');
  });

  it('autoconsumo remoto: economia dividida (casa + outra unidade) e kWh abatidos lá', () => {
    const html = renderComparacaoSolar([
      { ...opcoes[0], economiaMensalRs: 1924, economiaRemotaRs: 783, creditosRemotoKwh: 900, creditosMensalKwh: 52 },
      { ...opcoes[1], economiaMensalRs: 741 },
    ]);
    expect(html).toContain('R$ 1.924'); // total em destaque
    expect(html).toContain('R$ 1.141'); // parte da casa (total − remoto)
    expect(html).toContain('R$ 783');   // parte da outra unidade
    expect(html.toLowerCase()).toContain('outra unidade');
    expect(html).toContain('900');      // kWh abatidos lá
    expect(html).toContain('52');       // sobra guardada DEPOIS do remoto
  });

  it('NÃO mostra créditos quando são zero ou não informados', () => {
    const html = renderComparacaoSolar([
      { ...opcoes[0], creditosMensalKwh: 0 },
      { ...opcoes[1] },
    ]);
    expect(html.toLowerCase()).not.toContain('crédito');
  });

  it('desenha o mini-gráfico de geração mês a mês quando a opção traz a curva', () => {
    const curva = [1180, 1150, 1100, 1040, 980, 950, 1000, 1060, 1120, 1160, 1170, 1190];
    const html = renderComparacaoSolar([
      { ...opcoes[0], geracaoMensalDistribuida: curva },
      { ...opcoes[1], geracaoMensalDistribuida: curva.map(v => v * 0.5) },
    ]);
    expect(html).toContain('<svg'); // gráfico é SVG inline
    expect(html.toLowerCase()).toContain('geração mês a mês');
    expect((html.match(/<svg/g) ?? []).length).toBeGreaterThanOrEqual(2); // um por card
  });

  it('sem curva: não desenha gráfico nem quebra', () => {
    const html = renderComparacaoSolar(opcoes);
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('undefined');
  });

  it('curva inválida (≠ 12 valores) é ignorada sem quebrar', () => {
    const html = renderComparacaoSolar([
      { ...opcoes[0], geracaoMensalDistribuida: [100, 200] },
      opcoes[1],
    ]);
    expect(html).not.toContain('<svg');
  });

  it('mini-gráfico mostra o NÚMERO da geração em cada barra (pedido 21/07)', () => {
    const curva = [2020, 1939, 2070, 1997, 2121, 2051, 2267, 2489, 2581, 2402, 1920, 1970];
    const html = renderComparacaoSolar([
      { ...opcoes[0], geracaoMensalDistribuida: curva },
      { ...opcoes[1] },
    ]);
    expect(html).toContain('>2.489<'); // valor em cima da barra (pt-BR)
    expect(html).toContain('>2.020<');
  });

  it('bateria com 2 unidades soma a capacidade (2× 5 kWh → 10 kWh)', () => {
    const html = renderComparacaoSolar([
      { ...opcoes[0], bateriaFabricante: 'Huawei', bateriaModelo: 'LUNA', bateriaCapacidadeKwh: 5, bateriaQuantidade: 2 },
      { ...opcoes[1] },
    ]);
    expect(html).toContain('2× LUNA');
    expect(html).toMatch(/10(,0)?\s?kWh/);
  });

  it('bateria sem capacidade OU sem quantidade: linha não aparece (régua do motor)', () => {
    const html = renderComparacaoSolar([
      { ...opcoes[0], bateriaFabricante: 'BYD', bateriaModelo: 'B-Box' }, // incompleta
      { ...opcoes[1], bateriaFabricante: 'Huawei', bateriaCapacidadeKwh: 5 }, // sem quantidade
    ]);
    expect(html).not.toContain('Bateria');
  });

  it('card mostra a linha de Bateria quando a opção é híbrida', () => {
    const html = renderComparacaoSolar([
      { ...opcoes[0], bateriaFabricante: 'BYD', bateriaModelo: 'B-Box HVS', bateriaCapacidadeKwh: 10.2, bateriaQuantidade: 1 },
      { ...opcoes[1] }, // on-grid, sem linha de bateria
    ]);
    expect(html).toContain('Bateria');
    expect(html).toContain('B-Box HVS');
    expect(html).toMatch(/10,2\s?kWh/);
    // só um card tem a linha
    expect((html.match(/Bateria/g) ?? []).length).toBe(1);
  });

  it('curva toda zeros ou com NaN: sem gráfico, sem quebrar', () => {
    const zeros = Array(12).fill(0);
    const comNaN = [...Array(11).fill(100), NaN];
    const html = renderComparacaoSolar([
      { ...opcoes[0], geracaoMensalDistribuida: zeros },
      { ...opcoes[1], geracaoMensalDistribuida: comNaN },
    ]);
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('NaN');
  });

  it('mostra o consumo usado no cálculo quando as opções usam consumos DIFERENTES (cenários)', () => {
    const html = renderComparacaoSolar([
      { ...opcoes[0], consumoMensalKwh: 1200 },
      { ...opcoes[1], consumoMensalKwh: 800 },
    ]);
    expect(html.toLowerCase()).toContain('consumo');
    expect(html).toContain('1.200');
    expect(html).toContain('800');
  });

  it('consumo IGUAL nas duas: não repete a linha em cada card (é do cliente, não da opção)', () => {
    const html = renderComparacaoSolar([
      { ...opcoes[0], consumoMensalKwh: 1200 },
      { ...opcoes[1], consumoMensalKwh: 1200 },
    ]);
    expect(html.toLowerCase()).not.toContain('consumo de');
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
