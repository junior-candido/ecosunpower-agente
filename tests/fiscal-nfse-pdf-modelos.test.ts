// tests/fiscal-nfse-pdf-modelos.test.ts
// Os 2 modelos de PDF copiam os layouts do portal: GDF/ISS.net (notas 82/83) e
// DANFSe v2.0 nacional (nota 85). Função pura: dados → HTML.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { montarDadosPdf } from '../src/modules/financeiro/fiscal/nfse-pdf-dados.js';
import { htmlModeloGdf, htmlModeloNacional, nomeArquivoPdf } from '../src/modules/financeiro/fiscal/nfse-pdf-modelos.js';
import type { NotaLinha } from '../src/modules/financeiro/fiscal/notas-repo.js';

const XML = readFileSync(new URL('./fixtures/nfse-autorizada-teste.xml', import.meta.url), 'utf8');
const nota: NotaLinha = {
  id: '00000000-0000-0000-0000-0000000000aa', companyId: 'c1', status: 'autorizada', numero: '82',
  competencia: '2026-08-25', descricao: 'x',
  tomador: { tipo: 'PJ', doc: '08616988000120', nome: 'CLIENTE', im: null, endereco: '', email: null, municipio: 'Brasília', uf: 'DF' },
  servicoId: 's1', valorBruto: 19995, valorIss: 999.75, issRetido: true, valorLiquido: 18995.25,
  pdfStoragePath: null, contaReceberId: null, chaveAcesso: null, ambienteEmissao: 'producao', xmlNfse: XML,
};
const dados = montarDadosPdf({ nota, config: null, servico: { cod_trib_nacional: '14.01.01', cod_trib_municipal: '1401', nbs: null } });
const QR = 'data:image/png;base64,AAAA';

describe('modelo GDF / ISS.net (notas 82/83)', () => {
  const html = htmlModeloGdf(dados, QR);
  it('cabeçalho e blocos na ordem do portal', () => {
    const ordem = ['Governo do Distrito Federal', 'Coordenação do ISS', 'Número da Nota Fiscal', 'Código de Autenticidade',
      'IDENTIFICAÇÃO DO PRESTADOR', 'IDENTIFICAÇÃO DO TOMADOR', 'INTERMEDIÁRIO DO SERVIÇO NÃO IDENTIFICADO NA NFS-E',
      'DESTINATÁRIO É O PRÓPRIO TOMADOR IDENTIFICADO NA NFS-E', 'DADOS DO SERVIÇO PRESTADO',
      'IMPOSTO SOBRE SERVIÇO DE QUALQUER NATUREZA - ISSQN', 'TRIBUTAÇÃO NACIONAL',
      'IMPOSTO E CONTRIBUIÇÃO SOBRE BENS E SERVIÇOS - IBS/CBS', 'INFORMAÇÕES COMPLEMENTARES'];
    let pos = -1;
    for (const t of ordem) { const i = html.indexOf(t); expect(i, t).toBeGreaterThan(pos); pos = i; }
  });
  it('valores da nota 82 formatados como no portal', () => {
    for (const t of ['53001081233020459000106000000000008226081787671197', '25/08/2026 12:19:53', '33.020.459/0001-06',
      '08.616.988/0001-20', '14.01.01', '1.2001.60.00', 'R$ 19.995,00', 'Retido pelo Tomador', 'R$ 999,75',
      '050102', '000001', 'Tributação integral', 'R$ 18.995,25', 'R$ 170,96', 'R$ 19,00', '0,9%', '(61)3011-8500', '71805-511']) {
      expect(html, t).toContain(t);
    }
  });
  it('QR code + endereço de consulta', () => {
    expect(html).toContain(`src="${QR}"`);
    expect(html).toContain('iss.fazenda.df.gov.br/online');
  });
  it('não se passa pelo sistema do fisco: rodapé diz que foi gerado do XML autorizado', () => {
    expect(html).toMatch(/gerad[ao] a partir do XML/i);
  });
});

