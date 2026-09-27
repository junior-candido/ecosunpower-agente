// src/modules/dashboard/canal-envio.ts
// Envio disparado pelo PAINEL roda dentro da empresa de quem clicou e do canal
// dela. Sem isso (bug até 27/09/2026) o sendText do index.ts não sabia de quem
// era a mensagem e um tenant (ex.: Conquista Solar) mandava a Pasta Digital
// pelo número da EcoSunPower. Regra: tenant sem instância Evolution própria
// NÃO manda zap — nunca pelo número de outra empresa.
//
// NOTA (27/09/2026): `CanalZap` está definido aqui, e não importado de
// `gd/relatorio-envio.ts` (Task 6 do plano), porque aquele arquivo ainda não
// existe nesta branch — a Task 6 depende de uma decisão do dono que ainda não
// foi tomada. Quando `relatorio-envio.ts` for criado, considerar reexportar
// o tipo de lá para não duplicar.

import { comCanal } from '../canal-contexto.js';
import { comEmpresaDe } from '../empresa-config.js';

export const EMPRESA_CASA = '00000000-0000-0000-0000-000000000001';

/** casa = EcoSun (WABA/canal padrão) · evolution = instância própria do tenant · nenhum = tenant sem WhatsApp conectado. */
export type CanalZap = 'casa' | 'evolution' | 'nenhum';

export function canalZapDaEmpresa(companyId: string, instancia: string | null | undefined): CanalZap {
  if (instancia) return 'evolution';
  return companyId === EMPRESA_CASA ? 'casa' : 'nenhum';
}

/** Roda `fn` com empresa() = a empresa e canalAtual() = a instância dela (sendText escolhe Evolution sozinho). */
export function noCanalDaEmpresa<T>(
  companyId: string,
  instancia: string | null | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  return comEmpresaDe(companyId, () => comCanal({ companyId, evolutionInstance: instancia ?? undefined }, fn));
}
