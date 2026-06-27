type LeadReceita = { status: string; valor: number | null };

// Taxa só sobre leads com resultado final (ganho ou perdido).
// Incluir ativos distorceria a taxa pra baixo enquanto o funil está cheio.
function calcTaxa(leads: LeadReceita[]): number {
  const concluidos = leads.filter(l => l.status === 'ganho' || l.status === 'perdido');
  if (concluidos.length === 0) return 0;
  return concluidos.filter(l => l.status === 'ganho').length / concluidos.length;
}

// Receita prevista = soma dos valores em aberto × taxa de conversão histórica.
// Leads ativos = não são 'ganho' nem 'perdido'.
// Leads sem valor (null ou <= 0) são ignorados na soma.
// A taxa histórica é calculada sobre TODOS os leads da lista.
export function receitaPrevista(leads: LeadReceita[]): number {
  if (leads.length === 0) return 0;

  const taxa = calcTaxa(leads);

  const somaAtivos = leads
    .filter(l => l.status !== 'ganho' && l.status !== 'perdido')
    .filter(l => l.valor !== null && l.valor > 0)
    .reduce((soma, l) => soma + l.valor!, 0);

  return Math.round(somaAtivos * taxa * 100) / 100;
}
