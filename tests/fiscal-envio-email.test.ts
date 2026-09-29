// tests/fiscal-envio-email.test.ts
// E-mail da NFS-e pro tomador: os 2 PDFs + o XML anexados, manual (botão) ou
// automático depois da autorização (flag por empresa, desligada por padrão).
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  enviarNotaPorEmail, montarEmailNota, deveEnviarAutomatico, remetenteComNome, emailValido, type DepsEnvioEmail,
} from '../src/modules/financeiro/fiscal/envio-email.js';
import { montarDadosPdf } from '../src/modules/financeiro/fiscal/nfse-pdf-dados.js';
import type { NotaLinha } from '../src/modules/financeiro/fiscal/notas-repo.js';

const XML = readFileSync(new URL('./fixtures/nfse-autorizada-teste.xml', import.meta.url), 'utf8');
const notaBase: NotaLinha = {
  id: '00000000-0000-0000-0000-0000000000aa', companyId: 'c1', status: 'autorizada', numero: '82',
  competencia: '2026-08-25', descricao: 'x',
  tomador: { tipo: 'PJ', doc: '08616988000120', nome: 'CLIENTE', im: null, endereco: '', email: 'financeiro@cliente.com.br', municipio: 'Brasília', uf: 'DF' },
  servicoId: 's1', valorBruto: 19995, valorIss: 999.75, issRetido: true, valorLiquido: 18995.25,
  pdfStoragePath: null, contaReceberId: null, chaveAcesso: '53001081233020459000106000000000008226081787671197', ambienteEmissao: 'producao', xmlNfse: XML,
};

function deps(nota: NotaLinha | null = notaBase, over: Partial<DepsEnvioEmail> = {}): DepsEnvioEmail {
  return {
    carregar: vi.fn(async () => (nota ? { nota, dados: montarDadosPdf({ nota, config: null, servico: null }) } : null)),
    gerarPdf: vi.fn(async (_d, modelo) => ({ pdf: Buffer.from(`%PDF-${modelo}`), nomeArquivo: `NFSe-82-${modelo === 'gdf' ? 'GDF' : 'DANFSe'}.pdf` })),
    enviar: vi.fn(async () => 'msg_1'),
    registrarEvento: vi.fn(async () => {}),
    ...over,
  };
}

