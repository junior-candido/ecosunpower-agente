// src/modules/financeiro/fiscal/assinatura.ts
// Assinatura XMLDSig da DPS conforme manual v1.01 §7.3.3: enveloped,
// C14N REC-xml-c14n-20010315, RSA-SHA1, digest SHA-1, X509 no KeyInfo.
// (RSA-SHA1 é exigência do padrão do fisco, não escolha nossa.)
import { SignedXml } from 'xml-crypto';

export function assinarDps(xml: string, idDps: string, keyPem: string, certPem: string): string {
  const sig = new SignedXml({
    privateKey: keyPem,
    publicCert: certPem,
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
  });
  sig.addReference({
    xpath: "//*[local-name(.)='infDPS']",
    uri: `#${idDps}`,
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    ],
  });
  sig.computeSignature(xml, {
    // Signature entra como último filho de <DPS> (irmão de infDPS)
    location: { reference: "//*[local-name(.)='infDPS']", action: 'after' },
  });
  return sig.getSignedXml();
}
