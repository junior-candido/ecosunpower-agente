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
