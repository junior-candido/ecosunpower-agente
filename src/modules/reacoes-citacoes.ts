// src/modules/reacoes-citacoes.ts
//
// W2 — REAGIR com emoji e responder CITANDO (28/09/2026), nos dois números.
// Migration 142: a reação é uma linha própria de mensagens_whatsapp
// (tipo 'reacao', texto = emoji, citando_wamid = a mensagem reagida). Uma por
// pessoa por mensagem: reagir de novo troca; emoji vazio tira (igual ao
// WhatsApp). A citação é o citando_wamid de uma mensagem normal.
//
// Funções puras + a gravação (client de serviço; company_id sempre explícito).

import type { SupabaseClient } from '@supabase/supabase-js';
import { gravarMensagem, type CanalMensagem } from './mensagens-whatsapp.js';
import type { MensagemChat } from './dashboard/conversas-queries.js';

/** Os emojis do painel (os mesmos do atalho do WhatsApp). */
export const EMOJIS_REACAO = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;

/** Só os da lista — ou vazio (= tirar a reação). PURA. */
export function emojiDeReacaoValido(e: unknown): e is string {
  return typeof e === 'string' && (e === '' || (EMOJIS_REACAO as readonly string[]).includes(e));
}

/**
 * Grava (ou troca, ou tira) a reação de UMA pessoa a UMA mensagem. "Pessoa" =
 * o cliente (entrada) ou a equipe (saída, pelo número em que a reação saiu).
 * Nunca lança; devolve se deu certo.
 */
export async function gravarReacao(
  servico: SupabaseClient,
  r: {
    companyId: string; leadId: string | null; telefone: string | null; alvoWamid: string; emoji: string;
    de: 'cliente' | 'humano'; userId?: string | null; autorNome?: string | null;
    canal: CanalMensagem; numero: string | null; visivelSoPara: string | null; wamid?: string | null;
    contatoNome?: string | null; origem?: 'painel' | 'celular' | 'webhook'; status?: 'enviada' | 'recebida' | 'enviando';
  },
): Promise<boolean> {
  if (!r.companyId || !r.alvoWamid) return false;
  const direcao = r.de === 'cliente' ? 'entrada' : 'saida';
  try {
    // A reação anterior desta pessoa a esta mensagem sai (troca ou tira).
    let q = servico.from('mensagens_whatsapp').delete()
      .eq('company_id', r.companyId).eq('tipo', 'reacao').eq('citando_wamid', r.alvoWamid).eq('direcao', direcao);
    q = r.visivelSoPara ? q.eq('visivel_so_para', r.visivelSoPara) : q.is('visivel_so_para', null);
    if (r.telefone) q = q.eq('contato_telefone', r.telefone);
    const { error } = await q;
    if (error) { console.warn(`[reacao] não troquei a reação: ${error.message}`); return false; }
    if (!r.emoji) return true;
    const g = await gravarMensagem(servico, {
      company_id: r.companyId, lead_id: r.leadId, contato_telefone: r.telefone, contato_nome: r.contatoNome ?? null,
      direcao, autor: r.de, user_id: r.userId ?? null, autor_nome: r.autorNome ?? null,
      canal: r.canal, numero: r.numero, tipo: 'reacao', texto: r.emoji.slice(0, 16), citando_wamid: r.alvoWamid,
      origem: r.origem ?? (r.de === 'cliente' ? 'webhook' : 'painel'), wamid: r.wamid || null,
      status: r.status ?? (r.de === 'cliente' ? 'recebida' : 'enviada'), visivel_so_para: r.visivelSoPara,
    });
    return g.ok;
  } catch (e) {
    console.warn(`[reacao] falhou: ${(e as Error).message}`);
    return false;
  }
}

/**
 * Chat pronto: as reações vão para baixo da mensagem reagida (uma por pessoa,
 * a mais nova vale); a citação ganha o texto/autor da citada quando ela está
 * no chat. Reação a mensagem que não está no painel (ex.: memória antiga da
 * Eva) vira uma linha curta "reagiu ❤️". PURA.
 */
