// src/modules/financeiro/fiscal/dps-xml.ts
// Monta a DPS XML do padrão nacional (manual NotaControl v1.01, grupo B).
// Função PURA: entra dado, sai string — o teste cobre a estrutura; a validação
// final é do validador oficial (homologação) na Task 11.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
// Textos livres viram linha única: quebra de linha DENTRO de texto também sofre com o
// tratamento de whitespace do parser do fisco (ver nota sobre XML compacto abaixo).
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const dec2 = (n: number) => n.toFixed(2);
const soDigitos = (s: string) => s.replace(/\D/g, '');

export interface EnderecoNac { cMun: string; cep: string; xLgr: string; nro: string; xBairro: string }

export interface EntradaDps {
  ambiente: 'homologacao' | 'producao';
  dhEmi: Date; serie: string; nDps: number; competencia: string; codMunicipio: string;
  /** false na HOMOLOGAÇÃO: o cadastro de teste não conhece a opção pelo Simples
   *  (E0160 manda usar opSimpNac=1 quando o CNPJ não consta no cadastro). */
  optanteSimples: boolean;
  prestador: { cnpj: string; im: string };
  /** im: inscricao municipal do TOMADOR (no DF, o CF/DF). Obrigatoria quando ele
   *  retem o ISS — sem ela o fisco devolve EM057. Teste real 01/09/2026. */
  tomador: { tipo: 'PJ' | 'PF'; doc: string; nome: string; im?: string | null; endereco: EnderecoNac | null; email: string | null };
  /** nbs: código NBS do serviço (ex.: '1.1415.00.00') — vai só com dígitos (TSCodNBS, N 9). */
  servico: { codTribNacional: string; codTribMunicipal: string; descricao: string; nbs?: string | null };
  /** Obrigatório quando o cTribNac é de obra (07.02.01, 07.02.02, 07.04.01, 07.05.01,
   *  07.05.02, 07.06.01, 07.06.02, 07.07.01, 07.08.01, 07.17.01, 07.19.01) — E0370. */
  obra: EnderecoNac | null;
  valores: { vServ: number; issRetido: boolean };
  /** Reforma tributária (DPS 1.01): o que o EMITENTE declara do IBS/CBS. As
   *  alíquotas NÃO vão — o fisco calcula e devolve na NFS-e. Sem isto a DPS sai
   *  na versão 1.00 (sem o grupo), que o fisco só aceita até set/2026. */
  ibscbs?: IbsCbsDps | null;
}

export interface IbsCbsDps { cIndOp: string; cst: string; cClassTrib: string }

/** Grupo IBSCBS (TCRTCInfoIBSCBS, manual v1.01 + GerarNfseEnvio-exemplo.xml oficial).
 *  finNFSe=0 (NFS-e regular) · indDest=0 (destinatário = o próprio tomador, como
 *  nas notas reais 82/83/85). tpOper/tpEnteGov só pra ente público ou itens
 *  25.05/15.09/17.12/10.05 (regra 5.1 do manual) — nunca é o nosso caso. indFinal
 *  é opcional e fica de fora. */
function ibsCbsXml(g: IbsCbsDps): string {
  if (!/^\d{3}$/.test(g.cst)) throw new Error(`CST do IBS/CBS inválido ("${g.cst}"): precisa de 3 dígitos.`);
  if (!/^\d{6}$/.test(g.cClassTrib)) throw new Error(`cClassTrib do IBS/CBS inválido ("${g.cClassTrib}"): precisa de 6 dígitos.`);
  if (!/^\d{6}$/.test(g.cIndOp)) throw new Error(`cIndOp do IBS/CBS inválido ("${g.cIndOp}"): precisa de 6 dígitos.`);
  return `<IBSCBS><finNFSe>0</finNFSe><cIndOp>${g.cIndOp}</cIndOp><indDest>0</indDest>` +
    `<valores><trib><gIBSCBS><CST>${g.cst}</CST><cClassTrib>${g.cClassTrib}</cClassTrib></gIBSCBS></trib></valores></IBSCBS>`;
}

/** cTribNac (só dígitos) que exigem o grupo de obra na DPS (manual + E0370). */
export const COD_TRIB_COM_OBRA = new Set([
  '070201', '070202', '070401', '070501', '070502', '070601', '070602', '070701', '070801', '071701', '071901',
]);

const endNacXml = (e: EnderecoNac) =>
  `<end><endNac><cMun>${soDigitos(e.cMun)}</cMun><CEP>${soDigitos(e.cep)}</CEP></endNac>` +
  `<xLgr>${esc(norm(e.xLgr))}</xLgr><nro>${esc(norm(e.nro))}</nro><xBairro>${esc(norm(e.xBairro))}</xBairro></end>`;

