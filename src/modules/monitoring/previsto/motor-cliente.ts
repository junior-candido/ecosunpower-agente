// Cliente do motor de geração (simulador-fv/motor, serviço interno no EasyPanel).
// MOTOR_URL + MOTOR_TOKEN no ambiente. Sem MOTOR_URL = recurso desligado.
import type { Premissas } from './premissas.js';

export interface PrevistoDoDia {
  data: string;
  kwh: number;
  kwh_hora: number[];
  ghi_kwh_m2: number;
  poa_kwh_m2: number;
  indice_ceu: number | null;
  clima: 'limpo' | 'parcial' | 'nublado' | 'chuva' | 'sem_dado';
  horas_sem_dado: number;
  fonte_clima: string;
  versao_modelo: string;
}

export interface ConfigMotor {
  url: string;
  token?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export function configMotorDoAmbiente(env: NodeJS.ProcessEnv = process.env): ConfigMotor | null {
  const url = (env.MOTOR_URL ?? '').trim().replace(/\/+$/, '');
  if (!url) return null;
  return { url, token: env.MOTOR_TOKEN?.trim() || undefined };
}

export async function previstoDoDia(cfg: ConfigMotor, p: Premissas, data: string): Promise<PrevistoDoDia> {
  const f = cfg.fetchImpl ?? fetch;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), cfg.timeoutMs ?? 30_000);
  try {
    const r = await f(`${cfg.url}/simular-dia`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}) },
      body: JSON.stringify({
        lat: p.lat, lon: p.lon, kwp: p.kwp, inclinacao: p.inclinacao, azimute: p.azimute,
        tipo_instalacao: p.tipo_instalacao, sombreamento: p.sombreamento, data,
      }),
      signal: ctl.signal,
    });
    if (!r.ok) throw new Error(`motor HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = (await r.json()) as PrevistoDoDia;
    if (typeof j?.kwh !== 'number' || !Array.isArray(j.kwh_hora)) throw new Error('motor: resposta sem kwh');
    return j;
  } finally {
    clearTimeout(t);
  }
}

/** Multi-arranjo: uma chamada por água e soma (kWh e curva). Sem arranjos = chamada única. */
export async function previstoDoDiaTotal(cfg: ConfigMotor, p: Premissas, data: string): Promise<PrevistoDoDia> {
  if (!p.arranjos?.length) return previstoDoDia(cfg, p, data);
  let total: PrevistoDoDia | null = null;
  for (const a of p.arranjos) {
    const r = await previstoDoDia(cfg, { ...p, kwp: a.kwp, azimute: a.azimute, inclinacao: a.inclinacao, arranjos: undefined }, data);
    if (!total) { total = { ...r, kwh_hora: [...r.kwh_hora] }; continue; }
    total.kwh = Math.round((total.kwh + r.kwh) * 100) / 100;
    total.kwh_hora = total.kwh_hora.map((v, h) => Math.round((v + (r.kwh_hora[h] ?? 0)) * 1000) / 1000);
    // POA: média ponderada pela potência (é por m², não soma)
    total.poa_kwh_m2 = Math.round(((total.poa_kwh_m2 * (p.kwp - a.kwp) + r.poa_kwh_m2 * a.kwp) / p.kwp) * 1000) / 1000;
  }
  return total as PrevistoDoDia;
}

export interface ResultadoCalibracao {
  azimute: number;
  inclinacao: number;
  fator: number;
  erro_forma: number;
  erro_referencia: number;
  confianca: 'alta' | 'media' | 'baixa';
  dias_usados: number;
  horas_usadas: number;
  mapa: { azimute: number; inclinacao: number; erro: number }[];
  versao_modelo: string;
}

/** Curvas reais de dias limpos → orientação/inclinação (motor /calibrar). */
export async function calibrarNoMotor(
  cfg: ConfigMotor,
  p: { lat: number; lon: number; kwp: number; tipo_instalacao: string; refAzimute: number; refInclinacao: number },
  dias: { data: string; real_hora: number[] }[],
): Promise<ResultadoCalibracao> {
  const f = cfg.fetchImpl ?? fetch;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), cfg.timeoutMs ?? 120_000);
  try {
    const r = await f(`${cfg.url}/calibrar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}) },
      body: JSON.stringify({
        lat: p.lat, lon: p.lon, kwp: p.kwp, tipo_instalacao: p.tipo_instalacao,
        ref_azimute: p.refAzimute, ref_inclinacao: p.refInclinacao, dias,
      }),
      signal: ctl.signal,
    });
    if (!r.ok) throw new Error(`motor HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = (await r.json()) as ResultadoCalibracao;
    if (typeof j?.azimute !== 'number') throw new Error('motor: resposta sem azimute');
    return j;
  } finally {
    clearTimeout(t);
  }
}
