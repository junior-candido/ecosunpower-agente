// src/modules/conhecimento-escopo.ts
// QUEM VÊ O QUÊ na base de conhecimento (multi-tenant).
//
// A pasta `conhecimento/` nasceu 100% EcoSunPower. Quando o SaaS ganhou o
// primeiro cliente (Conquista Solar), a assistente DELE passou a ler a base
// DA ECOSUN — falaria dos nossos preços, região (DF/GO) e casos pros clientes
// dele. Este módulo faz o corte.
//
// REGRA DE OURO: **o padrão é PRIVADO**. Só entra em COMUM o que é técnico e
// vale pra qualquer empresa do país (datasheet de equipamento, norma, lei,
// dimensionamento). Assim, arquivo novo nunca vaza por esquecimento — no
// máximo deixa de ser compartilhado, que é o erro seguro.
//
// NÃO pode ser comum: preço, condição de pagamento, região/concessionária,
// casos executados, contratos, playbook de vendas da casa, redes sociais.

/** Arquivos da RAIZ de conhecimento/ que valem pra qualquer empresa. */
export const COMUM_CORE: ReadonlySet<string> = new Set([
  'mercado-greener-2026.md',   // panorama do mercado solar brasileiro
  'metodologia-tecnica.md',    // método de cálculo/engenharia, sem preço
]);

/** Arquivos de conhecimento/especializado/ que valem pra qualquer empresa. */
/** Arquivos de conhecimento/especializado/ que valem pra qualquer empresa.
 *
 * ⚠️ REVISADO 01/09/2026 — SEM ARQUIVO DE MARCA.
 * A lista antiga tinha 68 arquivos, e 45 deles eram de marca específica
 * (modulo-*, inversor-*, microinversor-*, bateria-*). Esses arquivos não são
 * técnicos: são POSICIONAMENTO da EcoSunPower — "por que a EcoSunPower
 * trabalha com Solis", "nossa garantia é 12 meses", "a Eva nunca passa preço,
 * escalona pro Junior". Entregar isso pro cliente do SaaS faz a assistente
 * dele afirmar sobre ELE o que é verdade só sobre nós — promete marca e
 * garantia que talvez não sejam dele.
 *
 * Junior derrubou a ideia de só trocar os nomes: "isso não faz sentido".
 * Está certo — trocar "EcoSunPower" por "Conquista Solar" numa frase dessas
 * transforma vazamento de marca em afirmação falsa, que é pior.
 *
 * Sobra aqui o que é LEI, NORMA e FÍSICA: verdade pra qualquer empresa do
 * país. Com que marcas a empresa trabalha, ela escreve na base própria
 * (migration 119, assunto "marcas").
 */
export const COMUM_ESPECIALIZADO: ReadonlySet<string> = new Set([
  // Lei, norma e regra de mercado
  'legislacao.md',
  'modalidades-compensacao.md',
  'tarifacao.md',
  'certificacao-homologacao-inmetro.md',
  'mercado-livre.md',
  // Engenharia e dimensionamento (conta, não catálogo)
  'dimensionamento.md',
  'cenarios-dimensionamento.md',
  'estruturas-telhados.md',
  'apartamento-condominio.md',
  'solucoes-grupo-a-demanda-bess.md',
  'armazenamento.md',
  // Serviços e produtos como CONCEITO (o que é, como funciona)
  'limpeza-manutencao-om.md',
  'aquecimento-solar-agua.md',
  'carros-eletricos.md',
]);

// Deixados PRIVADOS de propósito (não mexer sem pensar):
//   empresa.md, contato-redes.md, contratos.md, propostas.md, produtos.md,
//   precificacao.md, precos-referencia.md, modulos-alternativos-preco.md,
//   financiamento.md, parcelamento-cartao.md   → preço/condição comercial
//   servicos-executados.md, indicacao.md, faq.md, objecoes.md,
//   vendas-playbook.md, vendas-ia.md, perguntas-qualificacao.md,
//   agendamento.md, processo.md, pos-venda.md, visita-tecnica-pos-venda.md,
//   calculadora.md                             → jeito e processo da casa
//   neoenergia-brasilia.md, equatorial-goias.md → região DF/GO
//   redes-*.md                                  → material de faculdade do dono

export type TierConhecimento = 'core' | 'especializado';

/** true = o arquivo pode ser lido pela assistente de QUALQUER empresa. */
export function ehComum(arquivo: string, tier: TierConhecimento): boolean {
  return tier === 'core' ? COMUM_CORE.has(arquivo) : COMUM_ESPECIALIZADO.has(arquivo);
}
