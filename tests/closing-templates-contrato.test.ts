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

    it('cláusula 8.3 — variação de prazos (entrega material 3 sem–30 dias + concessionária)', () => {
      expect(html).toContain('8.3.');
      expect(html).toContain('Variação de prazos');
      expect(html).toContain('3 (três) semanas a 30 (trinta) dias');
      expect(html).toContain('entrega do material no local');
      // amarra ao prazo total do 8.1 (evita leitura de contradição)
      expect(html).toContain('sem prejuízo do prazo estimado no item 8.1');
      // usa a concessionária real do contrato — substring única do 8.3
      expect(html).toContain('vistoria da concessionária Equatorial-GO');
    });

    it('inversor com quantidade: mostra "X unidades", potência por unidade e total (caso micro)', () => {
      const micro = JSON.parse(JSON.stringify(dadosFechamentoCamilaMesmaPessoa));
      micro.sistema.inversor = { marca: 'Hoymiles', modelo: 'HMS-2250', potencia_kw: 2.25, quantidade: 2 };
      const h = renderContrato(micro);
      expect(h).toContain('2,25 kW por unidade');
      expect(h).toContain('Quantidade:</strong> 2 unidades');
      expect(h).toContain('Potência total dos inversores:</strong> 4,5 kW');
    });

    it('inversor SEM quantidade: não quebra (sistema com inversor string)', () => {
      // fixture padrão tem inversor sem quantidade → não renderiza a linha de quantidade
      expect(html).not.toContain('por unidade');
      expect(html).not.toContain('Potência total dos inversores');
    });

    it('assinaturas em blocos separados com espaço (não quebram entre páginas)', () => {
      expect(html.match(/bloco-assinatura/g)?.length).toBeGreaterThanOrEqual(2);
      expect(html).toContain('break-inside: avoid');
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
