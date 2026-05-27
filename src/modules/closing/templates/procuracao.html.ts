// src/modules/closing/templates/procuracao.html.ts
// Modelo simples 1 pagina A4 validado em 27/05/2026 (caso Fernanda).
// Veja docs/superpowers/specs/2026-05-27-eva-procuracao-contrato-rapidos-design.md
//
// Outorgante = SEMPRE titular_uc (quem e titular da conta de luz).
// Outorgado = ANTONIO CANDIDO RODRIGUES JUNIOR (PF, Responsavel Tecnico CREA/CFT)
//             atuando em nome da ECOSUNPOWER ENERGIA SOLAR LTDA (PJ).

import type { DadosFechamento, PessoaFisica, PessoaJuridica } from '../types.js';

const OUTORGADO = {
  nome: 'ANTONIO CANDIDO RODRIGUES JUNIOR',
  cpf: '989.404.571-53',
  rg: '2.202.520 SSP-DF',
  crea: '98940457153',
  titulo: 'Responsável Técnico CREA/CFT',
  empresa_razao_social: 'ECOSUNPOWER ENERGIA SOLAR LTDA',
  empresa_cnpj: '33.020.459/0001-06',
  empresa_endereco: 'Brasilia-DF',
};

const RODAPE_EMAIL = 'junior@ecosunpower.eng.br';

function enderecoStr(e: { rua: string; numero: string; complemento?: string; bairro: string; cidade: string; uf: string; cep: string }): string {
  const comp = e.complemento ? `, ${e.complemento}` : '';
  return `${e.rua}, ${e.numero}${comp}, ${e.bairro}, ${e.cidade}-${e.uf}, CEP ${e.cep}`;
}

function descreveTitular(p: PessoaFisica | PessoaJuridica): { nomeMaiusculo: string; descricaoCompleta: string; cpfCnpj: string; rgInfo: string } {
  if (p.tipo === 'PJ') {
    const r = p.representante;
    return {
      nomeMaiusculo: p.razao_social.toUpperCase(),
      descricaoCompleta: `<b>${p.razao_social.toUpperCase()}</b>, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${p.cnpj}, com sede na ${enderecoStr(p.endereco)}, neste ato representada por <b>${r.nome.toUpperCase()}</b>, ${r.nacionalidade ?? 'brasileiro(a)'}, portador do RG nº ${r.rg} ${r.orgao_emissor_rg}, inscrito no CPF/MF sob o nº ${r.cpf}`,
      cpfCnpj: p.cnpj,
      rgInfo: `${r.rg} ${r.orgao_emissor_rg}`,
    };
  }
  const partes: string[] = [];
  partes.push(`<b>${p.nome.toUpperCase()}</b>`);
  partes.push(p.nacionalidade ?? 'brasileiro(a)');
  if (p.estado_civil) partes.push(p.estado_civil);
  if (p.profissao) partes.push(p.profissao);
  partes.push(`portador(a) do RG nº ${p.rg} ${p.orgao_emissor_rg}`);
  partes.push(`inscrito(a) no CPF/MF sob o nº ${p.cpf}`);
  partes.push(`residente e domiciliado(a) na ${enderecoStr(p.endereco)}`);
  return {
    nomeMaiusculo: p.nome.toUpperCase(),
    descricaoCompleta: partes.join(', '),
    cpfCnpj: p.cpf,
    rgInfo: `${p.rg} ${p.orgao_emissor_rg}`,
  };
}

