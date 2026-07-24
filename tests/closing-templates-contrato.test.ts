// tests/closing-templates-contrato.test.ts
import { describe, it, expect } from 'vitest';
import { renderContrato, buildObservacaoPartes } from '../src/modules/closing/templates/contrato.html.js';
import { dadosFechamentoCamilaMesmaPessoa, dadosFechamentoCamilaToninhoContrato } from './fixtures/closing-camila.js';

// Extrai a sequência de números das cláusulas na ordem em que aparecem no HTML.
function numerosDasClausulas(html: string): number[] {
  return [...html.matchAll(/CLÁUSULA (\d+)ª/g)].map((m) => Number(m[1]));
}

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

    it('cláusula 7.3 — variação de prazos (entrega material 3 sem–30 dias + concessionária)', () => {
      expect(html).toContain('7.3.');
      expect(html).toContain('Variação de prazos');
      expect(html).toContain('3 (três) semanas a 30 (trinta) dias');
      expect(html).toContain('entrega do material no local');
      // amarra ao prazo total do 7.1 (evita leitura de contradição)
      expect(html).toContain('sem prejuízo do prazo estimado no item 7.1');
      // usa a concessionária real do contrato — substring única do 7.3
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

    it('cláusula de equipamentos (9ª) cita módulos e inversor', () => {
      expect(html).toContain('CLÁUSULA 9ª — DOS EQUIPAMENTOS');
      expect(html).toContain('Módulos Fotovoltaicos');
      expect(html).toContain('Trina Vertex');
      expect(html).toContain('700 Wp por módulo');
      expect(html).toContain('Quantidade:</strong> 12');
      expect(html).toContain('Sungrow SG5.0RS-L');
    });

    it('cláusula de pagamento (8ª) cita valor BRL formatado', () => {
      expect(html).toContain('CLÁUSULA 8ª — DO PREÇO E CONDIÇÕES DE PAGAMENTO');
      expect(html).toContain('R$');
      expect(html).toContain('38.500');
    });

    it('NÃO tem caixa de observação (mesma pessoa)', () => {
      expect(html).not.toContain('<div class="obs-marido">');
    });
  });

  describe('numeração sequencial (o bug das cláusulas puladas)', () => {
    it('sem disposições especiais: cláusulas 1ª a 16ª, sem buraco', () => {
      const html = renderContrato({ ...dadosFechamentoCamilaMesmaPessoa, disposicoes_especiais: undefined });
      expect(numerosDasClausulas(html)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    });

    it('com disposições especiais: 1ª a 17ª, disposições na 16ª e foro na 17ª', () => {
      const html = renderContrato({ ...dadosFechamentoCamilaMesmaPessoa, disposicoes_especiais: 'Brinde: limpeza no 1º ano.' });
      expect(numerosDasClausulas(html)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
      expect(html).toContain('CLÁUSULA 16ª — DAS DISPOSIÇÕES ESPECIAIS');
      expect(html).toContain('CLÁUSULA 17ª — DO FORO');
      expect(html).toContain('17.1.');
    });

    it('referências cruzadas apontam pros números novos', () => {
      const html = renderContrato(dadosFechamentoCamilaMesmaPessoa);
      expect(html).toContain('descritos na Cláusula 9ª'); // objeto → equipamentos
      expect(html).toContain('condições e prazos da Cláusula 8ª'); // contratante → pagamento
      expect(html).toContain('conforme especificado na Cláusula 9ª'); // contratada → equipamentos
      expect(html).toContain('prazos da Cláusula 7ª'); // contratada → cronograma
      expect(html).toContain('previstas na Cláusula 13ª'); // contratada → força maior
      expect(html).toContain('conforme Cláusula 10ª'); // contratada → garantias
      // nenhuma referência órfã pros números antigos
      expect(html).not.toContain('Cláusula 11ª'); // equipamentos era 11ª
      expect(html).not.toContain('Cláusula 12ª'); // garantias era 12ª
      expect(html).not.toContain('Cláusula 16ª'); // força maior era 16ª (sem disposições no fixture)
    });
  });

  describe('visita técnica: escolher se já foi feita ou não', () => {
    it('padrão (sem o campo): visita no futuro, com a rescisão sem multa (4.3)', () => {
      const html = renderContrato(dadosFechamentoCamilaMesmaPessoa);
      expect(html).toContain('realizará <strong>visita técnica</strong>');
      expect(html).toContain('<p>4.3.');
      expect(html).toContain('poderá ser rescindido sem multa');
      expect(html).toContain('(visita técnica, instalação e vistoria)');
    });

    it('visita_tecnica_realizada=false: igual ao padrão', () => {
      const html = renderContrato({ ...dadosFechamentoCamilaMesmaPessoa, visita_tecnica_realizada: false });
      expect(html).toContain('realizará <strong>visita técnica</strong>');
      expect(html).toContain('<p>4.3.');
    });

    it('visita_tecnica_realizada=true: visita no passado, sem a rescisão da visita', () => {
      const html = renderContrato({ ...dadosFechamentoCamilaMesmaPessoa, visita_tecnica_realizada: true });
      expect(html).toContain('já foi realizada');
      expect(html).not.toContain('realizará <strong>visita técnica</strong>');
      expect(html).not.toContain('poderá ser rescindido sem multa');
      expect(html).not.toContain('<p>4.3.');
      // 2.2 deixa de prometer acesso pra uma visita que já aconteceu
      expect(html).toContain('(instalação e vistoria)');
      expect(html).not.toContain('(visita técnica, instalação e vistoria)');
      // adequações passam a valer durante a execução (4.2 continua existindo)
      expect(html).toContain('<p>4.2.');
      expect(html).toContain('aceite formal por escrito');
      // a numeração continua sem buraco
      expect(numerosDasClausulas(html)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
      // o custo de visita+projeto na rescisão imotivada (11.2a) continua
      expect(html).toContain('custos com visita técnica e projeto (até R$ 1.500,00)');
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

describe('renderContrato — disposições especiais com texto literal', () => {
  it('NÃO inclui a cláusula quando disposicoes_especiais vazio', () => {
    const html = renderContrato({ ...dadosFechamentoCamilaMesmaPessoa, disposicoes_especiais: undefined });
    expect(html).not.toContain('DISPOSIÇÕES ESPECIAIS');
  });

  it('inclui o texto LITERAL quando preenchido', () => {
    const texto = '30% na assinatura e 70% na conexao pela concessionaria.';
    const html = renderContrato({ ...dadosFechamentoCamilaMesmaPessoa, disposicoes_especiais: texto });
    expect(html).toContain('DISPOSIÇÕES ESPECIAIS');
    expect(html).toContain(texto);
  });

  it('preserva caracteres especiais (% e parenteses)', () => {
    const texto = 'Garantia adicional de 5 (cinco) anos e 100% mao-de-obra.';
    const html = renderContrato({ ...dadosFechamentoCamilaMesmaPessoa, disposicoes_especiais: texto });
    expect(html).toContain('5 (cinco) anos');
    expect(html).toMatch(/100\s*%\s*mao-de-obra/);
  });
});
