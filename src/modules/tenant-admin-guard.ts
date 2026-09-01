// TRAVA LGPD entre controladores (31/08/2026).
//
// Cada empresa da plataforma é um CONTROLADOR de dados diferente. O lead da
// Conquista Solar é dado pessoal de cliente DELA — não pode aparecer no
// WhatsApp pessoal do dono da EcoSunPower. Em 31/08 apareceu: o handoff mandava
// pro `config.engineerPhone`, que é fixo e global.
//
// Aqui ficam as duas funções que resolvem isso, e a regra é FALHAR FECHADO:
// na dúvida NÃO manda, em vez de mandar pro número errado.
import { empresa, type EmpresaConfig } from './empresa-config.js';
import { ECOSUN_COMPANY_ID } from './tenant-resolver.js';

/** Só os dígitos — compara 5561996978781, +55 61 99697-8781 e (61) 99697-8781 como iguais. */
function soDigitos(v: string | null | undefined): string {
  return typeof v === 'string' ? v.replace(/\D/g, '') : '';
}

function ehEcosun(cfg: EmpresaConfig): boolean {
  return cfg.companyId === ECOSUN_COMPANY_ID;
}

/**
 * Pra onde vai um aviso ADMINISTRATIVO (lead novo, dossiê, alerta, handoff) da
 * empresa passada — por padrão a empresa da mensagem em curso.
 *
 * - EcoSunPower  → o telefone do Junior (`engineerPhone`), como sempre foi.
 * - Tenant       → o telefone de atendimento DELE.
 * - Tenant sem telefone (ou que cadastrou o do Junior por engano) → `null`:
 *   o aviso NÃO é enviado. Perder um aviso é problema operacional; mandar dado
 *   de cliente pro controlador errado é incidente de privacidade.
 */
export function destinoAdminDaEmpresa(
  engineerPhone: string,
  cfg: EmpresaConfig = empresa(),
): string | null {
  if (ehEcosun(cfg)) return engineerPhone;
  const tel = soDigitos(cfg.telefoneAtendente);
  if (!tel) return null;
  if (tel === soDigitos(engineerPhone)) return null;
  return cfg.telefoneAtendente;
}

/**
 * Fail-closed do ponto de saída: é proibido QUALQUER envio feito no contexto de
 * um tenant para o número pessoal do dono da EcoSunPower. Vale pros 93 pontos
 * que hoje chamam `sendText(config.engineerPhone, ...)` — em vez de caçar um
 * por um, o `sendText` pergunta aqui antes de sair.
 *
 * A EcoSunPower nunca é bloqueada (o número é dela mesma).
 */
export function envioProibido(
  destino: string,
  engineerPhone: string,
  cfg: EmpresaConfig = empresa(),
): boolean {
  if (ehEcosun(cfg)) return false;
  return soDigitos(destino) === soDigitos(engineerPhone) && soDigitos(destino) !== '';
}

/**
 * Defesa em profundidade pro canal de avisos administrativos.
 *
 * `destinoAdminDaEmpresa` conserta os pontos que eu já achei. Esta função é pro
 * ponto que alguém escrever amanhã: um aviso administrativo dentro do contexto
 * de um tenant só pode ir pro telefone de atendimento DAQUELE tenant. Qualquer
 * outro número é recusado, inclusive (principalmente) o do dono da EcoSunPower.
 *
 * A EcoSunPower não é restringida: ela tem telefones admin extras configurados
 * por ambiente, e o número é dela mesma de qualquer forma.
 */
export function avisoAdminPermitido(destino: string, cfg: EmpresaConfig = empresa()): boolean {
  if (ehEcosun(cfg)) return true;
  const proprio = soDigitos(cfg.telefoneAtendente);
  if (!proprio) return false;
  return soDigitos(destino) === proprio;
}
