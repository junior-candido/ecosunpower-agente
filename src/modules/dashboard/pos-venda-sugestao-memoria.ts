// src/modules/dashboard/pos-venda-sugestao-memoria.ts
// Helpers PUROS da memória de sugestão do pós-venda: cooldown por tipo, cálculo
// do snooze e leitura de quais tipos estão "descansando". Sem I/O — testável.

const DIA = 86400000;
export const COOLDOWN_PADRAO_DIAS = 30;
export const COOLDOWN_UPGRADE_DIAS = 90;

export type SituacaoSugestao = 'geracao_saudavel' | 'queda' | 'marco' | 'upgrade' | 'contato';

export function cooldownDias(tipo: string): number {
  return tipo === 'upgrade' ? COOLDOWN_UPGRADE_DIAS : COOLDOWN_PADRAO_DIAS;
}

export function snoozeAte(tipo: string, agora: Date): string {
  return new Date(agora.getTime() + cooldownDias(tipo) * DIA).toISOString();
}

export function tiposSnoozed(
  rows: Array<{ tipo: string; snoozed_until: string | null }>,
  agora: Date,
): Set<string> {
  const s = new Set<string>();
  for (const r of rows) {
    if (r.snoozed_until && new Date(r.snoozed_until).getTime() > agora.getTime()) s.add(r.tipo);
  }
  return s;
}
