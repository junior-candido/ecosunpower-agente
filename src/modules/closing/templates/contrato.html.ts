// src/modules/closing/templates/contrato.html.ts
// Renderiza HTML do contrato de prestação de serviços.
// CONTRATANTE = dados.contratante (pode ser ≠ titular_uc no caso de cônjuge negociou).
// Quando contratante_eh_titular === false, adiciona caixa de observação no topo
// citando relação com a titular.
//
// Base: tmp/contrato-camila.html

import type { DadosFechamento, PessoaFisica, PessoaJuridica } from '../types.js';
import { empresa } from '../../empresa-config.js';

// [ECOSOF] Dados da CONTRATADA vêm da empresa_config. Função (não const de
// módulo) pra ler empresa() em RUNTIME — /recarregar-config vale sem restart.
// Com o seed EcoSun, o contrato sai idêntico ao hardcode antigo.
function contratada() {
  const e = empresa();
  return {
    razao_social: e.razaoSocial,
    cnpj: e.cnpj,
    endereco: `${e.endereco}, ${e.cidade}-${e.uf}${e.cep ? `, CEP ${e.cep}` : ''}`,
    representante_nome: e.rtNome,
    // rtTitulo já inclui o registro ("Responsável Técnico CREA/CFT") — por isso
    // a assinatura abaixo NÃO repete "CREA/CFT" como o template antigo fazia.
    representante_titulo: e.rtTitulo,
    representante_cpf: e.rtCpf ?? '',
    representante_rg: e.rtRg ?? '',
    representante_crea: e.rtRegistro ?? '',
  };
}

const OBS_TEMPLATES: Record<string, (titular: string) => string> = {
  conjuge: (titular) => `A negociação comercial foi conduzida com o cônjuge da titular da UC, Sr(a). ${titular}, sem responsabilidade contratual direta do(a) titular.`,
  socio: (titular) => `A CONTRATANTE é sócia/relacionada à pessoa jurídica titular da UC ${titular}.`,
  familiar: (titular) => `A CONTRATANTE é familiar do(a) titular da UC ${titular}, atuando como financiadora do empreendimento.`,
  financiador: (titular) => `A CONTRATANTE figura no contrato como financiadora do sistema instalado em UC de titularidade de ${titular}.`,
  outro: (titular) => `A CONTRATANTE assume integralmente a responsabilidade comercial. Titular da UC: ${titular}.`,
};

// Aceita Partial<DadosFechamento> porque é chamada também pelo assistant antes
// dos dados estarem completos. Retorna undefined se faltar info pra montar.
export function buildObservacaoPartes(dados: Partial<DadosFechamento>): string | undefined {
  if (dados.contratante_eh_titular) return undefined;
  if (!dados.relacao_contratante) return undefined;
  if (!dados.titular_uc) return undefined;
  const titularNome = dados.titular_uc.tipo === 'PF' ? dados.titular_uc.nome : dados.titular_uc.razao_social;
  const fn = OBS_TEMPLATES[dados.relacao_contratante];
  return fn ? fn(titularNome) : undefined;
}

function fmtPF(p: PessoaFisica): string {
  const estadoCivil = p.estado_civil ? `${p.estado_civil}, ` : '';
  const profissao = p.profissao ? `${p.profissao}, ` : '';
  const nasc = p.data_nascimento ? `nascido(a) em ${formatDateBR(p.data_nascimento)}, ` : '';
  const enderecoStr = `${p.endereco.rua}, ${p.endereco.numero}${p.endereco.complemento ? ', ' + p.endereco.complemento : ''}, ${p.endereco.bairro}, ${p.endereco.cidade}-${p.endereco.uf}, CEP ${p.endereco.cep}`;
  return `<strong>${p.nome}</strong>, ${p.nacionalidade}, ${estadoCivil}${profissao}${nasc}inscrito(a) no CPF/MF sob o nº ${p.cpf}, RG nº ${p.rg} ${p.orgao_emissor_rg}, residente e domiciliado(a) na ${enderecoStr}, e-mail ${p.email}, telefone ${p.telefone}`;
}

