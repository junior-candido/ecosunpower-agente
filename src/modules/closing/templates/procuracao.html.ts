// src/modules/closing/templates/procuracao.html.ts
// Renderiza HTML da procuração específica pra concessionária.
// Outorgante = SEMPRE titular_uc (quem é titular da conta de luz).
// Outorgado = EcoSunPower Energia Solar LTDA (Junior CREA/CFT).
//
// Base: tmp/procuracao-camila.pdf + spec contratos.md.

import type { DadosFechamento, PessoaFisica, PessoaJuridica } from '../types.js';

const OUTORGADO = {
  razao_social: 'ECOSUNPOWER ENERGIA SOLAR LTDA',
  cnpj: '33.020.459/0001-06',
  endereco: 'SHA Conjunto 01 Chácara 44C Lote 6, Arniqueira, Brasília-DF, CEP 71993-150',
  representante_nome: 'ANTONIO CANDIDO RODRIGUES JUNIOR',
  representante_cpf: '989.404.571-53',
  representante_rg: '2.202.520 SSP-DF',
  representante_crea: '98940457153',
  representante_titulo: 'Responsável Técnico',
};

function fmtPF(p: PessoaFisica): string {
  const estadoCivil = p.estado_civil ? `${p.estado_civil}, ` : '';
  const profissao = p.profissao ? `${p.profissao}, ` : '';
  const enderecoStr = `${p.endereco.rua}, ${p.endereco.numero}${p.endereco.complemento ? ', ' + p.endereco.complemento : ''}, ${p.endereco.bairro}, ${p.endereco.cidade}-${p.endereco.uf}, CEP ${p.endereco.cep}`;
  return `${p.nome}, ${p.nacionalidade}, ${estadoCivil}${profissao}inscrito(a) no CPF/MF sob o nº ${p.cpf}, RG nº ${p.rg} ${p.orgao_emissor_rg}, residente e domiciliado(a) no endereço ${enderecoStr}`;
}

function fmtPJ(p: PessoaJuridica): string {
  return `${p.razao_social}, pessoa jurídica inscrita no CNPJ sob o nº ${p.cnpj}, com sede em ${p.endereco.rua}, ${p.endereco.numero}, ${p.endereco.bairro}, ${p.endereco.cidade}-${p.endereco.uf}, CEP ${p.endereco.cep}, neste ato representada por ${fmtPF(p.representante)}`;
}

function fmtPessoa(p: PessoaFisica | PessoaJuridica): string {
  return p.tipo === 'PJ' ? fmtPJ(p) : fmtPF(p);
}

function hojeFormatado(): string {
  const d = new Date();
  const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

export function renderProcuracao(dados: DadosFechamento): string {
  const outorgante = fmtPessoa(dados.titular_uc);
  const cidade = dados.titular_uc.endereco.cidade;
  const uf = dados.titular_uc.endereco.uf;
  const data = hojeFormatado();
  const uc = dados.uc_numero ?? '(a confirmar)';
  const concessionaria = dados.concessionaria;
  const enderecoInstalacao = `${dados.endereco_instalacao.rua}, ${dados.endereco_instalacao.numero}, ${dados.endereco_instalacao.bairro}, ${dados.endereco_instalacao.cidade}-${dados.endereco_instalacao.uf}`;
  const tituloNomeTitular = dados.titular_uc.tipo === 'PF' ? dados.titular_uc.nome : dados.titular_uc.razao_social;
  const cpfCnpjTitular = dados.titular_uc.tipo === 'PF' ? dados.titular_uc.cpf : dados.titular_uc.cnpj;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Procuração ${tituloNomeTitular} - EcoSunPower</title>
<style>
  @page { size: A4; margin: 2cm 2.2cm; }
  body { font-family: 'Calibri', 'Arial', sans-serif; font-size: 11pt; color: #1a1a1a; line-height: 1.6; }
  h1 { text-align: center; font-size: 14pt; color: #0c4a6e; margin-bottom: 24pt; }
  h2 { font-size: 12pt; color: #0c4a6e; margin-top: 16pt; margin-bottom: 8pt; }
  p { text-align: justify; margin: 10pt 0; }
  strong { color: #0c4a6e; }
  .assinatura { margin-top: 48pt; }
  .assinatura .linha { border-bottom: 1px solid #1a1a1a; width: 60%; margin: 36pt 0 6pt; }
  .local-data { margin-top: 36pt; text-align: right; }
</style>
</head>
<body>

<h1>INSTRUMENTO PARTICULAR DE PROCURAÇÃO</h1>

<h2>OUTORGANTE</h2>
<p>${outorgante}, doravante denominado(a) <strong>OUTORGANTE</strong>.</p>

<h2>OUTORGADA</h2>
<p><strong>${OUTORGADO.razao_social}</strong>, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${OUTORGADO.cnpj}, com sede na ${OUTORGADO.endereco}, neste ato representada por <strong>${OUTORGADO.representante_nome}</strong>, brasileiro, ${OUTORGADO.representante_titulo}, portador do CPF nº ${OUTORGADO.representante_cpf}, RG nº ${OUTORGADO.representante_rg}, registrado no CREA/CFT sob o nº ${OUTORGADO.representante_crea}, doravante denominada <strong>OUTORGADA</strong>.</p>

<h2>DOS PODERES</h2>
<p>Pelo presente instrumento, a OUTORGANTE nomeia e constitui sua bastante procuradora a OUTORGADA, conferindo-lhe os mais amplos poderes para representá-la perante a concessionária <strong>${concessionaria}</strong>, junto à Unidade Consumidora nº <strong>${uc}</strong>, instalada no endereço ${enderecoInstalacao}, podendo praticar todos os atos necessários à:</p>
<p>a) Solicitação de acesso, parecer técnico e aprovação de projeto de microgeração/minigeração distribuída fotovoltaica;</p>
<p>b) Protocolização e acompanhamento dos pedidos de vistoria, troca de medidor e ativação do sistema de geração distribuída;</p>
<p>c) Assinatura de Contrato de Adesão / Termo de Conexão / Termo de Compromisso e demais documentos exigidos pela concessionária;</p>
<p>d) Apresentação e retirada de documentos, requerimentos, declarações e demais instrumentos relacionados ao processo de homologação;</p>
<p>e) Representação junto a órgãos reguladores (ANEEL) quando necessário, no que se refere ao processo em questão.</p>

<h2>DA VALIDADE</h2>
<p>A presente procuração é outorgada com prazo de validade de <strong>180 (cento e oitenta) dias</strong>, contados da data de sua assinatura, podendo ser revogada a qualquer tempo mediante comunicação por escrito.</p>

<div class="local-data">
<p>${cidade}-${uf}, ${data}.</p>
</div>

<div class="assinatura">
<div class="linha"></div>
<p><strong>${tituloNomeTitular}</strong><br/>
OUTORGANTE — CPF/CNPJ ${cpfCnpjTitular}</p>
</div>

</body>
</html>`;
}
