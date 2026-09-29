// src/modules/canal-automatico.ts
//
// Por onde uma ROTINA AUTOMÁTICA (cron, setInterval) pode falar — 28/09/2026.
//
// O problema: rotina de relógio não nasce de mensagem, então roda fora do
// contexto de qualquer empresa. Sem contexto, empresa() responde "EcoSunPower"
// e as travas de saída (sendText / sendAdminWithButtons) veem "é a casa" e
// liberam. Assim um cliente de tenant (ex.: Conquista Solar) instalado recebia
// o pedido de avaliação PELO NÚMERO DA CASA, em nome da EcoSunPower, e o nome
// dele ia pro zap do Junior ("medidor trocado", "hora do relatório", "pasta
// pronta"). Mesmo buraco do digest de 02/09, noutra porta.
//
// A regra, num lugar só:
//  - Casa (EcoSun, ou lead sem empresa = legado) → canal padrão (Eva/WABA).
//  - Tenant → SÓ pela instância própria dele, e só se a assistente estiver
//    contratada (módulo) e a empresa não estiver pausada. Sem instância, NÃO
//    fala — nunca cai no número da casa.
//  - Aviso administrativo → admin DA empresa do lead (destinoAdminDaEmpresa);
//    tenant sem telefone_admin → ninguém (o lead vive no painel dele).
//  - Na dúvida (erro lendo módulo/instância) → não fala (falha FECHADO).
//
// O envio roda dentro de comEmpresaDe + comCanal: textos, marca e travas
// enxergam a empresa certa, e o sendText do index escolhe a instância dela.
import { empresaDe } from './empresa-config.js';
import { destinoAdminDaEmpresa } from './tenant-admin-guard.js';
import { ECOSUN_COMPANY_ID } from './tenant-resolver.js';
import { canalZapDaEmpresa, noCanalDaEmpresa } from './dashboard/canal-envio.js';
import { disparoLiberado } from './cobranca-recorrente/pausa.js';

export type MotivoBloqueio =
  | 'empresa_pausada'
  | 'assistente_desligada'
  | 'sem_canal_proprio'
  | 'sem_admin'
  | 'erro_ao_decidir';

export type ResultadoRota = 'enviado' | MotivoBloqueio;

export type CanalLiberado = { ok: true; companyId: string; instancia: string | null };
export type DecisaoCanal = CanalLiberado | { ok: false; companyId: string; motivo: MotivoBloqueio };

export interface DepsCanalAutomatico {
  /** Instância Evolution própria da empresa (companies.evolution_instance). */
  instanciaDaEmpresa: (companyId: string) => Promise<string | undefined>;
  /** Módulos contratados (empresa_modulos) — lerModulosAtivos. */
  modulosAtivos: (companyId: string) => Promise<ReadonlySet<string>>;
  /** Empresa pausada (cobrança recorrente). Ausente = empresaPausadaPorCobranca. */
  empresaPausada?: (companyId: string) => Promise<boolean>;
}

/**
 * ⏸ Cobrança recorrente: empresa com os DISPAROS AUTOMÁTICOS pausados por
 * fatura (2ª trava de cobranca-recorrente/pausa.ts — ponto único, sem duplicar
 * a regra). A casa nunca é pausada.
 */
export async function empresaPausadaPorCobranca(companyId: string): Promise<boolean> {
  return !(await disparoLiberado(companyId));
}

/** Lead sem empresa é legado pré-multi-tenant = casa. */
export function empresaDoLead(companyId: string | null | undefined): string {
  return typeof companyId === 'string' && companyId.trim() ? companyId : ECOSUN_COMPANY_ID;
}

/** Dona do toque/lembrete: linha OU lead de tenant = tenant (o mais restritivo). */
export function empresaDaTouch(daLinha: string | null | undefined, doLead: string | null | undefined): string {
  if (!ehCasa(doLead)) return empresaDoLead(doLead);
  return empresaDoLead(daLinha);
}

export function ehCasa(companyId: string | null | undefined): boolean {
  return empresaDoLead(companyId) === ECOSUN_COMPANY_ID;
}

/**
 * Pode falar? Por qual canal? `modulo` = o que a rotina exige do contrato
 * (padrão 'eva' = a assistente, dona da linha por onde a mensagem sai).
 */