function fmtPJ(p: PessoaJuridica): string {
  return `<strong>${p.razao_social}</strong>, pessoa jurídica inscrita no CNPJ sob o nº ${p.cnpj}, com sede em ${p.endereco.rua}, ${p.endereco.numero}, ${p.endereco.bairro}, ${p.endereco.cidade}-${p.endereco.uf}, CEP ${p.endereco.cep}, neste ato representada por ${fmtPF(p.representante)}, e-mail ${p.email}, telefone ${p.telefone}`;
}

function fmtPessoa(p: PessoaFisica | PessoaJuridica): string {
  return p.tipo === 'PJ' ? fmtPJ(p) : fmtPF(p);
}

function formatDateBR(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

function modalidadeLabel(m: DadosFechamento['sistema']['modalidade']): string {
  switch (m) {
    case 'autoconsumo_local': return 'autoconsumo local';
    case 'autoconsumo_remoto': return 'autoconsumo remoto';
    case 'geracao_compartilhada': return 'geração compartilhada';
    default: return 'autoconsumo local';
  }
}

export function renderContrato(dados: DadosFechamento): string {
  const CONTRATADA = contratada();
  const contratante = fmtPessoa(dados.contratante);
  const contratadaStr = `${CONTRATADA.razao_social}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${CONTRATADA.cnpj}, com sede na ${CONTRATADA.endereco}, neste ato representada por ${CONTRATADA.representante_nome}, brasileiro, ${CONTRATADA.representante_titulo}, portador do CPF nº ${CONTRATADA.representante_cpf}, RG nº ${CONTRATADA.representante_rg}, registrado no CREA/CFT sob o nº ${CONTRATADA.representante_crea}`;

  const observacao = buildObservacaoPartes(dados);
  const observacaoHtml = observacao
    ? `<div class="obs-marido"><strong>Observação:</strong> ${observacao}</div>`
    : '';

  const sistema = dados.sistema;
  const cidade = dados.contratante.endereco.cidade;
  const uf = dados.contratante.endereco.uf;
  const data = (() => {
    const d = new Date();
    const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
    return `${cidade}-${uf}, ${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}.`;
  })();

  const disposicoes = dados.disposicoes_especiais
    ? `<h2>CLÁUSULA 23ª — DAS DISPOSIÇÕES ESPECIAIS</h2>
<p>${dados.disposicoes_especiais}</p>`
    : '';

  const nomeContratante = dados.contratante.tipo === 'PF' ? dados.contratante.nome : dados.contratante.razao_social;
  const cpfContratante = dados.contratante.tipo === 'PF' ? dados.contratante.cpf : dados.contratante.cnpj;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Contrato ${nomeContratante} - ${empresa().nomeFantasia}</title>
<style>
  @page { size: A4; margin: 2cm 2.2cm; }
  body { font-family: 'Calibri', 'Arial', sans-serif; font-size: 11pt; color: #1a1a1a; line-height: 1.5; }
  h1 { text-align: center; font-size: 14pt; color: #0c4a6e; margin-bottom: 18pt; line-height: 1.3; }
  h2 { font-size: 12pt; color: #0c4a6e; margin-top: 16pt; margin-bottom: 8pt; border-bottom: 1px solid #cbd5e1; padding-bottom: 3pt; }
  h3 { font-size: 11pt; color: #334155; margin-top: 10pt; margin-bottom: 5pt; }
  p { text-align: justify; margin: 6pt 0; }
  ul, ol { margin: 6pt 0 6pt 20pt; }
  li { margin: 3pt 0; text-align: justify; }
  strong { color: #0c4a6e; }
  hr { border: none; border-top: 1px solid #cbd5e1; margin: 14pt 0; }
  .assinatura { margin-top: 24pt; }
  .assinatura .linha { border-bottom: 1px solid #1a1a1a; width: 60%; margin: 36pt 0 6pt; }
  .obs-marido { background: #fffbeb; border-left: 3px solid #f59e0b; padding: 8pt 12pt; margin: 10pt 0; font-size: 10pt; }
</style>
</head>
<body>

<h1>CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE ENGENHARIA E INSTALAÇÃO DE SISTEMA DE GERAÇÃO FOTOVOLTAICA</h1>

<h2>DAS PARTES</h2>

<p><strong>CONTRATANTE:</strong> ${contratante}.</p>

${observacaoHtml}

<p><strong>CONTRATADA:</strong> ${contratadaStr}.</p>

<p>As partes têm entre si justo e contratado o presente <strong>CONTRATO DE PRESTAÇÃO DE SERVIÇOS</strong>, que se regerá pelas cláusulas e condições a seguir, em conformidade com o Código Civil, o Código de Defesa do Consumidor (Lei 8.078/90), a Lei Geral de Proteção de Dados (Lei 13.709/18), a Resolução Normativa ANEEL nº 1.000/2021 e nº 1.059/2023 e a Lei 14.300/2022 (Marco Legal da Geração Distribuída).</p>

<hr/>

<h2>CLÁUSULA 1ª — DO OBJETO</h2>

<p>1.1. Constitui objeto deste contrato a prestação dos seguintes serviços pela CONTRATADA:</p>
<p>a) <strong>Elaboração de projeto elétrico</strong> de Sistema de Geração Distribuída Fotovoltaica de <strong>${sistema.kwp} kWp</strong>, sob modalidade de <strong>${modalidadeLabel(sistema.modalidade)}</strong>;</p>
<p>b) <strong>Homologação</strong> do projeto junto à concessionária <strong>${dados.concessionaria}</strong> (Unidade Consumidora nº ${dados.uc_numero ?? '(a confirmar)'});</p>
<p>c) <strong>Fornecimento e instalação</strong> dos equipamentos descritos na Cláusula 11ª, no imóvel localizado em ${dados.endereco_instalacao.rua}, ${dados.endereco_instalacao.numero}, ${dados.endereco_instalacao.bairro}, ${dados.endereco_instalacao.cidade}-${dados.endereco_instalacao.uf}, CEP ${dados.endereco_instalacao.cep};</p>
<p>d) <strong>Solicitação de vistoria, religação e ativação do sistema</strong> junto à concessionária, <strong>com acompanhamento até a efetiva troca do medidor</strong>;</p>
<p>e) <strong>Anotação de Responsabilidade Técnica</strong> junto ao CREA/CFT, sob responsabilidade do Sr. ${CONTRATADA.representante_nome}, CREA/CFT nº ${CONTRATADA.representante_crea}.</p>

<p>1.2. <strong>NÃO está incluído</strong> no objeto deste contrato, salvo previsão expressa na Proposta Comercial:</p>
<ul>
<li>Adequação ou substituição do padrão de entrada de energia;</li>
<li>Reforço estrutural do telhado ou cobertura;</li>
<li>Obras civis, alvenaria, pintura ou recomposição de telhado;</li>
<li>Limpeza periódica dos módulos após a instalação;</li>
<li>Manutenção corretiva fora do período de garantia.</li>
</ul>

<hr/>

<h2>CLÁUSULA 2ª — DAS OBRIGAÇÕES DA CONTRATANTE</h2>

<p>2.1. Fornecer à CONTRATADA, no prazo de até <strong>5 (cinco) dias úteis</strong> contados da assinatura deste contrato:</p>
<ul>
<li>Cópia do RG, CPF e comprovante de endereço atualizado;</li>
<li>Cópia da última fatura de energia elétrica;</li>
<li>Procuração específica para que a CONTRATADA represente a CONTRATANTE perante a concessionária ${dados.concessionaria}.</li>
</ul>

<p>2.2. <strong>Garantir o livre acesso</strong> dos técnicos da CONTRATADA ao local da instalação durante todas as etapas (visita técnica, instalação e vistoria).</p>

<p>2.3. <strong>Da adequação estrutural do telhado:</strong> Após a CONTRATADA informar à CONTRATANTE o <strong>peso dos módulos fotovoltaicos</strong> e as <strong>condições de fixação da estrutura sobre o telhado do imóvel</strong>, caso a CONTRATANTE (ou o proprietário do imóvel) entenda que a estrutura existente não suporta a carga adicional, fica de sua exclusiva responsabilidade providenciar a <strong>adequação prévia da estrutura</strong> antes do início da instalação. A CONTRATADA não se responsabiliza por danos decorrentes de estrutura inadequada ou subdimensionada quando previamente informada e não reforçada pela CONTRATANTE.</p>

<p>2.4. <strong>Realizar os pagamentos</strong> nas condições e prazos da Cláusula 9ª.</p>

<p>2.5. <strong>Comunicar imediatamente</strong> qualquer anormalidade no sistema durante o período de garantia.</p>

<hr/>

<h2>CLÁUSULA 3ª — DAS OBRIGAÇÕES DA CONTRATADA</h2>

<p>3.1. Executar os serviços com zelo técnico, observando as normas ABNT NBR 5410, NBR 16690, NBR 16149, NBR 16150 e demais normas aplicáveis.</p>
<p>3.2. Fornecer <strong>equipamentos novos, originais e homologados pelo INMETRO</strong> conforme especificado na Cláusula 11ª.</p>
<p>3.3. Emitir <strong>Anotação de Responsabilidade Técnica</strong> junto ao CREA/CFT.</p>
<p>3.4. Cumprir os prazos da Cláusula 8ª, ressalvadas as hipóteses de força maior previstas na Cláusula 16ª.</p>
<p>3.5. Manter sigilo sobre dados, informações e documentos da CONTRATANTE, mesmo após o término do contrato.</p>
<p>3.6. Disponibilizar <strong>garantia técnica</strong> dos equipamentos e da instalação, conforme Cláusula 12ª.</p>

<hr/>

<h2>CLÁUSULA 4ª — DA VISITA TÉCNICA E PROJETO EXECUTIVO</h2>

<p>4.1. Após a assinatura deste contrato e o recebimento dos documentos do CONTRATANTE (Cláusula 2.1), a CONTRATADA realizará <strong>visita técnica</strong> ao local da instalação para validação final do projeto.</p>
<p>4.2. Caso a visita técnica identifique a necessidade de <strong>adequações não previstas na Proposta Comercial</strong> (troca de padrão, reforço estrutural, obras complementares), a CONTRATADA apresentará à CONTRATANTE orçamento adicional, que somente será executado mediante aceite formal por escrito (incluindo WhatsApp ou e-mail).</p>
<p>4.3. Caso a CONTRATANTE não concorde com as adequações propostas, este contrato poderá ser rescindido sem multa, com devolução dos valores pagos, deduzidos os custos com visita técnica e elaboração de projeto, no valor de até <strong>R$ 1.500,00</strong>.</p>

<hr/>

<h2>CLÁUSULA 5ª — DA HOMOLOGAÇÃO JUNTO À CONCESSIONÁRIA</h2>

<p>5.1. A CONTRATADA submeterá o projeto à concessionária ${dados.concessionaria} no prazo de até <strong>5 (cinco) dias úteis</strong> após a confirmação do pagamento da primeira parcela e o recebimento dos documentos da CONTRATANTE.</p>
<p>5.2. Caso a concessionária <strong>exija ajustes técnicos</strong> no projeto, a CONTRATADA executará as alterações necessárias sem custo adicional para a CONTRATANTE, <strong>exceto</strong> quando a alteração implicar troca de equipamentos por exigência específica da concessionária — caso em que será apresentado orçamento aditivo.</p>

<hr/>

<h2>CLÁUSULA 6ª — DA INSTALAÇÃO, VISTORIA E ACOMPANHAMENTO</h2>

<p>6.1. Aprovado o projeto pela concessionária e entregues os equipamentos no local, a CONTRATADA agendará a instalação no prazo de até <strong>10 (dez) dias úteis</strong>.</p>
<p>6.2. A duração da instalação será de <strong>1 a 3 dias úteis</strong>, salvo intempéries ou caso fortuito.</p>
<p>6.3. Após a instalação, a CONTRATADA solicitará a <strong>vistoria</strong> junto à concessionária. O prazo de realização da vistoria é de responsabilidade exclusiva da ${dados.concessionaria}, normalmente entre <strong>7 (sete) e 30 (trinta) dias</strong>, e não pode ser controlado pela CONTRATADA.</p>
<p>6.4. <strong>A CONTRATADA acompanhará todo o processo junto à concessionária até a efetiva troca do medidor pela ${dados.concessionaria}</strong>, sem custo adicional para a CONTRATANTE.</p>
<p>6.5. Aprovada a vistoria e trocado o medidor, a CONTRATADA realizará a <strong>religação técnica</strong> e o sistema entrará em operação.</p>

<hr/>

<h2>CLÁUSULA 8ª — DOS PRAZOS E CRONOGRAMA</h2>

<p>8.1. <strong>Prazo total estimado:</strong> entre <strong>30 (trinta) e 45 (quarenta e cinco) dias corridos</strong>, contados a partir da confirmação do pagamento da primeira parcela e do recebimento integral dos documentos da CONTRATANTE.</p>
<p>8.2. Cronograma de etapas (estimativa):</p>
<p>a) Processamento do pagamento: até 2 dias úteis;<br/>
b) Despacho do material pelo distribuidor: até 15 dias corridos;<br/>
c) Submissão e aprovação do projeto pela concessionária: 15 a 20 dias corridos (em paralelo ao item "b");<br/>
d) Instalação: 1 a 3 dias úteis;<br/>
e) Vistoria, troca do medidor e religação: depende exclusivamente da concessionária ${dados.concessionaria}.</p>

