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
// Versão do cabeçalho = versão da DPS que vai dentro (atributo versao do <DPS>):
// 1.00 = SEM grupo IBS/CBS; 1.01 = COM o grupo (o fisco rejeita 1.01 sem ele — E183/E160).
// A partir de 01/10/2026 o grupo IBS/CBS é obrigatório (manual v1.01, histórico 03/08/2026)
// e a DPS sai sempre 1.01 (dps-xml.ts). Métodos de consulta (sem DPS) seguem com 1.00.
const VERSAO_PADRAO = '1.00';
function versaoDaDps(xml: string): string {
  const m = /<DPS\b[^>]*\bversao="(\d+\.\d+)"/.exec(xml);
  return m ? m[1] : VERSAO_PADRAO;
}

export function montarEnvelope(metodo: string, xmlAssinado: string): string {
  // A DPS assinada vem com a própria declaração <?xml ...?> (xml-crypto preserva) — tira.
  const semDeclaracao = xmlAssinado.replace(/^<\?xml[^?]*\?>\s*/, '');
  const VERSAO = versaoDaDps(semDeclaracao);
  // Estrutura CONFIRMADA contra o ValidarXml da homologação em 31/08 (S000):
  //   <soapenv:Envelope xmlns:nfse="http://www.sped.fazenda.gov.br/nfse">
  //     <soapenv:Body><nfse:GerarNfse>
  //       <nfseCabecMsg>…XML do cabecalho…</nfseCabecMsg>
  //       <nfseDadosMsg>…XML do GerarNfseEnvio…</nfseDadosMsg>
  // ⚠️ O XML vai INLINE, SEM escapar: o WSDL declara os parâmetros como xsd:string,
  //    mas o serviço lê o innerXML cru — escapado, os dois campos chegam "vazios"
  //    (E160 "Cabeçalho deve obedecer a um schema válido" + E232 "Operação não identificada").
  // O cabecalho vai em TODOS os métodos (manual, cap. 14).
  const cabecalho = `<cabecalho versao="${VERSAO}" xmlns="${NS}"><versaoDados>${VERSAO}</versaoDados></cabecalho>`;
  // ⚠️ SEM xmlns:ns2 no wrapper (apesar de o exemplo oficial ter): declaração de
  //    namespace no ANCESTRAL entra na canonicalização INCLUSIVA do infDPS e muda o
  //    digest — assinatura vira E0714. Provado com SignedXml do .NET em 31/08:
  //    com ns2 => False, sem ns2 => True. A Signature declara o próprio namespace.
  const dados = `<${metodo}Envio xmlns="${NS}">${semDeclaracao}</${metodo}Envio>`;
  return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:nfse="${NS}">
<soapenv:Header/>
<soapenv:Body><nfse:${metodo}><nfseCabecMsg>${cabecalho}</nfseCabecMsg><nfseDadosMsg>${dados}</nfseDadosMsg></nfse:${metodo}></soapenv:Body>
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

/** POST SOAP com mTLS (o A1 autentica o túnel). Devolve o corpo SOAP cru. */
async function postarSoap(
  ambiente: keyof typeof ENDPOINTS, metodo: string, corpo: string, keyPem: string, certPem: string,
): Promise<string> {
  const url = new URL(ENDPOINTS[ambiente]);
  // key/cert em PEM (extraídos do .pfx pelo node-forge no carregarCertificado): o OpenSSL 3
  // do Node recusa PFX RC2/3DES da Safeweb ("Unsupported PKCS12 PFX data") — PEM não tem esse limite.
  const agent = new Agent({ key: keyPem, cert: certPem });
  return new Promise<string>((resolve, reject) => {
    const req = request({
      hostname: url.hostname, path: url.pathname, method: 'POST', agent, timeout: 60000,
      // SOAPAction = NS + "/<método>" (padrão .asmx) — funcionou no GerarNfse autorizado em 01/09.
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `${NS}/${metodo}` },
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
}

export async function chamarGerarNfse(
  ambiente: keyof typeof ENDPOINTS, dpsAssinada: string, keyPem: string, certPem: string,
): Promise<RespostaGerar> {
  const soapXml = await postarSoap(ambiente, 'GerarNfse', montarEnvelope('GerarNfse', dpsAssinada), keyPem, certPem);
  return interpretarResposta(soapXml);
}

// ── ConsultarDadosCadastrais: as atividades do cadastro (cTribMun) ─────────────
// O cTribMun da DPS é um NÚMERO do cadastro do ISS.net de cada empresa (na
// homologação: 1/4/6/7). Esta consulta (manual v1.01 §9.2.10, só leitura — não
// emite nada) devolve as atividades cadastradas: tcAtividade{cTribMun, xTribMun,
// pAliq}. É assim que se descobre o código REAL de produção sem chute.

export interface AtividadeFisco { cTribMun: string; xTribMun: string; pAliq: number | null }
export type RespostaDadosCadastrais =
  | { ok: true; atividades: AtividadeFisco[] }
  | { ok: false; erros: ErroFiscal[] };

/** Corpo do ConsultarDadosCadastraisEnvio: Prestador = tcIdentificacaoPessoaEmpresaComIM. */
export function montarConsultaDadosCadastrais(cnpj: string, im: string): string {
  const d = (s: string) => s.replace(/\D/g, '');
  return `<Prestador><CNPJ>${d(cnpj)}</CNPJ><IM>${d(im)}</IM></Prestador>`;
}

function desescaparSeResultado(soapXml: string, marcas: string[]): string {
  const re = new RegExp(`<(${marcas.join('|')})[\\s>]`);
  const reEsc = new RegExp(`&lt;(${marcas.join('|')})`);
  if (!re.test(soapXml) && reEsc.test(soapXml)) {
    return soapXml.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  }
  return soapXml;
}

export function interpretarDadosCadastrais(soapXml: string): RespostaDadosCadastrais {
  const corpo = desescaparSeResultado(soapXml, ['Atividade', 'MensagemRetorno', 'ConsultarDadosCadastraisResposta']);
  const $ = cheerio.load(corpo, { xmlMode: true });
  const atividades: AtividadeFisco[] = [];
  $('Atividade').each((_, el) => {
    const cTribMun = $(el).find('cTribMun').first().text().trim();
    if (!cTribMun) return;
    const aliq = $(el).find('pAliq').first().text().trim();
    atividades.push({
      cTribMun,
      xTribMun: $(el).find('xTribMun').first().text().trim(),
      pAliq: aliq && Number.isFinite(Number(aliq)) ? Number(aliq) : null,
    });
  });
  if (atividades.length > 0) return { ok: true, atividades };
  const erros: ErroFiscal[] = [];
  $('MensagemRetorno').each((_, el) => {
    erros.push({
      codigo: $(el).find('Codigo').first().text().trim(),
      mensagem: $(el).find('Mensagem').first().text().trim(),
      correcao: $(el).find('Correcao').first().text().trim() || null,
    });
  });
  if (erros.length === 0) erros.push({ codigo: 'SEM_ATIVIDADES', mensagem: 'O fisco respondeu sem nenhuma atividade cadastrada.', correcao: null });
  return { ok: false, erros };
}

export async function consultarDadosCadastrais(
  ambiente: keyof typeof ENDPOINTS, cnpj: string, im: string, keyPem: string, certPem: string,
): Promise<RespostaDadosCadastrais> {
  const env = montarEnvelope('ConsultarDadosCadastrais', montarConsultaDadosCadastrais(cnpj, im));
  return interpretarDadosCadastrais(await postarSoap(ambiente, 'ConsultarDadosCadastrais', env, keyPem, certPem));
}