export function montarDpsXml(e: EntradaDps): { xml: string; idDps: string } {
  const tpAmb = e.ambiente === 'producao' ? '1' : '2';
  const cnpj = soDigitos(e.prestador.cnpj);
  // Id da DPS (TSIdDPS, 45 posições): "DPS" + cLocEmi(7) + tipoInscricao(1: 2=CNPJ) +
  // inscricao(14) + serie(5) + nDPS(15). Conferir contra o validador oficial na Task 11.
  const idDps = `DPS${e.codMunicipio}2${cnpj.padStart(14, '0')}${e.serie.padStart(5, '0')}${String(e.nDps).padStart(15, '0')}`;
  const docTomador = e.tomador.tipo === 'PJ'
    ? `<CNPJ>${soDigitos(e.tomador.doc)}</CNPJ>`
    : `<CPF>${soDigitos(e.tomador.doc)}</CPF>`;
  // O tipo TS do schema NÃO aceita "Z": exige offset explícito (validador oficial, 31/08).
  // Emitimos sempre no fuso de Brasília (-03:00).
  const brasilia = new Date(e.dhEmi.getTime() - 3 * 3600 * 1000);
  const dhEmi = brasilia.toISOString().replace(/\.\d{3}Z$/, '') + '-03:00';
  const tpRet = e.valores.issRetido ? '2' : '1';
  // Ordem do TCInfoPessoa (manual v1.01): CNPJ/CPF -> CAEPF -> IM -> xNome -> End -> Fone -> Email.
  const imTomador = e.tomador.im ? `<IM>${esc(soDigitos(e.tomador.im))}</IM>` : '';
  const endTomador = e.tomador.endereco ? endNacXml(e.tomador.endereco) : '';
  const email = e.tomador.email ? `<email>${esc(e.tomador.email)}</email>` : '';
  // opSimpNac=3 exige regApTribSN; opSimpNac=1 PROÍBE (e também proíbe pAliq — E0617).
  const regTrib = e.optanteSimples
    ? '<regTrib><opSimpNac>3</opSimpNac><regApTribSN>1</regApTribSN><regEspTrib>0</regEspTrib></regTrib>'
    : '<regTrib><opSimpNac>1</opSimpNac><regEspTrib>0</regEspTrib></regTrib>';
  const obra = e.obra ? `<obra>${endNacXml(e.obra)}</obra>` : '';
  const nbs = soDigitos(e.servico.nbs ?? '');
  const cNbs = nbs.length === 9 ? `<cNBS>${nbs}</cNBS>` : '';
  // "SOMENTE É PERMITIDO DECLARAR IBS/CBS A PARTIR DA VERSÃO 1.01" e "É OBRIGATÓRIO
  // NA 1.01" (exemplo oficial): a versão anda junto com o grupo.
  const versao = e.ibscbs ? '1.01' : '1.00';
  const ibscbs = e.ibscbs ? ibsCbsXml(e.ibscbs) : '';
  const xml =
`<?xml version="1.0" encoding="UTF-8"?>
<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="${versao}">
<infDPS Id="${idDps}">
<tpAmb>${tpAmb}</tpAmb>
<dhEmi>${dhEmi}</dhEmi>
<verAplic>EcoSunDash-F2</verAplic>
<serie>${esc(e.serie)}</serie>
<nDPS>${e.nDps}</nDPS>
<dCompet>${e.competencia}</dCompet>
<tpEmit>1</tpEmit>
<cLocEmi>${e.codMunicipio}</cLocEmi>
<prest>
<CNPJ>${cnpj}</CNPJ>
<IM>${esc(e.prestador.im)}</IM>
${regTrib}
</prest>
<toma>
${docTomador}${imTomador}
<xNome>${esc(norm(e.tomador.nome))}</xNome>
${endTomador}
${email}
</toma>
<serv>
<locPrest>
<cLocPrestacao>${e.codMunicipio}</cLocPrestacao>
</locPrest>
<cServ>
<cTribNac>${soDigitos(e.servico.codTribNacional)}</cTribNac>
<cTribMun>${esc(e.servico.codTribMunicipal)}</cTribMun>
<xDescServ>${esc(norm(e.servico.descricao))}</xDescServ>
${cNbs}
</cServ>
${obra}
</serv>
<valores>
<vServPrest>
<vServ>${dec2(e.valores.vServ)}</vServ>
</vServPrest>
<trib>
<tribMun>
<tribISSQN>1</tribISSQN>
<tpRetISSQN>${tpRet}</tpRetISSQN>
</tribMun>
<totTrib>
<indTotTrib>0</indTotTrib>
</totTrib>
</trib>
</valores>
${ibscbs}
</infDPS>
</DPS>`;
  // COMPACTO, SEM quebra de linha entre tags: o parser do fisco (.NET) descarta
  // whitespace "insignificante" ao extrair o XML do envelope — se assinarmos um XML
  // com quebras, o digest não bate mais depois desse descarte (E0714 assinatura
  // inválida, visto na homologação 31/08). Sem whitespace, nada se perde.
  return { xml: xml.replace(/\n\s*/g, ''), idDps };
}
