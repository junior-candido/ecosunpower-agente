// src/modules/dashboard/canal-envio.ts
// Envio disparado pelo PAINEL roda dentro da empresa de quem clicou e do canal
// dela. Sem isso (bug até 27/09/2026) o sendText do index.ts não sabia de quem
// era a mensagem e um tenant (ex.: Conquista Solar) mandava a Pasta Digital
// pelo número da EcoSunPower. Regra: tenant sem instância Evolution própria
// NÃO manda zap — nunca pelo número de outra empresa.

import { comCanal } from '../canal-contexto.js';
import { comEmpresaDe, type EmpresaConfig } from '../empresa-config.js';
import { envioProibido } from '../tenant-admin-guard.js';
import { normalizeBrazilianPhone } from '../meta-leadgen.js';
import type { CanalZap } from '../gd/relatorio-envio.js';

export const EMPRESA_CASA = '00000000-0000-0000-0000-000000000001';

// Tipo mora em gd/relatorio-envio.ts; reexportado aqui por conveniência (import só de tipo, sem ciclo).
export type { CanalZap };

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

/**
 * Antes de mandar a Pasta Digital pelo zap: motivo pra NÃO mandar, ou null
 * pra seguir. A trava LGPD do sendText (index.ts) descarta em silêncio — sem
 * esta pergunta a tela mostrava ✅ e nada saía. Telefone vazio/inválido segue:
 * o serviço da pasta devolve sem_phone/telefone_invalido.
 */
export function bloqueioZapPasta(p: {
  canal: CanalZap;
  phone: string | null | undefined;
  engineerPhone: string;
  cfg: EmpresaConfig;
}): { ok: false; reason: 'sem_canal' | 'bloqueado_lgpd' } | null {
  if (p.canal === 'nenhum') return { ok: false, reason: 'sem_canal' };
  const fone = p.phone ? normalizeBrazilianPhone(String(p.phone)) : null;
  if (fone && envioProibido(fone, p.engineerPhone, p.cfg)) return { ok: false, reason: 'bloqueado_lgpd' };
  return null;
}
