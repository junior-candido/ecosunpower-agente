// Travas de exatidão do demonstrativo + geração do mês (Junior 23/09/2026:
// "tem que ler exato pra gerar um PDF realista"). Função PURA: recebe os
// números já lidos e diz se o mês está pronto pro relatório, falta dado, está
// inconsistente ou sem cliente. O PDF (fatia 2) só sai com estado 'pronto'.
// Ver docs/superpowers/specs/2026-09-23-demonstrativos-tela-relatorio-design.md.

import { esperadoDiaKwh } from '../monitoring/classificacao.js';

export type EstadoGd = 'pronto' | 'falta_dado' | 'inconsistente' | 'sem_cliente';

export interface EntradaValidacao {
  leadId: string | null;
  referencia: string; // YYYY-MM-01
  injetadoKwh: number | null;
  /** `inconsistencias` gravadas na leitura do PDF/e-mail. */
  inconsistenciasLeitura: string[];
  /** Geração informada à mão (digitada; na fatia 3 também por print). */
  geracaoManualKwh: number | null;
  /** Soma da geracao_diaria do mês (API do monitoramento). */
  geracaoApiKwh: number | null;
  potenciaKwp: number | null;
  uf: string | null;
}

export interface ResultadoValidacao {
  estado: EstadoGd;
  /** 🔴 — impedem o relatório. */
  bloqueios: string[];
  /** 🟡/⚪ — falta algo. */
  pendencias: string[];
  /** Informativo, não bloqueia. */
  avisos: string[];
  geracaoKwh: number | null;
  origemGeracao: 'manual' | 'api' | null;
  esperadoMesKwh: number | null;
}

export const TOL_MANUAL_API = 0.03;
export const FAIXA_PLAUSIVEL = { min: 0.4, max: 1.6 } as const;
// Nota que a ingestão põe quando o DKIM não confere com a Neoenergia. Enquanto
// não soubermos com qual domínio ela assina, não pode travar o relatório.
const RE_REMETENTE = /remetente não verificado/i;

const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const r2 = (v: number) => Math.round(v * 100) / 100;

export function diasNoMes(referencia: string): number {
  const [a, m] = referencia.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

/** Geração esperada no mês pro tamanho da usina (mesma régua do monitoramento). */
export function esperadoMes(potenciaKwp: number | null, uf: string | null, referencia: string): number | null {
  if (!potenciaKwp || potenciaKwp <= 0) return null;
  const v = r2(esperadoDiaKwh(potenciaKwp, uf) * diasNoMes(referencia));
  return Number.isFinite(v) ? v : null;
}

export function validarMes(e: EntradaValidacao): ResultadoValidacao {
  const bloqueios: string[] = [];
  const pendencias: string[] = [];
  const avisos: string[] = [];

  for (const i of e.inconsistenciasLeitura) (RE_REMETENTE.test(i) ? avisos : bloqueios).push(i);

  const origemGeracao = e.geracaoManualKwh !== null ? 'manual' : e.geracaoApiKwh !== null ? 'api' : null;
  const geracaoKwh = e.geracaoManualKwh ?? e.geracaoApiKwh;
  const esperadoMesKwh = esperadoMes(e.potenciaKwp, e.uf, e.referencia);

  if (e.leadId === null) pendencias.push('UC sem cliente — ligue a um cliente cadastrado');

  if (geracaoKwh === null) {
    pendencias.push('falta a geração do mês (monitoramento ou digitada)');
  } else {
    if (e.injetadoKwh !== null && geracaoKwh + 0.01 < e.injetadoKwh) {
      bloqueios.push(`geração ${fmt(geracaoKwh)} kWh menor que o injetado ${fmt(e.injetadoKwh)} kWh — a usina não injeta mais do que gera`);
    }
    if (esperadoMesKwh === null) {
      avisos.push('sem kWp cadastrado — não deu pra conferir se a geração é plausível');
    } else {
      const razao = geracaoKwh / esperadoMesKwh;
      if (razao < FAIXA_PLAUSIVEL.min || razao > FAIXA_PLAUSIVEL.max) {
        bloqueios.push(`geração ${fmt(geracaoKwh)} kWh fora do esperado pra esta usina (~${fmt(esperadoMesKwh)} kWh no mês)`);
      }
    }
    if (e.geracaoManualKwh !== null && e.geracaoApiKwh !== null && e.geracaoApiKwh > 0) {
      const dif = Math.abs(e.geracaoManualKwh - e.geracaoApiKwh) / e.geracaoApiKwh;
      if (dif > TOL_MANUAL_API) {
        bloqueios.push(
          `geração informada ${fmt(e.geracaoManualKwh)} kWh difere ${fmt(dif * 100)}% do monitoramento (${fmt(e.geracaoApiKwh)} kWh)`,
        );
      }
    }
  }

  const estado: EstadoGd = bloqueios.length > 0
    ? 'inconsistente'
    : e.leadId === null
      ? 'sem_cliente'
      : geracaoKwh === null
        ? 'falta_dado'
        : 'pronto';

  return { estado, bloqueios, pendencias, avisos, geracaoKwh, origemGeracao, esperadoMesKwh };
}
