// Curva do inversor (pontos de potência ao longo do dia) → kWh por hora 0..23.
// Integra kW × tempo entre pontos vizinhos (trapézio). Buraco maior que 20 min
// conta como SEM geração — portal que omite os zeros do nascer/pôr do sol não
// pode inflar as horas das pontas (justamente as que mostram Leste × Oeste).
const BURACO_MAX_MIN = 20;

const minutos = (hora: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hora));
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v >= 0 && v < 24 * 60 ? v : null;
};

/** Pontos do inversor (kW em "HH:MM") → kWh por hora 0..23. */
export function curvaPorHora(pontos: { hora: string; kw: number }[]): number[] | null {
  const pts = pontos
    .map((p) => ({ t: minutos(p.hora), kw: Number(p.kw) }))
    .filter((p): p is { t: number; kw: number } => p.t !== null && Number.isFinite(p.kw))
    .sort((a, b) => a.t - b.t);
  if (!pts.length) return null;
  const horas = Array(24).fill(0) as number[];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dt = b.t - a.t;
    if (dt <= 0 || dt > BURACO_MAX_MIN) continue;
    // reparte o segmento entre as horas que ele cruza
    for (let t = a.t; t < b.t; ) {
      const fimHora = (Math.floor(t / 60) + 1) * 60;
      const ate = Math.min(fimHora, b.t);
      const kwIni = a.kw + ((b.kw - a.kw) * (t - a.t)) / dt;
      const kwFim = a.kw + ((b.kw - a.kw) * (ate - a.t)) / dt;
      horas[Math.floor(t / 60)] += (Math.max(0, kwIni) + Math.max(0, kwFim)) / 2 * ((ate - t) / 60);
      t = ate;
    }
  }
  return horas.map((v) => Math.round(v * 1000) / 1000);
}
