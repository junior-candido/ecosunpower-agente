// src/modules/proposal/cartao-solar.ts
//
// 💳 O CARTÃO DO SOLAR — fonte ÚNICA da tabela. Antes ela morava escondida dentro
// da ProposalAssistant, e a Central de Contratos acabou nascendo com OUTRA tabela
// (a da compra do kit na Solfácil, que é o CUSTO da EcoSun, não o que o cliente
// paga). Resultado: o cliente lia "24x de R$ 1.947" na proposta e assinaria
// "12x de R$ 2.006" no contrato. Proposta e contrato TÊM que falar o mesmo número.
//
// Tabela Belenus (parceria EcoSunPower) — acréscimo TOTAL sobre o valor à vista por
// nº de parcelas. Coletada/calibrada pelo Junior em 07/06/2026 (kit R$ 10.000:
// 1x +287 ... 12x +1149 ... 24x +2105). É taxa POR FAIXA (degraus a cada ~6
// parcelas), NÃO juros composto de taxa única — por isso a tabela exata, não uma
// fórmula. O acréscimo é % do valor, então vale pra qualquer venda.
//
// ⚠️ O nome "Belenus" é do parceiro e NÃO aparece pro cliente (ele pode mudar de
// fornecedor) — nem na proposta, nem no contrato. Pro cliente é "cartão de crédito".
import { empresa } from '../empresa-config.js';
import { valorParcelaCartao, JUROS_CARTAO_SERVICO } from './service-payment.js';

export const BELENUS_ACRESCIMO: Record<number, number> = {
  1: 0.0287, 2: 0.0450, 3: 0.0515, 4: 0.0580, 5: 0.0645, 6: 0.0710,
  7: 0.0813, 8: 0.0879, 9: 0.0947, 10: 0.1014, 11: 0.1081, 12: 0.1149,
  13: 0.1273, 14: 0.1341, 15: 0.1410, 16: 0.1480, 17: 0.1549, 18: 0.1620,
  19: 0.1745, 20: 0.1816, 21: 0.1888, 22: 0.1959, 23: 0.2032, 24: 0.2105,
};

/** Parcela no cartão Belenus: total = valor × (1 + acréscimo), parcela = total / n. */
export function parcelaCartaoBelenus(valor: number, parcelas: number): number {
  const acr = BELENUS_ACRESCIMO[parcelas] ?? BELENUS_ACRESCIMO[24];
  return (valor * (1 + acr)) / parcelas;
}

/**
 * [ECOSOF] Até quantas vezes o cartão do solar parcela. Com a parceria ligada
 * (EcoSun) são 24x pela tabela Belenus; sem ela, 12x na maquininha própria — um
 * clone do sistema nunca herda a taxa de um parceiro que não é dele.
 */
export function parcelasMaxCartaoSolar(): number {
  return empresa().belenusAtivo ? 24 : 12;
}

export interface ParcelaCartao {
  parcelas: number;
  parcela: number;
  total: number;
  /** Acréscimo total sobre o valor à vista (0,1888 = +18,88%). */
  acrescimo: number;
}

const arredondar = (v: number) => Math.round(v * 100) / 100;

/**
 * A parcela do cartão pra uma venda. Devolve null quando não dá pra calcular
 * (valor zerado, parcela fora do limite) — nunca um número inventado.
 *
 * A ÚLTIMA parcela absorve os centavos do arredondamento, senão parcela × n não
 * fecha com o total e o contrato sairia com dois valores que não batem.
 */
export function parcelaCartaoSolar(valor: number, parcelas: number): ParcelaCartao | null {
  const v = Number(valor);
  const n = Math.trunc(Number(parcelas));
  if (!Number.isFinite(v) || v <= 0) return null;
  if (!Number.isFinite(n) || n < 1 || n > parcelasMaxCartaoSolar()) return null;

  const belenus = empresa().belenusAtivo;
  if (!belenus && !JUROS_CARTAO_SERVICO[n]) return null; // maquininha só vai até 12x

  const parcela = arredondar(belenus ? parcelaCartaoBelenus(v, n) : valorParcelaCartao(v, n));
  const total = arredondar(parcela * n);
  return { parcelas: n, parcela, total, acrescimo: total / v - 1 };
}

/** A tabela inteira (1x até o limite) — pra mostrar as opções na tela. */
export function tabelaCartaoSolar(valor: number): ParcelaCartao[] {
  const linhas: ParcelaCartao[] = [];
  for (let n = 1; n <= parcelasMaxCartaoSolar(); n++) {
    const p = parcelaCartaoSolar(valor, n);
    if (p) linhas.push(p);
  }
  return linhas;
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * A frase que vai pro CONTRATO. Sem o nome do parceiro — pro cliente é "cartão de
 * crédito". Vazia se não der pra calcular: nunca chuta número em documento.
 */
export function frasePagamentoCartao(valor: number, parcelas: number): string {
  const p = parcelaCartaoSolar(valor, parcelas);
  if (!p) return '';
  return `Cartão de crédito — ${p.parcelas}x de ${brl(p.parcela)} (total ${brl(p.total)})`;
}
