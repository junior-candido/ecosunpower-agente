// Estimativa solar pra CONVERSA da Eva (qualificacao no WhatsApp).
//
// IMPORTANTE: usa o MESMO motor da proposta formal (proposal/calculator.ts) e os
// MESMOS parametros (solar-params.ts) — chat e proposta NUNCA divergem (regra do
// Junior, 04/06/2026). Geracao propositalmente CONSERVADORA (cliente recebe mais
// do que foi prometido). Economia NUNCA passa do valor da conta (vem de
// contaSem - contaCom, com Fio B da Lei 14.300). E aplica a TRAVA DE COERENCIA:
// se R$ da conta nao bate com o kWh lido, NAO apresenta numero — manda confirmar.

import {
  PAINEL_PADRAO_W,
  FATOR_PERDA_CONSERVADOR,
  hspPorConcessionaria,
  tarifaPorConcessionaria,
  tusdFioBPorConcessionaria,
  percentualFioBVigente,
  estimarConsumoDeConta,
  checarCoerenciaContaConsumo,
  REAJUSTE_ANUAL_ENERGIA,
  PERCENTUAL_GERACAO_INJETADA,
  CUSTO_ILUMINACAO_PUBLICA,
  VIDA_UTIL_ANOS,
} from './solar-params.js';
import {
  dimensionarSistema,
  calcular,
  precoMercadoEstimado,
} from './proposal/calculator.js';

export interface SolarEstimate {
  cityName: string;
  consumptionKwh: number;
  panelCount: number;
  panelWatts: number;
  systemPowerKwp: number;
  generationKwhMonth: number;   // conservadora
  monthlyEconomyBrl: number;    // limitada pela conta (nunca maior)
  annualEconomyBrl: number;
  paybackYears: string;         // faixa, ex "3 a 4"
  hsp: number;
  // Coerencia da leitura da conta:
  coerente: boolean;
  consumoEsperadoDaConta?: number;
  avisoCoerencia?: string;
}

function faixaPayback(anos: number): string {
  if (anos <= 0 || !isFinite(anos)) return 'a calcular';
  if (anos < 3) return '2 a 3';
  if (anos < 4) return '3 a 4';
  if (anos < 5) return '4 a 5';
  if (anos < 6) return '5 a 6';
  if (anos < 8) return '6 a 8';
  return 'acima de 8';
}

