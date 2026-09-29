// tests/fiscal-nfse-pdf-dados.test.ts
// Dados do PDF da NFS-e: lidos do XML AUTORIZADO do fisco (fonte da verdade);
// o banco só completa o que o XML não traz.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lerXmlNfse, montarDadosPdf, urlConsultaNacional } from '../src/modules/financeiro/fiscal/nfse-pdf-dados.js';
import type { NotaLinha } from '../src/modules/financeiro/fiscal/notas-repo.js';

const XML = readFileSync(new URL('./fixtures/nfse-autorizada-teste.xml', import.meta.url), 'utf8');

const nota: NotaLinha = {
  id: '00000000-0000-0000-0000-0000000000aa', companyId: 'c1', status: 'autorizada', numero: '82',
  competencia: '2026-08-25', descricao: 'descrição do banco',
  tomador: { tipo: 'PJ', doc: '08616988000120', nome: 'NOME DO BANCO', im: '0748411100113', endereco: 'x', email: 'banco@x.com',
    municipio: 'Brasília', uf: 'DF', cep: '71805511', logradouro: 'Rua do banco', numero: '1', bairro: 'B', codMunIbge: '5300108' },
  servicoId: 's1', valorBruto: 19995, valorIss: 999.75, issRetido: true, valorLiquido: 18995.25,
  pdfStoragePath: null, contaReceberId: null,
  chaveAcesso: '53001081233020459000106000000000008226081787671197', ambienteEmissao: 'producao', xmlNfse: XML,
};
const config = { cnpj: '33.020.459/0001-06', inscricao_municipal: '0790506200159', razao_social: 'RAZÃO DA CONFIG', municipio: 'Brasília', uf: 'DF' };
const servico = { cod_trib_nacional: '14.01.01', cod_trib_municipal: '1401', nbs: '1.2001.60.00', nome: 'Manutenção' };

describe('lerXmlNfse', () => {
  it('lê número, chave (do Id), datas e DPS', () => {
    const l = lerXmlNfse(XML);
    expect(l.numero).toBe('82');
    expect(l.chave).toBe('53001081233020459000106000000000008226081787671197');
    expect(l.dhProc).toBe('2026-08-25T12:19:53-03:00');
    expect(l.dps).toMatchObject({ serie: '1', nDps: '82', dhEmi: '2026-08-25T12:19:50-03:00', competencia: '2026-08-25', tpAmb: '1' });
  });
  it('separa a base do ISS (19.995) da base do IBS/CBS (18.995,25) — mesma tag vBC em grupos diferentes', () => {
    const l = lerXmlNfse(XML);
    expect(l.iss).toMatchObject({ vBC: 19995, pAliq: 5, vISSQN: 999.75, vTotalRet: 999.75, vLiq: 18995.25, retido: true });
    expect(l.ibscbs).toMatchObject({ vBC: 18995.25, pCBS: 0.9, pAliqEfetCBS: 0.9, vCBS: 170.96, pIBSUF: 0.1, vIBSUF: 19, pIBSMun: 0, vIBSMun: 0, vIBSTot: 19, vTotNF: 18995.25 });
    expect(l.ibscbs).toMatchObject({ cIndOp: '050102', cst: '000', cClassTrib: '000001', xLocalidadeIncid: 'Brasília' });
  });
  it('emitente e tomador completos', () => {
    const l = lerXmlNfse(XML);
    expect(l.emit).toMatchObject({ cnpj: '33020459000106', nome: 'EMPRESA TESTE ENERGIA SOLAR LTDA', fantasia: 'TESTE SOLAR', cep: '71993150', uf: 'DF', email: 'teste@exemplo.com.br' });
    expect(l.toma).toMatchObject({ doc: '08616988000120', im: '0748411100113', nome: 'CLIENTE TESTE SUPERMERCADO LTDA', cep: '71805511', fone: '6130118500' });
    expect(l.serv).toMatchObject({ cTribNac: '140101', cTribMun: '1401', cNBS: '120016000' });
  });
  it('XML vazio/lixo não explode', () => {
    expect(lerXmlNfse('').numero).toBeNull();
    expect(lerXmlNfse('<x/>').ibscbs.vCBS).toBeNull();
  });
});

describe('montarDadosPdf', () => {
  it('nota autorizada: tudo do XML do fisco (nome do tomador do XML, não do banco)', () => {
    const d = montarDadosPdf({ nota, config, servico });
    expect(d.numero).toBe('82');
    expect(d.chave).toBe('53001081233020459000106000000000008226081787671197');
    expect(d.tomador.nome).toBe('CLIENTE TESTE SUPERMERCADO LTDA');
    expect(d.prestador.nome).toBe('EMPRESA TESTE ENERGIA SOLAR LTDA');
    expect(d.servico).toMatchObject({ codTribNacional: '14.01.01', atividadeMunicipal: '14.01', nbs: '1.2001.60.00' });
    expect(d.iss).toMatchObject({ retido: true, base: 19995, aliquota: 5, valor: 999.75 });
    expect(d.ibscbs).toMatchObject({ estimado: false, base: 18995.25, vCBS: 170.96, vIBSUF: 19, situacao: 'Tributação integral' });
    expect(d.valores).toMatchObject({ vServ: 19995, totalRetencao: 999.75, vLiq: 18995.25, vTotNF: 18995.25 });
    expect(d.semValorFiscal).toBeNull();
    expect(d.urlConsulta).toBe('https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=53001081233020459000106000000000008226081787671197');
  });
  it('sem XML (prévia): usa o banco + catálogo e marca o IBS/CBS como estimado', () => {
    const d = montarDadosPdf({ nota: { ...nota, xmlNfse: null, chaveAcesso: null, numero: null, status: 'preparada' }, config, servico });
    expect(d.tomador.nome).toBe('NOME DO BANCO');
    expect(d.prestador.nome).toBe('RAZÃO DA CONFIG');
    expect(d.ibscbs).toMatchObject({ estimado: true, base: 18995.25, vCBS: 170.96, vIBSUF: 19 });
    expect(d.semValorFiscal).toMatch(/PRÉVIA/);
    expect(d.urlConsulta).toBeNull();
  });
  it('homologação: tarja SEM VALOR FISCAL', () => {
    const d = montarDadosPdf({ nota: { ...nota, ambienteEmissao: 'homologacao', xmlNfse: XML.replace('<tpAmb>1</tpAmb>', '<tpAmb>2</tpAmb>') }, config, servico });
    expect(d.semValorFiscal).toMatch(/HOMOLOGAÇÃO/);
  });
  it('urlConsultaNacional só aceita chave de 50 dígitos', () => {
    expect(urlConsultaNacional('123')).toBeNull();
    expect(urlConsultaNacional(null)).toBeNull();
  });
});
