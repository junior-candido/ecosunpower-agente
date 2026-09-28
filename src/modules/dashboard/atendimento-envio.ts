// src/modules/dashboard/atendimento-envio.ts
// Responder o WhatsApp de dentro do painel (Atendimento Parte 2, 28/09/2026).
//
// Regras do dono (Junior):
//  - Número da Eva (WABA oficial): texto livre SÓ dentro da janela de 24 h
//    (última mensagem do cliente). Fora dela, só MODELO aprovado. A regra é
//    conferida no SERVIDOR (a tela só mostra) — margem de 1 h, igual ao
//    `janela24hAberta` do index.ts (23 h).
//  - Responder pelo painel = ASSUMIR: a Eva fica pausada até alguém devolver
//    (assumir-atendimento.ts — o mesmo estado do botão do WhatsApp).
//  - Cada envio fica gravado (mensagens_whatsapp) com autor e canal.
//  - Anti envio duplo (chave por clique, reservada no banco ANTES de enviar),
//    limite por pessoa/lead, trava de empresa (rota /leads/:id), LGPD/opt-out.
//  - Custo: a partir de 01/10/2026 a Meta cobra também a resposta dentro das
//    24 h — aviso discreto ao enviar pelo número da Eva.
//
// Funções PURAS aqui em cima; `enviarDoPainel` só orquestra dependências
// injetadas (testado com dublês — nada sai de verdade nos testes).

import type { MensagemChat, CanalConversa } from './conversas-queries.js';
import type { ModeloAtendimento } from './modelos-atendimento.js';

/** Janela da Meta é 24 h; a tela e o servidor usam 23 h (1 h de margem). */
export const MARGEM_JANELA_MS = 23 * 60 * 60 * 1000;
/** 01/10/2026 00:00 em Brasília: a Meta passa a cobrar toda mensagem da API. */
export const INICIO_COBRANCA_MS = Date.parse('2026-10-01T03:00:00Z');
export const LIMITE_TEXTO = 4096;

const FUSO = 'America/Sao_Paulo';

/** Por onde a resposta sai: API oficial (Eva, casa), QR (Evolution) ou não sai. */
export type ViaEnvio = 'waba' | 'evolution' | 'nenhum';

/** Última mensagem do CLIENTE que chegou por este número (abre a janela). PURA. */
export function ultimaDoCliente(msgs: MensagemChat[], canal: CanalConversa): string | null {
  let ultima: string | null = null;
  for (const m of msgs) {
    if (m.role !== 'user' || !m.timestamp || !Number.isFinite(Date.parse(m.timestamp))) continue;
    const c = m.canal ?? null;
    // Mensagem antiga (sem canal) = chegou no número da assistente.
    const doCanal = canal === 'whatsapp_business' ? c === 'whatsapp_business' : c !== 'whatsapp_business';
    if (!doCanal) continue;
    if (!ultima || Date.parse(m.timestamp) > Date.parse(ultima)) ultima = m.timestamp;
  }
  return ultima;
}

/** Janela de atendimento (texto livre). Sem mensagem do cliente → fechada. PURA. */
export function janelaAtendimento(ultimaDoClienteIso: string | null, agora = Date.now()): { aberta: boolean; ateIso: string | null } {
  if (!ultimaDoClienteIso) return { aberta: false, ateIso: null };
  const t = Date.parse(ultimaDoClienteIso);
  if (!Number.isFinite(t) || t > agora + 60_000) return { aberta: false, ateIso: null };
  const ate = t + MARGEM_JANELA_MS;
  return { aberta: agora < ate, ateIso: new Date(ate).toISOString() };
}

/** "14:32" ou "29/09 14:32" (quando não é hoje). */
export function horaDaJanela(iso: string, agora = Date.now()): string {
  const d = new Date(iso);
  const hoje = new Date(agora).toLocaleDateString('pt-BR', { timeZone: FUSO });
  const hora = d.toLocaleTimeString('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' });
  const dia = d.toLocaleDateString('pt-BR', { timeZone: FUSO });
  return dia === hoje ? hora : `${d.toLocaleDateString('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' })} ${hora}`;
}

