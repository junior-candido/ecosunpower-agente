// src/modules/financeiro/fiscal/notacontrol-client.ts
// Cliente SOAP do webservice NFS-e padrão nacional (NotaControl/ISSNet DF).
// mTLS: o próprio A1 autentica o túnel (https.Agent com key/cert PEM extraídos do A1).
// Namespace/estrutura confirmados pelo Manual de Integração v1.01 e pelos
// exemplos oficiais GerarNfseEnvio-exemplo.xml / GerarNfseResposta-exemplo.xml
// (docs/fiscal). O namespace do padrão nacional é o SPED/Fazenda — NÃO o ABRASF.
import { Agent, request } from 'node:https';
import * as cheerio from 'cheerio';

export const ENDPOINTS = {
  homologacao: 'https://nfse.issnetonline.com.br/wsnfsenacional/homologacao/nfse.asmx',
  producao: 'https://nfse.fazenda.df.gov.br/wsnfsenacional/nfse.asmx',
} as const;
const NS = 'http://www.sped.fazenda.gov.br/nfse';       // padrão nacional (manual v1.01)
const NS_DSIG = 'http://www.w3.org/2000/09/xmldsig#';   // assinatura (mesmo prefixo ns2 do exemplo oficial)
const VERSAO = '1.00';                                  // 1.00 = SEM grupo IBS/CBS (fisco rejeita 1.01 sem ele: E183/E160).
// ⚠️ A PARTIR DE 01/10/2026 o grupo IBS/CBS é OBRIGATÓRIO -> migrar p/ 1.01 + gerar o grupo (F3).

const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function montarEnvelope(metodo: string, xmlAssinado: string): string {
  // A DPS assinada vem com a própria declaração <?xml ...?> (xml-crypto preserva) — tira.
  const semDeclaracao = xmlAssinado.replace(/^<\?xml[^?]*\?>\s*/, '');
  // Estrutura CONFIRMADA pela imagem do manual v1.01 (pág. 107, print SoapUI do webservice):
  //   <soapenv:Envelope xmlns:nfse="http://www.sped.fazenda.gov.br/nfse">
  //     <soapenv:Body>
  //       <nfse:GerarNfse>
  //         <nfseCabecMsg>…XML do cabecalho (escapado, parâmetro string)…</nfseCabecMsg>
  //         <nfseDadosMsg>…XML do GerarNfseEnvio (escapado)…</nfseDadosMsg>
  //       </nfse:GerarNfse>
  // O cabecalho vai em TODOS os métodos (manual, cap. 14).
  const cabecalho = `<cabecalho versao="${VERSAO}" xmlns="${NS}"><versaoDados>${VERSAO}</versaoDados></cabecalho>`;
  const dados = `<${metodo}Envio xmlns="${NS}" xmlns:ns2="${NS_DSIG}">${semDeclaracao}</${metodo}Envio>`;
  return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:nfse="${NS}">
<soapenv:Header/>
<soapenv:Body><nfse:${metodo}><nfseCabecMsg>${escXml(cabecalho)}</nfseCabecMsg><nfseDadosMsg>${escXml(dados)}</nfseDadosMsg></nfse:${metodo}></soapenv:Body>
</soapenv:Envelope>`;
}

export interface ErroFiscal { codigo: string; mensagem: string; correcao: string | null }
export type RespostaGerar =
  | { ok: true; numero: string | null; chaveAcesso: string | null; xmlNfse: string }
  | { ok: false; erros: ErroFiscal[] };

export function interpretarResposta(soapXml: string): RespostaGerar {
  // Métodos .asmx devolvem o XML de resposta como STRING (escapado) dentro do
  // elemento *Result. Se não acharmos elementos de verdade, desescapamos e reparseamos.
  let corpo = soapXml;
  if (!/<(CompNfse|MensagemRetorno)[\s>]/.test(corpo) && /&lt;(CompNfse|MensagemRetorno|GerarNfseResposta)/.test(corpo)) {
    corpo = corpo.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  }
  const $ = cheerio.load(corpo, { xmlMode: true });
  const erros: ErroFiscal[] = [];
  $('MensagemRetorno').each((_, el) => {
    erros.push({
      codigo: $(el).find('Codigo').first().text().trim(),
      mensagem: $(el).find('Mensagem').first().text().trim(),
      correcao: $(el).find('Correcao').first().text().trim() || null,
    });
  });
  const comp = $('CompNfse').first();
  if (comp.length > 0) {
    // A chave de acesso da NFS-e é o atributo Id do infNFSe ("NFS" + 50 dígitos),
    // conforme GerarNfseResposta-exemplo.xml (não existe elemento <chaveAcesso> no
    // padrão nacional). Mantemos o fallback ao elemento por robustez.
    const idNfse = (comp.find('infNFSe').first().attr('Id') || '').trim();
    const chaveDoId = idNfse.replace(/^NFS/, '') || null;
    const chaveElem = comp.find('chaveAcesso').first().text().trim() || null;
    return {
      ok: true,
      numero: comp.find('nNFSe').first().text().trim() || null,
      chaveAcesso: chaveElem ?? chaveDoId,
      xmlNfse: $.xml(comp),
    };
  }
  if (erros.length === 0) erros.push({ codigo: 'SEM_RESPOSTA', mensagem: 'O webservice respondeu num formato inesperado.', correcao: null });
  return { ok: false, erros };
}

export async function chamarGerarNfse(
  ambiente: keyof typeof ENDPOINTS, dpsAssinada: string, keyPem: string, certPem: string,
): Promise<RespostaGerar> {
  const corpo = montarEnvelope('GerarNfse', dpsAssinada);
  const url = new URL(ENDPOINTS[ambiente]);
  // key/cert em PEM (extraídos do .pfx pelo node-forge no carregarCertificado): o OpenSSL 3
  // do Node recusa PFX RC2/3DES da Safeweb ("Unsupported PKCS12 PFX data") — PEM não tem esse limite.
  const agent = new Agent({ key: keyPem, cert: certPem });
  const soapXml = await new Promise<string>((resolve, reject) => {
    const req = request({
      hostname: url.hostname, path: url.pathname, method: 'POST', agent, timeout: 60000,
      // ⚠️ CONFIRMAR no 1º teste real contra o webservice: o valor exato do SOAPAction
      //    vem do WSDL (403 sem mTLS). Assumido NS + "/GerarNfse", padrão .asmx.
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `${NS}/GerarNfse` },
    }, (res) => {
      const status = res.statusCode ?? 0;
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('error', (e) => reject(new Error(`Falha lendo a resposta do fisco (${ambiente}): ${e.message}`)));
      res.on('end', () => {
        if (status < 200 || status >= 300) {
          reject(new Error(`O fisco respondeu HTTP ${status} (${ambiente}) — sem retorno SOAP. Confira credenciamento/certificado.`));
          return;
        }
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', (e) => reject(new Error(`Falha de conexão com o fisco (${ambiente}): ${e.message}`)));
    req.write(corpo); req.end();
  });
  return interpretarResposta(soapXml);
}
