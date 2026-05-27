// tests/closing-templates-contrato.test.ts
import { describe, it, expect } from 'vitest';
import { renderContrato, buildObservacaoPartes } from '../src/modules/closing/templates/contrato.html.js';
import { dadosFechamentoCamilaMesmaPessoa, dadosFechamentoCamilaToninhoContrato } from './fixtures/closing-camila.js';

describe('renderContrato', () => {
  describe('caso mesma pessoa (Camila titular E contratante)', () => {
    const html = renderContrato(dadosFechamentoCamilaMesmaPessoa);

    it('CONTRATANTE é a Camila', () => {
      expect(html).toContain('Camila Barbosa Costa Cardoso');
      expect(html).toContain('028.876.121-90');
    });

    it('CONTRATADA é EcoSunPower com Junior', () => {
      expect(html).toContain('ECOSUNPOWER ENERGIA SOLAR LTDA');
      expect(html).toContain('ANTONIO CANDIDO RODRIGUES JUNIOR');
    });

    it('cláusula 1 cita kWp, modalidade, concessionária, UC, endereço instalação', () => {
      expect(html).toContain('8.4 kWp');
      expect(html).toContain('autoconsumo local');
      expect(html).toContain('Equatorial-GO');
      expect(html).toContain('10005936703');
      expect(html).toContain('Águas Lindas de Goiás');
    });

    it('cláusula 11 cita módulos e inversor', () => {
      expect(html).toContain('Módulos Fotovoltaicos');
      expect(html).toContain('Trina Vertex');
      expect(html).toContain('700 Wp por módulo');
      expect(html).toContain('Quantidade:</strong> 12');
      expect(html).toContain('Sungrow SG5.0RS-L');
    });

    it('cláusula 9 cita valor BRL formatado', () => {
      expect(html).toContain('R$');
      expect(html).toContain('38.500');
    });

    it('NÃO tem caixa de observação (mesma pessoa)', () => {
      expect(html).not.toContain('<div class="obs-marido">');
    });
  });

  describe('caso contratante=Toninho (cônjuge da Camila)', () => {
    const html = renderContrato(dadosFechamentoCamilaToninhoContrato);

    it('CONTRATANTE é o Toninho, não a Camila', () => {
      expect(html).toContain('Toninho');
      expect(html).toContain('444.555.666-77');
    });

    it('tem caixa de observação amarela citando cônjuge', () => {
      expect(html).toContain('obs-marido');
      expect(html).toContain('cônjuge');
      expect(html).toContain('Camila Barbosa Costa Cardoso');
    });

    it('cláusula 1 ainda cita UC e endereço da titular', () => {
      expect(html).toContain('10005936703');
      expect(html).toContain('Águas Lindas de Goiás');
    });
  });

  describe('buildObservacaoPartes', () => {
    it('retorna undefined se contratante_eh_titular=true', () => {
      expect(buildObservacaoPartes(dadosFechamentoCamilaMesmaPessoa)).toBeUndefined();
    });
    it('retorna texto cônjuge quando relação=conjuge', () => {
      const obs = buildObservacaoPartes(dadosFechamentoCamilaToninhoContrato);
      expect(obs).toContain('cônjuge');
      expect(obs).toContain('Camila Barbosa Costa Cardoso');
    });
  });
});

describe('renderContrato — clausula 23 literal', () => {
  it('NAO inclui clausula 23 quando disposicoes_especiais vazio', () => {
    const html = renderContrato({ ...dadosFechamentoCamilaMesmaPessoa, disposicoes_especiais: undefined });
    expect(html).not.toMatch(/CL[ÁA]USULA 23/);
  });

  it('inclui clausula 23 com texto LITERAL quando preenchido', () => {
    const texto = '30% na assinatura e 70% na conexao pela concessionaria.';
    const html = renderContrato({ ...dadosFechamentoCamilaMesmaPessoa, disposicoes_especiais: texto });
    expect(html).toMatch(/CL[ÁA]USULA 23/);
    expect(html).toContain(texto);
  });

  it('preserva caracteres especiais (% e parenteses) na clausula 23', () => {
    const texto = 'Garantia adicional de 5 (cinco) anos e 100% mao-de-obra.';
    const html = renderContrato({ ...dadosFechamentoCamilaMesmaPessoa, disposicoes_especiais: texto });
    expect(html).toContain('5 (cinco) anos');
    expect(html).toMatch(/100\s*%\s*mao-de-obra/);
  });
});
