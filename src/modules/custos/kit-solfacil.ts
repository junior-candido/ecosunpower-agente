// src/modules/custos/kit-solfacil.ts
//
// 🧾 O CUSTO DO KIT na plataforma da Solfácil — o que a EcoSun PAGA pelo
// equipamento.
//
// ⚠️ NÃO é forma de pagamento do cliente. O cliente paga pela tabela do cartão
// (proposal/cartao-solar.ts). Confundir os dois faria a proposta prometer um número
// e o contrato cobrar outro — foi exatamente o erro que a revisão pegou.
//
// A fórmula foi decifrada por engenharia reversa de 2 orçamentos reais do Junior (o
// mesmo carrinho, um com frete e outro sem). Uma regra só explica os dois:
//
//   total  = equipamentos + seguro (1% do equipamento) + frete (cotação)
//   PIX    = total × 0,93   (7% OFF)
//   financ = total × 0,90   (10% OFF)
//   cartão = base (PIX + 3,19% da operadora), parcelado em Price a 1,689% a.m.,
//            até 18x, sem juros até 3x
//
// ⚠️ A taxa NÃO veio da Solfácil — foi DEDUZIDA. Se eles mexerem nela, a conta sai
// errada e ninguém percebe. Daí o CONFERIDO_EM: quem usar isso pra decidir preço
// tem que reconferir na plataforma.
export const CONFERIDO_EM = '2026-07-13';

export interface TabelaKit {
  nome: string;
  /** Acréscimo da operadora sobre o valor à vista (0,0319 = 3,19%). */
  taxa: number;
  /** Juros ao mês do parcelamento (Price). */
  jurosMes: number;
  maxParcelas: number;
  semJurosAte: number;
  /** Desconto no PIX sobre o total (0,07 = 7% OFF). */
  descontoPix: number;
  /** Desconto no financiamento sobre o total (0,10 = 10% OFF). */
  descontoFinanciamento: number;
  /** Seguro cobrado sobre o valor dos equipamentos (0,01 = 1%). */
  seguro: number;
}

export const SOLFACIL: TabelaKit = {
  nome: 'Solfácil',
  taxa: 0.0319,
  // 5 dos 6 pontos reais fecham AO CENTAVO com esta taxa (só o de 4x fica ~17
  // centavos fora — vale reconferir aquele número na plataforma).
  jurosMes: 0.0168904,
  maxParcelas: 18,
  semJurosAte: 3,
  descontoPix: 0.07,
  descontoFinanciamento: 0.10,
  seguro: 0.01,
};

const arredondar = (v: number) => Math.round(v * 100) / 100;

export interface PrecoKit {
  equipamentos: number;
  seguro: number;
  frete: number;
  total: number;
  pix: number;
  financiamento: number;
  /** O valor sobre o qual o cartão parcela (PIX + taxa da operadora). */
  baseCartao: number;
}

/** O que a EcoSun paga pelo kit, em cada forma. */
export function precoDoKit(equipamentos: number, frete = 0, t: TabelaKit = SOLFACIL): PrecoKit | null {
  const e = Number(equipamentos);
  const f = Number(frete) || 0;
  if (!Number.isFinite(e) || e <= 0) return null;

  const seguro = arredondar(e * t.seguro);
  const total = arredondar(e + seguro + f);
  const pix = arredondar(total * (1 - t.descontoPix));
  return {
    equipamentos: e,
    seguro,
    frete: f,
    total,
    pix,
    financiamento: arredondar(total * (1 - t.descontoFinanciamento)),
    baseCartao: arredondar(pix * (1 + t.taxa)),
  };
}

export interface ParcelaKit {
  parcelas: number;
  parcela: number;
  total: number;
  comJuros: boolean;
}

/**
 * A parcela do cartão na plataforma da Solfácil (custo do kit).
 *
 * ⚠️ O ramo "sem juros até 3x" divide o valor do PIX PURO — mas isso nunca foi
 * conferido: as 2 tabelas reais só têm pontos de 4x pra cima. Se a Solfácil também
 * cobrar os 3,19% em 1-3x, a conta aqui está otimista. Confirmar com o Junior
 * olhando as linhas 1x/2x/3x da plataforma.
 */
export function parcelaKit(valorPix: number, parcelas: number, t: TabelaKit = SOLFACIL): ParcelaKit | null {
  const v = Number(valorPix);
  const n = Math.trunc(Number(parcelas));
  if (!Number.isFinite(v) || v <= 0) return null;
  if (!Number.isFinite(n) || n < 1 || n > t.maxParcelas) return null;

  if (n <= t.semJurosAte) {
    const parcela = arredondar(v / n);
    return { parcelas: n, parcela, total: arredondar(parcela * n), comJuros: false };
  }
  const base = v * (1 + t.taxa);
  const i = t.jurosMes;
  const parcela = arredondar((base * i) / (1 - Math.pow(1 + i, -n)));
  return { parcelas: n, parcela, total: arredondar(parcela * n), comJuros: true };
}

/** A tabela inteira (1x até o limite). */
export function tabelaKit(valorPix: number, t: TabelaKit = SOLFACIL): ParcelaKit[] {
  const linhas: ParcelaKit[] = [];
  for (let n = 1; n <= t.maxParcelas; n++) {
    const p = parcelaKit(valorPix, n, t);
    if (p) linhas.push(p);
  }
  return linhas;
}
