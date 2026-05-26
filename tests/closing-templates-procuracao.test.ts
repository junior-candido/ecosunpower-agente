// tests/closing-templates-procuracao.test.ts
import { describe, it, expect } from 'vitest';
import { renderProcuracao } from '../src/modules/closing/templates/procuracao.html.js';
import { dadosFechamentoCamilaMesmaPessoa, dadosFechamentoCamilaToninhoContrato } from './fixtures/closing-camila.js';

describe('renderProcuracao', () => {
  const html = renderProcuracao(dadosFechamentoCamilaMesmaPessoa);

  it('outorgante é o titular da UC', () => {
    expect(html).toContain('Camila Barbosa Costa Cardoso');
    expect(html).toContain('028.876.121-90');
    expect(html).toContain('26163');
    expect(html).toContain('MTE-DF');
  });

  it('outorgada é EcoSunPower com dados Junior CREA/CFT', () => {
    expect(html).toContain('ECOSUNPOWER ENERGIA SOLAR LTDA');
    expect(html).toContain('33.020.459/0001-06');
    expect(html).toContain('ANTONIO CANDIDO RODRIGUES JUNIOR');
    expect(html).toContain('98940457153');
  });

  it('contém UC e concessionária', () => {
    expect(html).toContain('10005936703');
    expect(html).toContain('Equatorial-GO');
  });

  it('validade 180 dias', () => {
    expect(html).toContain('180 (cento e oitenta) dias');
  });

  it('outorgante é SEMPRE titular_uc, mesmo se contratante for outra pessoa', () => {
    const htmlComToninho = renderProcuracao(dadosFechamentoCamilaToninhoContrato);
    expect(htmlComToninho).toContain('Camila Barbosa Costa Cardoso');
    expect(htmlComToninho).not.toContain('Toninho');
  });
});