<hr/>

<h2>CLÁUSULA 9ª — DO PREÇO E CONDIÇÕES DE PAGAMENTO</h2>

<p>9.1. O valor total dos serviços e equipamentos é de <strong>${formatBRL(dados.comercial.valor_total_brl)}</strong>.</p>

<p>9.2. <strong>Forma de pagamento:</strong> ${dados.comercial.forma_pagamento}.</p>

<p>9.3. <strong>Atraso no pagamento</strong> implicará:</p>
<ul>
<li>Multa moratória de <strong>2% (dois por cento)</strong> sobre o valor em atraso;</li>
<li>Juros de mora de <strong>1% (um por cento) ao mês</strong>, pro rata die;</li>
<li>Atualização monetária pelo IPCA;</li>
<li><strong>Suspensão imediata</strong> dos serviços até regularização do débito;</li>
<li>Atrasos superiores a 15 (quinze) dias autorizam a CONTRATADA a rescindir o contrato com retenção de até 30% dos valores já pagos a título de cláusula penal.</li>
</ul>

<hr/>

<h2>CLÁUSULA 11ª — DOS EQUIPAMENTOS</h2>

<h3>Módulos Fotovoltaicos</h3>
<ul>
<li><strong>Fabricante:</strong> ${sistema.modulos.marca}</li>
<li><strong>Potência:</strong> ${sistema.modulos.potencia_w} Wp por módulo</li>
<li><strong>Garantia de defeitos de fabricação:</strong> 12 anos</li>
<li><strong>Garantia de eficiência linear:</strong> 25 anos</li>
<li><strong>Quantidade:</strong> ${sistema.modulos.quantidade} unidades</li>
<li><strong>Potência total instalada:</strong> ${sistema.kwp} kWp</li>
</ul>

