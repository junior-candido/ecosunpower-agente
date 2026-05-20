// src/modules/monitoring/proactive-alerts/janela.ts
// Janela horária dos alertas proativos. Pura: recebe Date, retorna boolean.
// Default tz=America/Sao_Paulo (BRT, UTC-3, sem DST desde 2019).

export function dentroDaJanela(d: Date, tz = 'America/Sao_Paulo'): boolean {
  // Extrai dia da semana e hora no fuso alvo via Intl (sem libs externas).
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0';
  const minuteStr = parts.find((p) => p.type === 'minute')?.value ?? '0';
  // Intl pode devolver "24" às vezes; normalizar
  const hour = Number(hourStr) === 24 ? 0 : Number(hourStr);
  const minute = Number(minuteStr);
  const totalMin = hour * 60 + minute;

  const dowMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dow = dowMap[weekday] ?? -1;

  if (dow === 0) return false;                              // domingo
  if (dow === 6) return totalMin >= 9 * 60 && totalMin < 20 * 60;  // sábado 9-20
  return totalMin >= 8 * 60 && totalMin < 20 * 60;          // seg-sex 8-20
}
