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
 * ATUALIZADO 08/09/2026 — a coluna nova existe (migration 124). Agora:
 * - EcoSunPower          → `engineerPhone`, como sempre foi.
 * - Tenant COM admin     → `telefoneAdmin` dele (o zap pessoal de quem recebe).
 * - Tenant SEM admin     → `null`, o modelo combinado com a Jimena em 19/08.
 *
 * A linha PÚBLICA (`telefoneAtendente`) segue proibida como destino admin: é o
 * número onde a própria assistente atende, mandar pra lá faz o robô mandar
 * mensagem pra si mesmo. Se alguém preencher os dois campos iguais, ganha null.
 */
export function destinoAdminDaEmpresa(
  engineerPhone: string,
  cfg: EmpresaConfig = empresa(),
): string | null {
  if (ehEcosun(cfg)) return engineerPhone;
  const admin = soDigitos(cfg.telefoneAdmin);
  if (!admin) return null;
  // Fail-closed: nunca a linha pública da assistente, nunca o zap do dono da EcoSun.
  if (admin === soDigitos(cfg.telefoneAtendente)) {
    console.error(
      `[lgpd] telefone_admin da empresa "${cfg.nomeFantasia}" (${cfg.companyId}) esta igual ao telefone_atendente (linha publica da assistente). Aviso NAO enviado — corrija na empresa_config.`,
    );
    return null;
  }
  if (admin === soDigitos(engineerPhone)) {
    console.error(
      `[lgpd] telefone_admin da empresa "${cfg.nomeFantasia}" (${cfg.companyId}) aponta pro zap do dono da EcoSunPower. Aviso NAO enviado.`,
    );
    return null;
  }
  return cfg.telefoneAdmin;
}

/**
 * Em qual agenda do Google este agendamento pode ser criado (08/09/2026).
 *
 * - EcoSunPower       → a agenda global do ambiente, como sempre foi.
 * - Tenant COM agenda → a agenda dele (`google_calendar_id`).
 * - Tenant SEM agenda → `null`. NÃO cria evento nenhum: o agendamento vive na
 *   tabela `visitas` e no dashboard dele.
 *
 * Antes disso existia uma agenda só, do env — e em 08/09 uma visita da Conquista
 * Solar (lead da Bahia) foi parar no Google Calendar pessoal do dono da EcoSun.
 * Agenda de outra empresa nunca é um default: na dúvida, não cria.
 */
export function agendaDaEmpresa(
  calendarIdGlobal: string | null | undefined,
  cfg: EmpresaConfig = empresa(),
): string | null {
  if (ehEcosun(cfg)) return calendarIdGlobal ?? null;
  return cfg.googleCalendarId ?? null;
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
export function avisoAdminPermitido(destino: string, cfg: EmpresaConfig = empresa()): boolean {
  if (ehEcosun(cfg)) return true;
  // 08/09/2026: tenant passou a poder receber aviso — mas SÓ no telefone_admin
  // dele. Qualquer outro número (o zap do dono da EcoSun, a linha pública da
  // assistente, um número digitado errado) continua barrado.
  const admin = soDigitos(cfg.telefoneAdmin);
  return admin !== '' && soDigitos(destino) === admin;
}
