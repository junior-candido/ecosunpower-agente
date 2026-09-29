// src/modules/financeiro/fiscal/nfse-pdf-modelos.ts
// Os DOIS modelos de PDF da NFS-e, copiando os layouts que o portal entrega
// (Junior, 01/09/2026: "igual o portal"):
//   - GDF / ISS.net ............ notas 82 e 83 (Coordenação do ISS, 1 página)
//   - DANFSe v2.0 nacional ..... nota 85 (Documento Auxiliar da NFS-e)
// Funções PURAS: DadosNotaPdf → HTML A4. Quem vira PDF é o htmlToPdf (Puppeteer),
// o mesmo motor das propostas (nfse-pdf.ts).
//
// Sem brasão/logos oficiais em imagem: os cabeçalhos são texto. E o rodapé diz a
// verdade — o PDF foi gerado por nós a partir do XML autorizado (não finge ser
// o sistema do fisco). A validade jurídica é do XML + chave, conferível no QR.
// Sem fonte da web: o Chrome headless pode não ter internet.
import type { DadosNotaPdf } from './nfse-pdf-dados.js';

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const ou = (s: string | null | undefined, vazio = '-') => (s && String(s).trim() ? esc(s) : vazio);
const brl = (n: number | null | undefined) => (n === null || n === undefined ? '-'
  : 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
/** 0.9 → "0,9%" · 5 → "5%" · 0.63 → "0,63%" (como o portal imprime). */
const pct = (n: number | null | undefined) => (n === null || n === undefined ? '-'
  : (Math.round(n * 10000) / 10000).toLocaleString('pt-BR', { maximumFractionDigits: 4 }) + '%');
const dataBr = (iso: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '-';
};
/** Data+hora LOCAL do jeito que vem no XML (com offset -03:00) — sem converter fuso. */
const dataHoraBr = (iso: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(String(iso ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}:${m[6]}` : '-';
};
const docFmt = (doc: string | null | undefined) => {
  const d = String(doc ?? '').replace(/\D/g, '');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return doc ? String(doc) : '-';
};
const cepFmt = (cep: string | null | undefined, ponto = false) => {
  const d = String(cep ?? '').replace(/\D/g, '');
  if (d.length !== 8) return cep ? String(cep) : '-';
  return ponto ? `${d.slice(0, 2)}.${d.slice(2, 5)}-${d.slice(5)}` : `${d.slice(0, 5)}-${d.slice(5)}`;
};
const foneFmt = (f: string | null | undefined) => {
  const d = String(f ?? '').replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0, 2)})${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `(${d.slice(0, 2)})${d.slice(2, 7)}-${d.slice(7)}`;
  return f ? String(f) : '';
};
const UF_NOME: Record<string, string> = { DF: 'Distrito Federal', GO: 'Goiás', SP: 'São Paulo', MG: 'Minas Gerais', RJ: 'Rio de Janeiro', MS: 'Mato Grosso do Sul' };

const SIMPLES_TXT = 'Optante - Microempresa ou Empresa de Pequeno Porte (ME/EPP)';
const REGIME_SN = 'Regime de apuração dos tributos federais e municipal pelo SN';

function tarja(d: DadosNotaPdf): string {
  return d.semValorFiscal ? `<div class="tarja">${esc(d.semValorFiscal)}</div>` : '';
}

const CSS_BASE = `
@page{size:A4}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff}
body{font-family:Arial,Helvetica,sans-serif;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.tarja{position:fixed;top:42%;left:0;right:0;text-align:center;transform:rotate(-24deg);font-size:40px;font-weight:700;color:rgba(200,0,0,.3);letter-spacing:2px;z-index:9;pointer-events:none}
`;

// ── Modelo 1: GDF / ISS.net (notas 82/83) ────────────────────────────────────

export function htmlModeloGdf(d: DadosNotaPdf, qrDataUrl: string | null): string {
  const p = d.prestador, t = d.tomador, s = d.servico, i = d.iss, b = d.ibscbs;
  const qr = qrDataUrl ? `<img class="qr" src="${qrDataUrl}" alt="QR code de consulta">` : '';
  // xTribMun do fisco pode já vir "14.01 - …": não repete o código.
  const jaTemCodigo = Boolean(s.atividadeMunicipal && s.descAtividade?.trim().startsWith(s.atividadeMunicipal));
  const atividade = s.atividadeMunicipal && !jaTemCodigo
    ? `${esc(s.atividadeMunicipal)}${s.descAtividade ? ' - ' + esc(s.descAtividade) : ''}`
    : ou(s.descAtividade);
  const info = d.infoComplementar
    ? esc(d.infoComplementar)
    : (p.simples ? `I - "DOCUMENTO EMITIDO POR ME OU EPP OPTANTE PELO SIMPLES NACIONAL"; e<br>II - "NÃO GERA DIREITO A CRÉDITO FISCAL DE IPI."` : '');
  const procon = p.uf === 'DF' ? '<br>• PROCON: TEL 151- SETOR COMERCIAL SUL, QUADRA 8, BLOCO B-60, SALA 240- BRASILIA - DF' : '';
  const ufNome = (uf: string) => UF_NOME[uf] ?? uf;
  const red = (n: number | null) => (n ? pct(n) : '-');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>NFS-e ${esc(d.numero ?? '')}</title><style>${CSS_BASE}
.g{border:1.2px solid #000;font-size:10.6px;line-height:1.28}
.g table{width:100%;border-collapse:collapse}
.g td{vertical-align:top}
.cab td{border-bottom:1px solid #000}
.cab .gov{text-align:center;padding:6px 4px}
.cab .gov b{font-size:15px}
.cab .gov div{font-size:12.5px;margin-top:2px}
.cab .nfe{width:96px;text-align:center;vertical-align:middle;color:#5a6b7b;font-size:15px;line-height:1.05;border-right:1px solid #000}
.cab .nfe small{display:block;font-size:10px;color:#1f7a3d;letter-spacing:.5px}
.cab .serie{width:136px;padding:2px 4px;font-size:9px}
.cab .serie .v{font-size:11.5px;text-align:center;margin:1px 0 3px}
.cab .serie .n{border-top:1px solid #000;margin:0 -4px;padding:1px 4px 0}
.lbl{font-size:8.2px;font-weight:700;display:block}
.ids td{border-right:1px solid #000;border-bottom:1px solid #000;padding:1px 4px 2px;font-size:11.5px}
.ids td.qrc{border-right:0;width:136px;text-align:center;vertical-align:middle;padding:3px}
.qr{width:108px;height:108px}
.consulte{text-align:center;font-size:8.2px;font-weight:700;padding:3px 2px;border-bottom:1px solid #000}
.consulte a{color:#000}
.tit{text-align:center;font-weight:700;font-size:12px;border-bottom:1px solid #000;padding:1px 0}
.tit.top{border-top:1px solid #000}
.bl{padding:1px 4px 2px;border-bottom:1px solid #000}
.row{display:flex;flex-wrap:wrap;gap:0 14px}
.row>span{white-space:nowrap}
.row .grow{flex:1 1 auto;white-space:normal}
.c3{display:grid;grid-template-columns:1.05fr 1fr 1fr}
.c4{display:grid;grid-template-columns:1.1fr 1.25fr 1.2fr 1.2fr}
.c2{display:grid;grid-template-columns:1fr 1fr}
.tot{display:grid;grid-template-columns:repeat(5,1fr);border-bottom:1px solid #000}
.tot>div{border-right:1px solid #000;padding:0 4px 2px;font-size:11.5px}
.tot>div:last-child{border-right:0}
.tot .lbl{font-size:7.6px}
.info{padding:2px 4px 3px;font-size:10.4px;border-bottom:1px solid #000;min-height:44px}
.rod{text-align:center;font-size:9.5px;padding:3px}
</style></head><body>${tarja(d)}
<div class="g">
<table class="cab"><tr>
  <td class="gov"><b>Governo do Distrito Federal</b><div>Secretaria de Estado de Economia do Distrito Federal</div><div>Coordenação do ISS</div></td>
  <td class="nfe">Nota Fiscal<br><span style="font-size:19px">Eletrônica</span><small>NFS-e</small></td>
  <td class="serie"><span>Série do Documento</span><div class="v">Nota Fiscal de Serviço<br>Eletrônica - NFS-e</div>
    <div class="n">Número da Nota Fiscal<div class="v" style="margin:0">${ou(d.numero)}</div></div></td>
</tr></table>
<table class="ids">
  <tr><td style="width:24%"><span class="lbl">Data de Geração da NFS-e</span>${dataHoraBr(d.dataGeracao)}</td>
      <td style="width:18%"><span class="lbl">Data de Competência</span>${dataBr(d.competencia)}</td>
      <td colspan="2"><span class="lbl">Código de Autenticidade</span>${ou(d.chave)}</td>
      <td class="qrc" rowspan="3">${qr}</td></tr>
  <tr><td><span class="lbl">Emitente da NFS-e</span>Prestador</td>
      <td><span class="lbl">Número da DPS</span>${ou(d.numeroDps, '')}</td>
      <td style="width:20%"><span class="lbl">Data Emissão da DPS</span>${d.dataEmissaoDps ? dataHoraBr(d.dataEmissaoDps) : ''}</td>
      <td><span class="lbl">Série da DPS</span>${ou(d.serieDps, '')}</td></tr>
  <tr><td colspan="4" class="consulte" style="border-right:1px solid #000">Consulte a autenticidade desta nota lendo o QRcode ou acessando o site: <a>https://iss.fazenda.df.gov.br/online/</a></td></tr>
</table>
<div class="tit">IDENTIFICAÇÃO DO PRESTADOR</div>
<div class="bl">
  <div class="c3"><span><b>CNPJ/CPF/NIF:</b> ${esc(docFmt(p.doc))}</span><span><b>Inscrição Municipal:</b> ${ou(p.im, '')}</span><span><b>Telefone:</b> ${esc(foneFmt(p.fone))}</span></div>
  <div><b>Nome/Razão Social:</b> ${esc(p.nome)}</div>
  ${p.fantasia ? `<div><b>Nome Fantasia:</b> ${esc(p.fantasia)}</div>` : ''}
  <div class="row"><span class="grow"><b>Endereço:</b> ${ou(p.endereco, '')}</span><span><b>CEP:</b> ${esc(cepFmt(p.cep))}</span></div>
  <div class="row"><span><b>Cidade:</b> ${esc(p.municipio)}</span><span><b>Estado/Prov./Reg.:</b> ${esc(ufNome(p.uf))}</span><span><b>País:</b> Brasil</span></div>
  <div><b>E-mail:</b> ${ou(p.email, '')}</div>
  ${p.simples ? `<div><b>Situação Simples Nacional:</b> ${SIMPLES_TXT} <b>Regime Apuração:</b> ${REGIME_SN} <b>Regime Especial:</b> Nenhum</div>` : '<div><b>Situação Simples Nacional:</b> Não Optante <b>Regime Especial:</b> Nenhum</div>'}
</div>
<div class="tit">IDENTIFICAÇÃO DO TOMADOR</div>
<div class="bl">
  <div class="c3"><span><b>CNPJ/CPF/NIF:</b> ${esc(docFmt(t.doc))}</span><span><b>Inscrição Municipal:</b> ${ou(t.im, '')}</span><span><b>Telefone:</b> ${esc(foneFmt(t.fone))}</span></div>
  <div><b>Nome/Razão Social:</b> ${esc(t.nome)}</div>
  <div class="row"><span class="grow"><b>Endereço:</b> ${ou(t.endereco, '')}</span><span><b>CEP:</b> ${esc(cepFmt(t.cep))}</span></div>
  <div class="row"><span><b>Cidade:</b> ${esc(t.municipio)}</span><span><b>Estado/Prov./Reg.:</b> ${esc(ufNome(t.uf))}</span><span><b>País:</b> Brasil</span></div>
  <div><b>E-mail:</b> ${ou(t.email, '')}</div>
</div>
<div class="tit">INTERMEDIÁRIO DO SERVIÇO NÃO IDENTIFICADO NA NFS-E</div>
<div class="tit">DESTINATÁRIO É O PRÓPRIO TOMADOR IDENTIFICADO NA NFS-E</div>
<div class="tit">DADOS DO SERVIÇO PRESTADO</div>
<div class="bl">
  <div class="row"><span><b>Cód. Trib. Nacional:</b> ${esc(s.codTribNacional)}</span><span><b>NBS:</b> ${ou(s.nbs)}</span><span class="grow" style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis;max-width:360px"><b>Atividade Municipal:</b> ${atividade}</span></div>
  <div class="c2"><span><b>Local da Prestação:</b> ${esc(s.localPrestacao)}</span><span><b>País Resultado da Prestação do Serviço:</b> -</span></div>
  <div class="c3"><span><b>Vl. do Serviço:</b> ${brl(d.valores.vServ)}</span><span><b>Vl. do Desc. Incondicionado:</b> -</span><span><b>Vl. do Desc. Condicionado:</b> -</span></div>
  <div><b>Descrição do Serviço:</b> ${esc(s.descricao)}</div>
</div>
<div class="tit">IMPOSTO SOBRE SERVIÇO DE QUALQUER NATUREZA - ISSQN</div>
<div class="bl">
  <div class="c3"><span><b>Tipo Tributação:</b> Operação tributável</span><span><b>Tipo Susp. Exig.:</b> -</span><span><b>Nº Proc. Susp.:</b> -</span></div>
  <div class="row"><span><b>Município de Incidência:</b> ${esc(i.municipioIncidencia)}</span><span><b>Tipo de Retenção:</b> ${i.retido ? 'Retido pelo Tomador' : 'Não Retido'}</span><span><b>Valor Dedução:</b> R$ 0,00</span></div>
  <div class="c3"><span><b>Base de Cálculo:</b> ${brl(i.base)}</span><span><b>Alíquota:</b> ${pct(i.aliquota)}</span><span><b>Vl. ISSQN:</b> ${brl(i.valor)}</span></div>
</div>
<div class="tit">TRIBUTAÇÃO NACIONAL</div>
<div class="bl">
  <div><b>CST:</b> Operação Tributável com Alíquota Básica</div>
  <div class="c3"><span><b>Tipo de Retenção:</b> PIS/COFINS/CSLL Não Retidos</span><span><b>Vl. PIS:</b> -</span><span><b>Vl. COFINS:</b> -</span></div>
  <div class="c3"><span><b>Vl. CSLL:</b> -</span><span><b>Vl. IRRF:</b> -</span><span><b>Vl. CP Retido:</b> -</span></div>
</div>
<div class="tit">IMPOSTO E CONTRIBUIÇÃO SOBRE BENS E SERVIÇOS - IBS/CBS${b.estimado ? ' (PRÉVIA)' : ''}</div>
<div class="bl">
  <div class="row"><span><b>Cód. Ind. Op.:</b> ${esc(b.cIndOp)}</span><span><b>Classif. Tributária:</b> ${esc(b.cClassTrib)}</span><span><b>Situação Tributária:</b> ${esc(b.situacao)}</span></div>
  <div class="c2"><span><b>Município de Incidência:</b> ${esc(b.municipioIncidencia)}</span><span><b>Base de Cálculo:</b> ${brl(b.base)}</span></div>
</div>
<div class="bl">
  <div class="c4"><span><b>Alíq. CBS:</b> ${pct(b.pCBS)}</span><span><b>Perc. Red. Alíq. CBS:</b> ${red(b.pRedCBS)}</span><span><b>Alíq. Efet. CBS:</b> ${pct(b.pEfetCBS)}</span><span><b>Valor CBS:</b> ${brl(b.vCBS)}</span></div>
  <div class="c4"><span><b>Alíq. IBS Est.:</b> ${pct(b.pIBSUF)}</span><span><b>Perc. Red. Alíq. IBS Est.:</b> ${red(b.pRedUF)}</span><span><b>Alíq. Efet. IBS Est.:</b> ${pct(b.pEfetUF)}</span><span><b>Valor IBS Est.:</b> ${brl(b.vIBSUF)}</span></div>
  <div class="c4"><span><b>Alíq. IBS Mun.:</b> ${pct(b.pIBSMun)}</span><span><b>Perc. Red. Alíq. IBS Mun.:</b> ${red(b.pRedMun)}</span><span><b>Alíq. Efet. IBS Mun.:</b> ${pct(b.pEfetMun)}</span><span><b>Valor IBS Mun.:</b> ${brl(b.vIBSMun)}</span></div>
</div>
<div class="bl">
  <div class="c3"><span><b>Cód. Créd. Pres.:</b></span><span><b>Alíq. do Créd. Pres. (CBS):</b> -</span><span><b>Alíq. do Créd. Pres. (IBS):</b> -</span></div>
  <div class="c2"><span><b>Vl. do Créd. Pres. (CBS):</b> -</span><span><b>Vl. do Créd. Pres. (IBS):</b> -</span></div>
</div>
<div class="bl">
  <div class="c2"><span><b>Classif. Tributária Regular:</b> -</span><span><b>Situação Tributária Regular:</b> -</span></div>
  <div class="c3"><span><b>Alíq. Efet. Regular - CBS:</b> -</span><span><b>Alíq. Efet. Regular - IBS Estadual:</b> -</span><span><b>Alíq. Efet. Regular - IBS Municipal:</b> -</span></div>
  <div class="c3"><span><b>Valor CBS:</b> -</span><span><b>Vl. IBS Regular Estadual:</b> -</span><span><b>Vl. IBS Regular Municipal:</b> -</span></div>
</div>
<div class="tot">
  <div><span class="lbl">Total de Retenção</span>${brl(d.valores.totalRetencao)}</div>
  <div><span class="lbl">Valor Total do CBS</span>${brl(b.vCBS)}</div>
  <div><span class="lbl">Valor Total do IBS</span>${brl(b.vIBSTot)}</div>
  <div><span class="lbl">Valor Total Líquido</span>${brl(d.valores.vLiq)}</div>
  <div><span class="lbl">Valor Total da Nota Fiscal - IBS/CBS</span>${brl(d.valores.vTotNF)}</div>
</div>
<div class="tit">INFORMAÇÕES COMPLEMENTARES</div>
<div class="info">${info}${procon}</div>
<div class="rod">Representação gráfica gerada a partir do XML autorizado da NFS-e (webservice ISS.net DF — Padrão Nacional)</div>
</div></body></html>`;
}

// ── Modelo 2: DANFSe v2.0 nacional (nota 85) ─────────────────────────────────

export function htmlModeloNacional(d: DadosNotaPdf, qrDataUrl: string | null): string {
  const p = d.prestador, t = d.tomador, s = d.servico, i = d.iss, b = d.ibscbs;
  const qr = qrDataUrl ? `<img class="qr" src="${qrDataUrl}" alt="QR code de consulta">` : '';
  const tipoAmb = d.tpAmb;
  const c = (rot: string, val: string) => `<div class="c"><div class="l">${rot}</div><div class="v">${val}</div></div>`;
  const munUf = (m: string, uf: string) => `${esc(m)} / ${esc(uf)}`;
  const ibgeCep = (cod: string | null, cep: string | null) => `${ou(cod, '')}${cod || cep ? ' / ' : ''}${esc(cepFmt(cep, true)).replace(/^-$/, '')}`;
  const red = (n: number | null) => (n ? pct(n) : '-');
  const info = [d.infoComplementar ? `Inf. A. T. Mun.: ${esc(d.infoComplementar)}` : (p.simples ? 'Inf. A. T. Mun.: I "DOCUMENTO EMITIDO POR ME OU EPP OPTANTE PELO SIMPLES NACIONAL"; e II "NÃO GERA DIREITO A CRÉDITO FISCAL DE IPI."' : '')]
    .filter(Boolean).join(' ');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>DANFSe ${esc(d.numero ?? '')}</title><style>${CSS_BASE}
.n{border:1px solid #000;font-size:9.6px;line-height:1.25;padding:0}
.hd{display:grid;grid-template-columns:1.1fr 1.4fr 1fr;align-items:center;padding:5px 6px 3px;border-bottom:1px solid #000}
.logo{font-size:30px;font-weight:700;color:#1f8a4c;letter-spacing:-1px;line-height:1}
.logo span{color:#1b5e9e}
.logo small{display:inline-block;font-size:8.5px;font-weight:400;color:#5b6d80;letter-spacing:0;line-height:1.1;margin-left:4px;vertical-align:middle}
.hd .meio{text-align:center;font-size:12.5px;font-weight:700;line-height:1.35}
.hd .dir{font-size:10.5px}
.hd .dir small{display:block;font-size:8.2px}
.sec{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;border-bottom:1px solid #000;padding:1px 6px 3px;gap:1px 8px}
.sec .h{font-weight:700;font-size:10px;background:#efefef;margin:0 0 0 -6px;padding:1px 6px}
.c .l{font-weight:700;font-size:8.2px;text-transform:none}
.c .v{min-height:11px;overflow-wrap:anywhere}
.span2{grid-column:span 2}.span3{grid-column:span 3}.span4{grid-column:1/-1}
.topo{display:grid;grid-template-columns:3fr 1fr;border-bottom:1px solid #000}
.topo .dados{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px 8px;padding:1px 6px 3px}
.topo .qrbox{text-align:center;font-size:8.3px;padding:4px 4px}
.qr{width:96px;height:96px;display:block;margin:0 auto 3px}
.faixa{text-align:center;font-weight:700;font-size:9.8px;border-bottom:1px solid #000;padding:1px 0}
.desc{grid-column:1/-1}
.info{padding:2px 6px 6px;font-size:9.8px;line-height:1.5}
.hl{background:#efefef}
.rod{text-align:center;font-size:8.4px;color:#333;padding:3px;border-top:1px solid #000}
</style></head><body>${tarja(d)}
<div class="n">
<div class="hd">
  <div class="logo">NFS<span>e</span><small>Nota Fiscal de<br>Serviço Eletrônica</small></div>
  <div class="meio">DANFSe v2.0<br>Documento Auxiliar da NFS-e</div>
  <div class="dir">Município:${esc(p.municipio)} - ${esc(p.uf)}<small>Ambiente Gerador:1</small><small>Tipo de Ambiente:${tipoAmb}</small></div>
</div>
<div class="topo">
  <div class="dados">
    <div class="c span3"><div class="l">CHAVE DE ACESSO DA NFS-E</div><div class="v">${ou(d.chave)}</div></div>
    ${c('NÚMERO DA NFS-E', ou(d.numero))}${c('COMPETÊNCIA DA NFS-E', dataBr(d.competencia))}${c('DATA E HORA DA EMISSÃO DA NFS-E', dataHoraBr(d.dataGeracao))}
    ${c('NÚMERO DA DPS', ou(d.numeroDps))}${c('SÉRIE DA DPS', ou(d.serieDps))}${c('DATA E HORA DA EMISSÃO DA DPS', dataHoraBr(d.dataEmissaoDps))}
    ${c('EMITENTE DA NFS-E', 'Prestador')}${c('SITUAÇÃO DA NFS-E', d.numero ? 'NFS-e gerada' : '-')}${c('FINALIDADE', 'NFS-e regular')}
  </div>
  <div class="qrbox">${qr}A autenticidade desta NFS-e pode ser verificada pela leitura deste código QR ou pela consulta da chave de acesso no portal nacional da NFS-e</div>
</div>
<div class="sec">
  <div class="c"><div class="l h">PRESTADOR / FORNECEDOR</div></div>${c('CNPJ / CPF / NIF', esc(docFmt(p.doc)))}${c('Indicador Municipal (Inscrição)', ou(p.im))}${c('Telefone', esc(foneFmt(p.fone)) || '-')}
  <div class="c span2"><div class="l">Nome / Nome Empresarial</div><div class="v">${esc(p.nome)}</div></div>${c('Município / Sigla UF', munUf(p.municipio, p.uf))}${c('Código IBGE / CEP', ibgeCep(p.codMun, p.cep))}
  <div class="c span2"><div class="l">Endereço</div><div class="v">${ou(p.endereco)}</div></div><div class="c span2"><div class="l">E-mail</div><div class="v">${ou(p.email)}</div></div>
  ${c('Simples Nacional na Data de Competência', p.simples ? 'Optante - Microempresa ou Empresa de ...' : 'Não Optante')}<div class="c span3"><div class="l">Regime de Apuração Tributária pelo SN</div><div class="v">${p.simples ? REGIME_SN : '-'}</div></div>
</div>
<div class="sec">
  <div class="c"><div class="l h">TOMADOR / ADQUIRENTE</div></div>${c('CNPJ / CPF / NIF', esc(docFmt(t.doc)))}${c('Indicador Municipal (Inscrição)', ou(t.im))}${c('Telefone', esc(foneFmt(t.fone)) || '-')}
  <div class="c span2"><div class="l">Nome / Nome Empresarial</div><div class="v">${esc(t.nome)}</div></div>${c('Município / Sigla UF', munUf(t.municipio, t.uf))}${c('Código IBGE / CEP', ibgeCep(t.codMun, t.cep))}
  <div class="c span2"><div class="l">Endereço</div><div class="v">${ou(t.endereco)}</div></div><div class="c span2"><div class="l">E-mail</div><div class="v">${ou(t.email)}</div></div>
</div>
<div class="faixa">O DESTINATÁRIO É O PRÓPRIO TOMADOR/ADQUIRENTE DA OPERAÇÃO</div>
<div class="faixa">INTERMEDIÁRO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-E</div>
<div class="sec">
  <div class="c"><div class="l h">SERVIÇO PRESTADO</div></div>${c('Código de Tributação Nacional / Municipal', esc(s.codTribNacional))}${c('Código da NBS', ou(s.nbs))}${c('Local da Prestação / Sigla UF / País', `${esc(s.localPrestacao.replace(' - ', ' / '))} / -`)}
  <div class="v desc">${ou(s.descTribNac, '')}</div>
  <div class="c desc"><div class="l">Descrição do Serviço</div><div class="v">${esc(s.descricao)}</div></div>
</div>
<div class="sec">
  <div class="c"><div class="l h">TRIBUTAÇÃO MUNICIPAL (ISSQN)</div></div>${c('Tipo de Tributação do ISSQN', 'Operação tributável')}<div class="c span2"><div class="l">Município / Sigla UF / País de Incidência do ISSQN</div><div class="v">${esc(i.municipioIncidencia.replace(' - ', ' / '))} / -</div></div>
  ${c('Regime Especial de Tributação do ISSQN', 'Nenhum')}${c('Tipo de Imunidade do ISSQN', '-')}${c('Suspensão da Exigibilidade do ISSQN', '-')}${c('Número Processo Suspensão', '-')}
  ${c('BC ISSQN', brl(i.base))}${c('Alíquota Aplicada', pct(i.aliquota))}${c('Retenção do ISSQN', i.retido ? 'Retido pelo Tomador' : 'Não Retido')}${c('ISSQN Apurado', brl(i.valor))}
</div>
<div class="sec">
  <div class="c"><div class="l h">TRIBUTAÇÃO FEDERAL (EXCETO CBS)</div></div>${c('IRRF', '-')}${c('Contribuição Previdenciária – Retida', '-')}${c('Contribuições Sociais – Retidas', '-')}
  ${c('PIS – Débito Apuração Própria', '-')}${c('COFINS – Débito Apuração Própria', '-')}<div class="c span2"><div class="l">Descrição Contrib. Sociais – Retidas</div><div class="v">PIS/COFINS/CSLL Não Retidos</div></div>
</div>
<div class="sec">
  <div class="c"><div class="l h">TRIBUTAÇÃO IBS / CBS${b.estimado ? ' (PRÉVIA)' : ''}</div></div>${c('CST / cClassTrib', `${esc(b.cst)} / ${esc(b.cClassTrib)}`)}<div class="c span2"><div class="l">Indicador de Operação / Código IBGE Incidência / Município Incidência / Sigla UF</div><div class="v">${esc(b.cIndOp)} / ${ou(b.codMunIncid)} / ${esc(b.municipioIncidencia.replace(' - ', ' / '))}</div></div>
  ${c('Exclusões e Reduções da Base de Cálculo', brl(Math.round((d.valores.vServ - b.base) * 100) / 100))}${c('Base de Cálculo Após Exclusões e Reduções', brl(b.base))}${c('Red. Alíquota IBS / Red. Alíquota CBS', `${red(b.pRedUF)}/${red(b.pRedMun)}/${red(b.pRedCBS)}`)}${c('Alíquota – IBS UF / IBS MUN', `${pct(b.pIBSUF)} / ${pct(b.pIBSMun)}`)}
  ${c('Aliq. Efetiva Municipal – IBS', pct(b.pEfetMun))}${c('Valor Apurado Municipal – IBS', brl(b.vIBSMun))}${c('Aliq. Efetiva Estadual – IBS', pct(b.pEfetUF))}${c('Valor Apurado Estadual – IBS', brl(b.vIBSUF))}
  ${c('Valor Total Apurado – IBS', brl(b.vIBSTot))}${c('Alíquota – CBS', pct(b.pCBS))}${c('Alíquota Efetiva – CBS', pct(b.pEfetCBS))}${c('Valor Total Apuração – CBS', brl(b.vCBS))}
</div>
<div class="sec">
  <div class="c"><div class="l h">VALOR TOTAL DA NFS-E</div></div>${c('VALOR DA OPERAÇÃO / SERVIÇO', brl(d.valores.vServ))}${c('Desconto Incondicionado', '-')}${c('Desconto Condicionado', '-')}
  ${c('Total das Retenções (ISSQN / Federais)', d.valores.totalRetencao ? brl(d.valores.totalRetencao) : '-')}${c('VALOR LÍQUIDO DA NFS-e', brl(d.valores.vLiq))}${c('Total do IBS/CBS', brl(Math.round((b.vCBS + b.vIBSTot) * 100) / 100))}<div class="c hl"><div class="l">VALOR LÍQUIDO DA NFS-e + IBS/CBS</div><div class="v">${brl(d.valores.vTotNF)}</div></div>
</div>
<div class="faixa" style="text-align:left;padding-left:6px">INFORMAÇÕES COMPLEMENTARES</div>
<div class="info">${info}${p.uf === 'DF' ? ' PROCON: TEL 151 SETOR COMERCIAL SUL, QUADRA 8, BLOCO B60, SALA 240 BRASILIA DF' : ''}</div>
<div class="rod">Documento auxiliar gerado a partir do XML autorizado da NFS-e. Confira pela chave de acesso em www.nfse.gov.br/consultapublica</div>
</div></body></html>`;
}

/** "NFSe-82-GDF.pdf" / "NFSe-82-DANFSe.pdf" (sem número: "previa"). */
export function nomeArquivoPdf(d: Pick<DadosNotaPdf, 'numero'>, modelo: 'gdf' | 'nacional'): string {
  const n = String(d.numero ?? 'previa').replace(/[^\w.-]/g, '_');
  return `NFSe-${n}-${modelo === 'gdf' ? 'GDF' : 'DANFSe'}.pdf`;
}
