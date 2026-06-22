import { describe, it, expect } from 'vitest';
import { renderComoFuncionaSection } from '../src/modules/proposal/como-funciona-render.js';

describe('renderComoFuncionaSection', () => {
  const html = renderComoFuncionaSection();

  it('tem os marcos da jornada', () => {
    expect(html).toContain('Aceite');
    expect(html).toContain('Projeto + Homologação');
    expect(html).toContain('Compra');
    expect(html).toContain('Instalação');
    expect(html).toContain('Vistoria');
    expect(html).toContain('Usina Ligada');
  });

  it('mostra o processo em paralelo', () => {
    expect(html).toContain('Em paralelo');
  });

  it('cita o prazo legal (15 dias) e o total (~45 dias)', () => {
    expect(html).toContain('15 dias');
    expect(html).toContain('45 dias');
  });

  it('usa o título profissional correto e não diz "engenheiro"', () => {
    expect(html).toContain('Responsável Técnico CREA/CFT');
    expect(html.toLowerCase()).not.toContain('engenheiro');
  });

  it('é uma <section> com a classe journey-section', () => {
    expect(html).toContain('<section class="journey-section">');
  });
});