<h3>Inversor / Microinversores</h3>
<ul>
<li><strong>Fabricante:</strong> ${sistema.inversor.marca}</li>
<li><strong>Modelo:</strong> ${sistema.inversor.modelo}</li>
<li><strong>Potência:</strong> ${sistema.inversor.potencia_kw} kW</li>
<li><strong>Garantia:</strong> conforme fabricante</li>
</ul>

<h3>Estrutura, proteções e cabeamento</h3>
<p>Inclui toda a estrutura de fixação para telhado, cabos solares, conectores MC4, proteções CC/CA (string box, disjuntores, DPS) e demais materiais necessários à correta instalação e operação do sistema.</p>

<hr/>

<h2>CLÁUSULA 12ª — DAS GARANTIAS</h2>

<p>12.1. <strong>Módulos fotovoltaicos ${sistema.modulos.marca}:</strong> garantia contra defeitos de fabricação e eficiência linear conforme fabricante.</p>
<p>12.2. <strong>Inversor ${sistema.inversor.marca} ${sistema.inversor.modelo}:</strong> garantia conforme fabricante.</p>

<p>12.3. <strong>Mão de obra e instalação — Garantia de 12 (doze) meses</strong> contados da data de emissão do "Termo de Comissionamento", cobrindo especificamente:</p>
<ul>
<li><strong>Defeitos na fiação</strong> realizada pela CONTRATADA;</li>
<li><strong>Curto-circuito por falha de ligação</strong> decorrente de não seguir norma técnica;</li>
<li><strong>Falha em disjuntores</strong> instalados pela CONTRATADA;</li>
<li><strong>Intermediação junto ao fabricante</strong> em caso de problemas com módulos ou inversores nos primeiros 12 meses;</li>
<li><strong>Vazamentos no telhado</strong> decorrentes da instalação dos módulos pela CONTRATADA.</li>
</ul>

