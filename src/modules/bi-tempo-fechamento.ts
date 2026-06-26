type LeadFechamento = {
  status: string;
  criadoEm: Date;
  ganhoEm: Date | null;
};

// Retorna o tempo médio em dias (1 casa decimal) entre criação e ganho.
// Só considera leads com status 'ganho' E ganhoEm preenchido.
// Retorna 0 se não há dados suficientes.
export function tempoMedioFechamento(leads: LeadFechamento[]): number {
  const dias = leads
    .filter(l => l.status === 'ganho' && l.ganhoEm !== null)
    .map(l => (l.ganhoEm!.getTime() - l.criadoEm.getTime()) / (24 * 60 * 60 * 1000));

  if (dias.length === 0) return 0;

  const media = dias.reduce((soma, d) => soma + d, 0) / dias.length;
  return Math.round(media * 10) / 10;
}
