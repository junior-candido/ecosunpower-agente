// src/modules/closing/templates/aditivo.html.ts
//
// 📎 TERMO ADITIVO ao contrato de prestação de serviços.
//
// Ele COMPLEMENTA o contrato — não substitui. Diz o que muda, cita o que era
// antes, e afirma que o resto continua valendo. Os dois casos reais:
//   1. o cartão não passou em 24x, a bandeira só liberou 21x → muda o pagamento;
//   2. no meio da obra apareceu serviço a mais → registra o que entrou e o novo total.
import type { DadosFechamento, PessoaFisica, PessoaJuridica } from '../types.js';
import { empresa } from '../../empresa-config.js';
import { escaparDadosFechamento } from '../escapar-dados.js';

// Mesma fonte do contrato (empresa-config em runtime) — nada de dado da empresa
// chumbado em dois lugares.
function contratada() {
  const e = empresa();
  return {
    razao_social: e.razaoSocial,
    cnpj: e.cnpj,
    endereco: `${e.endereco}, ${e.cidade}-${e.uf}${e.cep ? `, CEP ${e.cep}` : ''}`,
    representante_nome: e.rtNome,
    representante_titulo: e.rtTitulo, // já inclui "Responsável Técnico CREA/CFT"
    representante_cpf: e.rtCpf ?? '',
  };
}

function nomeDe(p: PessoaFisica | PessoaJuridica): string {
  return p.tipo === 'PJ' ? p.razao_social : p.nome;
}

function docDe(p: PessoaFisica | PessoaJuridica): string {
  return p.tipo === 'PJ' ? `CNPJ nº ${p.cnpj}` : `CPF nº ${p.cpf}`;
}

