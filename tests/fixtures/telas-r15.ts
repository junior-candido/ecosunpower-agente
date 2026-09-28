// Onda 3 — R15: Quadro de Obras + vincular + contato. Telas renovadas com dados FICTÍCIOS em volume n
// (usadas pelo teste "telas leves" e por scripts/medir-telas-leves.ts).
import type { DashUser } from '../../src/modules/dashboard/permissions.js';

/** Classes fora do padrão cc- que a tela usa de propósito (gancho de JS ou de teste antigo). */
export const CLASSES_R15: string[] = [];

export function telasR15(_n: number, _user: DashUser): Record<string, string> {
  return {};
}
