// src/modules/financeiro/fiscal/notacontrol-client.ts
// Cliente SOAP do webservice NFS-e padrão nacional (NotaControl/ISSNet DF).
// mTLS: o próprio A1 autentica o túnel (https.Agent com pfx).
// SOAPAction/namespace: WSDL devolve 403 sem mTLS (tentado 31/08) — usando o
// padrão ABRASF como default; ⚠️ CONFERIR no 1º teste de homologação e ajustar NS se divergir.
import { Agent, request } from 'node:https';
import * as cheerio from 'cheerio';

export const ENDPOINTS = {
  homologacao: 'https://nfse.issnetonline.com.br/wsnfsenacional/homologacao/nfse.asmx',
  producao: 'https://nfse.fazenda.df.gov.br/wsnfsenacional/nfse.asmx',
} as const;
const NS = 'http://nfse.abrasf.org.br'; // ⚠️ conferir no WSDL quando o mTLS abrir o acesso

export function montarEnvelope(metodo: string, xmlAssinado: string): string {
  // A DPS assinada vem com a própria declaração <?xml ...?> (xml-crypto preserva);
  // declaração no MEIO do envelope torna o SOAP inválido — tira antes de embutir.
  const semDeclaracao = xmlAssinado.replace(/^<\?xml[^?]*\?>\s*/, '');
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
<soap:Body><${metodo} xmlns="${NS}">${semDeclaracao}</${metodo}></soap:Body>
</soap:Envelope>`;
}

export interface ErroFiscal { codigo: string; mensagem: string; correcao: string | null }
export type RespostaGerar =
  | { ok: true; numero: string | null; chaveAcesso: string | null; xmlNfse: string }
  | { ok: false; erros: ErroFiscal[] };

export function interpretarResposta(soapXml: string): RespostaGerar {
  const $ = cheerio.load(soapXml, { xmlMode: true });
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
    return {
      ok: true,
      numero: comp.find('nNFSe').first().text().trim() || null,
      chaveAcesso: comp.find('chaveAcesso').first().text().trim() || null,
      xmlNfse: $.xml(comp),
    };
  }
  if (erros.length === 0) erros.push({ codigo: 'SEM_RESPOSTA', mensagem: 'O webservice respondeu num formato inesperado.', correcao: null });
  return { ok: false, erros };
}

export async function chamarGerarNfse(
  ambiente: keyof typeof ENDPOINTS, dpsAssinada: string, pfx: Buffer, senhaPfx: string,
): Promise<RespostaGerar> {
  const corpo = montarEnvelope('GerarNfse', dpsAssinada);
  const url = new URL(ENDPOINTS[ambiente]);
  const agent = new Agent({ pfx, passphrase: senhaPfx });
  const soapXml = await new Promise<string>((resolve, reject) => {
    const req = request({
      hostname: url.hostname, path: url.pathname, method: 'POST', agent, timeout: 60000,
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
