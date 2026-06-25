export function calcularEconomiaAnual(economiaMensalRs: number): number {
  return economiaMensalRs * 12;
}

// Retorna null quando economia <= 0 para evitar divisão por zero e payback sem sentido.
export function calcularPaybackAnos(investimentoRs: number, economiaMensalRs: number): number | null {
  if (economiaMensalRs <= 0) return null;
  return investimentoRs / (economiaMensalRs * 12);
}
