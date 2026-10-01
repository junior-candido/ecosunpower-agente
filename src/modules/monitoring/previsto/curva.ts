// Curva do inversor (pontos de potência ao longo do dia) → kWh por hora 0..23.
/** Pontos do inversor (kW em "HH:MM") → kWh por hora 0..23. */
export function curvaPorHora(pontos: { hora: string; kw: number }[]): number[] | null {
  if (!pontos.length) return null;
  const somas = Array(24).fill(0), qtd = Array(24).fill(0);
  for (const p of pontos) {
    const h = Number(String(p.hora).slice(0, 2));
    if (Number.isInteger(h) && h >= 0 && h < 24 && Number.isFinite(p.kw)) { somas[h] += p.kw; qtd[h]++; }
  }
  return somas.map((s, h) => (qtd[h] ? Math.round((s / qtd[h]) * 1000) / 1000 : 0));
}