export function anexarReacoesECitacoes(msgs: MensagemChat[]): MensagemChat[] {
  if (msgs.length === 0) return msgs;
  const porWamid = new Map<string, MensagemChat>();
  const saida: MensagemChat[] = [];
  for (const m of msgs) {
    if (m.role === 'reacao') continue;
    const c = { ...m };
    if (c.wamid) porWamid.set(c.wamid, c);
    saida.push(c);
  }
  const soltas: MensagemChat[] = [];
  for (const m of msgs) {
    if (m.role !== 'reacao') continue;
    const alvo = m.citando?.wamid ? porWamid.get(m.citando.wamid) : undefined;
    const de = m.autor === 'cliente' ? 'cliente' as const : 'equipe' as const;
    if (!alvo) {
      soltas.push({ role: 'evento', evento: 'reagiu', content: m.content, timestamp: m.timestamp, autor: 'evento', autorNome: m.autorNome ?? null });
      continue;
    }
    const outras = (alvo.reacoes ?? []).filter((x) => !(x.de === de && (x.nome ?? '') === (m.autorNome ?? '')));
    alvo.reacoes = [...outras, { emoji: m.content, de, nome: m.autorNome ?? null }];
  }
  for (const m of saida) {
    if (!m.citando?.wamid) continue;
    const c = porWamid.get(m.citando.wamid);
    if (c) m.citando = { wamid: m.citando.wamid, texto: m.citando.texto || c.content.slice(0, 200), autor: m.citando.autor ?? (c.role === 'user' ? (c.autorNome ?? null) : (c.autorNome ?? null)) };
  }
  if (soltas.length === 0) return saida;
  const todas = [...saida, ...soltas].map((m, i) => ({ m, i }));
  todas.sort((a, b) => {
    const ta = a.m.timestamp ?? '';
    const tb = b.m.timestamp ?? '';
    if (ta && tb && ta !== tb) return Date.parse(ta) - Date.parse(tb) || ta.localeCompare(tb);
    return a.i - b.i;
  });
  return todas.map((x) => x.m);
}

const CASA = '00000000-0000-0000-0000-000000000001';

/**
 * W2 — texto do cliente que chegou no número da ASSISTENTE (Eva/tenant): fica
 * também no histórico do painel COM o id do WhatsApp (e a citação, se ele
 * respondeu uma mensagem) — sem isso não dá para responder citando nem reagir
 * à mensagem dele. A memória da Eva continua igual; o chat mostra uma só
 * (juntarComPainel tira a cópia). Sem lead da empresa → nada. Nunca lança.
 */
export async function registrarTextoDaAssistente(
  servico: SupabaseClient,
  p: {
    companyId: string; telefone: string; lead: { id: string } | null; wamid: string | null; texto: string;
    recebidaEm: string | null; citandoId?: string | null; contatoNome?: string | null;
  },
): Promise<boolean> {
  const texto = (p.texto ?? '').trim();
  if (!p.lead?.id || !p.companyId || !p.wamid || !texto) return false;
  const t = p.recebidaEm ? Date.parse(p.recebidaEm) : NaN;
  const quando = Number.isFinite(t) && t > 0 && t <= Date.now() + 60_000 ? new Date(Math.min(t, Date.now())).toISOString() : null;
  const r = await gravarMensagem(servico, {
    company_id: p.companyId, lead_id: p.lead.id, contato_telefone: p.telefone, contato_nome: p.contatoNome ?? null,
    direcao: 'entrada', autor: 'cliente', canal: p.companyId === CASA ? 'eva_oficial' : 'qr_code', tipo: 'texto',
    texto: texto.slice(0, 4096), origem: 'webhook', wamid: p.wamid, status: 'recebida',
    ...(p.citandoId ? { citando_wamid: p.citandoId } : {}),
    ...(quando ? { criado_em: quando } : {}),
  } as Parameters<typeof gravarMensagem>[1]);
  return r.ok;
}