/** Aviso discreto de custo (só o número oficial da Eva paga). PURA. */
export function avisoCusto(via: ViaEnvio, agora = Date.now()): string | null {
  if (via !== 'waba') return null;
  return agora < INICIO_COBRANCA_MS
    ? 'Custo: grátis até 30/09; a partir de 01/10, ≈ R$ 0,035 por mensagem (marketing ≈ R$ 0,32).'
    : 'Custo: ≈ R$ 0,035 por mensagem (marketing ≈ R$ 0,32).';
}

export function custoDoModelo(m: Pick<ModeloAtendimento, 'categoria'>): string {
  if (m.categoria === 'marketing') return '≈ R$ 0,32 (marketing)';
  if (m.categoria === 'utilidade') return '≈ R$ 0,035';
  return '≈ R$ 0,035 a R$ 0,32';
}

export type MotivoBloqueio =
  | 'opt_out' | 'sem_telefone' | 'sem_canal' | 'whatsapp_nao_configurado'
  | 'bloqueado_lgpd' | 'janela_fechada' | 'modelo_so_no_oficial';

/** Por que NÃO pode enviar (null = pode). Mesma regra na tela e no servidor. PURA. */
export function motivoBloqueio(p: {
  optOut: boolean;
  telefone: string | null;
  via: ViaEnvio;
  lgpdBloqueado: boolean;
  tipo: 'texto' | 'modelo';
  janelaAberta: boolean;
}): MotivoBloqueio | null {
  if (p.optOut) return 'opt_out';
  if (!p.telefone) return 'sem_telefone';
  if (p.via === 'nenhum') return 'sem_canal';
  if (p.lgpdBloqueado) return 'bloqueado_lgpd';
  if (p.tipo === 'modelo' && p.via !== 'waba') return 'modelo_so_no_oficial';
  if (p.tipo === 'texto' && p.via === 'waba' && !p.janelaAberta) return 'janela_fechada';
  return null;
}

/** Texto da tela para cada resultado (?resp=… depois do envio). */
export const RESULTADO_ENVIO: Record<string, { tom: 'ok' | 'erro' | 'aviso'; texto: string }> = {
  enviada: { tom: 'ok', texto: 'Mensagem enviada. Você assumiu a conversa.' },
  duplicado: { tom: 'aviso', texto: 'Essa mensagem já tinha sido enviada (clique repetido) — não mandei de novo.' },
  falhou: { tom: 'erro', texto: 'O WhatsApp recusou o envio. Tente de novo em instantes.' },
  erro_banco: { tom: 'erro', texto: 'Não consegui registrar o envio, então não enviei. Tente de novo.' },
  vazio: { tom: 'erro', texto: 'Escreva a mensagem antes de enviar.' },
  longo: { tom: 'erro', texto: `Mensagem longa demais (máximo ${LIMITE_TEXTO} letras).` },
  limite: { tom: 'aviso', texto: 'Muitas mensagens em pouco tempo. Espere alguns segundos.' },
  modelo_invalido: { tom: 'erro', texto: 'Escolha um dos modelos aprovados da lista.' },
  chave_invalida: { tom: 'erro', texto: 'A página ficou velha. Recarregue e envie de novo.' },
  opt_out: { tom: 'erro', texto: 'Este contato pediu para parar. Envio bloqueado.' },
  sem_telefone: { tom: 'erro', texto: 'Este lead não tem telefone de WhatsApp.' },
  sem_canal: { tom: 'erro', texto: 'Conecte o WhatsApp da empresa para responder por aqui.' },
  whatsapp_nao_configurado: { tom: 'erro', texto: 'O número oficial da Eva não está configurado neste servidor.' },
  bloqueado_lgpd: { tom: 'erro', texto: 'Envio bloqueado: este número não pode receber mensagem por este canal.' },
  janela_fechada: { tom: 'erro', texto: 'A janela de 24 h fechou. Use um modelo aprovado.' },
  modelo_so_no_oficial: { tom: 'erro', texto: 'Modelo só existe no número oficial da Eva.' },
  assumiu: { tom: 'ok', texto: 'Você assumiu a conversa. A Eva fica pausada até você devolver.' },
  devolveu: { tom: 'ok', texto: 'Conversa devolvida para a Eva.' },
};

