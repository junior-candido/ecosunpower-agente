// src/modules/dashboard/ui/tema.ts
// Um lugar só que decide se a tela abre ESCURA ou CLARA (renovação do miolo,
// decisão D4 do Junior: (a) todos escuros · (b) EcoSun escuro, tenant claro ·
// (c) igual a hoje, tela por tela).
//
// ENQUANTO A D4 NÃO FOR DECIDIDA: devolve o `padrao` que cada tela já usa hoje
// (opção c) — ninguém vê mudança de tema. Quando o Junior decidir, a regra muda
// SÓ aqui e toda tela renovada acompanha.

import type { DashUser } from '../permissions.js';

export type TemaTela = 'escuro' | 'claro';

/** Regra da D4 em vigor. 'igual_hoje' = cada tela mantém o tema de antes. */
export const REGRA_D4: 'igual_hoje' = 'igual_hoje';

export function temaDaTela(_user: DashUser | undefined, padrao: TemaTela): TemaTela {
  return padrao;
}
