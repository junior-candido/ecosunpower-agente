// tests/fiscal-dps-xml.test.ts
import { describe, it, expect } from 'vitest';
import { montarDpsXml } from '../src/modules/financeiro/fiscal/dps-xml.js';

const endereco = { cMun: '5300108', cep: '70000000', xLgr: 'Rua Teste', nro: '100', xBairro: 'Centro' };
const entrada = {
  ambiente: 'homologacao' as const,
  dhEmi: new Date('2026-08-31T12:00:00-03:00'),
  serie: '1', nDps: 42,
  competencia: '2026-08-31',
  codMunicipio: '5300108',
  optanteSimples: false,
  prestador: { cnpj: '33020459000106', im: '0790506200159' },
  tomador: { tipo: 'PJ' as const, doc: '13245160000142', nome: 'CONDOMINIO DO EDIFICIO SPAZIO VERDE',
    endereco, email: null },
  servico: { codTribNacional: '31.01.02', codTribMunicipal: '1', descricao: 'adequação do sistema de aterramento elétrico' },
  obra: null,
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
  it('optante do Simples: regTrib traz opSimpNac=3 + regApTribSN=1 + regEspTrib=0 nessa ordem', () => {
    const { xml } = montarDpsXml({ ...entrada, optanteSimples: true });
    expect(xml).toContain('<opSimpNac>3</opSimpNac>');
    expect(xml).toContain('<regApTribSN>1</regApTribSN>');         // obrigatório quando opSimpNac=3
    expect(xml).toContain('<regEspTrib>0</regEspTrib>');
    expect(xml.indexOf('<opSimpNac>')).toBeLessThan(xml.indexOf('<regApTribSN>'));
    expect(xml.indexOf('<regApTribSN>')).toBeLessThan(xml.indexOf('<regEspTrib>'));
  });
  it('NÃO optante (homologação): opSimpNac=1 e SEM regApTribSN (fisco proíbe — E0160)', () => {
    const { xml } = montarDpsXml(entrada);
    expect(xml).toContain('<opSimpNac>1</opSimpNac>');
    expect(xml).not.toContain('<regApTribSN>');
    expect(xml).toContain('<regEspTrib>0</regEspTrib>');
  });
  it('tomador PJ leva endereço nacional completo (E0235): endNac + xLgr + nro + xBairro', () => {
    const { xml } = montarDpsXml(entrada);
    const toma = xml.slice(xml.indexOf('<toma>'), xml.indexOf('</toma>'));
    expect(toma).toContain('<endNac><cMun>5300108</cMun><CEP>70000000</CEP></endNac>');
    expect(toma).toContain('<xLgr>Rua Teste</xLgr><nro>100</nro><xBairro>Centro</xBairro>');
  });
  it('serviço de obra: grupo <obra> com endereço entra depois do cServ (E0370)', () => {
    const { xml } = montarDpsXml({ ...entrada, servico: { ...entrada.servico, codTribNacional: '07.02.02' }, obra: endereco });
    expect(xml).toContain('<obra><end><endNac>');
    expect(xml.indexOf('</cServ>')).toBeLessThan(xml.indexOf('<obra>'));
    expect(xml.indexOf('<obra>')).toBeLessThan(xml.indexOf('</serv>'));
  });
  it('sem obra informada, não gera o grupo <obra> (proibido fora dos itens 07.x)', () => {
    const { xml } = montarDpsXml(entrada);
    expect(xml).not.toContain('<obra>');
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
  // EM057 (teste real 01/09/2026): "O responsável pela retenção não é Substituto
  // Tributário OU a inscrição municipal não foi informada". O tomador que retém ISS
  // precisa levar a própria inscrição (no DF, o CF/DF). O campo existia na tela e no
  // banco, mas nunca chegava ao XML. Ordem do TCInfoPessoa (manual, p.3529):
  // CNPJ/CPF -> CAEPF -> IM -> xNome -> End -> Fone -> Email.
  it('tomador com inscrição municipal: <IM> sai entre o CNPJ e o xNome', () => {
    const { xml } = montarDpsXml({ ...entrada, tomador: { ...entrada.tomador, im: '0730000100123' } });
    expect(xml).toContain('<IM>0730000100123</IM>');
    expect(xml.indexOf('<CNPJ>13245160000142</CNPJ>')).toBeLessThan(xml.indexOf('<IM>0730000100123</IM>'));
    expect(xml.indexOf('<IM>0730000100123</IM>')).toBeLessThan(xml.indexOf('<xNome>'));
  });
  it('tomador sem inscrição: nao inventa tag IM vazia', () => {
    const { xml } = montarDpsXml({ ...entrada, tomador: { ...entrada.tomador, im: null } });
    expect(xml).not.toContain('<IM></IM>');
    const toma = xml.slice(xml.indexOf('<toma>'), xml.indexOf('</toma>'));
    expect(toma).not.toContain('<IM>');
  });
});

// Reforma tributária: grupo IBSCBS da DPS v1.01 (manual NotaControl v1.01 +
// GerarNfseEnvio-exemplo.xml oficial). Obrigatório pra competência a partir de
// 01/10/2026. Campos e ordem do TCRTCInfoIBSCBS: finNFSe → [indFinal] → cIndOp →
// [tpOper/gRefNFSe/tpEnteGov] → indDest → [dest] → [imovel] → valores{trib{gIBSCBS{CST, cClassTrib}}}.
describe('dps-xml — grupo IBS/CBS (DPS 1.01)', () => {
  const ibscbs = { cIndOp: '050102', cst: '000', cClassTrib: '000001' };
  it('com IBS/CBS a DPS vira versão 1.01; sem, continua 1.00', () => {
    expect(montarDpsXml({ ...entrada, ibscbs }).xml).toContain('<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01">');
    expect(montarDpsXml(entrada).xml).toContain('versao="1.00"');
    expect(montarDpsXml(entrada).xml).not.toContain('<IBSCBS>');
  });
  it('monta o grupo com os valores da nota 82, na ordem do schema', () => {
    const { xml } = montarDpsXml({ ...entrada, ibscbs });
    expect(xml).toContain(
      '<IBSCBS><finNFSe>0</finNFSe><cIndOp>050102</cIndOp><indDest>0</indDest>' +
      '<valores><trib><gIBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib></gIBSCBS></trib></valores></IBSCBS>',
    );
  });
  it('o grupo é o ÚLTIMO filho do infDPS (depois de valores, antes da assinatura)', () => {
    const { xml } = montarDpsXml({ ...entrada, ibscbs });
    expect(xml.indexOf('</valores><IBSCBS>')).toBeGreaterThan(0);
    expect(xml).toMatch(/<\/IBSCBS><\/infDPS><\/DPS>$/);
  });
  it('NÃO manda alíquota nem tpOper/tpEnteGov (o fisco calcula; tpOper é proibido fora de 25.05/15.09/17.12/10.05)', () => {
    const { xml } = montarDpsXml({ ...entrada, ibscbs });
    for (const tag of ['<pCBS>', '<pIBSUF>', '<tpOper>', '<tpEnteGov>', '<dest>', '<imovel>']) expect(xml).not.toContain(tag);
  });
  it('nota 83 (alíquota reduzida): CST 200 / cClassTrib 200052 / cIndOp 100301', () => {
    const { xml } = montarDpsXml({ ...entrada, ibscbs: { cIndOp: '100301', cst: '200', cClassTrib: '200052' } });
    expect(xml).toContain('<cIndOp>100301</cIndOp>');
    expect(xml).toContain('<CST>200</CST><cClassTrib>200052</cClassTrib>');
  });
  it('recusa código fora do formato (CST 3 dígitos, cClassTrib/cIndOp 6 dígitos)', () => {
    expect(() => montarDpsXml({ ...entrada, ibscbs: { ...ibscbs, cst: '00' } })).toThrow(/CST/);
    expect(() => montarDpsXml({ ...entrada, ibscbs: { ...ibscbs, cClassTrib: '1' } })).toThrow(/cClassTrib/);
    expect(() => montarDpsXml({ ...entrada, ibscbs: { ...ibscbs, cIndOp: 'abc' } })).toThrow(/cIndOp/);
  });
  it('NBS vai no cServ depois da descrição, só dígitos (TSCodNBS: N 9)', () => {
    const { xml } = montarDpsXml({ ...entrada, servico: { ...entrada.servico, nbs: '1.1415.00.00' } });
    expect(xml).toContain('<xDescServ>adequação do sistema de aterramento elétrico</xDescServ><cNBS>114150000</cNBS></cServ>');
  });
  it('NBS inválido (não tem 9 dígitos) não vai pro XML', () => {
    const { xml } = montarDpsXml({ ...entrada, servico: { ...entrada.servico, nbs: '1.14' } });
    expect(xml).not.toContain('<cNBS>');
  });
});
