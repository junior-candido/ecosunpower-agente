// Situação do dia: compara o que a usina GEROU com o que DEVERIA ter gerado
// com o sol daquele dia. Regras de ouro: falta de dado não é zero; falha de
// comunicação não é falha de geração; dia nublado não alarma sozinho.

export type Clima = 'limpo' | 'parcial' | 'nublado' | 'chuva' | 'sem_dado';
export type Situacao = 'normal' | 'abaixo' | 'muito_abaixo' | 'dia_fraco' | 'sem_comunicacao' | 'sem_previsto';

/** Faixas iniciais (ajustar com os dados reais da carteira). */
export const FAIXAS = { abaixo: -10, muitoAbaixo: -20 } as const;

export function diferencaPct(previsto: number | null, real: number | null): number | null {
  if (previsto == null || real == null || !(previsto > 0.5)) return null;
  return Math.round(((real - previsto) / previsto) * 1000) / 10;
}

export function situacaoDoDia(p: { previsto: number | null; real: number | null; clima: Clima | null }): Situacao {
  if (p.previsto == null) return 'sem_previsto';
  if (p.real == null) return 'sem_comunicacao';
  const d = diferencaPct(p.previsto, p.real);
  if (d == null) return 'dia_fraco'; // previsto ~0 (dia muito escuro): nada a julgar
  const diaRuim = p.clima === 'nublado' || p.clima === 'chuva';
  if (d >= FAIXAS.abaixo) return diaRuim ? 'dia_fraco' : 'normal';
  // Em dia nublado/chuva o previsto é pequeno e a incerteza do satélite é
  // grande: rebaixa um degrau (nunca "muito abaixo" por causa de nuvem).
  if (diaRuim) return d >= FAIXAS.muitoAbaixo ? 'dia_fraco' : 'abaixo';
  return d >= FAIXAS.muitoAbaixo ? 'abaixo' : 'muito_abaixo';
}

/** Alerta só com 2 dias SEGUIDOS "muito abaixo" (lista do mais antigo ao mais novo). */
export function precisaAlertar(ultimos: Situacao[]): boolean {
  const n = ultimos.length;
  return n >= 2 && ultimos[n - 1] === 'muito_abaixo' && ultimos[n - 2] === 'muito_abaixo';
}

/** Desvio de um período: soma real ÷ soma previsto, só nos dias com os dois. */
export function desvioPeriodo(dias: { previsto: number | null; real: number | null }[]): number | null {
  let p = 0, r = 0;
  for (const d of dias) if (d.previsto != null && d.real != null && d.previsto > 0.5) { p += d.previsto; r += d.real; }
  return p > 0 ? Math.round(((r - p) / p) * 1000) / 10 : null;
}

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  normal: '✅ Normal', abaixo: '🟠 Abaixo', muito_abaixo: '🔴 Muito abaixo',
  dia_fraco: '🌧️ Dia fraco, normal', sem_comunicacao: '📡 Sem comunicação', sem_previsto: '— Sem previsto',
};
