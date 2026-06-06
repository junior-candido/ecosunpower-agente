import { describe, it, expect } from 'vitest';
import { renderServicosAdicionaisSection, type ServicoItem } from '../src/modules/proposal/service-render.js';

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
