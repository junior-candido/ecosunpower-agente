// src/modules/dashboard/conversas-queries.ts
// Tela de Atendimento (Leads › Conversas, 28/09/2026 — Parte 1, SEM mudar banco).
//
// MULTI-TENANT RIGOROSO: toda consulta leva `.eq('company_id', <empresa da
// SESSÃO>)` explícito — mesmo quando o client já é o do operador (RLS). O
// company_id NUNCA vem de query/body. Visibilidade pool+claim igual à da lista
// de Leads: vendedor (não-admin) vê o balcão (sem dono) e os dele.
//
// O que a tabela `conversations` guarda hoje: 1+ linhas por lead, cada uma com
// `messages` (array de {role, content, timestamp}) e `last_message_at`. A lista
// usa a linha mais recente de cada lead; o chat junta TODAS as linhas do lead
// (a memória da Eva guarda poucas mensagens por linha — juntar mostra mais
// histórico). Funções de montagem são PURAS (testadas sem banco).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DashUser } from './permissions.js';
import { mensagensDoPainel, type LinhaMensagemWhatsapp } from '../mensagens-whatsapp.js';
import { mensagensPessoais, telefonesOcultosDoPessoal, ehTelefoneOculto, numeroPessoalDoDono } from '../numero-pessoal.js';

/** Canal da conversa: número da Eva (oficial), número pessoal (WhatsApp Business) ou assistente por QR (tenant). */
export type CanalConversa = 'eva_oficial' | 'whatsapp_business' | 'qr_code';

export interface MensagemChat {
  /** 'user' = cliente · 'assistant' = quem responde (Eva ou gente) · 'evento' = assumiu/devolveu. */
  role: 'user' | 'assistant' | 'evento' | string;
  content: string;
  timestamp: string | null;
  // ---- Parte 2 (histórico do painel, migration 138). Ausente = mensagem antiga da Eva. ----
  autor?: 'cliente' | 'eva' | 'humano' | 'evento';
  autorNome?: string | null;
  canal?: CanalConversa | null;
  /** Envio do painel: 'enviando' | 'enviada' | 'falhou'. */
  status?: string | null;
  evento?: 'assumiu' | 'devolveu' | null;
  modelo?: string | null;
  /** Mensagem do painel copiada na memória da Eva (conversations) — some na junção. */
  painelId?: string | null;
  /** De onde saiu a mensagem da equipe: 'painel' ou 'celular' (número pessoal). */
  origem?: string | null;
}

export interface ConversaResumo {
  leadId: string;
  nome: string | null;
  telefone: string;
  etapa: string;
  cidade: string | null;
  evaAtiva: boolean;
  optOut: boolean;
  dono: string | null;
  ultimaEm: string | null;
  ultimaTexto: string | null;
  ultimaDe: 'cliente' | 'assistente' | null;
  /** O cliente falou por último (ninguém respondeu ainda). */
  aguardandoResposta: boolean;
  canal: CanalConversa | null;
  /** Parte 2b: contato do número pessoal que AINDA NÃO é lead (leadId vazio). */
  contato?: string | null;
}

export type FiltroConversa = 'todas' | 'aguardando' | 'meus';
export const FILTROS_CONVERSA: FiltroConversa[] = ['todas', 'aguardando', 'meus'];

/** Etapas oferecidas como filtro na lista (valores = status do lead). */
export const ETAPAS_FILTRO: Array<{ id: string; rotulo: string; status: string[] }> = [
  { id: 'novo', rotulo: 'Novos', status: ['novo'] },
  { id: 'qualificando', rotulo: 'Qualificação', status: ['qualificando', 'qualificado'] },
  { id: 'proposta', rotulo: 'Proposta', status: ['proposta_enviada'] },
  { id: 'negociacao', rotulo: 'Negociação', status: ['negociacao', 'agendado', 'transferido'] },
  { id: 'ganho', rotulo: 'Ganhos', status: ['ganho'] },
  { id: 'perdido', rotulo: 'Perdidos', status: ['perdido'] },
];

