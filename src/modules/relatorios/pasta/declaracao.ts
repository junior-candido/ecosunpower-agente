// src/modules/relatorios/pasta/declaracao.ts
//
// DECLARAÇÃO DE EXECUÇÃO — o atestado que o cliente assina depois da entrega.
//
// Junior, 10/09/2026: "vamos implementar esse atestado, que vou pedir para
// assinarem após a troca do medidor" · "vamos fazer isso virar rotina mesmo".
//
// POR QUE EXISTE
// Pra entrar em licitação grande pedem ATESTADO DE CAPACIDADE TÉCNICA
// acompanhado da ART/TRT. A TRT sempre existe — é obrigatória pra homologar.
// O que falta é a declaração do CLIENTE. E ela só se consegue no calor da
// entrega: dois anos depois, com contato frio, ninguém assina. Foi o que
// faltou pra participar do CG 026/2026 da Rede SARAH (usina de 145 kWp), que
// exigia 3 atestados de usinas ≥ 70 kWp.
//
// 🚨 A REGRA QUE FAZ O CLIENTE ASSINAR
// O texto é DECLARATÓRIO PURO: constata um fato passado e NÃO cria obrigação
// nenhuma — sem valor, sem prazo, sem quitação, sem renúncia. O Sebastião é
// advogado e recusou assinar o contrato ("confia e deixa essa bexiga de lado");
// um documento que não o obriga a nada ele assina numa boa.
// Há teste que quebra o build se alguém acrescentar cláusula de obrigação aqui.
//
// LAYOUT: fluxo natural, sem altura fixa — as margens vêm do
// `renderHtmlToPdf` (closing-render.ts), que é quem gera o PDF.

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

export interface DadosDeclaracao {
  // quem declara
  cliente: string;
  /** "brasileiro, advogado inscrito na OAB/DF nº ..." — opcional. */
  qualificacao?: string;
  cpf: string;
  endereco: string;
  // quem executou
  empresaRazao: string;
  empresaCnpj: string;
  rtNome: string;
  rtRegistro: string;
  // a obra
  potenciaKwp: number;
  modulos: string;
  inversores: string;
  uc?: string;
  distribuidora?: string;
  padraoEntrada?: string;
  /** ISO yyyy-mm-dd */
  conclusaoEm: string;
  parecer?: string;
  /** ISO yyyy-mm-dd */
  parecerEm?: string;
  trt: string;
  cidade: string;
  logoDataUri?: string;
}

export function escapar(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** 2026-08-31 → "31 de agosto de 2026". Data ruim volta como veio. */
export function dataPorExtenso(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso ?? '').trim());
  if (!m) return String(iso ?? '');
  const [, a, mes, d] = m;
  const nome = MESES[Number(mes) - 1];
  if (!nome) return iso;
  return `${Number(d)} de ${nome} de ${a}`;
}

/** 5.68 → "5,68" · 100 → "100". Aqui se escreve com vírgula. */
export function numeroBr(n: number): string {
  if (!Number.isFinite(n)) return '';
  const s = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return s.replace('.', ',');
}

const OBRIGATORIOS: Array<[keyof DadosDeclaracao, string]> = [
  ['cliente', 'nome do cliente'],
  ['cpf', 'CPF'],
  ['endereco', 'endereço'],
  ['potenciaKwp', 'potência'],
  ['modulos', 'módulos'],
  ['inversores', 'inversores'],
  ['trt', 'TRT'],
  ['conclusaoEm', 'data de conclusão'],
  ['cidade', 'cidade'],
];

/** O que ainda falta pra o documento não sair capenga. */
export function camposFaltando(d: Partial<DadosDeclaracao>): string[] {
  return OBRIGATORIOS
    .filter(([k]) => {
      const v = d[k];
      return typeof v === 'number' ? !v : !String(v ?? '').trim();
    })
    .map(([, rotulo]) => rotulo);
}

function linha(rotulo: string, valor?: string | null): string {
  const v = String(valor ?? '').trim();
  if (!v) return '';
  return `<tr><td class="rot">${escapar(rotulo)}</td><td class="val">${escapar(v)}</td></tr>`;
}