describe('modelo DANFSe v2.0 nacional (nota 85)', () => {
  const html = htmlModeloNacional(dados, QR);
  it('cabeçalho e blocos do DANFSe v2.0', () => {
    const ordem = ['DANFSe v2.0', 'Documento Auxiliar da NFS-e', 'CHAVE DE ACESSO DA NFS-E', 'NÚMERO DA NFS-E', 'COMPETÊNCIA DA NFS-E',
      'PRESTADOR / FORNECEDOR', 'TOMADOR / ADQUIRENTE', 'O DESTINATÁRIO É O PRÓPRIO TOMADOR/ADQUIRENTE DA OPERAÇÃO',
      'SERVIÇO PRESTADO', 'TRIBUTAÇÃO MUNICIPAL (ISSQN)', 'TRIBUTAÇÃO FEDERAL (EXCETO CBS)', 'TRIBUTAÇÃO IBS / CBS',
      'VALOR TOTAL DA NFS-E', 'INFORMAÇÕES COMPLEMENTARES'];
    let pos = -1;
    for (const t of ordem) { const i = html.indexOf(t); expect(i, t).toBeGreaterThan(pos); pos = i; }
  });
  it('campos do IBS/CBS como o DANFSe mostra', () => {
    for (const t of ['000 / 000001', '050102 / 5300108', 'R$ 18.995,25', 'R$ 170,96', 'Tipo de Ambiente:1', 'NFS-e gerada', 'NFS-e regular']) {
      expect(html, t).toContain(t);
    }
  });
  it('QR aponta pra consulta pública nacional (texto do DANFSe)', () => {
    expect(html).toContain(`src="${QR}"`);
    expect(html).toContain('portal nacional da NFS-e');
  });
});

describe('tarja, escape e sem QR', () => {
  it('tarja de homologação/teste aparece nos dois modelos', () => {
    const d = { ...dados, semValorFiscal: 'TESTE — SEM VALOR FISCAL' };
    expect(htmlModeloGdf(d, null)).toContain('TESTE — SEM VALOR FISCAL');
    expect(htmlModeloNacional(d, null)).toContain('TESTE — SEM VALOR FISCAL');
  });
  it('sem QR não desenha <img> quebrado', () => {
    expect(htmlModeloGdf(dados, null)).not.toContain('<img');
    expect(htmlModeloNacional(dados, null)).not.toContain('<img');
  });
  it('escapa HTML vindo do XML/banco (descrição com <script>)', () => {
    const d = { ...dados, servico: { ...dados.servico, descricao: '<script>alert(1)</script>' } };
    expect(htmlModeloGdf(d, null)).not.toContain('<script>alert');
    expect(htmlModeloNacional(d, null)).toContain('&lt;script&gt;');
  });
  it('nome do arquivo seguro', () => {
    expect(nomeArquivoPdf(dados, 'gdf')).toBe('NFSe-82-GDF.pdf');
    expect(nomeArquivoPdf({ ...dados, numero: null }, 'nacional')).toBe('NFSe-previa-DANFSe.pdf');
  });
});

describe('gerarPdfNota', () => {
  it('monta o HTML do modelo com QR da consulta nacional e chama o motor de PDF com margem de 8 mm', async () => {
    const { gerarPdfNota } = await import('../src/modules/financeiro/fiscal/nfse-pdf.js');
    let htmlVisto = '';
    const r = await gerarPdfNota(dados, 'nacional', async (html, opts) => { htmlVisto = html; expect(opts.marginMm).toBe(8); return Buffer.from('%PDF'); });
    expect(r.nomeArquivo).toBe('NFSe-82-DANFSe.pdf');
    expect(r.pdf.toString()).toBe('%PDF');
    expect(htmlVisto).toContain('src="data:image/png;base64,');
  });
});

describe('ajustes da revisão', () => {
  it('DANFSe: Tipo de Ambiente 2 na homologação (vem do XML, não da tarja)', () => {
    const d = montarDadosPdf({ nota: { ...nota, xmlNfse: XML.replace('<tpAmb>1</tpAmb>', '<tpAmb>2</tpAmb>') }, config: null, servico: null });
    expect(d.tpAmb).toBe('2');
    expect(htmlModeloNacional(d, null)).toContain('Tipo de Ambiente:2');
    expect(htmlModeloNacional({ ...dados, semValorFiscal: 'HOMOLOGAÇÃO' }, null)).toContain('Tipo de Ambiente:1');
  });
  it('GDF: não repete "14.01 - 14.01 -" quando a descrição do fisco já traz o código', () => {
    const d = { ...dados, servico: { ...dados.servico, descAtividade: '14.01 - Lubrificação, limpeza' } };
    const html = htmlModeloGdf(d, null);
    expect(html).toContain('14.01 - Lubrificação, limpeza');
    expect(html).not.toContain('14.01 - 14.01');
  });
  it('município do prestador vem do xLocEmi do XML', () => {
    expect(dados.prestador.municipio).toBe('Brasília');
  });
});
