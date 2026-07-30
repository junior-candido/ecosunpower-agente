// src/modules/cobranca-forma.ts
// Par de links + vigia da forma (097). A InfinitePay não deixa travar a
// forma de pagamento no link, então: (1) geramos UM link por forma, cada um
// com o preço certo daquela forma (repasse "na unha", conta ÷(1−taxa));
// (2) o webhook compara COMO o cliente pagou com o combinado e o vigia
// devolve a mensagem da diferença pro zap do Junior.
// FONTE ÚNICA das taxas: JUROS_CARTAO_SERVICO (conferida na maquininha real).

import { JUROS_CARTAO_SERVICO } from './proposal/service-payment.js';

const fmtRs = (c: number) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface LinkDoPar {
  forma: string;             // 'pix' | 'cartao-12'
  valorCentavos: number;     // o que o CLIENTE paga
  taxaPct: number;           // taxa embutida
  parcelaCentavos?: number;  // valor de cada parcela (cartão)
}

/** Preços do par: Pix = líquido; cartão N× = líquido ÷ (1 − taxa). */
export function montarParDeLinks(valorLiquidoCentavos: number, parcelasCartao = 12): { pix: LinkDoPar; cartao: LinkDoPar } {
  const taxa = JUROS_CARTAO_SERVICO[parcelasCartao];
  if (!taxa) throw new Error(`Parcela inválida: ${parcelasCartao}`);
  const total = Math.round(valorLiquidoCentavos / (1 - taxa / 100));
  return {
    pix: { forma: 'pix', valorCentavos: valorLiquidoCentavos, taxaPct: 0 },
    cartao: {
      forma: `cartao-${parcelasCartao}`, valorCentavos: total, taxaPct: taxa,
      parcelaCentavos: Math.round(total / parcelasCartao),
    },
  };
}

/** Estima o líquido que o Junior recebe dado o valor pago e a forma REAL. */
function liquidoEstimado(valorPagoCentavos: number, metodo: string | undefined, parcelas: number | undefined): number {
  if (metodo !== 'credit_card') return valorPagoCentavos; // Pix ≈ sem taxa
  const taxa = JUROS_CARTAO_SERVICO[parcelas ?? 1] ?? JUROS_CARTAO_SERVICO[1]!;
  return Math.round(valorPagoCentavos * (1 - taxa / 100));
}

/**
 * O vigia: pagou diferente do combinado? Devolve a mensagem pro zap do
 * Junior (com a diferença calculada) ou null se está tudo certo/compatível.
 */
export function analisarFormaPaga(
  cob: { formaCombinada: string | null; valorLiquidoCentavos: number | null; valorCentavos: number },
  pago: { metodo?: string; parcelas?: number },
): string | null {
  if (!cob.formaCombinada || !cob.valorLiquidoCentavos) return null; // cobrança antiga/simples
  const esperadoLiquido = cob.valorLiquidoCentavos;
  const pagouCartao = pago.metodo === 'credit_card';
  const combinadaCartao = cob.formaCombinada.startsWith('cartao');

  if (!combinadaCartao && !pagouCartao) return null; // pix combinado, pix pago ✓
  if (combinadaCartao && pagouCartao) {
    const parcelasCombinadas = Number(cob.formaCombinada.split('-')[1] ?? 12);
    const parcelasPagas = pago.parcelas ?? parcelasCombinadas;
    if (parcelasPagas >= parcelasCombinadas) return null; // pagou como (ou acima do) combinado ✓
    const liquido = liquidoEstimado(cob.valorCentavos, pago.metodo, parcelasPagas);
    const sobra = liquido - esperadoLiquido;
    return `ℹ️ Cliente pagou no cartão em ${parcelasPagas}× (o link era de ${parcelasCombinadas}×). ` +
      `Taxa menor → sobraram ≈ R$ ${fmtRs(Math.max(0, sobra))} além do combinado. Se quiser, abate/devolve.`;
  }

  const liquido = liquidoEstimado(cob.valorCentavos, pago.metodo, pago.parcelas);
  const diferenca = liquido - esperadoLiquido;
  if (!combinadaCartao && pagouCartao) {
    return `⚠️ ATENÇÃO: o link era do PIX mas o cliente pagou no CARTÃO em ${pago.parcelas ?? '?'}×. ` +
      `Você vai receber ≈ R$ ${fmtRs(liquido)} — FALTAM ≈ R$ ${fmtRs(Math.abs(diferenca))} do combinado (R$ ${fmtRs(esperadoLiquido)}). ` +
      `Combina o ajuste com o cliente.`;
  }
  // combinada cartão, pagou Pix: pagou o total com taxa embutida sem taxa real → sobrou.
  return `ℹ️ Cliente pagou no Pix o link do cartão — sobraram ≈ R$ ${fmtRs(Math.max(0, diferenca))} além do combinado (R$ ${fmtRs(esperadoLiquido)}). Se quiser, devolve/abate a diferença.`;
}
