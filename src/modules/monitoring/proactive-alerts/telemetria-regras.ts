// src/modules/monitoring/proactive-alerts/telemetria-regras.ts
// Fase 2B do "alerta com motivo" (Thiago 28/07): vigias de TENSÃO e CORRENTE
// sobre as medições finas da telemetria (últimos 3 dias). Funções PURAS —
// quem busca dados e grava alertas é o ProactiveAlertService.
//
// Regra 1 — tensao_rede_alta: tensão da rede (pontos tensao_fase*) com máximo
//   diário acima de 242 V (rede 220 V +10%, faixa da NBR 16149) em ≥2 dos 3
//   dias. É o clássico "inversor desligando à tarde por sobretensão" —
//   problema da REDE, não da usina.
// Regra 2 — string_zerada: entrada FV (corrente_pv*/corrente_mppt*) com máximo
//   diário = 0 num dia em que a usina GEROU, em ≥2 dos 3 dias — string solta,
//   fusível ou conector. Usina parada não dispara (o offline já cobre).

export interface MedicaoFina {
  ponto: string;
  ts: string;     // ISO
  valor: number;
}

export interface AlertaTelemetria {
  tipo: 'tensao_rede_alta' | 'string_zerada';
  severidade: 'aviso';
  texto: string;
}

const LIMITE_TENSAO_V = 242;  // 220 V +10% (NBR 16149)
const MIN_DIAS = 2;           // recorrência mínima na janela de 3 dias

const ehTensaoRede = (p: string) => p.startsWith('tensao_fase');
const ehCorrenteEntrada = (p: string) => p.startsWith('corrente_pv') || p.startsWith('corrente_mppt');

// máximo por (ponto → dia)
function maxPorPontoDia(medicoes: MedicaoFina[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const med of medicoes) {
    const dia = med.ts.slice(0, 10);
    if (!out.has(med.ponto)) out.set(med.ponto, new Map());
    const dias = out.get(med.ponto)!;
    dias.set(dia, Math.max(dias.get(dia) ?? -Infinity, med.valor));
  }
  return out;
}

export function avaliarTelemetriaUsina(
  medicoes: MedicaoFina[],
  geracaoPorDia: Map<string, number>, // kWh por dia (mesma janela)
): AlertaTelemetria[] {
  const alertas: AlertaTelemetria[] = [];
  const porPonto = maxPorPontoDia(medicoes);

  // Regra 1 — tensão da rede alta (máximo do DIA entre todas as fases)
  const maxRedePorDia = new Map<string, number>();
  for (const [ponto, dias] of porPonto) {
    if (!ehTensaoRede(ponto)) continue;
    for (const [dia, max] of dias) {
      maxRedePorDia.set(dia, Math.max(maxRedePorDia.get(dia) ?? -Infinity, max));
    }
  }
  const diasAltos = [...maxRedePorDia.values()].filter((v) => v > LIMITE_TENSAO_V).length;
  if (diasAltos >= MIN_DIAS) {
    const pico = Math.max(...maxRedePorDia.values());
    alertas.push({
      tipo: 'tensao_rede_alta',
      severidade: 'aviso',
      texto: `Tensão da rede alta: pico de ${pico.toFixed(0)} V em ${diasAltos} dos últimos 3 dias (limite ~${LIMITE_TENSAO_V} V). O inversor pode estar desligando nos horários de pico — problema da REDE; vale abrir reclamação na concessionária.`,
    });
  }

  // Regra 2 — entrada FV sem corrente com a usina gerando
  const entradasZeradas: string[] = [];
  let maiorRecorrencia = 0;
  for (const [ponto, dias] of porPonto) {
    if (!ehCorrenteEntrada(ponto)) continue;
    let diasZerados = 0;
    for (const [dia, max] of dias) {
      if (max === 0 && (geracaoPorDia.get(dia) ?? 0) > 0) diasZerados++;
    }
    if (diasZerados >= MIN_DIAS) {
      entradasZeradas.push(ponto.replace('corrente_', ''));
      maiorRecorrencia = Math.max(maiorRecorrencia, diasZerados);
    }
  }
  if (entradasZeradas.length > 0) {
    const lista = entradasZeradas.sort().join(', ');
    alertas.push({
      tipo: 'string_zerada',
      severidade: 'aviso',
      texto: `Entrada(s) ${lista} sem corrente com a usina gerando, em ${maiorRecorrencia} dos últimos 3 dias — string solta, fusível ou conector. Recomendar visita técnica.`,
    });
  }

  return alertas;
}