export interface FiltrosConversa {
  q?: string;
  filtro?: FiltroConversa;
  etapa?: string;
}

export interface ListaConversas {
  itens: ConversaResumo[];
  /** Contagens ANTES dos chips (para "Todas 284 · Aguardando 12 · Meus 30"). */
  contagem: { todas: number; aguardando: number; meus: number; porEtapa: Record<string, number> };
}

/** Só aceita valores conhecidos (o resto vira o padrão) — nada de query crua no filtro. */
export function lerFiltros(q: Record<string, unknown>): FiltrosConversa {
  const filtro = FILTROS_CONVERSA.includes(String(q.filtro) as FiltroConversa) ? (String(q.filtro) as FiltroConversa) : 'todas';
  const etapa = ETAPAS_FILTRO.some((e) => e.id === q.etapa) ? String(q.etapa) : undefined;
  const busca = typeof q.q === 'string' ? q.q.trim().slice(0, 80) : '';
  return { filtro, etapa, q: busca || undefined };
}

/** Normaliza as mensagens de uma linha de `conversations` (tolerante a formato velho). */
export function normalizarMensagens(raw: unknown): MensagemChat[] {
  if (!Array.isArray(raw)) return [];
  const out: MensagemChat[] = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue;
    const o = m as Record<string, unknown>;
    const content = typeof o.content === 'string' ? o.content : typeof o.text === 'string' ? o.text : '';
    if (!content.trim()) continue;
    const saida: MensagemChat = {
      role: typeof o.role === 'string' ? o.role : 'user',
      content,
      timestamp: typeof o.timestamp === 'string' ? o.timestamp : null,
    };
    if (typeof o.painel_id === 'string' && o.painel_id) saida.painelId = o.painel_id;
    out.push(saida);
  }
  return out;
}

/** Junta as mensagens de várias linhas do mesmo lead, em ordem de tempo, sem repetir. PURA. */
export function juntarMensagens(linhas: Array<{ messages: unknown; created_at?: string | null }>): MensagemChat[] {
  const ordenadas = [...linhas].sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));
  const vistas = new Set<string>();
  const todas: Array<MensagemChat & { i: number }> = [];
  let i = 0;
  for (const l of ordenadas) {
    for (const m of normalizarMensagens(l.messages)) {
      const chave = `${m.role}|${m.timestamp ?? ''}|${m.content}`;
      if (vistas.has(chave)) continue;
      vistas.add(chave);
      todas.push({ ...m, i: i++ });
    }
  }
  // Ordena por horário quando os dois têm; sem horário mantém a ordem de chegada.
  todas.sort((a, b) => {
    if (a.timestamp && b.timestamp && a.timestamp !== b.timestamp) return a.timestamp.localeCompare(b.timestamp);
    return a.i - b.i;
  });
  return todas.map(({ i: _i, ...m }) => m);
}

/** Última mensagem da conversa (prévia da lista). PURA. */
export function ultimaMensagem(msgs: MensagemChat[]): { texto: string | null; de: 'cliente' | 'assistente' | null; em: string | null } {
  const u = msgs[msgs.length - 1];
  if (!u) return { texto: null, de: null, em: null };
  return { texto: u.content.replace(/\s+/g, ' ').trim().slice(0, 140), de: u.role === 'assistant' ? 'assistente' : 'cliente', em: u.timestamp };
}

/** Canal da conversa, quando a linha trouxer o dado (hoje as linhas não trazem → null). */
export function canalDaLinha(linha: Record<string, unknown>): CanalConversa | null {
  const c = String(linha.channel ?? linha.canal ?? '').toLowerCase();
  if (!c) return null;
  if (c.includes('waba') || c.includes('cloud') || c.includes('oficial') || c === 'meta') return 'eva_oficial';
  if (c.includes('coex') || c.includes('business')) return 'whatsapp_business';
  if (c.includes('evolution') || c.includes('qr')) return 'qr_code';
  return null;
}

