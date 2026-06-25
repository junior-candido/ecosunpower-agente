export function taxaConversao(leads: { status: string }[]): number {
  if (leads.length === 0) return 0;
  const ganhos = leads.filter(l => l.status === 'ganho').length;
  return (ganhos / leads.length) * 100;
}

// Ignora valores <= 0 pois ticket de venda zero não faz sentido no negócio.
// Retorna 0 quando não há valores positivos.
export function ticketMedio(valores: number[]): number {
  const positivos = valores.filter(v => v > 0);
  if (positivos.length === 0) return 0;
  return positivos.reduce((soma, v) => soma + v, 0) / positivos.length;
}

export function distribuicaoPorEtapa(leads: { status: string }[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const lead of leads) {
    result[lead.status] = (result[lead.status] ?? 0) + 1;
  }
  return result;
}