export function montarDeclaracaoHtml(d: DadosDeclaracao): string {
  const homolog = d.parecer
    ? `Parecer de acesso nº ${d.parecer}` +
      (d.parecerEm ? `, aprovado em ${dataPorExtenso(d.parecerEm)}` : '') +
      ' — medidor bidirecional instalado'
    : '';
  const unidade = d.uc
    ? `UC ${d.uc}` + (d.distribuidora ? ` — ${d.distribuidora}` : '')
    : '';

  const tabela = [
    linha('Potência instalada', `${numeroBr(d.potenciaKwp)} kWp`),
    linha('Módulos', d.modulos),
    linha('Inversores', d.inversores),
    linha('Unidade consumidora', unidade),
    linha('Padrão de entrada', d.padraoEntrada),
    linha('Conclusão da obra', dataPorExtenso(d.conclusaoEm)),
    linha('Homologação', homolog),
    linha('Responsabilidade técnica', `TRT nº ${d.trt}`),
  ].join('');

  const logo = d.logoDataUri
    ? `<div class="topo"><img src="${escapar(d.logoDataUri)}" alt=""></div>`
    : '<div class="topo semlogo"></div>';

  const qualif = d.qualificacao?.trim() ? `${escapar(d.qualificacao)}, ` : '';

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a;
         font-size: 11pt; line-height: 1.55; margin: 0; }
  .topo { text-align: center; border-bottom: 1.5pt solid #0b1220; padding-bottom: 5mm; }
  .topo img { width: 68mm; height: auto; }
  .topo.semlogo { padding-bottom: 2mm; }
  h1 { font-size: 14pt; letter-spacing: .09em; text-align: center;
       margin: 9mm 0 7mm; font-weight: bold; }
  p { margin: 0 0 4.5mm; text-align: justify; }
  .nome { font-weight: bold; }
  table { width: 100%; border-collapse: collapse; margin: 5mm 0 6mm;
          font-family: Arial, Helvetica, sans-serif; font-size: 10pt; }
  td { padding: 2mm 3mm; border-bottom: .5pt solid #d8dde4; vertical-align: top; }
  .rot { width: 42mm; color: #5b6878; }
  .val { font-weight: bold; }
  .local { margin-top: 8mm; }
  .ass { margin-top: 18mm; text-align: center; }
  .linha { border-top: .8pt solid #1a1a1a; width: 95mm; margin: 0 auto 2.5mm; }
  .ass .n { font-weight: bold; }
  .ass .d { font-size: 9.5pt; color: #5b6878; font-family: Arial, sans-serif; }
  .rodape { margin-top: 14mm; border-top: .5pt solid #d8dde4; padding-top: 3mm;
            font-family: Arial, Helvetica, sans-serif; font-size: 8pt;
            color: #7a8697; text-align: center; }
</style></head><body>

${logo}

<h1>DECLARAÇÃO DE EXECUÇÃO DE SERVIÇO</h1>

<p>Eu, <span class="nome">${escapar(d.cliente)}</span>, ${qualif}portador(a) do CPF
nº ${escapar(d.cpf)}, residente e domiciliado(a) à ${escapar(d.endereco)},
<strong>DECLARO</strong>, para os devidos fins de comprovação de capacidade técnica,
que a empresa <span class="nome">${escapar(d.empresaRazao)}</span>, inscrita no CNPJ
sob o nº ${escapar(d.empresaCnpj)}, executou em meu imóvel os serviços de
<strong>elaboração de projeto, fornecimento e instalação de sistema de geração
fotovoltaica conectado à rede</strong>, conforme especificações abaixo:</p>

<table>${tabela}</table>

<p>Declaro, ainda, que os serviços foram <strong>executados a contento</strong>, dentro
das normas técnicas aplicáveis, e que o sistema encontra-se em pleno funcionamento,
nada havendo que desabone a conduta técnica ou comercial da referida empresa.</p>

<p class="local">${escapar(d.cidade)}, ____ de _______________ de ______.</p>

<div class="ass">
  <div class="linha"></div>
  <div class="n">${escapar(d.cliente)}</div>
  <div class="d">CPF ${escapar(d.cpf)}</div>
</div>

<div class="rodape">
  ${escapar(d.empresaRazao)} · CNPJ ${escapar(d.empresaCnpj)} · Responsável Técnico
  ${escapar(d.rtNome)} — ${escapar(d.rtRegistro)}
</div>

</body></html>`;
}