<p>12.4. <strong>Estrutura de fixação:</strong> garantia conforme fabricante, mínimo de 5 (cinco) anos.</p>

<p>12.5. <strong>A garantia NÃO cobre:</strong></p>
<ul>
<li>Danos causados por descargas atmosféricas (raios) — recomenda-se contratar seguro próprio;</li>
<li>Vandalismo, furto ou roubo de equipamentos;</li>
<li>Avarias decorrentes de intervenção de terceiros não autorizados pela CONTRATADA;</li>
<li>Limpeza dos módulos (responsabilidade do CONTRATANTE);</li>
<li>Danos por uso indevido (sobrecarga, alteração de configuração);</li>
<li>Caso fortuito ou força maior (granizo, ventos extremos, enchente).</li>
</ul>

<p>12.6. A CONTRATANTE deve <strong>acionar a garantia exclusivamente pela CONTRATADA</strong>, que fará a interface com o fabricante. Acionamento direto ao fabricante pode invalidar a garantia da instalação.</p>

<hr/>

<h2>CLÁUSULA 14ª — DA RESCISÃO</h2>

<p>14.1. <strong>Rescisão por inadimplemento:</strong> o descumprimento de qualquer cláusula contratual por qualquer das partes ensejará a rescisão imediata, observado o seguinte:</p>
<p>a) Se por culpa da CONTRATANTE (ex: inadimplência superior a 15 dias, falta de fornecimento de documentos por mais de 30 dias), a CONTRATADA poderá reter até <strong>30% (trinta por cento)</strong> dos valores já recebidos a título de cláusula penal compensatória.</p>
<p>b) Se por culpa da CONTRATADA, esta devolverá integralmente os valores pagos referentes a serviços não realizados, acrescidos de multa de <strong>10% (dez por cento)</strong> sobre o valor pago.</p>

