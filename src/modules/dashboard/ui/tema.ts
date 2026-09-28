// src/modules/dashboard/ui/tema.ts
// Um lugar só que decide se a tela abre ESCURA ou CLARA (renovação do miolo,
// decisão D4 do Junior: (a) todos escuros · (b) EcoSun escuro, tenant claro ·
// (c) igual a hoje, tela por tela).
//
// 28/09/2026 — D4 DECIDIDA = (a): toda tela renovada abre ESCURA (tema do
// Command Center), para a EcoSun e para o tenant. O `padrao` de cada tela fica
// na assinatura só por compatibilidade (as telas já passam) — não manda mais.
// Se um dia a regra mudar (ex.: tenant claro), muda SÓ aqui.

import type { DashUser } from '../permissions.js';

export type TemaTela = 'escuro' | 'claro';

/** Regra da D4 em vigor. */
export const REGRA_D4: 'todas_escuras' = 'todas_escuras';

export function temaDaTela(_user: DashUser | undefined, _padrao: TemaTela): TemaTela {
  return 'escuro';
}