interface LinhaLead {
  id: string; name: string | null; phone: string; status: string; city: string | null;
  eva_active: boolean; opt_out: boolean; claimed_by: string | null;
}

/** Monta, filtra e conta a lista. PURA (o banco só entrega as linhas). */
export function montarLista(
  conversas: Array<Record<string, unknown>>,
  leads: LinhaLead[],
  filtros: FiltrosConversa,
  viewerId: string,
  /** Número por onde a conversa chegou quando a linha não diz (Parte 2: o da assistente da empresa). */
  canalPadrao: CanalConversa | null = null,
  /** Parte 2b: conversas do número pessoal de quem está vendo (resumosPessoais). */
  pessoais: ConversaResumo[] = [],
): ListaConversas {
  const t = (x: string | null | undefined) => { const n = Date.parse(x ?? ''); return Number.isFinite(n) ? n : 0; };
  const leadPorId = new Map(leads.map((l) => [l.id, l]));
  const vistos = new Set<string>();
  const todas: ConversaResumo[] = [];
  // `conversas` já vem da mais recente para a mais antiga: a 1ª de cada lead vale.
  for (const c of conversas) {
    const leadId = String(c.lead_id ?? '');
    const lead = leadPorId.get(leadId);
    if (!lead || vistos.has(leadId)) continue;
    vistos.add(leadId);
    const msgs = normalizarMensagens(c.messages);
    const u = ultimaMensagem(msgs);
    todas.push({
      leadId, nome: lead.name, telefone: lead.phone, etapa: lead.status, cidade: lead.city,
      evaAtiva: !!lead.eva_active, optOut: !!lead.opt_out, dono: lead.claimed_by,
      ultimaEm: u.em ?? (typeof c.last_message_at === 'string' ? c.last_message_at : null),
      ultimaTexto: u.texto, ultimaDe: u.de, aguardandoResposta: u.de === 'cliente' && !lead.opt_out,
      canal: canalDaLinha(c) ?? canalPadrao,
    });
  }
  // Número pessoal: mesmo lead = um item só (vale a conversa mais recente e o número dela).
  for (const p of pessoais) {
    const i = p.leadId ? todas.findIndex((t) => t.leadId === p.leadId) : -1;
    if (i === -1) { todas.push(p); continue; }
    const atual = todas[i];
    if (t(p.ultimaEm) > t(atual.ultimaEm)) {
      todas[i] = { ...atual, ultimaEm: p.ultimaEm, ultimaTexto: p.ultimaTexto, ultimaDe: p.ultimaDe, aguardandoResposta: p.aguardandoResposta && !atual.optOut, canal: p.canal };
    }
  }
  todas.sort((a, b) => t(b.ultimaEm) - t(a.ultimaEm));

  const q = (filtros.q ?? '').toLowerCase();
  const qDigitos = q.replace(/\D/g, '');
  const casaBusca = (c: ConversaResumo) => !q
    || (c.nome ?? '').toLowerCase().includes(q)
    || (c.cidade ?? '').toLowerCase().includes(q)
    || (qDigitos.length >= 4 && c.telefone.replace(/\D/g, '').includes(qDigitos));
  const buscadas = todas.filter(casaBusca);

  const porEtapa: Record<string, number> = {};
  for (const e of ETAPAS_FILTRO) porEtapa[e.id] = buscadas.filter((c) => e.status.includes(c.etapa)).length;
  const contagem = {
    todas: buscadas.length,
    aguardando: buscadas.filter((c) => c.aguardandoResposta).length,
    meus: buscadas.filter((c) => c.dono === viewerId).length,
    porEtapa,
  };

  const etapa = ETAPAS_FILTRO.find((e) => e.id === filtros.etapa);
  const itens = buscadas
    .filter((c) => filtros.filtro !== 'aguardando' || c.aguardandoResposta)
    .filter((c) => filtros.filtro !== 'meus' || c.dono === viewerId)
    .filter((c) => !etapa || etapa.status.includes(c.etapa));
  return { itens, contagem };
}

