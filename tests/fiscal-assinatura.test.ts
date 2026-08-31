// tests/fiscal-assinatura.test.ts
import { describe, it, expect } from 'vitest';
import forge from 'node-forge';
import { assinarDps } from '../src/modules/financeiro/fiscal/assinatura.js';
import { montarDpsXml } from '../src/modules/financeiro/fiscal/dps-xml.js';

// gera par chave/cert (mesmo helper da Task 5 — duplicado de propósito: testes independentes)
function parDeTeste() {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey; cert.serialNumber = '01';
  cert.validity.notBefore = new Date(); cert.validity.notAfter = new Date(Date.now() + 86400000);
  const attrs = [{ name: 'commonName', value: 'TESTE' }];
  cert.setSubject(attrs); cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { keyPem: forge.pki.privateKeyToPem(keys.privateKey), certPem: forge.pki.certificateToPem(cert) };
}

const entrada = {
  ambiente: 'homologacao' as const, dhEmi: new Date(), serie: '1', nDps: 1,
  competencia: '2026-08-31', codMunicipio: '5300108', optanteSimples: false,
  prestador: { cnpj: '33020459000106', im: '0790506200159' },
  tomador: { tipo: 'PJ' as const, doc: '13245160000142', nome: 'SPAZIO',
    endereco: { cMun: '5300108', cep: '70000000', xLgr: 'Rua Teste', nro: '100', xBairro: 'Centro' }, email: null },
  servico: { codTribNacional: '31.01.02', codTribMunicipal: '1', descricao: 'teste' },
  obra: null,
  valores: { vServ: 1, issRetido: true },
};

describe('assinatura', () => {
  it('assina a infDPS: Signature dentro de DPS, com X509 e referência ao Id', () => {
    const { keyPem, certPem } = parDeTeste();
    const { xml, idDps } = montarDpsXml(entrada);
    const assinado = assinarDps(xml, idDps, keyPem, certPem);
    expect(assinado).toContain('<Signature');
    expect(assinado).toContain('X509Certificate');
    expect(assinado).toContain(`Reference URI="#${idDps}"`);
    expect(assinado).toContain('rsa-sha1');
    expect(assinado.indexOf('</DPS>')).toBeGreaterThan(assinado.indexOf('</Signature>'));
  });
});