<p>14.2. <strong>Rescisão imotivada pela CONTRATANTE</strong> (sem culpa da CONTRATADA):</p>
<p>a) <strong>Antes</strong> do envio do pedido de compra dos materiais: devolução de 100% dos valores, descontados custos com visita técnica e projeto (até R$ 1.500,00);</p>
<p>b) <strong>Após</strong> o pedido de compra dos materiais: devolução de 50% dos valores, sendo a outra metade retida para cobrir custos de cancelamento, frete reverso e armazenagem;</p>
<p>c) <strong>Após</strong> a entrega dos materiais no local: devolução limitada a 20% dos valores, retidos os custos de equipamentos comprados.</p>

<p>14.3. <strong>Rescisão imotivada pela CONTRATADA:</strong> devolução integral dos valores recebidos, acrescidos de multa de 10%.</p>

<hr/>

<h2>CLÁUSULA 15ª — DO DIREITO DE ARREPENDIMENTO (CDC Art. 49)</h2>

<p>15.1. Em conformidade com o art. 49 do Código de Defesa do Consumidor, caso o presente contrato tenha sido celebrado <strong>fora do estabelecimento comercial da CONTRATADA</strong> (por meios eletrônicos, à distância, em domicílio da CONTRATANTE), a CONTRATANTE poderá exercer o <strong>direito de arrependimento no prazo de 7 (sete) dias corridos</strong> contados da assinatura, com devolução integral dos valores pagos, sem qualquer ônus.</p>

