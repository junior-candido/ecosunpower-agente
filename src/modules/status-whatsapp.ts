// src/modules/status-whatsapp.ts
//
// W3 — ✓ enviada / ✓✓ entregue / ✓✓ azul lida, "digitando…" e marcar como
// lida ao abrir (28/09/2026). Migration 143.
//
//  - Meta (número da Eva): webhook `statuses` (sent/delivered/read/failed).
//  - Evolution (número pessoal e tenants): evento messages.update
//    (SERVER_ACK / DELIVERY_ACK / READ / PLAYED) e presence.update
//    (composing / recording / paused / available).
//  - O status NUNCA volta para trás (o aviso de "entregue" pode chegar depois
//    do "lida"). Falha depois de "enviada" (ex.: a Meta recusou mais tarde) vale.
//
// Funções puras + a gravação (client de serviço, company_id explícito).

import type { SupabaseClient } from '@supabase/supabase-js';
import { semTelefone } from './mensagens-whatsapp.js';

export type StatusSaida = 'enviando' | 'enviada' | 'entregue' | 'lida' | 'falhou';
const ORDEM: Record<string, number> = { enviando: 0, enviada: 1, entregue: 2, lida: 3 };

/** O status novo vale? (só para frente; 'falhou' só antes de entregue). PURA. */
export function statusAvanca(atual: string | null | undefined, novo: StatusSaida): boolean {
  const a = String(atual ?? '');
  if (novo === 'falhou') return a === 'enviando' || a === 'enviada';
  if (!(a in ORDEM)) return false; // recebida/registrada/falhou: não mexe
  return ORDEM[novo] > ORDEM[a];
}

/** Meta → nosso status. PURA. */
export function statusDaMeta(s: string): StatusSaida | null {
  return s === 'sent' ? 'enviada' : s === 'delivered' ? 'entregue' : s === 'read' ? 'lida' : s === 'failed' ? 'falhou' : null;
}

/** Evolution (Baileys) → nosso status. Aceita o texto ou o número do Baileys. PURA. */
export function statusDaEvolution(s: unknown): StatusSaida | null {
  const v = typeof s === 'number' ? ['ERROR', 'PENDING', 'SERVER_ACK', 'DELIVERY_ACK', 'READ', 'PLAYED'][s] : String(s ?? '').toUpperCase();
  if (v === 'SERVER_ACK') return 'enviada';
  if (v === 'DELIVERY_ACK') return 'entregue';
  if (v === 'READ' || v === 'PLAYED') return 'lida';
  if (v === 'ERROR') return 'falhou';
  return null;
}

export interface AtualizacaoStatus { wamid: string; status: StatusSaida; em: Date; erro?: string | null; fromMe?: boolean; remoteJid?: string }

/**
 * messages.update da Evolution → atualizações. O `data` vem como objeto ou
 * lista, com keyId/messageId ou key.id, e o status em texto ou número. PURA.
 */
export function lerStatusEvolution(body: Record<string, unknown> | null | undefined): AtualizacaoStatus[] {
  const ev = String(body?.event ?? '').toLowerCase().replace('_', '.');
  if (ev !== 'messages.update') return [];
  const lista = Array.isArray(body?.data) ? body!.data as Array<Record<string, unknown>> : body?.data ? [body.data as Record<string, unknown>] : [];
  const out: AtualizacaoStatus[] = [];
  for (const d of lista) {
    const key = d.key as Record<string, unknown> | undefined;
    const wamid = String(d.keyId ?? key?.id ?? d.messageId ?? '');
    const upd = d.update as Record<string, unknown> | undefined;
    const st = statusDaEvolution(d.status ?? upd?.status);
    if (!wamid || !st) continue;
    const fromMe = d.fromMe ?? key?.fromMe;
    const ts = Number(d.dateTime ? Date.parse(String(d.dateTime)) : NaN);
    out.push({ wamid, status: st, em: Number.isFinite(ts) ? new Date(ts) : new Date(), fromMe: fromMe === undefined ? undefined : Boolean(fromMe), remoteJid: String(d.remoteJid ?? key?.remoteJid ?? '') || undefined });
  }
  return out;
}

/**
 * Aplica o status numa mensagem ENVIADA desta empresa (pelo id do WhatsApp),
 * só se avança. Nunca lança. true = mudou.
 */