const LIMITE_CONVERSAS = 400;

/**
 * Número pessoal na lista: UMA linha por contato (a última), pela função da
 * migration 140 — o histórico importado tem dezenas de milhares de mensagens e
 * as 1000 mais novas escondiam quem falou há mais tempo. Sem a 140 (ou erro):
 * o modo antigo, das 1000 mensagens mais novas.
 */
export async function linhasPessoaisDaLista(servico: SupabaseClient, companyId: string, userId: string): Promise<LinhaMensagemWhatsapp[]> {
  try {
    const { data, error } = await servico.rpc('conversas_pessoais_recentes', { p_company: companyId, p_dono: userId, p_limite: LIMITE_CONVERSAS });
    // Confere de novo empresa e dono (nunca confia só na função).
    if (!error && Array.isArray(data)) return (data as LinhaMensagemWhatsapp[]).filter((r) => r.company_id === companyId && r.visivel_so_para === userId);
  } catch { /* cai no modo antigo */ }
  return mensagensPessoais(servico, companyId, userId, {}, 1000);
}
const LOTE_IDS = 100;

/**
 * Lista de conversas da EMPRESA da sessão. Sem sessão com empresa → lista vazia
 * (falha fechada: nunca "todas as empresas").
 */
/**
 * Conversas do número pessoal (linhas de mensagens_whatsapp do dono) → itens
 * da lista. Uma por lead; quem não é lead, uma por telefone. PURA.
 */
/** Número pessoal: "aguardando resposta" só se a última do contato é recente (o histórico importado traz 90 dias). */
export const AGUARDANDO_PESSOAL_MS = 7 * 24 * 60 * 60 * 1000;

export function resumosPessoais(rows: LinhaMensagemWhatsapp[], leads: LinhaLead[], agora = Date.now()): ConversaResumo[] {
  const leadPorId = new Map(leads.map((l) => [l.id, l]));
  const grupos = new Map<string, LinhaMensagemWhatsapp[]>();
  // Agrupa pelo TELEFONE (um contato = um item), mesmo com linhas antigas sem lead.
  for (const r of rows) {
    if (r.direcao === 'evento' || !r.texto) continue;
    const chave = r.contato_telefone ? `T:${r.contato_telefone}` : r.lead_id ? `L:${r.lead_id}` : '';
    if (!chave) continue;
    (grupos.get(chave) ?? grupos.set(chave, []).get(chave)!).push(r);
  }
  const out: ConversaResumo[] = [];
  for (const [chave, g] of grupos) {
    g.sort((a, b) => String(a.criado_em).localeCompare(String(b.criado_em)));
    const u = g[g.length - 1];
    // Conversa antiga (histórico) não fica "aguardando resposta" para sempre.
    const daEntrada = u.direcao === 'entrada';
    const doCliente = daEntrada && agora - (Date.parse(u.criado_em) || 0) < AGUARDANDO_PESSOAL_MS;
    const base = {
      ultimaEm: u.criado_em, ultimaTexto: (u.texto ?? '').replace(/\s+/g, ' ').trim().slice(0, 140),
      ultimaDe: daEntrada ? 'cliente' as const : 'assistente' as const, aguardandoResposta: doCliente, canal: 'whatsapp_business' as const,
    };
    const leadId = [...g].reverse().find((r) => r.lead_id)?.lead_id ?? null;
    const lead = leadId ? leadPorId.get(leadId) : undefined;
    if (leadId && !lead && chave.startsWith('L:')) continue;
    if (lead) {
      out.push({
        leadId: lead.id, nome: lead.name, telefone: lead.phone, etapa: lead.status, cidade: lead.city,
        evaAtiva: !!lead.eva_active, optOut: !!lead.opt_out, dono: lead.claimed_by, ...base,
        aguardandoResposta: doCliente && !lead.opt_out,
      });
    } else {
      const nome = [...g].reverse().find((r) => r.contato_nome)?.contato_nome ?? null;
      out.push({
        leadId: '', contato: u.contato_telefone, nome, telefone: u.contato_telefone ?? '', etapa: '', cidade: null,
        evaAtiva: false, optOut: false, dono: null, ...base,
      });
    }
  }
  return out;
}