<hr/>

<h2>CLÁUSULA 16ª — DO CASO FORTUITO E FORÇA MAIOR</h2>

<p>16.1. Não constituirão descumprimento contratual os atrasos ou interrupções decorrentes de greves, falta generalizada de matéria-prima, restrições aduaneiras, pandemias, calamidade pública, eventos climáticos extremos, apagões, racionamento de energia ou prazos da concessionária ${dados.concessionaria} e da ANEEL.</p>

<hr/>

<h2>CLÁUSULA 17ª — DA PROTEÇÃO DE DADOS (LGPD)</h2>

<p>17.1. A CONTRATADA, na qualidade de <strong>controladora de dados</strong>, tratará os dados pessoais da CONTRATANTE (nome, CPF, RG, endereço, dados bancários, conta de luz, fotos do imóvel) <strong>estritamente para a execução deste contrato</strong> e cumprimento de obrigações legais.</p>
<p>17.2. A CONTRATANTE <strong>autoriza expressamente</strong> o compartilhamento de seus dados com: ${dados.concessionaria}, ANEEL, distribuidor de equipamentos, Cartórios (procuração) e bancos.</p>
<p>17.3. A CONTRATADA atenderá aos direitos do titular previstos na Lei 13.709/2018 (acesso, correção, exclusão, portabilidade).</p>

<hr/>

<h2>CLÁUSULA 18ª — DAS COMUNICAÇÕES ELETRÔNICAS</h2>

<p>18.1. As comunicações entre as partes serão consideradas válidas e oficiais quando realizadas por:</p>
<ul>
<li>WhatsApp e e-mail nos contatos informados no preâmbulo deste contrato;</li>
<li>Carta com aviso de recebimento (AR) para os endereços indicados no preâmbulo.</li>
</ul>
<p>18.2. <strong>Aceites, aditivos e confirmações realizados via WhatsApp ou e-mail</strong> terão pleno valor probatório, conforme art. 10 da MP 2.200-2/2001 e art. 225 do Código Civil.</p>

<hr/>

${disposicoes}

<h2>CLÁUSULA 24ª — DO FORO</h2>

<p>24.1. As partes elegem o foro da comarca de <strong>${cidade}-${uf}</strong> (domicílio da CONTRATANTE, art. 101, I, do CDC) para dirimir quaisquer controvérsias oriundas deste contrato, sendo facultado à CONTRATANTE optar pelo foro de seu domicílio.</p>

<hr/>

<p>E por estarem assim justas e contratadas, as partes assinam o presente instrumento eletronicamente, com plena validade jurídica nos termos da MP 2.200-2/2001 e Lei 14.063/2020.</p>

<p>${data}</p>

<div class="assinatura">
<div class="linha"></div>
<p><strong>${nomeContratante}</strong><br/>
CPF/CNPJ: ${cpfContratante}<br/>
<em>CONTRATANTE</em></p>

<div class="linha"></div>
<p><strong>${CONTRATADA.razao_social}</strong><br/>
${CONTRATADA.representante_nome} — ${CONTRATADA.representante_titulo} ${CONTRATADA.representante_crea}<br/>
CPF: ${CONTRATADA.representante_cpf}<br/>
CNPJ: ${CONTRATADA.cnpj}<br/>
<em>CONTRATADA</em></p>
</div>

</body>
</html>`;
}
