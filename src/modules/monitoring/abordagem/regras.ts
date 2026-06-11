// src/modules/monitoring/abordagem/regras.ts
// PURO: invariantes de ritmo da spec (seção 5). Erro pra MENOS mensagem é
// melhor que pra mais — spam mata a confiança.
import type { AbordagemTipo, DiarioUsina } from './tipos.js';

export const RITMO = {
  PARABENS_DIAS: 90,
  LIMPEZA_DIAS: 30,
  DESCARTE_DIAS: 30,
  LEMBRETE_DIAS: 3,
  ENCERRA_DIAS: 3,
  REAGENDA_PADRAO_DIAS: 2,
} as const;

export function diasDesde(iso: string | null, hoje: Date): number | null {
  if (!iso) return null;
  return Math.floor((hoje.getTime() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
}

export interface LeadElegibilidade { id: string; optOut: boolean }
export interface Veredito { ok: boolean; motivo?: string }

export function podeAbordar(
  tipo: AbordagemTipo,
  lead: LeadElegibilidade,
  diario: DiarioUsina,
  hoje: Date,
): Veredito {
  if (lead.optOut) return { ok: false, motivo: 'cliente em opt-out' };
  if (diario.abordagemAbertaId) return { ok: false, motivo: 'já existe abordagem aberta nesta usina' };

  const msgHoje = diasDesde(diario.ultimaMsgProativaAoLeadEm, hoje);
  if (msgHoje !== null && msgHoje < 1) return { ok: false, motivo: 'cliente já recebeu proativa hoje' };

  const descarte = diasDesde(diario.descartadaPeloJuniorEm, hoje);
  if (descarte !== null && descarte < RITMO.DESCARTE_DIAS) {
    return { ok: false, motivo: `Junior descartou há ${descarte}d (<${RITMO.DESCARTE_DIAS}d)` };
  }

  if (tipo === 'parabens' || tipo === 'depoimento') {
    const ult = diasDesde(diario.ultimoParabensEnviadoEm, hoje);
    if (ult !== null && ult < RITMO.PARABENS_DIAS) {
      return { ok: false, motivo: `parabéns há ${ult}d (<${RITMO.PARABENS_DIAS}d)` };
    }
  }
  if (tipo === 'queda') {
    const oferta = diasDesde(diario.ultimaOfertaLimpezaEm, hoje);
    if (oferta !== null && oferta < RITMO.LIMPEZA_DIAS) {
      return { ok: false, motivo: `ofereceu limpeza há ${oferta}d (<${RITMO.LIMPEZA_DIAS}d)` };
    }
  }
  return { ok: true };
}

// milestone_economia: 1ª vez da usina = pedir depoimento; depois = parabéns.
export function decidirTipoMilestone(diario: DiarioUsina): 'depoimento' | 'parabens' {
  return diario.jaTeveDepoimento ? 'parabens' : 'depoimento';
}