/** Texto livre: sem espaço sobrando nas pontas; vazio/longo recusado. PURA. */
export function validarTexto(bruto: unknown): { ok: true; texto: string } | { ok: false; motivo: 'vazio' | 'longo' } {
  const t = String(bruto ?? '').replace(/\r\n/g, '\n').trim();
  if (!t) return { ok: false, motivo: 'vazio' };
  if (t.length > LIMITE_TEXTO) return { ok: false, motivo: 'longo' };
  return { ok: true, texto: t };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function chaveValida(k: unknown): k is string {
  return typeof k === 'string' && UUID_RE.test(k);
}

/**
 * Freio de envio (memória do processo): no máximo `porMinuto` mensagens por
 * pessoa por minuto e uma a cada `intervaloLeadMs` para o mesmo contato.
 */
export class LimiteDeEnvio {
  private porUsuario = new Map<string, number[]>();
  private porContato = new Map<string, number>();
  constructor(private porMinuto = 20, private intervaloLeadMs = 2000) {}
  permitir(userId: string, contato: string, agora = Date.now()): boolean {
    const lista = (this.porUsuario.get(userId) ?? []).filter((t) => agora - t < 60_000);
    const ultimoContato = this.porContato.get(contato);
    if (lista.length >= this.porMinuto) return false;
    if (ultimoContato !== undefined && agora - ultimoContato < this.intervaloLeadMs) return false;
    lista.push(agora);
    this.porUsuario.set(userId, lista);
    this.porContato.set(contato, agora);
    if (this.porContato.size > 5000) this.porContato.clear();
    return true;
  }
}

// ---------------------------------------------------------------------------
// Orquestração do envio (dependências injetadas)
// ---------------------------------------------------------------------------

export type ResultadoEnvio = 'enviada' | 'duplicado' | 'falhou' | 'erro_banco';

export interface DepsEnvio {
  /** Reserva a chave no banco (status 'enviando'). */
  reservar(): Promise<{ ok: true; id: string } | { ok: false; motivo: 'duplicado' | 'erro' }>;
  concluir(id: string, r: { status: 'enviada' | 'falhou'; wamid?: string | null; erro?: string | null }): Promise<void>;
  /** Assume a conversa (pausa a Eva) — ANTES de enviar, pra ela não responder por cima. */
  assumir?: () => Promise<unknown>;
  enviar(): Promise<{ messageId?: string } | void>;
  /** Cópia na memória da Eva (quando ela voltar, sabe o que foi dito). Best-effort. */
  copiarParaMemoria?: (painelId: string) => Promise<void>;
  /** Linha do tempo + audit_log. Best-effort. */
  registrar?: () => Promise<void>;
}

export async function enviarDoPainel(deps: DepsEnvio): Promise<{ resultado: ResultadoEnvio; id?: string; erro?: string }> {
  const r = await deps.reservar();
  if (!r.ok) return { resultado: r.motivo === 'duplicado' ? 'duplicado' : 'erro_banco' };
  if (deps.assumir) {
    try { await deps.assumir(); } catch (e) { console.warn(`[atendimento] assumir falhou (segue o envio): ${(e as Error).message}`); }
  }
  let wamid: string | null = null;
  try {
    const s = await deps.enviar();
    wamid = (s && typeof s === 'object' && s.messageId) ? s.messageId : null;
  } catch (e) {
    const erro = (e as Error).message ?? String(e);
    await deps.concluir(r.id, { status: 'falhou', erro });
    return { resultado: 'falhou', id: r.id, erro };
  }
  await deps.concluir(r.id, { status: 'enviada', wamid });
  if (deps.copiarParaMemoria) await deps.copiarParaMemoria(r.id).catch((e) => console.warn(`[atendimento] memória da Eva não gravou: ${(e as Error).message}`));
  if (deps.registrar) await deps.registrar().catch((e) => console.warn(`[atendimento] registro não gravou: ${(e as Error).message}`));
  return { resultado: 'enviada', id: r.id };
}
