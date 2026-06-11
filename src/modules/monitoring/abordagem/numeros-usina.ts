// src/modules/monitoring/abordagem/numeros-usina.ts
// PURO: números que entram nas mensagens. A IA NUNCA calcula — recebe pronto.

export interface GeracaoDia { data: string; geracao_kwh: number }

export function numerosTrimestre(
  geracoes: GeracaoDia[],
  tarifaRsPorKwh: number,
  hoje: Date,
): { kwh: number; reais: number } | null {
  const corte = new Date(hoje.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const noPeriodo = geracoes.filter((g) => g.data >= corte);
  if (noPeriodo.length === 0) return null;
  const kwh = Math.round(noPeriodo.reduce((s, g) => s + Number(g.geracao_kwh), 0) * 10) / 10;
  if (!(kwh > 0)) return null;
  return { kwh, reais: Math.round(kwh * tarifaRsPorKwh * 100) / 100 };
}

// % de melhora da média diária: mín. 5 dias de cada lado pra não comemorar ruído.
export function recuperacaoPosLimpeza(kwhAntes: number[], kwhDepois: number[]): number | null {
  if (kwhAntes.length < 5 || kwhDepois.length < 5) return null;
  const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  const mAntes = media(kwhAntes);
  if (mAntes <= 0) return null;
  return Math.round(((media(kwhDepois) - mAntes) / mAntes) * 100);
}
