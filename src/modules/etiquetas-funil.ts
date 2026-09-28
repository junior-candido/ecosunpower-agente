// src/modules/etiquetas-funil.ts
//
// W4 — ETIQUETAS do WhatsApp Business (número PESSOAL do dono, Evolution)
// sincronizadas com a ETAPA do funil do lead (28/09/2026). Migration 144.
//
//  - painel → celular: a etapa mudou no painel → a conversa do lead ganha a
//    etiqueta mapeada (e perde as outras etiquetas mapeadas);
//  - celular → painel: o dono pôs uma etiqueta mapeada na conversa → o lead vai
//    para a etapa dela (tirar etiqueta não mexe em nada);
//  - SÓ para quem já é lead e já conversou no número pessoal do dono;
//  - o eco (a etiqueta que o próprio painel pôs voltando pelo webhook) não faz
//    nada: a etapa já é aquela.
//
// Funções puras + orquestração com dependências injetadas (Evolution/banco).
// Nada aqui dispara mensagem.

import type { SupabaseClient } from '@supabase/supabase-js';
import { variantesTelefone } from './phone.js';

/** Etapas que podem ter etiqueta (as do funil + perdido), com o nome da tela. */
export const ETAPAS_ETIQUETA: Array<{ id: string; rotulo: string }> = [
  { id: 'novo', rotulo: 'Novo' },
  { id: 'qualificando', rotulo: 'Qualificando' },
  { id: 'qualificado', rotulo: 'Qualificado' },
  { id: 'proposta_enviada', rotulo: 'Proposta enviada' },
  { id: 'negociacao', rotulo: 'Negociação' },
  { id: 'agendado', rotulo: 'Visita agendada' },
  { id: 'transferido', rotulo: 'Transferido' },
  { id: 'ganho', rotulo: 'Ganho (fechou)' },
  { id: 'perdido', rotulo: 'Perdido' },
];
const ETAPAS_OK = new Set(ETAPAS_ETIQUETA.map((e) => e.id));
const LABEL_OK = /^[A-Za-z0-9_.:-]{1,64}$/;

export interface EtiquetaWhatsapp { id: string; nome: string; cor: string | null }
export interface MapeamentoEtiqueta { etapa: string; label_id: string; label_nome: string | null }
export interface NumeroComEtiquetas { id: string; company_id: string; dono_user_id: string; instancia: string; ativo: boolean }

/** Resposta do findLabels da Evolution (lista ou { labels }) → etiquetas. PURA. */
export function lerEtiquetasEvolution(json: unknown): EtiquetaWhatsapp[] {
  const lista = Array.isArray(json) ? json : Array.isArray((json as { labels?: unknown })?.labels) ? (json as { labels: unknown[] }).labels : [];
  const out: EtiquetaWhatsapp[] = [];
  for (const l of lista as Array<Record<string, unknown>>) {
    const id = String(l?.id ?? l?.labelId ?? '');
    if (!LABEL_OK.test(id) || l?.deleted === true) continue;
    out.push({ id, nome: String(l?.name ?? l?.nome ?? `Etiqueta ${id}`).slice(0, 60), cor: l?.color !== undefined ? String(l.color) : null });
  }
  return out;
}

/**
 * labels.association da Evolution → { labelId, telefone, tipo }. Aceita os
 * dois formatos ({ association: {chatId,labelId}, type } e { chatId, labelId, type }).
 * Grupo fica de fora. PURA.
 */
export function lerAssociacaoEtiqueta(body: Record<string, unknown> | null | undefined): { labelId: string; jid: string; tipo: 'add' | 'remove' } | null {
  const ev = String(body?.event ?? '').toLowerCase().replace('_', '.');
  if (ev !== 'labels.association') return null;
  const d = (body?.data ?? {}) as Record<string, unknown>;
  const a = (d.association ?? d) as Record<string, unknown>;
  const labelId = String(a.labelId ?? '');
  const jid = String(a.chatId ?? a.remoteJid ?? '');
  const tipo = String(d.type ?? a.type ?? '').toLowerCase();
  if (!LABEL_OK.test(labelId) || !jid || jid.endsWith('@g.us') || (tipo !== 'add' && tipo !== 'remove')) return null;
  return { labelId, jid, tipo };
}

/** Pares do formulário (etapa_<id> = labelId | '') → mapeamento válido. Etiqueta repetida: vale a 1ª etapa. PURA. */
export function mapeamentoDoFormulario(body: Record<string, unknown>, etiquetas: EtiquetaWhatsapp[]): MapeamentoEtiqueta[] {
  const porId = new Map(etiquetas.map((e) => [e.id, e]));
  const usadas = new Set<string>();
  const out: MapeamentoEtiqueta[] = [];
  for (const e of ETAPAS_ETIQUETA) {
    const v = String(body?.[`etapa_${e.id}`] ?? '').trim();
    const et = v ? porId.get(v) : undefined;
    if (!et || usadas.has(et.id)) continue;
    usadas.add(et.id);
    out.push({ etapa: e.id, label_id: et.id, label_nome: et.nome });
  }
  return out;
}

