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
export const COMUM_ESPECIALIZADO: ReadonlySet<string> = new Set([
  // Normas, lei e conceitos
  'legislacao.md',
  'modalidades-compensacao.md',
  'tarifacao.md',
  'certificacao-homologacao-inmetro.md',
  'mercado-livre.md',
  // Engenharia
  'dimensionamento.md',
  'cenarios-dimensionamento.md',
  'estruturas-telhados.md',
  'apartamento-condominio.md',
  'solucoes-grupo-a-demanda-bess.md',
  'limpeza-manutencao-om.md',
  'armazenamento.md',
  'aquecimento-solar-agua.md',   // térmico (banho/piscina) — produto da Conquista Solar
  'carros-eletricos.md',
  'canal-solar.md',
  'argumentos-equipamentos.md',
  // Equipamento — datasheet é público do fabricante
  'inversores-baterias.md',
  'comparativo-baterias-compatibilidade.md',
  'compatibilidade-inversores-baterias.md',
  'modulos-especificacoes.md',
  'modulos-dmegc.md',
  'modulos-hanersun.md',
  'modulo-astronergy.md',
  'modulo-dah.md',
  'modulo-hanersun-hn21n.md',
  'modulo-jasolar-deepblue40pro.md',
  'modulo-jinko-tiger-neo.md',
  'modulo-leapton.md',
  'modulo-longi-bc2.md',
  'modulo-osda.md',
  'modulo-risen-hjt.md',
  'modulo-tcl-hsm-nd66.md',
  'modulo-trina-vertex-n.md',
  'modulo-tsun-rio.md',
  'inversor-deye-string.md',
  'inversor-foxess-string.md',
  'inversor-fronius-sma.md',
  'inversor-goodwe-xs-g3.md',
  'inversor-huawei-fusionsolar.md',
  'inversor-livoltek.md',
  'inversor-sofar.md',
  'inversor-solis-string.md',
  'inversor-solplanet.md',
  'inversor-sungrow-rsl.md',
  'hibrido-foxess-h3pro-ep11.md',
  'microinversor-apsystems.md',
  'microinversor-deye.md',
  'microinversor-enphase.md',
  'microinversor-foxess.md',
  'microinversor-goodwe-mis.md',
  'microinversor-hoymiles.md',
  'microinversor-nep.md',
  'microinversor-solax.md',
  'microinversor-sungrow-s2500sl.md',
  'bateria-goodwe-lynx-a-g3.md',
  'bateria-goodwe-lynx-f-g2-at.md',
  'bateria-goodwe-lynx-u-g3.md',
  'bateria-sofar-sf-5kwh.md',
  'bateria-solax-tbat.md',
  'bateria-soluna-huawei-luna2000.md',
  'bateria-unipower.md',
  'solaredge.md',
  'goodwe-plus-modulo1.md',
  'goodwe-armazenamento-ci-modulo2.md',
  'goodwe-plus-modulo3-instalacao-comissionamento.md',
  'shelly-automacao-gerenciamento-energia.md',
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
