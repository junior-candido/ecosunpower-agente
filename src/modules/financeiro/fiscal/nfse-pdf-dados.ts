// src/modules/financeiro/fiscal/nfse-pdf-dados.ts
// Dados do PDF da NFS-e. O webservice do fisco devolve SÓ o XML (o manual v1.01
// não fala de PDF) — o PDF é gerado aqui, a partir do XML AUTORIZADO (a fonte da
// verdade: números, chave, IBS/CBS calculado pelo fisco). O banco e o catálogo só
// completam o que o XML não traz, e servem pra PRÉVIA quando ainda não há XML.
//
// Função PURA (entra XML/linhas, sai objeto) — os dois modelos de PDF
// (nfse-pdf-modelos.ts) leem daqui.
import * as cheerio from 'cheerio';
import type { NotaLinha } from './notas-repo.js';
import { servicoDoCatalogo, ibsCbsDoServico, calcularIbsCbs, situacaoTributariaIbsCbs } from './catalogo-servicos.js';

const txt = (v: string | undefined | null) => {
  const t = String(v ?? '').trim();
  return t ? t : null;
};
const num = (v: string | undefined | null) => {
  const t = txt(v);
  if (t === null) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export interface LeituraNfse {
  numero: string | null; chave: string | null; dhProc: string | null;
  xLocEmi: string | null; xLocPrestacao: string | null; xLocIncid: string | null;
  xTribNac: string | null; xTribMun: string | null; xNBS: string | null; xOutInf: string | null;
  dps: { serie: string | null; nDps: string | null; dhEmi: string | null; competencia: string | null; tpAmb: string | null; opSimpNac: string | null };
  emit: { cnpj: string | null; im: string | null; nome: string | null; fantasia: string | null; logradouro: string | null; numero: string | null; bairro: string | null; cMun: string | null; uf: string | null; cep: string | null; fone: string | null; email: string | null };
  toma: { doc: string | null; im: string | null; nome: string | null; logradouro: string | null; numero: string | null; bairro: string | null; cMun: string | null; cep: string | null; fone: string | null; email: string | null };
  serv: { cTribNac: string | null; cTribMun: string | null; xDescServ: string | null; cNBS: string | null; cLocPrestacao: string | null; vServ: number | null };
  iss: { vBC: number | null; pAliq: number | null; vISSQN: number | null; vTotalRet: number | null; vLiq: number | null; retido: boolean | null };
  ibscbs: {
    cIndOp: string | null; cst: string | null; cClassTrib: string | null; cLocalidadeIncid: string | null; xLocalidadeIncid: string | null;
    vBC: number | null; pCBS: number | null; pRedAliqCBS: number | null; pAliqEfetCBS: number | null;
    pIBSUF: number | null; pRedAliqUF: number | null; pAliqEfetUF: number | null;
    pIBSMun: number | null; pRedAliqMun: number | null; pAliqEfetMun: number | null;
    vCBS: number | null; vIBSUF: number | null; vIBSMun: number | null; vIBSTot: number | null; vTotNF: number | null;
  };
}

/** Lê o XML da NFS-e (CompNfse/NFSe/infNFSe, como o GerarNfse devolve). Busca por
 *  CAMINHO, não só pelo nome: vBC existe no ISS e no IBS/CBS, "valores" em 3 grupos. */
export function lerXmlNfse(xml: string): LeituraNfse {
  const $ = cheerio.load(xml || '<vazio/>', { xmlMode: true });
  const inf = $('infNFSe').first();
  const infDps = inf.find('infDPS').first();
  const t = (ctx: ReturnType<typeof $>, sel: string) => txt(ctx.find(sel).first().text());
  const n = (ctx: ReturnType<typeof $>, sel: string) => num(ctx.find(sel).first().text());
  const filho = (ctx: ReturnType<typeof $>, nome: string) => ctx.children(nome).first();

  const emit = filho(inf, 'emit');
  const ender = emit.find('enderNac').first();
  const toma = infDps.children('toma').first();
  const tomaEnd = toma.children('end').first();
  const cServ = infDps.find('serv > cServ').first();
  const valNfse = filho(inf, 'valores');
  const ibsNfse = filho(inf, 'IBSCBS');
  const ibsVal = filho(ibsNfse, 'valores');
  const ibsDps = infDps.children('IBSCBS').first();
  const tpRet = t(infDps, 'tribMun > tpRetISSQN');
  const idNfse = txt(inf.attr('Id'));

  return {
    numero: t(inf, 'nNFSe'),
    chave: idNfse ? idNfse.replace(/^NFS/, '') : null,
    dhProc: t(inf, 'dhProc'),
    xLocEmi: txt(filho(inf, 'xLocEmi').text()), xLocPrestacao: txt(filho(inf, 'xLocPrestacao').text()), xLocIncid: txt(filho(inf, 'xLocIncid').text()),
    xTribNac: txt(filho(inf, 'xTribNac').text()), xTribMun: txt(filho(inf, 'xTribMun').text()),
    xNBS: txt(filho(inf, 'xNBS').text()), xOutInf: txt(filho(inf, 'xOutInf').text()),
    dps: {
      serie: txt(filho(infDps, 'serie').text()), nDps: txt(filho(infDps, 'nDPS').text()),
      dhEmi: txt(filho(infDps, 'dhEmi').text()), competencia: txt(filho(infDps, 'dCompet').text()),
      tpAmb: txt(filho(infDps, 'tpAmb').text()), opSimpNac: t(infDps, 'prest opSimpNac'),
    },
    emit: {
      cnpj: txt(filho(emit, 'CNPJ').text()) ?? txt(filho(emit, 'CPF').text()), im: txt(filho(emit, 'IM').text()),
      nome: txt(filho(emit, 'xNome').text()), fantasia: txt(filho(emit, 'xFant').text()),
      logradouro: t(ender, 'xLgr'), numero: t(ender, 'nro'), bairro: t(ender, 'xBairro'),
      cMun: t(ender, 'cMun'), uf: t(ender, 'UF'), cep: t(ender, 'CEP'),
      fone: txt(filho(emit, 'fone').text()), email: txt(filho(emit, 'email').text()),
    },
    toma: {
      doc: txt(filho(toma, 'CNPJ').text()) ?? txt(filho(toma, 'CPF').text()), im: txt(filho(toma, 'IM').text()),
      nome: txt(filho(toma, 'xNome').text()),
      logradouro: t(tomaEnd, 'xLgr'), numero: t(tomaEnd, 'nro'), bairro: t(tomaEnd, 'xBairro'),
      cMun: t(tomaEnd, 'cMun'), cep: t(tomaEnd, 'CEP'),
      fone: txt(filho(toma, 'fone').text()), email: txt(filho(toma, 'email').text()),
    },
    serv: {
      cTribNac: t(cServ, 'cTribNac'), cTribMun: t(cServ, 'cTribMun'), xDescServ: t(cServ, 'xDescServ'), cNBS: t(cServ, 'cNBS'),
      cLocPrestacao: t(infDps, 'serv > locPrest > cLocPrestacao'), vServ: n(infDps, 'valores > vServPrest > vServ'),
    },
    iss: {
      vBC: num(filho(valNfse, 'vBC').text()), pAliq: num(filho(valNfse, 'pAliqAplic').text()),
      vISSQN: num(filho(valNfse, 'vISSQN').text()), vTotalRet: num(filho(valNfse, 'vTotalRet').text()),
      vLiq: num(filho(valNfse, 'vLiq').text()),
      retido: tpRet === null ? null : tpRet !== '1',
    },
    ibscbs: {
      cIndOp: txt(filho(ibsDps, 'cIndOp').text()), cst: t(ibsDps, 'gIBSCBS > CST'), cClassTrib: t(ibsDps, 'gIBSCBS > cClassTrib'),
      cLocalidadeIncid: txt(filho(ibsNfse, 'cLocalidadeIncid').text()), xLocalidadeIncid: txt(filho(ibsNfse, 'xLocalidadeIncid').text()),
      vBC: num(filho(ibsVal, 'vBC').text()),
      // alíquotas: dentro de IBSCBS/valores (o gTribCompraGov do totCIBS repete pCBS/pIBSUF — não serve)
      pCBS: n(ibsVal, 'pCBS'), pRedAliqCBS: n(ibsVal, 'pRedAliqCBS'), pAliqEfetCBS: n(ibsVal, 'pAliqEfetCBS'),
      pIBSUF: n(ibsVal, 'pIBSUF'), pRedAliqUF: n(ibsVal, 'pRedAliqUF'), pAliqEfetUF: n(ibsVal, 'pAliqEfetUF'),
      pIBSMun: n(ibsVal, 'pIBSMun'), pRedAliqMun: n(ibsVal, 'pRedAliqMun'), pAliqEfetMun: n(ibsVal, 'pAliqEfetMun'),
      vCBS: n(ibsNfse, 'gCBS > vCBS'), vIBSUF: n(ibsNfse, 'gIBSUFTot > vIBSUF'), vIBSMun: n(ibsNfse, 'gIBSMunTot > vIBSMun'),
      vIBSTot: n(ibsNfse, 'gIBS > vIBSTot'), vTotNF: n(ibsNfse, 'vTotNF'),
    },
  };
}

/** QR/link de conferência: consulta pública do Portal Nacional da NFS-e pela chave
 *  (mesmo destino do QR do DANFSe nacional). O QR do portal do ISS-DF usa um token
 *  cifrado que só o portal gera — por isso os dois modelos apontam pro nacional. */
export function urlConsultaNacional(chave: string | null | undefined): string | null {
  const d = String(chave ?? '').replace(/\D/g, '');
  return d.length === 50 ? `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${d}` : null;
}

const fmtCod = (cod: string | null | undefined) => {
  const d = String(cod ?? '').replace(/\D/g, '');
  return d.length === 6 ? `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4)}` : (cod ?? '');
};
const fmtNbs = (nbs: string | null | undefined) => {
  const d = String(nbs ?? '').replace(/\D/g, '');
  return d.length === 9 ? `${d[0]}.${d.slice(1, 5)}.${d.slice(5, 7)}.${d.slice(7)}` : (nbs ?? '');
};

export interface DadosNotaPdf {
  numero: string | null; chave: string | null; dataGeracao: string | null; competencia: string;
  serieDps: string | null; numeroDps: string | null; dataEmissaoDps: string | null;
  /** Tarja (homologação/prévia/teste). null = nota de verdade. */
  semValorFiscal: string | null;
  /** Tipo de ambiente da NFS-e: '1' produção, '2' homologação. */
  tpAmb: '1' | '2';
  prestador: { doc: string; im: string | null; nome: string; fantasia: string | null; endereco: string | null; cep: string | null; municipio: string; uf: string; codMun: string | null; email: string | null; fone: string | null; simples: boolean };
  tomador: { doc: string; im: string | null; nome: string; endereco: string | null; cep: string | null; municipio: string; uf: string; codMun: string | null; email: string | null; fone: string | null };
  servico: { codTribNacional: string; atividadeMunicipal: string | null; descAtividade: string | null; descTribNac: string | null; nbs: string | null; descricao: string; localPrestacao: string };
  iss: { retido: boolean; base: number; aliquota: number | null; valor: number; municipioIncidencia: string };
  ibscbs: {
    estimado: boolean; cIndOp: string; cst: string; cClassTrib: string; situacao: string;
    municipioIncidencia: string; codMunIncid: string | null; base: number;
    pCBS: number; pRedCBS: number | null; pEfetCBS: number; vCBS: number;
    pIBSUF: number; pRedUF: number | null; pEfetUF: number; vIBSUF: number;
    pIBSMun: number; pRedMun: number | null; pEfetMun: number; vIBSMun: number; vIBSTot: number;
  };
  valores: { vServ: number; totalRetencao: number; vLiq: number; vTotNF: number };
  infoComplementar: string | null;
  urlConsulta: string | null;
}

export interface EntradaPdf {
  nota: NotaLinha;
  config: { cnpj: string; inscricao_municipal: string; razao_social: string; municipio?: string | null; uf?: string | null } | null;
  servico: { cod_trib_nacional: string; cod_trib_municipal: string | null; nbs: string | null; nome?: string } | null;
  /** Força uma tarja (ex.: "TESTE" nos PDFs de exemplo). */
  tarja?: string | null;
}

const juntaEndereco = (lgr: string | null | undefined, nro: string | null | undefined, bairro?: string | null) =>
  [lgr, nro].filter(Boolean).join(', ') + (bairro ? ` — ${bairro}` : '') || null;

export function montarDadosPdf(e: EntradaPdf): DadosNotaPdf {
  const { nota, config } = e;
  const l = lerXmlNfse(nota.xmlNfse ?? '');
  const temXml = Boolean(nota.xmlNfse && l.numero !== null);
  const codNac = fmtCod(l.serv.cTribNac) || e.servico?.cod_trib_nacional || '';
  const nbsDb = e.servico?.nbs ?? null;
  const cat = servicoDoCatalogo(codNac, l.serv.cNBS ?? nbsDb);
  const nbs = fmtNbs(l.serv.cNBS ?? nbsDb ?? cat?.nbs ?? null) || null;
  const municipioPadrao = config?.municipio || nota.tomador.municipio || 'Brasília';
  const ufPadrao = config?.uf || nota.tomador.uf || 'DF';
  const localPrest = l.xLocPrestacao ? `${l.xLocPrestacao} - ${ufPadrao}` : `${municipioPadrao} - ${ufPadrao}`;

  const vServ = l.serv.vServ ?? nota.valorBruto;
  const issValor = l.iss.vISSQN ?? nota.valorIss;
  const retido = l.iss.retido ?? nota.issRetido;

  // IBS/CBS: do XML do fisco; sem XML, prévia pelo catálogo (mesma conta do fisco).
  const ibCat = ibsCbsDoServico(codNac, l.serv.cNBS ?? nbsDb);
  const prev = calcularIbsCbs(vServ, issValor, ibCat);
  const x = l.ibscbs;
  const usarXml = temXml && x.vCBS !== null;
  const cst = x.cst ?? ibCat.cst;
  const ibscbs: DadosNotaPdf['ibscbs'] = usarXml ? {
    estimado: false, cIndOp: x.cIndOp ?? ibCat.cIndOp, cst, cClassTrib: x.cClassTrib ?? ibCat.cClassTrib,
    situacao: situacaoTributariaIbsCbs(cst),
    municipioIncidencia: x.xLocalidadeIncid ? `${x.xLocalidadeIncid} - ${ufPadrao}` : localPrest, codMunIncid: x.cLocalidadeIncid,
    base: x.vBC ?? prev.vBC,
    pCBS: x.pCBS ?? ibCat.pCBS, pRedCBS: x.pRedAliqCBS, pEfetCBS: x.pAliqEfetCBS ?? x.pCBS ?? 0, vCBS: x.vCBS ?? 0,
    pIBSUF: x.pIBSUF ?? ibCat.pIBSUF, pRedUF: x.pRedAliqUF, pEfetUF: x.pAliqEfetUF ?? x.pIBSUF ?? 0, vIBSUF: x.vIBSUF ?? 0,
    pIBSMun: x.pIBSMun ?? ibCat.pIBSMun, pRedMun: x.pRedAliqMun, pEfetMun: x.pAliqEfetMun ?? x.pIBSMun ?? 0, vIBSMun: x.vIBSMun ?? 0,
    vIBSTot: x.vIBSTot ?? Math.round(((x.vIBSUF ?? 0) + (x.vIBSMun ?? 0)) * 100) / 100,
  } : {
    estimado: true, cIndOp: ibCat.cIndOp, cst: ibCat.cst, cClassTrib: ibCat.cClassTrib, situacao: situacaoTributariaIbsCbs(ibCat.cst),
    municipioIncidencia: localPrest, codMunIncid: nota.tomador.codMunIbge ?? null, base: prev.vBC,
    pCBS: ibCat.pCBS, pRedCBS: ibCat.pRedAliq || null, pEfetCBS: prev.pAliqEfetCBS, vCBS: prev.vCBS,
    pIBSUF: ibCat.pIBSUF, pRedUF: ibCat.pRedAliq || null, pEfetUF: prev.pAliqEfetUF, vIBSUF: prev.vIBSUF,
    pIBSMun: ibCat.pIBSMun, pRedMun: ibCat.pRedAliq || null, pEfetMun: prev.pAliqEfetMun, vIBSMun: prev.vIBSMun, vIBSTot: prev.vIBSTot,
  };

  const totalRetencao = l.iss.vTotalRet ?? (retido ? issValor : 0);
  const vLiq = l.iss.vLiq ?? nota.valorLiquido;
  const homolog = l.dps.tpAmb === '2' || (!l.dps.tpAmb && nota.ambienteEmissao === 'homologacao');
  const semValorFiscal = e.tarja
    ?? (homolog ? 'SEM VALOR FISCAL — HOMOLOGAÇÃO (TESTE)' : null)
    ?? (!temXml ? 'PRÉVIA — AINDA NÃO É NOTA FISCAL' : null);
  const chave = l.chave ?? nota.chaveAcesso;
  const simples = l.dps.opSimpNac ? l.dps.opSimpNac !== '1' : true;

  return {
    numero: l.numero ?? nota.numero, chave, dataGeracao: l.dhProc,
    competencia: l.dps.competencia ?? nota.competencia,
    serieDps: l.dps.serie, numeroDps: l.dps.nDps, dataEmissaoDps: l.dps.dhEmi,
    semValorFiscal,
    tpAmb: homolog ? '2' : '1',
    prestador: {
      doc: l.emit.cnpj ?? config?.cnpj ?? '', im: l.emit.im ?? config?.inscricao_municipal ?? null,
      nome: l.emit.nome ?? config?.razao_social ?? '', fantasia: l.emit.fantasia,
      endereco: l.emit.logradouro ? juntaEndereco(l.emit.logradouro, l.emit.numero, l.emit.bairro) : null,
      cep: l.emit.cep, municipio: l.xLocEmi ?? config?.municipio ?? municipioPadrao,
      uf: l.emit.uf ?? ufPadrao, codMun: l.emit.cMun, email: l.emit.email, fone: l.emit.fone, simples,
    },
    tomador: {
      doc: l.toma.doc ?? nota.tomador.doc, im: l.toma.im ?? nota.tomador.im ?? null,
      nome: l.toma.nome ?? nota.tomador.nome,
      endereco: l.toma.logradouro ? juntaEndereco(l.toma.logradouro, l.toma.numero, l.toma.bairro)
        : (nota.tomador.logradouro ? juntaEndereco(nota.tomador.logradouro, nota.tomador.numero, nota.tomador.bairro) : (nota.tomador.endereco || null)),
      cep: l.toma.cep ?? nota.tomador.cep ?? null,
      municipio: nota.tomador.municipio || municipioPadrao, uf: nota.tomador.uf || ufPadrao,
      codMun: l.toma.cMun ?? nota.tomador.codMunIbge ?? null,
      email: l.toma.email ?? nota.tomador.email ?? null, fone: l.toma.fone,
    },
    servico: {
      codTribNacional: codNac, atividadeMunicipal: cat?.atividadeMunicipal ?? null,
      descAtividade: l.xTribMun ?? cat?.descAtividade ?? null,
      descTribNac: l.xTribNac ?? cat?.descAtividade ?? null,
      nbs, descricao: l.serv.xDescServ ?? nota.descricao, localPrestacao: localPrest,
    },
    iss: { retido, base: l.iss.vBC ?? vServ, aliquota: l.iss.pAliq ?? (vServ ? Math.round(issValor / vServ * 10000) / 100 : null), valor: issValor,
      municipioIncidencia: l.xLocIncid ? `${l.xLocIncid} - ${ufPadrao}` : localPrest },
    ibscbs,
    // 2026: vTotNF = vLiq (IBS/CBS ainda não somam no total — manual TCRTCTotalCIBS).
    valores: { vServ, totalRetencao, vLiq, vTotNF: x.vTotNF ?? vLiq },
    infoComplementar: l.xOutInf,
    urlConsulta: temXml ? urlConsultaNacional(chave) : null,
  };
}
