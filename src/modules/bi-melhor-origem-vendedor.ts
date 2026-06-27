import type { Channel } from './dashboard/resolve-channel.js';

type LeadOrigem = { canal: Channel; status: string };
type LeadVendedor = { claimedBy: string | null; status: string };

function topPorGanhos<K extends string>(
  items: { key: K; status: string }[],
): K | null {
  const contagem = new Map<K, number>();
  for (const { key, status } of items) {
    if (status !== 'ganho') continue;
    contagem.set(key, (contagem.get(key) ?? 0) + 1);
  }
  if (contagem.size === 0) return null;
  let melhor: K | null = null;
  let max = 0;
  for (const [key, total] of contagem) {
    if (total > max) { max = total; melhor = key; }
  }
  return melhor;
}

// Retorna o canal (origem) com mais leads ganhos, ou null se não há ganhos.
export function melhorOrigem(leads: LeadOrigem[]): Channel | null {
  return topPorGanhos(leads.map(l => ({ key: l.canal, status: l.status })));
}

// Retorna o nome do vendedor com mais leads ganhos, ou null se não há ganhos.
// Leads sem claimedBy são ignorados.
export function melhorVendedor(leads: LeadVendedor[]): string | null {
  const filtrados = leads
    .filter((l): l is { claimedBy: string; status: string } => l.claimedBy !== null);
  return topPorGanhos(filtrados.map(l => ({ key: l.claimedBy, status: l.status })));
}