// Estima sistema solar pra usar na conversa. Recebe cidade + (conta OU consumo).
// Quando vierem OS DOIS, confere coerencia: se nao baterem, marca coerente=false
// e devolve aviso pra Eva confirmar o consumo antes de apresentar qualquer numero.
export async function calculateSolarEstimate(
  cityName: string,
  monthlyBill?: number,
  consumptionKwh?: number,
): Promise<SolarEstimate | null> {
  if (!monthlyBill && !consumptionKwh) return null;

  const tarifa = tarifaPorConcessionaria(cityName);
  const hsp = hspPorConcessionaria(cityName);

  let coerente = true;
  let avisoCoerencia: string | undefined;
  let consumoEsperadoDaConta: number | undefined;
  let consumo: number;

  if (monthlyBill && consumptionKwh) {
    const chk = checarCoerenciaContaConsumo(monthlyBill, consumptionKwh, tarifa);
    consumoEsperadoDaConta = chk.consumoEsperado;
    if (!chk.coerente) {
      coerente = false;
      avisoCoerencia =
        `INCOERENCIA: uma conta de R$ ${monthlyBill} corresponde a ~${chk.consumoEsperado} kWh/mes ` +
        `pela tarifa local, mas o consumo lido foi ${consumptionKwh} kWh. NAO apresente sistema, ` +
        `geracao nem economia ainda — confirme com o cliente o consumo real em kWh (ou peca a conta ` +
        `de novo) ANTES de calcular. Nunca invente numero.`;
    }
    // Para dimensionar (se coerente) usa o consumo lido; se incoerente, o estimado
    // pela conta e mais confiavel que o kWh suspeito.
    consumo = chk.coerente ? consumptionKwh : chk.consumoEsperado;
  } else if (consumptionKwh) {
    consumo = consumptionKwh;
  } else {
    consumo = estimarConsumoDeConta(monthlyBill as number, tarifa);
  }

  if (consumo <= 0) return null;

  const dim = dimensionarSistema({
    consumoMensalKwh: consumo,
    painelPotenciaW: PAINEL_PADRAO_W,
    hsp,
    fatorPerda: FATOR_PERDA_CONSERVADOR,
  });

  const valorTotal = precoMercadoEstimado(dim.kWpReal);
  const calc = calcular({
    potenciaKwp: dim.kWpReal,
    fatorPerda: FATOR_PERDA_CONSERVADOR,
    hsp,
    consumoMensalKwh: consumo,
    tarifaRsKwh: tarifa,
    reajusteAnualEnergia: REAJUSTE_ANUAL_ENERGIA,
    tusdFioBRsKwh: tusdFioBPorConcessionaria(cityName),
    percentualFioBVigente: percentualFioBVigente(new Date().getFullYear()),
    percentualGeracaoInjetada: PERCENTUAL_GERACAO_INJETADA,
    custoIluminacaoPublica: CUSTO_ILUMINACAO_PUBLICA,
    valorTotalRs: valorTotal,
    vidaUtilAnos: VIDA_UTIL_ANOS,
  });

  // Garantia DURA: a economia apresentada NUNCA pode passar do valor da conta que
  // o cliente declarou. (O motor ja limita por contaSem-contaCom, mas quando o
  // cliente informa o R$ da conta, travamos pelo valor real declarado — fecha o
  // furo do caminho conta+kWh com kWh no lado alto. Caso Marcelo, direcao oposta.)
  const economiaBruta = Math.max(0, Math.round(calc.economiaMensal));
  const economiaMensal = monthlyBill && monthlyBill > 0
    ? Math.min(economiaBruta, Math.round(monthlyBill))
    : economiaBruta;

  return {
    cityName,
    consumptionKwh: consumo,
    panelCount: dim.quantidadePaineis,
    panelWatts: PAINEL_PADRAO_W,
    systemPowerKwp: dim.kWpReal,
    generationKwhMonth: Math.round(calc.geracaoMensalKwh),
    monthlyEconomyBrl: economiaMensal,
    annualEconomyBrl: economiaMensal * 12,
    paybackYears: faixaPayback(calc.paybackAnos + calc.paybackMeses / 12),
    hsp,
    coerente,
    consumoEsperadoDaConta,
    avisoCoerencia,
  };
}

export function formatEstimateForPrompt(estimate: SolarEstimate): string {
  // Quando a leitura da conta esta incoerente, NAO entrega numeros pra Eva —
  // entrega a instrucao de confirmar com o cliente.
  if (!estimate.coerente) {
    return `
## ATENCAO — dados da conta inconsistentes (NAO calcule ainda)
${estimate.avisoCoerencia}
Peca o consumo certo de forma leve, ex: "deixa eu confirmar uma coisa rapidinho:
quantos kWh vem escrito na sua conta? quero te passar um numero certo, nao um chute."
`;
  }

  return `
## Estimativa de sistema para ${estimate.cityName} (CONSERVADORA — use como base, nao valor fechado)
- Consumo considerado: ${estimate.consumptionKwh} kWh/mes
- Sistema estimado: ${estimate.systemPowerKwp} kWp (~${estimate.panelCount} paineis de ${estimate.panelWatts}W)
- Geracao estimada: ~${estimate.generationKwhMonth} kWh/mes (calculo conservador — tende a gerar mais na pratica)
- Economia estimada: ~R$ ${estimate.monthlyEconomyBrl}/mes (R$ ${estimate.annualEconomyBrl}/ano)
- Payback aproximado: ${estimate.paybackYears} anos

REGRAS ao usar esses numeros:
- Apresente como ESTIMATIVA/base de mercado, nunca como valor fechado. O dimensionamento
  e o preco exatos quem fecha e o Junior (Responsavel Tecnico), vendo telhado e padrao de entrada.
- Fale geracao "em torno de" / economia "por volta de" — nunca cravado.
- NUNCA prometa economia maior que a conta atual do cliente.
- Use pra gerar desejo e conduzir pra visita tecnica ou Meet, nao pra despejar tabela.
`;
}