function hojeFormatado(): string {
  const d = new Date();
  const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

export function renderProcuracao(dados: DadosFechamento): string {
  const titular = descreveTitular(dados.titular_uc);
  const uc = (dados.uc_numero && dados.uc_numero.trim()) ? dados.uc_numero : '(a confirmar)';
  const concessionariaNome = dados.concessionaria === 'Neoenergia-DF'
    ? 'NEOENERGIA DISTRIBUIÇÃO BRASÍLIA S.A.'
    : 'EQUATORIAL ENERGIA GOIÁS S.A.';
  const cidade = dados.titular_uc.endereco.cidade;
  const uf = dados.titular_uc.endereco.uf;
  const data = hojeFormatado();

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Procuração ${titular.nomeMaiusculo}</title>
<style>
  @page { size: A4; margin: 18mm 20mm; }
  body { font-family: 'Times New Roman', Georgia, serif; font-size: 11.5pt; line-height: 1.45; color: #111; }
  .page { max-width: 170mm; margin: 0 auto; }
  header { text-align: center; margin-bottom: 14pt; border-bottom: 1.5pt solid #1b3a52; padding-bottom: 8pt; }
  header .marca { font-family: Arial, sans-serif; font-size: 13pt; font-weight: 700; color: #1b3a52; letter-spacing: 0.5pt; }
  header .sub { font-family: Arial, sans-serif; font-size: 8.5pt; color: #555; margin-top: 2pt; }
  h1 { text-align: center; font-size: 14pt; margin: 10pt 0 14pt; letter-spacing: 2pt; }
  p { margin: 0 0 8pt; text-align: justify; }
  ul.poderes { margin: 4pt 0 10pt 18pt; }
  ul.poderes li { margin-bottom: 3pt; text-align: justify; }
  .data { margin-top: 22pt; text-align: right; }
  .assinatura { margin-top: 34pt; text-align: center; }
  .assinatura .linha { width: 70%; margin: 0 auto; border-top: 1pt solid #111; padding-top: 4pt; font-size: 10pt; }
  .assinatura .nome { font-weight: 700; text-transform: uppercase; font-size: 10.5pt; }
  footer { margin-top: 18pt; text-align: center; font-family: Arial, sans-serif; font-size: 8pt; color: #888; border-top: 0.5pt solid #ddd; padding-top: 6pt; }
</style>
</head>
<body>
<div class="page">
  <header>
    <div class="marca">${OUTORGADO.empresa_razao_social.replace(/ LTDA$/, '')}</div>
    <div class="sub">CNPJ ${OUTORGADO.empresa_cnpj} &middot; ${OUTORGADO.empresa_endereco} &middot; ecosunpower.eng.br</div>
  </header>

  <h1>PROCURAÇÃO PARTICULAR</h1>

  <p><b>OUTORGANTE:</b> ${titular.descricaoCompleta}.</p>

  <p><b>OUTORGADO:</b> <b>${OUTORGADO.nome}</b>, brasileiro, ${OUTORGADO.titulo} nº ${OUTORGADO.crea}, portador do RG nº ${OUTORGADO.rg}, inscrito no CPF/MF sob o nº ${OUTORGADO.cpf}, atuando em nome da empresa <b>${OUTORGADO.empresa_razao_social}</b>, CNPJ ${OUTORGADO.empresa_cnpj}, com sede em ${OUTORGADO.empresa_endereco}.</p>

  <p><b>PODERES:</b> Pelo presente instrumento particular de mandato, a OUTORGANTE nomeia e constitui o OUTORGADO seu bastante procurador, conferindo-lhe poderes especiais para representá-la perante a <b>${concessionariaNome}</b>, referente à Unidade Consumidora nº <b>${uc}</b>, com a finalidade de tratar do projeto de microgeração distribuída de energia solar fotovoltaica, podendo:</p>

  <ul class="poderes">
    <li>protocolar, acompanhar e retirar o pedido de acesso à microgeração distribuída, bem como solicitar parecer de acesso e contrato de adesão;</li>
    <li>assinar formulários, declarações, ART/TRT, projeto elétrico, memorial descritivo e demais documentos técnicos exigidos pela concessionária;</li>
    <li>solicitar vistoria técnica, inspeção, troca/adequação do medidor bidirecional e ligação do sistema;</li>
    <li>requerer 2ª via de faturas, histórico de consumo, dados cadastrais e demais informações relativas à UC;</li>
    <li>receber notificações, comunicados, intimações e correspondências relacionados ao processo de homologação;</li>
    <li>praticar todos os demais atos necessários ao bom e fiel cumprimento do presente mandato.</li>
  </ul>

  <p><b>PRAZO:</b> A presente procuração tem validade de <b>12 (doze) meses</b> contados da data de sua assinatura, podendo ser revogada a qualquer tempo mediante comunicação por escrito ao OUTORGADO.</p>

  <div class="data">${cidade}-${uf}, ${data}.</div>

  <div class="assinatura">
    <div class="linha">
      <div class="nome">${titular.nomeMaiusculo}</div>
      <div>CPF ${titular.cpfCnpj} &middot; RG ${titular.rgInfo}</div>
    </div>
  </div>

  <footer>
    ${OUTORGADO.empresa_razao_social} &middot; CNPJ ${OUTORGADO.empresa_cnpj} &middot; ${RODAPE_EMAIL}
  </footer>
</div>
</body>
</html>`;
}
