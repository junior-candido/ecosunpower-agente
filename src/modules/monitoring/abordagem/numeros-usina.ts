// src/modules/monitoring/abordagem/numeros-usina.ts
// PURO: números que entram nas mensagens. A IA NUNCA calcula — recebe pronto.

export interface GeracaoDia { data: string; geracao_kwh: number }

const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// Números do MÊS pro relatório. dia<=5 → mês anterior completo; senão mês
// corrente (dia 1 → hoje, parcial). Datas comparadas como 'YYYY-MM-DD'.
export function numerosMes(
  geracoes: GeracaoDia[],
  tarifaRsPorKwh: number,
  hoje: Date,
): { kwh: number; reais: number; mesLabel: string; parcial: boolean } | null {
  const inicioDoMes = hoje.getUTCDate() <= 5;
  let ano = hoje.getUTCFullYear();
  let mes = hoje.getUTCMonth(); // 0-based
  let parcial = true;
  if (inicioDoMes) { mes -= 1; if (mes < 0) { mes = 11; ano -= 1; } parcial = false; }
  const inicio = `${ano}-${String(mes + 1).padStart(2, '0')}-01`;
  const fim = parcial
    ? hoje.toISOString().slice(0, 10)
    : new Date(Date.UTC(ano, mes + 1, 0)).toISOString().slice(0, 10); // último dia do mês
  const noPeriodo = geracoes.filter((g) => g.data >= inicio && g.data <= fim);
  if (noPeriodo.length === 0) return null;
  const kwh = Math.round(noPeriodo.reduce((s, g) => s + Number(g.geracao_kwh), 0) * 10) / 10;
  if (!(kwh > 0)) return null;
  if (!(tarifaRsPorKwh > 0)) return null;
  return { kwh, reais: Math.round(kwh * tarifaRsPorKwh * 100) / 100, mesLabel: MESES_PT[mes], parcial };
}

// % de melhora da média diária: mín. 5 dias de cada lado pra não comemorar ruído.
// Dias zerados (offline) derrubam a média e inflam o % — fora. >200% é suspeito → null.
export function recuperacaoPosLimpeza(kwhAntes: number[], kwhDepois: number[]): number | null {
  const semZeros = (a: number[]) => a.filter((x) => x > 0);
  const antes = semZeros(kwhAntes);
  const depois = semZeros(kwhDepois);
  if (antes.length < 5 || depois.length < 5) return null;
  const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  const mAntes = media(antes);
  if (mAntes <= 0) return null;
  const pct = Math.round(((media(depois) - mAntes) / mAntes) * 100);
  if (pct > 200) return null;
  return pct;
}