// "2026-07-20" → "20/07/2026", sem passar por new Date(): o JS lê data-sem-hora
// como meia-noite UTC, e em Brasília (UTC-3) isso vira o DIA ANTERIOR. Num contrato,
// citar a data errada da assinatura é problema sério.
function dataBR(iso?: string): string {
  if (!iso) return '____/____/________';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function brl(n?: number): string {
  if (n == null || !Number.isFinite(n) || n === 0) return '_______________';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const BRANCO = '_______________________';
const ou = (s?: string) => (s && s.trim() ? s : BRANCO);

/** As cláusulas do aditivo, montadas conforme o motivo. */
function clausulas(d: DadosFechamento): string {
  const a = d.aditivo ?? {};
  const partes: string[] = [];
  let n = 1;

  const antes = `firmado em <strong>${dataBR(a.contrato_data)}</strong>`;
  const temTexto = (s?: string) => !!(s && s.trim());

  // O PREÇO muda? Só quando entra serviço a mais. Trocar 24x por 21x NÃO muda o
  // preço dos serviços — muda o que a administradora do cartão cobra do cliente.
  // Sem essa distinção, duas cláusulas do mesmo documento se contradiziam: uma
  // dizia "o valor permanece R$ 20.959,09" e a outra "passa para R$ 23.359,09".
  const mudaPreco = !!(a.valor_adicional || a.novo_valor_total);

  if (a.motivo === 'pagamento' || temTexto(a.nova_forma_pagamento)) {
    const precoInalterado = mudaPreco ? '' : `
      <p><strong>§1º.</strong> O preço dos serviços permanece inalterado em <strong>${brl(a.valor_anterior)}</strong>.</p>
      <p><strong>§2º.</strong> Eventual acréscimo cobrado pela administradora do cartão em razão do número de
      parcelas é de responsabilidade da CONTRATANTE e não altera o preço previsto no §1º.</p>`;
    partes.push(`<h2>CLÁUSULA ${n++}ª — DA FORMA DE PAGAMENTO</h2>
      <p>As partes ajustam, de comum acordo, a alteração da forma de pagamento pactuada no contrato ${antes},
      que passa a vigorar conforme abaixo:</p>
      <p><strong>Como estava:</strong> ${ou(a.forma_pagamento_anterior)}</p>
      <p><strong>Como passa a ser:</strong> ${ou(a.nova_forma_pagamento)}</p>${precoInalterado}`);
  }

  if (a.motivo === 'servicos' || temTexto(a.servicos_novos)) {
    partes.push(`<h2>CLÁUSULA ${n++}ª — DOS SERVIÇOS ACRESCIDOS</h2>
      <p>As partes ajustam, de comum acordo, o acréscimo dos seguintes serviços ao objeto do contrato ${antes}:</p>
      <p>${ou(a.servicos_novos)}</p>
      <p>Pelos serviços acrescidos, a CONTRATANTE pagará à CONTRATADA o valor adicional de
      <strong>${brl(a.valor_adicional)}</strong>, passando o valor total do contrato de
      <strong>${brl(a.valor_anterior)}</strong> para <strong>${brl(a.novo_valor_total)}</strong>.</p>
      ${temTexto(a.novo_prazo) ? '' : `<p>Os serviços acrescidos não alteram o prazo de execução previsto no contrato.</p>`}`);
  }

  if (a.motivo === 'prazo' || temTexto(a.novo_prazo)) {
    partes.push(`<h2>CLÁUSULA ${n++}ª — DO PRAZO</h2>
      <p>As partes ajustam, de comum acordo, a alteração do prazo pactuado no contrato ${antes},
      que passa a ser: ${ou(a.novo_prazo)}.</p>`);
  }

  // Escritas pelo operador — nada preenche sozinho, e nada obriga.
  if (temTexto(a.justificativa)) {
    partes.push(`<h2>CLÁUSULA ${n++}ª — DA JUSTIFICATIVA</h2><p>${a.justificativa}</p>`);
  }
  if (temTexto(a.clausula_extra)) {
    partes.push(`<h2>CLÁUSULA ${n++}ª — DAS DISPOSIÇÕES ESPECIAIS</h2><p>${a.clausula_extra}</p>`);
  }

  // O "nada foi dito" só vale se NENHUMA cláusula acima entrou — inclusive a
  // cláusula extra. Antes, um aditivo escrito só na cláusula extra saía com uma
  // CLÁUSULA 1ª vazia, com linha pontilhada, num papel que vai pra assinatura.
  if (partes.length === 0) {
    partes.push(`<h2>CLÁUSULA ${n++}ª — DA ALTERAÇÃO</h2>
      <p>Fica alterado o contrato ${antes}, nos termos abaixo:</p>
      <p>${BRANCO}</p>`);
  }

  partes.push(`<h2>CLÁUSULA ${n++}ª — DA RATIFICAÇÃO</h2>
    <p>Permanecem inalteradas e em pleno vigor todas as demais cláusulas e condições do contrato
    ${antes}, que não tenham sido expressamente modificadas por este Termo Aditivo.</p>`);

  return partes.join('\n');
}

export function renderAditivo(entrada: DadosFechamento): string {
  // Mesma blindagem do contrato: dado que veio de fora não entra cru no HTML.
  const d = escaparDadosFechamento(entrada);
  const C = contratada();
  const contratante = d.contratante ?? d.titular_uc;
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  // A cidade da assinatura vem de quem ASSINA (o contratante), igual no contrato —
  // e o placeholder "_____" é texto, então o `||` sozinho não o descartava: a
  // assinatura saía como "_______________________-DF".
  const semBranco = (s?: string) => (s && !s.includes('___') ? s : '');
  const endAssina = (contratante as PessoaFisica)?.endereco;
  const cidade = semBranco(endAssina?.cidade) || 'Brasília';
  const uf = semBranco(endAssina?.uf) || 'DF';

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 2cm; }
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; line-height: 1.55; color: #111; }
  h1 { font-size: 13pt; text-align: center; text-transform: uppercase; margin-bottom: 1.5em; }
  h2 { font-size: 11pt; color: #0c4a6e; margin-top: 1.4em; margin-bottom: 0.4em; }
  p { text-align: justify; margin: 0.5em 0; }
  .assinaturas { margin-top: 3.5em; }
  .linha { margin-top: 2.8em; border-top: 1px solid #111; width: 65%; padding-top: 0.3em; }
</style></head><body>

<h1>Termo Aditivo ao Contrato de Prestação de Serviços de Engenharia e Instalação de Sistema de Geração Fotovoltaica</h1>

<h2>DAS PARTES</h2>
<p><strong>CONTRATANTE:</strong> ${nomeDe(contratante)}, ${docDe(contratante)}.</p>
<p><strong>CONTRATADA:</strong> ${C.razao_social}, inscrita no CNPJ sob o nº ${C.cnpj}, com sede na ${C.endereco},
neste ato representada por ${C.representante_nome}, ${C.representante_titulo}, portador do CPF nº ${C.representante_cpf}.</p>

<p>As partes acima qualificadas, já vinculadas pelo Contrato de Prestação de Serviços firmado em
<strong>${dataBR(d.aditivo?.contrato_data)}</strong>, resolvem, de comum acordo, celebrar o presente
<strong>TERMO ADITIVO</strong>, que passa a integrar o referido contrato, nos termos das cláusulas seguintes.</p>

${clausulas(d)}

<p>E, por estarem assim justas e acordadas, as partes assinam o presente Termo Aditivo.</p>

<div class="assinaturas">
  <p>${cidade}-${uf}, ${hoje}.</p>
  <div class="linha">${nomeDe(contratante)} — CONTRATANTE</div>
  <div class="linha">${C.razao_social} — CONTRATADA</div>
</div>

</body></html>`;
}