export async function aplicarStatus(servico: SupabaseClient, companyId: string, a: AtualizacaoStatus): Promise<boolean> {
  if (!companyId || !a.wamid) return false;
  try {
    const { data, error } = await servico.from('mensagens_whatsapp').select('id, status, direcao')
      .eq('company_id', companyId).eq('wamid', a.wamid).maybeSingle();
    const l = data as { id: string; status: string; direcao: string } | null;
    if (error || !l || l.direcao !== 'saida' || !statusAvanca(l.status, a.status)) return false;
    const quando = a.em.toISOString();
    const patch: Record<string, unknown> = { status: a.status };
    if (a.status === 'entregue') patch.entregue_em = quando;
    if (a.status === 'lida') patch.lida_em = quando;
    if (a.status === 'falhou') patch.erro = semTelefone(a.erro ?? 'O WhatsApp não entregou').slice(0, 500);
    const { error: e2 } = await servico.from('mensagens_whatsapp').update(patch)
      .eq('id', l.id).eq('company_id', companyId).eq('status', l.status);
    return !e2;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// "digitando…" — na memória do processo (aviso de segundos), por empresa + dono
// do número + telefone. Some sozinho depois de 12 s sem novo aviso.
// ---------------------------------------------------------------------------

const DIGITANDO_MS = 12_000;
const digitando = new Map<string, { ate: number; gravando: boolean }>();

const chaveDig = (companyId: string, visivelSoPara: string | null, telefone: string) => `${companyId}|${visivelSoPara ?? '*'}|${telefone}`;

export function marcarPresenca(companyId: string, visivelSoPara: string | null, telefone: string, presenca: string, agora = Date.now()): void {
  const k = chaveDig(companyId, visivelSoPara, telefone);
  if (presenca === 'composing' || presenca === 'recording') {
    digitando.set(k, { ate: agora + DIGITANDO_MS, gravando: presenca === 'recording' });
    if (digitando.size > 5000) for (const [kk, v] of digitando) if (v.ate < agora) digitando.delete(kk);
  } else {
    digitando.delete(k);
  }
}

/** 'digitando' | 'gravando' | null — só para quem pode ver a conversa. PURA sobre o mapa. */
export function estaDigitando(companyId: string, visivelSoPara: string | null, telefones: string[], agora = Date.now()): 'digitando' | 'gravando' | null {
  for (const t of telefones) {
    const v = digitando.get(chaveDig(companyId, visivelSoPara, t));
    if (v && v.ate > agora) return v.gravando ? 'gravando' : 'digitando';
  }
  return null;
}

export function limparDigitando(): void { digitando.clear(); }

/**
 * presence.update da Evolution → [{ telefone, presenca }]. O formato traz
 * `presences: { '<jid>': { lastKnownPresence } }`. Grupos ficam de fora. PURA.
 */
export function lerPresencaEvolution(body: Record<string, unknown> | null | undefined): Array<{ jid: string; presenca: string }> {
  const ev = String(body?.event ?? '').toLowerCase().replace('_', '.');
  if (ev !== 'presence.update') return [];
  const d = body?.data as { id?: string; presences?: Record<string, { lastKnownPresence?: string }> } | undefined;
  const out: Array<{ jid: string; presenca: string }> = [];
  for (const [jid, p] of Object.entries(d?.presences ?? {})) {
    if (!jid || jid.endsWith('@g.us') || typeof p?.lastKnownPresence !== 'string') continue;
    out.push({ jid, presenca: p.lastKnownPresence });
  }
  return out;
}

/**
 * Marcar como LIDA ao abrir a conversa — só no número PESSOAL, só para o
 * DONO, só com a opção ligada (whatsapp_numeros_pessoais.marcar_lida_ao_abrir).
 * Pega as recebidas ainda não lidas (últimos 7 dias, até 50), pede para o
 * WhatsApp marcar e, se ele aceitou, grava lida_em. Devolve quantas. Nunca lança.
 */
export async function marcarLidasAoAbrir(
  servico: SupabaseClient,
  p: {
    np: { company_id: string; dono_user_id: string; instancia: string; ativo: boolean; marcar_lida_ao_abrir?: boolean | null };
    viewerId: string; leadId?: string | null; telefone?: string | null;
  },
  ler: (instancia: string, companyId: string, telefone: string, wamids: string[]) => Promise<unknown>,
): Promise<number> {
  const { np } = p;
  if (!np.ativo || np.marcar_lida_ao_abrir === false || p.viewerId !== np.dono_user_id) return 0;
  if (!p.leadId && !p.telefone) return 0;
  try {
    let q = servico.from('mensagens_whatsapp').select('id, wamid, contato_telefone')
      .eq('company_id', np.company_id).eq('visivel_so_para', np.dono_user_id).eq('direcao', 'entrada')
      .eq('canal', 'whatsapp_business').is('lida_em', null).not('wamid', 'is', null)
      .gte('criado_em', new Date(Date.now() - 7 * 24 * 3600_000).toISOString());
    q = p.leadId ? q.eq('lead_id', p.leadId) : q.eq('contato_telefone', p.telefone!);
    const { data, error } = await q.order('criado_em', { ascending: false }).limit(50);
    if (error || !Array.isArray(data) || data.length === 0) return 0;
    const linhas = data as Array<{ id: string; wamid: string; contato_telefone: string | null }>;
    // Um contato por vez (o do lead pode ter escrito de 2 formatos de número).
    const porTel = new Map<string, Array<{ id: string; wamid: string }>>();
    for (const l of linhas) {
      const t = l.contato_telefone ?? p.telefone ?? '';
      if (!t) continue;
      (porTel.get(t) ?? porTel.set(t, []).get(t)!).push(l);
    }
    let total = 0;
    for (const [tel, ls] of porTel) {
      try {
        await ler(np.instancia, np.company_id, tel, ls.map((l) => l.wamid));
      } catch (e) {
        console.warn(`[lido] WhatsApp não marcou como lida: ${semTelefone((e as Error).message)}`);
        continue;
      }
      const agora = new Date().toISOString();
      for (const l of ls) {
        await servico.from('mensagens_whatsapp').update({ lida_em: agora })
          .eq('id', l.id).eq('company_id', np.company_id).eq('visivel_so_para', np.dono_user_id);
      }
      total += ls.length;
    }
    return total;
  } catch {
    return 0;
  }
}