describe('enviarNotaPorEmail', () => {
  it('manda pro e-mail do tomador com os 2 PDFs + XML e registra o evento', async () => {
    const d = deps();
    const r = await enviarNotaPorEmail(d, 'c1', notaBase.id, {});
    expect(r).toEqual({ ok: true, para: 'financeiro@cliente.com.br', id: 'msg_1' });
    const envio = (d.enviar as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(envio.to).toBe('financeiro@cliente.com.br');
    expect(envio.subject).toContain('NFS-e nº 82');
    expect(envio.attachments.map((a: { filename: string }) => a.filename)).toEqual(['NFSe-82-GDF.pdf', 'NFSe-82-DANFSe.pdf', 'NFSe-82.xml']);
    expect(envio.attachments[2].content.toString()).toBe(XML);
    expect(d.registrarEvento).toHaveBeenCalledWith(notaBase.id, 'email_enviado', expect.objectContaining({ para: 'financeiro@cliente.com.br', automatico: false }));
  });
  it('o e-mail digitado na tela tem prioridade', async () => {
    const d = deps();
    const r = await enviarNotaPorEmail(d, 'c1', notaBase.id, { para: ' outro@cliente.com.br ' });
    expect(r.ok && r.para).toBe('outro@cliente.com.br');
  });
  it('nota de outra empresa / inexistente: não envia', async () => {
    const d = deps(null);
    const r = await enviarNotaPorEmail(d, 'c2', notaBase.id, {});
    expect(r.ok).toBe(false);
    expect(d.enviar).not.toHaveBeenCalled();
  });
  it('nota sem XML autorizado (preparada) não é enviada', async () => {
    const d = deps({ ...notaBase, status: 'preparada', xmlNfse: null, chaveAcesso: null });
    const r = await enviarNotaPorEmail(d, 'c1', notaBase.id, {});
    expect(r).toMatchObject({ ok: false });
    expect(d.enviar).not.toHaveBeenCalled();
  });
  it('homologação: NUNCA vai pro tomador sozinho — só pra um e-mail digitado, com [TESTE] no assunto', async () => {
    const homolog = { ...notaBase, status: 'preparada', ambienteEmissao: 'homologacao' as const, xmlNfse: XML.replace('<tpAmb>1</tpAmb>', '<tpAmb>2</tpAmb>') };
    const d1 = deps(homolog);
    expect((await enviarNotaPorEmail(d1, 'c1', notaBase.id, {})).ok).toBe(false);
    expect(d1.enviar).not.toHaveBeenCalled();
    const d2 = deps(homolog);
    const r = await enviarNotaPorEmail(d2, 'c1', notaBase.id, { para: 'eu@empresa.com.br' });
    expect(r.ok).toBe(true);
    expect((d2.enviar as ReturnType<typeof vi.fn>).mock.calls[0][0].subject).toMatch(/^\[TESTE\]/);
  });
  it('sem e-mail do tomador e sem digitado: explica', async () => {
    const d = deps({ ...notaBase, tomador: { ...notaBase.tomador, email: null } });
    const r = await enviarNotaPorEmail(d, 'c1', notaBase.id, {});
    expect(r).toMatchObject({ ok: false, motivo: expect.stringMatching(/e-mail/i) });
  });
  it('e-mail inválido não sai', async () => {
    const d = deps();
    const r = await enviarNotaPorEmail(d, 'c1', notaBase.id, { para: 'nao-e-email' });
    expect(r.ok).toBe(false);
  });
  it('falha da Resend vira resultado (não explode) + evento email_falhou', async () => {
    const d = deps(notaBase, { enviar: vi.fn(async () => { throw new Error('domain not verified'); }) });
    const r = await enviarNotaPorEmail(d, 'c1', notaBase.id, { automatico: true });
    expect(r).toMatchObject({ ok: false, motivo: expect.stringContaining('domain not verified') });
    expect(d.registrarEvento).toHaveBeenCalledWith(notaBase.id, 'email_falhou', expect.objectContaining({ automatico: true }));
  });
});

describe('peças do e-mail', () => {
  it('corpo: número, valor, chave e link de consulta; tudo escapado', () => {
    const dados = montarDadosPdf({ nota: notaBase, config: null, servico: null });
    const { assunto, html } = montarEmailNota({ ...dados, tomador: { ...dados.tomador, nome: '<b>X</b>' } });
    expect(assunto).toBe('NFS-e nº 82 — TESTE SOLAR');
    expect(html).toContain('R$ 18.995,25');
    expect(html).toContain('53001081233020459000106000000000008226081787671197');
    expect(html).toContain('https://www.nfse.gov.br/ConsultaPublica/?tpc=1&amp;chave=');
    expect(html).not.toContain('<b>X</b>');
  });
  it('envio automático: só com flag ligada, em produção e com e-mail do tomador', () => {
    expect(deveEnviarAutomatico(true, 'producao', 'a@b.com')).toBe(true);
    expect(deveEnviarAutomatico(false, 'producao', 'a@b.com')).toBe(false);
    expect(deveEnviarAutomatico(true, 'homologacao', 'a@b.com')).toBe(false);
    expect(deveEnviarAutomatico(true, 'producao', null)).toBe(false);
    expect(deveEnviarAutomatico(true, 'producao', 'lixo')).toBe(false);
  });
  it('remetente leva o nome da empresa emitente (multi-tenant) mantendo o endereço de envio', () => {
    expect(remetenteComNome('EcoSunPower <contato@news.ecosun.com.br>', 'Conquista Solar')).toBe('"Conquista Solar" <contato@news.ecosun.com.br>');
    expect(remetenteComNome('contato@news.ecosun.com.br', 'Empresa "X" <y>')).toBe('"Empresa X y" <contato@news.ecosun.com.br>');
    expect(remetenteComNome('', 'X')).toBe('');
  });
  it('emailValido', () => {
    expect(emailValido('a@b.com.br')).toBe(true);
    expect(emailValido('a@b')).toBe(false);
    expect(emailValido('a b@c.com')).toBe(false);
  });
});
