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

export interface MensagemChat {
  role: 'user' | 'assistant' | string;
  content: string;
  timestamp: string | null;
}

/** Canal da conversa quando o dado existir (Parte 2 traz o 2º número). */
export type CanalConversa = 'eva_oficial' | 'whatsapp_business' | 'qr_code';

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
    out.push({
      role: typeof o.role === 'string' ? o.role : 'user',
      content,
      timestamp: typeof o.timestamp === 'string' ? o.timestamp : null,
    });
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
): ListaConversas {
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
      ultimaTexto: u.texto, ultimaDe: u.de, aguardandoResposta: u.de === 'cliente',
      canal: canalDaLinha(c),
    });
  }
  todas.sort((a, b) => String(b.ultimaEm ?? '').localeCompare(String(a.ultimaEm ?? '')));

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
const LOTE_IDS = 100;

/**
 * Lista de conversas da EMPRESA da sessão. Sem sessão com empresa → lista vazia
 * (falha fechada: nunca "todas as empresas").
 */
export async function listarConversas(db: SupabaseClient, viewer: DashUser, filtros: FiltrosConversa): Promise<ListaConversas> {
  const vazio: ListaConversas = { itens: [], contagem: { todas: 0, aguardando: 0, meus: 0, porEtapa: {} } };
  const companyId = viewer?.companyId;
  if (!companyId) return vazio;

  const { data: convs, error } = await db
    .from('conversations')
    .select('lead_id, messages, last_message_at, created_at')
    .eq('company_id', companyId)
    .not('lead_id', 'is', null)
    .order('last_message_at', { ascending: false })
    .limit(LIMITE_CONVERSAS);
  if (error) throw new Error(`Falha ao listar conversas: ${error.message}`);
  const linhas = (convs ?? []) as Array<Record<string, unknown>>;
  const ids = [...new Set(linhas.map((c) => String(c.lead_id ?? '')).filter(Boolean))];
  if (ids.length === 0) return vazio;

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
  return montarLista(linhas, leads, filtros, viewer.id);
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
