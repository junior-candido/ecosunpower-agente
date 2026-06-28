// src/modules/dashboard/pos-venda-termometro.ts
// Função PURA: temperatura do relacionamento no pós-venda, por regras.
// Cortes isolados em constantes — ajuste numa linha quando quiser calibrar.
import type { Saude } from './pos-venda-saude.js';

export type Temperatura = 'quente' | 'morno' | 'frio';

export interface LinhaTemp {
  saude: Saude;
  ultimoContatoEm: string | null;
  jaTeveDepoimento: boolean;
}

const DIA = 86400000;
const QUENTE_DIAS = 30;   // contato mais recente que isto = quente (se saúde ok)
const ENGAJADO_DIAS = 60; // quem já deu depoimento segue quente até aqui
const FRIO_DIAS = 90;     // sem contato além disto = frio
const VERMELHO_FRIO_DIAS = 30; // problema técnico arrastando além disto = frio

const diasSem = (iso: string | null, hoje: Date): number | null =>
  iso ? Math.floor((hoje.getTime() - new Date(iso).getTime()) / DIA) : null;

export function temperatura(l: LinhaTemp, hoje: Date): Temperatura {
  const d = diasSem(l.ultimoContatoEm, hoje);
  if (d === null) return 'morno';                                   // ainda sem histórico → neutro
  if (d > FRIO_DIAS) return 'frio';
  if (l.saude === 'vermelho' && d > VERMELHO_FRIO_DIAS) return 'frio';
  if (d <= QUENTE_DIAS && l.saude !== 'vermelho') return 'quente';
  if (l.jaTeveDepoimento && d <= ENGAJADO_DIAS) return 'quente';
  return 'morno';
}
