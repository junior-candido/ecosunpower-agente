// src/modules/energia/conciliacao.ts
//
// Conferência do mês: o que o Shelly mediu × o que a Neoenergia faturou
// (demonstrativos_gd, migration 130). Spec §4.5.
//
// LIMITAÇÃO (dita na tela): o ciclo de leitura da Neoenergia NÃO é o mês civil
// e o demonstrativo não traz as datas de leitura. Por isso a comparação usa o
// mês civil e a tolerância é LARGA:
//   bate     → |dif| ≤ max(5% do faturado, 10 kWh)
//   atenção  → até 15%
//   diverge  → acima de 15%
//   sem dado → cobertura do mês < 97% ou valor ausente de um dos lados
//              (com pouco dado o "bate"/"diverge" seria chute — a tela
//              mostra os números apagados, só de referência)

export type Veredito = 'bate' | 'atencao' | 'diverge' | 'sem_dado';

export interface LinhaConciliacao {
  grandeza: 'injetado' | 'consumo';
  medidoKwh: number | null;
  distribuidoraKwh: number | null;
  difPct: number | null;
  veredito: Veredito;
  texto: string;
}

export const COBERTURA_MINIMA_MES_PCT = 97;
const AVISO_CICLO = 'A diferença pode ser o dia de leitura da Neoenergia (o ciclo de leitura dela não é o mês do calendário).';

const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

export function conciliarComDemonstrativo(e: {
  referencia: string;                 // YYYY-MM-01
  exportadoMesKwh: number | null;
  importadoMesKwh: number | null;
  coberturaMesPct: number;
  demonstrativo: { injetado_kwh: number | null; consumo_kwh: number | null } | null;
}): LinhaConciliacao[] {
  const pares: Array<{ grandeza: 'injetado' | 'consumo'; medido: number | null; dist: number | null; nome: string; nomeDist: string }> = [
    { grandeza: 'injetado', medido: e.exportadoMesKwh, dist: e.demonstrativo?.injetado_kwh ?? null, nome: 'devolvido à rede', nomeDist: 'injetado' },
    { grandeza: 'consumo', medido: e.importadoMesKwh, dist: e.demonstrativo?.consumo_kwh ?? null, nome: 'comprado da rede', nomeDist: 'consumo' },
  ];
  return pares.map((p): LinhaConciliacao => {
    const semDado = (texto: string): LinhaConciliacao => ({
      grandeza: p.grandeza, medidoKwh: p.medido, distribuidoraKwh: p.dist, difPct: null, veredito: 'sem_dado', texto,
    });
    if (!e.demonstrativo) return semDado('Ainda não chegou o demonstrativo da Neoenergia deste mês.');
    if (!(e.coberturaMesPct >= COBERTURA_MINIMA_MES_PCT)) {
      return semDado(`O medidor tem dado de só ${fmt(Math.max(0, e.coberturaMesPct))}% do mês — pouco para comparar (precisa de ${COBERTURA_MINIMA_MES_PCT}%).`);
    }
    if (p.medido == null || !Number.isFinite(p.medido)) return semDado(`Sem o ${p.nome} medido neste mês.`);
    if (p.dist == null || !Number.isFinite(Number(p.dist))) return semDado(`O demonstrativo não trouxe o ${p.nomeDist}.`);
    const dist = Number(p.dist);
    const dif = p.medido - dist;
    const difPct = dist !== 0 ? (dif / dist) * 100 : null;
    const tolerancia = Math.max(Math.abs(dist) * 0.05, 10);
    let veredito: Veredito;
    if (Math.abs(dif) <= tolerancia) veredito = 'bate';
    else if (difPct !== null && Math.abs(difPct) <= 15) veredito = 'atencao';
    else veredito = 'diverge';
    const inicio = veredito === 'bate' ? 'Bate' : veredito === 'atencao' ? 'Diferença moderada' : 'Diferença grande';
    const pct = difPct === null ? '' : ` (${difPct > 0 ? '+' : ''}${difPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)`;
    return {
      grandeza: p.grandeza, medidoKwh: p.medido, distribuidoraKwh: dist, difPct, veredito,
      texto: `${inicio}: medido ${fmt(p.medido)} kWh × Neoenergia ${fmt(dist)} kWh${pct}. ${AVISO_CICLO}`,
    };
  });
}