async function lerLeadsDaLista(db: SupabaseClient, viewer: DashUser, companyId: string, ids: string[]): Promise<LinhaLead[]> {
  const leads: LinhaLead[] = [];
  for (let i = 0; i < ids.length; i += LOTE_IDS) {
    let q = db
      .from('leads')
      .select('id, name, phone, status, city, eva_active, opt_out, claimed_by')
      .eq('company_id', companyId)
      .is('archived_at', null)
      .in('id', ids.slice(i, i + LOTE_IDS));
    if (!viewer.isAdmin) q = q.or(`claimed_by.is.null,claimed_by.eq.${viewer.id}`);
    const { data, error: e2 } = await q;
    if (e2) throw new Error(`Falha ao ler leads das conversas: ${e2.message}`);
    leads.push(...((data ?? []) as LinhaLead[]));
  }
  return leads;
}

export async function listarConversas(db: SupabaseClient, viewer: DashUser, filtros: FiltrosConversa, servico?: SupabaseClient): Promise<ListaConversas> {
  const vazio: ListaConversas = { itens: [], contagem: { todas: 0, aguardando: 0, meus: 0, porEtapa: {} } };
  const companyId = viewer?.companyId;
  if (!companyId) return vazio;

  // Parte 2b: conversas do número PESSOAL de quem está vendo (só a casa; só o dono).
  const pessoaisTodas = servico && companyId === CASA_ID ? await linhasPessoaisDaLista(servico, companyId, viewer.id) : [];
  // Avisos da Eva, o próprio dono e a equipe não são conversa (nem as que já estavam gravadas).
  const ocultos = pessoaisTodas.length > 0 && servico
    ? await telefonesOcultosDoPessoal(servico, companyId, await numeroPessoalDoDono(servico, companyId, viewer.id))
    : new Set<string>();
  const pessoaisRows = pessoaisTodas.filter((r) => !ehTelefoneOculto(ocultos, r.contato_telefone));

  const { data: convs, error } = await db
    .from('conversations')
    .select('lead_id, messages, last_message_at, created_at')
    .eq('company_id', companyId)
    .not('lead_id', 'is', null)
    .order('last_message_at', { ascending: false })
    .limit(LIMITE_CONVERSAS);
  if (error) throw new Error(`Falha ao listar conversas: ${error.message}`);
  const linhas = (convs ?? []) as Array<Record<string, unknown>>;
  const ids = [...new Set([
    ...linhas.map((c) => String(c.lead_id ?? '')),
    ...pessoaisRows.map((r) => String(r.lead_id ?? '')),
  ].filter(Boolean))];
  if (ids.length === 0 && pessoaisRows.length === 0) return vazio;

  const leads = ids.length ? await lerLeadsDaLista(db, viewer, companyId, ids) : [];
  return montarLista(linhas, leads, filtros, viewer.id, canalDaAssistente(companyId), resumosPessoais(pessoaisRows, leads));
}

/** Todas as mensagens do lead (todas as linhas de `conversations` DA EMPRESA). */
export async function mensagensDoLead(db: SupabaseClient, leadId: string, companyId: string): Promise<MensagemChat[]> {
  const { data, error } = await db
    .from('conversations')
    .select('messages, created_at')
    .eq('company_id', companyId)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true })
    .limit(50);
  if (error) throw new Error(`Falha ao ler a conversa: ${error.message}`);
  return juntarMensagens((data ?? []) as Array<{ messages: unknown; created_at?: string | null }>);
}

