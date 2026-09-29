// tests/fiscal-views-producao.test.ts
// Telas pra produção: PDF (2 modelos) + e-mail no detalhe da nota; na
// configuração, e-mail automático, códigos por serviço e consulta de atividades.
import { describe, it, expect } from 'vitest';
import { renderNotaDetalhe, renderConfigFiscalPage } from '../src/modules/dashboard/fiscal-views.js';
import type { NotaLinha } from '../src/modules/financeiro/fiscal/notas-repo.js';

const ID = '55555555-5555-4666-8777-888888888888';
const base: NotaLinha = {
  id: ID, companyId: 'c1', status: 'autorizada', numero: '84', competencia: '2026-10-05', descricao: 'limpeza',
  tomador: { tipo: 'PJ', doc: '08616988000120', nome: 'SUPERBOM', im: null, endereco: '', email: 'fin@superbom.com.br', municipio: 'Brasília', uf: 'DF' },
  servicoId: 's1', valorBruto: 1000, valorIss: 50, issRetido: true, valorLiquido: 950,
  pdfStoragePath: null, contaReceberId: null, chaveAcesso: '5'.repeat(50), ambienteEmissao: 'producao', xmlNfse: '<CompNfse/>',
};
const config = { cnpj: '33.020.459/0001-06', inscricao_municipal: '0790506200159', razao_social: 'ECO', cert_validade: '2027-08-31', ambiente: 'producao' as const, serie_dps: '1', proximo_ndps: 5, cert_storage_path: 'x' };

describe('detalhe da nota — PDF e e-mail', () => {
  it('nota autorizada: 2 botões de PDF + formulário de e-mail já com o e-mail do tomador', () => {
    const html = renderNotaDetalhe(base, config);
    expect(html).toContain(`/dashboard/fiscal/${ID}/danfse/gdf`);
    expect(html).toContain(`/dashboard/fiscal/${ID}/danfse/nacional`);
    expect(html).toContain(`action="/dashboard/fiscal/${ID}/enviar-email"`);
    expect(html).toContain('value="fin@superbom.com.br"');
  });
  it('teste de homologação: PDFs com tarja e e-mail SEM o do tomador (só pra você)', () => {
    const html = renderNotaDetalhe({ ...base, status: 'preparada', ambienteEmissao: 'homologacao' }, config);
    expect(html).toContain(`/dashboard/fiscal/${ID}/danfse/gdf`);
    expect(html).not.toContain('value="fin@superbom.com.br"');
    expect(html).toMatch(/teste/i);
  });
  it('nota preparada sem XML: nada de PDF/e-mail', () => {
    const html = renderNotaDetalhe({ ...base, status: 'preparada', xmlNfse: null, chaveAcesso: null, ambienteEmissao: null }, config);
    expect(html).not.toContain('/danfse/');
    expect(html).not.toContain('enviar-email');
  });
  it('escapa o e-mail do tomador', () => {
    const html = renderNotaDetalhe({ ...base, tomador: { ...base.tomador, email: '"><script>x</script>' } }, config);
    expect(html).not.toContain('<script>x</script>');
  });
});

describe('configuração — produção', () => {
  const servicos = [
    { id: 's1', nome: 'Manutenção <b>', cod_trib_nacional: '14.01.01', cod_trib_municipal: '1', nbs: null, descricao_padrao: 'x', aliquota_iss: 0.05 },
    { id: 's2', nome: 'Elétrica', cod_trib_nacional: '31.01.02', cod_trib_municipal: null, nbs: '1.1415.00.00', descricao_padrao: 'y', aliquota_iss: 0.05 },
  ];
  it('checkbox de e-mail automático (marcado conforme a flag) com marcador de presença', () => {
    const on = renderConfigFiscalPage(config, undefined, undefined, { servicos, emailAuto: true });
    expect(on).toMatch(/name="email_auto"[^>]*checked/);
    expect(on).toContain('name="email_auto_presente"');
    const off = renderConfigFiscalPage(config, undefined, undefined, { servicos, emailAuto: false });
    expect(off).not.toMatch(/name="email_auto"[^>]*checked/);
  });
  it('tabela de códigos por serviço com dica do catálogo (atividade municipal + NBS das notas reais) e IBS/CBS usado', () => {
    const html = renderConfigFiscalPage(config, undefined, undefined, { servicos, emailAuto: false });
    expect(html).toContain('action="/dashboard/fiscal/config/servicos"');
    expect(html).toContain('name="ctribmun_s1"');
    expect(html).toContain('name="nbs_s2"');
    expect(html).toContain('value="1.1415.00.00"');
    expect(html).toContain('14.01');
    expect(html).toContain('050102');       // cIndOp padrão (nota 82)
    expect(html).toContain('200052');       // cClassTrib da nota 83
    expect(html).not.toContain('Manutenção <b>');
  });
  it('botão de consultar atividades no fisco e a lista quando vem resultado', () => {
    const html = renderConfigFiscalPage(config, undefined, undefined, {
      servicos, emailAuto: false,
      atividades: { ok: true, atividades: [{ cTribMun: '1401', xTribMun: '14.01 - Limpeza', pAliq: 5 }] },
    });
    expect(html).toContain('action="/dashboard/fiscal/config/atividades"');
    expect(html).toContain('1401');
    expect(html).toContain('14.01 - Limpeza');
  });
  it('erro da consulta aparece em PT, escapado', () => {
    const html = renderConfigFiscalPage(config, undefined, undefined, {
      servicos, emailAuto: false, atividades: { ok: false, erros: [{ codigo: 'E1', mensagem: '<falhou>', correcao: null }] },
    });
    expect(html).toContain('&lt;falhou&gt;');
  });
  it('continua funcionando sem o bloco extra (chamada antiga)', () => {
    expect(renderConfigFiscalPage(null, undefined, undefined)).toContain('Configuração fiscal');
  });
});
