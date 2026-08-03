// src/modules/proposal/cartao-solar.ts
//
// 💳 O CARTÃO DO SOLAR — fonte ÚNICA das tabelas. Antes ela morava escondida dentro
// da ProposalAssistant, e a Central de Contratos acabou nascendo com OUTRA tabela
// (a da compra do kit na Solfácil, que é o CUSTO da EcoSun, não o que o cliente
// paga). Resultado: o cliente lia "24x de R$ 1.947" na proposta e assinaria
// "12x de R$ 2.006" no contrato. Proposta e contrato TÊM que falar o mesmo número.
//
// Desde 03/08/2026 são DUAS tabelas vivas (dois distribuidores do Junior):
//
// 'parceria' — tabela Belenus (parceria EcoSunPower): acréscimo TOTAL sobre o valor
//   à vista por nº de parcelas, até 24×. Coletada/calibrada pelo Junior em
//   07/06/2026 (kit R$ 10.000: 1x +287 ... 12x +1149 ... 24x +2105). É taxa POR
//   FAIXA (degraus a cada ~6 parcelas), NÃO juros composto — por isso tabela exata.
//
// 'solfacil' — parcelamento Sol Fácil pro CLIENTE (a Fortlev pratica o mesmo),
//   até 18×, taxa POR DENTRO: total = valor ÷ (1 − taxa), sem juros até 3×.
//   Decifrada da imagem "calculo solfacil .jpeg" e conferida pelo Junior em
//   01/08/2026 (golden: R$ 26.400 em 18× → parcela R$ 1.644,06).
//
// ⚠️ Nome de distribuidor (Belenus, Sol Fácil, Fortlev) NÃO aparece pro cliente
// (fornecedor pode mudar) — nem na proposta, nem no contrato. Pro cliente é
// "Cartão de crédito".
import { empresa } from '../empresa-config.js';
import { valorParcelaCartao, JUROS_CARTAO_SERVICO } from './service-payment.js';

export type TabelaCartao = 'parceria' | 'solfacil';

export const BELENUS_ACRESCIMO: Record<number, number> = {
  1: 0.0287, 2: 0.0450, 3: 0.0515, 4: 0.0580, 5: 0.0645, 6: 0.0710,
  7: 0.0813, 8: 0.0879, 9: 0.0947, 10: 0.1014, 11: 0.1081, 12: 0.1149,
  13: 0.1273, 14: 0.1341, 15: 0.1410, 16: 0.1480, 17: 0.1549, 18: 0.1620,
  19: 0.1745, 20: 0.1816, 21: 0.1888, 22: 0.1959, 23: 0.2032, 24: 0.2105,
};

export const SOLFACIL_TAXA: Record<number, number> = {
  1: 0, 2: 0, 3: 0,
  4: 0.0005, 5: 0.0088, 6: 0.0169,
  7: 0.0249, 8: 0.0329, 9: 0.0407,
  10: 0.0485, 11: 0.0563, 12: 0.0639,
  13: 0.0715, 14: 0.0788, 15: 0.0863,
  16: 0.0936, 17: 0.1007, 18: 0.1079,
};

/** Parcela na tabela da parceria: total = valor × (1 + acréscimo), parcela = total / n. */
export function parcelaCartaoBelenus(valor: number, parcelas: number): number {
  const acr = BELENUS_ACRESCIMO[parcelas] ?? BELENUS_ACRESCIMO[24];
  return (valor * (1 + acr)) / parcelas;
}

/** Parcela na tabela Sol Fácil/Fortlev: total = valor ÷ (1 − taxa), parcela = total / n. */
export function parcelaCartaoSolFacil(valor: number, parcelas: number): number {
  const taxa = SOLFACIL_TAXA[parcelas] ?? SOLFACIL_TAXA[18];
  return valor / (1 - taxa) / parcelas;
}

/**
 * [ECOSOF] Até quantas vezes cada tabela parcela. Com a parceria de cartão ligada
 * (EcoSun): 'parceria' 24× e 'solfacil' 18×. Sem a flag, 12× na maquininha própria —
 * um clone do sistema nunca herda a taxa de um distribuidor que não é dele.
 */
export function parcelasMaxCartaoSolar(tabela: TabelaCartao = 'parceria'): number {
  if (!empresa().belenusAtivo) return 12;
  return tabela === 'solfacil' ? 18 : 24;
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
 * (valor zerado, parcela fora do limite da tabela) — nunca um número inventado.
 *
 * A ÚLTIMA parcela absorve os centavos do arredondamento, senão parcela × n não
 * fecha com o total e o contrato sairia com dois valores que não batem.
 */
export function parcelaCartaoSolar(
  valor: number,
  parcelas: number,
  tabela: TabelaCartao = 'parceria',
): ParcelaCartao | null {
  const v = Number(valor);
  const n = Math.trunc(Number(parcelas));
  if (!Number.isFinite(v) || v <= 0) return null;
  if (!Number.isFinite(n) || n < 1 || n > parcelasMaxCartaoSolar(tabela)) return null;

  const parceriaAtiva = empresa().belenusAtivo;
  if (!parceriaAtiva && !JUROS_CARTAO_SERVICO[n]) return null; // maquininha só vai até 12x

  const parcela = arredondar(
    !parceriaAtiva ? valorParcelaCartao(v, n)
      : tabela === 'solfacil' ? parcelaCartaoSolFacil(v, n)
      : parcelaCartaoBelenus(v, n),
  );
  const total = arredondar(parcela * n);
  return { parcelas: n, parcela, total, acrescimo: total / v - 1 };
}

/** A tabela inteira (1x até o limite dela) — pra mostrar as opções na tela. */
export function tabelaCartaoSolar(valor: number, tabela: TabelaCartao = 'parceria'): ParcelaCartao[] {
  const linhas: ParcelaCartao[] = [];
  for (let n = 1; n <= parcelasMaxCartaoSolar(tabela); n++) {
    const p = parcelaCartaoSolar(valor, n, tabela);
    if (p) linhas.push(p);
  }
  return linhas;
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * A frase que vai pro CONTRATO. Sem o nome do distribuidor — pro cliente é "cartão
 * de crédito". Vazia se não der pra calcular: nunca chuta número em documento.
 */
export function frasePagamentoCartao(
  valor: number,
  parcelas: number,
  tabela: TabelaCartao = 'parceria',
): string {
  const p = parcelaCartaoSolar(valor, parcelas, tabela);
  if (!p) return '';
  return `Cartão de crédito — ${p.parcelas}x de ${brl(p.parcela)} (total ${brl(p.total)})`;
}
