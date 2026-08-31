// tests/fiscal-dps-xml.test.ts
import { describe, it, expect } from 'vitest';
import { montarDpsXml } from '../src/modules/financeiro/fiscal/dps-xml.js';

const entrada = {
  ambiente: 'homologacao' as const,
  dhEmi: new Date('2026-08-31T12:00:00-03:00'),
  serie: '1', nDps: 42,
  competencia: '2026-08-31',
  codMunicipio: '5300108',
  prestador: { cnpj: '33020459000106', im: '0790506200159' },
  tomador: { tipo: 'PJ' as const, doc: '13245160000142', nome: 'CONDOMINIO DO EDIFICIO SPAZIO VERDE',
    cep: '70000000', codMunicipio: '5300108', email: null },
  servico: { codTribNacional: '31.01.02', descricao: 'adequação do sistema de aterramento elétrico' },
  valores: { vServ: 1250.00, aliquotaIss: 0.05, issRetido: true },
};

describe('dps-xml', () => {
  it('gera XML com os campos essenciais', () => {
    const { xml, idDps } = montarDpsXml(entrada);
    expect(xml).toContain('<tpAmb>2</tpAmb>');                    // homologação
    expect(xml).toContain('<serie>1</serie>');
    expect(xml).toContain('<nDPS>42</nDPS>');
    expect(xml).toContain('<dCompet>2026-08-31</dCompet>');
    expect(xml).toContain('<CNPJ>33020459000106</CNPJ>');
    expect(xml).toContain('<cTribNac>310102</cTribNac>');          // sem pontos
    expect(xml).toContain('<vServ>1250.00</vServ>');
    expect(xml).toContain('<tpRetISSQN>2</tpRetISSQN>');           // retido pelo tomador
    expect(xml).toContain('xmlns="http://www.sped.fazenda.gov.br/nfse"');
    expect(xml).toContain(`Id="${idDps}"`);
    expect(idDps.startsWith('DPS')).toBe(true);
  });
  it('sem retenção manda tpRetISSQN=1', () => {
    const { xml } = montarDpsXml({ ...entrada, valores: { ...entrada.valores, issRetido: false } });
    expect(xml).toContain('<tpRetISSQN>1</tpRetISSQN>');
  });
  it('tomador PF sai com CPF', () => {
    const { xml } = montarDpsXml({ ...entrada, tomador: { ...entrada.tomador, tipo: 'PF', doc: '12345678901' } });
    expect(xml).toContain('<CPF>12345678901</CPF>');
  });
  it('escapa caracteres especiais na descrição', () => {
    const { xml } = montarDpsXml({ ...entrada, servico: { ...entrada.servico, descricao: 'a & b < c' } });
    expect(xml).toContain('a &amp; b &lt; c');
  });
});
