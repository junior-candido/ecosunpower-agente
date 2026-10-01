// Previsto × Real (Energy Studio, Marco 1 — 01/10/2026).
// Premissas físicas de cada usina a partir do cadastro (sistemas_clientes).
// Regra: o que falta no cadastro é ESTIMADO e fica escrito em `estimados`
// (a tela mostra); sem posição no mapa ou sem kWp → não calcula (nunca chuta).

/** Telhado em letras (cadastro) → azimute do motor (0 = Norte, 90 = Leste). */
const AZIMUTE: Record<string, number> = { N: 0, NE: 45, L: 90, SE: 135, S: 180, SO: 225, O: 270, NO: 315 };

export function azimuteDeOrientacao(orientacao: string | null | undefined): number | null {
  const k = String(orientacao ?? '').trim().toUpperCase();
  return k in AZIMUTE ? AZIMUTE[k] : null;
}

/** Tipo de telhado do cadastro → tipo de montagem do motor (troca de calor do módulo). */
export function tipoInstalacao(telhadoTipo: string | null | undefined): string {
  switch (String(telhadoTipo ?? '').toLowerCase()) {
    case 'laje': return 'laje';
    case 'solo': return 'solo';
    default: return 'telhado_ventilado'; // cerâmica/fibrocimento/metálico: trilho com vão
  }
}

export interface SistemaCadastro {
  id: string;
  company_id: string;
  potencia_kwp: number | string | null;
  lat: number | null;
  lng: number | null;
  telhado_tipo?: string | null;
  telhado_orientacao?: string | null;
  telhado_inclinacao_graus?: number | null;
  sombreamento_pct?: number | null;
}

export interface Premissas {
  lat: number;
  lon: number;
  kwp: number;
  inclinacao: number;
  azimute: number;
  tipo_instalacao: string;
  sombreamento: number;
  /** O que não veio do cadastro (a tela avisa "estimado"). */
  estimados: string[];
  /** O que veio da calibração automática (forma da curva real). */
  calibrados?: string[];
  /** Cadastro diz uma orientação e a curva real indica outra (confiança alta, > 45°). */
  divergencia?: { cadastro: number; curva: number };
}

/** Calibração automática da usina (tabela previsto_calibracao, status ok). */
export interface CalibracaoUsina {
  azimute: number;
  inclinacao: number;
  confianca: 'alta' | 'media' | 'baixa';
}

const distAngulo = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };

export type MotivoSemPremissa = 'sem_posicao' | 'sem_kwp';

export function montarPremissas(s: SistemaCadastro, calib?: CalibracaoUsina | null): Premissas | { erro: MotivoSemPremissa } {
  const kwp = Number(s.potencia_kwp);
  if (!Number.isFinite(kwp) || kwp <= 0) return { erro: 'sem_kwp' };
  if (s.lat == null || s.lng == null || !Number.isFinite(s.lat) || !Number.isFinite(s.lng)) return { erro: 'sem_posicao' };
  const estimados: string[] = [];
  const calibrados: string[] = [];
  // Calibração só substitui o que FALTA no cadastro, e só com confiança alta.
  const usarCalib = calib && calib.confianca === 'alta' ? calib : null;
  const cadAz = azimuteDeOrientacao(s.telhado_orientacao);
  let azimute: number;
  let divergencia: Premissas['divergencia'];
  if (cadAz != null) {
    azimute = cadAz;
    if (usarCalib && distAngulo(cadAz, usarCalib.azimute) > 45) divergencia = { cadastro: cadAz, curva: usarCalib.azimute };
  } else if (usarCalib) { azimute = usarCalib.azimute; calibrados.push('orientação'); } else { azimute = 0; estimados.push('orientação (Norte)'); }
  let inclinacao = Number(s.telhado_inclinacao_graus);
  if (s.telhado_inclinacao_graus == null || !Number.isFinite(inclinacao) || inclinacao < 0 || inclinacao > 90) {
    // A inclinação do ajuste só vale junto com a orientação do MESMO ajuste.
    if (usarCalib && cadAz == null) { inclinacao = usarCalib.inclinacao; calibrados.push('inclinação'); } else { inclinacao = 15; estimados.push('inclinação (15°)'); }
  }
  const sombra = Number(s.sombreamento_pct);
  const sombreamento = s.sombreamento_pct != null && Number.isFinite(sombra) && sombra >= 0 && sombra < 100 ? sombra / 100 : 0;
  return {
    lat: s.lat, lon: s.lng, kwp, inclinacao, azimute,
    tipo_instalacao: tipoInstalacao(s.telhado_tipo), sombreamento, estimados,
    ...(calibrados.length ? { calibrados } : {}),
    ...(divergencia ? { divergencia } : {}),
  };
}
