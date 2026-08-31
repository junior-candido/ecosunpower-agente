// tests/fiscal-notacontrol-client.test.ts
import { describe, it, expect } from 'vitest';
import { montarEnvelope, interpretarResposta } from '../src/modules/financeiro/fiscal/notacontrol-client.js';

describe('notacontrol-client', () => {
  it('envelopa a DPS assinada no SOAP de GerarNfse', () => {
    const env = montarEnvelope('GerarNfse', '<DPS>x</DPS>');
    expect(env).toContain('soap:Envelope');
    expect(env).toContain('GerarNfse');
    expect(env).toContain('<DPS>x</DPS>');
  });
  it('tira a declaração <?xml?> da DPS antes de embutir (declaração no meio quebra o SOAP)', () => {
    const env = montarEnvelope('GerarNfse', '<?xml version="1.0" encoding="UTF-8"?>\n<DPS>x</DPS>');
    expect(env.indexOf('<?xml')).toBe(0);            // só a do envelope
    expect(env.lastIndexOf('<?xml')).toBe(0);        // nenhuma outra no meio
    expect(env).toContain('<DPS>x</DPS>');
  });
  it('usa o namespace do padrão nacional (sped.fazenda), nunca o abrasf', () => {
    const env = montarEnvelope('GerarNfse', '<DPS>x</DPS>');
    expect(env).toContain('http://www.sped.fazenda.gov.br/nfse');
    expect(env).not.toContain('nfse.abrasf.org.br');
  });
  it('envolve a DPS assinada em <GerarNfseEnvio> e inclui o cabecalho v1.00 (sem grupo IBS/CBS)', () => {
    const env = montarEnvelope('GerarNfse', '<DPS>x</DPS>');
    expect(env).toContain('<GerarNfseEnvio');
    expect(env).toContain('xmlns:ns2="http://www.w3.org/2000/09/xmldsig#"');
    expect(env).toContain('<cabecalho versao="1.00"');
    expect(env).toContain('<versaoDados>1.00</versaoDados>');
    // a DPS fica DENTRO do GerarNfseEnvio, e o cabecalho vem antes
    expect(env.indexOf('<cabecalho')).toBeLessThan(env.indexOf('<GerarNfseEnvio'));
    expect(env.indexOf('<GerarNfseEnvio')).toBeLessThan(env.indexOf('<DPS>x</DPS>'));
    expect(env.indexOf('<DPS>x</DPS>')).toBeLessThan(env.indexOf('</GerarNfseEnvio>'));
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
});
