// src/modules/financeiro/fiscal/dps-xml.ts
// Monta a DPS XML do padrão nacional (manual NotaControl v1.01, grupo B).
// Função PURA: entra dado, sai string — o teste cobre a estrutura; a validação
// final é do validador oficial (homologação) na Task 11.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const dec2 = (n: number) => n.toFixed(2);
const soDigitos = (s: string) => s.replace(/\D/g, '');

export interface EntradaDps {
  ambiente: 'homologacao' | 'producao';
  dhEmi: Date; serie: string; nDps: number; competencia: string; codMunicipio: string;
  prestador: { cnpj: string; im: string };
  tomador: { tipo: 'PJ' | 'PF'; doc: string; nome: string; cep: string | null; codMunicipio: string; email: string | null };
  servico: { codTribNacional: string; codTribMunicipal: string; descricao: string };
  valores: { vServ: number; issRetido: boolean };
}

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
  const endTomador = e.tomador.cep
    ? `<end><endNac><cMun>${e.tomador.codMunicipio}</cMun><CEP>${soDigitos(e.tomador.cep)}</CEP></endNac></end>`
    : '';
  const email = e.tomador.email ? `<email>${esc(e.tomador.email)}</email>` : '';
  const xml =
`<?xml version="1.0" encoding="UTF-8"?>
<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">
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
<regTrib>
<opSimpNac>3</opSimpNac>
<regApTribSN>1</regApTribSN>
<regEspTrib>0</regEspTrib>
</regTrib>
</prest>
<toma>
${docTomador}
<xNome>${esc(e.tomador.nome)}</xNome>
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
<xDescServ>${esc(e.servico.descricao)}</xDescServ>
</cServ>
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
</infDPS>
</DPS>`;
  return { xml, idDps };
}