export async function lerMapeamento(servico: SupabaseClient, np: Pick<NumeroComEtiquetas, 'id' | 'company_id'>): Promise<MapeamentoEtiqueta[]> {
  try {
    const { data, error } = await servico.from('whatsapp_etiquetas_funil').select('etapa, label_id, label_nome')
      .eq('company_id', np.company_id).eq('numero_pessoal_id', np.id);
    if (error || !Array.isArray(data)) return [];
    return (data as MapeamentoEtiqueta[]).filter((m) => ETAPAS_OK.has(m.etapa) && LABEL_OK.test(m.label_id));
  } catch {
    return [];
  }
}

/** Troca o mapeamento inteiro do número (apaga e grava). false = banco recusou (ex.: sem a 144). */
export async function salvarMapeamento(servico: SupabaseClient, np: Pick<NumeroComEtiquetas, 'id' | 'company_id'>, pares: MapeamentoEtiqueta[]): Promise<boolean> {
  try {
    const { error: e1 } = await servico.from('whatsapp_etiquetas_funil').delete().eq('company_id', np.company_id).eq('numero_pessoal_id', np.id);
    if (e1) return false;
    if (pares.length === 0) return true;
    const { error: e2 } = await servico.from('whatsapp_etiquetas_funil').insert(pares.map((p) => ({
      company_id: np.company_id, numero_pessoal_id: np.id, etapa: p.etapa, label_id: p.label_id, label_nome: p.label_nome,
    })));
    return !e2;
  } catch {
    return false;
  }
}

/** O lead já conversou no número pessoal deste dono? (sem conversa lá, a etiqueta não tem onde ficar). */
async function conversouNoPessoal(servico: SupabaseClient, np: NumeroComEtiquetas, leadId: string): Promise<boolean> {
  const { data } = await servico.from('mensagens_whatsapp').select('id')
    .eq('company_id', np.company_id).eq('visivel_so_para', np.dono_user_id).eq('lead_id', leadId).limit(1);
  return Array.isArray(data) && data.length > 0;
}

export interface ApiEtiquetas {
  /** handleLabel da Evolution (pela instância do dono). */
  aplicar(instancia: string, companyId: string, telefone: string, labelId: string, acao: 'add' | 'remove'): Promise<unknown>;
}

/**
 * PAINEL → CELULAR. A etapa do lead mudou no painel: em cada número pessoal
 * ativo da empresa com mapeamento e conversa com o lead, põe a etiqueta da
 * etapa nova e tira as outras mapeadas. Nunca lança; devolve quantas trocas.
 */
export async function etapaParaEtiqueta(
  servico: SupabaseClient,
  p: { companyId: string; leadId: string; telefone: string; etapa: string },
  api: ApiEtiquetas,
): Promise<number> {
  if (!ETAPAS_OK.has(p.etapa) || !p.telefone) return 0;
  let trocas = 0;
  try {
    const { data } = await servico.from('whatsapp_numeros_pessoais').select('id, company_id, dono_user_id, instancia, ativo')
      .eq('company_id', p.companyId).eq('ativo', true);
    for (const np of (data ?? []) as NumeroComEtiquetas[]) {
      const mapa = await lerMapeamento(servico, np);
      if (mapa.length === 0 || !(await conversouNoPessoal(servico, np, p.leadId))) continue;
      const alvo = mapa.find((m) => m.etapa === p.etapa);
      for (const m of mapa) {
        if (alvo && m.label_id === alvo.label_id) continue;
        await api.aplicar(np.instancia, np.company_id, p.telefone, m.label_id, 'remove').catch(() => undefined);
      }
      if (alvo) {
        await api.aplicar(np.instancia, np.company_id, p.telefone, alvo.label_id, 'add');
        trocas++;
      }
    }
  } catch (e) {
    console.warn(`[etiquetas] painel → celular falhou: ${(e as Error).message}`);
  }
  return trocas;
}

export interface DepsEtapa {
  /** Muda a etapa do lead (o index cuida de "perdido" / reabrir, linha do tempo e auditoria). */
  mudarEtapa(leadId: string, etapaAtual: string, etapaNova: string): Promise<void>;
}

/**
 * CELULAR → PAINEL. O dono pôs uma etiqueta mapeada na conversa: o LEAD desse
 * telefone (da empresa) vai para a etapa. Etiqueta não mapeada, tirar etiqueta,
 * quem não é lead ou etapa igual (eco do próprio painel) → nada.
 */
export async function etiquetaParaEtapa(
  servico: SupabaseClient,
  np: NumeroComEtiquetas,
  a: { labelId: string; telefone: string; tipo: 'add' | 'remove' },
  deps: DepsEtapa,
): Promise<'mudou' | 'igual' | 'ignorada'> {
  if (a.tipo !== 'add' || !np.ativo) return 'ignorada';
  const mapa = await lerMapeamento(servico, np);
  const m = mapa.find((x) => x.label_id === a.labelId);
  if (!m) return 'ignorada';
  const variantes = variantesTelefone(a.telefone);
  if (variantes.length === 0) return 'ignorada';
  const base = servico.from('leads').select('id, status, company_id').in('phone', variantes);
  const q = np.company_id === '00000000-0000-0000-0000-000000000001'
    ? base.or(`company_id.eq.${np.company_id},company_id.is.null`) : base.eq('company_id', np.company_id);
  const { data } = await q.order('created_at', { ascending: true }).limit(1);
  const lead = (data as Array<{ id: string; status: string }> | null)?.[0];
  if (!lead) return 'ignorada';
  if (lead.status === m.etapa) return 'igual';
  await deps.mudarEtapa(lead.id, lead.status, m.etapa);
  return 'mudou';
}
