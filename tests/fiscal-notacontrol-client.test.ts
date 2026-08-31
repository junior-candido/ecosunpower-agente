// tests/fiscal-notacontrol-client.test.ts
import { describe, it, expect } from 'vitest';
import { montarEnvelope, interpretarResposta } from '../src/modules/financeiro/fiscal/notacontrol-client.js';

describe('notacontrol-client', () => {
  it('envelopa com os parâmetros nfseCabecMsg e nfseDadosMsg, XML INLINE sem escapar (S000 do validador 31/08)', () => {
    const env = montarEnvelope('GerarNfse', '<DPS>x</DPS>');
    expect(env).toContain('soapenv:Envelope');
    expect(env).toContain('<nfse:GerarNfse>');
    expect(env).toContain('<nfseCabecMsg>');
    expect(env).toContain('<nfseDadosMsg>');
    // o serviço lê o innerXML cru: escapado, os campos chegam "vazios" (E160+E232)
    expect(env).toContain('<DPS>x</DPS>');
    expect(env).not.toContain('&lt;DPS&gt;');
  });
  it('tira a declaração <?xml?> da DPS antes de embutir (declaração no meio quebra o SOAP)', () => {
    const env = montarEnvelope('GerarNfse', '<?xml version="1.0" encoding="UTF-8"?>\n<DPS>x</DPS>');
    expect(env.indexOf('<?xml')).toBe(0);            // só a do envelope
    expect(env.lastIndexOf('<?xml')).toBe(0);        // nenhuma outra no meio
    expect(env).toContain('<DPS>x</DPS>');
  });
  it('usa o namespace do padrão nacional (sped.fazenda), nunca o abrasf', () => {
    const env = montarEnvelope('GerarNfse', '<DPS>x</DPS>');
    expect(env).toContain('xmlns:nfse="http://www.sped.fazenda.gov.br/nfse"');
    expect(env).not.toContain('nfse.abrasf.org.br');
  });
  it('cabecalho v1.00 vai no nfseCabecMsg e o GerarNfseEnvio (com a DPS) no nfseDadosMsg', () => {
    const env = montarEnvelope('GerarNfse', '<DPS>x</DPS>');
    expect(env).toContain('<cabecalho versao="1.00"');
    expect(env).toContain('<versaoDados>1.00</versaoDados>');
    expect(env).toContain('<GerarNfseEnvio');
    // SEM xmlns:ns2 no wrapper: declaração no ancestral entra na c14n inclusiva
    // do infDPS e invalida o digest da assinatura (E0714) — provado no .NET 31/08.
    expect(env).not.toContain('xmlns:ns2');
    // cabecalho dentro do nfseCabecMsg; Envio+DPS dentro do nfseDadosMsg
    expect(env.indexOf('<cabecalho')).toBeGreaterThan(env.indexOf('<nfseCabecMsg>'));
    expect(env.indexOf('<cabecalho')).toBeLessThan(env.indexOf('</nfseCabecMsg>'));
    expect(env.indexOf('<GerarNfseEnvio')).toBeGreaterThan(env.indexOf('<nfseDadosMsg>'));
    expect(env.indexOf('<DPS>x</DPS>')).toBeLessThan(env.indexOf('</nfseDadosMsg>'));
  });
  it('resposta com NFS-e vira sucesso (numero + chave)', () => {
    const resp = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>
      <GerarNfseResponse><GerarNfseResult>
        <ListaNfse><CompNfse><NFSe><infNFSe Id="NFS123"><nNFSe>84</nNFSe><chaveAcesso>530010800000084</chaveAcesso>
        </infNFSe></NFSe></CompNfse></ListaNfse>
      </GerarNfseResult></GerarNfseResponse></soap:Body></soap:Envelope>`;
    const r = interpretarResposta(resp);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.numero).toBe('84'); expect(r.xmlNfse).toContain('NFSe'); }
  });
  it('resposta real do padrão nacional: chave sai do Id do infNFSe (sem elemento chaveAcesso)', () => {
    const chave = '53001080000000000000000000000000000000000000000084';
    const resp = `<GerarNfseResposta xmlns="http://www.sped.fazenda.gov.br/nfse" xmlns:ns2="http://www.w3.org/2000/09/xmldsig#">
      <ListaNfse><CompNfse><Nfse versao="1.01"><infNFSe Id="NFS${chave}"><nNFSe>84</nNFSe></infNFSe></Nfse></CompNfse></ListaNfse>
      </GerarNfseResposta>`;
    const r = interpretarResposta(resp);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.numero).toBe('84'); expect(r.chaveAcesso).toBe(chave); }
  });
  it('resposta com mensagens de erro vira lista traduzível', () => {
    const resp = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>
      <GerarNfseResponse><GerarNfseResult>
        <ListaMensagemRetorno><MensagemRetorno><Codigo>E160</Codigo><Mensagem>Valor invalido</Mensagem><Correcao>Corrija o valor</Correcao></MensagemRetorno></ListaMensagemRetorno>
      </GerarNfseResult></GerarNfseResponse></soap:Body></soap:Envelope>`;
    const r = interpretarResposta(resp);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.erros[0].codigo).toBe('E160'); expect(r.erros[0].mensagem).toContain('Valor'); }
  });
  it('resposta .asmx com XML ESCAPADO dentro do Result é desescapada e interpretada', () => {
    const chave = '53001080000000000000000000000000000000000000000084';
    const interno = `<GerarNfseResposta xmlns="http://www.sped.fazenda.gov.br/nfse"><ListaNfse><CompNfse><Nfse versao="1.00"><infNFSe Id="NFS${chave}"><nNFSe>84</nNFSe></infNFSe></Nfse></CompNfse></ListaNfse></GerarNfseResposta>`;
    const escapado = interno.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const resp = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><GerarNfseResponse xmlns="http://www.sped.fazenda.gov.br/nfse"><GerarNfseResult>${escapado}</GerarNfseResult></GerarNfseResponse></soap:Body></soap:Envelope>`;
    const r = interpretarResposta(resp);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.numero).toBe('84'); expect(r.chaveAcesso).toBe(chave); }
  });
  it('erro escapado do .asmx também é desescapado', () => {
    const interno = `<ListaMensagemRetorno><MensagemRetorno><Codigo>E160</Codigo><Mensagem>Arquivo em desacordo</Mensagem></MensagemRetorno></ListaMensagemRetorno>`;
    const escapado = interno.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const resp = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><GerarNfseResponse><GerarNfseResult>${escapado}</GerarNfseResult></GerarNfseResponse></soap:Body></soap:Envelope>`;
    const r = interpretarResposta(resp);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.erros[0].codigo).toBe('E160'); expect(r.erros[0].mensagem).toContain('desacordo'); }
  });
});