export async function decidirCanalDaEmpresa(
  companyId: string | null | undefined,
  deps: DepsCanalAutomatico,
  modulo = 'eva',
): Promise<DecisaoCanal> {
  const cid = empresaDoLead(companyId);
  if (cid === ECOSUN_COMPANY_ID) return { ok: true, companyId: cid, instancia: null };
  try {
    const pausada = await (deps.empresaPausada ?? empresaPausadaPorCobranca)(cid);
    if (pausada) return { ok: false, companyId: cid, motivo: 'empresa_pausada' };
    const modulos = await deps.modulosAtivos(cid);
    if (!modulos.has(modulo)) return { ok: false, companyId: cid, motivo: 'assistente_desligada' };
    const instancia = (await deps.instanciaDaEmpresa(cid)) ?? null;
    if (canalZapDaEmpresa(cid, instancia) !== 'evolution') {
      return { ok: false, companyId: cid, motivo: 'sem_canal_proprio' };
    }
    return { ok: true, companyId: cid, instancia };
  } catch (err) {
    console.error(`[canal-automatico] nao deu pra decidir o canal da empresa ${cid} — nada sai:`, (err as Error).message);
    return { ok: false, companyId: cid, motivo: 'erro_ao_decidir' };
  }
}

/** Mensagem ao CLIENTE. `enviar` roda dentro da empresa e do canal dela. */
export type RotaLead = (
  companyId: string | null | undefined,
  enviar: () => Promise<void>,
  modulo?: string,
) => Promise<ResultadoRota>;

/** Aviso ADMINISTRATIVO. `enviar(destino)` recebe o admin da empresa do lead. */
export type RotaAvisoAdmin = (
  companyId: string | null | undefined,
  enviar: (destino: string) => Promise<void>,
  modulo?: string,
) => Promise<ResultadoRota>;

function logBloqueio(tipo: string, companyId: string, motivo: MotivoBloqueio): void {
  console.log(`[canal-automatico] ${tipo} da empresa ${companyId} NAO enviado (${motivo}) — fica no painel dela.`);
}

export function criarRotasAutomaticas(
  deps: DepsCanalAutomatico,
  engineerPhone: string,
): { lead: RotaLead; avisoAdmin: RotaAvisoAdmin } {
  const lead: RotaLead = async (companyId, enviar, modulo) => {
    const d = await decidirCanalDaEmpresa(companyId, deps, modulo);
    if (!d.ok) { logBloqueio('mensagem ao cliente', d.companyId, d.motivo); return d.motivo; }
    await noCanalDaEmpresa(d.companyId, d.instancia, enviar);
    return 'enviado';
  };
  const avisoAdmin: RotaAvisoAdmin = async (companyId, enviar, modulo) => {
    const d = await decidirCanalDaEmpresa(companyId, deps, modulo);
    if (!d.ok) { logBloqueio('aviso admin', d.companyId, d.motivo); return d.motivo; }
    const destino = destinoAdminDaEmpresa(engineerPhone, empresaDe(d.companyId));
    if (!destino) { logBloqueio('aviso admin', d.companyId, 'sem_admin'); return 'sem_admin'; }
    await noCanalDaEmpresa(d.companyId, d.instancia, () => enviar(destino));
    return 'enviado';
  };
  return { lead, avisoAdmin };
}

/**
 * Padrão de quem ainda não recebeu as rotas (testes antigos, wiring parcial):
 * só a casa fala, tenant é barrado. Nunca o contrário.
 */
export const leadSoDaCasa: RotaLead = async (companyId, enviar) => {
  const cid = empresaDoLead(companyId);
  if (cid !== ECOSUN_COMPANY_ID) { logBloqueio('mensagem ao cliente', cid, 'sem_canal_proprio'); return 'sem_canal_proprio'; }
  await noCanalDaEmpresa(cid, null, enviar);
  return 'enviado';
};

export function avisoAdminSoDaCasa(adminPhone: string): RotaAvisoAdmin {
  return async (companyId, enviar) => {
    const cid = empresaDoLead(companyId);
    if (cid !== ECOSUN_COMPANY_ID) { logBloqueio('aviso admin', cid, 'sem_canal_proprio'); return 'sem_canal_proprio'; }
    await noCanalDaEmpresa(cid, null, () => enviar(adminPhone));
    return 'enviado';
  };
}
