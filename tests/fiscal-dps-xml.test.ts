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
  servico: { codTribNacional: '31.01.02', codTribMunicipal: '1', descricao: 'adequação do sistema de aterramento elétrico' },
  valores: { vServ: 1250.00, issRetido: true },
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
    expect(xml).toContain('<cTribMun>1</cTribMun>');               // obrigatório (validador oficial 31/08)
    expect(xml.indexOf('<cTribNac>')).toBeLessThan(xml.indexOf('<cTribMun>'));
    expect(xml.indexOf('<cTribMun>')).toBeLessThan(xml.indexOf('<xDescServ>'));
    expect(xml).toContain('<vServ>1250.00</vServ>');
    expect(xml).toContain('<tpRetISSQN>2</tpRetISSQN>');           // retido pelo tomador
    expect(xml).toContain('xmlns="http://www.sped.fazenda.gov.br/nfse"');
    expect(xml).toContain(`Id="${idDps}"`);
    expect(idDps.startsWith('DPS')).toBe(true);
  });
  it('regTrib traz opSimpNac=3, regApTribSN=1 e regEspTrib=0 nessa ordem (exigência do manual v1.01)', () => {
    const { xml } = montarDpsXml(entrada);
    expect(xml).toContain('<opSimpNac>3</opSimpNac>');
    expect(xml).toContain('<regApTribSN>1</regApTribSN>');         // obrigatório quando opSimpNac=3
    expect(xml).toContain('<regEspTrib>0</regEspTrib>');
    expect(xml.indexOf('<opSimpNac>')).toBeLessThan(xml.indexOf('<regApTribSN>'));
    expect(xml.indexOf('<regApTribSN>')).toBeLessThan(xml.indexOf('<regEspTrib>'));
  });
  it('prest é o emitente: sem xNome nem endereço no bloco do prestador', () => {
    const { xml } = montarDpsXml(entrada);
    const prest = xml.slice(xml.indexOf('<prest>'), xml.indexOf('</prest>'));
    expect(prest).toContain('<CNPJ>');
    expect(prest).toContain('<IM>');
    expect(prest).not.toContain('<xNome>');
    expect(prest).not.toContain('<end>');
  });
  it('id da DPS tem 45 caracteres (DPS + 7 + 1 + 14 + 5 + 15)', () => {
    const { idDps } = montarDpsXml(entrada);
    expect(idDps.length).toBe(45);
  });
  it('dhEmi sai no fuso de Brasília com offset explícito (schema recusa "Z")', () => {
    const { xml } = montarDpsXml(entrada);
    expect(xml).toContain('<dhEmi>2026-08-31T12:00:00-03:00</dhEmi>');
    expect(xml).not.toMatch(/<dhEmi>[^<]*Z<\/dhEmi>/);
  });
  it('não gera comentários XML dentro da DPS', () => {
    const { xml } = montarDpsXml(entrada);
    expect(xml).not.toContain('<!--');
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
