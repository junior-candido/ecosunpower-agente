import { describe, it, expect } from 'vitest';
import { renderServicosAdicionaisSection, somaServicosExtras, type ServicoItem } from '../src/modules/proposal/service-render.js';
import { renderServiceOnlyHTML, type ServiceOnlyData } from '../src/modules/proposal/service-render.js';

describe('somaServicosExtras', () => {
  it('soma só os serviços "a mais" (ignora os já incluso)', () => {
    expect(somaServicosExtras([
      { titulo: 'Adequação', descricao: '', valorRs: 2800, jaIncluso: false },
      { titulo: 'Carregador', descricao: '', valorRs: 1000, jaIncluso: true },
    ])).toBe(2800);
  });
  it('serviço sem o campo jaIncluso conta como extra (soma)', () => {
    expect(somaServicosExtras([{ titulo: 'A', descricao: '', valorRs: 500 }])).toBe(500);
  });
  it('vazio ou undefined = 0', () => {
    expect(somaServicosExtras([])).toBe(0);
    expect(somaServicosExtras(undefined)).toBe(0);
  });
});

const servicos: ServicoItem[] = [
  { titulo: 'Carregador EV', descricao: 'Wallbox 7,4 kW instalado com circuito dedicado', valorRs: 4500 },
  { titulo: 'Adequação de padrão', descricao: 'Troca do disjuntor geral pra trifásico', valorRs: 2800 },
];

describe('renderServicosAdicionaisSection', () => {
  it('lista cada serviço com título, descrição e preço', () => {
    const html = renderServicosAdicionaisSection(servicos, 38500);
    expect(html).toContain('Carregador EV');
    expect(html).toContain('Wallbox 7,4 kW instalado com circuito dedicado');
    expect(html).toContain('R$ 4.500');
    expect(html).toContain('Adequação de padrão');
  });
  it('mostra o total geral (solar + serviços)', () => {
    const html = renderServicosAdicionaisSection(servicos, 38500);
    // 38500 + 4500 + 2800 = 45800
    expect(html).toContain('R$ 45.800');
  });
  it('retorna string vazia quando não há serviços', () => {
    expect(renderServicosAdicionaisSection([], 38500)).toBe('');
  });
  it('escapa HTML na descrição livre do Junior', () => {
    const html = renderServicosAdicionaisSection(
      [{ titulo: 'X', descricao: '<script>alert(1)</script>', valorRs: 100 }], 1000);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
  it('escapa HTML também no título', () => {
    const html = renderServicosAdicionaisSection(
      [{ titulo: '<img src=x onerror=alert(1)>', descricao: 'ok', valorRs: 100 }], 1000);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });
  it('não renderiza NaN quando um valor é inválido', () => {
    const html = renderServicosAdicionaisSection(
      [{ titulo: 'X', descricao: 'y', valorRs: ('abc' as unknown as number) }], 38500);
    expect(html).not.toContain('NaN');
    expect(html).toContain('R$ 38.500'); // total = 38500 + 0
  });
});

describe('renderServicosAdicionaisSection — já incluso vs a mais', () => {
  it('serviço "já incluso" NÃO soma ao total geral', () => {
    const html = renderServicosAdicionaisSection(
      [{ titulo: 'Carregador EV', descricao: 'Wallbox 7,4kW', valorRs: 1000, jaIncluso: true }],
      38500);
    // O carregador já está dentro do total — total segue 38.500, não 39.500.
    expect(html).toContain('R$ 38.500');
    expect(html).not.toContain('R$ 39.500');
  });
  it('serviço "já incluso" mostra selo de incluso', () => {
    const html = renderServicosAdicionaisSection(
      [{ titulo: 'Carregador EV', descricao: 'Wallbox 7,4kW', valorRs: 1000, jaIncluso: true }],
      38500);
    expect(html.toLowerCase()).toContain('já incluso');
  });
  it('serviço "já incluso" ainda mostra título, descrição e valor', () => {
    const html = renderServicosAdicionaisSection(
      [{ titulo: 'Carregador EV', descricao: 'Wallbox 7,4kW com circuito dedicado', valorRs: 1000, jaIncluso: true }],
      38500);
    expect(html).toContain('Carregador EV');
    expect(html).toContain('Wallbox 7,4kW com circuito dedicado');
    expect(html).toContain('R$ 1.000');
  });
  it('mistura: serviço "a mais" soma, "já incluso" não soma', () => {
    const html = renderServicosAdicionaisSection([
      { titulo: 'Adequação de padrão', descricao: 'troca padrão', valorRs: 2800, jaIncluso: false },
      { titulo: 'Carregador EV', descricao: 'wallbox', valorRs: 1000, jaIncluso: true },
    ], 38500);
    // 38.500 + 2.800 (a mais) = 41.300 ; carregador (incluso) não entra na conta.
    expect(html).toContain('R$ 41.300');
    expect(html).not.toContain('R$ 42.300');
  });
  it('sem o campo jaIncluso (ausente) soma como antes — retrocompatível', () => {
    const html = renderServicosAdicionaisSection(
      [{ titulo: 'Carregador EV', descricao: 'wallbox', valorRs: 1000 }],
      38500);
    expect(html).toContain('R$ 39.500');
  });
});

describe('renderServiceOnlyHTML', () => {
  const base: ServiceOnlyData = {
    numeroProposta: '2026-0150',
    dataProposta: '06/06/2026',
    validadeDias: 5,
    nomeCliente: 'Edmilson',
    servicos: [{ titulo: 'Adequação de padrão', descricao: 'Troca pra padrão trifásico', valorRs: 2800 }],
    formasPagamento: [{ tipo: 'À Vista', titulo: 'PIX', valorPrincipal: 'R$ 2.800', valorSecundario: 'único', bullets: ['Sem juros'] }],
    empresa: { nome: 'EcoSunPower', cnpj: '00', cidade: 'Brasília-DF', telefone: '(61) 99697-8781', site: 'ecosunpower.eng.br' },
  };
  it('renderiza nome, serviço, descrição e total — sem gráfico/payback', () => {
    const html = renderServiceOnlyHTML(base);
    expect(html).toContain('Edmilson');
    expect(html).toContain('Adequação de padrão');
    expect(html).toContain('R$ 2.800');
    expect(html).not.toContain('Payback');
    expect(html).not.toContain('barGeracaoGrad'); // sem o gráfico solar
  });
  it('inclui a imagem do serviço quando há imagemUrl', () => {
    const html = renderServiceOnlyHTML({ ...base, servicos: [{ ...base.servicos[0], imagemUrl: 'https://x/img.jpg' }] });
    expect(html).toContain('https://x/img.jpg');
  });
  it('soma vários serviços no total', () => {
    const html = renderServiceOnlyHTML({ ...base, servicos: [
      { titulo: 'A', descricao: 'a', valorRs: 1000 },
      { titulo: 'B', descricao: 'b', valorRs: 500 },
    ]});
    expect(html).toContain('R$ 1.500');
  });
  it('escapa HTML na descrição e título livres', () => {
    const html = renderServiceOnlyHTML({ ...base, servicos: [
      { titulo: '<x>', descricao: '<script>alert(1)</script>', valorRs: 100 },
    ]});
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
  it('lança erro sem nome ou sem serviço', () => {
    expect(() => renderServiceOnlyHTML({ ...base, servicos: [] })).toThrow();
    expect(() => renderServiceOnlyHTML({ ...base, nomeCliente: '' })).toThrow();
  });
});
