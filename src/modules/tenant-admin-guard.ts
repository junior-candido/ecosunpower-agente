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
 * - EcoSunPower → o telefone do Junior (`engineerPhone`), como sempre foi.
 * - Tenant      → `null`. O lead fica no DASHBOARD e a equipe dele pega de lá.
 *
 * Por que null e não "o telefone do tenant": o único telefone que a empresa_config
 * guarda hoje é o `telefone_atendente`, que é a linha PÚBLICA — o número onde a
 * própria assistente atende os clientes (Clara = 5577999610038). Mandar o aviso
 * pra lá faria o robô mandar mensagem pra ele mesmo. E o modelo combinado com a
 * Jimena em 19/08 é justamente esse: "lead cai no dashboard central, a vendedora
 * PEGA o lead — sem transferir pro zap pessoal".
 *
 * Se algum dia um tenant quiser aviso no zap, o caminho é uma coluna nova
 * (`telefone_admin`), nunca reaproveitar a linha pública da assistente.
 */
export function destinoAdminDaEmpresa(
  engineerPhone: string,
  cfg: EmpresaConfig = empresa(),
): string | null {
  return ehEcosun(cfg) ? engineerPhone : null;
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
 * ponto que alguém escrever amanhã: dentro do contexto de um tenant, NENHUM
 * número recebe aviso administrativo por zap — nem o do dono da EcoSunPower
 * (vazamento entre controladores), nem a linha pública da própria assistente
 * (o robô mandaria mensagem pra ele mesmo). O lead vive no dashboard.
 *
 * A EcoSunPower não é restringida: ela tem telefones admin extras configurados
 * por ambiente, e o número é dela mesma de qualquer forma.
 */
export function avisoAdminPermitido(_destino: string, cfg: EmpresaConfig = empresa()): boolean {
  return ehEcosun(cfg);
}