// ---------------------------------------------------------------------------
// Parte 2 — junta a memória da Eva (conversations) com o histórico do painel
// (mensagens_whatsapp: envios com autor/canal e eventos assumiu/devolveu).
// ---------------------------------------------------------------------------

/** Linha de mensagens_whatsapp → mensagem do chat. PURA. */
export function linhaDoPainelParaChat(l: LinhaMensagemWhatsapp): MensagemChat | null {
  if (l.direcao === 'evento') {
    if (l.evento !== 'assumiu' && l.evento !== 'devolveu') return null;
    return { role: 'evento', content: '', timestamp: l.criado_em, autor: 'evento', evento: l.evento, autorNome: l.autor_nome };
  }
  const texto = (l.texto ?? '').trim() || (l.modelo ? `[modelo ${l.modelo}]` : '');
  if (!texto) return null;
  if (l.direcao === 'entrada') {
    return { role: 'user', content: texto, timestamp: l.criado_em, autor: 'cliente', canal: l.canal, autorNome: l.contato_nome };
  }
  // Reserva que ficou "enviando" (processo caiu no meio): não fica "enviando…" pra sempre.
  const velha = l.status === 'enviando' && Date.now() - Date.parse(l.criado_em) > 5 * 60_000;
  return {
    role: 'assistant', content: texto, timestamp: l.enviada_em ?? l.criado_em,
    autor: l.autor === 'eva' ? 'eva' : 'humano', autorNome: l.autor_nome, canal: l.canal,
    status: velha ? 'sem_confirmacao' : l.status, modelo: l.modelo, painelId: l.id, origem: l.origem,
  };
}

/**
 * Memória da Eva + histórico do painel, em ordem de tempo. A cópia que o painel
 * deixa na memória da Eva (painel_id) sai: vale a do painel, que tem autor e
 * status. PURA.
 */
export function juntarComPainel(conversa: MensagemChat[], painel: LinhaMensagemWhatsapp[], canalDaEva: CanalConversa): MensagemChat[] {
  const doPainel = painel.map(linhaDoPainelParaChat).filter((m): m is MensagemChat => !!m);
  const idsPainel = new Set(painel.map((l) => l.id));
  const daEva = conversa
    .filter((m) => !(m.painelId && idsPainel.has(m.painelId)))
    .map((m) => ({
      ...m,
      autor: m.autor ?? (m.role === 'assistant' ? (m.painelId ? 'humano' as const : 'eva' as const) : 'cliente' as const),
      canal: m.canal ?? canalDaEva,
    }));
  const todas = [...daEva, ...doPainel].map((m, i) => ({ m, i }));
  todas.sort((a, b) => {
    const ta = a.m.timestamp ?? '';
    const tb = b.m.timestamp ?? '';
    if (ta && tb && ta !== tb) return Date.parse(ta) - Date.parse(tb) || ta.localeCompare(tb);
    return a.i - b.i;
  });
  return todas.map((x) => x.m);
}

/** Canal do número da assistente desta empresa: a Eva (oficial) na casa, QR no tenant. */
export function canalDaAssistente(companyId: string): CanalConversa {
  return companyId === CASA_ID ? 'eva_oficial' : 'qr_code';
}
const CASA_ID = '00000000-0000-0000-0000-000000000001';

/** Chat completo do lead: memória da Eva + painel (só o que o viewer pode ver). */
export async function historicoDoLead(db: SupabaseClient, leadId: string, companyId: string, viewerId: string | null, servico?: SupabaseClient): Promise<MensagemChat[]> {
  const [conversa, painel] = await Promise.all([
    mensagensDoLead(db, leadId, companyId),
    mensagensDoPainel(db, companyId, leadId, viewerId, 500, servico),
  ]);
  return juntarComPainel(conversa, painel, canalDaAssistente(companyId));
}
