// src/modules/closing/parcelamento-cartao.ts
//
// 💳 A conta do cartão parcelado — pra escrever no contrato "12x de R$ 2.006,25"
// sem ninguém abrir tabela nenhuma.
//
// De onde saiu a taxa: o Junior mandou 2 tabelas reais da Solfácil (o mesmo
// carrinho, uma com frete e outra sem). Engenharia reversa dos 30 valores mostrou
// que é uma tabela Price, e que a mesma regra explica as duas com erro de ~13
// centavos (arredondamento). Não é chute — é a fórmula deles:
//
//   1. base do cartão = valor à vista + 3,19%   (a taxa da operadora)
//   2. parcela        = base × i / (1 − (1+i)^−n),  com i = 1,689% ao mês
//   3. até 3x é sem juros; o teto é 18x
//
// ⚠️ FINANCIAMENTO (Belenus, Fort Lev) NÃO passa por aqui: quem define a parcela é
// o banco, na aprovação. Lá o operador escreve o que o banco deu — a máquina não
// tem o que calcular, e chutar juros de banco dentro de um contrato seria grave.

export interface TabelaCartao {
  nome: string;
  /** Quanto a operadora cobra por cima do valor à vista (0,0319 = 3,19%). */
  taxa: number;
  /** Juros ao mês do parcelamento (0,016888 = 1,689%). */
  jurosMes: number;
  maxParcelas: number;
  /** Até quantas vezes não tem juros. */
  semJurosAte: number;
}

export const SOLFACIL: TabelaCartao = {
  nome: 'Sol Fácil',
  taxa: 0.0319,
  jurosMes: 0.016888,
  maxParcelas: 18,
  semJurosAte: 3,
};

export interface Parcelamento {
  parcelas: number;
  parcela: number;
  total: number;
  comJuros: boolean;
}

const arredondar = (v: number) => Math.round(v * 100) / 100;

/**
 * A parcela de uma venda no cartão. Devolve null quando não dá pra calcular
 * (valor zerado, parcela fora do limite) — nunca um número inventado.
 */
export function parcelaCartao(valorAVista: number, parcelas: number, tabela: TabelaCartao): Parcelamento | null {
  const v = Number(valorAVista);
  const n = Math.trunc(Number(parcelas));
  if (!Number.isFinite(v) || v <= 0) return null;
  if (!Number.isFinite(n) || n < 1 || n > tabela.maxParcelas) return null;

  if (n <= tabela.semJurosAte) {
    const parcela = arredondar(v / n);
    return { parcelas: n, parcela, total: arredondar(parcela * n), comJuros: false };
  }

  const base = v * (1 + tabela.taxa);
  const i = tabela.jurosMes;
  const parcela = arredondar((base * i) / (1 - Math.pow(1 + i, -n)));
  return { parcelas: n, parcela, total: arredondar(parcela * n), comJuros: true };
}

/** A tabela inteira (1x até o limite) — pra mostrar as opções na tela. */
export function tabelaCartao(valorAVista: number, tabela: TabelaCartao): Parcelamento[] {
  const linhas: Parcelamento[] = [];
  for (let n = 1; n <= tabela.maxParcelas; n++) {
    const p = parcelaCartao(valorAVista, n, tabela);
    if (p) linhas.push(p);
  }
  return linhas;
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** A frase que vai pro contrato. Vazia se não der pra calcular — nunca chuta. */
export function frasePagamento(valorAVista: number, parcelas: number, tabela: TabelaCartao): string {
  const p = parcelaCartao(valorAVista, parcelas, tabela);
  if (!p) return '';
  if (!p.comJuros) {
    return `${tabela.nome} — ${p.parcelas}x de ${brl(p.parcela)} sem juros (total ${brl(p.total)})`;
  }
  return `${tabela.nome} — ${p.parcelas}x de ${brl(p.parcela)} (total ${brl(p.total)})`;
}
