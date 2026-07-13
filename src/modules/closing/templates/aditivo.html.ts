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

function dataBR(iso?: string): string {
  if (!iso) return '____/____/________';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
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

  if (a.motivo === 'pagamento' || a.nova_forma_pagamento) {
    partes.push(`<h2>CLÁUSULA ${n++}ª — DA FORMA DE PAGAMENTO</h2>
      <p>Fica alterada a forma de pagamento pactuada no contrato ${antes}, que passa a vigorar
      conforme abaixo, permanecendo inalterado o valor total contratado de <strong>${brl(a.valor_anterior)}</strong>:</p>
      <p><strong>Como estava:</strong> ${ou(a.forma_pagamento_anterior)}</p>
      <p><strong>Como passa a ser:</strong> ${ou(a.nova_forma_pagamento)}</p>`);
  }

  if (a.motivo === 'servicos' || a.servicos_novos) {
    partes.push(`<h2>CLÁUSULA ${n++}ª — DOS SERVIÇOS ACRESCIDOS</h2>
      <p>As partes ajustam, de comum acordo, o acréscimo dos seguintes serviços ao objeto do contrato ${antes}:</p>
      <p>${ou(a.servicos_novos)}</p>
      <p>Pelos serviços acrescidos, a CONTRATANTE pagará à CONTRATADA o valor adicional de
      <strong>${brl(a.valor_adicional)}</strong>, passando o valor total do contrato de
      <strong>${brl(a.valor_anterior)}</strong> para <strong>${brl(a.novo_valor_total)}</strong>.</p>`);
  }

  if (a.motivo === 'prazo' || a.novo_prazo) {
    partes.push(`<h2>CLÁUSULA ${n++}ª — DO PRAZO</h2>
      <p>Fica alterado o prazo pactuado no contrato ${antes}, que passa a ser: ${ou(a.novo_prazo)}.</p>`);
  }

  if (partes.length === 0) {
    partes.push(`<h2>CLÁUSULA ${n++}ª — DA ALTERAÇÃO</h2>
      <p>Fica alterado o contrato ${antes}, nos termos abaixo:</p>
      <p>${BRANCO}</p>`);
  }

  // As duas abaixo são escritas pelo operador — nada preenche sozinho, e nada
  // obriga: pode vir só uma, as duas, ou nenhuma.
  if (a.justificativa && a.justificativa.trim()) {
    partes.push(`<h2>CLÁUSULA ${n++}ª — DA JUSTIFICATIVA</h2><p>${a.justificativa}</p>`);
  }

  if (a.clausula_extra && a.clausula_extra.trim()) {
    partes.push(`<h2>CLÁUSULA ${n++}ª — DAS DISPOSIÇÕES ESPECIAIS</h2><p>${a.clausula_extra}</p>`);
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
  const cidade = (d.titular_uc as PessoaFisica)?.endereco?.cidade || 'Brasília';
  const uf = (d.titular_uc as PessoaFisica)?.endereco?.uf || 'DF';

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
