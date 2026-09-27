// BSUID (business-scoped user ID) do WhatsApp — FASE 1 (27/09/2026).
//
// A Meta passou a mandar, em todo webhook de mensagem, um ID do usuario por
// empresa ('BR.1234…'). Quem esconde o telefone atras de um @username chega SEM
// `messages[].from` e SEM `contacts[].wa_id`. Antes desta fase, o `from` vazio
// passava por todos os filtros e virava lead com phone '' — TODO MUNDO sem
// telefone caia no MESMO lead (conversa compartilhada, vazamento LGPD), e a
// resposta ia pra `to: ''` e falhava.
//
// Fase 1 = segurar: mensagem sem telefone NAO entra no fluxo da Eva; a empresa
// dona e avisada (admin dela) com nome/@username/BSUID pra agir. Responder por
// BSUID e a fase 2 — ver docs/whatsapp-bsuid.md.
import type { IncomingMessage } from './evolution.js';
import type { QueueMessage } from './queue.js';

/** `from` e telefone de verdade? So digitos, nao vazio. BSUID ('BR.…') nao e. */
export function temTelefone(from: string | null | undefined): boolean {
  return typeof from === 'string' && /^\d+$/.test(from.trim());
}

/** Job da fila a partir da mensagem WABA ja parseada (mesmos campos de sempre + BSUID). */
export function montarJobDaFila(parsed: IncomingMessage, companyId: string): QueueMessage {
  return {
    type: parsed.type,
    from: parsed.from,
    content: parsed.content,
    timestamp: parsed.timestamp.toISOString(),
    messageId: parsed.messageId,
    pushName: parsed.pushName,
    caption: parsed.caption,
    mimeType: parsed.mimeType,
    referral: parsed.referral,
    companyId,
    ...(parsed.fromUserId ? { fromUserId: parsed.fromUserId } : {}),
    ...(parsed.fromParentUserId ? { fromParentUserId: parsed.fromParentUserId } : {}),
    ...(parsed.username ? { username: parsed.username } : {}),
  };
}

const NOME_TIPO: Record<IncomingMessage['type'], string> = {
  text: 'texto',
  audio: 'áudio',
  image: 'foto',
  video: 'vídeo',
  document: 'documento',
  location: 'localização',
};

/** Aviso pro admin da empresa. Texto simples, sem jargao. */
export function montarAlertaSemTelefone(parsed: IncomingMessage, nomeAssistente: string): string {
  const oQueMandou = parsed.type === 'text'
    ? `"${parsed.content.slice(0, 300)}"`
    : `(${NOME_TIPO[parsed.type] ?? parsed.type}${parsed.caption ? `: ${parsed.caption.slice(0, 200)}` : ''})`;
  return [
    `⚠️ *Mensagem de alguém SEM telefone*`,
    ``,
    `O WhatsApp escondeu o número desta pessoa (ela usa nome de usuário).`,
    `A ${nomeAssistente} NÃO respondeu — ainda não conseguimos responder sem o número.`,
    ``,
    `Nome: ${parsed.pushName?.trim() || '(sem nome)'}`,
    `Usuário: ${parsed.username || '(sem @)'}`,
    `ID Meta: ${parsed.fromUserId || '(não veio)'}`,
    `Mensagem: ${oQueMandou}`,
    ``,
    `Se for cliente, procure pelo nome/usuário e peça o telefone por outro canal.`,
  ].join('\n');
}

export type ResultadoSemTelefone =
  | 'avisado'
  | 'ja-avisado'
  | 'empresa-nao-resolvida'
  | 'sem-destino'
  | 'erro';

export interface DepsSemTelefone {
  /** phone_number_id → company_id (null = falha-fechado, nao processa). */
  resolverEmpresa: (phoneNumberId: string | undefined) => Promise<string | null>;
  /** Telefone admin da empresa (null = empresa sem admin: nao manda pra ninguem). */
  destinoAdmin: (companyId: string) => string | null;
  nomeAssistente: (companyId: string) => string;
  /** Trava idempotente (app_flags). true = primeira vez nesta chave. */
  adquirirTrava: (chave: string) => Promise<boolean>;
  /** Envia DENTRO do contexto da empresa (canal + trava LGPD dela). */
  enviar: (companyId: string, to: string, texto: string) => Promise<void>;
  agora?: () => Date;
}

/**
 * Mensagem sem telefone: loga e avisa o admin da empresa dona (1x por hora por
 * pessoa). NUNCA lanca — o webhook ja respondeu 200 pra Meta.
 */
export async function processarMensagemSemTelefone(
  parsed: IncomingMessage,
  deps: DepsSemTelefone,
): Promise<ResultadoSemTelefone> {
  // Chave da trava por PESSOA, não por mensagem — sem BSUID cai pro
  // username/nome (não pro messageId, que é único por mensagem e nunca
  // travaria: cada mensagem nova destravaria o aviso de novo).
  const quem = parsed.fromUserId || parsed.username || parsed.pushName || 'anon';
  try {
    console.warn(
      `[waba][bsuid] mensagem SEM telefone (user_id=${parsed.fromUserId ?? '-'} username=${parsed.username ?? '-'} ` +
      `nome="${parsed.pushName ?? ''}" tipo=${parsed.type} msg=${parsed.messageId}) — NAO enfileirada.`,
    );
    const companyId = await deps.resolverEmpresa(parsed.phoneNumberId);
    if (!companyId) {
      console.warn(`[waba][bsuid] numero ${parsed.phoneNumberId} nao resolvido — sem aviso (falha-fechado).`);
      return 'empresa-nao-resolvida';
    }
    const destino = deps.destinoAdmin(companyId);
    if (!destino) {
      console.warn(`[waba][bsuid] empresa ${companyId.slice(0, 8)} sem telefone admin — aviso nao enviado.`);
      return 'sem-destino';
    }
    const hora = (deps.agora?.() ?? new Date()).toISOString().slice(0, 13);
    if (!(await deps.adquirirTrava(`alert_sem_telefone_${companyId}_${quem}_${hora}`))) {
      return 'ja-avisado';
    }
    await deps.enviar(companyId, destino, montarAlertaSemTelefone(parsed, deps.nomeAssistente(companyId)));
    return 'avisado';
  } catch (err) {
    console.error('[waba][bsuid] falha ao avisar mensagem sem telefone:', (err as Error).message);
    return 'erro';
  }
}

/**
 * Backfill do BSUID no lead achado pelo TELEFONE (roda no worker da fila,
 * DEPOIS da resposta). So quando a mensagem traz os dois. Nunca lanca.
 */
export async function backfillWaUserId(
  db: { vincularWaUserId: (phone: string, companyId: string, waUserId: string, username?: string) => Promise<unknown> },
  msg: { from: string; fromUserId?: string; username?: string },
  companyId: string,
): Promise<void> {
  if (!msg.fromUserId || !temTelefone(msg.from)) return;
  try {
    await db.vincularWaUserId(msg.from, companyId, msg.fromUserId, msg.username);
  } catch (err) {
    console.warn('[bsuid] backfill falhou (ignorado):', (err as Error).message);
  }
}
